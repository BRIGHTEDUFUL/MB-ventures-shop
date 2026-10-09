import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { logActivity } from "./lib/activity";
import type { ProductMaster } from "./lib/dto";
import { fail } from "./lib/errors";
import { requirePermission } from "./lib/permissions";
import { getSettings } from "./lib/settings";
import { isValidEmail, round2, validateMomoRecipient, validateWhatsApp } from "./lib/rules";
import { applyStockChange } from "./lib/stock";
import { trustIcon } from "./schema";

/**
 * Hard ceilings on catalogue payload size. Without these one product could
 * store a megabyte of copy or a thousand gallery slots — nothing else in the
 * stack caps them, and the browser cannot be trusted to.
 */
export const LIMITS = {
  name: 120,
  description: 4000,
  specs: 40,
  gallery: 8,
  reason: 200,
  /** SKU and barcode: short enough to read off a label, long enough for EAN-13. */
  code: 40,
} as const;

/** Product create/update from the staff product editor. */
export const saveProduct = mutation({
  args: {
    isNew: v.boolean(),
    id: v.string(),
    name: v.string(),
    brand: v.string(),
    category: v.string(),
    price: v.number(),
    original_price: v.optional(v.union(v.number(), v.null())),
    stock: v.number(),
    description: v.string(),
    image_key: v.string(),
    gallery: v.array(v.string()),
    specs: v.record(v.string(), v.string()),
    verified: v.boolean(),
    /** Shop-facing codes; blank/absent means "has no code yet". */
    sku: v.optional(v.union(v.string(), v.null())),
    barcode: v.optional(v.union(v.string(), v.null())),
    supplier: v.optional(v.union(v.string(), v.null())),
    /** What the shop pays a unit; staff-only, never in a public DTO. */
    cost_price: v.optional(v.union(v.number(), v.null())),
    /** Below this the product shows as low stock; null/absent = the default. */
    reorder_point: v.optional(v.union(v.number(), v.null())),
    /** Suggested order quantity when it does run low. */
    reorder_quantity: v.optional(v.union(v.number(), v.null())),
    /**
     * `products.version` the editor loaded. Omit it to force the save (used
     * by scripts); the staff form always sends it, so a stale tab loses
     * loudly instead of silently discarding someone else's work.
     */
    expected_version: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "catalogue.edit");

    const slug = args.id.trim().toLowerCase();
    if (slug === "") throw new ConvexError({ message: "Enter a product name." });
    const price = round2(args.price);
    if (!(price > 0)) throw new ConvexError({ message: "Enter a price above zero." });
    if (!Number.isInteger(args.stock) || args.stock < 0) {
      throw new ConvexError({ message: "Stock must be a whole number." });
    }
    const originalPrice =
      args.original_price === null || args.original_price === undefined
        ? null
        : round2(args.original_price);
    if (originalPrice !== null && originalPrice <= price) {
      throw new ConvexError({ message: "Original price must be higher than the sale price." });
    }
    if (args.image_key === "") throw new ConvexError({ message: "Add a main photo." });
    if (args.name.trim() === "") throw new ConvexError({ message: "Enter a product name." });
    if (args.description.trim().length < 10) {
      throw new ConvexError({ message: "Write a short description (at least 10 characters)." });
    }
    if (args.description.length > LIMITS.description) {
      throw new ConvexError({
        message: `Keep the description under ${LIMITS.description} characters.`,
      });
    }
    if (args.name.length > LIMITS.name || args.brand.length > LIMITS.name) {
      throw new ConvexError({ message: "Keep the name and brand under 120 characters." });
    }
    if (Object.keys(args.specs).length > LIMITS.specs) {
      throw new ConvexError({ message: `Keep it to ${LIMITS.specs} specifications or fewer.` });
    }
    if (args.gallery.length > LIMITS.gallery) {
      throw new ConvexError({ message: `Keep it to ${LIMITS.gallery} photos or fewer.` });
    }
    if (args.category === "") throw new ConvexError({ message: "Choose a category." });
    const category = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", args.category))
      .first();
    if (category === null) throw new ConvexError({ message: "Choose a valid category." });

    const existing = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    // Codes are stored normalised (SKU upper-cased, barcode left as digits) so
    // an exact index lookup is also a case-insensitive one. Blank means "no
    // code" and is stored as absent, which keeps the index free of empty keys.
    const sku = (args.sku ?? "").trim().toUpperCase();
    const barcode = (args.barcode ?? "").trim();
    const supplier = (args.supplier ?? "").trim();
    const costPrice =
      args.cost_price === undefined || args.cost_price === null ? null : round2(args.cost_price);
    if (costPrice !== null && costPrice < 0) {
      throw new ConvexError({ message: "Cost cannot be below zero." });
    }
    // Reorder levels are whole units: "low stock" is a shelf decision, not a
    // decimal one. Absent clears the product back to the default threshold.
    const reorderPoint =
      args.reorder_point === undefined || args.reorder_point === null
        ? null
        : Math.round(args.reorder_point);
    const reorderQuantity =
      args.reorder_quantity === undefined || args.reorder_quantity === null
        ? null
        : Math.round(args.reorder_quantity);
    if (reorderPoint !== null && reorderPoint < 0) {
      throw new ConvexError({ message: "The reorder point cannot be below zero." });
    }
    if (reorderQuantity !== null && reorderQuantity < 0) {
      throw new ConvexError({ message: "The reorder quantity cannot be below zero." });
    }
    for (const [label, value] of [
      ["SKU", sku],
      ["Barcode", barcode],
    ] as const) {
      if (value.length > LIMITS.code) {
        throw new ConvexError({ message: `Keep the ${label} under ${LIMITS.code} characters.` });
      }
    }

    // Two listings sharing a code makes scan-to-find land on the wrong one and
    // a label print ambiguous. There is no unique index available for these
    // fields, so this check *is* the uniqueness guarantee — which is why it
    // runs for creates and edits alike, comparing against every other row.
    const codeConflict = async (
      field: "sku" | "barcode",
      value: string,
      label: string,
    ): Promise<void> => {
      if (value === "") return;
      const dupe = await ctx.db
        .query("products")
        .withIndex(field === "sku" ? "by_sku" : "by_barcode", (q) => q.eq(field, value))
        .first();
      if (dupe !== null && (existing === null || dupe._id !== existing._id)) {
        fail("DUPLICATE_SKU", `${label} “${value}” is already used by “${dupe.name}”.`, {
          field,
          value,
          product: dupe.slug,
        });
      }
    };
    await codeConflict("sku", sku, "SKU");
    await codeConflict("barcode", barcode, "Barcode");

    // Stale-editor guard: the form sends the `version` it loaded, so two
    // people editing the same listing cannot silently overwrite each other.
    if (args.expected_version !== undefined && existing !== null) {
      const current = existing.version ?? 0;
      if (current !== args.expected_version) {
        fail(
          "VERSION_CONFLICT",
          "Someone else saved this product first. Reload to see their changes.",
          {
            expected: current,
            your_version: args.expected_version,
          },
        );
      }
    }

    const row = {
      name: args.name.trim(),
      brand: args.brand.trim(),
      category: args.category,
      price,
      original_price: originalPrice,
      description: args.description.trim(),
      image_key: args.image_key,
      gallery: args.gallery,
      specs: args.specs,
      verified: args.verified,
      // `null` clears the field, so deleting a code on the form really
      // removes it rather than leaving a stale value behind.
      sku: sku === "" ? null : sku,
      barcode: barcode === "" ? null : barcode,
      supplier: supplier === "" ? null : supplier,
      cost_price: costPrice ?? null,
      reorder_point: reorderPoint ?? null,
      reorder_quantity: reorderQuantity ?? null,
    };

    if (args.isNew) {
      if (existing !== null) {
        throw new ConvexError({ message: "A product with this link name already exists." });
      }
      // Insert at zero, then move stock through the single writer so the
      // opening quantity is a real, auditable movement like any other. No
      // operation key: the insert and the move share one transaction, and a
      // slug can only ever be created once, so there is nothing to replay.
      await ctx.db.insert("products", {
        slug,
        ...row,
        stock: 0,
        reserved: 0,
        version: 0,
      });
      await applyStockChange(ctx, {
        slug,
        command: { kind: "set_on_hand", value: args.stock },
        movement_type: "opening",
        source: "product",
        reason: "Opening stock on product creation",
        actor_id: actorId,
      });
    } else {
      if (existing === null) throw new ConvexError({ message: "Product not found." });
      await applyStockChange(ctx, {
        slug,
        command: { kind: "set_on_hand", value: args.stock },
        movement_type: "adjustment",
        source: "product",
        reason:
          existing.stock === args.stock && (existing.reserved ?? 0) === 0
            ? "Stock confirmed on the product form"
            : "Stock edited on the product form",
        actor_id: actorId,
        patch: row,
      });
    }

    await logActivity(
      ctx,
      actorId,
      args.isNew ? "product.create" : "product.update",
      `${args.isNew ? "Added" : "Updated"} product “${row.name}” (${moneyHint(row.price)}).`,
    );
    return { ok: true };
  },
});

