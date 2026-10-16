import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { PermissionKey } from "../schema";
import { ADMIN_ACCESS_MESSAGE, getRole, requireUser, STAFF_ACCESS_MESSAGE } from "./auth";
import { fail } from "./errors";

type Ctx = QueryCtx | MutationCtx;

/**
 * Roles and permissions (spec C1).
 *
 * The shop has two people-shaped roles — `admin` (the owner) and `staff` (an
 * attendant) — and each one maps to a **default permission set**. A per-user
 * override on `user_roles.overrides` then grants or revokes individual
 * permissions for one person, which is how "give Akua stock adjustments but
 * not product deletion" works without inventing a third role.
 *
 * Deliberate scope: no custom roles, no approval workflows, no per-record
 * ACLs. One shop, two roles and a handful of overrides covers every shape it
 * actually has; a role *editor* would be machinery with no user. Recorded as
 * D9 in `docs/INVENTORY-DECISIONS.md`.
 *
 * Every check goes through `requirePermission`, so a new function cannot
 * accidentally ship with a wider door than the screen behind it.
 */

// The catalogue itself is pure data in `permission_catalog.ts` — this file
// keeps only the guards, which need `@convex-dev/auth/server` and cannot be
// bundled for the browser. The Team screen imports the pure module directly;
// the re-export below keeps every existing backend import path working.
import {
  PERMISSION_CATALOG,
  PERMISSION_KEYS_IN_ORDER,
  defaultPermissions,
} from "./permission_catalog";

export {
  PERMISSION_CATALOG,
  PERMISSION_KEYS_IN_ORDER,
  defaultPermissions,
  groupedPermissions,
} from "./permission_catalog";

export type EffectivePermissions = {
  userId: Id<"users">;
  role: "admin" | "staff";
  /** Granted after the role's defaults and the user's overrides are merged. */
  permissions: PermissionKey[];
  /** Overrides that actually changed the default, for showing on screen. */
  overrides: Partial<Record<PermissionKey, boolean>>;
};

/**
 * The signed-in user's effective permissions, or `null` when they have no
 * staff role at all (a plain customer). This is the one place that decides
 * what someone may do; queries and mutations both read from it.
 */
export async function effectivePermissions(
  ctx: Ctx,
  userId: Id<"users"> | null,
): Promise<EffectivePermissions | null> {
  if (userId === null) return null;
  const role = await getRole(ctx, userId);
  if (role === null) return null;

  const row = await ctx.db
    .query("user_roles")
    .withIndex("by_user", (q) => q.eq("user_id", userId))
    .first();
  const overrides = (row?.overrides ?? {}) as Partial<Record<PermissionKey, boolean>>;

  const defaults = new Set(defaultPermissions(role));
  for (const [key, value] of Object.entries(overrides)) {
    if (value === true) defaults.add(key as PermissionKey);
    else if (value === false) defaults.delete(key as PermissionKey);
  }

  return {
    userId,
    role,
    permissions: PERMISSION_KEYS_IN_ORDER.filter((key) => defaults.has(key)),
    overrides,
  };
}

/** Does this person hold `permission` right now? */
export async function can(
  ctx: Ctx,
  userId: Id<"users"> | null,
  permission: PermissionKey,
): Promise<boolean> {
  const effective = await effectivePermissions(ctx, userId);
  return effective !== null && effective.permissions.includes(permission);
}

/**
 * Gate a function on one permission.
 *
 * Returns the actor's id so call sites can keep logging who did what. The
 * messages are chosen to preserve what the function said before the
 * permission layer existed:
 *
 * - not signed in → "Please sign in to continue." (unchanged)
 * - signed in but no staff role → the floor message for *this* permission, so
 *   an admin-only function still says "Admin access required…" to a customer
 * - has a role, but the permission needs a higher one → same floor message
 * - has a role and the right floor, but an override took it away → a typed
 *   `PERMISSION_DENIED` naming the permission, because that case is a
 *   configuration decision rather than "you are not staff"
 */
export async function requirePermission(ctx: Ctx, permission: PermissionKey): Promise<Id<"users">> {
  const userId = await requireUser(ctx);
  const effective = await effectivePermissions(ctx, userId);
  const spec = PERMISSION_CATALOG[permission];

  if (effective === null) {
    throw new ConvexError({
      message: spec.floor === "admin" ? ADMIN_ACCESS_MESSAGE : STAFF_ACCESS_MESSAGE,
    });
  }
  if (effective.permissions.includes(permission)) return userId;

  const stillOnFloor = effective.role === "admin" ? true : spec.floor === "staff";
  if (stillOnFloor) {
    // The role's defaults included it, so an override is what removed it.
    fail("PERMISSION_DENIED", `You do not have permission to ${spec.label}.`, {
      permission,
    });
  }
  throw new ConvexError({ message: ADMIN_ACCESS_MESSAGE });
}
