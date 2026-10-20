// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

/**
 * Transactional coverage of the online-payment pipeline against the real
 * Convex functions (`orders.place`, `payments.markPaid`,
 * `payments.abandon`, `payments.expireStale`, `paystackWebhook`), mirroring
 * `convex-mutations.test.ts`.
 *
 * Everything stays offline: credentials are cleared so email runs dry-run,
 * `fetch` is stubbed so any accidental outbound call fails loudly, and the
 * gateway's side of every conversation is either asserted at the mutation
 * boundary or fed in through a correctly signed webhook body.
 */
const modules = import.meta.glob("../../convex/**/*.*s");

const ENV_KEYS = [
  "WEB3FORMS_ACCESS_KEY",
  "EMAIL_REPLY_TO",
  "ADMIN_ALERT_EMAIL",
  "EMAIL_DAILY_LIMIT",
  "EMAIL_DRY_RUN_LOG_CODES",
  "SITE_URL",
  "CONVEX_SITE_URL",
  "PAYSTACK_SECRET_KEY",
  "PAYSTACK_PENDING_MINUTES",
] as const;

/** Any call at all is a bug: this suite must never leave the machine.
 *  The explicit signature lets individual tests feed a canned gateway reply. */
const fetchSpy = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(
  async () => {
    throw new Error("This suite must never reach the network.");
  },
);

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env["SITE_URL"] = "http://localhost:5173";
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
});

type PlaceArgs = FunctionArgs<typeof api.orders.place>;

/** Seeds the store with online payments switched on and one priced product. */
async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.seed, {});

  const world = await t.run(async (ctx) => {
    const desk = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", "standing-desk"))
      .unique();
    if (desk === null) throw new Error("seed did not create the sample products");
    await ctx.db.patch(desk._id, { verified: true, stock: 50, price: 999.99 });

    const settings = await ctx.db.query("store_settings").unique();
    if (settings === null) throw new Error("seed did not create settings");
    await ctx.db.patch(settings._id, { ordering_enabled: true, paystack_enabled: true });

    const customerId = await ctx.db.insert("users", {
      name: "Ama Mensah",
      email: "ama@example.com",
      phone: "0241234567",
    });
    return { customerId };
  });

  const customer = t.withIdentity({ subject: `${world.customerId}|test-session` });
  return { t, customer, customerId: world.customerId };
}

type Env = Awaited<ReturnType<typeof setup>>;

const DEFAULT_CHECKOUT: PlaceArgs = {
  customer_name: "Ama Mensah",
  phone: "0241234567",
  email: "ama@example.com",
  address: "12 Abelenkpe Taxi Rank Road, Accra",
  fulfillment: "delivery",
  zone: "central",
  items: [{ id: "standing-desk", quantity: 2 }],
};

const checkout = (overrides: Partial<PlaceArgs> = {}): PlaceArgs => ({
  ...DEFAULT_CHECKOUT,
  ...overrides,
});

const drain = (env: Env) => env.t.finishAllScheduledFunctions(() => {});

async function placeOnline(env: Env, overrides: Partial<PlaceArgs> = {}) {
  const order = await env.customer.mutation(api.orders.place, {
    ...checkout(overrides),
    payment: "online",
  });
  await drain(env);
  return order;
}

async function expectConvexError(promise: Promise<unknown>, expected: RegExp) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<{ message: string }>).data.message).toMatch(expected);
    return;
  }
  throw new Error("expected the call to fail, but it resolved");
}

const readOrder = (env: Env, id: string) =>
  env.t.run(async (ctx) => {
    const orderId = ctx.db.normalizeId("orders", id);
    if (orderId === null) throw new Error("order id is malformed");
    return await ctx.db.get(orderId);
  });

const readProduct = (env: Env, slug: string) =>
  env.t.run(async (ctx) => {
    const product = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (product === null) throw new Error(`product ${slug} not found`);
    return product;
  });

