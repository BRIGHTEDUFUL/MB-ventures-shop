import type { Doc } from "../_generated/dataModel";

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

export const settingsDTO = (settings: Doc<"store_settings">): Settings => {
  const { _id: _id, _creationTime: _creationTime, key: _key, ...fields } = settings;
  return { id: 1, ...fields };
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
});

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
  history: history.map((entry) => ({
    status: entry.status,
    note: entry.note,
    created_at: new Date(entry._creationTime).toISOString(),
  })),
});

export const savedAddressDTO = (address: Doc<"saved_addresses">): SavedAddress => ({
  id: address._id,
  name: address.name,
  address: address.address,
  phone: address.phone,
});
