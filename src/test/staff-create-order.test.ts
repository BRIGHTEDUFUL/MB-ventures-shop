// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

/**
 * `orders.staffCreate` — the counter door for WhatsApp, phone and walk-in
 * sales — plus the permission/reporting surface around it. The invariants
 * under test:
 *
 * - the permission floor is **staff**, not admin (`orders.create`), and an
 *   explicit override can still take it away;
 * - the server prices every line, books the (zero) delivery fee and holds the
 *   stock inside one transaction, exactly like `orders.place`;
 * - a discount needs `orders.discount`, is bounded by the server-priced
 *   subtotal, and lands in the total and on the timeline;
 * - a hold is released once on cancellation and committed once on completion;
 * - the counter door stays open when the storefront's ordering switch is off;
 * - counter sales land in the dashboard totals, while a staff member whose
 *   `reports.view` was revoked keeps the orders screen (the reduced dashboard
 *   reads `orders.staffList`, never `stats.overview`).
 *
 * Everything runs offline through `convex-test`, mirroring
 * `convex-mutations.test.ts`: credentials cleared so mail stays in dry-run and
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

/** Any call at all is a bug: this pipeline must never leave the machine. */
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

type TakeArgs = FunctionArgs<typeof api.orders.staffCreate>;
type PlaceArgs = FunctionArgs<typeof api.orders.place>;

/**
 * Seeds the store with ordering open (as production is), a verified desk at a
 * price that only exists in the database, a verified chair, and three
 * accounts: a plain customer, a staff member with the default permission set
 * (the storekeeper's exact shape) and an admin.
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
    await ctx.db.patch(settings._id, { ordering_enabled: true });

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

    return { customerId, staffId, adminId, inbox: settings.email };
  });

  const customer = t.withIdentity({ subject: `${world.customerId}|test-session` });
  const staff = t.withIdentity({ subject: `${world.staffId}|test-session` });
  const admin = t.withIdentity({ subject: `${world.adminId}|test-session` });
  return { t, customer, staff, admin, ...world };
}

type Env = Awaited<ReturnType<typeof setup>>;

/** A walk-in sale: pickup, no email, taken over WhatsApp. */
const TAKEN: TakeArgs = {
  customer_name: "Yaw Owusu",
  phone: "0244556677",
  fulfillment: "pickup",
  zone: "central",
  items: [{ id: "standing-desk", quantity: 1 }],
  channel: "whatsapp",
};

const take = (overrides: Partial<TakeArgs> = {}): TakeArgs => ({ ...TAKEN, ...overrides });

/** A storefront checkout, for the `orders.place` half of the shared door. */
const CHECKOUT: PlaceArgs = {
  customer_name: "Ama Mensah",
  phone: "0241234567",
  email: "ama@example.com",
  address: "12 Abelenkpe Taxi Rank Road, Accra",
  fulfillment: "delivery",
  zone: "central",
  items: [{ id: "standing-desk", quantity: 1 }],
};

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

const ordersIn = (env: Env) => env.t.run((ctx) => ctx.db.query("orders").collect());

const orderHistory = (env: Env, orderId: string) =>
  env.t.run(async (ctx) => {
    const id = ctx.db.normalizeId("orders", orderId);
    if (id === null) return [];
    return await ctx.db
      .query("order_history")
      .withIndex("by_order", (q) => q.eq("order_id", id))
      .collect();
  });

const movements = (env: Env) => env.t.run((ctx) => ctx.db.query("inventory_history").collect());

const emailLogs = (env: Env) => env.t.run((ctx) => ctx.db.query("emailLogs").collect());

const drain = (env: Env) => env.t.finishAllScheduledFunctions(() => {});

/** The seed creates no options — the variant tests grow their own. */
async function addVariant(
  env: Env,
  over: { key: string; name: string; price?: number | null; stock?: number; visible?: boolean },
) {
  await env.t.run((ctx) =>
    ctx.db.insert("product_variants", {
      product_slug: "standing-desk",
      key: over.key,
      name: over.name,
      options: { Colour: over.name },
      ...(over.price === undefined ? {} : { price: over.price }),
      stock: over.stock ?? 3,
      sort_order: 1,
      visible: over.visible ?? true,
    }),
  );
}

