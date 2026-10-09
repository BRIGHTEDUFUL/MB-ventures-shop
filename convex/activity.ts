import { v } from "convex/values";
import { query } from "./_generated/server";
import { recentActivity, type ActivityEntry } from "./lib/activity";
import { requirePermission } from "./lib/permissions";

/** Newest-first audit feed of catalogue, settings, inventory and role changes. */
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<ActivityEntry[]> => {
    await requirePermission(ctx, "activity.view");
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    return await recentActivity(ctx, limit);
  },
});
