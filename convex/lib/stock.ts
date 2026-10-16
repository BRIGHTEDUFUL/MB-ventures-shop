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
  /**
   * Set to move one variant of that product instead of the product itself.
   *
   * The command arithmetic then runs against the variant's counts, and the
   * product's `stock` / `reserved` are **recomputed as the sum across its
   * variants** in the same transaction — the aggregate is always derived,
   * never hand-edited. One ledger row is written, naming the variant.
   *
   * Absent (the overwhelmingly common case) behaves exactly as before.
   */
  variant_key?: string | undefined;
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
  /**
   * The same, for the variant row. Only meaningful alongside `variant_key`.
   * Stock fields are excluded by the type so a caller cannot smuggle a second
   * opinion about the counts past the arithmetic above.
   */
  variant_patch?:
    | Partial<
        Omit<
          Doc<"product_variants">,
          "_id" | "_creationTime" | "product_slug" | "key" | "stock" | "reserved" | "version"
        >
      >
    | undefined;
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
 * The command arithmetic, as a pure function of the counts it is given.
 *
 * Extracted so a product and a variant are moved by literally the same code —
 * `reserve` means the same thing for "Black" as it does for a product with no
 * options at all, and there is no second copy of the rules to drift.
 */
export function nextCounts(
  command: StockCommand,
  before: { stock: number; reserved: number },
): { stock: number; reserved: number } {
  const quantity = "quantity" in command ? command.quantity : 0;

  switch (command.kind) {
    case "adjust": {
      const { delta } = command;
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
      return { stock: before.stock + delta, reserved: before.reserved };
    }
    case "set_on_hand": {
      const target = command.value;
      assertCount("The stock count", target);
      // The editor counts the shelf, so open orders keep their hold: only the
      // units *above* a reservation become available.
      const stock = target - before.reserved;
      if (stock < 0) {
        // Said from the shelf's point of view: an absolute count can only
        // land below zero when it does not even cover the units open orders
        // are already holding — so say what to do about that, not a pair of
        // numbers that do not add up.
        const promised = before.reserved;
        fail(
          "VALIDATION_FAILED",
          `You counted ${target} unit${target === 1 ? "" : "s"}, but ${promised} unit${
            promised === 1 ? " is" : "s are"
          } already promised to open orders — count at least ${promised}, or resolve those orders first.`,
        );
      }
      return { stock, reserved: before.reserved };
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
      return { stock: before.stock - quantity, reserved: before.reserved + quantity };
    }
    case "release": {
      assertCount("The quantity", quantity);
      if (before.reserved < quantity) {
        fail("STATE_CONFLICT", "This order is no longer holding any stock.");
      }
      return { stock: before.stock + quantity, reserved: before.reserved - quantity };
    }
    case "commit": {
      assertCount("The quantity", quantity);
      if (before.reserved < quantity) {
        fail("STATE_CONFLICT", "This order is no longer holding any stock.");
      }
      // Available is untouched: those units already left the available pool
      // when the order was placed. Only the shelf count drops.
      return { stock: before.stock, reserved: before.reserved - quantity };
    }
    case "restock": {
      assertCount("The quantity", quantity);
      if (quantity === 0) fail("VALIDATION_FAILED", "The quantity cannot be zero.");
      return { stock: before.stock + quantity, reserved: before.reserved };
    }
  }
}

/**
 * Sum every variant of a product into the aggregate the product row carries.
 *
 * Hidden variants are included on purpose: a variant the shop has stopped
 * listing still holds physical units, and dropping it from the sum would make
 * those units disappear from the shelf count.
 */
export async function variantAggregate(
  ctx: MutationCtx,
  product_slug: string,
): Promise<{ stock: number; reserved: number }> {
  const rows = await ctx.db
    .query("product_variants")
    .withIndex("by_product", (q) => q.eq("product_slug", product_slug))
    .collect();

  return rows.reduce(
    (total, row) => ({
      stock: total.stock + row.stock,
      reserved: total.reserved + (row.reserved ?? 0),
    }),
    { stock: 0, reserved: 0 },
  );
}

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

  // A variant key, when present, makes this a variant movement. An empty or
  // absent key keeps the pre-variants path byte-for-byte.
  const wantedKey = change.variant_key?.trim() ?? "";
  const variant =
    wantedKey === ""
      ? null
      : await ctx.db
          .query("product_variants")
          .withIndex("by_product_key", (q) =>
            q.eq("product_slug", change.slug).eq("key", wantedKey),
          )
          .unique();
  if (wantedKey !== "" && variant === null) {
    fail("NOT_FOUND", "That option is no longer available.");
  }

  // Idempotency: a repeat of an already-applied operation key is a no-op.
  if (change.operation_key !== undefined && change.operation_key !== "") {
    const seen = await ctx.db
      .query("inventory_history")
      .withIndex("by_operation", (q) => q.eq("operation_key", change.operation_key as string))
      .first();
    if (seen !== null) {
      const current =
        variant === null
          ? { stock: product.stock, reserved: product.reserved ?? 0 }
          : { stock: variant.stock, reserved: variant.reserved ?? 0 };
      return {
        ...current,
        on_hand: current.stock + current.reserved,
        skipped: true,
        movement_id: seen._id,
      };
    }
  }

  const before =
    variant === null
      ? { stock: product.stock, reserved: product.reserved ?? 0 }
      : { stock: variant.stock, reserved: variant.reserved ?? 0 };
  const beforeHand = before.stock + before.reserved;

  const next = nextCounts(change.command, before);

  assertCount("The available count", next.stock);
  assertCount("The reserved count", next.reserved);

  const afterHand = next.stock + next.reserved;

  if (variant !== null) {
    // The variant is what physically moved…
    await ctx.db.patch(variant._id, {
      ...change.variant_patch,
      stock: next.stock,
      reserved: next.reserved,
      version: (variant.version ?? 0) + 1,
    });
    // …and the product carries the derived sum, written in the same
    // transaction so the two can never disagree. Re-read *after* the patch so
    // the sum includes the movement just made.
    const aggregate = await variantAggregate(ctx, change.slug);
    await ctx.db.patch(product._id, {
      ...change.patch,
      stock: aggregate.stock,
      reserved: aggregate.reserved,
      version: (product.version ?? 0) + 1,
    });
  } else {
    const patch: Partial<Omit<Doc<"products">, "_id" | "_creationTime">> = {
      ...change.patch,
      stock: next.stock,
      reserved: next.reserved,
      version: (product.version ?? 0) + 1,
    };
    await ctx.db.patch(product._id, patch);
  }

  // No movement means no number changed — a product save that leaves stock
  // alone still writes its copy and version through `patch`, but must not
  // claim a stock change happened.
  const moved = next.stock !== before.stock || next.reserved !== before.reserved;
  let movement_id: Id<"inventory_history"> | null = null;
  if (moved) {
    movement_id = await ctx.db.insert("inventory_history", {
      product_slug: product.slug,
      product_name: product.name,
      // The counts on this row describe the variant when there is one; the
      // product aggregate is left out so the log reads as one honest move
      // rather than two numbers that only add up when you sum them.
      ...(variant !== null ? { variant_key: variant.key, variant_name: variant.name } : {}),
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
