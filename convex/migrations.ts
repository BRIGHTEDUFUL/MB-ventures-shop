import { v } from "convex/values";
import { internalMutation, type QueryCtx } from "./_generated/server";
import { stockStateOf } from "./lib/stock";

/**
 * Backfill for the available/reserved split (D1 in `docs/INVENTORY-DECISIONS.md`).
 *
 * Before the split, `orders.place` decremented `products.stock` outright and
 * cancellation added it back. That means every *open* order placed by the old
 * code has its units missing from the shelf count (`stock` is already down,
 * `reserved` was never set), and every product row is missing `reserved`,
 * `version` and `status` entirely.
 *
 * This fixes both, and is safe to run as many times as you like:
 *
 * - **Idempotent** — a product is only topped up by the units of orders that
 *   have no `stock_state` yet; once an order is stamped it never contributes
 *   again, so a re-run finds nothing to do.
 * - **Batched** — `batch` documents are touched per call, so no single
 *   transaction grows with the size of the shop.
 * - **Dry run first** — `{ dry_run: true }` reports exactly what a real run
 *   would change and writes nothing.
 *
 * Rollback: restore the export taken immediately before the real run
 * (`npx convex export --path backups/<label>.zip`). There is no forward "undo",
 * because the whole point is that the numbers were wrong before.
 *
 * Run:
 *   npx convex run migrations:backfillReservations '{"dry_run":true}'
 *   npx convex run migrations:backfillReservations '{}'
 *   npx convex run migrations:backfillReservations '{"verify":true}'
 */

type Report = {
  dry_run: boolean;
  products_touched: number;
  orders_stamped: number;
  reserved_added: number;
  /** Set by `verify`: does the data agree with itself? */
  verified?: boolean;
  problems: string[];
};

/**
 * Units an order still holds. An order with no `stock_state` is read with the
 * same rule the order path uses, so legacy rows behave identically before and
 * after this migration.
 */
function unitsHeld(
  order: { items: { quantity: number }[]; status: string; stock_state?: string },
  state: ReturnType<typeof stockStateOf>,
): number {
  // Only a pre-dispatch hold adds to `reserved`. Cancelled orders already gave
  // their units back and completed ones already left the shelf.
  if (state !== "reserved") return 0;
  return order.items.reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * Backfill `products.reserved` (+ `version`) and stamp `orders.stock_state`.
 * Pass `{ dry_run: true }` to see the plan without writing.
 */
export const backfillReservations = internalMutation({
  args: {
    dry_run: v.optional(v.boolean()),
    /** Stop after this many orders/products; 0 means "everything". */
    batch: v.optional(v.number()),
    /** Run the read-only consistency check instead of the backfill. */
    verify: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Report> => {
    const dryRun = args.dry_run === true;
    const batch = Math.max(args.batch ?? 0, 0);
    const report: Report = {
      dry_run: dryRun || args.verify === true,
      products_touched: 0,
      orders_stamped: 0,
      reserved_added: 0,
      problems: [],
    };

    if (args.verify === true) return await verify(ctx, report);

    // 1. Work out what each product owes, from orders that are not stamped yet.
    const orders = await ctx.db
      .query("orders")
      .order("asc")
      .take(batch > 0 ? batch * 4 : 10_000);
    const owed = new Map<string, number>(); // product slug -> units held
    let stamped = 0;

    for (const order of orders) {
      if (order.stock_state !== undefined) continue; // already migrated
      const state = stockStateOf(order);
      const held = unitsHeld(order, state);
      if (held > 0) {
        for (const line of order.items) {
          owed.set(line.id, (owed.get(line.id) ?? 0) + line.quantity);
        }
      }
      stamped += 1;
      if (!dryRun) await ctx.db.patch(order._id, { stock_state: state });
      if (batch > 0 && stamped >= batch) break;
    }

    // 2. Apply each product's total once, so N open orders cost one patch.
    let touched = 0;
    let added = 0;
    for (const [slug, units] of owed) {
      const product = await ctx.db
        .query("products")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();
      if (product === null) {
        // The listing was deleted while the order was open; `deleteProduct`
        // now refuses that, but old data may still contain it. The order
        // keeps its own snapshot, so this is a note, not a failure.
        report.problems.push(`order references a missing product “${slug}”`);
        continue;
      }
      const before = product.reserved ?? 0;
      const after = before + units;
      touched += 1;
      added += units;
      if (!dryRun) {
        await ctx.db.patch(product._id, {
          reserved: after,
          version: product.version ?? 0,
          status: product.status ?? "active",
        });
      }
    }

    // 3. Bring every *other* product up to the new field set: a listing with
    // no `version` cannot take part in the stale-edit guard, and one with no
    // `reserved` reads as "nothing is held", which is only true by luck.
    // Products already handled above are skipped, so each row is touched once.
    const already = new Set(owed.keys());
    const rest = await ctx.db
      .query("products")
      .order("asc")
      .take(batch > 0 ? batch : 10_000);
    for (const product of rest) {
      if (already.has(product.slug)) continue;
      const needsFields =
        product.version === undefined ||
        product.reserved === undefined ||
        product.status === undefined;
      if (!needsFields) continue;
      touched += 1;
      if (!dryRun) {
        await ctx.db.patch(product._id, {
          reserved: product.reserved ?? 0,
          version: product.version ?? 0,
          // `active`, not `draft` for unverified rows: today *every* listed
          // product is on the storefront, and unverified ones are held back by
          // `verified` blocking checkout rather than by being hidden. Deriving
          // `status` from `verified` here would silently remove the
          // demonstration listings from the shop — a behaviour change dressed
          // up as a backfill.
          status: product.status ?? "active",
        });
      }
    }

    report.products_touched = touched;
    report.orders_stamped = stamped;
    report.reserved_added = added;
    return report;
  },
});

/** Read-only consistency check: does reserved match what open orders hold? */
async function verify(ctx: QueryCtx, report: Report): Promise<Report> {
  const products = await ctx.db.query("products").collect();
  const orders = await ctx.db.query("orders").order("desc").take(5000);

  const owed = new Map<string, number>();
  for (const order of orders) {
    if (stockStateOf(order) !== "reserved") continue;
    for (const line of order.items) {
      owed.set(line.id, (owed.get(line.id) ?? 0) + line.quantity);
    }
  }

  for (const product of products) {
    const reserved = product.reserved ?? 0;
    const should = owed.get(product.slug) ?? 0;
    if (reserved !== should) {
      report.problems.push(
        `${product.slug}: products.reserved is ${reserved}, open orders hold ${should}`,
      );
    }
    if (product.stock < 0 || reserved < 0) {
      report.problems.push(`${product.slug}: negative stock (${product.stock}/${reserved})`);
    }
    if (product.version === undefined) {
      report.problems.push(`${product.slug}: missing products.version`);
    }
  }

  // An unstamped order means the backfill has not run (or new legacy rows
  // arrived); either way the report should say so rather than look clean.
  const unstamped = orders.filter((order) => order.stock_state === undefined);
  if (unstamped.length > 0) {
    report.problems.push(`${unstamped.length} order(s) still have no stock_state`);
  }

  report.verified = report.problems.length === 0;
  report.products_touched = products.length;
  report.orders_stamped = orders.length;
  return report;
}
