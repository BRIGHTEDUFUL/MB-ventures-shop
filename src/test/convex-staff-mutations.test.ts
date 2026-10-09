// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

/**
 * The staff/admin half of the mutation coverage: `inventory.adjust`, the
 * `catalogue` settings guards and the `users` role management. Runs in the
 * Convex edge runtime through `convex-test`, offline, like its sibling
 * `convex-mutations.test.ts`.
 */
const modules = import.meta.glob("../../convex/**/*.*s");

/** Belt and braces: none of these mutations should ever touch the network. */
const fetchSpy = vi.fn(async () => {
  throw new Error("This suite must never reach the network.");
});

beforeEach(() => {
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Seeds the store with its default settings (ordering closed, no MoMo
 * recipient) and three accounts: a plain customer, a staff member and an
 * admin. The standing desk starts with 50 on hand so stock maths reads well.
 */
async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.seed, {});

  const world = await t.run(async (ctx) => {
    const desk = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", "standing-desk"))
      .unique();
    if (desk === null) throw new Error("seed did not create the standing desk");
    await ctx.db.patch(desk._id, { stock: 50 });

    const customerId = await ctx.db.insert("users", {
      name: "Ama Mensah",
      email: "ama@example.com",
      phone: "0241234567",
    });
    const staffId = await ctx.db.insert("users", {
      name: "Kofi Boateng",
      email: "kofi@example.com",
      phone: "0240001111",
    });
    await ctx.db.insert("user_roles", { user_id: staffId, role: "staff" });
    const adminId = await ctx.db.insert("users", { name: "Akua Adjei", email: "akua@example.com" });
    await ctx.db.insert("user_roles", { user_id: adminId, role: "admin" });

    return { customerId, staffId, adminId };
  });

  const customer = t.withIdentity({ subject: `${world.customerId}|test-session` });
  const staff = t.withIdentity({ subject: `${world.staffId}|test-session` });
  const admin = t.withIdentity({ subject: `${world.adminId}|test-session` });
  return { t, customer, staff, admin, ...world };
}

type Env = Awaited<ReturnType<typeof setup>>;

/** Returns the rejection instead of failing the assertion, for inspection. */
async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to fail, but it resolved");
}

/**
 * Asserts the caller receives a `ConvexError` and that its human-readable
 * `data.message` survived the trip out of the transaction.
 */
async function expectConvexError(promise: Promise<unknown>, expected: RegExp) {
  const error = await capture(promise);
  expect(error).toBeInstanceOf(ConvexError);
  expect((error as ConvexError<{ message: string }>).data.message).toMatch(expected);
}

const readProduct = (env: Env, slug: string) =>
  env.t.run(async (ctx) => {
    const product = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (product === null) throw new Error(`product ${slug} not found`);
    return product;
  });

const readSettings = (env: Env) => env.t.run((ctx) => ctx.db.query("store_settings").unique());

const patchSettings = (env: Env, patch: Partial<Doc<"store_settings">>) =>
  env.t.run(async (ctx) => {
    const settings = await ctx.db.query("store_settings").unique();
    if (settings === null) throw new Error("store settings row is missing");
    await ctx.db.patch(settings._id, patch);
  });

const movements = (env: Env) => env.t.run((ctx) => ctx.db.query("inventory_history").collect());

const activity = (env: Env) => env.t.run((ctx) => ctx.db.query("activity_log").collect());

/** A valid `saveSettings` payload built from the current settings row. */
type SaveSettingsArgs = FunctionArgs<typeof api.catalogue.saveSettings>;

async function settingsForm(
  env: Env,
  overrides: Partial<SaveSettingsArgs> = {},
): Promise<SaveSettingsArgs> {
  const settings = await readSettings(env);
  if (settings === null) throw new Error("store settings row is missing");
  const form: SaveSettingsArgs = {
    hero_title: settings.hero_title,
    hero_subtitle: settings.hero_subtitle,
    phone: settings.phone,
    email: settings.email,
    address: settings.address,
    hours: settings.hours,
    announcement: settings.announcement,
    whatsapp: settings.whatsapp,
    hero_image: settings.hero_image,
    setup_image: settings.setup_image,
    ordering_enabled: settings.ordering_enabled,
    featured_ids: settings.featured_ids,
    home_category_heading: settings.home_category_heading ?? "",
    home_featured_heading: settings.home_featured_heading ?? "",
    home_setup_eyebrow: settings.home_setup_eyebrow ?? "",
    home_setup_heading: settings.home_setup_heading ?? "",
    home_setup_body: settings.home_setup_body ?? "",
    home_cta_heading: settings.home_cta_heading ?? "",
    home_cta_body: settings.home_cta_body ?? "",
    home_brands: settings.home_brands ?? [],
    home_trust: settings.home_trust ?? [],
  };
  return { ...form, ...overrides };
}