const readVariant = (env: Env, slug: string, key: string) =>
  env.t.run(async (ctx) => {
    const row = await ctx.db
      .query("product_variants")
      .withIndex("by_product_key", (q) => q.eq("product_slug", slug).eq("key", key))
      .unique();
    if (row === null) throw new Error(`variant ${key} not found`);
    return row;
  });

describe("orders.staffCreate — what the counter records", () => {
  it("prices on the server, holds one unit and names who took the order", async () => {
    const env = await setup();
    const order = await env.staff.mutation(api.orders.staffCreate, take());

    expect(order.reference).toMatch(/^MB-[0-9A-F]{16}$/);
    expect(order).toMatchObject({
      status: "received",
      payment_status: "pending",
      payment_method: "pay_at_store",
      fulfillment: "pickup",
      channel: "whatsapp",
      created_by_name: "Kofi Boateng",
      subtotal: 999.99,
      delivery_fee: 0,
      discount: 0,
      total: 999.99,
    });
    // A walk-in belongs to nobody's login — the seller is `created_by`.
    expect(order.user_id).toBeNull();
    // The browser sent ids and quantities only; every cedi is the database's.
    expect(order.items).toEqual([
      {
        id: "standing-desk",
        name: "Electric sit-stand desk",
        price: 999.99,
        quantity: 1,
        image_key: "desk",
      },
    ]);

    // Held, not gone: one unit leaves the shelf-available count, the promise
    // sits in `reserved`, and on-hand (50) is unchanged until it ships.
    expect(await readProduct(env, "standing-desk")).toMatchObject({ stock: 49, reserved: 1 });

    const raw = await readOrder(env, order.id);
    expect(raw?.created_by).toBe(env.staffId);
    expect(raw?.stock_state).toBe("reserved");

    const ledger = await movements(env);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      product_slug: "standing-desk",
      movement_type: "reserve",
      source: "attendant",
      actor_id: env.staffId,
      reference: order.reference,
      reason: `Sold on order ${order.reference}`,
      previous_stock: 50,
      new_stock: 49,
    });

    const history = await orderHistory(env, order.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.note).toBe(
      "Order taken from WhatsApp. Pay at the shop when the customer collects.",
    );
    expect(history[0]?.actor_id).toBe(env.staffId);
  });

  it("books no delivery fee in any zone — the rider is paid directly", async () => {
    const env = await setup();
    const delivery = (zone: "central" | "greater" | "nationwide") =>
      env.staff.mutation(
        api.orders.staffCreate,
        take({
          fulfillment: "delivery",
          zone,
          address: "12 Abelenkpe Taxi Rank Road, Accra",
        }),
      );

    // The method defaults from fulfilment — no card fields, no gateway — and
    // no zone adds a cedi: the shop does not deliver, riders bill the
    // customer themselves, so the total is the subtotal everywhere.
    const central = await delivery("central");
    expect(central).toMatchObject({
      subtotal: 999.99,
      delivery_fee: 0,
      total: 999.99,
      payment_method: "cod",
    });
    const greater = await delivery("greater");
    expect(greater).toMatchObject({ delivery_fee: 0, total: 999.99 });
    const nationwide = await delivery("nationwide");
    expect(nationwide).toMatchObject({ delivery_fee: 0, total: 999.99 });

    // A big basket behaves exactly the same way — nothing threshold-shaped
    // is left in the rules.
    const bulk = await env.staff.mutation(
      api.orders.staffCreate,
      take({
        fulfillment: "delivery",
        zone: "nationwide",
        address: "12 Abelenkpe Taxi Rank Road, Accra",
        items: [{ id: "standing-desk", quantity: 6 }],
      }),
    );
    expect(bulk).toMatchObject({ subtotal: 5999.94, delivery_fee: 0, total: 5999.94 });

    // Nine units promised: three single desks, one bulk order of six.
    expect(await readProduct(env, "standing-desk")).toMatchObject({ stock: 41, reserved: 9 });
  });

  it("records money already received at the counter", async () => {
    const env = await setup();
    const order = await env.staff.mutation(
      api.orders.staffCreate,
      take({ payment_method: "momo", payment_status: "confirmed" }),
    );

    expect(order.payment_status).toBe("confirmed");
    // Offline money has no gateway timestamp — that field is Paystack's.
    expect(order.paid_at).toBeNull();

    const history = await orderHistory(env, order.id);
    expect(history.map((row) => row.note)).toEqual([
      "Order taken from WhatsApp. Mobile Money received at the counter.",
      "Payment: confirmed · Received when the order was taken.",
    ]);
    expect(history.every((row) => row.actor_id === env.staffId)).toBe(true);
  });

  it("keeps the customer's promise on the timeline", async () => {
    const env = await setup();
    const order = await env.staff.mutation(
      api.orders.staffCreate,
      take({ note: "Collecting Saturday morning — promised to pay on collection." }),
    );

    const history = await orderHistory(env, order.id);
    expect(history.map((row) => row.note)).toEqual([
      "Order taken from WhatsApp. Pay at the shop when the customer collects.",
      "Collecting Saturday morning — promised to pay on collection.",
    ]);
    expect(history[1]?.actor_id).toBe(env.staffId);
  });
});

