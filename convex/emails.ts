import { ConvexError, v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal, api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin, requireStaff } from "./lib/auth";
import { logActivity } from "./lib/activity";
import { validators } from "./schema";
import { getEmailConfig } from "./emails/config";
import { scheduleEmail } from "./emails/enqueue";
import { sendEmail } from "./emails/transport";
import {
  devPreviews,
  emailConfigPayload,
  listEmails,
  listSuppressed,
  previewLog,
  readLog,
  renderContext,
  type RenderedPreview,
} from "./emails/queries";
import { renderTemplate, isTemplateName } from "./emails/templates";
import { sampleDataFor } from "./emails/sample";
import { applyEmailEvent, alreadySeen, rememberEvent } from "./emails/webhook";

/**
 * Convex entry points for the email system. Business logic lives in
 * `convex/emails/*`; this module only wires it to queries, mutations and
 * actions so every reference resolves as `internal.emails.<name>`.
 */

/* ------------------------------------------------------------------ reads */

/** Admin gate usable from an action (`ctx.runQuery`), where `ctx.db` is absent. */
export const adminGate = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return true;
  },
});

/** Staff gate used by the "customer email bounced" dismissal. */
export const staffGate = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return true;
  },
});

export const config = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await emailConfigPayload(ctx);
  },
});

export const list = query({
  args: {
    status: v.optional(v.string()),
    template: v.optional(v.string()),
    q: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await listEmails(ctx, args);
  },
});

export const suppressed = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await listSuppressed(ctx);
  },
});

export const preview = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await previewLog(ctx, args.id);
  },
});

/**
 * Renders every template from sample data for `/dev/email-preview`.
 * Answers only when SITE_URL points at localhost or a dev deployment.
 */
export const previewDev = query({
  args: {},
  handler: async (ctx) => await devPreviews(ctx),
});

/* ------------------------------------------------------- internal plumbing */

export const getLog = internalQuery({
  args: { logId: v.id("emailLogs") },
  handler: async (ctx, args) => await readLog(ctx, args.logId),
});

export const emailContext = internalQuery({
  args: {},
  handler: async (ctx) => await renderContext(ctx),
});

/**
 * Password reset mail, called from the Convex Auth provider
 * (`convex/auth.ts`). Rate-limited to 5 per recipient per hour inside
 * `scheduleEmail`, and never throws: a failed enqueue surfaces as a Convex
 * error message on the reset form rather than an unhandled action crash.
 */
export const enqueueAuth = internalMutation({
  args: {
    template: v.string(),
    to: v.string(),
    url: v.string(),
    token: v.optional(v.string()),
    expires: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!isTemplateName(args.template)) {
      throw new ConvexError({ message: "That email is not available." });
    }
    const config = getEmailConfig();
    // Local development only, and only behind EMAIL_DRY_RUN_LOG_CODES (the
    // startup assertion in `emails/config.ts` refuses it anywhere else).
    if (config.logCodes && config.mode !== "live" && args.token !== undefined) {
      console.log("[emails] dry-run auth code", {
        to: args.to,
        code: args.token,
        url: args.url,
      });
    }
    const result = await scheduleEmail(ctx, {
      template: args.template,
      to: args.to,
      data: { url: args.url, expires: args.expires ?? "60 minutes" },
      dryRunCode: args.token,
      category: "auth",
    });
    if (result.logId === null && result.skipped !== undefined) {
      throw new ConvexError({ message: authSkipMessage(result.skipped) });
    }
    return { ok: true };
  },
});

/** Turns an internal skip reason into copy a shopper can act on. */
function authSkipMessage(reason: string): string {
  if (reason === "rate_limited") {
    return "Too many reset requests for this address. Wait an hour and try again.";
  }
  if (reason === "suppressed") {
    return "This address cannot receive email from the shop. Contact us to sort it out.";
  }
  if (reason === "invalid_recipient") {
    return "Enter a valid email address.";
  }
  return "The reset email could not be queued. Try again later.";
}

