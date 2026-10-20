import { v } from "convex/values";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { applyStockChange, stockStateOf, variantAggregate } from "./lib/stock";

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

/**
 * Re-derive every options product's `stock`/`reserved` from its options.
 *
 * The product row carries the *sum* of its options — that invariant lives in
 * `applyStockChange` — but two writes could still detach it: the old
 * `saveProduct`, which set the parent's stock straight from the form (now
 * fixed and made read-only), and anything written outside the single writer.
 * This reconciles the totals the way every real movement does: a no-op
 * movement on one option, which refreshes the aggregate in the same
 * transaction and writes no ledger row, because nothing actually moved.
 *
 * - **Idempotent** — a product already in agreement is skipped; re-running
 *   finds nothing to do.
 * - **Dry run first** — `{ dry_run: true }` reports what would change without
 *   writing.
 *
 * Run:
 *   npx convex run migrations:reconcileVariantAggregates '{"dry_run":true}'
 *   npx convex run migrations:reconcileVariantAggregates '{}'
 */
export const reconcileVariantAggregates = internalMutation({
  args: { dry_run: v.optional(v.boolean()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ dry_run: boolean; checked: number; reconciled: string[] }> => {
    const products = await ctx.db.query("products").collect();
    const reconciled: string[] = [];
    let checked = 0;

    for (const product of products) {
      const options = await ctx.db
        .query("product_variants")
        .withIndex("by_product", (q) => q.eq("product_slug", product.slug))
        .collect();
      const first = options[0];
      if (first === undefined) continue; // not an options product
      checked += 1;

      const aggregate = await variantAggregate(ctx, product.slug);
      if (product.stock === aggregate.stock && (product.reserved ?? 0) === aggregate.reserved) {
        continue; // already agrees with itself
      }

      reconciled.push(
        `${product.slug}: product said ${product.stock}/${product.reserved ?? 0}, options add up to ${aggregate.stock}/${aggregate.reserved}`,
      );
      if (args.dry_run !== true) {
        await applyStockChange(ctx, {
          slug: product.slug,
          variant_key: first.key,
          // The same on-hand this option already holds: nothing moves and no
          // movement is written, but the product's totals are refreshed from
          // every option through the single writer.
          command: { kind: "set_on_hand", value: first.stock + (first.reserved ?? 0) },
          movement_type: "adjustment",
          source: "import",
          reason: "Option totals reconciled — product total re-derived",
        });
      }
    }

    return { dry_run: args.dry_run === true, checked, reconciled };
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

/**
 * Point every Convex-storage image URL at a new deployment host.
 *
 * Staff-uploaded photos live on the product / category / order rows as absolute
 * URLs (`https://<deployment>.convex.cloud/api/storage/<id>`). Moving a database
 * to a different deployment keeps each file's `_storage` id (the import tool
 * preserves them) but the baked-in host still names the *old* deployment, so
 * every image would 404. This swaps that one hostname, string-for-string, deep
 * into every row that holds one — `gallery[]`, `variants[].image_key` and
 * `items[].image_key` included.
 *
 * - **Idempotent** — a row already on the new host is skipped; re-running finds
 *   nothing to do.
 * - **Dry run first** — `{ dry_run: true }` reports exactly what a real run
 *   would change (218 references across 79 products / variants / categories /
 *   1 order) without writing.
 *
 * The ZIP itself is never edited — Convex documents that as unsupported — so
 * the snapshot imports pristine and this corrects the host afterwards.
 *
 * Run (against the target deployment):
 *   npx convex run migrations:rewriteStorageHost '{"old_host":"necessary-newt-861.convex.cloud","new_host":"earnest-fennec-109.convex.cloud","dry_run":true}'
 *   npx convex run migrations:rewriteStorageHost '{"old_host":"…","new_host":"…"}'
 */

/** Tables that can carry a storage URL on some field. */
type ImageTable = "products" | "product_variants" | "categories" | "orders" | "store_settings";

/** Replace `oldHost` with `newHost` in every string, at any depth. */
function deepSwap(value: unknown, oldHost: string, newHost: string): unknown {
  if (typeof value === "string") return value.split(oldHost).join(newHost);
  if (Array.isArray(value)) return value.map((item) => deepSwap(item, oldHost, newHost));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = deepSwap(item, oldHost, newHost);
    return out;
  }
  return value;
}

/**
 * Swap the host across one table. Called with a concrete table literal so `T`
 * stays a single table per call — that keeps `ctx.db.replace(id, doc)` exactly
 * typed instead of a union the compiler cannot line up.
 */
async function swapHostsIn<T extends ImageTable>(
  ctx: MutationCtx,
  table: T,
  oldHost: string,
  newHost: string,
  dryRun: boolean,
): Promise<{ docs: number; changed: number; refs: number; touched: string[] }> {
  const rows = await ctx.db.query(table).take(10_000);
  let changed = 0;
  let refs = 0;
  const touched: string[] = [];
  for (const row of rows) {
    const json = JSON.stringify(row);
    const hits = json.split(oldHost).length - 1;
    if (hits === 0) continue;
    refs += hits;
    changed += 1;
    touched.push(String(row._id));
    if (!dryRun) {
      // deepSwap edits only string contents — the document's shape, `_id` and
      // `_creationTime` are never touched — so the swapped value is still this
      // exact row. The structural cast sidesteps `replace`'s generic, which
      // cannot unify an abstract `Id<T>` with its value while `T` is unresolved.
      const looseDb = ctx.db as unknown as {
        replace(id: string, value: object): Promise<void>;
      };
      await looseDb.replace(row._id, deepSwap(row, oldHost, newHost) as object);
    }
  }
  return { docs: rows.length, changed, refs, touched };
}

/**
 * Sweep the image tables and repoint every storage URL at `new_host`.
 * Pass `{ dry_run: true }` first: it reports `refs` (how many URLs would move)
 * and `changed` (how many rows) with no writes.
 */
export const rewriteStorageHost = internalMutation({
  args: {
    old_host: v.string(),
    new_host: v.string(),
    dry_run: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dry_run === true;
    // Explicit literals: one concrete `T` per call (see swapHostsIn).
    const results = [
      await swapHostsIn(ctx, "products", args.old_host, args.new_host, dryRun),
      await swapHostsIn(ctx, "product_variants", args.old_host, args.new_host, dryRun),
      await swapHostsIn(ctx, "categories", args.old_host, args.new_host, dryRun),
      await swapHostsIn(ctx, "orders", args.old_host, args.new_host, dryRun),
      await swapHostsIn(ctx, "store_settings", args.old_host, args.new_host, dryRun),
    ];
    let docs = 0;
    let changed = 0;
    let refs = 0;
    const touched: string[] = [];
    for (const result of results) {
      docs += result.docs;
      changed += result.changed;
      refs += result.refs;
      touched.push(...result.touched);
    }
    return { dry_run: dryRun, docs, changed, refs, touched: touched.slice(0, 200) };
  },
});
