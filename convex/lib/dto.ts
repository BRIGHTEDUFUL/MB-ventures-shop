import type { Doc } from "../_generated/dataModel";

/**
 * Icon key on a homepage trust-strip row, derived from the generated doc type
 * so it can never drift from the `trustIcon` validator in `convex/schema.ts`.
 */
export type TrustIcon = NonNullable<Doc<"store_settings">["home_trust"]>[number]["icon"];

/**
 * Public DTOs.
 *
 * These mirror the Supabase/Postgres row shapes the storefront already
 * consumes (`id`, `created_at` as an ISO string, prices as numbers), so the
 * existing route components keep working unchanged.
 */

export type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  original_price: number | null;
  stock: number;
  description: string;
  specs: Record<string, string>;
  image_key: string;
  gallery: string[];
  verified: boolean;
};

export type Category = {
  id: string;
  image_key: string;
  name: string;
  short_name: string;
  sort_order: number;
  visible: boolean;
};

/** One homepage trust-strip row: an icon key plus its two lines of copy. */
export type HomeTrustItem = { icon: TrustIcon; title: string; text: string };

export type Settings = {
  id: number;
  hero_title: string;
  hero_subtitle: string;
  phone: string;
  email: string;
  address: string;
  hours: string;
  momo_number: string;
  momo_name: string;
  central_fee: number;
  greater_fee: number;
  nationwide_fee: number;
  free_threshold: number;
  ordering_enabled: boolean;
  hero_image: string;
  setup_image: string;
  announcement: string;
  whatsapp: string;
  featured_ids: string[];
  // Homepage section copy — always concrete on the client (see settingsDTO).
  home_category_heading: string;
  home_featured_heading: string;
  home_setup_eyebrow: string;
  home_setup_heading: string;
  home_setup_body: string;
  home_cta_heading: string;
  home_cta_body: string;
  home_brands: string[];
  home_trust: HomeTrustItem[];
};

export type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_key: string;
};

export type Order = {
  id: string;
  reference: string;
  user_id: string | null;
  customer_name: string;
  email: string;
  phone: string;
  address: string;
  fulfillment: "delivery" | "pickup";
  zone: "central" | "greater" | "nationwide";
  payment_method: "momo" | "cod";
  provider: string | null;
  transaction_reference: string | null;
  payment_status: "pending" | "confirmed" | "rejected";
  status: "received" | "processing" | "ready" | "dispatched" | "completed" | "cancelled";
  subtotal: number;
  delivery_fee: number;
  total: number;
  items: OrderItem[];
  created_at: string;
  /** Set when delivery mail to the customer bounced or was complained about. */
  needs_attention: string | null;
};

export type HistoryEntry = { status: string; note: string; created_at: string };

export type Receipt = Pick<
  Order,
  | "reference"
  | "status"
  | "payment_status"
  | "payment_method"
  | "fulfillment"
  | "items"
  | "subtotal"
  | "delivery_fee"
  | "total"
  | "created_at"
> & { history?: HistoryEntry[] };

export type SavedAddress = { id: string; name: string; address: string; phone: string };

export type StoreData = { products: Product[]; categories: Category[]; settings: Settings };

/**
 * Staff-only product master data — what the editor needs and the storefront
 * must never see: codes, cost, supplier and reorder levels. Returned by
 * `catalogue.productDetail`, never by `store.get`.
 */
export type ProductMaster = {
  slug: string;
  /**
   * `products.version` at load time, sent back as `expected_version` so a
   * stale tab loses loudly instead of overwriting someone else's save.
   */
  version: number;
  sku: string | null;
  barcode: string | null;
  supplier: string | null;
  cost_price: number | null;
  reorder_point: number | null;
  reorder_quantity: number | null;
  status: "draft" | "active" | "archived";
};

export const productDTO = (product: Doc<"products">): Product => ({
  id: product.slug,
  name: product.name,
  brand: product.brand,
  category: product.category,
  price: product.price,
  original_price: product.original_price ?? null,
  stock: product.stock,
  description: product.description,
  specs: product.specs,
  image_key: product.image_key,
  gallery: product.gallery,
  verified: product.verified,
});

export const categoryDTO = (category: Doc<"categories">): Category => ({
  id: category.slug,
  image_key: category.image_key,
  name: category.name,
  short_name: category.short_name,
  sort_order: category.sort_order,
  visible: category.visible,
});

/**
 * Homepage copy the store opened with.
 *
 * `store_settings` rows written before the section-copy fields existed come
 * back `undefined`/blank, and `settingsDTO` fills them from here — so the
 * storefront renders byte-for-byte what it did before, with no backfill and no
 * seed re-run in either deployment.
 *
 * Rules:
 *  - **strings**: blank or missing → default. A section cannot be blanked out;
 *    staff rewrite the copy instead.
 *  - **arrays**: missing → default items; `[]` → staff hid that section.
 */
