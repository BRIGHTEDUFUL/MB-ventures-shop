import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireStaff } from "./lib/auth";
import { logActivity } from "./lib/activity";

export type StockChange = {
  product_slug: string;
  product_name: string;
  previous_stock: number;
  new_stock: number;
  reason: string;
  actor_id?: Doc<"users">["_id"] | undefined;
};

/**
 * One traceable stock movement. Called by staff adjustments, order placement
 * (sale) and cancellation (restock) so `inventory_history` always explains
 * the current number.
 */
export async function recordStockChange(ctx: MutationCtx, change: StockChange): Promise<void> {
  await ctx.db.insert("inventory_history", {
    product_slug: change.product_slug,
    product_name: change.product_name,
    previous_stock: change.previous_stock,
    new_stock: change.new_stock,
    reason: change.reason,
    ...(change.actor_id !== undefined ? { actor_id: change.actor_id } : {}),
  });
}

/**
 * Stock correction from the inventory page: a signed whole-number delta plus
 * a reason (delivery received, damage, count fix, …). Never below zero.
 */
export const adjust = mutation({
  args: {
    product_id: v.string(),
    delta: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actorId = await requireStaff(ctx);
    if (!Number.isInteger(args.delta) || args.delta === 0) {
      throw new ConvexError({ message: "Enter a whole number change that is not zero." });
    }
    const product = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", args.product_id))
      .first();
    if (product === null) throw new ConvexError({ message: "Product not found." });
    const newStock = product.stock + args.delta;
    if (newStock < 0) {
      throw new ConvexError({
        message: `Stock cannot go below zero — only ${product.stock} on hand.`,
      });
    }
    await ctx.db.patch(product._id, { stock: newStock });
    await recordStockChange(ctx, {
      product_slug: product.slug,
      product_name: product.name,
      previous_stock: product.stock,
      new_stock: newStock,
      reason: args.reason.trim() || "Stock adjustment",
      actor_id: actorId,
    });
    await logActivity(
      ctx,
      actorId,
      "inventory.adjust",
      `${product.name}: stock ${product.stock} → ${newStock}.`,
    );
    return { ok: true, stock: newStock };
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
    await requireStaff(ctx);
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
