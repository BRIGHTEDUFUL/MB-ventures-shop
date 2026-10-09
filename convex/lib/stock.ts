import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { movementSource, movementType, stockState } from "../schema";
import { fail } from "./errors";

export type MovementType = Infer<typeof movementType>;
export type MovementSource = Infer<typeof movementSource>;

/**
 * The single stock choke point.
 *
 * Every write to `products.stock` / `products.reserved` in this codebase goes
 * through `applyStockChange`, and `src/test/stock-single-writer.test.ts` fails
 * if a new one appears. That is what makes the invariants below hold *every*
 * time rather than by convention:
 *
 * - available and reserved are never negative,
 * - available + reserved (on hand) is always the physical count,
 * - every change leaves exactly one append-only ledger row,
 * - a retried write with the same `operation_key` is a no-op.
 *
 * The three stock numbers:
 *
 * | field       | meaning                                        |
 * | ----------- | ---------------------------------------------- |
 * | `stock`     | **available** — units an order may take now     |
 * | `reserved`  | promised to open orders, still physically here  |
 * | `on hand`   | `stock + reserved` — what is actually on a shelf |
 *
 * A sale moves units from available to reserved (`reserve`), fulfilment takes
 * them off the shelf (`commit`), and a cancellation either puts them back on
 * the shelf (`release`) or, when the goods had already left, receives them
 * back as a restock.
 */

/** Units on a shelf: available plus what open orders are holding. */
export function onHand(product: Pick<Doc<"products">, "stock" | "reserved">): number {
  return product.stock + (product.reserved ?? 0);
}

/**
 * What an order is currently doing to the shelf. `stock_state` is written by
 * `orders.place` / `orders.staffUpdate` and backfilled by the reservation
 * migration; a row that predates the field is inferred from its status with
 * exactly the same rule the migration uses, so legacy and new orders behave
 * identically before and after the backfill.
 */
export type StockState = Infer<typeof stockState>;

export function stockStateOf(order: Pick<Doc<"orders">, "status" | "stock_state">): StockState {
  if (order.stock_state !== undefined) return order.stock_state;
  if (order.status === "cancelled") return "released";
  if (order.status === "dispatched" || order.status === "completed") return "committed";
  return "reserved";
}

/** How one call is allowed to move stock. */
export type StockCommand =
  /** Staff `+`/`-` correction: physical count and available both move. */
  | { kind: "adjust"; delta: number }
  /** Absolute *physical* count (product editor, bulk set, stocktake). */
  | { kind: "set_on_hand"; value: number }
  /** An order took units: available → reserved. */
  | { kind: "reserve"; quantity: number }
  /** An order died before the goods left: reserved → available. */
  | { kind: "release"; quantity: number }
  /** The goods left the shop against a reserved order. */
  | { kind: "commit"; quantity: number }
  /** Goods came back with no reservation to release (post-commit restock). */
  | { kind: "restock"; quantity: number };

export type StockChange = {
  /** Slug of the product being moved (`products.slug`). */
  slug: string;
  command: StockCommand;
  /** What happened, for filtering and for `reversal`. */
  movement_type: MovementType;
  /** Which screen or job caused it. */
  source: MovementSource;
  /** Human sentence shown in the movement log. */
  reason: string;
  actor_id?: Id<"users"> | undefined;
  /** Order reference, stocktake id or import batch, when there is one. */
  reference?: string | undefined;
  /**
   * Client-supplied idempotency key. A second call carrying a key that has
   * already been applied returns the current numbers without moving anything,
   * so a double tap or a network retry cannot charge stock twice.
   */
  operation_key?: string | undefined;
  note?: string | undefined;
  /** Points this row at the movement it undoes (reversals only). */
  reverses?: Id<"inventory_history"> | undefined;
  /**
   * Other product fields to write in the same transaction as the stock move —
   * this is how a product save bumps `version` and edits copy in one atomic
   * step instead of two patches racing each other.
   */
  patch?: Partial<Omit<Doc<"products">, "_id" | "_creationTime" | "slug">> | undefined;
};

export type StockChangeResult = {
  stock: number;
  reserved: number;
  on_hand: number;
  /** True when `operation_key` had already been applied — nothing moved. */
  skipped: boolean;
  /**
   * The ledger row this call wrote, or `null` when nothing moved. Callers that
   * need to link back to a movement (a reversal stamping the row it undoes)
   * read it here rather than re-querying and racing the next write.
   */
  movement_id: Id<"inventory_history"> | null;
};

const assertCount = (label: string, value: number): void => {
  if (!Number.isInteger(value)) {
    fail("VALIDATION_FAILED", `${label} must be a whole number of units.`);
  }
  if (value < 0) {
    fail("VALIDATION_FAILED", `${label} cannot go below zero.`);
  }
};

/**
 * Apply one stock movement.
 *
 * Runs inside the caller's transaction: the product read, the patch and the
 * ledger insert all commit together or not at all, so a failing write can
 * never leave a number without an explanation (or an explanation without a
 * number).
 */
