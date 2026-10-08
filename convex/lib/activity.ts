import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type ActivityEntry = {
  action: string;
  summary: string;
  actor_name: string;
  created_at: string;
};

/**
 * Records one line in the staff activity feed (catalogue, categories,
 * settings, roles, bulk actions). Order changes are already captured by
 * `order_history`, so they stay out of here.
 */
export async function logActivity(
  ctx: MutationCtx,
  actorId: Id<"users">,
  action: string,
  summary: string,
): Promise<void> {
  const actor = await ctx.db.get(actorId);
  const actorName = actor?.name?.trim() || actor?.email?.trim() || "Staff member";
  await ctx.db.insert("activity_log", {
    actor_id: actorId,
    actor_name: actorName,
    action,
    summary,
  });
}

export const activityDTO = (entry: {
  action: string;
  summary: string;
  actor_name: string;
  _creationTime: number;
}): ActivityEntry => ({
  action: entry.action,
  summary: entry.summary,
  actor_name: entry.actor_name,
  created_at: new Date(entry._creationTime).toISOString(),
});

/** Newest-first activity feed for the dashboard + activity page. */
export async function recentActivity(ctx: QueryCtx, limit: number): Promise<ActivityEntry[]> {
  const rows = await ctx.db.query("activity_log").order("desc").take(limit);
  return rows.map(activityDTO);
}
