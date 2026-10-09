import type { EmailConfig, EmailMode } from "./config";

/**
 * Plain-`fetch` transport for the Web3Forms submission API.
 *
 * Design rules from the spec:
 * - dry-run never touches the network;
 * - one retry after ~2s for network errors, 429 and 5xx, never for 4xx;
 * - `Retry-After` wins over the default delay;
 * - the access key and message bodies are never written to a log.
 *
 * Web3Forms is a form relay: a submission is forwarded to the one inbox bound
 * to the access key, so it cannot pick a recipient itself. The intended
 * address therefore travels inside the payload as `to`, and the body goes out
 * as plain text (`body`) — HTML would arrive as source code in that inbox.
 *
 * The retry needs to *wait*, and Convex actions have no guaranteed timer, so
 * the caller may hand us a `sleep`. Without one (the Convex path) the call
 * returns `retryInMs` and the caller reschedules itself — same semantics, the
 * waiting happens in the scheduler instead of in this process.
 */

export const WEB3FORMS_SUBMIT_ENDPOINT = "https://api.web3forms.com/submit";
const DEFAULT_RETRY_MS = 2000;
const MAX_RETRY_MS = 15_000;
const MAX_ATTEMPTS = 2;

export type SendEmailInput = {
  /** Intended recipient. Carried in the payload; the relay picks the inbox. */
  to: string;
  subject: string;
  /** Plain-text body: the only body a form relay can show its reader. */
  text: string;
  replyTo?: string | undefined;
  /** How many attempts have already been made (1 = first try). */
  attempt?: number | undefined;
};

export type SendEmailResult = {
  ok: boolean;
  error?: string;
  /** True when the message was deliberately not sent (dry-run, bad address). */
  skipped?: boolean;
  /** Set only when a retryable failure happened and nobody could sleep. */
  retryInMs?: number;
};

export type SendEmailOptions = {
  config: EmailConfig;
  sleep?: ((ms: number) => Promise<void>) | undefined;
  fetchImpl?: typeof fetch | undefined;
  /** Injected in tests so retry timing is observable without real waiting. */
  now?: (() => number) | undefined;
};

/** Rejects anything the relay would reject anyway, without a round trip. */
export function isValidRecipient(email: string): boolean {
  return /^[^\s@,;<>"]+@[^\s@,;<>".]+\.[^\s@,;<>"]{2,}$/.test(email.trim());
}

/** Seconds from a `Retry-After` header, clamped to something we will wait. */
function retryAfterMs(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (raw === null) return null;
  const seconds = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds * 1000, MAX_RETRY_MS);
}

const isRetryableStatus = (status: number): boolean => status === 429 || status >= 500;

/** Web3Forms reports errors either at the top level or under `body`. */
function detailFrom(body: unknown): string {
  if (body === null || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  if (typeof record["message"] === "string") return record["message"];
  const nested = record["body"];
  if (nested !== null && typeof nested === "object") {
    const message = (nested as Record<string, unknown>)["message"];
    if (typeof message === "string") return message;
  }
  return "";
}

/** Only ever surfaces a short provider message, never the request/response. */
async function errorFromResponse(response: Response, status: number): Promise<string> {
  let detail = "";
  try {
    detail = detailFrom(await response.json());
  } catch {
    // Non-JSON body: the status alone is enough for an admin to act on.
  }
  detail = detail.slice(0, 300);
  return detail === ""
    ? `Web3Forms rejected the request (HTTP ${status}).`
    : `Web3Forms rejected the request (HTTP ${status}): ${detail}`;
}

async function attemptOnce(
  input: SendEmailInput,
  options: SendEmailOptions,
): Promise<{ ok: true } | { ok: false; error: string; retryable: boolean; delayMs: number }> {
  const { config } = options;
  const fetchImpl = options.fetchImpl ?? fetch;

  const payload: Record<string, unknown> = {
    access_key: config.accessKey,
    subject: input.subject,
    to: input.to.trim(),
    body: input.text,
  };
  const replyTo = (input.replyTo ?? config.replyTo).trim();
  if (replyTo !== "") payload["replyto"] = replyTo;

  let response: Response;
  try {
    response = await fetchImpl(WEB3FORMS_SUBMIT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Network-level failure. Never echo the error: it can carry the URL with
    // headers attached in some runtimes.
    return {
      ok: false,
      error: "Could not reach Web3Forms (network error).",
      retryable: true,
      delayMs: DEFAULT_RETRY_MS,
    };
  }

  if (response.ok) {
    // The relay acknowledges a submission; there is no delivery id to keep.
    return { ok: true };
  }

  const status = response.status;
  return {
    ok: false,
    error: await errorFromResponse(response, status),
    // 4xx (except 429) means the payload itself is wrong — retrying the same
    // bytes would just burn quota.
    retryable: isRetryableStatus(status),
    delayMs: retryAfterMs(response) ?? DEFAULT_RETRY_MS,
  };
}

export async function sendEmail(
  input: SendEmailInput,
  options: SendEmailOptions,
): Promise<SendEmailResult> {
  const { config } = options;

  if (config.mode !== "live") {
    return { ok: true, skipped: true };
  }
  if (config.accessKey === "") {
    return { ok: false, error: "Email is not configured on this deployment." };
  }
  if (!isValidRecipient(input.to)) {
    return { ok: false, error: "Recipient address is not valid.", skipped: true };
  }
  if (input.subject.trim() === "") {
    return { ok: false, error: "Subject is empty." };
  }

  const maxAttempts = MAX_ATTEMPTS;
  const firstAttempt = Math.max(1, input.attempt ?? 1);

  let lastError = "Email could not be sent.";
  for (let attempt = firstAttempt; attempt <= maxAttempts; attempt++) {
    const outcome = await attemptOnce(input, options);
    if (outcome.ok) {
      return { ok: true };
    }
    lastError = outcome.error;
    if (!outcome.retryable || attempt >= maxAttempts) break;

    const sleep = options.sleep;
    if (sleep === undefined) {
      // No timer available (Convex action): hand the delay back so the caller
      // can reschedule itself instead of blocking a thread we do not own.
      return { ok: false, error: lastError, retryInMs: outcome.delayMs };
    }
    try {
      await sleep(outcome.delayMs);
    } catch {
      return { ok: false, error: lastError, retryInMs: outcome.delayMs };
    }
  }

  return { ok: false, error: lastError };
}

/** Rendered content about to be handed to the transport. Never logged. */
export type OutboundEmail = SendEmailInput & { mode: EmailMode };
