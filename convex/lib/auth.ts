import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

/** The signed-in Convex Auth user, or `null` for anonymous visitors. */
export async function currentUserId(ctx: Ctx): Promise<Id<"users"> | null> {
  const userId = await getAuthUserId(ctx as unknown as Parameters<typeof getAuthUserId>[0]);
  if (userId === null) return null;
  // A session can outlive its account: `users.deleteUser` drops the `users`
  // row, while `authSessions` belongs to the auth framework and is not ours to
  // delete (AGENTS.md §12) — so the cookie keeps resolving to an id nothing
  // points at. Answer `null` instead: every caller already reads `null` as
  // "not signed in", which is exactly the truth, and no write can go through
  // on behalf of an account that no longer exists.
  const user = await ctx.db.get(userId as Id<"users">);
  return user === null ? null : (userId as Id<"users">);
}

/** Replaces "must be authenticated" RLS policies. */
export async function requireUser(ctx: Ctx): Promise<Id<"users">> {
  const userId = await currentUserId(ctx);
  if (userId === null) {
    throw new ConvexError({ message: "Please sign in to continue." });
  }
  return userId;
}

/** Replaces `public.is_staff()`. */
export async function isStaff(ctx: Ctx, userId: Id<"users"> | null): Promise<boolean> {
  return (await getRole(ctx, userId)) !== null;
}

/** The signed-in user's role, or `null` when they have none. */
export async function getRole(
  ctx: Ctx,
  userId: Id<"users"> | null,
): Promise<"admin" | "staff" | null> {
  if (userId === null) return null;
  const role = await ctx.db
    .query("user_roles")
    .withIndex("by_user", (q) => q.eq("user_id", userId))
    .first();
  return role === null ? null : role.role;
}

/**
 * Denial copy for the two role floors. Kept in one place because every guard
 * — legacy `requireStaff`/`requireAdmin` and the permission gate alike — must
 * say exactly this, and tests match on it.
 */
export const STAFF_ACCESS_MESSAGE = "Staff access required. Ask the store owner to grant access.";
export const ADMIN_ACCESS_MESSAGE = "Admin access required. Ask the store owner for an admin role.";

/** Replaces the `public.is_staff()` guards on every staff-only function. */
export async function requireStaff(ctx: Ctx): Promise<Id<"users">> {
  const userId = await requireUser(ctx);
  if (!(await isStaff(ctx, userId))) {
    throw new ConvexError({ message: STAFF_ACCESS_MESSAGE });
  }
  return userId;
}

/**
 * Admin-only guards: money (fees, MoMo recipient) and team management.
 * Everything else day-to-day stays open to any staff member.
 */
export async function requireAdmin(ctx: Ctx): Promise<Id<"users">> {
  const userId = await requireUser(ctx);
  if ((await getRole(ctx, userId)) !== "admin") {
    throw new ConvexError({ message: ADMIN_ACCESS_MESSAGE });
  }
  return userId;
}