describe("orders.staffCreate — stock, exactly once", () => {
  it("returns the units to the shelf once on cancellation, never twice", async () => {
    const env = await setup();
    const order = await env.staff.mutation(
      api.orders.staffCreate,
      take({ items: [{ id: "standing-desk", quantity: 2 }] }),
    );
    expect(await readProduct(env, "standing-desk")).toMatchObject({ stock: 48, reserved: 2 });

    await env.staff.mutation(api.orders.staffUpdate, {
      id: order.id,
      status: "cancelled",
      payment: "pending",
      note: "Customer changed their mind",
    });
    expect(await readProduct(env, "standing-desk")).toMatchObject({ stock: 50, reserved: 0 });

    const ledger = await movements(env);
    expect(ledger.map((row) => row.movement_type)).toEqual(["reserve", "release"]);
    expect(ledger[1]).toMatchObject({
      source: "order",
      new_stock: 50,
      actor_id: env.staffId,
      reference: order.reference,
    });

    // Cancelling the already-cancelled order must not mint a second restock.
    await env.staff.mutation(api.orders.staffUpdate, {
      id: order.id,
      status: "cancelled",
      payment: "pending",
    });
    expect(await readProduct(env, "standing-desk")).toMatchObject({ stock: 50, reserved: 0 });
    expect(await movements(env)).toHaveLength(2);
  });

  it("commits the hold once when the order is completed, then locks it", async () => {
    const env = await setup();
    const order = await env.staff.mutation(api.orders.staffCreate, take());

    await env.staff.mutation(api.orders.staffUpdate, {
      id: order.id,
      status: "completed",
      payment: "confirmed",
    });

    // The goods left: the available count stays down, the promise is spent.
    expect(await readProduct(env, "standing-desk")).toMatchObject({ stock: 49, reserved: 0 });
    const ledger = await movements(env);
    expect(ledger.map((row) => row.movement_type)).toEqual(["reserve", "commit"]);
    expect((await readOrder(env, order.id))?.stock_state).toBe("committed");

    // A closed order cannot be cancelled afterwards — no phantom restock.
    await expectConvexError(
      env.staff.mutation(api.orders.staffUpdate, {
        id: order.id,
        status: "cancelled",
        payment: "confirmed",
      }),
      /This order is closed/,
    );
    expect(await readProduct(env, "standing-desk")).toMatchObject({ stock: 49, reserved: 0 });
    expect(await movements(env)).toHaveLength(2);
  });

  it("refuses to sell what the shelf has not got", async () => {
    const env = await setup();
    // Only three left — the fourth unit does not exist, whatever the form says.
    await patchProduct(env, "standing-desk", { stock: 3 });
    await expectConvexError(
      env.staff.mutation(
        api.orders.staffCreate,
        take({ items: [{ id: "standing-desk", quantity: 4 }] }),
      ),
      /An item is not available. Please check your order/,
    );

    expect(await readProduct(env, "standing-desk")).toMatchObject({ stock: 3 });
    expect(await ordersIn(env)).toHaveLength(0);
    expect(await movements(env)).toHaveLength(0);
  });
});

