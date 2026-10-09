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
  HomeTrustItem,
  TrustIcon,
} from "../../convex/lib/dto";

// Shared with the backend so the storefront, the delivery page and the staff
// forms can never disagree about fees, the announcement or a WhatsApp link.
export {
  DEFAULT_ANNOUNCEMENT,
  DEFAULT_FEES,
  announcementText,
  displayFees,
  normalizeWhatsApp,
  validateWhatsApp,
  whatsappHref,
  type FeeBreakdown,
} from "../../convex/lib/rules";

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
/**
 * Public origin of the storefront (`VITE_SITE_URL`), with no trailing slash.
 * Absolute SEO URLs (canonical, og:url, og:image, sitemap entries) are only
 * emitted when it is known, so an unset value degrades to relative URLs rather
 * than a confidently wrong absolute one.
 */
export const SITE_ORIGIN = (import.meta.env["VITE_SITE_URL"] ?? "").replace(/\/+$/, "");

/** Absolute URL for a path — absolute inputs pass through untouched. */
export const absoluteUrl = (path: string) =>
  /^https?:\/\//.test(path) ? path : `${SITE_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;

/** Default social card image; product pages pass their own photo instead. */
export const DEFAULT_SOCIAL_IMAGE = "/images/workspace.jpg";

export const pageHead = (
  name: string,
  description: string,
  opts: { image?: string | undefined } = {},
) => {
  const image = absoluteUrl(opts.image ?? DEFAULT_SOCIAL_IMAGE);
  return {
    meta: [
      { title: `${name} | MB Ventures GH` },
      { name: "description", content: description },
      { property: "og:title", content: `${name} | MB Ventures GH` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:image", content: image },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: image },
    ],
  };
};
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
  { id: "central", name: "Accra Central & Abelenkpe", time: "Same day or next day" },
  { id: "greater", name: "Greater Accra", time: "1–2 business days" },
  { id: "nationwide", name: "Nationwide", time: "2–4 business days" },
];
