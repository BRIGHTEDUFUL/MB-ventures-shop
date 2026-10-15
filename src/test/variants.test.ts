// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import {
  combineAxes,
  deriveAxes,
  findVariantByOptions,
  isColourAxis,
  optionsSignature,
  swatchFor,
  variantKey,
  variantLabel,
} from "../../convex/lib/variants";

/**
 * Options end to end: the canonical key, the colour rules, and — the part that
 * has to be right or someone gets the wrong desk — the way stock, price and
 * order holds all follow *the variant* while the product keeps a derived total.
 *
 * Offline in the Convex edge runtime.
 */
const modules = import.meta.glob("../../convex/**/*.*s");

const fetchSpy = vi.fn(async () => {
  throw new Error("This suite must never reach the network.");
});

vi.stubGlobal("fetch", fetchSpy);

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.seed, {});

  const world = await t.run(async (ctx) => {
    const desk = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", "standing-desk"))
      .unique();
    const chair = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", "ergonomic-chair"))
      .unique();
    if (desk === null || chair === null) throw new Error("seed did not create the sample products");
    await ctx.db.patch(desk._id, { verified: true, stock: 50, price: 999.99 });
    await ctx.db.patch(chair._id, { verified: true, stock: 10, price: 450 });

    const settings = await ctx.db.query("store_settings").unique();
    if (settings === null) throw new Error("seed did not create settings");
    await ctx.db.patch(settings._id, { ordering_enabled: true });

    const staffId = await ctx.db.insert("users", {
      name: "Kofi Boateng",
      email: "kofi@example.com",
      phone: "0240001111",
    });
    await ctx.db.insert("user_roles", { user_id: staffId, role: "staff" });
    const customerId = await ctx.db.insert("users", {
      name: "Ama Mensah",
      email: "ama@example.com",
      phone: "0241234567",
    });

    return { staffId, customerId };
  });

  return {
    t,
    staff: t.withIdentity({ subject: `${world.staffId}|test-session` }),
    customer: t.withIdentity({ subject: `${world.customerId}|test-session` }),
    ...world,
  };
}

type Env = Awaited<ReturnType<typeof setup>>;

const BLACK_WHITE = [
  {
    key: "black",
    name: "Black",
    options: { Colour: "Black" },
    price: null,
    sku: "DESK-BLK",
    barcode: null,
    image_key: null,
    cost_price: null,
    stock: 4,
    visible: true,
  },
  {
    key: "white",
    name: "White",
    options: { Colour: "White" },
    price: null,
    sku: "DESK-WHT",
    barcode: null,
    image_key: null,
    cost_price: null,
    stock: 3,
    visible: true,
  },
] as const;

const variantsOf = (env: Env) =>
  env.t.run((ctx) =>
    ctx.db
      .query("product_variants")
      .withIndex("by_product", (q) => q.eq("product_slug", "standing-desk"))
      .collect(),
  );

const variantOf = async (env: Env, key: string) =>
  (await variantsOf(env)).find((row) => row.key === key);

const movements = (env: Env) =>
  env.t.run((ctx) => ctx.db.query("inventory_history").order("asc").collect());

const readProduct = (env: Env) =>
  env.t.run((ctx) =>
    ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", "standing-desk"))
      .unique(),
  );

const checkout = (items: { id: string; quantity: number; variant_key?: string }[]) => ({
  customer_name: "Ama Mensah",
  phone: "0241234567",
  email: "ama@example.com",
  address: "12 Abelenkpe Taxi Rank Road, Accra",
  fulfillment: "delivery" as const,
  zone: "central" as const,
  items,
});

/** Gives the desk two colours totalling 7 units. */
async function withColours(env: Env) {
  await env.staff.mutation(api.catalogue.saveVariants, {
    slug: "standing-desk",
    variants: BLACK_WHITE as unknown as {
      key: string;
      name: string;
      options: Record<string, string>;
      price: number | null;
      sku: string | null;
      barcode: string | null;
      image_key: string | null;
      cost_price: number | null;
      stock: number;
      visible: boolean;
    }[],
  });
}

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