describe("inventory.adjust — audited stock corrections", () => {
  it("applies a staff adjustment and records both audit trails", async () => {
    const env = await setup();
    const result = await env.staff.mutation(api.inventory.adjust, {
      product_id: "standing-desk",
      delta: 7,
      reason: "Delivery received",
    });

    expect(result).toEqual({ ok: true, stock: 57 });
    expect((await readProduct(env, "standing-desk")).stock).toBe(57);

    const rows = await movements(env);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      product_slug: "standing-desk",
      previous_stock: 50,
      new_stock: 57,
      reason: "Delivery received",
      actor_id: env.staffId,
    });

    const feed = await activity(env);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ action: "inventory.adjust", actor_name: "Kofi Boateng" });
    expect(feed[0]?.summary).toContain("stock 50 → 57");
  });

  it("refuses customers, impossible deltas and negative stock", async () => {
    const env = await setup();
    await expectConvexError(
      env.customer.mutation(api.inventory.adjust, {
        product_id: "standing-desk",
        delta: 1,
        reason: "Not allowed",
      }),
      /Staff access required/,
    );
    await expectConvexError(
      env.staff.mutation(api.inventory.adjust, {
        product_id: "standing-desk",
        delta: 0,
        reason: "No change",
      }),
      /whole number change that is not zero/,
    );
    await expectConvexError(
      env.staff.mutation(api.inventory.adjust, {
        product_id: "standing-desk",
        delta: 2.5,
        reason: "Half a unit",
      }),
      /whole number change that is not zero/,
    );
    await expectConvexError(
      env.staff.mutation(api.inventory.adjust, {
        product_id: "standing-desk",
        delta: -60,
        reason: "Fat fingers",
      }),
      /only 50 on hand/,
    );
    await expectConvexError(
      env.staff.mutation(api.inventory.adjust, {
        product_id: "ghost-product",
        delta: 3,
        reason: "Phantom stock",
      }),
      /Product not found/,
    );

    // None of the refusals may move a number or leave a trace.
    expect((await readProduct(env, "standing-desk")).stock).toBe(50);
    expect(await movements(env)).toHaveLength(0);
    expect(await activity(env)).toHaveLength(0);
  });

  it("falls back to a default reason when the field is blank", async () => {
    const env = await setup();
    await env.staff.mutation(api.inventory.adjust, {
      product_id: "standing-desk",
      delta: -1,
      reason: "   ",
    });

    const rows = await movements(env);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ new_stock: 49, reason: "Stock adjustment" });
  });

  it("keeps the movement log behind the staff gate", async () => {
    const env = await setup();
    await expectConvexError(env.t.query(api.inventory.history, {}), /Please sign in to continue/);
    await expectConvexError(env.customer.query(api.inventory.history, {}), /Staff access required/);
    expect(await env.staff.query(api.inventory.history, {})).toHaveLength(0);
  });
});

describe("catalogue — product tools stay behind the staff gate", () => {
  it("refuses non-staff calls to delete and bulk-edit products", async () => {
    const env = await setup();
    await expectConvexError(
      env.customer.mutation(api.catalogue.deleteProduct, { id: "standing-desk" }),
      /Staff access required/,
    );
    await expectConvexError(
      env.customer.mutation(api.catalogue.bulkUpdate, {
        ids: ["standing-desk"],
        changes: { verified: true },
      }),
      /Staff access required/,
    );

    const desk = await readProduct(env, "standing-desk");
    expect(desk.verified).toBe(false);
    expect(desk.stock).toBe(50);
  });

  it("refuses a bulk price cut that would drop below zero", async () => {
    const env = await setup();
    await expectConvexError(
      env.staff.mutation(api.catalogue.bulkUpdate, {
        ids: ["standing-desk"],
        changes: { price_amount: -9999 },
      }),
      /would drop to zero/,
    );
    expect((await readProduct(env, "standing-desk")).price).toBe(2400);
    expect(await activity(env)).toHaveLength(0);
  });
});

