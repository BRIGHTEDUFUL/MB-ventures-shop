import { internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { requirePermission } from "./lib/permissions";

/**
 * Data health scan — the reusable checker behind `/staff/health` and the
 * daily cron.
 *
 * It is read-only: it never changes a row. Every finding explains itself and
 * carries a human fix, so the page can tell staff exactly what to do. Fixes
 * that would touch stock belong in `inventory.ts` (they must go through
 * `applyStockChange` and leave a movement), not here.
 *
 * All reads are bounded: products and categories are collected in full (they
 * are catalogue-sized), orders are capped at `ORDER_SAMPLE` newest rows so
 * the scan stays fast at scale.
 */

/** Newest orders inspected for dangling product references. */
const ORDER_SAMPLE = 2000;
/** Example subjects attached to a finding before it stops listing them. */
const SUBJECT_SAMPLE = 20;

export type Severity = "critical" | "high" | "medium" | "low";

export type HealthFinding = {
  /** Stable machine code, safe to match on in tests and docs. */
  code: string;
  severity: Severity;
  /** One line saying what is wrong. */
  title: string;
  /** Why it matters. */
  detail: string;
  /** The manual instruction, or what the fixer will do. */
  fix: string;
  /** Up to `SUBJECT_SAMPLE` slugs/references proving the finding. */
  subjects: string[];
  total: number;
  /** True when a one-click fix exists (always with a dry-run preview). */
  fixable: boolean;
};

export type HealthReport = {
  findings: HealthFinding[];
  checked: { products: number; orders: number; categories: number };
  scanned_at: string;
};

const finding = (
  code: string,
  severity: Severity,
  title: string,
  detail: string,
  fix: string,
  subjects: string[],
  fixable = false,
): HealthFinding => ({
  code,
  severity,
  title,
  detail,
  fix,
  subjects: subjects.slice(0, SUBJECT_SAMPLE),
  total: subjects.length,
  fixable,
});

/**
 * The scan itself. Takes `QueryCtx` so both the staff query and the daily
 * cron can call the exact same code.
 */
export async function scanHealth(ctx: QueryCtx): Promise<HealthReport> {
  const [products, categories, orders] = await Promise.all([
    ctx.db.query("products").collect(),
    ctx.db.query("categories").collect(),
    ctx.db.query("orders").order("desc").take(ORDER_SAMPLE),
  ]);

  const findings: HealthFinding[] = [];
  const categorySlugs = new Set(categories.map((c) => c.slug));

  // ── Duplicate slugs ───────────────────────────────────────────────────
  // `products.by_slug` is how checkout, staff edits and the storefront find a
  // product; two rows sharing one slug makes `.unique()` throw and lets an
  // edit land on the wrong listing.
  const bySlug = new Map<string, string[]>();
  for (const p of products) bySlug.set(p.slug, [...(bySlug.get(p.slug) ?? []), p.name]);
  const dupSlugs = [...bySlug.entries()].filter(([, names]) => names.length > 1);
  if (dupSlugs.length > 0) {
    findings.push(
      finding(
        "duplicate_slug",
        "critical",
        `${dupSlugs.length} link name${dupSlugs.length === 1 ? " is" : "s are"} shared by several products`,
        "The link name (slug) is the product's identity. Duplicates break editing, checkout lookups and the storefront URL.",
        "Open each product below and give it a unique link name. Keep the product with the real stock history and move the others onto their own names.",
        dupSlugs.flatMap(([slug]) => [slug]),
      ),
    );
  }

  // ── Negative or impossible quantities ─────────────────────────────────
  const negative = products.filter((p) => !Number.isInteger(p.stock) || p.stock < 0);
  if (negative.length > 0) {
    findings.push(
      finding(
        "negative_stock",
        "critical",
        `${negative.length} product${negative.length === 1 ? " has" : "s have"} a stock count below zero`,
        "A negative count means an adjustment or a sale went through without enough units. The storefront shows a confusing negative count and the ledger cannot explain it.",
        "Open Inventory, read the movement log for each product, then add a correction with a reason so the count returns to the real shelf quantity.",
        negative.map((p) => p.slug),
      ),
    );
  }

  // ── Missing or impossible price ───────────────────────────────────────
  const noPrice = products.filter((p) => !(p.price > 0));
  if (noPrice.length > 0) {
    findings.push(
      finding(
        "missing_price",
        "critical",
        `${noPrice.length} product${noPrice.length === 1 ? " has" : "s have"} no usable price`,
        "A product without a price above zero cannot be sold and renders as GH₵ 0 on the storefront.",
        "Edit each product and enter its real selling price.",
        noPrice.map((p) => p.slug),
      ),
    );
  }

  // ── Sale price that is not actually a saving ──────────────────────────
  const badSale = products.filter(
    (p) =>
      p.original_price != null && p.original_price !== undefined && p.original_price <= p.price,
  );
  if (badSale.length > 0) {
    findings.push(
      finding(
        "invalid_sale_price",
        "high",
        `${badSale.length} product${badSale.length === 1 ? " shows" : "s show"} a “was” price that is not above the price`,
        "The storefront only draws a strikethrough when the old price sits above the current one, so these products claim a saving of nothing.",
        "Either lower the current price or clear the “was price” field on each product.",
        badSale.map((p) => p.slug),
      ),
    );
  }

  // ── Missing category ──────────────────────────────────────────────────
  const orphanCategory = products.filter((p) => !categorySlugs.has(p.category));
  if (orphanCategory.length > 0) {
    findings.push(
      finding(
        "missing_category",
        "high",
        `${orphanCategory.length} product${orphanCategory.length === 1 ? " points" : "s point"} at a category that no longer exists`,
        "These listings vanish from every category page and from the staff category filter, which makes them invisible to shoppers.",
        "Edit each product and choose a category that exists, or re-create the category it named.",
        orphanCategory.map((p) => p.slug),
      ),
    );
  }

  // ── Products in a hidden category ─────────────────────────────────────
  const hiddenCategory = new Set(categories.filter((c) => !c.visible).map((c) => c.slug));
  const inHidden = products.filter((p) => hiddenCategory.has(p.category));
  if (inHidden.length > 0) {
    findings.push(
      finding(
        "hidden_category_products",
        "medium",
        `${inHidden.length} product${inHidden.length === 1 ? " sits" : "s sit"} in a hidden category`,
        "Hidden categories are not shown in the storefront navigation, so these products can only be reached by a direct link.",
        "Show the category again from Categories, or move these products into a visible one.",
        inHidden.map((p) => p.slug),
      ),
    );
  }

  // ── Broken image references ───────────────────────────────────────────
  // `image_key` is either a bundled photo key or a full https URL from staff
  // upload. Anything else renders the desk fallback, which is a wrong photo
  // rather than a visible failure.
  const known = (key: string) => key === "" || /^https:\/\//.test(key) || /^[a-z0-9-]+$/.test(key);
  const brokenImage = products.filter((p) => !known(p.image_key) || p.image_key === "");
  if (brokenImage.length > 0) {
    findings.push(
      finding(
        "missing_image",
        "medium",
        `${brokenImage.length} product${brokenImage.length === 1 ? " has" : "s have"} no main photo`,
        "A product without a usable photo falls back to a generic desk picture, which misrepresents the item.",
        "Edit each product and upload its photo (or pick one of the bundled shop photos).",
        brokenImage.map((p) => p.slug),
      ),
    );
  }

  // ── Thin description ──────────────────────────────────────────────────
  const thinDescription = products.filter((p) => p.description.trim().length < 10);
  if (thinDescription.length > 0) {
    findings.push(
      finding(
        "missing_description",
        "low",
        `${thinDescription.length} product${thinDescription.length === 1 ? " has" : "s have"} almost no description`,
        "Shoppers cannot judge the item, and search engines have nothing to index.",
        "Write a sentence or two for each product in the product editor.",
        thinDescription.map((p) => p.slug),
      ),
    );
  }

  // ── Orders that name products which no longer exist ───────────────────
  // Order lines are snapshots (name, price, image) so a deleted product does
  // not corrupt history — but stock can no longer be returned to it, and the
  // staff order page shows a dead link.
  const productIds = new Set(products.map((p) => p.slug));
  const dangling: string[] = [];
  for (const order of orders) {
    if (order.items.some((line) => !productIds.has(line.id))) dangling.push(order.reference);
  }
  if (dangling.length > 0) {
    findings.push(
      finding(
        "order_missing_product",
        "medium",
        `${dangling.length} order${dangling.length === 1 ? " references" : "s reference"} a product that was removed`,
        "Past orders keep their own snapshots, so nothing is corrupted — but cancelling one of these orders cannot return its stock, because the product row is gone.",
        "Re-create the product with the same link name before cancelling any of these orders, so the restock has somewhere to land.",
        dangling,
      ),
    );
  }

  // ── Verified listings with nothing to sell ────────────────────────────
  const verifiedOutOfStock = products.filter((p) => p.verified && p.stock === 0);
  if (verifiedOutOfStock.length > 0) {
    findings.push(
      finding(
        "verified_out_of_stock",
        "low",
        `${verifiedOutOfStock.length} verified product${verifiedOutOfStock.length === 1 ? " is" : "s are"} out of stock`,
        "These are live listings that shoppers can see but cannot buy, which is honest but costs a sale.",
        "Receive stock for each product, or mark it as a sample until it is back.",
        verifiedOutOfStock.map((p) => p.slug),
        true,
      ),
    );
  }

  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.code.localeCompare(b.code));

  return {
    findings,
    checked: { products: products.length, orders: orders.length, categories: categories.length },
    scanned_at: new Date().toISOString(),
  };
}