const messageOf = (error: unknown) => (error as ConvexError<{ message: string }>).data.message;

describe("the key is canonical", () => {
  it("builds one key per combination, whatever order the fields arrive in", () => {
    const a = variantKey({ Colour: "Black", Size: "L" }, ["Colour", "Size"]);
    const b = variantKey({ Size: "L", Colour: "Black" }, ["Colour", "Size"]);
    expect(a).toBe("black--l");
    expect(b).toBe("black--l");
  });

  it("slugifies so a supplier's punctuation cannot change identity", () => {
    expect(variantKey({ Colour: "Space  Grey!" }, ["Colour"])).toBe("space-grey");
    expect(variantLabel({ Colour: "Space Grey", Size: "Large" }, ["Colour", "Size"])).toBe(
      "Space Grey / Large",
    );
  });

  it("orders the values the product declared, so the label reads like the picker", () => {
    // Size is declared first here, and must stay first in the label.
    expect(variantLabel({ Size: "L", Colour: "Black" }, ["Size", "Colour"])).toBe("L / Black");
  });
});

describe("options identify a variant by its choices, not by its key", () => {
  it("the same choices are the same option whatever order, case or spacing they arrive in", () => {
    expect(optionsSignature({ Colour: "Black", Size: "120 x 60 cm" })).toBe(
      optionsSignature({ size: " 120 X 60 CM ", colour: "black" }),
    );
  });

  it("different choices are different options, and a missing axis is not a partial match", () => {
    expect(optionsSignature({ Colour: "Black", Size: "L" })).not.toBe(
      optionsSignature({ Colour: "Black", Size: "S" }),
    );
    expect(optionsSignature({ Colour: "Black" })).not.toBe(
      optionsSignature({ Colour: "Black", Size: "L" }),
    );
  });

  it("resolves a choice set even when the stored keys were written in another axis order", () => {
    // The shape that broke the live storefront: keys Size-first, options both axes.
    const stored = [
      { key: "120-x-60-cm--black", options: { Colour: "Black", Size: "120 x 60 cm" } },
      { key: "120-x-60-cm--white", options: { Colour: "White", Size: "120 x 60 cm" } },
    ];
    expect(findVariantByOptions(stored, { Size: "120 x 60 cm", Colour: "Black" })?.key).toBe(
      "120-x-60-cm--black",
    );
    expect(findVariantByOptions(stored, { Size: "120 x 60 cm", Colour: "Grey" })).toBeUndefined();
  });
});

