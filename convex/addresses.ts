import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { savedAddressDTO, type SavedAddress } from "./lib/dto";
import { normalizePhone } from "./lib/rules";

/** How many delivery addresses one customer may keep before the list bites back. */
const MAX_ADDRESSES_PER_USER = 20;

/** Same ceilings `users.updateProfile` holds a profile to. */
const LIMITS = { name: { min: 2, max: 100 }, address: { max: 300 }, phone: { max: 15 } } as const;

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

    // Trim first, then validate against the trimmed value — a string that is
    // blank *after* trimming is still blank, so the empty-address refusal
    // keeps meaning exactly what it meant before.
    const address = args.address.trim();
    if (address === "") {
      throw new ConvexError({ message: "Enter a delivery address." });
    }
    if (address.length > LIMITS.address.max) {
      throw new ConvexError({
        message: `Keep the address under ${LIMITS.address.max} characters.`,
      });
    }

    const name = args.name.trim();
    if (name.length < LIMITS.name.min) {
      throw new ConvexError({ message: "Give this address a name — e.g. Home or Office." });
    }
    if (name.length > LIMITS.name.max) {
      throw new ConvexError({ message: `Keep the name under ${LIMITS.name.max} characters.` });
    }

    // The shared normaliser sign-up and checkout already use, so a saved
    // number is stored in the form tracking and `wa.me` would dial. Blank
    // stays blank — the account page saves addresses with no phone today.
    const phone = normalizePhone(args.phone);
    if (phone.length > LIMITS.phone.max) {
      throw new ConvexError({
        message: `That phone number is too long — use at most ${LIMITS.phone.max} digits.`,
      });
    }
    if (phone.length > 0 && phone.length < 9) {
      throw new ConvexError({ message: "Enter a valid phone number with at least 9 digits." });
    }

    // One row per saved place, bounded: without a ceiling a stuck client could
    // fill the table (and the account page) one tap at a time.
    const mine = await ctx.db
      .query("saved_addresses")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .collect();
    if (mine.length >= MAX_ADDRESSES_PER_USER) {
      throw new ConvexError({
        message: `You can keep up to ${MAX_ADDRESSES_PER_USER} saved addresses — remove one before adding another.`,
      });
    }

    await ctx.db.insert("saved_addresses", {
      user_id: userId,
      name,
      address,
      phone,
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
    // Owner-only, mirroring the old `addresses_owner` RLS policy. A stranger's
    // id is a no-op rather than an error: the caller learns nothing about
    // whether the row exists.
    if (doc !== null && doc.user_id === userId) await ctx.db.delete(addressId);
    return { ok: true };
  },
});