const moneyHint = (price: number) => `GH₵ ${round2(price)}`;

/**
 * Past orders keep their own item snapshots, so removing a listing is safe —
 * **except** while an order still holds its units. Cancelling an order whose
 * product row is gone silently loses the restock, so those deletions are
 * refused until the order is settled. Featured picks are scrubbed too, so the
 * homepage never points at a product that no longer exists.
 */
export const deleteProduct = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "catalogue.delete");
    const product = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", args.id))
      .first();
    if (product === null) return { ok: true };

    // Bounded: only the newest orders can still hold stock (they are all
    // opened within the retention window we show staff), and open orders are
    // exactly the ones that matter here.
    const open = await ctx.db
      .query("orders")
      .order("desc")
      .take(500)
      .then((rows) =>
        rows.filter(
          (o) => o.status !== "cancelled" && o.items.some((line) => line.id === product.slug),
        ),
      );
    if (open.length > 0) {
      fail(
        "STATE_CONFLICT",
        `“${product.name}” is still held by ${open.length} open order${
          open.length === 1 ? "" : "s"
        } (${open
          .slice(0, 3)
          .map((o) => o.reference)
          .join(
            ", ",
          )}). Cancel those orders first, or mark the product as a sample instead — cancelling an order whose product is gone cannot return its stock.`,
      );
    }

    await ctx.db.delete(product._id);

    const settings = await ctx.db
      .query("store_settings")
      .withIndex("by_key", (q) => q.eq("key", "site"))
      .first();
    if (settings !== null && settings.featured_ids.includes(product.slug)) {
      await ctx.db.patch(settings._id, {
        featured_ids: settings.featured_ids.filter((id) => id !== product.slug),
      });
    }

    await logActivity(
      ctx,
      actorId,
      "product.delete",
      `Removed product “${product.name}” from the catalogue.`,
    );
    return { ok: true };
  },
});

