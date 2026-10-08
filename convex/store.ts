import { ConvexError } from "convex/values";
import { query } from "./_generated/server";
import { categoryDTO, productDTO, settingsDTO, type StoreData } from "./lib/dto";
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

    const [products, categories] = await Promise.all([
      ctx.db.query("products").collect(),
      ctx.db.query("categories").collect(),
    ]);

    return {
      // Postgres used `.order('id')` for products and `sort_order` for categories.
      products: [...products].sort((a, b) => a.slug.localeCompare(b.slug)).map(productDTO),
      categories: [...categories].sort((a, b) => a.sort_order - b.sort_order).map(categoryDTO),
      settings: settingsDTO(settings),
    };
  },
});
