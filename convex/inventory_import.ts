import { internalMutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { HOME_CONTENT_DEFAULTS } from "./lib/dto";
import { applyStockChange } from "./lib/stock";

export const DEMO_SLUGS = [
  "standing-desk",
  "gaming-desk",
  "ergonomic-chair",
  "office-chair",
  "mechanical-keyboard",
  "wireless-mouse",
  "monitor-arm",
  "laptop-stand",
  "usb-microphone",
  "stream-controller",
];

export const REAL_PRODUCTS = [
  {
    slug: "carbon-fiber-gaming-desk",
    name: "Black Carbon Fiber Gaming Computer Desk (140×60×75cm)",
    brand: "MB Ventures",
    category: "desks",
    price: 1450,
    original_price: 1750,
    stock: 10,
    description:
      "Ergonomic E-sports gaming computer desk featuring a high-density black carbon fiber textured tabletop and robust steel frame. Designed for single or dual monitor gaming setups with spacious legroom.",
    specs: {
      Dimensions: "140 × 60 × 75 cm",
      Material: "Carbon fiber texture tabletop, Steel frame",
      Design: "Ergonomic curved front",
      Use: "Gaming & Office Workstation",
    },
    image_key: "carbon-fiber-gaming-desk",
    gallery: [],
    verified: true,
    status: "active" as const,
    visible: true,
  },
  {
    slug: "luminous-rgb-mouse-pad",
    name: "Luminous RGB Oversized Gaming Mouse Pad (900×400×4mm)",
    brand: "MB Ventures",
    category: "accessories",
    price: 210,
    original_price: 250,
    stock: 10,
    description:
      "Oversized e-sports RGB desktop mouse pad with multi-mode perimeter lighting. Water-resistant and dirt-resistant micro-textured cloth surface with anti-slip rubber base for precision control.",
    specs: {
      Dimensions: "900 × 400 × 4 mm",
      Lighting: "Customizable multi-colour RGB",
      Surface: "Waterproof & dirt-resistant micro-weave",
      Base: "Anti-slip natural rubber",
    },
    image_key: "luminous-rgb-mouse-pad",
    gallery: [],
    verified: true,
    status: "active" as const,
    visible: true,
  },
  {
    slug: "360-rotating-laptop-stand",
    name: "360° Rotating Aluminum Laptop Stand",
    brand: "MB Ventures",
    category: "mounts",
    price: 230,
    original_price: 260,
    stock: 10,
    description:
      "Deep Space Gray Super Noble Edition aluminum laptop stand with full 360-degree smooth swivel base. Sturdy dual-hinge folding design elevates laptops to eye level for ergonomic comfort and improved airflow.",
    specs: {
      Rotation: "360° Swivel base",
      Colour: "Deep Space Gray",
      Material: "Premium Aluminum Alloy",
      Compatibility: "Laptops 10 to 17.3 inches",
    },
    image_key: "360-rotating-laptop-stand",
    gallery: [],
    verified: true,
    status: "active" as const,
    visible: true,
  },
  {
    slug: "dual-monitor-desk-mount",
    name: "Dual Monitor Desk Mount Stand (14–30 Inches)",
    brand: "MB Ventures",
    category: "mounts",
    price: 1120,
    original_price: 1500,
    stock: 10,
    description:
      "Double display dual screen desk mount stand in obsidian black with height-increasing adjustment. Secure desk clamp holds two monitors side-by-side or stacked, reclaiming desk surface area.",
    specs: {
      "Screen Support": "14 to 30 inches dual displays",
      Finish: "Obsidian Black",
      Mount: "Heavy-duty desk clamp / grommet",
      Adjustment: "Tilt, swivel, rotate & height adjust",
    },
    image_key: "dual-monitor-desk-mount",
    gallery: [],
    verified: true,
    status: "active" as const,
    visible: true,
  },
  {
    slug: "rock-360-phone-tablet-stand",
    name: "Rock 360° Rotating Foldable Phone & Tablet Stand",
    brand: "Rock",
    category: "mounts",
    price: 100,
    original_price: 120,
    stock: 10,
    description:
      "100% authentic Rock brand 360-degree rotating and lifting lazy desktop stand. Compact foldable multi-angle support base designed for smartphones and tablets up to 11 inches.",
    specs: {
      Brand: "Rock Authentic",
      Rotation: "360° Rotating base",
      Portability: "Foldable pocket size",
      Compatibility: "All phones and tablets up to 11 inches",
    },
    image_key: "rock-360-phone-tablet-stand",
    gallery: [],
    verified: true,
    status: "active" as const,
    visible: true,
  },
  {
    slug: "vertical-laptop-stand",
    name: "Multifunctional Vertical Laptop Stand Storage Base",
    brand: "MB Ventures",
    category: "mounts",
    price: 240,
    original_price: 300,
    stock: 10,
    description:
      "V1 single-clip vertical notebook stand in space gray. Premium desktop storage dock that cradles your laptop vertically to keep your desk organized, cool, and clutter-free.",
    specs: {
      Design: "V1 Single-clip space-saving dock",
      Colour: "Space Gray",
      Material: "Aluminum alloy with anti-scratch silicone pads",
      Compatibility: "MacBooks, Dell, HP, Lenovo laptops",
    },
    image_key: "vertical-laptop-stand",
    gallery: [],
    verified: true,
    status: "active" as const,
    visible: true,
  },
  {
    slug: "monitor-light-bar",
    name: "Computer Monitor Light Bar Screen Hanging Lamp",
    brand: "MB Ventures",
    category: "accessories",
    price: 450,
    original_price: 650,
    stock: 10,
    description:
      "Eye-care asymmetric optical light bar that clips directly onto top of desktop monitors. Eliminates screen glare and flicker while illuminating your desktop keyboard and work area with adjustable color temperatures.",
    specs: {
      Mount: "Weighted screen-top clamp",
      Power: "USB Type-C powered (5V)",
      Lighting: "Asymmetric anti-glare, eye protection",
      Controls: "Touch sensor brightness & temperature",
    },
    image_key: "monitor-light-bar",
    gallery: [],
    verified: true,
    status: "active" as const,
    visible: true,
  },
  {
    slug: "rgb-dynamic-usb-microphone",
    name: "Professional RGB Dynamic USB Microphone",
    brand: "MB Ventures",
    category: "audio",
    price: 2000,
    original_price: 2500,
    stock: 10,
    description:
      "Professional dynamic USB microphone engineered for gaming, live streaming, vocal recording, podcasts, and studio use. Features striking dynamic RGB lighting, tap-to-mute, gain knob, and real-time headphone monitoring.",
    specs: {
      Connection: "USB Plug & Play (PC/Mac/PS5)",
      "Polar Pattern": "Cardioid dynamic pickup",
      Lighting: "Dynamic RGB atmosphere effects",
      Controls: "Quick mute sensor, gain control, 3.5mm monitor jack",
    },
    image_key: "rgb-dynamic-usb-microphone",
    gallery: [],
    verified: true,
    status: "active" as const,
    visible: true,
  },
  {
    slug: "electric-standing-desk-rgb-160",
    name: "Solid Wood Electric Height-Adjustable Desk with RGB (160×60cm)",
    brand: "MB Ventures",
    category: "desks",
    price: 2800,
    original_price: 3200,
    stock: 10,
    description:
      "160×60cm solid wood electric adjustable standing table desk with carbon fiber surface, reinforced steel frame, RGB ambient lights, ABS headphone hook and cup holder. Features 3-speed memory function with 1-click reset, height adjustment from 72cm to 117cm, single motor lifting speed of 20-25mm/s, and 120KG load-bearing capacity.",
    specs: {
      Dimensions: "160 × 60 cm (Desktop panel thickness 18 mm)",
      "Height Range": "72 cm to 117 cm",
      "Lifting Speed": "20–25 mm/s (Single motor)",
      "Weight Capacity": "120 KG maximum load",
      Memory: "3-speed height memory with one-click reset",
      Extras: "RGB lighting atmosphere, ABS cup holder & earphone hook",
    },
    image_key: "electric-standing-desk-rgb-160",
    gallery: [],
    verified: true,
    status: "active" as const,
    visible: true,
  },
  {
    slug: "mottian-ai-smart-keyboard-mouse",
    name: "Mottian AI Smart Voice Typing Wireless Keyboard & Mouse Set",
    brand: "Mottian",
    category: "accessories",
    price: 1000,
    original_price: 1320,
    stock: 10,
    description:
      "Mottian AI smart voice typing wireless Bluetooth keyboard and mouse combo. Features instant intelligent voice input, real-time multilingual translation, quiet responsive keys, and dual-mode Bluetooth/2.4G connectivity.",
    specs: {
      Brand: "Mottian",
      Connectivity: "Bluetooth 5.0 + 2.4GHz Wireless USB",
      Features: "AI Voice input & multilingual translation",
      Power: "Rechargeable lithium battery",
    },
    image_key: "mottian-ai-smart-keyboard-mouse",
    gallery: [],
    verified: true,
    status: "active" as const,
    visible: true,
  },
  {
    slug: "custom-macro-mechanical-keyboard",
    name: "Custom Macro Mechanical Keyboard with Knob Control & LCD Display",
    brand: "MB Ventures",
    category: "accessories",
    price: 1500,
    original_price: 1750,
    stock: 10,
    description:
      "Custom mechanical shortcut keyboard equipped with multi-functional aluminum rotary knob control, interactive color LCD screen display, and programmable macro shortcut keys. Perfect for content creators, stream setups, video editors, and power users.",
    specs: {
      Display: "Interactive smart LCD screen",
      Control: "Smooth aluminum rotary knob for volume / scrub",
      Keys: "Hot-swappable mechanical switches with RGB backlight",
      Customization: "Programmable macro shortcuts & custom profiles",
    },
    image_key: "custom-macro-mechanical-keyboard",
    gallery: ["custom-macro-mechanical-keyboard-gallery"],
    verified: true,
    status: "active" as const,
    visible: true,
  },
];

/**
 * Imports real inventory, hides demo products from the public store,
 * updates featured hotspot picks to live inventory, and enables store ordering.
 *
 * Safe to run repeatedly (idempotent).
 *
 * `npx convex run inventory_import:apply` (add `--prod` for production)
 */
export const apply = internalMutation({
  args: {},
  handler: async (ctx) => {
    let demoUpdated = 0;
    let realInserted = 0;
    let realUpdated = 0;

    // 1. Hide existing demo items from the store (keep in database as draft)
    for (const slug of DEMO_SLUGS) {
      const existing = await ctx.db
        .query("products")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          verified: false,
          visible: false,
          status: "draft",
        });
        if (existing.stock > 0) {
          await applyStockChange(ctx, {
            slug: existing.slug,
            command: { kind: "set_on_hand", value: 0 },
            movement_type: "adjustment",
            source: "import",
            reason: "Archived demo inventory",
          });
        }
        demoUpdated += 1;
      }
    }

    // 2. Insert or update the 11 real products
    for (const item of REAL_PRODUCTS) {
      const existing = await ctx.db
        .query("products")
        .withIndex("by_slug", (q) => q.eq("slug", item.slug))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          name: item.name,
          brand: item.brand,
          category: item.category,
          price: item.price,
          original_price: item.original_price,
          description: item.description,
          specs: item.specs,
          image_key: item.image_key,
          gallery: item.gallery,
          verified: item.verified,
          status: item.status,
          visible: item.visible,
        });
        await applyStockChange(ctx, {
          slug: item.slug,
          command: { kind: "set_on_hand", value: item.stock },
          movement_type: "opening",
          source: "import",
          reason: "Initial store inventory stock",
        });
        realUpdated += 1;
      } else {
        await ctx.db.insert("products", {
          ...item,
          stock: 0,
          reserved: 0,
          version: 1,
        });

        await applyStockChange(ctx, {
          slug: item.slug,
          command: { kind: "set_on_hand", value: item.stock },
          movement_type: "opening",
          source: "import",
          reason: "Initial store inventory stock",
        });

        realInserted += 1;
      }
    }

    // 3. Update store settings with new featured hotspot items and enable ordering
    const settings = await ctx.db
      .query("store_settings")
      .withIndex("by_key", (q) => q.eq("key", "singleton"))
      .first();

    const featured_ids = [
      "electric-standing-desk-rgb-160",
      "360-rotating-laptop-stand",
      "custom-macro-mechanical-keyboard",
    ];

    if (settings) {
      await ctx.db.patch(settings._id, {
        ordering_enabled: true,
        featured_ids,
        hero_image: "hero-workspace",
        hero_title: "Your workspace. Elevated.",
        hero_subtitle:
          "Premium desks, gaming gear and everyday tech — delivered across Ghana or collected from Abelenkpe, Accra.",
      });
    }

    return {
      demoUpdated,
      realInserted,
      realUpdated,
      featured_ids,
      ordering_enabled: true,
      hero_image: "hero-workspace",
    };
  },
});

