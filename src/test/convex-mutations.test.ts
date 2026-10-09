// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

/**
 * Transactional coverage of the order pipeline against the real Convex
 * functions (`orders.place`, `orders.track`, `orders.staffUpdate`) through
 * `convex-test`, mirroring the conventions of `email-pipeline.test.ts`.
 *
 * Everything stays offline: the email side-effects that order mutations
 * schedule are forced into dry-run mode (credentials are cleared below) and
 * `fetch` is stubbed so any accidental network call fails loudly.
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
] as const;

/** Any call at all is a bug: the order pipeline must never leave the machine. */
const fetchSpy = vi.fn(async () => {
  throw new Error("This suite must never reach the network.");
});

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

/**
 * Seeds the store: ordering open, MoMo recipient on file, one verified
 * product whose price only exists in the database (the checkout payload
 * carries ids and quantities — never a price), plus a customer, a staff
 * member and an admin.
 */
async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.seed, {});

  const world = await t.run(async (ctx) => {
    const desk = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", "standing-desk"))
      .unique();
    const chair = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", "ergonomic-chair"))
      .unique();
    if (desk === null || chair === null) throw new Error("seed did not create the sample products");
    await ctx.db.patch(desk._id, { verified: true, stock: 50, price: 999.99 });
    await ctx.db.patch(chair._id, { verified: true, stock: 10 });

    const settings = await ctx.db.query("store_settings").unique();
    if (settings === null) throw new Error("seed did not create settings");
    await ctx.db.patch(settings._id, {
      ordering_enabled: true,
      momo_number: "0241234567",
      momo_name: "MB Ventures GH",
    });

    const customerId = await ctx.db.insert("users", {
      name: "Ama Mensah",
      email: "ama@example.com",
      phone: "0241234567",
    });
    const staffId = await ctx.db.insert("users", {
      name: "Kofi Boateng",
      email: "kofi@example.com",
      phone: "0240001111",
    });
    await ctx.db.insert("user_roles", { user_id: staffId, role: "staff" });
    const adminId = await ctx.db.insert("users", { name: "Akua Adjei", email: "akua@example.com" });
    await ctx.db.insert("user_roles", { user_id: adminId, role: "admin" });

    return { customerId, staffId, adminId };
  });

  const customer = t.withIdentity({ subject: `${world.customerId}|test-session` });
  const staff = t.withIdentity({ subject: `${world.staffId}|test-session` });
  const admin = t.withIdentity({ subject: `${world.adminId}|test-session` });
  return { t, customer, staff, admin, ...world };
}

type Env = Awaited<ReturnType<typeof setup>>;

const DEFAULT_CHECKOUT: PlaceArgs = {
  customer_name: "Ama Mensah",
  phone: "0241234567",
  email: "ama@example.com",
  address: "12 Abelenkpe Taxi Rank Road, Accra",
  fulfillment: "delivery",
  zone: "central",
  payment_method: "momo",
  provider: "MTN MoMo",
  transaction_reference: "MP2610001234",
  items: [{ id: "standing-desk", quantity: 2 }],
};

const checkout = (overrides: Partial<PlaceArgs> = {}): PlaceArgs => ({
  ...DEFAULT_CHECKOUT,
  ...overrides,
});

const drain = (env: Env) => env.t.finishAllScheduledFunctions(() => {});

/** Places an order as the signed-in customer and drains its email side-effects. */
async function placeOrder(env: Env, overrides: Partial<PlaceArgs> = {}) {
  const order = await env.customer.mutation(api.orders.place, checkout(overrides));
  await drain(env);
  return order;
}

/** Returns the rejection instead of failing the assertion, for inspection. */
async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to fail, but it resolved");
}

/**
 * Asserts the caller receives a `ConvexError` and that its human-readable
 * `data.message` survived the trip out of the transaction.
 */
async function expectConvexError(promise: Promise<unknown>, expected: RegExp) {
  const error = await capture(promise);
  expect(error).toBeInstanceOf(ConvexError);
  expect((error as ConvexError<{ message: string }>).data.message).toMatch(expected);
}

const readProduct = (env: Env, slug: string) =>
  env.t.run(async (ctx) => {
    const product = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (product === null) throw new Error(`product ${slug} not found`);
    return product;
  });