describe("colour is treated as its own kind of axis", () => {
  it("recognises the shop's spellings", () => {
    expect(isColourAxis("Colour")).toBe(true);
    expect(isColourAxis("color")).toBe(true);
    expect(isColourAxis("Colorway")).toBe(true);
    expect(isColourAxis("Size")).toBe(false);
  });

  it("returns a hex for a colour it knows", () => {
    expect(swatchFor("Black")).toMatch(/^#[0-9a-f]{6}$/i);
    // Collapsed and trimmed, so a stray double space still matches.
    expect(swatchFor("  Space   Grey ")).toBe(swatchFor("space grey"));
  });

  it("returns nothing rather than guessing a colour it does not know", () => {
    expect(swatchFor("Midnight Tide")).toBeNull();
    expect(swatchFor("")).toBeNull();
    expect(swatchFor(undefined)).toBeNull();
  });
});

describe("axes are derived from the variants themselves", () => {
  it("floats the colour axis to the front, whatever order staff entered", () => {
    const axes = deriveAxes([
      { options: { Size: "L", Colour: "Black" } },
      { options: { Size: "S", Colour: "White" } },
    ]);
    expect(axes.map((a) => a.name)).toEqual(["Colour", "Size"]);
    expect(axes[0]!.colour).toBe(true);
    expect(axes[1]!.colour).toBe(false);
  });

  it("keeps the first-seen order of values and does not repeat one", () => {
    const axes = deriveAxes([
      { options: { Colour: "Black" } },
      { options: { Colour: "black" } }, // different case, same value
      { options: { Colour: "White" } },
    ]);
    expect(axes[0]!.values).toEqual(["Black", "White"]);
  });

  it("cross-multiplies in a stable order, last axis varying fastest", () => {
    const combos = combineAxes([
      { name: "Colour", values: ["Black", "White"] },
      { name: "Size", values: ["S", "M"] },
    ]);
    expect(combos.map((c) => c.key)).toEqual(["black--s", "black--m", "white--s", "white--m"]);
  });
});

describe("catalogue.saveVariants — options become the unit of stock", () => {
  it("re-expresses the product's own stock as options, with the ledger to prove it", async () => {
    const env = await setup();
    // The desk starts holding 5 units in its own name.
    await env.t.run(async (ctx) => {
      const desk = await ctx.db
        .query("products")
        .withIndex("by_slug", (q) => q.eq("slug", "standing-desk"))
        .unique();
      await ctx.db.patch(desk!._id, { stock: 5 });
    });

    await withColours(env);

    const product = await readProduct(env);
    // 5 were written off into options, and the options carry 4 + 3.
    expect(product?.stock).toBe(7);
    expect(product?.reserved ?? 0).toBe(0);

    const rows = await variantsOf(env);
    expect(rows.map((r) => [r.key, r.stock]).sort()).toEqual([
      ["black", 4],
      ["white", 3],
    ]);

    const log = await movements(env);
    expect(log.map((m) => m.reason)).toContain("Stock re-expressed as options");
    // The opening counts are their own movements, not a silent write.
    expect(log.map((m) => m.reason)).toContain("Opening stock for “Black”");
  });

  it("names the option on every movement so the log reads as one honest move", async () => {
    const env = await setup();
    await withColours(env);
    const opening = (await movements(env)).find((m) => m.variant_key === "black");
    expect(opening).toMatchObject({
      product_slug: "standing-desk",
      variant_name: "Black",
      previous_stock: 0,
      new_stock: 4,
    });
  });

  it("refuses two options that resolve to the same key", async () => {
    const env = await setup();
    const error = await capture(
      env.staff.mutation(api.catalogue.saveVariants, {
        slug: "standing-desk",
        variants: [
          { ...BLACK_WHITE[0]!, name: "Black" },
          { ...BLACK_WHITE[0]!, key: "black", name: "Also black" },
        ],
      }),
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect(messageOf(error)).toMatch(/listed twice/);
  });

  it("refuses a variant SKU already taken by another product", async () => {
    const env = await setup();
    await env.t.run(async (ctx) => {
      const chair = await ctx.db
        .query("products")
        .withIndex("by_slug", (q) => q.eq("slug", "ergonomic-chair"))
        .unique();
      await ctx.db.patch(chair!._id, { sku: "DESK-BLK" });
    });
    const error = await capture(
      env.staff.mutation(api.catalogue.saveVariants, {
        slug: "standing-desk",
        variants: [BLACK_WHITE[0]!],
      }),
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect(messageOf(error)).toMatch(/already used by/);
  });

  it("hands the stock back to the product when the options are taken away", async () => {
    const env = await setup();
    await withColours(env);
    expect((await readProduct(env))?.stock).toBe(7);

    await env.staff.mutation(api.catalogue.saveVariants, {
      slug: "standing-desk",
      variants: [],
    });

    expect((await readProduct(env))?.stock).toBe(7);
    expect(await variantsOf(env)).toHaveLength(0);
    expect((await movements(env)).map((m) => m.reason)).toContain(
      "Options removed — stock returned to the product",
    );
  });

  it("will not restructure a product an open order is still holding", async () => {
    const env = await setup();
    await env.customer.mutation(api.orders.place, checkout([{ id: "standing-desk", quantity: 3 }]));
    expect((await readProduct(env))?.stock).toBe(47);
    expect((await readProduct(env))?.reserved).toBe(3);

    const error = await capture(
      env.staff.mutation(api.catalogue.saveVariants, {
        slug: "standing-desk",
        variants: [BLACK_WHITE[0]!],
      }),
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect(messageOf(error)).toMatch(/holding stock/);
    // Nothing moved: the product still owns its 47.
    expect((await readProduct(env))?.stock).toBe(47);
    expect(await variantsOf(env)).toHaveLength(0);
  });

  it("refuses two options that carry the same choices under different keys", async () => {
    const env = await setup();
    const error = await capture(
      env.staff.mutation(api.catalogue.saveVariants, {
        slug: "standing-desk",
        variants: [
          { ...BLACK_WHITE[0]!, key: "black", options: { Colour: "Black" } },
          { ...BLACK_WHITE[1]!, key: "white", name: "Also black", options: { Colour: "Black" } },
        ],
      }),
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect(messageOf(error)).toMatch(/listed twice/);
    expect(await variantsOf(env)).toHaveLength(0);
  });

  it("refuses to save while two stored options hold the same choices, rather than pick one", async () => {
    const env = await setup();
    await withColours(env);
    // Corrupt the stored data directly: same choices, two different keys.
    await env.t.run(async (ctx) => {
      const dupe = await ctx.db
        .query("product_variants")
        .withIndex("by_product_key", (q) =>
          q.eq("product_slug", "standing-desk").eq("key", "white"),
        )
        .unique();
      await ctx.db.patch(dupe!._id, { key: "old-white", options: { Colour: "White" } });
      await ctx.db.insert("product_variants", {
        product_slug: "standing-desk",
        key: "white",
        name: "White",
        options: { Colour: "White" },
        price: null,
        sku: null,
        barcode: null,
        image_key: null,
        cost_price: null,
        sort_order: 1,
        visible: true,
        stock: 0,
        reserved: 0,
        version: 0,
      });
    });

    const error = await capture(
      env.staff.mutation(api.catalogue.saveVariants, {
        slug: "standing-desk",
        variants: [BLACK_WHITE[0]!],
      }),
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect(messageOf(error)).toMatch(/same choices/);
  });

  it("stores a new option under the canonical key, whatever key order the client sent", async () => {
    const env = await setup();
    await env.staff.mutation(api.catalogue.saveVariants, {
      slug: "standing-desk",
      variants: [
        {
          key: "120-x-60-cm--black", // Size-first — not canonical.
          name: "120 x 60 cm / Black",
          options: { Colour: "Black", Size: "120 x 60 cm" },
          price: null,
          sku: "DESK-BLK",
          barcode: null,
          image_key: null,
          cost_price: null,
          stock: 4,
          visible: true,
        },
      ],
    });
    const rows = await variantsOf(env);
    expect(rows.map((r) => r.key)).toEqual(["black--120-x-60-cm"]);
    expect(rows[0]).toMatchObject({ stock: 4, sku: "DESK-BLK" });
  });
});

describe("options stored under a different key order keep working", () => {
  /**
   * The live shop's shape: keys written Size-first (the staff editor once
   * crossed axes in insertion order), while every client since derives axes
   * colour-first. 4 + 3 = 7 units behind keys no canonical computation can
   * spell, and a parent row whose total had drifted to 5.
   */
  async function withStoredSizeFirst(env: Env) {
    await env.t.run(async (ctx) => {
      const desk = await ctx.db
        .query("products")
        .withIndex("by_slug", (q) => q.eq("slug", "standing-desk"))
        .unique();
      for (const row of [
        {
          key: "120-x-60-cm--black",
          name: "120 x 60 cm / Black",
          options: { Colour: "Black", Size: "120 x 60 cm" },
          stock: 4,
        },
        {
          key: "120-x-60-cm--white",
          name: "120 x 60 cm / White",
          options: { Colour: "White", Size: "120 x 60 cm" },
          stock: 3,
        },
      ]) {
        await ctx.db.insert("product_variants", {
          product_slug: "standing-desk",
          key: row.key,
          name: row.name,
          options: row.options,
          price: null,
          sku: null,
          barcode: null,
          image_key: null,
          cost_price: null,
          sort_order: 0,
          visible: true,
          stock: row.stock,
          reserved: 0,
          version: 0,
        });
      }
      // The drifted parent total this suite exists to explain.
      await ctx.db.patch(desk!._id, { stock: 5, reserved: 0, version: (desk!.version ?? 0) + 1 });
    });
  }

  const savedRow = (key: string, options: Record<string, string>, stock: number) => ({
    key,
    name: key,
    options,
    price: null,
    sku: null,
    barcode: null,
    image_key: null,
    cost_price: null,
    stock,
    visible: true,
  });

  it("a re-save matches by options: keys survive, nothing is written off, totals heal", async () => {
    const env = await setup();
    await withStoredSizeFirst(env);

    // Exactly what the fixed staff editor submits: the stored keys, unchanged.
    await env.staff.mutation(api.catalogue.saveVariants, {
      slug: "standing-desk",
      variants: [
        savedRow("120-x-60-cm--black", { Colour: "Black", Size: "120 x 60 cm" }, 4),
        savedRow("120-x-60-cm--white", { Colour: "White", Size: "120 x 60 cm" }, 3),
      ],
    });

    const rows = await variantsOf(env);
    expect(rows.map((r) => r.key).sort()).toEqual(["120-x-60-cm--black", "120-x-60-cm--white"]);
    expect(rows.map((r) => r.stock).sort()).toEqual([3, 4]);
    // 4 + 3: the drifted parent total is back in agreement with its options.
    expect((await readProduct(env))?.stock).toBe(7);
    // Not one unit was written off on the way.
    expect((await movements(env)).map((m) => m.reason)).not.toContain(
      "Option “120 x 60 cm / Black” removed",
    );
  });

  it("even a stale client sending canonical keys cannot churn the rows: options match, keys stay", async () => {
    const env = await setup();
    await withStoredSizeFirst(env);

    // A client that recomputes keys colour-first — the exact mismatch that
    // broke the storefront. The rows must be matched by their options.
    await env.staff.mutation(api.catalogue.saveVariants, {
      slug: "standing-desk",
      variants: [
        savedRow("black--120-x-60-cm", { Colour: "Black", Size: "120 x 60 cm" }, 4),
        savedRow("white--120-x-60-cm", { Colour: "White", Size: "120 x 60 cm" }, 3),
      ],
    });

    const rows = await variantsOf(env);
    expect(rows.map((r) => r.key).sort()).toEqual(["120-x-60-cm--black", "120-x-60-cm--white"]);
    expect(rows.map((r) => r.stock).sort()).toEqual([3, 4]);
    expect((await readProduct(env))?.stock).toBe(7);
  });
});

describe("the product form cannot re-write what the options add up to", () => {
  const formSave = (stock: number) => ({
    isNew: false,
    id: "standing-desk",
    name: "Electric sit-stand desk",
    brand: "IKEA",
    category: "desks",
    price: 999.99,
    original_price: null,
    stock,
    description: "A desk that rises with the day, sold in colours.",
    image_key: "desk",
    gallery: [] as string[],
    specs: {},
    verified: true,
  });

  it("saves the copy but leaves the derived total to the options", async () => {
    const env = await setup();
    await withColours(env); // Black 4 + White 3
    expect((await readProduct(env))?.stock).toBe(7);

    // A hand-typed "99" on the old editable field used to clobber the total.
    await env.staff.mutation(api.catalogue.saveProduct, formSave(99));

    expect((await readProduct(env))?.stock).toBe(7);
    expect((await variantOf(env, "black"))?.stock).toBe(4);
    expect((await variantOf(env, "white"))?.stock).toBe(3);
  });
});

describe("inventory refuses a product-level move once options own the stock", () => {
  it("adjust without an option is refused, adjust with one still works", async () => {
    const env = await setup();
    await withColours(env);

    const error = await capture(
      env.staff.mutation(api.inventory.adjust, {
        product_id: "standing-desk",
        delta: 5,
        reason: "Delivery received",
      }),
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect(messageOf(error)).toMatch(/sells in options/);

    await env.staff.mutation(api.inventory.adjust, {
      product_id: "standing-desk",
      variant_key: "black",
      delta: 5,
      reason: "Delivery received",
    });
    expect((await variantOf(env, "black"))?.stock).toBe(9);
    expect((await readProduct(env))?.stock).toBe(12);
  });

  it("count without an option is refused", async () => {
    const env = await setup();
    await withColours(env);

    const error = await capture(
      env.staff.mutation(api.inventory.count, {
        product_id: "standing-desk",
        counted: 100,
      }),
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect(messageOf(error)).toMatch(/sells in options/);
    expect((await readProduct(env))?.stock).toBe(7);
  });

  it("a product with no options still counts at product level", async () => {
    const env = await setup();
    await env.staff.mutation(api.inventory.count, {
      product_id: "standing-desk",
      counted: 42,
    });
    expect((await readProduct(env))?.stock).toBe(42);
  });
});

describe("inventory — stock moves against the option, and the total follows", () => {
  it("adjusts one colour without touching the other, and keeps the product as the sum", async () => {
    const env = await setup();
    await withColours(env);

    await env.staff.mutation(api.inventory.adjust, {
      product_id: "standing-desk",
      variant_key: "black",
      delta: -1,
      reason: "Damaged unit",
      movement_type: "damage",
    });

    expect((await variantOf(env, "black"))?.stock).toBe(3);
    expect((await variantOf(env, "white"))?.stock).toBe(3);
    // 3 + 3 — the total followed the colour that actually moved.
    expect((await readProduct(env))?.stock).toBe(6);
  });

  it("refuses to take a colour below zero", async () => {
    const env = await setup();
    await withColours(env);
    const error = await capture(
      env.staff.mutation(api.inventory.adjust, {
        product_id: "standing-desk",
        variant_key: "white",
        delta: -4,
        reason: "Written off as a loss",
        movement_type: "loss",
      }),
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect(messageOf(error)).toMatch(/below zero/);
    expect((await variantOf(env, "white"))?.stock).toBe(3);
  });

  it("names the option in the activity log rather than blaming the whole product", async () => {
    const env = await setup();
    await withColours(env);
    await env.staff.mutation(api.inventory.adjust, {
      product_id: "standing-desk",
      variant_key: "white",
      delta: 2,
      reason: "Delivery received",
      movement_type: "receive",
    });
    const log = await env.t.run((ctx) => ctx.db.query("activity_log").order("desc").first());
    expect(log?.summary).toContain("Electric sit-stand desk — White");
  });

  it("an unknown option is refused rather than silently applied to the product", async () => {
    const env = await setup();
    await withColours(env);
    const error = await capture(
      env.staff.mutation(api.inventory.adjust, {
        product_id: "standing-desk",
        variant_key: "midnight",
        delta: 5,
        reason: "Delivery received",
        movement_type: "receive",
      }),
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect(messageOf(error)).toMatch(/no longer exists/);
  });
});

describe("orders — the server decides the option's price and holds its stock", () => {
  it("prices the line from the variant, not from anything the browser said", async () => {
    const env = await setup();
    await withColours(env);
    await env.t.run(async (ctx) => {
      // Give White its own price; Black inherits the product's GH₵ 999.99.
      const white = await ctx.db
        .query("product_variants")
        .withIndex("by_product_key", (q) =>
          q.eq("product_slug", "standing-desk").eq("key", "white"),
        )
        .unique();
      await ctx.db.patch(white!._id, { price: 1250 });
    });

    const order = await env.customer.mutation(
      api.orders.place,
      checkout([
        { id: "standing-desk", quantity: 1, variant_key: "black" },
        { id: "standing-desk", quantity: 2, variant_key: "white" },
      ]),
    );

    expect(order.items.map((line) => [line.name, line.price, line.quantity])).toEqual([
      ["Electric sit-stand desk — Black", 999.99, 1],
      ["Electric sit-stand desk — White", 1250, 2],
    ]);
    expect(order.subtotal).toBe(999.99 + 2500);
    // The colour is recorded on the line, so the order reads back correctly.
    expect(order.items[1]).toMatchObject({ variant_key: "white", variant_name: "White" });
  });

  it("holds the units on the colour that was bought", async () => {
    const env = await setup();
    await withColours(env);
    await env.customer.mutation(
      api.orders.place,
      checkout([{ id: "standing-desk", quantity: 2, variant_key: "black" }]),
    );

    const black = await variantOf(env, "black");
    const white = await variantOf(env, "white");
    expect(black).toMatchObject({ stock: 2, reserved: 2 });
    expect(white).toMatchObject({ stock: 3, reserved: 0 });
    // 2 + 3 available on the shelf, with 2 promised — on-hand never moved.
    expect((await readProduct(env))?.stock).toBe(5);
    expect((await readProduct(env))?.reserved).toBe(2);
  });

  it("refuses a colour that is no longer for sale", async () => {
    const env = await setup();
    await withColours(env);
    await env.t.run(async (ctx) => {
      const white = await ctx.db
        .query("product_variants")
        .withIndex("by_product_key", (q) =>
          q.eq("product_slug", "standing-desk").eq("key", "white"),
        )
        .unique();
      await ctx.db.patch(white!._id, { visible: false });
    });
    const error = await capture(
      env.customer.mutation(
        api.orders.place,
        checkout([{ id: "standing-desk", quantity: 1, variant_key: "white" }]),
      ),
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect(messageOf(error)).toMatch(/no longer available/);
  });

  it("refuses more of a colour than there is, even though the product total would cover it", async () => {
    const env = await setup();
    await withColours(env);
    const error = await capture(
      env.customer.mutation(
        api.orders.place,
        checkout([{ id: "standing-desk", quantity: 6, variant_key: "black" }]),
      ),
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect(messageOf(error)).toMatch(/not available/);
    expect((await readProduct(env))?.stock).toBe(7);
  });

  it("cancelling returns the units to the colour they left from", async () => {
    const env = await setup();
    await withColours(env);
    const order = await env.customer.mutation(
      api.orders.place,
      checkout([{ id: "standing-desk", quantity: 2, variant_key: "black" }]),
    );

    await env.staff.mutation(api.orders.staffUpdate, {
      id: order.id,
      status: "cancelled",
      payment: "pending",
      note: "Customer changed their mind",
    });

    expect(await variantOf(env, "black")).toMatchObject({ stock: 4, reserved: 0 });
    expect(await variantOf(env, "white")).toMatchObject({ stock: 3, reserved: 0 });
    expect(await readProduct(env)).toMatchObject({ stock: 7, reserved: 0 });
  });

  it("dispatching takes the units off the right colour for good", async () => {
    const env = await setup();
    await withColours(env);
    const order = await env.customer.mutation(
      api.orders.place,
      checkout([{ id: "standing-desk", quantity: 2, variant_key: "white" }]),
    );

    await env.staff.mutation(api.orders.staffUpdate, {
      id: order.id,
      status: "dispatched",
      payment: "pending",
    });

    expect(await variantOf(env, "white")).toMatchObject({ stock: 1, reserved: 0 });
    expect(await variantOf(env, "black")).toMatchObject({ stock: 4, reserved: 0 });
    // 4 + 1: White really did lose two units to a customer.
    expect((await readProduct(env))?.stock).toBe(5);
  });

  it("a retried checkout holds each colour exactly once", async () => {
    const env = await setup();
    await withColours(env);
    const args = checkout([{ id: "standing-desk", quantity: 1, variant_key: "black" }]);
    const first = await env.customer.mutation(api.orders.place, args);
    const second = await env.customer.mutation(api.orders.place, args);

    // Two orders, two holds — the idempotency key is per line, per colour.
    expect(first.reference).not.toBe(second.reference);
    expect(await variantOf(env, "black")).toMatchObject({ stock: 2, reserved: 2 });
  });
});

describe("a product with no options is untouched", () => {
  it("still sells straight from its own stock", async () => {
    const env = await setup();
    const order = await env.customer.mutation(
      api.orders.place,
      checkout([{ id: "standing-desk", quantity: 2 }]),
    );

    expect(order.items[0]).toMatchObject({
      name: "Electric sit-stand desk",
      price: 999.99,
      quantity: 2,
    });
    // No phantom option fields on a plain line.
    expect(order.items[0]).not.toHaveProperty("variant_key");
    expect(await readProduct(env)).toMatchObject({ stock: 48, reserved: 2 });
    expect(await variantsOf(env)).toHaveLength(0);
  });
});
