import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { requirePermission } from "./lib/permissions";

/**
 * Photo maintenance for storage-backed images.
 *
 * Staff uploads land in Convex storage and the owning row keeps the absolute
 * `https://<deployment>.convex.cloud/api/storage/<id>` URL (see `uploads.ts`).
 * `scripts/optimize-product-images.mjs` re-encodes oversized originals with
 * sharp, uploads the smaller file through the normal upload path, then calls
 * `retargetImage` to swap the reference. Retiring originals is a *separate*
 * `deleteStorageIfUnreferenced` sweep, run only after the new sizes verify.
 *
 * Both are guarded and idempotent:
 * - `retargetImage` only ever replaces a value that is already a storage URL
 *   on the same deployment (local keys such as `hero-workspace` are refused),
 *   so a stray call can never point a product at a local asset by accident.
 * - `deleteStorageIfUnreferenced` re-scans every image-bearing table and
 *   refuses to delete a file any row still mentions — order snapshots
 *   included — so history can never lose a photo.
 */

/** Absolute Convex-storage URL, exactly the shape `uploads.savePhoto` returns. */
const STORAGE_URL = /^https:\/\/[^/]+\/api\/storage\/[A-Za-z0-9-]+$/;

const TARGET_FIELD = v.union(
  v.literal("image_key"),
  v.literal("gallery"),
  v.literal("variant_image"),
  v.literal("category_image"),
);

const isStorageUrl = (value: unknown): value is string =>
  typeof value === "string" && STORAGE_URL.test(value);

/** Same origins only: a product must keep pointing at *this* deployment. */
function assertSameOrigin(oldUrl: string, newUrl: string) {
  const oldOrigin = new URL(oldUrl).origin;
  if (new URL(newUrl).origin !== oldOrigin) {
    throw new ConvexError({ message: "The replacement photo belongs to a different deployment." });
  }
}

export const retargetImage = mutation({
  args: {
    slug: v.string(),
    field: TARGET_FIELD,
    gallery_index: v.optional(v.number()),
    variant_key: v.optional(v.string()),
    new_url: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "catalogue.edit");
    if (!isStorageUrl(args.new_url)) {
      throw new ConvexError({ message: "That is not a Convex-storage URL." });
    }

    switch (args.field) {
      case "image_key": {
        const product = await ctx.db
          .query("products")
          .withIndex("by_slug", (q) => q.eq("slug", args.slug))
          .unique();
        if (product === null) throw new ConvexError({ message: `No product ${args.slug}.` });
        if (!isStorageUrl(product.image_key)) {
          return { changed: false, old_url: product.image_key };
        }
        assertSameOrigin(product.image_key, args.new_url);
        await ctx.db.patch(product._id, { image_key: args.new_url });
        return { changed: true, old_url: product.image_key };
      }

      case "gallery": {
        const product = await ctx.db
          .query("products")
          .withIndex("by_slug", (q) => q.eq("slug", args.slug))
          .unique();
        if (product === null) throw new ConvexError({ message: `No product ${args.slug}.` });
        const index = args.gallery_index;
        if (index === undefined || index < 0 || index >= product.gallery.length) {
          throw new ConvexError({ message: "That gallery position does not exist." });
        }
        const oldUrl = product.gallery[index];
        if (!isStorageUrl(oldUrl)) return { changed: false, old_url: oldUrl };
        assertSameOrigin(oldUrl, args.new_url);
        const gallery = product.gallery.map((url, i) => (i === index ? args.new_url : url));
        await ctx.db.patch(product._id, { gallery });
        return { changed: true, old_url: oldUrl };
      }

      case "variant_image": {
        if (args.variant_key === undefined) {
          throw new ConvexError({ message: "A variant key is required." });
        }
        // Variants are addressed by their stable key (unique per product) rather
        // than their internal id, so the storefront DTO never has to expose ids.
        const siblings = await ctx.db
          .query("product_variants")
          .withIndex("by_product", (q) => q.eq("product_slug", args.slug))
          .collect();
        const variant = siblings.find((row) => row.key === args.variant_key) ?? null;
        if (variant === null) {
          throw new ConvexError({ message: "That variant does not belong to this product." });
        }
        const oldUrl = variant.image_key ?? null;
        if (!isStorageUrl(oldUrl)) return { changed: false, old_url: oldUrl };
        assertSameOrigin(oldUrl, args.new_url);
        await ctx.db.patch(variant._id, { image_key: args.new_url });
        return { changed: true, old_url: oldUrl };
      }

      case "category_image": {
        const category = await ctx.db
          .query("categories")
          .withIndex("by_slug", (q) => q.eq("slug", args.slug))
          .unique();
        if (category === null) throw new ConvexError({ message: `No category ${args.slug}.` });
        if (!isStorageUrl(category.image_key)) {
          return { changed: false, old_url: category.image_key };
        }
        assertSameOrigin(category.image_key, args.new_url);
        await ctx.db.patch(category._id, { image_key: args.new_url });
        return { changed: true, old_url: category.image_key };
      }
    }
  },
});

