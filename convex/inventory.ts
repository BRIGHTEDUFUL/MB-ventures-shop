import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
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
    /** Set to adjust one option of the product rather than the product itself. */
    variant_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "inventory.adjust");
    const reason = args.reason.trim() || "Stock adjustment";
    if (reason.length > LIMITS.reason) {
      throw new ConvexError({ message: `Keep the reason under ${LIMITS.reason} characters.` });
    }
    if (args.note !== undefined && args.note.trim().length > 200) {
      throw new ConvexError({ message: "Keep the note under 200 characters." });
    }
    const source: MovementSource = "attendant";
    const movement_type: MovementType = args.movement_type ?? "adjustment";

    const product = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", args.product_id))
      .first();
    if (product === null) throw new ConvexError({ message: "Product not found." });

    const heldKey = args.variant_key?.trim() ?? "";
    const variant =
      heldKey === ""
        ? null
        : await ctx.db
            .query("product_variants")
            .withIndex("by_product_key", (q) =>
              q.eq("product_slug", args.product_id).eq("key", heldKey),
            )
            .unique();
    if (heldKey !== "" && variant === null) {
      throw new ConvexError({ message: "That option no longer exists." });
    }
    // A product that sells in options keeps its stock as the derived sum of
    // them — there is no "product-level" number to adjust. Writing one would
    // silently detach the total from what the options add up to (it is exactly
    // how the storefront's totals once drifted), so it is refused outright.
    if (variant === null) {
      const hasOptions = await ctx.db
        .query("product_variants")
        .withIndex("by_product", (q) => q.eq("product_slug", args.product_id))
        .first();
      if (hasOptions !== null) {
        throw new ConvexError({
          message: "This product sells in options — adjust the option you counted, not the total.",
        });
      }
    }
    const before = variant === null ? product.stock : variant.stock;
    const who = variant === null ? product.name : `${product.name} — ${variant.name}`;

    const result = await applyStockChange(ctx, {
      slug: args.product_id,
      ...(variant === null ? {} : { variant_key: variant.key }),
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
        `${who}: stock ${before} → ${result.stock}.`,
      );
    }
    return { ok: true, stock: result.stock };
  },
});

/**
 * Stocktake: "I counted the shelf and there are *n*, whatever the system
 * thinks." The only operation that writes an absolute number, so it takes no
 * `operation_key` — the value is the intent, and repeating it is harmless
 * (D6). Gated on `inventory.stocktake` rather than `inventory.adjust` so the
 * owner can let someone count without letting them invent stock.
 */
export const count = mutation({
  args: {
    product_id: v.string(),
    counted: v.number(),
    reason: v.optional(v.string()),
    operation_key: v.optional(v.string()),
    /** Set to count one option rather than the product as a whole. */
    variant_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "inventory.stocktake");
    if (!Number.isInteger(args.counted) || args.counted < 0) {
      throw new ConvexError({ message: "Counted stock must be a whole number of 0 or more." });
    }
    const reason = args.reason?.trim() || "Stocktake";
    if (reason.length > LIMITS.reason) {
      throw new ConvexError({ message: `Keep the reason under ${LIMITS.reason} characters.` });
    }

    const product = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", args.product_id))
      .first();
    if (product === null) throw new ConvexError({ message: "Product not found." });

    const heldKey = args.variant_key?.trim() ?? "";
    const variant =
      heldKey === ""
        ? null
        : await ctx.db
            .query("product_variants")
            .withIndex("by_product_key", (q) =>
              q.eq("product_slug", args.product_id).eq("key", heldKey),
            )
            .unique();
    if (heldKey !== "" && variant === null) {
      throw new ConvexError({ message: "That option no longer exists." });
    }
    // A counted "total" on an options product would detach the number from
    // what the options add up to — same drift, one stocktake later. Count the
    // option itself.
    if (variant === null) {
      const hasOptions = await ctx.db
        .query("product_variants")
        .withIndex("by_product", (q) => q.eq("product_slug", args.product_id))
        .first();
      if (hasOptions !== null) {
        throw new ConvexError({
          message: "This product sells in options — count the option itself, not the total.",
        });
      }
    }
    const before = variant === null ? product.stock : variant.stock;
    const who = variant === null ? product.name : `${product.name} — ${variant.name}`;

    const result = await applyStockChange(ctx, {
      slug: args.product_id,
      ...(variant === null ? {} : { variant_key: variant.key }),
      command: { kind: "set_on_hand", value: args.counted },
      movement_type: "stocktake",
      source: "attendant",
      reason,
      actor_id: actorId,
      ...(args.operation_key !== undefined ? { operation_key: args.operation_key } : {}),
    });

    // Only announce a real change: a count that matches the system is still a
    // useful result to show, but it is not an event in the feed.
    if (!result.skipped && result.stock !== before) {
      await logActivity(
        ctx,
        actorId,
        "inventory.count",
        `${who}: counted ${args.counted}, system said ${before}.`,
      );
    }
    return { ok: true, stock: result.stock, changed: result.stock !== before };
  },
});

