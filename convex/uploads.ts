import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requirePermission } from "./lib/permissions";

/**
 * Staff-only photo uploads (replaces the `product-photos` bucket policies).
 * Client flow: generateUploadUrl → POST the file → savePhoto → https URL.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "uploads.create");
    return await ctx.storage.generateUploadUrl();
  },
});

export const savePhoto = mutation({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "uploads.create");
    if (args.storageId === "") throw new ConvexError({ message: "Photo upload failed." });
    // `storage` ids are system ids (`_storage`), which `db.normalizeId` does not
    // cover; an invalid id simply yields no URL below.
    const storageId = args.storageId as Parameters<typeof ctx.storage.getUrl>[0];
    const url = await ctx.storage.getUrl(storageId);
    if (url === null) throw new ConvexError({ message: "Photo link failed." });
    return url;
  },
});
