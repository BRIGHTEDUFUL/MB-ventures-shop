// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

/**
 * The dashboard's two stats queries. `stats.overview` is the number strip and
 * the lists under it; `stats.trends` is the chart fuel — the 14-day till tape,
 * the pipeline breakdown, the pickup/delivery split, best sellers and the
 * week-on-week comparison the cards quote.
 *
 * Two constraints shape this file:
 *
 * - **`_creationTime` cannot be written.** Convex stamps it on insert, so the
 *   faked clock is moved instead — and only `Date` is faked, never timers, so
 *   anything Convex schedules still runs for real.
 * - **Convex-test only lets time run forward.** Its insert clamps every
 *   `_creationTime` to be strictly greater than the last one it saw, so the
 *   clock has to be rewound *before* setup writes anything, and orders then go
 *   in oldest-first. Insert a fresh order and then a backdated one and the
 *   backdated one is silently pushed up to today — which is exactly how the
 *   first draft of this suite lied about its own data.
 */
const modules = import.meta.glob("../../convex/**/*.*s");

const DAY = 86_400_000;

/**
 * The midnight every bucket in this file is measured from. Captured at import,
 * before any clock is moved, so it cannot depend on where the faked clock
 * happens to be sitting by the time a helper runs.
 */
const TODAY = (() => {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  return day.getTime();
})();

/** Belt and braces: none of these queries should ever touch the network. */
const fetchSpy = vi.fn(async () => {
  throw new Error("This suite must never reach the network.");
});

beforeEach(() => {
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  restoreClock();
  vi.unstubAllGlobals();
});

/** Back to the real clock, so the queries read "today" the way production does. */
function restoreClock(): void {
  vi.useRealTimers();
}

type OrderDoc = Doc<"orders">;

type OrderSeed = Partial<
  Pick<OrderDoc, "status" | "payment_status" | "fulfillment" | "total" | "items">
> & { ageDays?: number };

/**
 * Writes orders with `ageDays` set on each (0 = today), **oldest first** — the
 * one order convex-test will not undo. Every order lands an hour into its own
 * day, so nothing can slip across the midnight boundary the queries bucket on.
 */
