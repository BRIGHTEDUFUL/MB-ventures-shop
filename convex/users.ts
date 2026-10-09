import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { logActivity } from "./lib/activity";
import { currentUserId, getRole, isStaff as userHasStaffRole } from "./lib/auth";
import { isValidEmail } from "./lib/rules";
import {
  defaultPermissions,
  PERMISSION_CATALOG,
  PERMISSION_KEYS_IN_ORDER,
  requirePermission,
} from "./lib/permissions";
import { permissionValidator, type PermissionKey } from "./schema";

/** The signed-in profile for the account page and checkout prefill. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null) return null;
    return {
      id: user._id as string,
      email: user.email ?? "",
      name: user.name ?? "",
      phone: user.phone ?? "",
    };
  },
});

/** Replaces the `is_staff()` RPC used to gate the staff dashboard. */
export const isStaff = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (userId === null) return false;
    return await userHasStaffRole(ctx, userId);
  },
});

/** `"admin" | "staff"` for the signed-in user, `null` when they have no role. */
export const myRole = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (userId === null) return null;
    return await getRole(ctx, userId);
  },
});

/**
 * The signed-in user's effective permissions, so a screen can hide what the
 * server would refuse anyway. Never the *only* check: every mutation gates
 * itself with `requirePermission`, and this just keeps the UI honest.
 * Signed-out and role-less callers get an empty list rather than an error,
 * because "you may do nothing" is a valid answer for a customer.
 */
export const myPermissions = query({
  args: {},
  handler: async (ctx): Promise<PermissionKey[]> => {
    const userId = await currentUserId(ctx);
    if (userId === null) return [];
    const role = await getRole(ctx, userId);
    if (role === null) return [];
    const row = await ctx.db
      .query("user_roles")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .first();
    const overrides = (row?.overrides ?? {}) as Partial<Record<PermissionKey, boolean>>;
    const granted = new Set(defaultPermissions(role));
    for (const [key, value] of Object.entries(overrides)) {
      if (value === true) granted.add(key as PermissionKey);
      else if (value === false) granted.delete(key as PermissionKey);
    }
    return PERMISSION_KEYS_IN_ORDER.filter((key) => granted.has(key));
  },
});

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "admin" | "staff";
};

/** Everyone with shop access (staff see the roster; only admins may edit it). */
export const team = query({
  args: {},
  handler: async (ctx): Promise<TeamMember[]> => {
    await requirePermission(ctx, "team.view");
    const roles = await ctx.db.query("user_roles").collect();
    const members = await Promise.all(
      roles.map(async (roleRow) => {
        const user = await ctx.db.get(roleRow.user_id);
        if (user === null) return null;
        return {
          id: user._id as string,
          name: user.name?.trim() ?? "",
          email: user.email?.trim() ?? "",
          phone: user.phone?.trim() ?? "",
          role: roleRow.role,
        } satisfies TeamMember;
      }),
    );
    return members
      .filter((member): member is TeamMember => member !== null)
      .sort((a, b) =>
        a.role === b.role ? a.name.localeCompare(b.name) : a.role === "admin" ? -1 : 1,
      );
  },
});

async function countAdmins(ctx: MutationCtx): Promise<number> {
  const roles = await ctx.db.query("user_roles").collect();
  return roles.filter((r) => r.role === "admin").length;
}

/** Give an existing account staff or admin access (admin-only, by email). */
export const addStaff = mutation({
  args: {
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("staff")),
  },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "team.manage");
    const email = args.email.trim().toLowerCase();
    if (!isValidEmail(email)) throw new ConvexError({ message: "Enter a valid email address." });

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (user === null) {
      throw new ConvexError({
        message: `No account found for ${email}. Ask them to create an account first, then add them here.`,
      });
    }
    if (user._id === actorId) throw new ConvexError({ message: "You already have access." });
    const existing = await ctx.db
      .query("user_roles")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();
    if (existing !== null) {
      throw new ConvexError({ message: `${email} already has ${existing.role} access.` });
    }

    await ctx.db.insert("user_roles", { user_id: user._id, role: args.role });
    await logActivity(ctx, actorId, "role.grant", `Granted ${args.role} access to ${email}.`);
    return { ok: true };
  },
});