describe("orders.staffCreate — who is allowed to record one", () => {
  it("refuses visitors, customers and anyone whose orders.create was revoked", async () => {
    const env = await setup();
    await expectConvexError(env.t.mutation(api.orders.staffCreate, take()), /Please sign in/);
    await expectConvexError(
      env.customer.mutation(api.orders.staffCreate, take()),
      /Staff access required/,
    );

    await env.admin.mutation(api.users.setPermission, {
      user_id: env.staffId,
      permission: "orders.create",
      granted: false,
    });

    const denied = await capture(env.staff.mutation(api.orders.staffCreate, take()));
    expect(denied).toBeInstanceOf(ConvexError);
    expect((denied as ConvexError<{ code: string }>).data.code).toBe("PERMISSION_DENIED");
    expect((denied as ConvexError<{ message: string }>).data.message).toBe(
      "You do not have permission to record orders at the counter.",
    );
    expect(await env.staff.query(api.users.myPermissions, {})).not.toContain("orders.create");

    // Nothing was written on the way through.
    expect(await ordersIn(env)).toHaveLength(0);
    expect(await movements(env)).toHaveLength(0);
  });

  it("lets a plain attendant record one — the floor is staff, not admin", async () => {
    const env = await setup();
    const permissions = await env.staff.query(api.users.myPermissions, {});
    expect(permissions).toContain("orders.create");
    expect(permissions).toContain("orders.view");
    expect(permissions).not.toContain("team.manage");

    const asAttendant = await env.staff.mutation(api.orders.staffCreate, take());
    expect(asAttendant.created_by_name).toBe("Kofi Boateng");

    const asAdmin = await env.admin.mutation(
      api.orders.staffCreate,
      take({ channel: "phone", customer_name: "Abena Kojo", phone: "0201112233" }),
    );
    expect(asAdmin.created_by_name).toBe("Akua Adjei");
    expect(asAdmin.channel).toBe("phone");
  });

  it("stays open when the storefront ordering switch is off", async () => {
    const env = await setup();
    await patchSettings(env, { ordering_enabled: false });

    // The shopper's door closes…
    await expectConvexError(
      env.customer.mutation(api.orders.place, CHECKOUT),
      /Ordering is not open yet/,
    );

    // …while a sale that already happened at the counter is still written down.
    const order = await env.staff.mutation(api.orders.staffCreate, take());
    expect(order.reference).toMatch(/^MB-/);
    expect(await readProduct(env, "standing-desk")).toMatchObject({ stock: 49, reserved: 1 });
  });
});

describe("orders.staffCreate — validation", () => {
  it("rejects malformed payloads without touching stock or writing an order", async () => {
    const env = await setup();

    await expectConvexError(
      env.staff.mutation(api.orders.staffCreate, take({ customer_name: "A" })),
      /Enter the customer's name and phone number/,
    );
    await expectConvexError(
      env.staff.mutation(api.orders.staffCreate, take({ phone: "123" })),
      /Enter the customer's name and phone number/,
    );
    await expectConvexError(
      env.staff.mutation(api.orders.staffCreate, take({ email: "yaw@@example" })),
      /Enter a valid email address, or leave it blank/,
    );
    await expectConvexError(
      env.staff.mutation(api.orders.staffCreate, take({ items: [] })),
      /Add at least one item to the order/,
    );
    await expectConvexError(
      env.staff.mutation(
        api.orders.staffCreate,
        take({ items: [{ id: "standing-desk", quantity: 0 }] }),
      ),
      /Invalid quantity/,
    );
    await expectConvexError(
      env.staff.mutation(api.orders.staffCreate, take({ fulfillment: "delivery", address: "" })),
      /Enter a delivery address/,
    );
    // The three offline methods each describe exactly one way to fulfil.
    await expectConvexError(
      env.staff.mutation(
        api.orders.staffCreate,
        take({
          fulfillment: "delivery",
          address: "12 Abelenkpe Taxi Rank Road, Accra",
          payment_method: "pay_at_store",
        }),
      ),
      /Pay at the shop only applies to pickup orders/,
    );
    await expectConvexError(
      env.staff.mutation(api.orders.staffCreate, take({ payment_method: "cod" })),
      /Cash on delivery only applies to delivery orders/,
    );
    await expectConvexError(
      env.staff.mutation(api.orders.staffCreate, take({ note: "x".repeat(501) })),
      /Keep the note under 500 characters/,
    );
    await expectConvexError(
      env.staff.mutation(
        api.orders.staffCreate,
        take({ items: [{ id: "ghost-product", quantity: 1 }] }),
      ),
      /An item is not available. Please check your order/,
    );

    // None of the refusals left a number moved or a row behind. The seed
    // writes no `reserved` field at all, so absence is the zero here.
    expect(await readProduct(env, "standing-desk")).toMatchObject({ stock: 50 });
    expect(await ordersIn(env)).toHaveLength(0);
    expect(await movements(env)).toHaveLength(0);
  });

  it("refuses the two choices the counter must never make", async () => {
    const env = await setup();

    // Paystack money only ever comes from the customer's own hosted checkout,
    // and `online` is stamped by `orders.place` — neither is an alternative in
    // the counter's argument validators. The casts below exist purely to prove
    // the server says no.
    const paystackAttempt = {
      ...take(),
      payment_method: "paystack",
    } as unknown as TakeArgs;
    await expect(env.staff.mutation(api.orders.staffCreate, paystackAttempt)).rejects.toThrow();

    const onlineAttempt = { ...take(), channel: "online" } as unknown as TakeArgs;
    await expect(env.staff.mutation(api.orders.staffCreate, onlineAttempt)).rejects.toThrow();

    expect(await ordersIn(env)).toHaveLength(0);
  });
});