/** Staff-facing report for the Data health page. */
export const report = query({
  args: {},
  handler: async (ctx): Promise<HealthReport> => {
    await requirePermission(ctx, "inventory.health");
    return await scanHealth(ctx);
  },
});

/** Unauthenticated entry point for tests and `npx convex run`. */
export const scan = internalQuery({
  args: {},
  handler: async (ctx): Promise<HealthReport> => await scanHealth(ctx),
});

/**
 * The daily check. It never changes data — it writes one activity line the
 * next admin sees on the dashboard, and only when the *set of critical and
 * high findings* differs from the last alert, so a standing problem is not
 * re-announced every night.
 */
export const dailyCheck = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ alerted: boolean; critical: number; high: number }> => {
    const report = await scanHealth(ctx);
    const serious = report.findings.filter(
      (f) => f.severity === "critical" || f.severity === "high",
    );
    const critical = report.findings.filter((f) => f.severity === "critical").length;
    const high = report.findings.filter((f) => f.severity === "high").length;

    // What the previous alert said, so an unchanged problem stays quiet.
    const recent = await ctx.db.query("activity_log").order("desc").take(50);
    const previous = recent.find((row) => row.action === "health.alert");
    const codes = serious
      .map((f) => f.code)
      .sort()
      .join(",");
    if (previous !== undefined && previous.summary === codes) {
      return { alerted: false, critical, high };
    }
    if (codes === "") {
      // Everything is healthy again — say so once, then stay quiet.
      if (previous !== undefined && previous.summary === "") {
        return { alerted: false, critical, high };
      }
    }

    await ctx.db.insert("activity_log", {
      actor_name: "Inventory health check",
      action: "health.alert",
      summary:
        codes === ""
          ? ""
          : `${critical} critical, ${high} high inventory finding${critical + high === 1 ? "" : "s"}: ${codes}`,
    });
    return { alerted: true, critical, high };
  },
});