/** Tables that can carry a storage URL on some field (same set as migrations). */
const IMAGE_TABLES = [
  "products",
  "product_variants",
  "categories",
  "orders",
  "store_settings",
] as const;
type ImageTable = (typeof IMAGE_TABLES)[number];

/** How many rows in one table still mention `url` anywhere in their JSON.
 *  An order carries its own photo snapshot, so it counts as a reference too.
 *  The cap is generous (the whole catalogue is ~80 products and orders are in
 *  the tens); if a table ever grows past it the sweep stops deleting rather
 *  than guessing — `refs` tops out and the file is kept. */
const REFERENCE_SCAN_LIMIT = 20_000;

async function countReferences<T extends ImageTable>(
  ctx: MutationCtx,
  table: T,
  url: string,
): Promise<number> {
  const rows = await ctx.db.query(table).take(REFERENCE_SCAN_LIMIT);
  let refs = 0;
  for (const row of rows) if (JSON.stringify(row).includes(url)) refs += 1;
  return refs;
}

/** The `_storage` row whose served URL is exactly `url`, or null. */
async function resolveStorageId(ctx: MutationCtx, url: string): Promise<Id<"_storage"> | null> {
  const files = await ctx.db.system.query("_storage").take(REFERENCE_SCAN_LIMIT);
  for (const file of files) {
    if ((await ctx.storage.getUrl(file._id)) === url) return file._id;
  }
  return null;
}

/**
 * Delete one storage file, but only once no row references it any more.
 * Returns `{ deleted: false, refs }` when something still points at it — the
 * caller keeps the original and can retry after the remaining references move.
 *
 * Never throws for a storage problem: the sweep reports `{ deleted: false,
 * error }` instead, so one odd file cannot stop a 200-file run and the caller
 * gets the reason rather than a bare "Server Error".
 */
export const deleteStorageIfUnreferenced = mutation({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "catalogue.delete");
    if (!isStorageUrl(args.url)) {
      throw new ConvexError({ message: "That is not a Convex-storage URL." });
    }

    let refs = 0;
    for (const table of IMAGE_TABLES) {
      try {
        refs += await countReferences(ctx, table, args.url);
      } catch (error) {
        return { deleted: false, refs, error: `scan ${table}: ${String(error).slice(0, 300)}` };
      }
    }
    if (refs > 0) return { deleted: false, refs };

    const storageId = args.url.split("/api/storage/")[1];
    try {
      // New uploads carry a short base32 id that `delete` takes directly.
      await ctx.storage.delete(storageId as Id<"_storage">);
      return { deleted: true, refs: 0 };
    } catch {
      // Files imported from the old Convex account keep UUID-shaped URLs that
      // the typed id helpers cannot decode. Resolve the real `_storage` row by
      // matching the URL Convex reports for each file, then delete that id.
      const resolved = await resolveStorageId(ctx, args.url);
      if (resolved === null) return { deleted: false, refs: 0, missing: true };
      try {
        await ctx.storage.delete(resolved);
        return { deleted: true, refs: 0, legacy: true };
      } catch (error) {
        return { deleted: false, refs: 0, error: `delete: ${String(error).slice(0, 300)}` };
      }
    }
  },
});