describe("orders.staffCreate — the staff discount", () => {
  it("takes a flat GH₵ off the order and says so on the timeline", async () => {
    const env = await setup();
    const order = await env.staff.mutation(api.orders.staffCreate, take({ discount: 150 }));

    expect(order).toMatchObject({
      subtotal: 999.99,
      delivery_fee: 0,
      discount: 150,
      total: 849.99,
    });

    const raw = await readOrder(env, order.id);
    expect(raw?.discount).toBe(150);
    expect(raw?.total).toBe(849.99);

    const history = await orderHistory(env, order.id);
    expect(history.map((row) => row.note)).toEqual([
      "Order taken from WhatsApp. Pay at the shop when the customer collects.",
      "Discount of GH₵ 150 applied.",
    ]);
    expect(history[1]?.actor_id).toBe(env.staffId);

    // The money side never touches the shelf: one unit held, nothing else.
    expect(await readProduct(env, "standing-desk")).toMatchObject({ stock: 49, reserved: 1 });
  });

  it("rounds a fractional discount to two decimals before storing it", async () => {
    const env = await setup();
    const order = await env.staff.mutation(api.orders.staffCreate, take({ discount: 12.345 }));

    expect(order).toMatchObject({ subtotal: 999.99, discount: 12.35, total: 987.64 });
    const history = await orderHistory(env, order.id);
    expect(history.map((row) => row.note)).toContain("Discount of GH₵ 12.35 applied.");
  });

  it("counts the discounted total in the day's takings", async () => {
    const env = await setup();
    const order = await env.staff.mutation(
      api.orders.staffCreate,
      take({ payment_method: "momo", payment_status: "confirmed", discount: 150 }),
    );
    expect(order).toMatchObject({ subtotal: 999.99, discount: 150, total: 849.99 });

    // The dashboard sums `total`, so the discount flows into it for free.
    const overview = await env.staff.query(api.stats.overview, {});
    expect(overview.orders).toMatchObject({ today: 1, today_revenue: 849.99 });
    expect(overview.orders.today_revenue).toBe(order.total);
  });

  it("refuses a discount bigger than the order and holds no stock", async () => {
    const env = await setup();
    const error = await capture(
      env.staff.mutation(api.orders.staffCreate, take({ discount: 1000 })),
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<{ message: string }>).data.message).toBe(
      "The discount can't be bigger than the order.",
    );

    // The refusal rolls the transaction back: no order, no hold, no ledger.
    expect(await readProduct(env, "standing-desk")).toMatchObject({ stock: 50 });
    expect(await ordersIn(env)).toHaveLength(0);
    expect(await movements(env)).toHaveLength(0);
  });

  it("refuses a negative or NaN discount without touching stock", async () => {
    const env = await setup();

    const negative = await capture(
      env.staff.mutation(api.orders.staffCreate, take({ discount: -5 })),
    );
    expect((negative as ConvexError<{ message: string }>).data.message).toBe(
      "The discount can't be negative.",
    );

    // NaN must never reach the total — the counter validation refuses it (as
    // does the argument validator if it ever got that far), hence either way.
    await expect(
      env.staff.mutation(api.orders.staffCreate, take({ discount: Number.NaN })),
    ).rejects.toThrow();

    expect(await readProduct(env, "standing-desk")).toMatchObject({ stock: 50 });
    expect(await ordersIn(env)).toHaveLength(0);
    expect(await movements(env)).toHaveLength(0);
  });

  it("needs orders.discount: on for staff by default, revocable per person", async () => {
    const env = await setup();

    // The default staff set carries it (floor: staff), so an attendant may
    // discount a sale without asking the owner.
    expect(await env.staff.query(api.users.myPermissions, {})).toContain("orders.discount");
    const allowed = await env.staff.mutation(api.orders.staffCreate, take({ discount: 100 }));
    expect(allowed).toMatchObject({ discount: 100, total: 899.99 });

    // One override later, the same attendant cannot.
    await env.admin.mutation(api.users.setPermission, {
      user_id: env.staffId,
      permission: "orders.discount",
      granted: false,
    });

    const denied = await capture(
      env.staff.mutation(
        api.orders.staffCreate,
        take({ discount: 100, customer_name: "Abena Kojo", phone: "201112233" }),
      ),
    );
    expect(denied).toBeInstanceOf(ConvexError);
    expect((denied as ConvexError<{ code: string }>).data.code).toBe("PERMISSION_DENIED");
    expect((denied as ConvexError<{ message: string }>).data.message).toBe(
      "You do not have permission to apply a discount.",
    );

    // Only the discount is gated — the same person still records a plain sale.
    const plain = await env.staff.mutation(
      api.orders.staffCreate,
      take({ channel: "walk_in", customer_name: "Abena Kojo", phone: "201112233" }),
    );
    expect(plain).toMatchObject({ discount: 0, total: 999.99 });

    // Two holds: the allowed discount and the plain order; the denial wrote none.
    expect(await movements(env)).toHaveLength(2);
    expect(await ordersIn(env)).toHaveLength(2);
  });

  it("emails a receipt that shows the discount", async () => {
    const env = await setup();
    const order = await env.staff.mutation(
      api.orders.staffCreate,
      take({ email: "yaw@example.com", discount: 150 }),
    );
    await drain(env);

    const confirmation = (await emailLogs(env)).find((row) => row.template === "order-received");
    expect(confirmation?.status).toBe("skipped_dry_run");
    expect(confirmation?.data["discount"]).toBe(150);
    expect(confirmation?.text).toContain("Discount: -GH₵ 150.00");
    expect(confirmation?.text).toContain("Subtotal: GH₵ 999.99");
    expect(confirmation?.text).toContain("Total: GH₵ 849.99");
    // This one is a pickup, so the delivery row keeps its pickup wording.
    expect(confirmation?.text).toContain("Delivery: Free (pickup)");
    expect(order).toMatchObject({ discount: 150, total: 849.99 });
  });
});