const patchProduct = (env: Env, slug: string, patch: Partial<Doc<"products">>) =>
  env.t.run(async (ctx) => {
    const product = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (product === null) throw new Error(`product ${slug} not found`);
    await ctx.db.patch(product._id, patch);
  });

const patchSettings = (env: Env, patch: Partial<Doc<"store_settings">>) =>
  env.t.run(async (ctx) => {
    const settings = await ctx.db.query("store_settings").unique();
    if (settings === null) throw new Error("store settings row is missing");
    await ctx.db.patch(settings._id, patch);
  });

const readOrder = (env: Env, id: string) =>
  env.t.run(async (ctx) => {
    const orderId = ctx.db.normalizeId("orders", id);
    if (orderId === null) throw new Error("order id is malformed");
    return await ctx.db.get(orderId);
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

const ordersIn = (env: Env) => env.t.run((ctx) => ctx.db.query("orders").collect());

const inventoryLog = (env: Env) => env.t.run((ctx) => ctx.db.query("inventory_history").collect());

describe("orders.place — authoritative checkout", () => {
  it("prices from the database, decrements stock and opens the timeline", async () => {
    const env = await setup();
    const order = await placeOrder(env);

    expect(order.reference).toMatch(/^MB-[0-9A-F]{16}$/);
    expect(order.status).toBe("received");
    expect(order.payment_status).toBe("pending");
    expect(order.user_id).toBe(env.customerId);
    expect(order.items).toEqual([
      {
        id: "standing-desk",
        name: "Electric sit-stand desk",
        price: 999.99,
        quantity: 2,
        image_key: "desk",
      },
    ]);
    expect(order.subtotal).toBe(1999.98);
    expect(order.delivery_fee).toBe(30);
    expect(order.total).toBe(2029.98);

    expect((await readProduct(env, "standing-desk")).stock).toBe(48);

    const history = await orderHistory(env, order.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ status: "received" });
    expect(history[0]?.note).toContain("Order received");
    expect(history[0]?.actor_id).toBeUndefined();

    const movements = await inventoryLog(env);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      product_slug: "standing-desk",
      previous_stock: 50,
      new_stock: 48,
      reason: `Sold on order ${order.reference}`,
    });
    expect(movements[0]?.actor_id).toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("hands the caller a ConvexError while the ordering switch is off", async () => {
    const env = await setup();
    await patchSettings(env, { ordering_enabled: false });

    const error = await capture(env.customer.mutation(api.orders.place, checkout()));
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<{ message: string }>).data.message).toBe(
      "Ordering is not open yet. Contact the Abelenkpe shop.",
    );

    expect(await ordersIn(env)).toHaveLength(0);
    expect((await readProduct(env, "standing-desk")).stock).toBe(50);
  });

  it("refuses a product the shop has not verified", async () => {
    const env = await setup();
    await patchProduct(env, "standing-desk", { verified: false });

    await expectConvexError(
      env.customer.mutation(api.orders.place, checkout()),
      /An item is not available/,
    );

    expect(await ordersIn(env)).toHaveLength(0);
    expect((await readProduct(env, "standing-desk")).stock).toBe(50);
    expect(await inventoryLog(env)).toHaveLength(0);
  });

  it("refuses to oversell the last unit", async () => {
    const env = await setup();
    await patchProduct(env, "standing-desk", { stock: 1 });

    await expectConvexError(
      env.customer.mutation(
        api.orders.place,
        checkout({ items: [{ id: "standing-desk", quantity: 2 }] }),
      ),
      /An item is not available/,
    );

    expect((await readProduct(env, "standing-desk")).stock).toBe(1);
    expect(await ordersIn(env)).toHaveLength(0);
  });

  it("rolls the whole cart back when a later line fails", async () => {
    const env = await setup();
    await patchProduct(env, "ergonomic-chair", { stock: 1 });

    await expectConvexError(
      env.customer.mutation(
        api.orders.place,
        checkout({
          items: [
            { id: "standing-desk", quantity: 1 },
            { id: "ergonomic-chair", quantity: 2 },
          ],
        }),
      ),
      /An item is not available/,
    );

    // The desk line had already been decremented inside the same transaction;
    // a failed checkout may not leave a partial sale behind.
    expect((await readProduct(env, "standing-desk")).stock).toBe(50);
    expect((await readProduct(env, "ergonomic-chair")).stock).toBe(1);
    expect(await ordersIn(env)).toHaveLength(0);
    expect(await inventoryLog(env)).toHaveLength(0);
  });

  it("rejects an empty cart and impossible quantities", async () => {
    const env = await setup();
    await expectConvexError(
      env.customer.mutation(api.orders.place, checkout({ items: [] })),
      /Your cart is empty or too large/,
    );
    for (const quantity of [0, -5, 1.5, 60]) {
      await expectConvexError(
        env.customer.mutation(
          api.orders.place,
          checkout({ items: [{ id: "standing-desk", quantity }] }),
        ),
        /Invalid quantity/,
      );
    }

    expect(await ordersIn(env)).toHaveLength(0);
    expect((await readProduct(env, "standing-desk")).stock).toBe(50);
  });

  it("requires a Mobile Money recipient before accepting a MoMo payment", async () => {
    const env = await setup();
    await patchSettings(env, { momo_number: "" });

    await expectConvexError(
      env.customer.mutation(api.orders.place, checkout()),
      /Mobile Money details or reference are missing/,
    );
    expect(await ordersIn(env)).toHaveLength(0);
  });

  it("only takes orders — and order feeds — from a signed-in account", async () => {
    const env = await setup();
    await expectConvexError(
      env.t.mutation(api.orders.place, checkout()),
      /Please sign in to continue/,
    );
    await expectConvexError(env.t.query(api.orders.mine, {}), /Please sign in to continue/);
    expect(await ordersIn(env)).toHaveLength(0);
  });
});

