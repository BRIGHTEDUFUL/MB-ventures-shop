import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requirePermission } from "./lib/permissions";
import { logActivity } from "./lib/activity";
import { LIMITS } from "./catalogue";
import { applyStockChange, type MovementSource, type MovementType } from "./lib/stock";

/**
 * Stock correction from the inventory page: a signed whole-number delta plus
 * a reason (delivery received, damage, count fix, …). Never below zero —
 * `applyStockChange` owns that rule, along with the movement row.
 *
 * `operation_key` makes a double tap or a retried request a no-op: the client
 * sends a fresh key per tap and reuses it while retrying, so one intent
 * produces exactly one movement.
 */
export const adjust = mutation({
  args: {
    product_id: v.string(),
    delta: v.number(),
    reason: v.string(),
    movement_type: v.optional(
      v.union(
        v.literal("receive"),
        v.literal("adjustment"),
        v.literal("damage"),
        v.literal("loss"),
        v.literal("theft"),
        v.literal("return"),
        v.literal("correction"),
        v.literal("transfer"),
      ),
    ),
    operation_key: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "inventory.adjust");
    const reason = args.reason.trim() || "Stock adjustment";
    if (reason.length > LIMITS.reason) {
      throw new ConvexError({ message: `Keep the reason under ${LIMITS.reason} characters.` });
    }
    const source: MovementSource = "attendant";
    const movement_type: MovementType = args.movement_type ?? "adjustment";

    const product = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", args.product_id))
      .first();
    if (product === null) throw new ConvexError({ message: "Product not found." });
    const before = product.stock;

    const result = await applyStockChange(ctx, {
      slug: args.product_id,
      command: { kind: "adjust", delta: args.delta },
      movement_type,
      source,
      reason,
      actor_id: actorId,
      ...(args.operation_key !== undefined ? { operation_key: args.operation_key } : {}),
      ...(args.note !== undefined && args.note.trim() !== "" ? { note: args.note.trim() } : {}),
    });

    // The activity feed only speaks in stock sentences; a replayed write must
    // not add a second line claiming a change that never happened.
    if (!result.skipped) {
      await logActivity(
        ctx,
        actorId,
        "inventory.adjust",
        `${product.name}: stock ${before} → ${result.stock}.`,
      );
    }
    return { ok: true, stock: result.stock };
  },
});

export type InventoryEntry = {
  id: string;
  product_slug: string;
  product_name: string;
  previous_stock: number;
  new_stock: number;
  reason: string;
  actor_name: string;
  created_at: string;
};

/** Newest-first stock movement log, optionally for a single product. */
export const history = query({
  args: {
    product_id: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<InventoryEntry[]> => {
    await requirePermission(ctx, "inventory.view");
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const base =
      args.product_id !== undefined && args.product_id !== ""
        ? ctx.db
            .query("inventory_history")
            .withIndex("by_product", (q) => q.eq("product_slug", args.product_id as string))
        : ctx.db.query("inventory_history");
    const rows = await base.order("desc").take(limit);
    return await Promise.all(
      rows.map(async (row) => {
        const actor = row.actor_id ? await ctx.db.get(row.actor_id) : null;
        return {
          id: row._id,
          product_slug: row.product_slug,
          product_name: row.product_name,
          previous_stock: row.previous_stock,
          new_stock: row.new_stock,
          reason: row.reason,
          actor_name: actor?.name?.trim() || actor?.email?.trim() || "System",
          created_at: new Date(row._creationTime).toISOString(),
        };
      }),
    );
  },
});

/** Stock-movement list helper shared by the dashboard's low-stock panel. */
export async function recentStockChanges(ctx: QueryCtx, limit: number): Promise<InventoryEntry[]> {
  const rows = await ctx.db.query("inventory_history").order("desc").take(limit);
  return await Promise.all(
    rows.map(async (row) => {
      const actor = row.actor_id ? await ctx.db.get(row.actor_id) : null;
      return {
        id: row._id,
        product_slug: row.product_slug,
        product_name: row.product_name,
        previous_stock: row.previous_stock,
        new_stock: row.new_stock,
        reason: row.reason,
        actor_name: actor?.name?.trim() || actor?.email?.trim() || "System",
        created_at: new Date(row._creationTime).toISOString(),
      };
    }),
  );
}