describe("orders.staffCreate — options (variants)", () => {
  it("insists on an option and prices the line from the option row", async () => {
    const env = await setup();
    await addVariant(env, { key: "black", name: "Black", price: 1200.5, stock: 3 });
    // With options, the product's own count is the derived sum of them.
    await patchProduct(env, "standing-desk", { stock: 3 });

    // No picker: refused before any money or stock is decided.
    await expectConvexError(
      env.staff.mutation(api.orders.staffCreate, take()),
      /Please select an option before ordering/,
    );
    // A key the shop does not sell: refused too.
    await expectConvexError(
      env.staff.mutation(
        api.orders.staffCreate,
        take({ items: [{ id: "standing-desk", quantity: 1, variant_key: "gold" }] }),
      ),
      /An item is no longer available. Please check your order/,
    );

    const order = await env.staff.mutation(
      api.orders.staffCreate,
      take({ items: [{ id: "standing-desk", quantity: 2, variant_key: "black" }] }),
    );
    expect(order.items).toEqual([
      {
        id: "standing-desk",
        name: "Electric sit-stand desk — Black",
        price: 1200.5,
        quantity: 2,
        image_key: "desk",
        variant_key: "black",
        variant_name: "Black",
      },
    ]);
    expect(order).toMatchObject({ subtotal: 2401, delivery_fee: 0, total: 2401 });

    // The hold lands on the option, and the product carries the derived sum.
    expect(await readVariant(env, "standing-desk", "black")).toMatchObject({
      stock: 1,
      reserved: 2,
    });
    expect(await readProduct(env, "standing-desk")).toMatchObject({ stock: 1, reserved: 2 });

    const ledger = await movements(env);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      variant_key: "black",
      variant_name: "Black",
      previous_stock: 3,
      new_stock: 1,
      movement_type: "reserve",
      source: "attendant",
      actor_id: env.staffId,
    });
  });

  it("refuses hidden options and products pulled from sale, like checkout", async () => {
    const env = await setup();
    await addVariant(env, { key: "gold", name: "Gold", stock: 3, visible: false });
    await expectConvexError(
      env.staff.mutation(
        api.orders.staffCreate,
        take({ items: [{ id: "standing-desk", quantity: 1, variant_key: "gold" }] }),
      ),
      /An item is no longer available. Please check your order/,
    );

    // An unverified sample and a hidden demo product are equally unbuyable at
    // the counter — the same `verified && isListed` rule checkout applies.
    await patchProduct(env, "ergonomic-chair", { verified: false });
    await expectConvexError(
      env.staff.mutation(
        api.orders.staffCreate,
        take({ items: [{ id: "ergonomic-chair", quantity: 1 }] }),
      ),
      /An item is not available. Please check your order/,
    );
    await patchProduct(env, "ergonomic-chair", { verified: true, visible: false });
    await expectConvexError(
      env.staff.mutation(
        api.orders.staffCreate,
        take({ items: [{ id: "ergonomic-chair", quantity: 1 }] }),
      ),
      /An item is not available. Please check your order/,
    );

    expect(await ordersIn(env)).toHaveLength(0);
    expect(await movements(env)).toHaveLength(0);
  });
});