describe("orders.track — guest lookup by reference and phone", () => {
  it("returns the receipt with its timeline for the matching pair", async () => {
    const env = await setup();
    const order = await placeOrder(env);

    const receipt = await env.t.query(api.orders.track, {
      ref: order.reference,
      customer_phone: "0241234567",
    });
    expect(receipt).not.toBeNull();
    expect(receipt?.reference).toBe(order.reference);
    expect(receipt?.status).toBe("received");
    expect(receipt?.payment_status).toBe("pending");
    expect(receipt?.subtotal).toBe(1999.98);
    expect(receipt?.total).toBe(2029.98);
    expect(receipt?.history).toHaveLength(1);
    expect(receipt?.history?.[0]?.note).toContain("Order received");

    // Stray whitespace or casing around either half never matters.
    const loose = await env.t.query(api.orders.track, {
      ref: `  ${order.reference.toLowerCase()} `,
      customer_phone: "024 123 4567",
    });
    expect(loose?.reference).toBe(order.reference);
  });

  it("answers the same empty result whether the reference exists or not", async () => {
    const env = await setup();
    const order = await placeOrder(env);

    const wrongPhone = await env.t.query(api.orders.track, {
      ref: order.reference,
      customer_phone: "0200000000",
    });
    const wrongReference = await env.t.query(api.orders.track, {
      ref: "MB-0000000000000000",
      customer_phone: "0241234567",
    });
    const noReference = await env.t.query(api.orders.track, {
      ref: "",
      customer_phone: "0241234567",
    });
    const noPhone = await env.t.query(api.orders.track, {
      ref: order.reference,
      customer_phone: "",
    });

    // One indistinguishable answer for every failure mode: a caller can never
    // probe whether a reference is real.
    expect(wrongPhone).toBeNull();
    expect(wrongReference).toBeNull();
    expect(noReference).toBeNull();
    expect(noPhone).toBeNull();
  });
});

