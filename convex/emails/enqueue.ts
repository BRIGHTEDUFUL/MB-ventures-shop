import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { getSettings } from "../lib/settings";
import { validators } from "../schema";
import { getEmailConfig, type EmailConfig } from "./config";
import { QUOTA_STATUSES, todayStatusCounts } from "./queries";
import { isValidRecipient } from "./transport";
import { isTemplateName, templateGroup, TEMPLATE_NAMES, type TemplateName } from "./templates";

/**
 * Everything that decides *whether* an email goes out lives here, so callers
 * (order mutations, the auth provider, the contact form) stay one line long.
 *
 * `scheduleEmail` never throws: an email problem must never roll back an order,
 * a payment confirmation or a password reset. Failures come back as
 * `{ logId: null, skipped: reason }` and, where it helps an admin, as a
 * `failed` row in `emailLogs`.
 */

export type EmailCategory = "customer" | "admin" | "auth" | "contact";

export type EnqueueInput = {
  template: TemplateName;
  to: string;
  data: Record<string, unknown>;
  orderId?: Id<"orders"> | null | undefined;
  /** Overrides the group derived from the template (contact mail is "contact"). */
  category?: EmailCategory | undefined;
  replyTo?: string | undefined;
  tags?: string[] | undefined;
  /** One-time code for auth mail, kept only when EMAIL_DRY_RUN_LOG_CODES is on. */
  dryRunCode?: string | undefined;
  /** Set false for one-off messages that must never be deduped (test sends). */
  dedupe?: boolean | undefined;
  /**
   * Overrides the computed dedupe key. Needed when two different recipients
   * are contacted about the same logical event (the contact form's admin copy
   * must dedupe per sender, not per shop inbox).
   */
  dedupeKey?: string | undefined;
  /**
   * Defaults to true: real traffic is always handed to the scheduler. The
   * admin "send test" button sets false because it runs `internal.emails.send`
   * itself and would otherwise deliver the same message twice.
   */
  schedule?: boolean | undefined;
};

export type EnqueueResult = {
  logId: Id<"emailLogs"> | null;
  skipped?: string;
};

const DEDUPE_WINDOW_MS = 60_000;
const AUTH_RATE_LIMIT = 5;
const AUTH_RATE_WINDOW_MS = 60 * 60 * 1000;

const AUTH_TEMPLATES = TEMPLATE_NAMES.filter((name) => templateGroup(name) === "auth");

/** Deep-copies to JSON-safe values; `undefined` is not a Convex `Value`. */
export function toConvexValue(value: unknown, depth = 0): unknown {
  if (depth > 12) return "";
  if (value === null || typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => toConvexValue(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue;
      out[key] = toConvexValue(item, depth + 1);
    }
    return out;
  }
  return String(value);
}

const startOfUtcDay = (): number => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

async function countQuotaToday(ctx: QueryCtx, now: number): Promise<number> {
  const counts = await todayStatusCounts(ctx, Math.min(startOfUtcDay(), now));
  return QUOTA_STATUSES.reduce((total, status) => total + (counts[status] ?? 0), 0);
}

/**
 * Auth mail is limited to 5 per recipient per hour. Each auth template has its
 * own dedupe key (`${template}:${recipient}`), so we read the newest rows for
 * that recipient across every auth template and count the ones inside the
 * rolling window.
 */
async function countRecentAuth(ctx: QueryCtx, recipient: string, since: number): Promise<number> {
  let count = 0;
  for (const template of AUTH_TEMPLATES) {
    const rows = await ctx.db
      .query("emailLogs")
      .withIndex("by_dedupe", (q) => q.eq("dedupe_ref", `${template}:${recipient}`))
      .order("desc")
      .take(20);
    count += rows.filter((row) => row._creationTime >= since && row.status !== "failed").length;
  }
  return count;
}

async function recentDuplicate(
  ctx: QueryCtx,
  dedupeRef: string,
  now: number,
): Promise<Id<"emailLogs"> | null> {
  const rows = await ctx.db
    .query("emailLogs")
    .withIndex("by_dedupe", (q) => q.eq("dedupe_ref", dedupeRef))
    .order("desc")
    .take(5);
  const recent = rows.find(
    (row) => row.status !== "failed" && now - row._creationTime < DEDUPE_WINDOW_MS,
  );
  return recent ? recent._id : null;
}