describe("orders.staffCreate — reporting and search", () => {
  it("counts counter sales in the day's dashboard totals", async () => {
    const env = await setup();
    const order = await env.staff.mutation(
      api.orders.staffCreate,
      take({ payment_method: "momo", payment_status: "confirmed" }),
    );

    const overview = await env.staff.query(api.stats.overview, {});
    expect(overview.orders).toMatchObject({
      today: 1,
      today_revenue: order.total,
      awaiting_payment: 0,
      active: 1,
      total: 1,
    });
    expect(overview.recent_orders[0]).toMatchObject({
      reference: order.reference,
      channel: "whatsapp",
      created_by_name: "Kofi Boateng",
    });
  });

  it("keeps every order screen alive when reports.view is revoked", async () => {
    const env = await setup();
    const order = await env.staff.mutation(api.orders.staffCreate, take());

    await env.admin.mutation(api.users.setPermission, {
      user_id: env.staffId,
      permission: "reports.view",
      granted: false,
    });

    const permissions = await env.staff.query(api.users.myPermissions, {});
    expect(permissions).not.toContain("reports.view");
    // The rest of the counter set is untouched — this is a reporting revocation.
    expect(permissions).toContain("orders.create");
    expect(permissions).toContain("orders.view");

    // The reports themselves say no, by name…
    await expectConvexError(env.staff.query(api.stats.overview, {}), /permission to view reports/);
    await expectConvexError(env.staff.query(api.stats.trends, {}), /permission to view reports/);

    // …while the orders feed and the counter door carry on regardless, which
    // is what the reduced dashboard on /staff is built from.
    const listed = await env.staff.query(api.orders.staffList, {});
    expect(listed.map((row) => row.reference)).toContain(order.reference);
    const second = await env.staff.mutation(
      api.orders.staffCreate,
      take({ channel: "walk_in", customer_name: "Abena Kojo", phone: "0201112233" }),
    );
    expect(second.created_by_name).toBe("Kofi Boateng");
  });

  it("finds a day's WhatsApp orders by channel and shows who took them", async () => {
    const env = await setup();
    const whatsapp = await env.staff.mutation(api.orders.staffCreate, take());
    await env.staff.mutation(
      api.orders.staffCreate,
      take({ channel: "walk_in", customer_name: "Abena Kojo", phone: "0201112233" }),
    );

    const found = await env.staff.query(api.orders.staffList, { q: "whatsapp" });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      reference: whatsapp.reference,
      channel: "whatsapp",
      created_by_name: "Kofi Boateng",
    });
  });
});