const patchSettings = (env: Env, patch: Partial<Doc<"store_settings">>) =>
  env.t.run(async (ctx) => {
    const settings = await ctx.db.query("store_settings").unique();
    if (settings === null) throw new Error("store settings row is missing");
    await ctx.db.patch(settings._id, patch);
  });

const orderHistory = (env: Env, orderId: string) =>
  env.t.run(async (ctx) => {
    const id = ctx.db.normalizeId("orders", orderId);
    if (id === null) return [];
    return await ctx.db
      .query("order_history")
      .withIndex("by_order", (q) => q.eq("order_id", id))
      .collect();
  });

/** A charge that matches an order's locked amount, for `markPaid`. */
function chargeFor(
  order: { reference: string; total: number },
  extra: Record<string, unknown> = {},
) {
  return {
    status: "success",
    reference: order.reference,
    amount: Math.round(order.total * 100),
    currency: "GHS",
    channel: "mobile_money",
    paidAt: Date.parse("2026-10-19T12:00:00.000Z"),
    transactionId: 9001,
    authorizationCode: "AUTH_OK",
    ...extra,
  };
}

describe("orders.place — online payment", () => {
  it("locks the pesewas amount, holds stock and opens the timeline", async () => {
    const env = await setup();
    const order = await placeOnline(env);

    expect(order.payment_method).toBe("paystack");
    expect(order.payment_status).toBe("pending");
    // The lock is exact: the total the server computed, in pesewas.
    const stored = await readOrder(env, order.id);
    expect(stored?.payment_amount_pesewas).toBe(Math.round(order.total * 100));
    // No delivery fee any more (the rider is paid by the customer directly),
    // so the total the lock was taken from is the subtotal, exactly.
    expect(order.delivery_fee).toBe(0);
    expect(stored?.total).toBe(order.subtotal + order.delivery_fee);
    expect(stored?.total).toBe(order.total);

    // Units are held exactly like a cash order: on the shelf they are gone,
    // on the books they are reserved until the goods leave.
    const desk = await readProduct(env, "standing-desk");
    expect(desk.stock).toBe(48);
    expect(desk.reserved).toBe(2);

    const timeline = await orderHistory(env, order.id);
    expect(timeline[0]?.note).toMatch(/Complete the online payment/i);
  });

  it("leaves offline orders exactly as they were", async () => {
    const env = await setup();
    const order = await env.customer.mutation(api.orders.place, checkout());
    await drain(env);

    expect(order.payment_method).toBe("cod");
    expect(order.payment_status).toBe("pending");
    const stored = await readOrder(env, order.id);
    expect(stored?.payment_amount_pesewas).toBeUndefined();
  });

  it("refuses online payment while the staff switch is off", async () => {
    const env = await setup();
    await patchSettings(env, { paystack_enabled: false });
    await expectConvexError(placeOnline(env), /not available right now/i);
  });

  it("supersedes the shopper's older unpaid online order instead of stacking holds", async () => {
    const env = await setup();
    const first = await placeOnline(env);
    const second = await placeOnline(env);

    const firstRow = await readOrder(env, first.id);
    expect(firstRow?.status).toBe("cancelled");
    // Superseding is silent: no cancellation email for a checkout that never
    // finished, just the timeline note and the stock return.
    const timeline = await orderHistory(env, first.id);
    expect(timeline.at(-1)?.note).toMatch(/Superseded/i);

    // Net effect: exactly one hold on the shelf, owned by the newer order.
    const desk = await readProduct(env, "standing-desk");
    expect(desk.stock).toBe(48);
    expect(desk.reserved).toBe(2);
    const secondRow = await readOrder(env, second.id);
    expect(secondRow?.status).toBe("received");
    expect(secondRow?.payment_status).toBe("pending");
  });
});

