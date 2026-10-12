import { ConvexError } from "convex/values";
import { query } from "./_generated/server";
import {
  categoryDTO,
  productDTO,
  settingsDTO,
  variantDTO,
  type StoreData,
  type Variant,
} from "./lib/dto";
import { getSettings } from "./lib/settings";

/**
 * Public storefront bundle: products + categories + settings.
 * Replaces the old `getStore` TanStack server function.
 * Readable by anyone — visiting the shop never requires an account.
 */
export const get = query({
  args: {},
  handler: async (ctx): Promise<StoreData> => {
    let settings;
    try {
      settings = await getSettings(ctx);
    } catch (error) {
      // Same copy the old server function surfaced on the storefront.
      if (error instanceof ConvexError) throw error;
      throw new ConvexError({ message: "The store could not load. Please try again." });
    }

    const [products, categories, variantRows] = await Promise.all([
      ctx.db.query("products").collect(),
      ctx.db.query("categories").collect(),
      ctx.db.query("product_variants").collect(),
    ]);

    // Group once rather than per product: this runs on every page of the shop.
    const byProduct = new Map<string, Variant[]>();
    for (const row of variantRows) {
      const list = byProduct.get(row.product_slug) ?? [];
      list.push(variantDTO(row));
      byProduct.set(row.product_slug, list);
    }

    return {
      // Postgres used `.order('id')` for products and `sort_order` for categories.
      products: [...products]
        .sort((a, b) => a.slug.localeCompare(b.slug))
        .map((product) => {
          const variants = byProduct.get(product.slug) ?? [];
          // The key is the tie-break so a re-save never shuffles the picker,
          // and every surface (storefront, cart, staff) reads rows in the
          // same order.
          variants.sort((a, b) => (a.key > b.key ? 1 : a.key < b.key ? -1 : 0));
          return productDTO(product, variants);
        }),
      categories: [...categories].sort((a, b) => a.sort_order - b.sort_order).map(categoryDTO),
      settings: settingsDTO(settings),
    };
  },
});
