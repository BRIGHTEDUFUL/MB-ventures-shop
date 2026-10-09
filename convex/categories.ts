import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { logActivity } from "./lib/activity";
import { requirePermission } from "./lib/permissions";

/** Same slug rules the product editor uses (link name = lowercase kebab). */
const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Category create/update: name, short name, image, sort order, visibility. */
export const save = mutation({
  args: {
    isNew: v.boolean(),
    id: v.string(),
    name: v.string(),
    short_name: v.string(),
    image_key: v.string(),
    sort_order: v.number(),
    visible: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "catalogue.categories");

    const name = args.name.trim();
    if (name === "") throw new ConvexError({ message: "Enter a category name." });
    const slug = args.isNew ? slugify(args.id || name) : args.id;
    if (slug === "") throw new ConvexError({ message: "Enter a category name." });
    if (!Number.isInteger(args.sort_order) || args.sort_order < 0) {
      throw new ConvexError({ message: "Sort order must be a whole number." });
    }

    const existing = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (args.isNew && existing !== null) {
      throw new ConvexError({ message: "A category with this link name already exists." });
    }
    if (!args.isNew && existing === null) {
      throw new ConvexError({ message: "Category not found." });
    }

    const row = {
      slug,
      name,
      short_name: args.short_name.trim() || name,
      image_key: args.image_key,
      sort_order: args.sort_order,
      visible: args.visible,
    };
    if (args.isNew) await ctx.db.insert("categories", row);
    else await ctx.db.patch(existing!._id, row);

    await logActivity(
      ctx,
      actorId,
      args.isNew ? "category.create" : "category.update",
      `${args.isNew ? "Added" : "Updated"} category “${name}”.`,
    );
    return { ok: true };
  },
});

/**
 * Category delete. Blocked while products still point at it so the storefront
 * never loses listings silently — move them first, then delete.
 */
export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "catalogue.categories");
    const category = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", args.id))
      .first();
    if (category === null) return { ok: true };

    const products = await ctx.db.query("products").collect();
    const inUse = products.filter((p) => p.category === args.id).length;
    if (inUse > 0) {
      throw new ConvexError({
        message: `${inUse} product${inUse === 1 ? " still uses" : "s still use"} this category. Move them to another category first.`,
      });
    }

    await ctx.db.delete(category._id);
    await logActivity(ctx, actorId, "category.delete", `Removed category “${category.name}”.`);
    return { ok: true };
  },
});