export const applyWebhookEvent = internalMutation({
  args: {
    svix_id: v.string(),
    event_type: v.string(),
    email_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (await alreadySeen(ctx, args.svix_id)) return { ok: true, duplicate: true };
    const event = {
      type: args.event_type,
      data: args.email_id === undefined ? undefined : { email_id: args.email_id },
    };
    const result = await applyEmailEvent(ctx, event, args.svix_id);
    await rememberEvent(ctx, args.svix_id, args.event_type, args.email_id ?? "");
    return { ok: true, ...result };
  },
});

/** Single writer for the tail of a delivery, so retries cannot race. */
export const updateLog = internalMutation({
  args: {
    logId: v.id("emailLogs"),
    status: validators.emailStatus,
    attempt: v.number(),
    subject: v.optional(v.string()),
    html: v.optional(v.string()),
    text: v.optional(v.string()),
    error: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.logId);
    if (row === null) return { ok: false };

    await ctx.db.patch(args.logId, {
      status: args.status,
      attempt: args.attempt,
      ...(args.subject !== undefined ? { subject: args.subject } : {}),
      ...(args.html !== undefined ? { html: args.html } : {}),
      ...(args.text !== undefined ? { text: args.text } : {}),
      ...(args.error !== undefined ? { error: args.error } : {}),
      ...(args.providerMessageId !== undefined
        ? { provider_message_id: args.providerMessageId }
        : {}),
      ...(args.status === "sent" || args.status === "delivered" ? { sent_at: Date.now() } : {}),
    });

    // A message that reaches the customer clears the bounce flag.
    if (
      (args.status === "sent" || args.status === "delivered") &&
      row.category === "customer" &&
      row.order_id !== null
    ) {
      const order = await ctx.db.get(row.order_id);
      if (order !== null && order.needs_attention !== undefined) {
        await ctx.db.patch(order._id, { needs_attention: undefined });
      }
    }
    return { ok: true };
  },
});

/* ------------------------------------------------------------------ sends */

/**
 * The scheduled worker. Never throws: every failure lands on the `emailLogs`
 * row so `/admin/emails` can explain it. A retryable transport failure is
 * rescheduled through the scheduler instead of sleeping in place.
 */
export const send = internalAction({
  args: {
    logId: v.id("emailLogs"),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const attempt = Math.max(1, args.attempt ?? 1);
    try {
      const row = await ctx.runQuery(internal.emails.getLog, { logId: args.logId });
      if (row === null) return { ok: false, reason: "missing" };
      if (row.status !== "queued") return { ok: false, reason: "not_queued" };
      if (!isTemplateName(row.template)) {
        await ctx.runMutation(internal.emails.updateLog, {
          logId: args.logId,
          status: "failed",
          attempt,
          error: "Unknown email template.",
        });
        return { ok: false, reason: "unknown_template" };
      }

      const emailCtx = await ctx.runQuery(internal.emails.emailContext, {});
      const rendered = renderTemplate(row.template, row.data, emailCtx);
      const config = getEmailConfig();

      if (config.mode !== "live") {
        // Dry-run: render, store the body for the admin preview, never fetch.
        await ctx.runMutation(internal.emails.updateLog, {
          logId: args.logId,
          status: "skipped_dry_run",
          attempt,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });
        return { ok: true, skipped: true, mode: "dry-run" };
      }

      const result = await sendEmail(
        {
          to: row.to,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          replyTo: row.reply_to,
          tags: row.tags,
          idempotencyKey: row._id,
          attempt,
        },
        { config },
      );

      if (result.ok) {
        await ctx.runMutation(internal.emails.updateLog, {
          logId: args.logId,
          status: "sent",
          attempt,
          subject: rendered.subject,
          ...(result.providerMessageId !== undefined
            ? { providerMessageId: result.providerMessageId }
            : {}),
        });
        return { ok: true, mode: "live" };
      }

      if (result.retryInMs !== undefined && attempt < 2) {
        await ctx.scheduler.runAfter(result.retryInMs, internal.emails.send, {
          logId: args.logId,
          attempt: attempt + 1,
        });
        await ctx.runMutation(internal.emails.updateLog, {
          logId: args.logId,
          status: "queued",
          attempt,
          subject: rendered.subject,
        });
        return { ok: false, retryScheduled: true };
      }

      await ctx.runMutation(internal.emails.updateLog, {
        logId: args.logId,
        status: "failed",
        attempt,
        subject: rendered.subject,
        error: result.error ?? "Email could not be sent.",
      });
      return { ok: false, reason: "send_failed" };
    } catch (error) {
      // Last line of defence: record the failure instead of failing the action.
      const message =
        error instanceof Error && error.message ? error.message.slice(0, 300) : "Unexpected error.";
      try {
        await ctx.runMutation(internal.emails.updateLog, {
          logId: args.logId,
          status: "failed",
          attempt,
          error: message,
        });
      } catch {
        // The row may be gone; there is nothing left to record.
      }
      return { ok: false, reason: "error" };
    }
  },
});