describe("catalogue.saveSettings — storefront copy and the ordering switch", () => {
  it("refuses anyone without a staff role", async () => {
    const env = await setup();
    const form = await settingsForm(env);
    await expectConvexError(
      env.t.mutation(api.catalogue.saveSettings, form),
      /Please sign in to continue/,
    );
    await expectConvexError(
      env.customer.mutation(api.catalogue.saveSettings, form),
      /Staff access required/,
    );
  });

  it("refuses to open ordering before the MoMo recipient is on file", async () => {
    const env = await setup();
    const form = await settingsForm(env, { ordering_enabled: true });

    await expectConvexError(
      env.admin.mutation(api.catalogue.saveSettings, form),
      /Enter verified Mobile Money recipient details first/,
    );
    expect((await readSettings(env))?.ordering_enabled).toBe(false);
    expect(await activity(env)).toHaveLength(0);
  });

  it("lets staff save the storefront while ordering stays closed", async () => {
    const env = await setup();
    const form = await settingsForm(env, {
      announcement: "  Free delivery in Accra this week  ",
    });

    await expect(env.staff.mutation(api.catalogue.saveSettings, form)).resolves.toEqual({
      ok: true,
    });

    const saved = await readSettings(env);
    expect(saved?.announcement).toBe("Free delivery in Accra this week");
    expect(saved?.ordering_enabled).toBe(false);

    const feed = await activity(env);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ action: "settings.update", actor_name: "Kofi Boateng" });
  });

  it("rejects a broken contact email and a vanished featured product", async () => {
    const env = await setup();
    await expectConvexError(
      env.staff.mutation(api.catalogue.saveSettings, await settingsForm(env, { email: "nope" })),
      /Enter a valid email address/,
    );
    await expectConvexError(
      env.staff.mutation(
        api.catalogue.saveSettings,
        await settingsForm(env, { featured_ids: ["ghost-product"] }),
      ),
      /featured products no longer exists/,
    );
    expect(await activity(env)).toHaveLength(0);
  });
});

describe("catalogue.saveDeliverySettings — shipping fees stay staff-editable", () => {
  const fees = {
    central_fee: 30,
    greater_fee: 50,
    nationwide_fee: 100,
    free_threshold: 5000,
  };

  it("is open to staff but not to customers", async () => {
    const env = await setup();
    await expectConvexError(
      env.t.mutation(api.catalogue.saveDeliverySettings, fees),
      /Please sign in to continue/,
    );
    await expectConvexError(
      env.customer.mutation(api.catalogue.saveDeliverySettings, fees),
      /Staff access required/,
    );
  });

  it("rejects negative fees and a dropped decimal", async () => {
    const env = await setup();
    await expectConvexError(
      env.staff.mutation(api.catalogue.saveDeliverySettings, {
        ...fees,
        central_fee: -1,
      }),
      /cannot be negative/,
    );
    await expectConvexError(
      env.staff.mutation(api.catalogue.saveDeliverySettings, {
        ...fees,
        nationwide_fee: 20_000,
      }),
      /looks too high/,
    );

    const saved = await readSettings(env);
    expect(saved?.central_fee).toBe(30);
    expect(saved?.nationwide_fee).toBe(100);
    expect(await activity(env)).toHaveLength(0);
  });

  it("saves a staff fee edit, rounded to two decimals", async () => {
    const env = await setup();
    await expect(
      env.staff.mutation(api.catalogue.saveDeliverySettings, {
        central_fee: 33.333,
        greater_fee: 50.5,
        nationwide_fee: 100,
        free_threshold: 4999.999,
      }),
    ).resolves.toEqual({ ok: true });

    const saved = await readSettings(env);
    expect(saved?.central_fee).toBe(33.33);
    expect(saved?.greater_fee).toBe(50.5);
    expect(saved?.nationwide_fee).toBe(100);
    expect(saved?.free_threshold).toBe(5000);
  });
});

