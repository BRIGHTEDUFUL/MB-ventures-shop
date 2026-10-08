import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** The single `store_settings` row (Postgres `id = 1`). */
export async function getSettings(ctx: QueryCtx | MutationCtx): Promise<Doc<"store_settings">> {
  const settings = await ctx.db
    .query("store_settings")
    .withIndex("by_key", (q) => q.eq("key", "singleton"))
    .unique();
  if (settings === null) {
    throw new ConvexError({ message: "The store could not load. Please try again." });
  }
  return settings;
}
