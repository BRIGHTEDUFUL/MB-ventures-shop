import { afterEach, describe, expect, it, vi } from "vitest";
import type { EmailConfig } from "../../convex/emails/config";
import { RESEND_SEND_ENDPOINT, isValidRecipient, sendEmail } from "../../convex/emails/transport";

const API_KEY = "re_super_secret_key_do_not_log";

const liveConfig: EmailConfig = {
  mode: "live",
  apiKey: API_KEY,
  from: "MB Ventures GH <info@mbventures.test>",
  replyTo: "orders@mbventuresgh.com",
  adminAlertEmail: "",
  dailyLimit: 100,
  webhookSecret: "",
  logCodes: false,
  siteUrl: "http://localhost:5173",
};

const dryConfig: EmailConfig = { ...liveConfig, mode: "dry-run", apiKey: "", from: "" };

const message = {
  to: "ama@example.com",
  subject: "Order MB-2FA41C09 received",
  html: "<p>We have your order.</p>",
  text: "We have your order.",
};

type Call = { url: string; init: RequestInit };

/** Minimal `Response` so the tests do not depend on a particular runtime. */
const response = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    json: async () => body,
  }) as unknown as Response;

const recordingFetch = (results: (Response | Error)[]) => {
  const calls: Call[] = [];
  let index = 0;
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = results[Math.min(index, results.length - 1)];
    index += 1;
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { calls, impl };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isValidRecipient", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidRecipient("ama@example.com")).toBe(true);
    expect(isValidRecipient("  orders+desk@mbventuresgh.com ")).toBe(true);
  });

  it("rejects anything Resend would bounce on", () => {
    expect(isValidRecipient("")).toBe(false);
    expect(isValidRecipient("not-an-address")).toBe(false);
    expect(isValidRecipient("ama@localhost")).toBe(false);
    expect(isValidRecipient("a b@example.com")).toBe(false);
    expect(isValidRecipient("<script>@example.com")).toBe(false);
  });
});

describe("dry-run mode", () => {
  it("never touches the network", async () => {
    const { calls, impl } = recordingFetch([response(200, { id: "email_1" })]);
    const result = await sendEmail(message, { config: dryConfig, fetchImpl: impl });
    expect(result).toEqual({ ok: true, skipped: true });
    expect(calls).toHaveLength(0);
  });
});

describe("live mode payload", () => {
  it("sends exactly the shape Resend expects", async () => {
    const { calls, impl } = recordingFetch([response(200, { id: "email_abc" }, {})]);
    const result = await sendEmail(
      { ...message, idempotencyKey: "log-id-1", tags: ["order", "customer"] },
      { config: liveConfig, fetchImpl: impl },
    );

    expect(result).toEqual({ ok: true, providerMessageId: "email_abc" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(RESEND_SEND_ENDPOINT);
    expect(calls[0]!.init.method).toBe("POST");

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${API_KEY}`);
    expect(headers["Idempotency-Key"]).toBe("log-id-1");

    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      from: "MB Ventures GH <info@mbventures.test>",
      to: ["ama@example.com"],
      subject: "Order MB-2FA41C09 received",
      html: "<p>We have your order.</p>",
      text: "We have your order.",
      reply_to: "orders@mbventuresgh.com",
    });
    expect(body["tags"]).toEqual([
      { name: "category", value: "order" },
      { name: "category_1", value: "customer" },
    ]);
  });

  it("skips an unusable address without a round trip", async () => {
    const { calls, impl } = recordingFetch([response(200, { id: "email_abc" })]);
    const result = await sendEmail(
      { ...message, to: "broken-address" },
      {
        config: liveConfig,
        fetchImpl: impl,
      },
    );
    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("refuses to run unconfigured", async () => {
    const result = await sendEmail(message, {
      config: { ...liveConfig, apiKey: "" },
      fetchImpl: recordingFetch([response(200, {})]).impl,
    });
    expect(result).toEqual({
      ok: false,
      error: "Email is not configured on this deployment.",
    });
  });
});

describe("retry behaviour", () => {
  it("does not retry a 4xx rejection", async () => {
    const { calls, impl } = recordingFetch([
      response(422, { message: "The email address is invalid." }),
    ]);
    const sleep = vi.fn(async () => {});
    const result = await sendEmail(message, { config: liveConfig, fetchImpl: impl, sleep });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("HTTP 422");
    expect(sleep).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it("retries 429 once and succeeds", async () => {
    const { calls, impl } = recordingFetch([
      response(429, { message: "Rate limit exceeded" }),
      response(200, { id: "email_after_retry" }),
    ]);
    const sleep = vi.fn(async () => {});
    const result = await sendEmail(message, { config: liveConfig, fetchImpl: impl, sleep });

    expect(result).toEqual({ ok: true, providerMessageId: "email_after_retry" });
    expect(calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("hands the delay back when there is no timer to wait on", async () => {
    const { impl } = recordingFetch([response(500, { message: "Server error" })]);
    const result = await sendEmail(message, { config: liveConfig, fetchImpl: impl });

    expect(result.ok).toBe(false);
    expect(result.retryInMs).toBe(2000);
  });

  it("respects Retry-After and clamps it to something we would wait for", async () => {
    const short = await sendEmail(message, {
      config: liveConfig,
      fetchImpl: recordingFetch([response(429, {}, { "retry-after": "4" })]).impl,
    });
    expect(short.retryInMs).toBe(4000);

    const huge = await sendEmail(message, {
      config: liveConfig,
      fetchImpl: recordingFetch([response(429, {}, { "retry-after": "900" })]).impl,
    });
    expect(huge.retryInMs).toBe(15_000);
  });

  it("treats a network failure as retryable without leaking the request", async () => {
    const { impl } = recordingFetch([new Error("connect ECONNREFUSED api.resend.com")]);
    const result = await sendEmail(message, { config: liveConfig, fetchImpl: impl });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Could not reach Resend (network error).");
    expect(result.retryInMs).toBe(2000);
    expect(result.error).not.toContain(API_KEY);
  });

  it("gives up after the second attempt", async () => {
    const { calls, impl } = recordingFetch([response(503, { message: "Unavailable" })]);
    const sleep = vi.fn(async () => {});
    const result = await sendEmail(message, { config: liveConfig, fetchImpl: impl, sleep });

    expect(result.ok).toBe(false);
    expect(result.retryInMs).toBeUndefined();
    expect(calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});

describe("secret hygiene", () => {
  it("never writes the API key to the console or the returned error", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((name) =>
      vi.spyOn(console, name).mockImplementation(() => {}),
    );

    const { impl } = recordingFetch([response(401, { message: "Authentication required" })]);
    const result = await sendEmail(message, { config: liveConfig, fetchImpl: impl });

    const everything = [
      result.error ?? "",
      ...spies.flatMap((spy) => spy.mock.calls.flat()).map((call) => String(call)),
    ].join(" ");
    expect(everything).not.toContain(API_KEY);
    expect(result.error).not.toContain(message.html);
  });

  it("never echoes the message body in a provider error", async () => {
    const { impl } = recordingFetch([response(400, { message: "html is required" })]);
    const result = await sendEmail(message, { config: liveConfig, fetchImpl: impl });
    expect(result.error).toBe("Resend rejected the request (HTTP 400): html is required");
    expect(result.error).not.toContain(message.html);
    expect(result.error).not.toContain(message.text);
  });
});