/** Best-effort address for internal alerts: env first, then store settings. */
export async function adminRecipient(ctx: QueryCtx, config: EmailConfig): Promise<string> {
  if (config.adminAlertEmail !== "") return config.adminAlertEmail;
  try {
    return (await getSettings(ctx)).email;
  } catch {
    return "";
  }
}

async function insertFailed(
  ctx: MutationCtx,
  input: EnqueueInput,
  category: EmailCategory,
  error: string,
  config: EmailConfig,
): Promise<Id<"emailLogs">> {
  return await ctx.db.insert("emailLogs", {
    template: input.template,
    category,
    to: input.to.trim().toLowerCase(),
    subject: `${input.template} (not sent)`,
    status: "failed",
    mode: config.mode,
    order_id: input.orderId ?? null,
    dedupe_ref:
      input.dedupeKey ?? `${input.template}:${input.orderId ?? input.to.trim().toLowerCase()}`,
    data: toConvexValue(input.data) as Record<string, unknown>,
    error,
    attempt: 0,
    ...(config.logCodes && input.dryRunCode !== undefined
      ? { dry_run_code: input.dryRunCode }
      : {}),
  });
}

/**
 * Validates, dedupes, checks suppression and the daily allowance, writes a
 * `queued` row and schedules `internal.emails.send`.
 */
export async function scheduleEmail(ctx: MutationCtx, input: EnqueueInput): Promise<EnqueueResult> {
  try {
    if (!isTemplateName(input.template)) {
      return { logId: null, skipped: "unknown_template" };
    }

    const config = getEmailConfig();
    const category: EmailCategory = input.category ?? templateGroup(input.template);
    const recipient = input.to.trim().toLowerCase();

    if (!isValidRecipient(recipient)) {
      const logId = await insertFailed(
        ctx,
        input,
        category,
        "Recipient address is not valid.",
        config,
      );
      return { logId, skipped: "invalid_recipient" };
    }

    const suppressed = await ctx.db
      .query("suppressedEmails")
      .withIndex("by_email", (q) => q.eq("email", recipient))
      .first();
    if (suppressed !== null) {
      const logId = await insertFailed(ctx, input, category, "Recipient is suppressed.", config);
      return { logId, skipped: "suppressed" };
    }

    const now = Date.now();

    if (category === "auth") {
      const recent = await countRecentAuth(ctx, recipient, now - AUTH_RATE_WINDOW_MS);
      if (recent >= AUTH_RATE_LIMIT) {
        // Deliberately not recorded: the point of the limit is to stop a flood,
        // and writing a row per rejected attempt would create its own flood.
        return { logId: null, skipped: "rate_limited" };
      }
    }

    const dedupeRef = input.dedupeKey ?? `${input.template}:${input.orderId ?? recipient}`;
    if (input.dedupe !== false) {
      const duplicate = await recentDuplicate(ctx, dedupeRef, now);
      if (duplicate !== null) return { logId: duplicate, skipped: "duplicate" };
    }

    const quota = await countQuotaToday(ctx, now);
    if (quota >= config.dailyLimit) {
      const logId = await insertFailed(
        ctx,
        input,
        category,
        `Daily email limit reached (${config.dailyLimit}).`,
        config,
      );
      return { logId, skipped: "daily_limit" };
    }

    const logId = await ctx.db.insert("emailLogs", {
      template: input.template,
      category,
      to: recipient,
      subject: `${input.template} (queued)`,
      status: "queued",
      mode: config.mode,
      order_id: input.orderId ?? null,
      dedupe_ref: dedupeRef,
      data: toConvexValue(input.data) as Record<string, unknown>,
      ...(input.replyTo !== undefined && input.replyTo !== "" ? { reply_to: input.replyTo } : {}),
      ...(input.tags !== undefined && input.tags.length > 0 ? { tags: input.tags } : {}),
      ...(config.logCodes && input.dryRunCode !== undefined
        ? { dry_run_code: input.dryRunCode }
        : {}),
      attempt: 0,
    });

    if (input.schedule !== false) {
      await ctx.scheduler.runAfter(0, internal.emails.send, { logId });
    }
    return { logId };
  } catch (error) {
    // Swallow: the caller's mutation must still commit.
    console.warn("[emails] could not queue message", {
      template: input.template,
      reason: error instanceof ConvexError ? "convex_error" : "unexpected_error",
    });
    return { logId: null, skipped: "error" };
  }
}
