import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

const SETTINGS = {
  key: "singleton",
  hero_title: "Made for your workspace.",
  hero_subtitle: "Desks, chairs and everyday tech. From our Circle shop to your setup.",
  phone: "+233 24 000 0000",
  email: "orders@mbventuresgh.com",
  address: "Circle Commercial Area, Accra, Ghana",
  hours: "Monday to Saturday, 8:00 AM to 6:00 PM",
  momo_number: "",
  momo_name: "",
  central_fee: 30,
  greater_fee: 50,
  nationwide_fee: 100,
  free_threshold: 5000,
  ordering_enabled: false,
  hero_image: "workspace",
  setup_image: "workspace",
  announcement: "Circle, Accra · Pickup in store · Delivery across Ghana",
  whatsapp: "",
  featured_ids: ["standing-desk", "ergonomic-chair", "mechanical-keyboard"],
};

const CATEGORIES = [
  {
    slug: "desks",
    name: "Gaming & office desks",
    short_name: "Desks",
    image_key: "desk",
    sort_order: 1,
  },
  {
    slug: "chairs",
    name: "Office chairs",
    short_name: "Chairs",
    image_key: "chair",
    sort_order: 2,
  },
  {
    slug: "accessories",
    name: "Computer accessories",
    short_name: "Accessories",
    image_key: "keyboard",
    sort_order: 3,
  },
  {
    slug: "mounts",
    name: "Stands & mounts",
    short_name: "Stands & mounts",
    image_key: "arm",
    sort_order: 4,
  },
  {
    slug: "audio",
    name: "Streaming & audio",
    short_name: "Streaming & audio",
    image_key: "mic",
    sort_order: 5,
  },
];

const SAMPLE = "Example catalogue item awaiting store confirmation.";

const PRODUCTS = [
  {
    slug: "standing-desk",
    name: "Electric sit-stand desk",
    brand: "IKEA",
    category: "desks",
    price: 2400,
    description: `A height-adjustable desk for seated and standing work. ${SAMPLE}`,
    specs: { Width: "120 cm", Depth: "60 cm", Adjustment: "Electric", Finish: "White / oak" },
    image_key: "desk",
  },
  {
    slug: "gaming-desk",
    name: "Gaming workstation desk",
    brand: "IKEA",
    category: "desks",
    price: 1850,
    description: `A generous desktop for a monitor and peripherals. ${SAMPLE}`,
    specs: { Width: "140 cm", Depth: "80 cm", Finish: "Black" },
    image_key: "gaming",
  },
  {
    slug: "ergonomic-chair",
    name: "Ergonomic mesh office chair",
    brand: "IKEA",
    category: "chairs",
    price: 1650,
    description: `Mesh back and adjustable seating for your desk. ${SAMPLE}`,
    specs: { Back: "Breathable mesh", Armrests: "Adjustable", Base: "Five-star" },
    image_key: "chair",
  },
  {
    slug: "office-chair",
    name: "High-back office chair",
    brand: "IKEA",
    category: "chairs",
    price: 2200,
    description: `High-back office seating. ${SAMPLE}`,
    specs: { Back: "High back", Seat: "Adjustable height", Colour: "Black" },
    image_key: "chair",
  },
  {
    slug: "mechanical-keyboard",
    name: "MX mechanical wireless keyboard",
    brand: "Logitech",
    category: "accessories",
    price: 1299,
    description: `Wireless keyboard for everyday work. ${SAMPLE}`,
    specs: { Connection: "Bluetooth / USB receiver", Layout: "Full size", Power: "Rechargeable" },
    image_key: "keyboard",
  },
  {
    slug: "wireless-mouse",
    name: "MX Master wireless mouse",
    brand: "Logitech",
    category: "accessories",
    price: 850,
    description: `Wireless ergonomic mouse. ${SAMPLE}`,
    specs: {
      Connection: "Bluetooth / USB receiver",
      Scroll: "Precision scroll",
      Power: "Rechargeable",
    },
    image_key: "mouse",
  },
  {
    slug: "monitor-arm",
    name: "Adjustable monitor arm",
    brand: "IKEA",
    category: "mounts",
    price: 650,
    description: `Adjust your monitor position and reclaim desk space. ${SAMPLE}`,
    specs: { Mount: "Desk clamp", Adjustment: "Height / tilt", Compatibility: "VESA" },
    image_key: "arm",
  },
  {
    slug: "laptop-stand",
    name: "Laptop support stand",
    brand: "IKEA",
    category: "mounts",
    price: 280,
    description: `Raise your laptop above your work surface. ${SAMPLE}`,
    specs: { Material: "Metal", Type: "Desktop stand" },
    image_key: "stand",
  },
  {
    slug: "usb-microphone",
    name: "Wave USB microphone",
    brand: "Elgato",
    category: "audio",
    price: 1450,
    description: `A desktop microphone for calls and recording. ${SAMPLE}`,
    specs: { Connection: "USB", Type: "Condenser", Control: "On-device mute" },
    image_key: "mic",
  },
  {
    slug: "stream-controller",
    name: "Stream Deck controller",
    brand: "Elgato",
    category: "audio",
    price: 1800,
    description: `Programmable keys for your streaming setup. ${SAMPLE}`,
    specs: { Keys: "15 LCD keys", Connection: "USB", Software: "Stream Deck" },
    image_key: "stream",
  },
];

async function seedIfMissing(ctx: MutationCtx) {
  const settings = await ctx.db
    .query("store_settings")
    .withIndex("by_key", (q) => q.eq("key", "singleton"))
    .unique();
  if (settings === null) await ctx.db.insert("store_settings", SETTINGS);

  for (const category of CATEGORIES) {
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", category.slug))
      .first();
    if (existing === null) await ctx.db.insert("categories", { ...category, visible: true });
  }

  let inserted = 0;
  for (const product of PRODUCTS) {
    const existing = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", product.slug))
      .first();
    if (existing === null) {
      await ctx.db.insert("products", {
        ...product,
        original_price: null,
        stock: 0,
        gallery: [],
        verified: false,
      });
      inserted += 1;
    }
  }
  return inserted;
}

/**
 * Idempotent seed: settings, categories and the 10 sample products from the
 * original Supabase migrations. Safe to run repeatedly.
 *
 * `npx convex run seed:seed`
 */
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const inserted = await seedIfMissing(ctx);
    const products = await ctx.db.query("products").collect();
    const categories = await ctx.db.query("categories").collect();
    return {
      products: products.length,
      categories: categories.length,
      newlyInserted: inserted,
    };
  },
});
