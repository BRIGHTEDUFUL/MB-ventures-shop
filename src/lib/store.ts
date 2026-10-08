import { ConvexError } from "convex/values";
import { convexQueryOptions } from "./convex";
import { api } from "../../convex/_generated/api";

// Legacy Supabase row shapes, now served by Convex (`convex/lib/dto.ts`).
export type {
  Product,
  Settings,
  Order,
  Receipt,
  Category,
  OrderItem,
  SavedAddress,
  StoreData,
  HistoryEntry,
} from "../../convex/lib/dto";

export const money = (n: number, decimals = false) =>
  `GH₵ ${n.toLocaleString("en-GH", { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Checkout form state — the payload sent to `orders.place` (plus the item list). */
export type CheckoutForm = {
  customer_name: string;
  phone: string;
  email: string;
  address: string;
  fulfillment: "delivery" | "pickup";
  zone: "central" | "greater" | "nationwide";
  payment_method: "momo" | "cod";
  provider: string;
  transaction_reference: string;
};

/**
 * Convex surfaces user-facing failures as `ConvexError({ message })`; plain
 * `Error` messages are redacted in production, so fall back to copy we choose.
 */
export const errorMessage = (error: unknown, fallback: string) => {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "string" && data) return data;
    if (data && typeof data === "object" && "message" in data) {
      const message = (data as { message: unknown }).message;
      if (typeof message === "string" && message) return message;
    }
  }
  if (error instanceof Error && error.message && error.message !== "Server Error")
    return error.message;
  return fallback;
};
export const specs = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value).map(([k, v]) => [k, String(v)])
    : [];
/** Public storefront bundle — products, categories and settings (server is authoritative). */
export const storeQuery = convexQueryOptions(api.store.get, {});
export const pageHead = (name: string, description: string) => ({
  meta: [
    { title: `${name} | MB Ventures GH` },
    { name: "description", content: description },
    { property: "og:title", content: `${name} | MB Ventures GH` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ],
});
export const delivery = (
  settings: {
    central_fee: number;
    greater_fee: number;
    nationwide_fee: number;
    free_threshold: number;
  },
  zone: string,
  subtotal: number,
  pickup = false,
) =>
  pickup || subtotal > settings.free_threshold
    ? 0
    : zone === "central"
      ? settings.central_fee
      : zone === "greater"
        ? settings.greater_fee
        : settings.nationwide_fee;
export const zones = [
  { id: "central", name: "Accra Central & Circle", time: "Same day or next day" },
  { id: "greater", name: "Greater Accra", time: "1–2 business days" },
  { id: "nationwide", name: "Nationwide", time: "2–4 business days" },
];