describe("orders.staffCreate — notifications", () => {
  it("alerts the shop without emailing a walk-in who left no address", async () => {
    const env = await setup();
    await env.staff.mutation(api.orders.staffCreate, take()); // no email
    await drain(env);

    const rows = await emailLogs(env);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ template: "admin-new-order", to: env.inbox });
    // Scheduling to "" would only have earned a failed row — never one here.
    expect(rows.some((row) => row.template === "order-received")).toBe(false);
    expect(rows.some((row) => row.status === "failed")).toBe(false);
  });

  it("sends the confirmation when the order does carry an address", async () => {
    const env = await setup();
    const order = await env.staff.mutation(
      api.orders.staffCreate,
      take({ email: "yaw@example.com" }),
    );
    await drain(env);

    const rows = await emailLogs(env);
    expect(rows).toHaveLength(2);

    const confirmation = rows.find((row) => row.template === "order-received");
    expect(confirmation?.to).toBe("yaw@example.com");
    expect(confirmation?.status).toBe("skipped_dry_run");
    expect(confirmation?.subject).toMatch(/^Order MB-[0-9A-F]+ received$/);
    expect(confirmation?.order_id).toBeTruthy();

    const alert = rows.find((row) => row.template === "admin-new-order");
    expect(alert?.to).toBe(env.inbox);
    expect(order.reference).toMatch(/^MB-/);
  });
});

describe("orders.place — the other side of the shared door", () => {
  it("stamps every storefront checkout as an online order", async () => {
    const env = await setup();
    const order = await env.customer.mutation(api.orders.place, CHECKOUT);

    expect(order).toMatchObject({
      channel: "online",
      user_id: env.customerId,
      created_by_name: null,
      subtotal: 999.99,
      // Checkout never charges delivery and never takes a discount: the
      // total is the subtotal, and the discount field is not even an
      // argument of `orders.place` (the test below proves it structurally).
      delivery_fee: 0,
      discount: 0,
      total: 999.99,
    });

    const raw = await readOrder(env, order.id);
    expect(raw?.channel).toBe("online");
    expect(raw?.created_by).toBeUndefined();
    expect(raw?.stock_state).toBe("reserved");
    // Same shelf effect as a counter sale — one shared `holdLines`.
    expect(await readProduct(env, "standing-desk")).toMatchObject({ stock: 49, reserved: 1 });
  });

  it("structurally refuses a discount — checkout has no such argument", async () => {
    const env = await setup();
    // The cast exists purely to prove the server says no: `discount` is not
    // in `checkoutArgs`, so the argument validator rejects it outright.
    const withDiscount = { ...CHECKOUT, discount: 50 } as unknown as PlaceArgs;
    await expect(env.customer.mutation(api.orders.place, withDiscount)).rejects.toThrow();

    expect(await ordersIn(env)).toHaveLength(0);
    expect(await readProduct(env, "standing-desk")).toMatchObject({ stock: 50 });
    expect(await movements(env)).toHaveLength(0);
  });
});

describe("legacy orders — a stored delivery fee still reads back", () => {
  it("keeps exposing delivery_fee: 30 through the DTO, the feed and the receipt", async () => {
    const env = await setup();
    // An order written while the shop still charged for delivery.
    const legacyId = await env.t.run((ctx) =>
      ctx.db.insert("orders", {
        reference: "MB-0000000000000001",
        customer_name: "Ama Mensah",
        email: "ama@example.com",
        phone: "0241234567",
        address: "12 Abelenkpe Taxi Rank Road, Accra",
        fulfillment: "delivery",
        zone: "central",
        payment_method: "cod",
        payment_status: "confirmed",
        status: "completed",
        subtotal: 100,
        delivery_fee: 30,
        total: 130,
        items: [
          {
            id: "standing-desk",
            name: "Electric sit-stand desk",
            price: 100,
            quantity: 1,
            image_key: "desk",
          },
        ],
      }),
    );

    const [listed] = await env.staff.query(api.orders.staffList, {});
    expect(listed).toMatchObject({
      id: legacyId,
      subtotal: 100,
      delivery_fee: 30,
      // A row from before the feature simply reads as "no discount".
      discount: 0,
      total: 130,
    });

    const receipt = await env.t.query(api.orders.track, {
      ref: "MB-0000000000000001",
      customer_phone: "0241234567",
    });
    expect(receipt).toMatchObject({ delivery_fee: 30, discount: 0, total: 130 });
  });
});