/* ------------------------------------------------------------ admin tools */

const sampleOrder = (fulfillment: "delivery" | "pickup") => ({
  reference: "MB-TEST0001",
  fulfillment,
  zone: "central",
  items: [{ name: "Sample item for previewing", quantity: 1, price: 100 }],
  subtotal: 100,
  delivery_fee: fulfillment === "pickup" ? 0 : 30,
  total: fulfillment === "pickup" ? 100 : 130,
  payment_method: "momo",
  provider: "MTN MoMo",
  transaction_reference: "TEST-REF-001",
  address:
    fulfillment === "pickup"
      ? "Abelenkpe taxi rank, Accra, Ghana"
      : "12 Abelenkpe Taxi Rank Road, Accra",
  status: fulfillment === "pickup" ? "ready" : "dispatched",
  note: "",
});

/** Builds a queued row for a manual test send without scheduling it. */
export const enqueueTest = internalMutation({
  args: { template: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    if (!isTemplateName(args.template)) {
      throw new ConvexError({ message: "Unknown email template." });
    }
    await requireAdmin(ctx);
    const emailCtx = await renderContext(ctx);
    const data =
      args.template === "admin-new-order" || args.template === "admin-payment-confirmed"
        ? { ...sampleOrder("delivery"), customer: { name: "Sample customer" } }
        : sampleDataFor(args.template, emailCtx);

    const result = await scheduleEmail(ctx, {
      template: args.template,
      to: args.to,
      data,
      dedupe: false,
      schedule: false,
    });
    if (result.logId === null) {
      throw new ConvexError({ message: `Test email skipped: ${result.skipped ?? "unknown"}.` });
    }
    return { logId: result.logId };
  },
});

/** Admin "send test" button: queue, send through the real path, then preview. */
type SendTestResult = {
  ok: boolean;
  status: string;
  logId: string;
  rendered: RenderedPreview;
};

export const sendTest = action({
  args: { template: v.string(), to: v.optional(v.string()) },
  handler: async (ctx, args): Promise<SendTestResult> => {
    await ctx.runQuery(internal.emails.adminGate, {});
    const to = (args.to ?? "").trim();
    if (to === "") throw new ConvexError({ message: "Enter a test recipient." });

    // Explicit annotations keep this handler out of the `internal` <-> module
    // type cycle: every reference below would otherwise infer through the very
    // object it belongs to.
    const queued = (await ctx.runMutation(internal.emails.enqueueTest, {
      template: args.template,
      to,
    })) as { logId: Id<"emailLogs"> };
    const logId = queued.logId;
    const outcome = (await ctx.runAction(internal.emails.send, { logId })) as { ok: boolean };
    // `preview` is a public query (the admin page calls it), so it lives on
    // `api` rather than `internal`.
    const rendered = (await ctx.runQuery(api.emails.preview, {
      id: logId,
    })) as RenderedPreview;
    const row = (await ctx.runQuery(internal.emails.getLog, { logId })) as Doc<"emailLogs"> | null;
    return {
      ok: outcome.ok,
      status: row?.status ?? "unknown",
      logId,
      rendered,
    };
  },
});

