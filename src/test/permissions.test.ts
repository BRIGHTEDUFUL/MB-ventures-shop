// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";

/**
 * The permission layer (spec C1): role defaults, per-person overrides and the
 * abuse cases the brief calls out — an attendant reaching an admin function,
 * a customer reaching an inventory function, and someone granting themselves
 * access. Runs offline in the Convex edge runtime like its sibling suites.
 */
const modules = import.meta.glob("../../convex/**/*.*s");

/** None of these mutations should ever touch the network. */
vi.stubGlobal(
  "fetch",
  vi.fn(async () => {
    throw new Error("This suite must never reach the network.");
  }),
);

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.seed, {});

  const world = await t.run(async (ctx) => {
    const customerId = await ctx.db.insert("users", { name: "Ama", email: "ama@example.com" });
    const staffId = await ctx.db.insert("users", { name: "Kofi", email: "kofi@example.com" });
    await ctx.db.insert("user_roles", { user_id: staffId, role: "staff" });
    const adminId = await ctx.db.insert("users", { name: "Akua", email: "akua@example.com" });
    await ctx.db.insert("user_roles", { user_id: adminId, role: "admin" });
    return { customerId, staffId, adminId };
  });

  return {
    t,
    customer: t.withIdentity({ subject: `${world.customerId}|s` }),
    staff: t.withIdentity({ subject: `${world.staffId}|s` }),
    admin: t.withIdentity({ subject: `${world.adminId}|s` }),
    ...world,
  };
}

/** Returns the rejection instead of failing the assertion, for inspection. */
async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

const messageOf = (error: unknown) => (error as ConvexError<{ message: string }>).data.message;
const codeOf = (error: unknown) => (error as ConvexError<{ code: string }>).data.code;

describe("permissions — role defaults and per-person overrides", () => {
  it("answers myPermissions for visitors, customers, staff and admins", async () => {
    const env = await setup();
    expect(await env.t.query(api.users.myPermissions, {})).toEqual([]);
    expect(await env.customer.query(api.users.myPermissions, {})).toEqual([]);

    const staff = await env.staff.query(api.users.myPermissions, {});
    const admin = await env.admin.query(api.users.myPermissions, {});
    expect(staff).toContain("inventory.adjust");
    expect(staff).not.toContain("team.manage");
    expect(staff).not.toContain("catalogue.momo");
    expect(admin).toContain("team.manage");
    expect(admin).toContain("catalogue.momo");
    expect(admin.length).toBeGreaterThan(staff.length);
  });

  it("lets an admin revoke one permission without inventing a new role", async () => {
    const env = await setup();
    await expect(
      env.staff.mutation(api.inventory.adjust, {
        product_id: "standing-desk",
        delta: 1,
        reason: "Delivery",
      }),
    ).resolves.toMatchObject({ ok: true });

    await env.admin.mutation(api.users.setPermission, {
      user_id: env.staffId,
      permission: "inventory.adjust",
      granted: false,
    });

    const denied = await capture(
      env.staff.mutation(api.inventory.adjust, {
        product_id: "standing-desk",
        delta: 1,
        reason: "Delivery",
      }),
    );
    expect(denied).toBeInstanceOf(ConvexError);
    expect(codeOf(denied)).toBe("PERMISSION_DENIED");
    expect(messageOf(denied)).toContain("adjust stock");

    // One bit changed; the role itself is untouched. Clearing the override
    // returns the person to their role defaults.
    expect(await env.staff.query(api.users.myRole, {})).toBe("staff");
    await env.admin.mutation(api.users.setPermission, {
      user_id: env.staffId,
      permission: "inventory.adjust",
      granted: null,
    });
    expect(await env.staff.query(api.users.myPermissions, {})).toContain("inventory.adjust");
  });

  it("keeps the admin floors with the owner and the staff floors with staff", async () => {
    const env = await setup();
    const asAttendant = await capture(
      env.staff.mutation(api.users.addStaff, { email: "new@example.com", role: "staff" }),
    );
    expect(messageOf(asAttendant)).toMatch(/Admin access required/);

    const asCustomer = await capture(
      env.customer.mutation(api.inventory.adjust, {
        product_id: "standing-desk",
        delta: 1,
        reason: "Nope",
      }),
    );
    expect(messageOf(asCustomer)).toMatch(/Staff access required/);
    expect(await env.t.run((ctx) => ctx.db.query("user_roles").collect())).toHaveLength(2);
  });

  it("refuses an attendant granting themselves an admin permission", async () => {
    const env = await setup();
    const error = await capture(
      env.staff.mutation(api.users.setPermission, {
        user_id: env.adminId,
        permission: "team.manage",
        granted: true,
      }),
    );
    expect(messageOf(error)).toMatch(/Admin access required/);
  });
});
