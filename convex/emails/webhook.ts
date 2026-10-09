import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Resend (Svix) webhook handling.
 *
 * Verification follows the Svix scheme exactly: sign `${id}.${timestamp}.${raw}`
 * with HMAC-SHA256 using the base64-decoded secret (a `whsec_` prefix is
 * stripped) and compare in constant time. Signatures older than five minutes
 * are rejected so a captured delivery cannot be replayed later.
 */

const TIMESTAMP_TOLERANCE_S = 300;

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const encoder = new TextEncoder();

export function decodeSecret(secret: string): Uint8Array | null {
  const trimmed = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  if (trimmed === "") return null;
  try {
    return base64ToBytes(trimmed);
  } catch {
    return null;
  }
}

export type SignatureCheck = {
  secret: string;
  id: string;
  timestamp: string;
  signatureHeader: string;
  rawBody: string;
  now?: number;
};

/**
 * True when at least one entry in the `svix-signature` header matches.
 * `crypto.subtle.verify` compares the MAC in constant time for us.
 */
export async function verifySvixSignature(check: SignatureCheck): Promise<boolean> {
  const keyBytes = decodeSecret(check.secret);
  if (keyBytes === null) return false;

  const timestamp = Number.parseInt(check.timestamp, 10);
  if (!Number.isFinite(timestamp)) return false;
  const nowSeconds = Math.floor((check.now ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestamp) > TIMESTAMP_TOLERANCE_S) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const data = encoder.encode(`${check.id}.${check.timestamp}.${check.rawBody}`);

  for (const entry of check.signatureHeader.split(/\s+/)) {
    if (entry === "") continue;
    const candidate = entry.includes(",") ? entry.slice(entry.indexOf(",") + 1) : entry;
    if (candidate === "") continue;
    try {
      const bytes = base64ToBytes(candidate);
      const valid = await crypto.subtle.verify(
        "HMAC",
        key,
        bytes as BufferSource,
        data as BufferSource,
      );
      if (valid) return true;
    } catch {
      // A malformed entry simply does not match.
    }
  }
  return false;
}

export type ResendEvent = {
  type: string;
  data?: { email_id?: unknown } | undefined;
};

/** Parses the webhook body without trusting its shape. */
export function parseEvent(rawBody: string): ResendEvent | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed === null || typeof parsed !== "object") return null;
    const type = (parsed as { type?: unknown }).type;
    if (typeof type !== "string") return null;
    const data = (parsed as { data?: unknown }).data;
    return {
      type,
      data: data && typeof data === "object" ? (data as ResendEvent["data"]) : undefined,
    };
  } catch {
    return null;
  }
}

const STATUS_BY_EVENT: Record<string, "delivered" | "bounced" | "complained" | "sent"> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

export type ApplyResult = {
  applied: boolean;
  reason?: string;
  logId?: string;
};

/**
 * Applies one event: updates the matching `emailLogs` row and, for a bounce or
 * complaint, flags the order so staff see "Customer email bounced".
 */
export async function applyEmailEvent(
  ctx: MutationCtx,
  event: ResendEvent,
  svixId: string,
): Promise<ApplyResult> {
  const status = STATUS_BY_EVENT[event.type];
  const emailId = event.data && typeof event.data.email_id === "string" ? event.data.email_id : "";
  if (status === undefined) return { applied: false, reason: "ignored_event" };
  if (emailId === "") return { applied: false, reason: "missing_email_id" };

  const log = await ctx.db
    .query("emailLogs")
    .withIndex("by_provider_id", (q) => q.eq("provider_message_id", emailId))
    .first();
  if (log === null) return { applied: false, reason: "unknown_message" };

  await ctx.db.patch(log._id, { status });

  if (status === "complained") {
    await suppressOnce(ctx, log.to, "Recipient reported the message as spam.", "webhook");
  }

  if ((status === "bounced" || status === "complained") && log.order_id !== null) {
    const order = await ctx.db.get(log.order_id);
    if (order !== null) {
      const message = status === "bounced" ? "Customer email bounced" : "Customer email complained";
      await ctx.db.patch(order._id, { needs_attention: message });
      await ctx.db.insert("order_history", {
        order_id: order._id,
        status: order.status,
        note: `${message} (${log.to}).`,
      });
    }
  }

  return { applied: true, logId: log._id };
}

/** Idempotency: the same Svix delivery id is only ever applied once. */
export async function alreadySeen(ctx: QueryCtx, svixId: string): Promise<boolean> {
  const row = await ctx.db
    .query("webhook_events")
    .withIndex("by_svix_id", (q) => q.eq("svix_id", svixId))
    .first();
  return row !== null;
}

export async function rememberEvent(
  ctx: MutationCtx,
  svixId: string,
  eventType: string,
  emailId: string,
): Promise<void> {
  await ctx.db.insert("webhook_events", {
    svix_id: svixId,
    event_type: eventType,
    ...(emailId === "" ? {} : { provider_message_id: emailId }),
  });
}

async function suppressOnce(
  ctx: MutationCtx,
  email: string,
  reason: string,
  source: string,
): Promise<void> {
  const existing = await ctx.db
    .query("suppressedEmails")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  if (existing !== null) return;
  await ctx.db.insert("suppressedEmails", { email, reason, source });
}
