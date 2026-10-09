import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getSettings } from "../lib/settings";
import {
  getEmailConfig,
  emailConfigView,
  isLocalhostOrDevSite,
  type EmailConfigView,
} from "./config";
import { sampleDataFor } from "./sample";
import { renderTemplate, TEMPLATE_NAMES, isTemplateName, type TemplateName } from "./templates";
import type { RenderContext } from "./templates/base";

/** Shop footer + link origin used by every template. */
export async function renderContext(ctx: QueryCtx): Promise<RenderContext> {
  const config = getEmailConfig();
  let shop: RenderContext["shop"] = {
    name: "MB Ventures GH",
    address: "Abelenkpe taxi rank, Accra, Ghana",
    hours: "Monday to Saturday, 8:00 AM to 6:00 PM",
    phone: "+233 24 000 0000",
    email: "orders@mbventuresgh.com",
  };
  try {
    const settings = await getSettings(ctx);
    shop = {
      name: "MB Ventures GH",
      address: settings.address,
      hours: settings.hours,
      phone: settings.phone,
      email: settings.email,
    };
  } catch {
    // Preview and test renders still work before the seed has run.
  }
  return { siteUrl: config.siteUrl, shop };
}

export type EmailLogRow = {
  id: string;
  template: string;
  category: string;
  to: string;
  subject: string;
  status: string;
  mode: string;
  order_id: string | null;
  error: string | null;
  provider_message_id: string | null;
  attempt: number;
  created_at: string;
  sent_at: string | null;
  has_body: boolean;
  dry_run_code: string | null;
};

const logDTO = (row: Doc<"emailLogs">): EmailLogRow => ({
  id: row._id,
  template: row.template,
  category: row.category,
  to: row.to,
  subject: row.subject,
  status: row.status,
  mode: row.mode,
  order_id: row.order_id,
  error: row.error ?? null,
  provider_message_id: row.provider_message_id ?? null,
  attempt: row.attempt,
  created_at: new Date(row._creationTime).toISOString(),
  sent_at: row.sent_at === undefined ? null : new Date(row.sent_at).toISOString(),
  has_body: row.html !== undefined && row.text !== undefined,
  dry_run_code: row.dry_run_code ?? null,
});

export type EmailListFilters = {
  status?: string | undefined;
  template?: string | undefined;
  q?: string | undefined;
  limit?: number | undefined;
};