/**
 * Undo one movement.
 *
 * Corrections are never edits: the original row keeps its numbers and stays in
 * the log, and the undo is a *new* row pointing back at it (`reverses`), with
 * the original stamped `reversed_by` so it cannot be undone twice. That keeps
 * the ledger append-only while still letting a shop fix a mis-typed count.
 *
 * Only movements that change what is on the shelf can be reversed — an order
 * reservation is not a mistake to correct here, it is undone by cancelling the
 * order, and reversing one would hand out units that are still promised.
 */
export const reverse = mutation({
  args: { movement_id: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "inventory.adjust");
    const movementId = ctx.db.normalizeId("inventory_history", args.movement_id);
    if (movementId === null) throw new ConvexError({ message: "Movement not found." });
    const original = await ctx.db.get(movementId);
    if (original === null) throw new ConvexError({ message: "Movement not found." });
    if (original.reversed_by !== undefined) {
      throw new ConvexError({ message: "That movement has already been reversed." });
    }

    const type = original.movement_type;
    if (type === "reserve" || type === "release" || type === "commit") {
      throw new ConvexError({
        message:
          "Order movements cannot be reversed here — cancel or amend the order instead, so its stock follows the order's own state.",
      });
    }

    const note = (args.note ?? "").trim();
    if (note.length > 200)
      throw new ConvexError({ message: "Keep the note under 200 characters." });

    // Undo exactly what the row did: it moved `new_stock` back to
    // `previous_stock`. Going through the choke point means the reversal is
    // validated (never below zero) and gets its own ledger row.
    const delta = original.previous_stock - original.new_stock;
    if (delta === 0) throw new ConvexError({ message: "That movement did not change stock." });

    const product = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", original.product_slug))
      .first();
    if (product === null) throw new ConvexError({ message: "Product not found." });

    // A reversal must land where the original landed. A product-level row
    // (no option recorded) written before this product sold in options would,
    // undone today, write a product-level total and detach it from what the
    // options add up to — the exact drift `adjust` and `count` refuse. Such a
    // row predates the options; it cannot be replayed without corrupting them.
    if (!original.variant_key) {
      const hasOptions = await ctx.db
        .query("product_variants")
        .withIndex("by_product", (q) => q.eq("product_slug", product.slug))
        .first();
      if (hasOptions !== null) {
        throw new ConvexError({
          message:
            "This product sells in options — that product-level movement predates them, so undoing it would corrupt the option counts. Adjust the option itself instead.",
        });
      }
    }

    const result = await applyStockChange(ctx, {
      slug: original.product_slug,
      // A movement that touched an option is undone on that same option —
      // the row records which one, so the reversal cannot drift to the
      // product as a whole (or to a different colour).
      ...(original.variant_key ? { variant_key: original.variant_key } : {}),
      command: { kind: "adjust", delta },
      movement_type: "reversal",
      source: "attendant",
      reason: `Reversed: ${original.reason}`,
      actor_id: actorId,
      ...(note !== "" ? { note } : {}),
      reverses: movementId,
      // A double tap cannot undo it twice, even before the stamp lands.
      operation_key: `reverse:${movementId}`,
    });

    // The undo is a *new* row; the original only gains the pointer to it.
    // Its numbers are never rewritten, which is what keeps the ledger honest.
    if (result.movement_id !== null) {
      await ctx.db.patch(movementId, { reversed_by: result.movement_id });
    }
    await logActivity(
      ctx,
      actorId,
      "inventory.reverse",
      `Reversed a movement on ${product.name}${
        original.variant_name ? ` — ${original.variant_name}` : ""
      } (${original.previous_stock} → ${original.new_stock}).`,
    );
    return { ok: true, stock: result.stock };
  },
});

export type InventoryEntry = {
  id: string;
  product_slug: string;
  product_name: string;
  /** Option this movement touched, when the product sells in versions. */
  variant_key: string | null;
  variant_name: string | null;
  previous_stock: number;
  new_stock: number;
  reason: string;
  actor_name: string;
  created_at: string;
  /** Movement type when the row predates the typed ledger it reads as null. */
  movement_type: string | null;
  /** True when something already undid this movement. */
  reversed: boolean;
  /** Order/stocktake reference, when the movement has one. */
  reference: string | null;
};

/** One ledger row as the movement log shows it. */
function entryDTO(row: Doc<"inventory_history">, actor_name: string): InventoryEntry {
  return {
    id: row._id,
    product_slug: row.product_slug,
    product_name: row.product_name,
    variant_key: row.variant_key ?? null,
    variant_name: row.variant_name ?? null,
    previous_stock: row.previous_stock,
    new_stock: row.new_stock,
    reason: row.reason,
    actor_name,
    created_at: new Date(row._creationTime).toISOString(),
    movement_type: row.movement_type ?? null,
    reversed: row.reversed_by !== undefined,
    reference: row.reference ?? null,
  };
}

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
        return entryDTO(row, actor?.name?.trim() || actor?.email?.trim() || "System");
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
      return entryDTO(row, actor?.name?.trim() || actor?.email?.trim() || "System");
    }),
  );
}