describe("payments.markPaid — the only pending → confirmed door", () => {
  it("confirms once, records the gateway facts and never twice", async () => {
    const env = await setup();
    const order = await placeOnline(env);

    const first = await env.t.mutation(internal.payments.markPaid, {
      reference: order.reference,
      charge: chargeFor(order),
    });
    expect(first).toEqual({ ok: true, reason: "confirmed" });

    const row = await readOrder(env, order.id);
    expect(row?.payment_status).toBe("confirmed");
    expect(row?.provider).toBe("paystack");
    expect(row?.transaction_reference).toBe("AUTH_OK");
    expect(row?.payment_channel).toBe("mobile_money");
    expect(row?.paid_at).toBe(Date.parse("2026-10-19T12:00:00.000Z"));
    expect(row?.paystack_transaction_id).toBe(9001);
    expect((await orderHistory(env, order.id)).at(-1)?.note).toMatch(/Paystack/i);

    // The webhook will race the return page in real life: the second arrival
    // is a no-op that still reports success, and no second timeline row exists.
    const again = await env.t.mutation(internal.payments.markPaid, {
      reference: order.reference,
      charge: chargeFor(order),
    });
    expect(again).toEqual({ ok: true, reason: "already-confirmed" });
    const notes = (await orderHistory(env, order.id)).filter((h) => h.note.includes("Paystack"));
    expect(notes).toHaveLength(1);

    // Stock is untouched by confirmation — it moved at placement.
    const desk = await readProduct(env, "standing-desk");
    expect(desk.stock).toBe(48);
    expect(desk.reserved).toBe(2);
  });

  it("refuses charges whose money does not match the order", async () => {
    const env = await setup();
    const order = await placeOnline(env);

    const short = await env.t.mutation(internal.payments.markPaid, {
      reference: order.reference,
      charge: chargeFor(order, { amount: 1 }),
    });
    expect(short).toEqual({ ok: false, reason: "mismatch:amount" });

    const foreign = await env.t.mutation(internal.payments.markPaid, {
      reference: order.reference,
      charge: chargeFor(order, { currency: "NGN" }),
    });
    expect(foreign).toEqual({ ok: false, reason: "mismatch:currency" });

    const wrongRef = await env.t.mutation(internal.payments.markPaid, {
      reference: order.reference,
      charge: chargeFor(order, { reference: "MB-SOMEONE-ELSE" }),
    });
    expect(wrongRef).toEqual({ ok: false, reason: "mismatch:reference" });

    const row = await readOrder(env, order.id);
    expect(row?.payment_status).toBe("pending");
  });

  it("cannot resurrect a cancelled order", async () => {
    const env = await setup();
    const order = await placeOnline(env);
    await env.t.mutation(internal.payments.abandon, {
      reference: order.reference,
      reason: "Test rollback.",
    });

    const late = await env.t.mutation(internal.payments.markPaid, {
      reference: order.reference,
      charge: chargeFor(order),
    });
    expect(late).toEqual({ ok: false, reason: "cancelled" });
    const row = await readOrder(env, order.id);
    expect(row?.status).toBe("cancelled");
    expect(row?.payment_status).toBe("pending");
    // The stock went back when the order fell over, and stays back.
    const desk = await readProduct(env, "standing-desk");
    expect(desk.stock).toBe(50);
    expect(desk.reserved).toBe(0);
  });
});

