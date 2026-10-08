import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { savedAddressDTO, type SavedAddress } from "./lib/dto";

/** Saved delivery addresses for the signed-in customer only. */
export const list = query({
  args: {},
  handler: async (ctx): Promise<SavedAddress[]> => {
    const userId = await requireUser(ctx);
    const addresses = await ctx.db
      .query("saved_addresses")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .collect();
    return addresses.map(savedAddressDTO);
  },
});

export const add = mutation({
  args: { name: v.string(), address: v.string(), phone: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (args.address.trim() === "") {
      throw new ConvexError({ message: "Enter a delivery address." });
    }
    await ctx.db.insert("saved_addresses", {
      user_id: userId,
      name: args.name,
      address: args.address.trim(),
      phone: args.phone,
    });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const addressId = ctx.db.normalizeId("saved_addresses", args.id);
    if (addressId === null) return { ok: true };
    const doc = await ctx.db.get(addressId);
    // Owner-only, mirroring the old `addresses_owner` RLS policy.
    if (doc !== null && doc.user_id === userId) await ctx.db.delete(addressId);
    return { ok: true };
  },
});