/**
 * Staff-only master data for one product: codes, cost, supplier and reorder
 * levels. Split from `store.get` on purpose — the storefront bundle must never
 * contain what a unit costs, so the editor pays for this extra query instead of
 * everyone paying for the cost price in every page load.
 */
export const productDetail = query({
  args: { slug: v.string() },
  handler: async (ctx, args): Promise<ProductMaster | null> => {
    await requirePermission(ctx, "catalogue.edit");
    const product = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (product === null) return null;
    return {
      slug: product.slug,
      version: product.version ?? 0,
      sku: product.sku ?? null,
      barcode: product.barcode ?? null,
      supplier: product.supplier ?? null,
      cost_price: product.cost_price ?? null,
      reorder_point: product.reorder_point ?? null,
      reorder_quantity: product.reorder_quantity ?? null,
      status: product.status ?? (product.verified ? "active" : "draft"),
    };
  },
});

/**
 * Bulk catalogue actions from the products list: verify/unverify, move
 * category, adjust price by % or fixed amount, set stock (stock take).
 * Price moves keep the "was price" rule by clearing a sale price that is no
 * longer above the new price.
 */
export const bulkUpdate = mutation({
  args: {
    ids: v.array(v.string()),
    changes: v.object({
      category: v.optional(v.string()),
      verified: v.optional(v.boolean()),
      price_percent: v.optional(v.number()),
      price_amount: v.optional(v.number()),
      stock: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "catalogue.bulk");
    if (args.ids.length === 0 || args.ids.length > 200) {
      throw new ConvexError({ message: "Select between 1 and 200 products." });
    }
    const c = args.changes;
    const touchesPrice =
      (c.price_percent !== undefined && c.price_percent !== 0) ||
      (c.price_amount !== undefined && c.price_amount !== 0);
    const touches =
      c.category !== undefined || c.verified !== undefined || c.stock !== undefined || touchesPrice;
    if (!touches) throw new ConvexError({ message: "Nothing to change." });
    if (
      c.price_percent !== undefined &&
      (Number.isNaN(c.price_percent) || Math.abs(c.price_percent) > 90)
    ) {
      throw new ConvexError({ message: "Price change must be between -90% and +90%." });
    }
    if (c.stock !== undefined && (!Number.isInteger(c.stock) || c.stock < 0)) {
      throw new ConvexError({ message: "Stock must be a whole number." });
    }
    if (c.category !== undefined) {
      const category = await ctx.db
        .query("categories")
        .withIndex("by_slug", (q) => q.eq("slug", c.category as string))
        .first();
      if (category === null) throw new ConvexError({ message: "Choose a valid category." });
    }

    let updated = 0;
    let clearedSales = 0;
    for (const id of args.ids) {
      const product = await ctx.db
        .query("products")
        .withIndex("by_slug", (q) => q.eq("slug", id))
        .first();
      if (product === null) continue;

      const patch: Partial<{
        price: number;
        original_price: number | null;
        verified: boolean;
        category: string;
      }> = {};
      if (touchesPrice) {
        let price = product.price;
        if (c.price_percent !== undefined && c.price_percent !== 0) {
          price = round2(price * (1 + c.price_percent / 100));
        }
        if (c.price_amount !== undefined && c.price_amount !== 0) {
          price = round2(price + c.price_amount);
        }
        if (!(price > 0)) {
          throw new ConvexError({ message: `Price for “${product.name}” would drop to zero.` });
        }
        patch.price = price;
        if (product.original_price != null && product.original_price <= price) {
          patch.original_price = null;
          clearedSales += 1;
        }
      }
      if (c.verified !== undefined) patch.verified = c.verified;
      if (c.category !== undefined) patch.category = c.category;

      // Stock never takes the direct path: the count goes through the single
      // writer so reservations are respected and a movement row is written.
      // A bulk count below what open orders already hold is refused rather
      // than quietly overselling.
      if (c.stock !== undefined) {
        await applyStockChange(ctx, {
          slug: product.slug,
          command: { kind: "set_on_hand", value: c.stock },
          movement_type: "adjustment",
          source: "bulk",
          reason: "Bulk stock set",
          actor_id: actorId,
          patch,
          // No operation key: an absolute set is idempotent by construction
          // (re-running it yields the same count), and deriving a key from the
          // content would wrongly skip a *legitimate* later run after sales
          // moved the number. Double-submit is stopped by the busy button.
        });
      } else {
        await ctx.db.patch(product._id, patch);
      }
      updated += 1;
    }

    const parts: string[] = [];
    if (c.verified !== undefined) parts.push(c.verified ? "verified" : "marked as sample");
    if (c.category !== undefined) parts.push(`moved to “${c.category}”`);
    if (touchesPrice) {
      parts.push(
        `price changed ${c.price_percent ? `${c.price_percent > 0 ? "+" : ""}${c.price_percent}%` : `${c.price_amount! > 0 ? "+" : ""}GH₵ ${c.price_amount}`}`,
      );
    }
    if (c.stock !== undefined) parts.push(`stock set to ${c.stock}`);
    await logActivity(
      ctx,
      actorId,
      "product.bulk",
      `Updated ${updated} product${updated === 1 ? "" : "s"}: ${parts.join(", ")}.${
        clearedSales > 0 ? ` Cleared the sale price on ${clearedSales}.` : ""
      }`,
    );
    return { ok: true, updated, clearedSales };
  },
});

/** Caps on the homepage fields staff edit — mirrored by `HOME_LIMITS` in the UI. */
const HOME_BRAND_LIMIT = 6;

/**
 * Storefront settings any staff member may edit: hero copy + images,
 * announcement bar, contact details, WhatsApp, homepage section copy,
 * homepage featured picks and the ordering switch. Delivery fees live in
 * `saveDeliverySettings`; the Mobile Money recipient in `saveMomoSettings`.
 */
export const saveSettings = mutation({
  args: {
    hero_title: v.string(),
    hero_subtitle: v.string(),
    phone: v.string(),
    email: v.string(),
    address: v.string(),
    hours: v.string(),
    announcement: v.string(),
    whatsapp: v.string(),
    hero_image: v.string(),
    setup_image: v.string(),
    ordering_enabled: v.boolean(),
    featured_ids: v.array(v.string()),
    // Homepage section copy (see `HOME_CONTENT_DEFAULTS` for the rules:
    // strings blank out to the default, an empty array hides the section).
    home_category_heading: v.string(),
    home_featured_heading: v.string(),
    home_setup_eyebrow: v.string(),
    home_setup_heading: v.string(),
    home_setup_body: v.string(),
    home_cta_heading: v.string(),
    home_cta_body: v.string(),
    home_brands: v.array(v.string()),
    home_trust: v.array(v.object({ icon: trustIcon, title: v.string(), text: v.string() })),
  },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "catalogue.settings");

    if (args.hero_title.trim() === "") {
      throw new ConvexError({ message: "Enter a headline for the home page." });
    }
    if (args.phone.trim() === "" || args.address.trim() === "") {
      throw new ConvexError({ message: "Enter the shop phone number and address." });
    }
    if (args.email.trim() !== "" && !isValidEmail(args.email)) {
      throw new ConvexError({ message: "Enter a valid email address." });
    }
    if (args.featured_ids.length > 12) {
      throw new ConvexError({ message: "Pick at most 12 featured products." });
    }
    for (const id of args.featured_ids) {
      const product = await ctx.db
        .query("products")
        .withIndex("by_slug", (q) => q.eq("slug", id))
        .first();
      if (product === null) {
        throw new ConvexError({ message: "One of the featured products no longer exists." });
      }
    }

    const whatsappProblem = validateWhatsApp(args.whatsapp);
    if (whatsappProblem !== null) throw new ConvexError({ message: whatsappProblem });

    // Homepage section copy: long enough to say something, short enough to fit.
    for (const [label, value] of [
      ["Category section heading", args.home_category_heading],
      ["Featured section heading", args.home_featured_heading],
      ["Setup eyebrow", args.home_setup_eyebrow],
      ["Setup heading", args.home_setup_heading],
      ["Closing heading", args.home_cta_heading],
    ] as const) {
      if (value.trim().length > 90) {
        throw new ConvexError({ message: `${label} must be 90 characters or fewer.` });
      }
    }
    for (const [label, value] of [
      ["Setup paragraph", args.home_setup_body],
      ["Closing paragraph", args.home_cta_body],
    ] as const) {
      if (value.trim().length > 500) {
        throw new ConvexError({ message: `${label} must be 500 characters or fewer.` });
      }
    }
    // The brand editor is a one-per-line textarea, so blank lines arrive while
    // staff are still typing — drop them rather than rejecting the whole save.
    const brands = args.home_brands.map((brand) => brand.trim()).filter((brand) => brand !== "");
    if (brands.length > HOME_BRAND_LIMIT) {
      throw new ConvexError({ message: `Show at most ${HOME_BRAND_LIMIT} brand names.` });
    }
    for (const brand of brands) {
      if (brand.length > 30) {
        throw new ConvexError({ message: "Brand names must be 30 characters or fewer." });
      }
    }
    // An empty list is how staff hide the strip, so only real rows are checked.
    if (args.home_trust.length > 4) {
      throw new ConvexError({ message: "Show at most 4 trust items." });
    }
    for (const item of args.home_trust) {
      if (item.title.trim() === "") {
        throw new ConvexError({ message: "Every trust item needs a title." });
      }
      if (item.title.trim().length > 60 || item.text.trim().length > 90) {
        throw new ConvexError({
          message: "Trust titles are capped at 60 characters and lines at 90.",
        });
      }
    }

    const settings = await getSettings(ctx);
    if (args.ordering_enabled && (!settings.momo_number.trim() || !settings.momo_name.trim())) {
      throw new ConvexError({
        message: "Enter verified Mobile Money recipient details first (Admin → Money).",
      });
    }

    await ctx.db.patch(settings._id, {
      hero_title: args.hero_title.trim(),
      hero_subtitle: args.hero_subtitle.trim(),
      phone: args.phone.trim(),
      email: args.email.trim(),
      address: args.address.trim(),
      hours: args.hours.trim(),
      announcement: args.announcement.trim(),
      whatsapp: args.whatsapp.trim(),
      hero_image: args.hero_image,
      setup_image: args.setup_image,
      ordering_enabled: args.ordering_enabled,
      featured_ids: args.featured_ids,
      home_category_heading: args.home_category_heading.trim(),
      home_featured_heading: args.home_featured_heading.trim(),
      home_setup_eyebrow: args.home_setup_eyebrow.trim(),
      home_setup_heading: args.home_setup_heading.trim(),
      home_setup_body: args.home_setup_body.trim(),
      home_cta_heading: args.home_cta_heading.trim(),
      home_cta_body: args.home_cta_body.trim(),
      home_brands: brands,
      home_trust: args.home_trust.map((item) => ({
        icon: item.icon,
        title: item.title.trim(),
        text: item.text.trim(),
      })),
    });

    await logActivity(
      ctx,
      actorId,
      "settings.update",
      `Updated storefront settings (ordering ${args.ordering_enabled ? "open" : "closed"}).`,
    );
    return { ok: true };
  },
});