/** Switch an account between staff and admin (admin-only). */
export const setRole = mutation({
  args: {
    user_id: v.string(),
    role: v.union(v.literal("admin"), v.literal("staff")),
  },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "team.manage");
    const userId = ctx.db.normalizeId("users", args.user_id);
    if (userId === null) throw new ConvexError({ message: "Account not found." });
    const target = await ctx.db.get(userId);
    const who = target?.email?.trim() || target?.name?.trim() || "an account";
    const roleRow = await ctx.db
      .query("user_roles")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .first();
    if (roleRow === null) throw new ConvexError({ message: "That account has no shop access." });
    if (roleRow.role === args.role) return { ok: true };
    if (roleRow.role === "admin" && (await countAdmins(ctx)) <= 1) {
      throw new ConvexError({
        message: "At least one admin must remain. Promote someone else first.",
      });
    }

    await ctx.db.patch(roleRow._id, { role: args.role });
    await logActivity(ctx, actorId, "role.change", `Changed ${who} to ${args.role} access.`);
    return { ok: true };
  },
});

/** Remove shop access entirely (admin-only; you cannot remove yourself). */
export const revokeRole = mutation({
  args: { user_id: v.string() },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "team.manage");
    const userId = ctx.db.normalizeId("users", args.user_id);
    if (userId === null) throw new ConvexError({ message: "Account not found." });
    if (userId === actorId) {
      throw new ConvexError({ message: "You cannot remove your own access." });
    }
    const target = await ctx.db.get(userId);
    const who = target?.email?.trim() || target?.name?.trim() || "a team member";
    const roleRow = await ctx.db
      .query("user_roles")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .first();
    if (roleRow === null) return { ok: true };
    if (roleRow.role === "admin" && (await countAdmins(ctx)) <= 1) {
      throw new ConvexError({
        message: "At least one admin must remain. Promote someone else first.",
      });
    }

    await ctx.db.delete(roleRow._id);
    await logActivity(ctx, actorId, "role.revoke", `Removed shop access for ${who}.`);
    return { ok: true };
  },
});

/**
 * Grant or revoke one permission for one person (admin only).
 *
 * This is the "custom role" escape hatch: instead of inventing a third role
 * for one exception, flip a single bit on that person's row. Passing `null`
 * clears the override so they fall back to their role's defaults.
 */
export const setPermission = mutation({
  args: {
    user_id: v.string(),
    permission: permissionValidator,
    granted: v.union(v.boolean(), v.null()),
  },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "team.manage");
    const userId = ctx.db.normalizeId("users", args.user_id);
    if (userId === null) throw new ConvexError({ message: "Account not found." });
    const roleRow = await ctx.db
      .query("user_roles")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .first();
    if (roleRow === null) throw new ConvexError({ message: "That account has no shop access." });

    const overrides = { ...(roleRow.overrides ?? {}) } as Partial<Record<PermissionKey, boolean>>;
    if (args.granted === null) delete overrides[args.permission];
    else overrides[args.permission] = args.granted;
    await ctx.db.patch(roleRow._id, {
      overrides: overrides as Record<PermissionKey, boolean>,
    });

    const target = await ctx.db.get(userId);
    const who = target?.email?.trim() || target?.name?.trim() || "a team member";
    await logActivity(
      ctx,
      actorId,
      "role.permission",
      args.granted === null
        ? `Reset the “${args.permission}” permission for ${who} to the role default.`
        : `${args.granted ? "Granted" : "Removed"} the “${args.permission}” permission for ${who}.`,
    );
    return { ok: true };
  },
});

/**
 * Grants staff access to an existing account.
 * Run once per account: `npx convex run users:grantStaff '{"email":"owner@example.com"}'`
 */
export const grantStaff = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (user === null) {
      throw new ConvexError({
        message: `No account found for ${email}. Create the account first, then grant access.`,
      });
    }
    const existing = await ctx.db
      .query("user_roles")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();
    if (existing !== null) return { ok: true, role: existing.role };

    await ctx.db.insert("user_roles", { user_id: user._id, role: "admin" });
    return { ok: true, role: "admin" as const };
  },
});

/**
 * Update own profile (name, phone). Email cannot be changed.
 * Any authenticated user can update their own profile.
 */
export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    if (userId === null) throw new ConvexError({ message: "Sign in to update your profile." });

    const user = await ctx.db.get(userId);
    if (user === null) throw new ConvexError({ message: "Account not found." });

    const updates: { name?: string; phone?: string } = {};

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 2) throw new ConvexError({ message: "Name must be at least 2 characters." });
      if (name.length > 100) throw new ConvexError({ message: "Name is too long." });
      updates.name = name;
    }

    if (args.phone !== undefined) {
      const phone = args.phone.trim();
      if (phone.length > 0 && phone.length < 9) {
        throw new ConvexError({ message: "Enter a valid phone number with at least 9 digits." });
      }
      updates.phone = phone;
    }

    if (Object.keys(updates).length === 0) return { ok: true };

    await ctx.db.patch(userId, updates);
    await logActivity(ctx, userId, "profile.update", "Updated profile information.");
    return { ok: true };
  },
});

/**
 * Admin-only: Get detailed user information including role and permissions.
 */
