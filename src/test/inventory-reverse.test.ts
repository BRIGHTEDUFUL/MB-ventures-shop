// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

/**
 * Ledger-shaped operations: undoing a movement must add a row rather than
 * rewrite one, must not be repeatable, and must refuse the movements that are
 * owned by an order instead. The stocktake writes an absolute count, so it
 * keeps open orders' units promised. Offline in the Convex edge runtime.
 */
const modules = import.meta.glob("../../convex/**/*.*s");

vi.stubGlobal(
  "fetch",
  vi.fn(async () => {
    throw new Error("This suite must never reach the network.");
  }),
);

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.seed, {});
  const world = await t.run(async (ctx) => {
    const desk = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", "standing-desk"))
      .unique();
    if (desk === null) throw new Error("seed did not create the standing desk");
    await ctx.db.patch(desk._id, { stock: 50 });
    const staffId = await ctx.db.insert("users", { name: "Kofi", email: "kofi@example.com" });
    await ctx.db.insert("user_roles", { user_id: staffId, role: "staff" });
    return { staffId };
  });
  return {
    t,
    staff: t.withIdentity({ subject: `${world.staffId}|s` }),
    ...world,
  };
}

const movements = (env: Awaited<ReturnType<typeof setup>>) =>
  env.t.run((ctx) => ctx.db.query("inventory_history").order("asc").collect());

const readDesk = (env: Awaited<ReturnType<typeof setup>>) =>
  env.t.run(async (ctx) =>
    ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", "standing-desk"))
      .unique(),
  );

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

const messageOf = (error: unknown) => (error as ConvexError<{ message: string }>).data.message;

describe("inventory.reverse — corrections without rewriting history", () => {
  it("adds a row instead of editing the original, and returns the stock", async () => {
    const env = await setup();
    await env.staff.mutation(api.inventory.adjust, {
      product_id: "standing-desk",
      delta: -5,
      reason: "Counted wrong",
      movement_type: "correction",
    });
    expect((await readDesk(env))?.stock).toBe(45);

    const before = await movements(env);
    expect(before).toHaveLength(1);

    await env.staff.mutation(api.inventory.reverse, {
      movement_id: before[0]!._id,
      note: "Kofi's count was right",
    });

    // The original row keeps its numbers; a second row undoes it.
    const after = await movements(env);
    expect(after).toHaveLength(2);
    expect(after[0]).toMatchObject({
      previous_stock: 50,
      new_stock: 45,
      reversed_by: after[1]!._id,
    });
    expect(after[1]).toMatchObject({
      previous_stock: 45,
      new_stock: 50,
      movement_type: "reversal",
      reverses: after[0]!._id,
      reason: "Reversed: Counted wrong",
      actor_id: env.staffId,
    });
    expect((await readDesk(env))?.stock).toBe(50);
  });

  it("cannot undo the same movement twice", async () => {
    const env = await setup();
    await env.staff.mutation(api.inventory.adjust, {
      product_id: "standing-desk",
      delta: -5,
      reason: "Counted wrong",
    });
    const [first] = await movements(env);

    await env.staff.mutation(api.inventory.reverse, { movement_id: first!._id });
    const second = await capture(
      env.staff.mutation(api.inventory.reverse, { movement_id: first!._id }),
    );

    expect(messageOf(second)).toMatch(/already been reversed/);
    expect(await movements(env)).toHaveLength(2);
    expect((await readDesk(env))?.stock).toBe(50);
  });

  it("refuses to reverse an order reservation — cancel the order instead", async () => {
    const env = await setup();
    const orderId = await env.t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { name: "Ama", email: "ama@example.com" });
      return await ctx.db.insert("orders", {
        reference: "MB-TESTTESTTESTTE",
        user_id: userId,
        customer_name: "Ama",
        email: "ama@example.com",
        phone: "0241234567",
        address: "Osu",
        fulfillment: "delivery",
        zone: "central",
        payment_method: "momo",
        payment_status: "pending",
        status: "received",
        subtotal: 100,
        delivery_fee: 30,
        total: 130,
        items: [{ id: "standing-desk", name: "Desk", price: 100, quantity: 2, image_key: "desk" }],
        stock_state: "reserved",
      });
    });

    await env.t.run(async (ctx) => {
      const product = await ctx.db
        .query("products")
        .withIndex("by_slug", (q) => q.eq("slug", "standing-desk"))
        .unique();
      await ctx.db.patch(product!._id, { stock: 48, reserved: 2 });
      await ctx.db.insert("inventory_history", {
        product_slug: "standing-desk",
        product_name: "Desk",
        previous_stock: 50,
        new_stock: 48,
        reason: "Sold on order MB-TESTTESTTESTTE",
        movement_type: "reserve",
        source: "checkout",
        reference: "MB-TESTTESTTESTTE",
      });
    });

    const rows = await movements(env);
    const reserve = rows.find((row) => row.movement_type === "reserve")!;
    const error = await capture(
      env.staff.mutation(api.inventory.reverse, { movement_id: reserve._id }),
    );

    expect(messageOf(error)).toMatch(/cancel or amend the order/);
    expect(await movements(env)).toHaveLength(1);
    expect((await readDesk(env))?.stock).toBe(48);
    expect(orderId).toBeDefined();
  });

  it("never lets a reversal drive the available count below zero", async () => {
    const env = await setup();
    // A delivery lands (+50), then the whole shelf is written off as damaged.
    // Reversing the *delivery* would now subtract from an empty shelf, which
    // the choke point must refuse rather than let the count go negative.
    await env.staff.mutation(api.inventory.adjust, {
      product_id: "standing-desk",
      delta: 50,
      reason: "Delivery received",
      movement_type: "receive",
    });
    await env.staff.mutation(api.inventory.adjust, {
      product_id: "standing-desk",
      delta: -100,
      reason: "Flood damaged everything",
      movement_type: "damage",
    });
    expect((await readDesk(env))?.stock).toBe(0);

    const rows = await movements(env);
    const delivery = rows.find((row) => row.movement_type === "receive")!;
    const error = await capture(
      env.staff.mutation(api.inventory.reverse, { movement_id: delivery._id }),
    );

    expect(error).toBeInstanceOf(ConvexError);
    // The message names what is physically on the shelf — the number staff compare against.
    expect(messageOf(error)).toMatch(/only 0 on hand/);
    expect((await readDesk(env))?.stock).toBe(0);
    // Not stamped, so it can still be undone once the shelf has stock again.
    expect(
      (await movements(env)).find((row) => row.movement_type === "receive")?.reversed_by,
    ).toBeUndefined();
  });

  it("shows the reversal flag and type to the movement log", async () => {
    const env = await setup();
    await env.staff.mutation(api.inventory.adjust, {
      product_id: "standing-desk",
      delta: 7,
      reason: "Delivery received",
      movement_type: "receive",
    });
    const [delivery] = await movements(env);
    const before = await env.staff.query(api.inventory.history, { limit: 50 });
    expect(before[0]).toMatchObject({ movement_type: "receive", reversed: false });

    await env.staff.mutation(api.inventory.reverse, { movement_id: delivery!._id });
    const after = await env.staff.query(api.inventory.history, { limit: 50 });
    expect(after.find((row) => row.movement_type === "receive")?.reversed).toBe(true);
    expect(after[0]?.movement_type).toBe("reversal");
  });
});