/**
 * Delivery fees and the free-delivery threshold.
 *
 * Staff-editable: these change what a customer pays for *shipping*, but no
 * money is ever routed to the shop by them. The Mobile Money recipient — who
 * actually receives the money — stays admin-only in `saveMomoSettings`.
 */
export const saveDeliverySettings = mutation({
  args: {
    central_fee: v.number(),
    greater_fee: v.number(),
    nationwide_fee: v.number(),
    free_threshold: v.number(),
  },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "catalogue.delivery");

    for (const [label, value] of [
      ["Central delivery fee", args.central_fee],
      ["Greater Accra delivery fee", args.greater_fee],
      ["Nationwide delivery fee", args.nationwide_fee],
      ["Free-delivery threshold", args.free_threshold],
    ] as const) {
      if (Number.isNaN(value) || value < 0) {
        throw new ConvexError({ message: `${label} cannot be negative.` });
      }
    }
    // A dropped decimal (5000 instead of 50) would silently price the shop out
    // of every delivery, so refuse an amount no courier would ever charge.
    if (Math.max(args.central_fee, args.greater_fee, args.nationwide_fee) > 10_000) {
      throw new ConvexError({
        message: "That delivery fee looks too high — enter an amount under GH₵ 10,000.",
      });
    }

    const settings = await getSettings(ctx);
    await ctx.db.patch(settings._id, {
      central_fee: round2(args.central_fee),
      greater_fee: round2(args.greater_fee),
      nationwide_fee: round2(args.nationwide_fee),
      free_threshold: round2(args.free_threshold),
    });

    await logActivity(
      ctx,
      actorId,
      "settings.delivery",
      `Updated delivery fees (Central GH₵ ${args.central_fee}, Greater GH₵ ${args.greater_fee}, Nationwide GH₵ ${args.nationwide_fee}) and free threshold GH₵ ${args.free_threshold}.`,
    );
    return { ok: true };
  },
});