export const HOME_CONTENT_DEFAULTS: Pick<
  Settings,
  | "home_category_heading"
  | "home_featured_heading"
  | "home_setup_eyebrow"
  | "home_setup_heading"
  | "home_setup_body"
  | "home_cta_heading"
  | "home_cta_body"
  | "home_brands"
  | "home_trust"
> = {
  home_category_heading: "Find your workspace essentials",
  home_featured_heading: "For your everyday setup",
  home_setup_eyebrow: "Work, play, and everything in between",
  home_setup_heading: "A place for your best work.",
  home_setup_body:
    "Start with a desk and chair. Add the tools you use every day. Put your workspace together with help from our Abelenkpe shop.",
  home_cta_heading: "Your Abelenkpe shop. Now closer to your doorstep.",
  home_cta_body:
    "Collect your order at Abelenkpe taxi rank, Accra, or have it delivered to your door. Our shop team handles your order and confirms every Mobile Money payment personally.",
  home_brands: ["Logitech", "IKEA", "elgato"],
  home_trust: [
    { icon: "map-pin", title: "A real shop at Abelenkpe", text: "Visit us in Accra" },
    { icon: "truck", title: "Delivery across Ghana", text: "Accra, Tema and beyond" },
    { icon: "shield-check", title: "Store warranty", text: "Support from our shop" },
    { icon: "wallet", title: "Pay your way", text: "Mobile Money or cash on delivery" },
  ],
};

export const settingsDTO = (settings: Doc<"store_settings">): Settings => {
  const {
    _id: _id,
    _creationTime: _creationTime,
    key: _key,
    home_category_heading,
    home_featured_heading,
    home_setup_eyebrow,
    home_setup_heading,
    home_setup_body,
    home_cta_heading,
    home_cta_body,
    home_brands,
    home_trust,
    ...fields
  } = settings;
  const text = (value: string | undefined, fallback: string) =>
    value !== undefined && value.trim() !== "" ? value : fallback;
  return {
    id: 1,
    ...fields,
    home_category_heading: text(home_category_heading, HOME_CONTENT_DEFAULTS.home_category_heading),
    home_featured_heading: text(home_featured_heading, HOME_CONTENT_DEFAULTS.home_featured_heading),
    home_setup_eyebrow: text(home_setup_eyebrow, HOME_CONTENT_DEFAULTS.home_setup_eyebrow),
    home_setup_heading: text(home_setup_heading, HOME_CONTENT_DEFAULTS.home_setup_heading),
    home_setup_body: text(home_setup_body, HOME_CONTENT_DEFAULTS.home_setup_body),
    home_cta_heading: text(home_cta_heading, HOME_CONTENT_DEFAULTS.home_cta_heading),
    home_cta_body: text(home_cta_body, HOME_CONTENT_DEFAULTS.home_cta_body),
    home_brands: home_brands ?? HOME_CONTENT_DEFAULTS.home_brands,
    home_trust: home_trust ?? HOME_CONTENT_DEFAULTS.home_trust,
  };
};

export const orderDTO = (order: Doc<"orders">): Order => ({
  id: order._id,
  reference: order.reference,
  user_id: order.user_id,
  customer_name: order.customer_name,
  email: order.email,
  phone: order.phone,
  address: order.address,
  fulfillment: order.fulfillment,
  zone: order.zone,
  payment_method: order.payment_method,
  provider: order.provider ?? null,
  transaction_reference: order.transaction_reference ?? null,
  payment_status: order.payment_status,
  status: order.status,
  subtotal: order.subtotal,
  delivery_fee: order.delivery_fee,
  total: order.total,
  items: order.items,
  created_at: new Date(order._creationTime).toISOString(),
  needs_attention: order.needs_attention ?? null,
});

/** Order timeline rows to the DTO shape shared by orders.track and orders.mine. */
export const historyDTO = (entries: Doc<"order_history">[]): HistoryEntry[] =>
  entries.map((entry) => ({
    status: entry.status,
    note: entry.note,
    created_at: new Date(entry._creationTime).toISOString(),
  }));

export const receiptDTO = (order: Doc<"orders">, history: Doc<"order_history">[]): Receipt => ({
  reference: order.reference,
  status: order.status,
  payment_status: order.payment_status,
  payment_method: order.payment_method,
  fulfillment: order.fulfillment,
  items: order.items,
  subtotal: order.subtotal,
  delivery_fee: order.delivery_fee,
  total: order.total,
  created_at: new Date(order._creationTime).toISOString(),
  history: historyDTO(history),
});

export const savedAddressDTO = (address: Doc<"saved_addresses">): SavedAddress => ({
  id: address._id,
  name: address.name,
  address: address.address,
  phone: address.phone,
});
