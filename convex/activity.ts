import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireStaff } from "./lib/auth";
import { recentActivity, type ActivityEntry } from "./lib/activity";

/** Newest-first audit feed of catalogue, settings, inventory and role changes. */
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<ActivityEntry[]> => {
    await requireStaff(ctx);
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    return await recentActivity(ctx, limit);
  },
});