export async function applyStockChange(
  ctx: MutationCtx,
  change: StockChange,
): Promise<StockChangeResult> {
  const product = await ctx.db
    .query("products")
    .withIndex("by_slug", (q) => q.eq("slug", change.slug))
    .first();
  if (product === null) fail("NOT_FOUND", "Product not found.");

  // Idempotency: a repeat of an already-applied operation key is a no-op.
  if (change.operation_key !== undefined && change.operation_key !== "") {
    const seen = await ctx.db
      .query("inventory_history")
      .withIndex("by_operation", (q) => q.eq("operation_key", change.operation_key as string))
      .first();
    if (seen !== null) {
      return {
        stock: product.stock,
        reserved: product.reserved ?? 0,
        on_hand: onHand(product),
        skipped: true,
        movement_id: seen._id,
      };
    }
  }

  const before = { stock: product.stock, reserved: product.reserved ?? 0 };
  const beforeHand = before.stock + before.reserved;
  const quantity = "quantity" in change.command ? change.command.quantity : 0;

  let next: { stock: number; reserved: number };
  switch (change.command.kind) {
    case "adjust": {
      const { delta } = change.command;
      if (!Number.isInteger(delta) || delta === 0) {
        fail("VALIDATION_FAILED", "Enter a whole number change that is not zero.");
      }
      if (before.stock + delta < 0) {
        // Worded around what is physically on the shelf, because that is the
        // number a staff member is comparing against.
        fail("STOCK_INSUFFICIENT", `Stock cannot go below zero — only ${before.stock} on hand.`, {
          available: before.stock,
          requested: delta,
        });
      }
      next = { stock: before.stock + delta, reserved: before.reserved };
      break;
    }
    case "set_on_hand": {
      const target = change.command.value;
      assertCount("The stock count", target);
      // The editor counts the shelf, so open orders keep their hold: only the
      // units *above* a reservation become available.
      const stock = target - before.reserved;
      if (stock < 0) {
        fail(
          "VALIDATION_FAILED",
          `There are only ${before.reserved} units free — ${before.reserved} of the ${target} counted are already promised to open orders.`,
        );
      }
      next = { stock, reserved: before.reserved };
      break;
    }
    case "reserve": {
      assertCount("The quantity", quantity);
      if (quantity === 0) fail("VALIDATION_FAILED", "The quantity cannot be zero.");
      if (before.stock < quantity) {
        fail(
          "STOCK_INSUFFICIENT",
          `Only ${before.stock} unit${before.stock === 1 ? " is" : "s are"} available.`,
          { available: before.stock, requested: quantity },
        );
      }
      next = { stock: before.stock - quantity, reserved: before.reserved + quantity };
      break;
    }
    case "release": {
      assertCount("The quantity", quantity);
      if (before.reserved < quantity) {
        fail("STATE_CONFLICT", "This order is no longer holding any stock.");
      }
      next = { stock: before.stock + quantity, reserved: before.reserved - quantity };
      break;
    }
    case "commit": {
      assertCount("The quantity", quantity);
      if (before.reserved < quantity) {
        fail("STATE_CONFLICT", "This order is no longer holding any stock.");
      }
      // Available is untouched: those units already left the available pool
      // when the order was placed. Only the shelf count drops.
      next = { stock: before.stock, reserved: before.reserved - quantity };
      break;
    }
    case "restock": {
      assertCount("The quantity", quantity);
      if (quantity === 0) fail("VALIDATION_FAILED", "The quantity cannot be zero.");
      next = { stock: before.stock + quantity, reserved: before.reserved };
      break;
    }
  }

  assertCount("The available count", next.stock);
  assertCount("The reserved count", next.reserved);

  const afterHand = next.stock + next.reserved;
  const patch: Partial<Omit<Doc<"products">, "_id" | "_creationTime">> = {
    ...change.patch,
    stock: next.stock,
    reserved: next.reserved,
    version: (product.version ?? 0) + 1,
  };
  await ctx.db.patch(product._id, patch);

  // No movement means no number changed — a product save that leaves stock
  // alone still writes its copy and version through `patch`, but must not
  // claim a stock change happened.
  const moved = next.stock !== before.stock || next.reserved !== before.reserved;
  let movement_id: Id<"inventory_history"> | null = null;
  if (moved) {
    movement_id = await ctx.db.insert("inventory_history", {
      product_slug: product.slug,
      product_name: product.name,
      previous_stock: before.stock,
      new_stock: next.stock,
      reason: change.reason,
      ...(change.actor_id !== undefined ? { actor_id: change.actor_id } : {}),
      movement_type: change.movement_type,
      delta: next.stock - before.stock,
      on_hand_before: beforeHand,
      on_hand_after: afterHand,
      source: change.source,
      ...(change.reference !== undefined ? { reference: change.reference } : {}),
      ...(change.operation_key !== undefined && change.operation_key !== ""
        ? { operation_key: change.operation_key }
        : {}),
      ...(change.note !== undefined ? { note: change.note } : {}),
      ...(change.reverses !== undefined ? { reverses: change.reverses } : {}),
    });
  }

  return {
    stock: next.stock,
    reserved: next.reserved,
    on_hand: afterHand,
    skipped: false,
    movement_id,
  };
}
