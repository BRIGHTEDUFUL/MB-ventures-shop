import type { EmailConfig, EmailMode } from "./config";

/**
 * Plain-`fetch` transport for the Resend HTTP API.
 *
 * Design rules from the spec:
 * - dry-run never touches the network;
 * - one retry after ~2s for network errors, 429 and 5xx, never for 4xx;
 * - `Retry-After` wins over the default delay;
 * - the API key and message bodies are never written to a log.
 *
 * The retry needs to *wait*, and Convex actions have no guaranteed timer, so
 * the caller may hand us a `sleep`. Without one (the Convex path) the call
 * returns `retryInMs` and the caller reschedules itself — same semantics, the
 * waiting happens in the scheduler instead of in this process.
 */

export const RESEND_SEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_RETRY_MS = 2000;
const MAX_RETRY_MS = 15_000;
const MAX_ATTEMPTS = 2;

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | undefined;
  tags?: string[] | undefined;
  /** Adds `Idempotency-Key` so a double delivery is rejected by Resend. */
  idempotencyKey?: string | undefined;
  /** How many attempts have already been made (1 = first try). */
  attempt?: number | undefined;
};

export type SendEmailResult = {
  ok: boolean;
  providerMessageId?: string;
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

/** Rejects anything Resend would bounce on anyway, without a round trip. */
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

/** Only ever surfaces a short provider message, never the request/response. */
async function errorFromResponse(response: Response, status: number): Promise<string> {
  let detail = "";
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "message" in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === "string") detail = message.slice(0, 300);
    }
  } catch {
    // Non-JSON body: the status alone is enough for an admin to act on.
  }
  return detail === ""
    ? `Resend rejected the request (HTTP ${status}).`
    : `Resend rejected the request (HTTP ${status}): ${detail}`;
}

async function attemptOnce(
  input: SendEmailInput,
  options: SendEmailOptions,
): Promise<
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; retryable: boolean; delayMs: number }
> {
  const { config } = options;
  const fetchImpl = options.fetchImpl ?? fetch;

  const payload: Record<string, unknown> = {
    from: config.from,
    to: [input.to.trim()],
    subject: input.subject,
    html: input.html,
    text: input.text,
  };
  const replyTo = (input.replyTo ?? config.replyTo).trim();
  if (replyTo !== "") payload["reply_to"] = replyTo;
  const tags = (input.tags ?? []).filter((tag) => tag.trim() !== "").slice(0, 3);
  if (tags.length > 0) {
    payload["tags"] = tags.map((value, index) => ({
      name: index === 0 ? "category" : `category_${index}`,
      value: value.slice(0, 255),
    }));
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
  if (input.idempotencyKey !== undefined && input.idempotencyKey !== "") {
    headers["Idempotency-Key"] = input.idempotencyKey;
  }

  let response: Response;
  try {
    response = await fetchImpl(RESEND_SEND_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch {
    // Network-level failure. Never echo the error: it can carry the URL with
    // headers attached in some runtimes.
    return {
      ok: false,
      error: "Could not reach Resend (network error).",
      retryable: true,
      delayMs: DEFAULT_RETRY_MS,
    };
  }

  if (response.ok) {
    let providerMessageId = "";
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && "id" in body) {
        const id = (body as { id: unknown }).id;
        if (typeof id === "string") providerMessageId = id;
      }
    } catch {
      // A missing id only costs us webhook correlation, not the delivery.
    }
    return { ok: true, providerMessageId };
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
  if (config.apiKey === "" || config.from === "") {
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
      return { ok: true, providerMessageId: outcome.providerMessageId };
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
