/**
 * Paystack gateway helpers — pure, Convex-free, so every rule that decides
 * whether money actually arrived can be unit-tested without a network.
 *
 * Everything here runs in any JS runtime (Web Crypto only, no `node:crypto`),
 * because the same modules are loaded by Convex actions, HTTP actions and the
 * edge-runtime test suites.
 */

/** The one base URL Paystack's live and test APIs share. */
export const PAYSTACK_BASE = "https://api.paystack.co";

/** Ghana cedis only. A charge in any other currency can never confirm an order. */
export const PAYSTACK_CURRENCY = "GHS";

/** Reads the server-only secret. Empty string means "not configured". */
export function getPaystackSecret(env: Record<string, string | undefined>): string {
  return (env["PAYSTACK_SECRET_KEY"] ?? "").trim();
}

/** Human wording for a Paystack channel, used in history notes and emails. */
export function channelLabel(channel: string): string {
  switch (channel) {
    case "card":
      return "card";
    case "mobile_money":
      return "mobile money";
    case "bank":
      return "bank transfer";
    case "ussd":
      return "USSD";
    case "qr":
      return "QR";
    default:
      return channel === "" ? "gateway" : channel;
  }
}

/**
 * Minutes an unpaid online order holds its stock before `expireStale`
 * cancels it. Blank/garbage falls back to the default; the value is clamped
 * so a typo cannot park orders for a week (or release them instantly).
 */
export function pendingMinutes(env: Record<string, string | undefined>): number {
  const raw = (env["PAYSTACK_PENDING_MINUTES"] ?? "").trim();
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PENDING_MINUTES;
  return Math.min(Math.max(parsed, 5), 24 * 60);
}

export const DEFAULT_PENDING_MINUTES = 60;

/** Cedis → pesewas (Paystack's minor unit), rounded the way money should be. */
export const pesewas = (amount: number): number => Math.round(amount * 100);

/* ── Webhook signature (HMAC-SHA512 of the raw body) ─────────────────────── */

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** Length-safe constant-time string compare (no early return on first byte). */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * True when the `x-paystack-signature` header is the correct HMAC-SHA512 of
 * `rawBody` under our secret. The raw bytes matter: re-serialising the JSON
 * would change the digest, so the HTTP action verifies the body as received.
 */
export async function verifyPaystackSignature(
  rawBody: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (rawBody === "" || signature === "" || secret === "") return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody)));
  return constantTimeEqual(hex(mac), signature.toLowerCase());
}

/* ── Defensive parsing of Paystack responses ─────────────────────────────── */

/** Narrow unknown → Record, so a malformed payload never throws. */
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const num = (value: unknown): number | null =>
  typeof value === "number" && isFinite(value) ? value : null;

export type InitializeResult = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

/** `/transaction/initialize` → the redirect target, or null when unusable. */
export function readInitializeResponse(payload: unknown): InitializeResult | null {
  const root = record(payload);
  if (root === null || root["status"] !== true) return null;
  const data = record(root["data"]);
  if (data === null) return null;
  const authorizationUrl = str(data["authorization_url"]);
  const accessCode = str(data["access_code"]);
  const reference = str(data["reference"]);
  if (authorizationUrl === "" || accessCode === "" || reference === "") return null;
  return { authorizationUrl, accessCode, reference };
}

export type VerifiedCharge = {
  /** `data.status`: success is the only confirmable state. */
  status: string;
  reference: string;
  /** Pesewas, exactly as Paystack reports them back. */
  amount: number;
  currency: string;
  channel: string;
  paidAt: number | null;
  transactionId: number | null;
  authorizationCode: string;
};

/** `/transaction/verify/:reference` → the charge facts, or null when unusable. */
export function readVerifyResponse(payload: unknown): VerifiedCharge | null {
  const root = record(payload);
  // The *top-level* `status` is a boolean ("did the API call work"); the
  // charge's own state lives in `data.status`. Mixing the two up is the
  // classic Paystack integration bug, so they are read separately here.
  if (root === null || root["status"] !== true) return null;
  const data = record(root["data"]);
  if (data === null) return null;
  const amount = num(data["amount"]);
  if (amount === null) return null;
  const paidAt = str(data["paid_at"]);
  return {
    status: str(data["status"]),
    reference: str(data["reference"]),
    amount,
    currency: str(data["currency"]),
    channel: str(data["channel"]),
    paidAt: paidAt === "" ? null : Date.parse(paidAt) || null,
    transactionId: num(data["id"]),
    authorizationCode: str(record(data["authorization"])?.["authorization_code"]),
  };
}

/* ── The money check ─────────────────────────────────────────────────────── */

export type ChargeMismatch = "status" | "reference" | "currency" | "amount" | null;

/**
 * The single gate between "Paystack says success" and "the order is paid":
 * right charge state, right reference, right currency, and an amount that is
 * exactly what we asked for. Anything else is not this order's money.
 */
export function chargeMismatch(
  charge: VerifiedCharge,
  expected: { reference: string; amountPesewas: number },
): ChargeMismatch {
  if (charge.status !== "success") return "status";
  if (charge.reference !== expected.reference) return "reference";
  if (charge.currency !== PAYSTACK_CURRENCY) return "currency";
  if (charge.amount !== expected.amountPesewas) return "amount";
  return null;
}

/** Webhook/verify events we act on; everything else is acknowledged and ignored. */
export type WebhookEvent = {
  event: string;
  data: VerifiedCharge | null;
};

/** Parses a webhook body (after signature verification) into a known event. */
export function readWebhookEvent(payload: unknown): WebhookEvent {
  const root = record(payload);
  if (root === null) return { event: "", data: null };
  const name = str(root["event"]);
  return { event: name, data: readVerifyResponse({ status: true, data: root["data"] }) };
}

/** Where the shopper lands after Paystack, built only from an https origin. */
export function callbackUrlFor(siteUrl: string): string | null {
  const trimmed = siteUrl.trim().replace(/\/+$/, "");
  if (trimmed === "" || !trimmed.startsWith("https://")) return null;
  return `${trimmed}/paystack/return`;
}