export const getUserDetails = query({
  args: { user_id: v.string() },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "team.view");
    const userId = ctx.db.normalizeId("users", args.user_id);
    if (userId === null) throw new ConvexError({ message: "User not found." });

    const user = await ctx.db.get(userId);
    if (user === null) throw new ConvexError({ message: "User not found." });

    const roleRow = await ctx.db
      .query("user_roles")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .first();

    const role = roleRow?.role ?? null;
    const overrides = (roleRow?.overrides ?? {}) as Partial<Record<PermissionKey, boolean>>;
    const granted = role ? new Set(defaultPermissions(role)) : new Set<PermissionKey>();

    for (const [key, value] of Object.entries(overrides)) {
      if (value === true) granted.add(key as PermissionKey);
      else if (value === false) granted.delete(key as PermissionKey);
    }

    const permissions = PERMISSION_KEYS_IN_ORDER.filter((key) => granted.has(key));

    return {
      id: user._id as string,
      email: user.email ?? "",
      name: user.name ?? "",
      phone: user.phone ?? "",
      role,
      permissions,
      permissionOverrides: overrides,
    };
  },
});

/**
 * Admin-only: Update another user's profile (name, phone).
 * Email cannot be changed.
 */
export const adminUpdateUser = mutation({
  args: {
    user_id: v.string(),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "team.manage");
    const userId = ctx.db.normalizeId("users", args.user_id);
    if (userId === null) throw new ConvexError({ message: "User not found." });

    const user = await ctx.db.get(userId);
    if (user === null) throw new ConvexError({ message: "User not found." });

    const updates: { name?: string; phone?: string } = {};

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 2) throw new ConvexError({ message: "Name must be at least 2 characters." });
      if (name.length > 100) throw new ConvexError({ message: "Name is too long." });
      updates.name = name;
    }

    if (args.phone !== undefined) {
      const phone = args.phone.trim();
      if (phone.length > 0 && phone.length < 9) {
        throw new ConvexError({ message: "Enter a valid phone number with at least 9 digits." });
      }
      updates.phone = phone;
    }

    if (Object.keys(updates).length === 0) return { ok: true };

    await ctx.db.patch(userId, updates);
    const who = user.email?.trim() || user.name?.trim() || "a user";
    await logActivity(ctx, actorId, "user.update", `Updated profile for ${who}.`);
    return { ok: true };
  },
});

/**
 * Admin-only: Delete a user account and all associated data.
 * Cannot delete yourself or the last admin.
 */
export const deleteUser = mutation({
  args: { user_id: v.string() },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "team.manage");
    const userId = ctx.db.normalizeId("users", args.user_id);
    if (userId === null) throw new ConvexError({ message: "User not found." });

    if (userId === actorId) {
      throw new ConvexError({ message: "You cannot delete your own account." });
    }

    const user = await ctx.db.get(userId);
    if (user === null) throw new ConvexError({ message: "User not found." });

    const roleRow = await ctx.db
      .query("user_roles")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .first();

    // Check if this is the last admin
    if (roleRow?.role === "admin" && (await countAdmins(ctx)) <= 1) {
      throw new ConvexError({
        message: "Cannot delete the last admin. Promote someone else first.",
      });
    }

    // Delete user role if exists
    if (roleRow !== null) {
      await ctx.db.delete(roleRow._id);
    }

    // Delete the user account
    await ctx.db.delete(userId);

    const who = user.email?.trim() || user.name?.trim() || "a user";
    await logActivity(ctx, actorId, "user.delete", `Deleted account for ${who}.`);
    return { ok: true };
  },
});

/**
 * Get all users (not just staff) - admin only.
 * Useful for viewing all customer accounts and managing users.
 */
export const allUsers = query({
  args: {
    limit: v.optional(v.number()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "team.view");

    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const search = (args.search ?? "").trim().toLowerCase();

    let users = await ctx.db.query("users").take(limit);

    // Filter by search term if provided
    if (search !== "") {
      users = users.filter((user) => {
        const haystack =
          `${user.email ?? ""} ${user.name ?? ""} ${user.phone ?? ""}`.toLowerCase();
        return haystack.includes(search);
      });
    }

    const usersWithRoles = await Promise.all(
      users.map(async (user) => {
        const roleRow = await ctx.db
          .query("user_roles")
          .withIndex("by_user", (q) => q.eq("user_id", user._id))
          .first();

        return {
          id: user._id as string,
          email: user.email ?? "",
          name: user.name ?? "",
          phone: user.phone ?? "",
          role: roleRow?.role ?? null,
          hasStaffAccess: roleRow !== null,
        };
      }),
    );

    return usersWithRoles;
  },
});
