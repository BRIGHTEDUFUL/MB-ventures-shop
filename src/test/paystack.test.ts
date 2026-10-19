import { describe, expect, it } from "vitest";
import {
  DEFAULT_PENDING_MINUTES,
  callbackUrlFor,
  channelLabel,
  chargeMismatch,
  getPaystackSecret,
  pesewas,
  pendingMinutes,
  readInitializeResponse,
  readVerifyResponse,
  readWebhookEvent,
  verifyPaystackSignature,
} from "../../convex/lib/paystack";

/**
 * Pure-gateway coverage: every rule that decides whether a charge is this
 * order's money, plus the parsers that stand between Paystack's JSON and the
 * rest of the backend. No Convex, no network — see `payments-flow.test.ts`
 * for the transactional half.
 */

/** Computes an HMAC-SHA512 the same way Paystack does, via Web Crypto. */
async function sign(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("money and configuration helpers", () => {
  it("converts cedis to pesewas without floating-point drift", () => {
    expect(pesewas(1450)).toBe(145000);
    expect(pesewas(100.1)).toBe(10010); // 100.1 * 100 is 10009.999… in binary
    expect(pesewas(0)).toBe(0);
    expect(pesewas(999.99)).toBe(99999);
  });

  it("reads the secret defensively and trims it", () => {
    expect(getPaystackSecret({})).toBe("");
    expect(getPaystackSecret({ PAYSTACK_SECRET_KEY: "  sk_test_abc  " })).toBe("sk_test_abc");
  });

  it("defaults and clamps the pending-payment hold window", () => {
    expect(pendingMinutes({})).toBe(DEFAULT_PENDING_MINUTES);
    expect(pendingMinutes({ PAYSTACK_PENDING_MINUTES: "abc" })).toBe(DEFAULT_PENDING_MINUTES);
    expect(pendingMinutes({ PAYSTACK_PENDING_MINUTES: "30" })).toBe(30);
    expect(pendingMinutes({ PAYSTACK_PENDING_MINUTES: "1" })).toBe(5); // floor
    expect(pendingMinutes({ PAYSTACK_PENDING_MINUTES: "99999" })).toBe(24 * 60); // ceiling
  });

  it("builds the callback URL only from https origins", () => {
    expect(callbackUrlFor("https://mbventuresgh.com")).toBe(
      "https://mbventuresgh.com/paystack/return",
    );
    expect(callbackUrlFor("https://mbventuresgh.com/")).toBe(
      "https://mbventuresgh.com/paystack/return",
    );
    // Paystack rejects http callbacks — localhost must rely on the dashboard.
    expect(callbackUrlFor("http://localhost:5173")).toBeNull();
    expect(callbackUrlFor("")).toBeNull();
  });

  it("labels channels for humans", () => {
    expect(channelLabel("mobile_money")).toBe("mobile money");
    expect(channelLabel("card")).toBe("card");
    expect(channelLabel("")).toBe("gateway");
  });
});

describe("webhook signature (HMAC-SHA512)", () => {
  const body = JSON.stringify({ event: "charge.success", data: { reference: "MB-TEST" } });

  it("accepts the signature Paystack would send", async () => {
    const signature = await sign(body, "sk_test_secret");
    expect(await verifyPaystackSignature(body, signature, "sk_test_secret")).toBe(true);
  });

  it("is case-insensitive on the hex digest", async () => {
    const signature = (await sign(body, "sk_test_secret")).toUpperCase();
    expect(await verifyPaystackSignature(body, signature, "sk_test_secret")).toBe(true);
  });

  it("rejects a tampered body, a wrong secret, or a missing signature", async () => {
    const signature = await sign(body, "sk_test_secret");
    expect(await verifyPaystackSignature(body + " ", signature, "sk_test_secret")).toBe(false);
    expect(await verifyPaystackSignature(body, signature, "sk_test_other")).toBe(false);
    expect(await verifyPaystackSignature(body, "", "sk_test_secret")).toBe(false);
    expect(await verifyPaystackSignature("", signature, "sk_test_secret")).toBe(false);
    expect(await verifyPaystackSignature(body, signature, "")).toBe(false);
  });

  it("refuses a signature of a different length without throwing", async () => {
    expect(await verifyPaystackSignature(body, "deadbeef", "sk_test_secret")).toBe(false);
  });
});

describe("Paystack response parsing", () => {
  it("reads an initialise response", () => {
    const parsed = readInitializeResponse({
      status: true,
      message: "Authorization URL created",
      data: {
        authorization_url: "https://checkout.paystack.com/abc",
        access_code: "abc",
        reference: "MB-1",
      },
    });
    expect(parsed).toEqual({
      authorizationUrl: "https://checkout.paystack.com/abc",
      accessCode: "abc",
      reference: "MB-1",
    });
  });

  it("refuses a failed or malformed initialise response", () => {
    expect(readInitializeResponse({ status: false, message: "Invalid key" })).toBeNull();
    expect(readInitializeResponse(null)).toBeNull();
    expect(readInitializeResponse({ status: true, data: { authorization_url: "x" } })).toBeNull();
  });

  it("keeps the API's boolean status apart from the charge's string status", () => {
    const parsed = readVerifyResponse({
      status: true, // API call worked…
      message: "Transaction found",
      data: {
        id: 42,
        status: "success", // …and this is what happened to the money.
        reference: "MB-1",
        amount: 145000,
        currency: "GHS",
        channel: "mobile_money",
        paid_at: "2026-10-19T10:00:00.000Z",
        authorization: { authorization_code: "AUTH_1" },
      },
    });
    expect(parsed).toMatchObject({
      status: "success",
      reference: "MB-1",
      amount: 145000,
      currency: "GHS",
      channel: "mobile_money",
      paidAt: Date.parse("2026-10-19T10:00:00.000Z"),
      transactionId: 42,
      authorizationCode: "AUTH_1",
    });
  });

  it("refuses a payload without a numeric amount or without a successful API call", () => {
    expect(readVerifyResponse({ status: false })).toBeNull();
    expect(readVerifyResponse({ status: true, data: { amount: "lots" } })).toBeNull();
    expect(readVerifyResponse({ status: true, data: {} })).toBeNull();
    expect(readVerifyResponse(undefined)).toBeNull();
  });

  it("reads webhook events defensively", () => {
    expect(readWebhookEvent({ event: "charge.failed", data: { status: "failed" } }).event).toBe(
      "charge.failed",
    );
    expect(readWebhookEvent("not json at all").event).toBe("");
    expect(readWebhookEvent({ event: "charge.success", data: {} }).data).toBeNull();
  });
});

describe("chargeMismatch — the money gate", () => {
  const charge = {
    status: "success",
    reference: "MB-1",
    amount: 145000,
    currency: "GHS",
    channel: "card",
    paidAt: 1,
    transactionId: 7,
    authorizationCode: "AUTH_1",
  };

  it("accepts exactly the charge we asked for", () => {
    expect(chargeMismatch(charge, { reference: "MB-1", amountPesewas: 145000 })).toBeNull();
  });

  it("names the reason for every kind of wrong money", () => {
    expect(
      chargeMismatch(
        { ...charge, status: "ongoing" },
        { reference: "MB-1", amountPesewas: 145000 },
      ),
    ).toBe("status");
    expect(
      chargeMismatch(
        { ...charge, reference: "MB-2" },
        { reference: "MB-1", amountPesewas: 145000 },
      ),
    ).toBe("reference");
    expect(
      chargeMismatch({ ...charge, currency: "NGN" }, { reference: "MB-1", amountPesewas: 145000 }),
    ).toBe("currency");
    expect(
      chargeMismatch({ ...charge, amount: 1 }, { reference: "MB-1", amountPesewas: 145000 }),
    ).toBe("amount");
  });
});