/**
 * The Mobile Money recipient. Admin-floored: this decides whose wallet the
 * money lands in, so it stays behind `catalogue.momo` even though fees moved
 * to staff (`catalogue.delivery`).
 *
 * Validation and the write live in `applyMomoRecipient` so the admin mutation
 * and its CLI twin below always behave the same. The recipient can be rewritten
 * at any time; only *clearing* it needs ordering to be closed first.
 */
export const saveMomoSettings = mutation({
  args: {
    momo_number: v.string(),
    momo_name: v.string(),
  },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "catalogue.momo");

    await applyMomoRecipient(ctx, args.momo_number, args.momo_name);

    await logActivity(ctx, actorId, "settings.momo", "Updated the Mobile Money recipient.");
    return { ok: true };
  },
});

/**
 * Deployment-operator twin of `saveMomoSettings`, for `npx convex run` when no
 * admin session is available (bootstrap, CI, or simply setting the recipient
 * before anyone has signed in):
 *
 *   npx convex run catalogue:setMomo '{"momo_number":"0532767269","momo_name":"Abdul Ganiwu Fusein"}'
 *
 * `internalMutation` keeps it out of the browser completely, it applies the
 * exact same validation as the admin path, and it can be run again whenever the
 * wallet changes — nothing is locked in by having been set once. It writes no
 * activity line: a CLI call has no user to attribute.
 */
export const setMomo = internalMutation({
  args: {
    momo_number: v.string(),
    momo_name: v.string(),
  },
  handler: async (ctx, args) => {
    const saved = await applyMomoRecipient(ctx, args.momo_number, args.momo_name);
    return { ok: true, ...saved };
  },
});

/** Trim, validate and store the recipient. Throws `ConvexError` on bad input. */
async function applyMomoRecipient(
  ctx: MutationCtx,
  rawNumber: string,
  rawName: string,
): Promise<{ momo_number: string; momo_name: string }> {
  const number = rawNumber.trim();
  const name = rawName.trim();

  const invalid = validateMomoRecipient(number, name);
  if (invalid !== null) throw new ConvexError({ message: invalid });

  const settings = await getSettings(ctx);
  if (settings.ordering_enabled && (number === "" || name === "")) {
    throw new ConvexError({
      message: "Turn off ordering before clearing Mobile Money details.",
    });
  }

  await ctx.db.patch(settings._id, { momo_number: number, momo_name: name });
  return { momo_number: number, momo_name: name };
}