describe("payments.abandon / expireStale — unpaid orders give stock back", () => {
  it("rolls back an order whose payment never started", async () => {
    const env = await setup();
    const order = await placeOnline(env);

    const result = await env.t.mutation(internal.payments.abandon, {
      reference: order.reference,
      reason: "Online payment could not be started.",
    });
    expect(result).toEqual({ ok: true });

    const row = await readOrder(env, order.id);
    expect(row?.status).toBe("cancelled");
    expect(row?.stock_state).toBe("released");
    const desk = await readProduct(env, "standing-desk");
    expect(desk.stock).toBe(50);
    expect(desk.reserved).toBe(0);

    // Cancelling twice must not hand the shelf a second gift.
    await env.t.mutation(internal.payments.abandon, {
      reference: order.reference,
      reason: "Online payment could not be started.",
    });
    const deskAgain = await readProduct(env, "standing-desk");
    expect(deskAgain.stock).toBe(50);
  });

  it("leaves fresh and offline orders alone", async () => {
    const env = await setup();
    await placeOnline(env); // fresh — inside its hold window
    const cash = await env.customer.mutation(api.orders.place, checkout());
    await drain(env);

    const sweep = await env.t.mutation(internal.payments.expireStale, {});
    expect(sweep).toEqual({ ok: true, cancelled: 0 });

    const online = await env.t.run(async (ctx) => {
      const rows = await ctx.db.query("orders").collect();
      return rows.find((o) => o.payment_method === "paystack");
    });
    expect(online?.status).toBe("received");
    const cashRow = await readOrder(env, cash.id);
    expect(cashRow?.status).toBe("received");
  });
});

describe("payments.status and payments.orderForPayment", () => {
  it("answers the return page with a receipt, and nobody else's order", async () => {
    const env = await setup();
    const order = await placeOnline(env);

    const snapshot = await env.t.query(api.payments.status, { reference: order.reference });
    expect(snapshot?.payment_status).toBe("pending");
    expect(snapshot?.receipt.reference).toBe(order.reference);

    expect(await env.t.query(api.payments.status, { reference: "MB-NOPE" })).toBeNull();

    // The hand-off query is owner-only.
    const other = await env.t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { name: "Other", email: "other@example.com" });
      return id;
    });
    const stranger = env.t.withIdentity({ subject: `${other}|test-session` });
    await expectConvexError(
      stranger.query(api.payments.orderForPayment, { reference: order.reference }),
      /not yours/i,
    );

    const own = await env.customer.query(api.payments.orderForPayment, {
      reference: order.reference,
    });
    expect(own.amount_pesewas).toBe(Math.round(order.total * 100));
    expect(own.authorization_url).toBeNull();
  });

  it("refuses to start a payment when the server has no secret key", async () => {
    const env = await setup();
    const order = await placeOnline(env);
    // PAYSTACK_SECRET_KEY is cleared for this suite — no fetch is attempted,
    // which the stubbed global would loudly fail on if it were.
    await expectConvexError(
      env.customer.action(api.payments.initialize, { reference: order.reference }),
      /not available right now/i,
    );
  });
});

describe("POST /webhooks/paystack", () => {
  const WEBHOOK_PATH = "/webhooks/paystack";

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

  async function post(env: Env, body: string, signature: string | null) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (signature !== null) headers["x-paystack-signature"] = signature;
    return await env.t.fetch(WEBHOOK_PATH, { method: "POST", body, headers });
  }

  it("confirms the order for a correctly signed charge.success", async () => {
    const env = await setup();
    const order = await placeOnline(env);
    process.env["PAYSTACK_SECRET_KEY"] = "sk_test_webhook";

    const body = JSON.stringify({
      event: "charge.success",
      data: {
        id: 9001,
        status: "success",
        reference: order.reference,
        amount: Math.round(order.total * 100),
        currency: "GHS",
        channel: "card",
        paid_at: "2026-10-19T12:30:00.000Z",
        authorization: { authorization_code: "AUTH_HOOK" },
      },
    });
    const response = await post(env, body, await sign(body, "sk_test_webhook"));
    expect(response.status).toBe(200);
    await drain(env);

    const row = await readOrder(env, order.id);
    expect(row?.payment_status).toBe("confirmed");
    expect(row?.transaction_reference).toBe("AUTH_HOOK");
    expect(row?.payment_channel).toBe("card");
  });

  it("verifies nothing without a valid signature", async () => {
    const env = await setup();
    const order = await placeOnline(env);
    process.env["PAYSTACK_SECRET_KEY"] = "sk_test_webhook";

    const body = JSON.stringify({
      event: "charge.success",
      data: {
        status: "success",
        reference: order.reference,
        amount: Math.round(order.total * 100),
        currency: "GHS",
        channel: "card",
      },
    });

    expect((await post(env, body, null)).status).toBe(401);
    expect((await post(env, body, "deadbeef")).status).toBe(401);
    expect((await post(env, body, await sign(body, "sk_test_wrong"))).status).toBe(401);

    const row = await readOrder(env, order.id);
    expect(row?.payment_status).toBe("pending");
  });

  it("accepts the signature but refuses the wrong money", async () => {
    const env = await setup();
    const order = await placeOnline(env);
    process.env["PAYSTACK_SECRET_KEY"] = "sk_test_webhook";

    const body = JSON.stringify({
      event: "charge.success",
      data: {
        status: "success",
        reference: order.reference,
        amount: 5, // pesewas — nowhere near the locked amount
        currency: "GHS",
        channel: "card",
      },
    });
    const response = await post(env, body, await sign(body, "sk_test_webhook"));
    expect(response.status).toBe(200); // acknowledged…
    const row = await readOrder(env, order.id);
    expect(row?.payment_status).toBe("pending"); // …but not confirmed
  });

  it("reports itself unavailable while no secret is configured", async () => {
    const env = await setup();
    const response = await post(env, JSON.stringify({ event: "charge.success" }), "anything");
    expect(response.status).toBe(503);
  });
});