export const addSuppression = mutation({
  args: { email: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actorId = await requireAdmin(ctx);
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@,;<>"]+@[^\s@,;<>".]+\.[^\s@,;<>"]{2,}$/.test(email)) {
      throw new ConvexError({ message: "Enter a valid email address." });
    }
    const existing = await ctx.db
      .query("suppressedEmails")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existing !== null)
      throw new ConvexError({ message: "That address is already suppressed." });

    await ctx.db.insert("suppressedEmails", {
      email,
      reason: (args.reason ?? "").trim() === "" ? "Added by an admin." : args.reason!.trim(),
      source: "admin",
      actor_id: actorId,
    });
    await logActivity(ctx, actorId, "email.suppress", `Suppressed ${email} from email delivery.`);
    return { ok: true };
  },
});

export const removeSuppression = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const actorId = await requireAdmin(ctx);
    const rowId = ctx.db.normalizeId("suppressedEmails", args.id);
    if (rowId === null) throw new ConvexError({ message: "Suppression not found." });
    const row = await ctx.db.get(rowId);
    if (row === null) throw new ConvexError({ message: "Suppression not found." });
    await ctx.db.delete(rowId);
    await logActivity(ctx, actorId, "email.unsuppress", `Allowed email delivery to ${row.email}.`);
    return { ok: true };
  },
});

/** Clears the "Customer email bounced" flag an admin has dealt with. */
export const clearAttention = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const actorId = await requireStaff(ctx);
    const orderId = ctx.db.normalizeId("orders", args.id);
    if (orderId === null) throw new ConvexError({ message: "Order not found." });
    const order = await ctx.db.get(orderId);
    if (order === null) throw new ConvexError({ message: "Order not found." });
    if (order.needs_attention === undefined) return { ok: true };
    await ctx.db.patch(orderId, { needs_attention: undefined });
    await ctx.db.insert("order_history", {
      order_id: orderId,
      status: order.status,
      note: "Email alert dismissed.",
      actor_id: actorId,
    });
    return { ok: true };
  },
});

/* --------------------------------------------------------------- housekeeping */

/** Cron: dry-run rows are kept 14 days, live rows 90 days. */
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    let removed = 0;

    // Walk oldest-first (the default order) and stop as soon as a row is
    // younger than the shortest retention window: nothing after that point can
    // be expired in either mode, so this never scans the whole table.
    // `_creationTime` cannot be indexed, which is why this is a plain walk.
    let cursor = await ctx.db.query("emailLogs").order("asc").take(200);
    for (;;) {
      let stop = false;
      for (const row of cursor) {
        const age = now - row._creationTime;
        if (age < 14 * DAY) {
          stop = true;
          break;
        }
        const expired = row.mode === "dry-run" ? age > 14 * DAY : age > 90 * DAY;
        if (expired) {
          await ctx.db.delete(row._id);
          removed += 1;
        }
        if (removed >= 1000) {
          stop = true;
          break;
        }
      }
      if (stop || cursor.length < 200) break;
      const last = cursor[cursor.length - 1];
      if (last === undefined) break;
      cursor = await ctx.db
        .query("emailLogs")
        .order("asc")
        .filter((q) => q.gt(q.field("_creationTime"), last._creationTime))
        .take(200);
    }

    // Webhook receipts age out with the live rows they describe.
    const events = await ctx.db.query("webhook_events").order("asc").take(500);
    for (const event of events) {
      if (now - event._creationTime > 90 * DAY) {
        await ctx.db.delete(event._id);
        removed += 1;
      }
    }
    return { removed };
  },
});