async function insertOrders(
  t: ReturnType<typeof convexTest>,
  user_id: Id<"users">,
  seeds: OrderSeed[],
): Promise<void> {
  const ordered = [...seeds].sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
  for (const { ageDays = 0, ...rest } of ordered) {
    vi.setSystemTime(TODAY - ageDays * DAY + 3_600_000);
    await t.run(async (ctx) => {
      await ctx.db.insert("orders", {
        reference: `MB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        user_id,
        customer_name: "Test Customer",
        email: "customer@example.com",
        phone: "0240000000",
        address: "Abelenkpe, Accra",
        fulfillment: "pickup",
        zone: "central",
        payment_method: "pay_at_store",
        payment_status: "pending",
        status: "received",
        subtotal: 100,
        delivery_fee: 0,
        total: 100,
        items: [],
        ...rest,
      } as OrderDoc);
    });
  }
}

async function setup() {
  const t = convexTest(schema, modules);
  // Rewind before the first write — the monotonic clamp starts here.
  vi.setSystemTime(TODAY - 60 * DAY);
  await t.mutation(internal.seed.seed, {});

  const world = await t.run(async (ctx) => {
    const staffId = await ctx.db.insert("users", {
      name: "Kofi Boateng",
      email: "kofi@example.com",
    });
    await ctx.db.insert("user_roles", { user_id: staffId, role: "staff" });
    const customerId = await ctx.db.insert("users", { name: "Ama Mensah" });
    return { staffId, customerId };
  });

  const staff = t.withIdentity({ subject: `${world.staffId}|test-session` });
  const customer = t.withIdentity({ subject: `${world.customerId}|test-session` });
  return { t, staff, customer, ...world };
}

type Env = Awaited<ReturnType<typeof setup>>;

describe("stats.overview", () => {
  it("counts today's orders and only confirmed takings", async () => {
    const env = await setup();
    await insertOrders(env.t, env.customerId, [
      // Today: one confirmed, one still to be recorded.
      { payment_status: "confirmed", total: 250, fulfillment: "pickup" },
      { payment_status: "pending", total: 90 },
      // Last week — belongs to the totals, never to "today".
      { ageDays: 7, payment_status: "confirmed", total: 400 },
    ]);
    restoreClock();

    const overview = await env.staff.query(api.stats.overview, {});

    expect(overview.orders.today).toBe(2);
    expect(overview.orders.today_revenue).toBe(250);
    expect(overview.orders.total).toBe(3);
    // Only the pending order is open *and* unpaid; the confirmed ones are not.
    expect(overview.orders.awaiting_payment).toBe(1);
  });

  it("splits verified listings from samples and flags empty shelves", async () => {
    const env = await setup();
    await restoreClock();
    await env.t.run(async (ctx) => {
      const products = await ctx.db.query("products").collect();
      // Start from a healthy catalogue, then make exactly three exceptions —
      // the seed ships every demo product at zero stock, so there is no
      // "one low product" state to assert against without this baseline.
      for (const p of products) await ctx.db.patch(p._id, { stock: 10, verified: true });
      if (products[0]) await ctx.db.patch(products[0]._id, { stock: 12 });
      if (products[1]) await ctx.db.patch(products[1]._id, { stock: 0 });
      if (products[2]) await ctx.db.patch(products[2]._id, { stock: 3 });
      if (products[3]) await ctx.db.patch(products[3]._id, { verified: false });
    });

    const overview = await env.staff.query(api.stats.overview, {});

    expect(overview.products.total).toBeGreaterThan(0);
    expect(overview.products.verified).toBe(overview.products.total - 1);
    expect(overview.products.samples).toBe(1);
    expect(overview.products.out_of_stock).toBe(1);
    // Low stock means "still sellable but thin": the empty shelf is reported
    // once, by out_of_stock, and never again here.
    expect(overview.products.low_stock).toHaveLength(1);
    expect(overview.products.low_stock[0]?.stock).toBe(3);
    expect(overview.products.low_stock.every((p) => p.stock > 0)).toBe(true);
  });

  it("refuses customers, who have no reporting access", async () => {
    const env = await setup();
    await restoreClock();
    await expect(env.customer.query(api.stats.overview, {})).rejects.toBeInstanceOf(ConvexError);
  });
});

describe("stats.trends", () => {
  it("zero-fills every day of the tape and fills the ones with orders", async () => {
    const env = await setup();
    await insertOrders(env.t, env.customerId, [
      { ageDays: 0, payment_status: "confirmed", total: 100 },
      { ageDays: 1, payment_status: "confirmed", total: 60 },
      // Older than the window: counted nowhere on the tape.
      { ageDays: 20, total: 999 },
    ]);
    restoreClock();

    const trends = await env.staff.query(api.stats.trends, {});

    expect(trends.daily).toHaveLength(14);
    expect(trends.daily[13]?.orders).toBe(1); // today, at the right edge
    expect(trends.daily[13]?.revenue).toBe(100);
    expect(trends.daily[12]?.orders).toBe(1);
    expect(trends.daily[12]?.revenue).toBe(60);
    expect(trends.daily[0]?.orders).toBe(0);
    expect(trends.daily[0]?.revenue).toBe(0);
    // Every bucket is labelled with a weekday for the axis.
    expect(trends.daily.every((d) => d.label.length > 0)).toBe(true);
  });

  it("leaves unconfirmed money out of the takings line", async () => {
    const env = await setup();
    await insertOrders(env.t, env.customerId, [
      { payment_status: "confirmed", total: 120 },
      { payment_status: "pending", total: 80 },
      { payment_status: "rejected", total: 55 },
    ]);
    restoreClock();

    const trends = await env.staff.query(api.stats.trends, {});

    // All three orders happened, but only one was actually paid.
    expect(trends.daily[13]?.orders).toBe(3);
    expect(trends.daily[13]?.revenue).toBe(120);
  });

  it("reports every pipeline stage, including the empty ones", async () => {
    const env = await setup();
    await insertOrders(env.t, env.customerId, [
      { status: "ready" },
      { status: "ready" },
      { status: "completed" },
    ]);
    restoreClock();

    const trends = await env.staff.query(api.stats.trends, {});

    // All six stages always appear so the chart never grows a new column.
    expect(trends.statuses.map((s) => s.status)).toEqual([
      "received",
      "processing",
      "ready",
      "dispatched",
      "completed",
      "cancelled",
    ]);
    expect(trends.statuses.find((s) => s.status === "ready")?.count).toBe(2);
    expect(trends.statuses.find((s) => s.status === "completed")?.count).toBe(1);
    expect(trends.statuses.find((s) => s.status === "received")?.count).toBe(0);
  });

  it("counts pickup against delivery", async () => {
    const env = await setup();
    await insertOrders(env.t, env.customerId, [
      { fulfillment: "pickup" },
      { fulfillment: "delivery" },
      { fulfillment: "delivery" },
    ]);
    restoreClock();

    const trends = await env.staff.query(api.stats.trends, {});

    expect(trends.fulfilment).toEqual({ pickup: 1, delivery: 2 });
  });

  it("ranks best sellers by units and ignores cancelled orders", async () => {
    const env = await setup();
    // Pricier per unit, but fewer of them: ranking is by units, not value.
    const desk = [
      { id: "desk", name: "Standing Desk", price: 500, quantity: 3, image_key: "desk" },
    ];
    const pad = [{ id: "pad", name: "RGB Mouse Pad", price: 100, quantity: 5, image_key: "pad" }];
    await insertOrders(env.t, env.customerId, [
      { items: pad },
      { items: desk },
      { items: desk },
      // Cancelled: nothing left the shelf, so it never sold.
      { status: "cancelled", items: pad },
    ]);
    restoreClock();

    const trends = await env.staff.query(api.stats.trends, {});

    expect(trends.top_products[0]?.name).toBe("Standing Desk");
    expect(trends.top_products[0]?.units).toBe(6);
    expect(trends.top_products[0]?.revenue).toBe(3000);
    // The second pad order was cancelled, so only the first one's 5 count.
    expect(trends.top_products[1]?.name).toBe("RGB Mouse Pad");
    expect(trends.top_products[1]?.units).toBe(5);
  });

  it("compares this week with the last one", async () => {
    const env = await setup();
    await insertOrders(env.t, env.customerId, [
      { ageDays: 0, payment_status: "confirmed", total: 200 },
      { ageDays: 9, payment_status: "confirmed", total: 50 },
    ]);
    restoreClock();

    const trends = await env.staff.query(api.stats.trends, {});

    expect(trends.week).toEqual({ orders: 1, revenue: 200 });
    expect(trends.prev_week).toEqual({ orders: 1, revenue: 50 });
  });

  it("refuses customers, who have no reporting access", async () => {
    const env = await setup();
    await restoreClock();
    await expect(env.customer.query(api.stats.trends, {})).rejects.toBeInstanceOf(ConvexError);
  });
});