/** Newest first, filtered server-side, capped at 200 rows. */
export async function listEmails(ctx: QueryCtx, filters: EmailListFilters): Promise<EmailLogRow[]> {
  const rows = await ctx.db.query("emailLogs").order("desc").take(500);
  const search = (filters.q ?? "").trim().toLowerCase();
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);
  return rows
    .filter((row) => {
      if (filters.status !== undefined && filters.status !== "" && row.status !== filters.status) {
        return false;
      }
      if (
        filters.template !== undefined &&
        filters.template !== "" &&
        row.template !== filters.template
      ) {
        return false;
      }
      if (search !== "") {
        const haystack =
          `${row.to} ${row.subject} ${row.template} ${row.error ?? ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    })
    .slice(0, limit)
    .map(logDTO);
}

export type EmailSummary = {
  sentToday: number;
  queued: number;
  failedToday: number;
  dryRunToday: number;
  limit: number;
};

const startOfUtcDay = (): number => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

/** Every status a log row can hold — mirrors `validators.emailStatus`. */
const ALL_STATUSES = [
  "queued",
  "sent",
  "failed",
  "skipped_dry_run",
  "delivered",
  "bounced",
  "complained",
] as const;

export type EmailLogStatus = (typeof ALL_STATUSES)[number];

/** Statuses that consume a slot of the daily allowance. */
export const QUOTA_STATUSES: readonly EmailLogStatus[] = ALL_STATUSES.filter(
  (status) => status !== "failed",
);

/**
 * Today's row counts per status.
 *
 * `_creationTime` cannot be indexed directly (Convex appends it to every index
 * implicitly), so this walks `by_status` newest-first per status and stops as
 * soon as it reaches rows from before midnight UTC — no full table scan.
 */
export async function todayStatusCounts(
  ctx: QueryCtx,
  since = startOfUtcDay(),
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const status of ALL_STATUSES) {
    const rows = await ctx.db
      .query("emailLogs")
      .withIndex("by_status", (q) => q.eq("status", status))
      .order("desc")
      .take(500);
    counts[status] = rows.filter((row) => row._creationTime >= since).length;
  }
  return counts;
}

export async function emailSummary(ctx: QueryCtx, config: EmailConfigView): Promise<EmailSummary> {
  const counts = await todayStatusCounts(ctx);
  const count = (status: string) => counts[status] ?? 0;
  return {
    sentToday: count("sent") + count("delivered") + count("bounced") + count("complained"),
    queued: count("queued"),
    failedToday: count("failed"),
    dryRunToday: count("skipped_dry_run"),
    limit: config.dailyLimit,
  };
}

export type EmailConfigPayload = EmailConfigView & {
  summary: EmailSummary;
  templates: { name: string; group: string }[];
  devPreview: boolean;
};

export async function emailConfigPayload(ctx: QueryCtx): Promise<EmailConfigPayload> {
  const config = emailConfigView(getEmailConfig());
  return {
    ...config,
    summary: await emailSummary(ctx, config),
    templates: TEMPLATE_NAMES.map((name) => ({ name, group: emailGroup(name) })),
    devPreview: isLocalhostOrDevSite(config.siteUrl),
  };
}

export type RenderedPreview = { subject: string; html: string; text: string };

/**
 * Renders a stored message for the preview modal. Bodies are rebuilt from the
 * stored payload, so live rows (which never persist HTML) preview too.
 *
 * Returns `null` instead of throwing when the row is gone — the modal closes
 * over an id that a purge or a filter change can invalidate, and that is not a
 * failure worth surfacing as an error.
 */
export async function previewLog(ctx: QueryCtx, id: string): Promise<RenderedPreview | null> {
  const logId = ctx.db.normalizeId("emailLogs", id);
  if (logId === null) return null;
  const row = await ctx.db.get(logId);
  if (row === null) return null;

  if (isTemplateName(row.template)) {
    try {
      return renderTemplate(row.template, row.data, await renderContext(ctx));
    } catch {
      // Fall through to the stored body when the payload no longer renders.
    }
  }
  return {
    subject: row.subject,
    html: row.html ?? "<p>Preview is not available for this message.</p>",
    text: row.text ?? "Preview is not available for this message.",
  };
}

export type DevPreviewEntry = { name: string; group: string } & RenderedPreview;

/**
 * Every template rendered from sample data. Only answers on a localhost or dev
 * deployment; elsewhere it returns `allowed: false` and no content.
 */
export async function devPreviews(
  ctx: QueryCtx,
): Promise<{ allowed: boolean; items: DevPreviewEntry[] }> {
  const config = getEmailConfig();
  if (!isLocalhostOrDevSite(config.siteUrl)) return { allowed: false, items: [] };
  const ctxRender = await renderContext(ctx);
  const items: DevPreviewEntry[] = [];
  for (const name of TEMPLATE_NAMES) {
    try {
      const rendered = renderTemplate(name, sampleDataFor(name, ctxRender), ctxRender);
      items.push({ name, group: emailGroup(name), ...rendered });
    } catch (error) {
      items.push({
        name,
        group: emailGroup(name),
        subject: `${name} could not render`,
        html: `<p>${String(error instanceof Error ? error.message : error)}</p>`,
        text: String(error instanceof Error ? error.message : error),
      });
    }
  }
  return { allowed: true, items };
}

/** Group filter used by the admin UI (kept in sync with `templates/index.ts`). */
export function emailGroup(name: TemplateName): string {
  return name.startsWith("admin-") ? "admin" : name.startsWith("auth-") ? "auth" : "customer";
}

export type SuppressedRow = {
  id: string;
  email: string;
  reason: string;
  source: string;
  created_at: string;
};

export async function listSuppressed(ctx: QueryCtx): Promise<SuppressedRow[]> {
  const rows = await ctx.db.query("suppressedEmails").order("desc").take(500);
  return rows.map((row) => ({
    id: row._id,
    email: row.email,
    reason: row.reason,
    source: row.source,
    created_at: new Date(row._creationTime).toISOString(),
  }));
}

/** Internal query used by `internal.emails.send`. */
export async function readLog(
  ctx: QueryCtx,
  logId: Id<"emailLogs">,
): Promise<Doc<"emailLogs"> | null> {
  return await ctx.db.get(logId);
}