describe("inventory.count — the stocktake writes an absolute shelf count", () => {
  it("replaces the system's number with the counted one and logs the gap", async () => {
    const env = await setup();
    const result = await env.staff.mutation(api.inventory.count, {
      product_id: "standing-desk",
      counted: 42,
      reason: "Quarterly stocktake",
    });

    expect(result).toEqual({ ok: true, stock: 42, changed: true });
    expect((await readDesk(env))?.stock).toBe(42);
    const [row] = await movements(env);
    expect(row).toMatchObject({
      movement_type: "stocktake",
      previous_stock: 50,
      new_stock: 42,
      reason: "Quarterly stocktake",
    });
  });

  it("says so plainly when the count agrees with the system", async () => {
    const env = await setup();
    const result = await env.staff.mutation(api.inventory.count, {
      product_id: "standing-desk",
      counted: 50,
    });

    expect(result.changed).toBe(false);
    expect(result.stock).toBe(50);
    // A count that confirms the number is not a movement, so no row is written
    // and the log never shows a change that did not happen.
    expect(await movements(env)).toHaveLength(0);
  });

  it("keeps open orders' units promised rather than handing them out", async () => {
    const env = await setup();
    await env.t.run(async (ctx) => {
      const product = await ctx.db
        .query("products")
        .withIndex("by_slug", (q) => q.eq("slug", "standing-desk"))
        .unique();
      // Two units are held for an open order: shelf has 52, available is 50.
      await ctx.db.patch(product!._id, { stock: 50, reserved: 2 });
    });

    const result = await env.staff.mutation(api.inventory.count, {
      product_id: "standing-desk",
      counted: 52,
      reason: "Counted the shelf",
    });

    // 52 on the shelf minus the 2 promised = 50 available.
    expect(result.stock).toBe(50);
    const after = await readDesk(env);
    expect(after?.reserved).toBe(2);
  });

  it("refuses a count below what open orders already hold", async () => {
    const env = await setup();
    await env.t.run(async (ctx) => {
      const product = await ctx.db
        .query("products")
        .withIndex("by_slug", (q) => q.eq("slug", "standing-desk"))
        .unique();
      await ctx.db.patch(product!._id, { stock: 48, reserved: 2 });
    });

    const error = await capture(
      env.staff.mutation(api.inventory.count, {
        product_id: "standing-desk",
        counted: 1,
      }),
    );

    expect(messageOf(error)).toMatch(/already promised to open orders/);
    expect((await readDesk(env))?.stock).toBe(48);
    expect(await movements(env)).toHaveLength(0);
  });

  it("rejects a negative or fractional count before anything is written", async () => {
    const env = await setup();
    const error = await capture(
      env.staff.mutation(api.inventory.count, {
        product_id: "standing-desk",
        counted: -3,
      }),
    );

    expect(messageOf(error)).toMatch(/whole number of 0 or more/);
    expect(await movements(env)).toHaveLength(0);
  });

  it("denies a customer with no staff role", async () => {
    const env = await setup();
    const stranger = env.t.withIdentity({ subject: "someone-else|s" });
    const error = await capture(
      stranger.mutation(api.inventory.count, { product_id: "standing-desk", counted: 1 }),
    );

    expect(messageOf(error)).toBe("Staff access required. Ask the store owner to grant access.");
    expect((await readDesk(env))?.stock).toBe(50);
  });
});