/**
 * One-shot: switch the hero background to the product-scene image.
 * `npx convex run inventory_import:patchHeroImage` (add `--prod` for production)
 */
export const patchHeroImage = internalMutation({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("store_settings")
      .withIndex("by_key", (q) => q.eq("key", "singleton"))
      .first();
    if (!settings) return { ok: false, reason: "no settings row" };
    await ctx.db.patch(settings._id, {
      hero_image: "hero-workspace",
      hero_title: "Your workspace. Elevated.",
      hero_subtitle:
        "Premium desks, gaming gear and everyday tech — delivered across Ghana or collected from Abelenkpe, Accra.",
    });
    return { ok: true, hero_image: "hero-workspace" };
  },
});

/** The pre pay-later homepage copy this mutation replaces when it finds it. */
const OLD_CTA_BODY =
  "Collect your order at Abelenkpe taxi rank, Accra, or have it delivered to your door. Our shop team handles your order and confirms every Mobile Money payment personally.";
const OLD_TRUST_WALLET = "Mobile Money or cash on delivery";

/**
 * One-shot: swap the homepage payment copy that predates pay-later ordering
 * for the current defaults — but only when it still matches the old text, so
 * a deliberate staff edit in Customization is never clobbered.
 * `npx convex run inventory_import:patchHomeCopy` (add `--prod` for production)
 */
export const patchHomeCopy = internalMutation({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("store_settings")
      .withIndex("by_key", (q) => q.eq("key", "singleton"))
      .first();
    if (!settings) return { ok: false, reason: "no settings row" };

    const patch: Partial<Doc<"store_settings">> = {};
    if (settings.home_cta_body === OLD_CTA_BODY) {
      patch.home_cta_body = HOME_CONTENT_DEFAULTS.home_cta_body;
    }
    const trust = settings.home_trust ?? [];
    const walletDefault = HOME_CONTENT_DEFAULTS.home_trust.find((item) => item.icon === "wallet");
    if (
      walletDefault &&
      trust.some((item) => item.icon === "wallet" && item.text === OLD_TRUST_WALLET)
    ) {
      patch.home_trust = trust.map((item) =>
        item.icon === "wallet" ? { ...item, text: walletDefault.text } : item,
      );
    }

    if (Object.keys(patch).length > 0) await ctx.db.patch(settings._id, patch);
    return { ok: true, patched: Object.keys(patch) };
  },
});
