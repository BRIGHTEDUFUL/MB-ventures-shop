import { afterEach, describe, expect, it, vi } from "vitest";
import type { EmailConfig } from "../../convex/emails/config";
import {
  WEB3FORMS_SUBMIT_ENDPOINT,
  isValidRecipient,
  sendEmail,
} from "../../convex/emails/transport";

const ACCESS_KEY = "w3f_super_secret_key_do_not_log";

const liveConfig: EmailConfig = {
  mode: "live",
  accessKey: ACCESS_KEY,
  replyTo: "info@mbventuresghana.com",
  adminAlertEmail: "",
  dailyLimit: 100,
  logCodes: false,
  siteUrl: "http://localhost:5173",
};

const dryConfig: EmailConfig = { ...liveConfig, mode: "dry-run", accessKey: "" };

const message = {
  to: "ama@example.com",
  subject: "Order MB-2FA41C09 received",
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
    expect(isValidRecipient("  orders+desk@mbventuresghana.com ")).toBe(true);
  });

  it("rejects anything the relay would bounce on", () => {
    expect(isValidRecipient("")).toBe(false);
    expect(isValidRecipient("not-an-address")).toBe(false);
    expect(isValidRecipient("ama@localhost")).toBe(false);
    expect(isValidRecipient("a b@example.com")).toBe(false);
    expect(isValidRecipient("<script>@example.com")).toBe(false);
  });
});

describe("dry-run mode", () => {
  it("never touches the network", async () => {
    const { calls, impl } = recordingFetch([response(200, { success: true })]);
    const result = await sendEmail(message, { config: dryConfig, fetchImpl: impl });
    expect(result).toEqual({ ok: true, skipped: true });
    expect(calls).toHaveLength(0);
  });
});

describe("live mode payload", () => {
  it("posts exactly the shape Web3Forms expects", async () => {
    const { calls, impl } = recordingFetch([response(200, { success: true })]);
    const result = await sendEmail(message, { config: liveConfig, fetchImpl: impl });

    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(WEB3FORMS_SUBMIT_ENDPOINT);
    expect(calls[0]!.url).toBe("https://api.web3forms.com/submit");
    expect(calls[0]!.init.method).toBe("POST");

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    // The relay authenticates inside the body; nothing secret rides the headers.
    expect(headers["Authorization"]).toBeUndefined();
    expect(headers["Idempotency-Key"]).toBeUndefined();

    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      access_key: ACCESS_KEY,
      to: "ama@example.com",
      subject: "Order MB-2FA41C09 received",
      body: "We have your order.",
      replyto: "info@mbventuresghana.com",
    });
    // No Resend leftovers: no html, no tags, no idempotency key.
    expect(body).not.toHaveProperty("html");
    expect(body).not.toHaveProperty("tags");
    expect(body).not.toHaveProperty("idempotency_key");
  });

  it("omits replyto when neither the message nor the config supplies one", async () => {
    const { calls, impl } = recordingFetch([response(200, { success: true })]);
    await sendEmail(message, {
      config: { ...liveConfig, replyTo: "   " },
      fetchImpl: impl,
    });

    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("replyto");
  });

  it("lets the message override the configured reply-to", async () => {
    const { calls, impl } = recordingFetch([response(200, { success: true })]);
    await sendEmail(
      { ...message, replyTo: "escalations@example.com" },
      { config: { ...liveConfig, replyTo: "ignored@example.com" }, fetchImpl: impl },
    );

    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body["replyto"]).toBe("escalations@example.com");
  });

  it("skips an unusable address without a round trip", async () => {
    const { calls, impl } = recordingFetch([response(200, { success: true })]);
    const result = await sendEmail(
      { ...message, to: "broken-address" },
      {
        config: liveConfig,
        fetchImpl: impl,
      },
    );
    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.error).toBe("Recipient address is not valid.");
    expect(calls).toHaveLength(0);
  });

  it("refuses to run unconfigured", async () => {
    const result = await sendEmail(message, {
      config: { ...liveConfig, accessKey: "" },
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
      response(400, { message: "The email address is invalid." }),
    ]);
    const sleep = vi.fn(async () => {});
    const result = await sendEmail(message, { config: liveConfig, fetchImpl: impl, sleep });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("HTTP 400");
    expect(sleep).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it("retries 429 once and succeeds", async () => {
    const { calls, impl } = recordingFetch([
      response(429, { message: "Rate limit exceeded" }),
      response(200, { success: true }),
    ]);
    const sleep = vi.fn(async () => {});
    const result = await sendEmail(message, { config: liveConfig, fetchImpl: impl, sleep });

    expect(result).toEqual({ ok: true });
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
    const { impl } = recordingFetch([new Error("connect ECONNREFUSED api.web3forms.com")]);
    const result = await sendEmail(message, { config: liveConfig, fetchImpl: impl });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Could not reach Web3Forms (network error).");
    expect(result.retryInMs).toBe(2000);
    expect(result.error).not.toContain(ACCESS_KEY);
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
  it("never writes the access key to the console or the returned error", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((name) =>
      vi.spyOn(console, name).mockImplementation(() => {}),
    );

    const { impl } = recordingFetch([response(401, { message: "Authentication required" })]);
    const result = await sendEmail(message, { config: liveConfig, fetchImpl: impl });

    const everything = [
      result.error ?? "",
      ...spies.flatMap((spy) => spy.mock.calls.flat()).map((call) => String(call)),
    ].join(" ");
    expect(everything).not.toContain(ACCESS_KEY);
    expect(result.error).not.toContain(message.text);
  });

  it("never echoes the message body in a provider error", async () => {
    const { impl } = recordingFetch([response(400, { message: "html is required" })]);
    const result = await sendEmail(message, { config: liveConfig, fetchImpl: impl });
    expect(result.error).toBe("Web3Forms rejected the request (HTTP 400): html is required");
    expect(result.error).not.toContain(message.text);
  });

  it("surfaces the detail Web3Forms nests under body.message", async () => {
    const { impl } = recordingFetch([
      response(400, { success: false, body: { message: "Missing access key" } }),
    ]);
    const result = await sendEmail(message, { config: liveConfig, fetchImpl: impl });
    expect(result.error).toBe("Web3Forms rejected the request (HTTP 400): Missing access key");
    expect(result.error).not.toContain(ACCESS_KEY);
    expect(result.error).not.toContain(message.text);
  });
});