describe("payments.initialize / payments.verify — the gateway conversation", () => {
  /** A well-formed `/transaction/initialize` answer echoing our reference. */
  const initialized = (reference: string) =>
    new Response(
      JSON.stringify({
        status: true,
        data: {
          authorization_url: "https://checkout.paystack.com/unit-test",
          access_code: "unit_access",
          reference,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  it("opens the hosted checkout with the order's locked pesewas amount, then resumes", async () => {
    process.env["PAYSTACK_SECRET_KEY"] = "sk_test_unit";
    const env = await setup();
    const order = await placeOnline(env);
    const stored = await readOrder(env, order.id);

    fetchSpy.mockResolvedValueOnce(initialized(order.reference));
    const opened = await env.customer.action(api.payments.initialize, {
      reference: order.reference,
    });
    expect(opened.authorization_url).toBe("https://checkout.paystack.com/unit-test");

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/transaction/initialize");
    const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
    // The browser never supplies money — the body carries the server's lock.
    expect(body["amount"]).toBe(stored?.payment_amount_pesewas);
    expect(body["currency"]).toBe("GHS");
    expect(body["reference"]).toBe(order.reference);

    // Tapping back out of Paystack and in again resumes the same session
    // rather than starting a second checkout (and a second hold).
    const again = await env.customer.action(api.payments.initialize, {
      reference: order.reference,
    });
    expect(again.authorization_url).toBe("https://checkout.paystack.com/unit-test");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("confirms the order when the verified charge matches, and stays idempotent", async () => {
    process.env["PAYSTACK_SECRET_KEY"] = "sk_test_unit";
    const env = await setup();
    const order = await placeOnline(env);
    const stored = await readOrder(env, order.id);

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: true,
          data: {
            status: "success",
            reference: order.reference,
            amount: stored?.payment_amount_pesewas,
            currency: "GHS",
            channel: "card",
            paid_at: new Date().toISOString(),
            id: 987654,
            authorization: { authorization_code: "AUTH_unit" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const paid = await env.t.action(api.payments.verify, { reference: order.reference });
    await drain(env);
    expect(paid.state).toBe("paid");
    expect(paid.receipt?.payment_status).toBe("confirmed");

    const after = await readOrder(env, order.id);
    expect(after?.payment_status).toBe("confirmed");
    expect(after?.paid_at).toBeTypeOf("number");

    // A second verify finds the order already confirmed and asks the gateway
    // nothing — money can never be recorded twice.
    fetchSpy.mockClear();
    const again = await env.t.action(api.payments.verify, { reference: order.reference });
    expect(again.state).toBe("paid");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