describe("catalogue.saveMomoSettings — the money recipient is admin-only", () => {
  it("refuses staff who are not admins", async () => {
    const env = await setup();
    await expectConvexError(
      env.t.mutation(api.catalogue.saveMomoSettings, {
        momo_number: "0551234567",
        momo_name: "MB Ventures Ltd",
      }),
      /Please sign in to continue/,
    );
    await expectConvexError(
      env.staff.mutation(api.catalogue.saveMomoSettings, {
        momo_number: "0551234567",
        momo_name: "MB Ventures Ltd",
      }),
      /Admin access required/,
    );
    expect((await readSettings(env))?.momo_number).toBe("");
  });

  it("rejects a malformed recipient number or a missing name", async () => {
    const env = await setup();
    await expectConvexError(
      env.admin.mutation(api.catalogue.saveMomoSettings, {
        momo_number: "12345",
        momo_name: "MB Ventures Ltd",
      }),
      /valid Mobile Money number/,
    );
    await expectConvexError(
      env.admin.mutation(api.catalogue.saveMomoSettings, {
        momo_number: "0551234567",
        momo_name: "   ",
      }),
      /recipient name/,
    );
    expect((await readSettings(env))?.momo_number).toBe("");
  });

  it("refuses to clear the recipient while ordering is open", async () => {
    const env = await setup();
    await patchSettings(env, { ordering_enabled: true, momo_number: "0551234567" });

    await expectConvexError(
      env.admin.mutation(api.catalogue.saveMomoSettings, { momo_number: "", momo_name: "" }),
      /Turn off ordering before clearing/,
    );
    expect((await readSettings(env))?.momo_number).toBe("0551234567");
  });

  it("lets an admin update the recipient and logs who changed it", async () => {
    const env = await setup();
    await expect(
      env.admin.mutation(api.catalogue.saveMomoSettings, {
        momo_number: " 0551234567 ",
        momo_name: " MB Ventures Ltd ",
      }),
    ).resolves.toEqual({ ok: true });

    const saved = await readSettings(env);
    expect(saved?.momo_number).toBe("0551234567");
    expect(saved?.momo_name).toBe("MB Ventures Ltd");

    const feed = await activity(env);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ action: "settings.momo", actor_name: "Akua Adjei" });
  });
});

describe("users.ts — role management stays with the admins", () => {
  it("answers the role queries the dashboard gates on", async () => {
    const env = await setup();
    expect(await env.t.query(api.users.isStaff, {})).toBe(false);
    expect(await env.t.query(api.users.myRole, {})).toBeNull();
    expect(await env.customer.query(api.users.isStaff, {})).toBe(false);
    expect(await env.customer.query(api.users.myRole, {})).toBeNull();
    expect(await env.staff.query(api.users.myRole, {})).toBe("staff");
    expect(await env.admin.query(api.users.myRole, {})).toBe("admin");
    await expectConvexError(env.customer.query(api.users.team, {}), /Staff access required/);
  });

  it("keeps addStaff behind the admin gate", async () => {
    const env = await setup();
    await expectConvexError(
      env.staff.mutation(api.users.addStaff, { email: "ama@example.com", role: "staff" }),
      /Admin access required/,
    );
    expect(await env.t.run((ctx) => ctx.db.query("user_roles").collect())).toHaveLength(2);
  });

  it("grants an existing account exactly once, never to itself or a ghost", async () => {
    const env = await setup();
    await expect(
      env.admin.mutation(api.users.addStaff, { email: "ama@example.com", role: "staff" }),
    ).resolves.toEqual({ ok: true });
    await expectConvexError(
      env.admin.mutation(api.users.addStaff, { email: "ama@example.com", role: "staff" }),
      /already has staff access/,
    );
    await expectConvexError(
      env.admin.mutation(api.users.addStaff, { email: "akua@example.com", role: "admin" }),
      /You already have access/,
    );
    await expectConvexError(
      env.admin.mutation(api.users.addStaff, { email: "ghost@example.com", role: "staff" }),
      /No account found/,
    );

    const roles = await env.t.run((ctx) => ctx.db.query("user_roles").collect());
    expect(roles).toHaveLength(3);
    const feed = await activity(env);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ action: "role.grant", actor_name: "Akua Adjei" });
  });

  it("will not let the last admin demote themselves", async () => {
    const env = await setup();
    await expectConvexError(
      env.admin.mutation(api.users.setRole, { user_id: env.adminId, role: "staff" }),
      /At least one admin must remain/,
    );
    await expectConvexError(
      env.staff.mutation(api.users.setRole, { user_id: env.customerId, role: "staff" }),
      /Admin access required/,
    );

    const roles = await env.t.run((ctx) => ctx.db.query("user_roles").collect());
    const adminRow = roles.find((row) => row.user_id === env.adminId);
    expect(adminRow?.role).toBe("admin");
  });

  it("keeps admins from removing their own access", async () => {
    const env = await setup();
    await expectConvexError(
      env.admin.mutation(api.users.revokeRole, { user_id: env.adminId }),
      /You cannot remove your own access/,
    );
    await expectConvexError(
      env.customer.mutation(api.users.revokeRole, { user_id: env.staffId }),
      /Admin access required/,
    );

    const roles = await env.t.run((ctx) => ctx.db.query("user_roles").collect());
    expect(roles).toHaveLength(2);
  });
});