describe("orders.staffUpdate — staff permissions and transitions", () => {
  it("turns away guests and non-staff accounts, for writes and reads alike", async () => {
    const env = await setup();
    const order = await placeOrder(env);
    const advance = { id: order.id, status: "processing", payment: "confirmed" } as const;

    await expectConvexError(
      env.t.mutation(api.orders.staffUpdate, advance),
      /Please sign in to continue/,
    );
    await expectConvexError(
      env.customer.mutation(api.orders.staffUpdate, advance),
      /Staff access required/,
    );
    await expectConvexError(env.t.query(api.orders.staffList, {}), /Please sign in to continue/);
    await expectConvexError(
      env.customer.query(api.orders.staffGet, { id: order.id }),
      /Staff access required/,
    );

    expect((await readOrder(env, order.id))?.status).toBe("received");
    expect(await orderHistory(env, order.id)).toHaveLength(1);
  });

  it("lets staff verify payment and advance the order, recording who did it", async () => {
    const env = await setup();
    const order = await placeOrder(env);

    const result = await env.staff.mutation(api.orders.staffUpdate, {
      id: order.id,
      status: "processing",
      payment: "confirmed",
      note: "Paid at the counter",
    });
    await drain(env);
    expect(result).toEqual({ ok: true });

    const updated = await readOrder(env, order.id);
    expect(updated?.status).toBe("processing");
    expect(updated?.payment_status).toBe("confirmed");

    const history = await orderHistory(env, order.id);
    expect(history).toHaveLength(2);
    expect(history.find((entry) => entry.status === "processing")).toMatchObject({
      note: "Payment: confirmed · Paid at the counter",
      actor_id: env.staffId,
    });

    const view = await env.staff.query(api.orders.staffGet, { id: order.id });
    expect(view.order.status).toBe("processing");
    expect(view.history.map((entry) => entry.actor_name)).toContain("Kofi Boateng");
  });

  it("blocks advancing a MoMo order before the payment is verified", async () => {
    const env = await setup();
    const order = await placeOrder(env);

    await expectConvexError(
      env.staff.mutation(api.orders.staffUpdate, {
        id: order.id,
        status: "processing",
        payment: "pending",
      }),
      /Verify Mobile Money before processing/,
    );

    const unchanged = await readOrder(env, order.id);
    expect(unchanged?.status).toBe("received");
    expect(unchanged?.payment_status).toBe("pending");
    expect(await orderHistory(env, order.id)).toHaveLength(1);
  });

  it("keeps 'ready' off delivery orders", async () => {
    const env = await setup();
    const order = await placeOrder(env);

    await expectConvexError(
      env.staff.mutation(api.orders.staffUpdate, {
        id: order.id,
        status: "ready",
        payment: "confirmed",
      }),
      /Status does not match fulfillment/,
    );
    expect((await readOrder(env, order.id))?.status).toBe("received");
  });

  it("keeps a completed order closed", async () => {
    const env = await setup();
    const order = await placeOrder(env);
    await env.staff.mutation(api.orders.staffUpdate, {
      id: order.id,
      status: "completed",
      payment: "confirmed",
    });
    await drain(env);

    await expectConvexError(
      env.staff.mutation(api.orders.staffUpdate, {
        id: order.id,
        status: "processing",
        payment: "confirmed",
      }),
      /This order is closed/,
    );
    expect((await readOrder(env, order.id))?.status).toBe("completed");
  });

  it("returns stock and its audit row when staff cancel", async () => {
    const env = await setup();
    const order = await placeOrder(env);
    expect((await readProduct(env, "standing-desk")).stock).toBe(48);

    await env.staff.mutation(api.orders.staffUpdate, {
      id: order.id,
      status: "cancelled",
      payment: "pending",
    });
    await drain(env);

    expect((await readProduct(env, "standing-desk")).stock).toBe(50);
    expect((await readOrder(env, order.id))?.status).toBe("cancelled");

    const movements = await inventoryLog(env);
    expect(movements).toHaveLength(2);
    const restock = movements.find((row) => row.reason.startsWith("Restock:"));
    expect(restock).toMatchObject({
      product_slug: "standing-desk",
      previous_stock: 48,
      new_stock: 50,
      actor_id: env.staffId,
    });
    expect(restock?.reason).toContain(order.reference);
  });

  it("reports an unknown order instead of changing anything", async () => {
    const env = await setup();
    await expectConvexError(
      env.staff.mutation(api.orders.staffUpdate, {
        id: "not-an-order-id",
        status: "cancelled",
        payment: "pending",
      }),
      /Order not found/,
    );
    expect(await ordersIn(env)).toHaveLength(0);
  });
});
