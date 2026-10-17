import { ConvexError } from "convex/values";
import { convexQueryOptions } from "./convex";
import { api } from "../../convex/_generated/api";

// Legacy Supabase row shapes, now served by Convex (`convex/lib/dto.ts`).
import type { Order, Product } from "../../convex/lib/dto";
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
  ProductMaster,
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

/**
 * The catalogue price slider's ceiling comes from the shelf itself, never a
 * constant. A hard maximum hides every product priced above it the moment an
 * admin uploads something pricier (the GH₵ 10,500 monitor was invisible while
 * the slider topped out at 5,000), so the top of the range is the priciest
 * product on sale today, rounded up to the next 100. The floor keeps an empty
 * catalogue drawing a sane slider.
 */
export const priceCeiling = (products: Pick<Product, "price">[]) => {
  const priciest = products.reduce((most, p) => Math.max(most, p.price), 0);
  return Math.max(1000, Math.ceil(priciest / 100) * 100);
};

/** The catalogue filter's inputs — component state, kept as plain data. */
export type CatalogueFilter = {
  category: string;
  q: string;
  /** Upper price bound; `null` means no ceiling (every product passes). */
  max: number | null;
  stock: boolean;
  sale: boolean;
  brand: string;
};

/**
 * The one predicate behind the catalogue grid and its "N products" count.
 * Extracted so the count and the cards can never disagree, and so the
 * regression that motivated it stays pinned: a default filter (no price
 * ceiling) must pass every listed product, whatever it costs.
 */
export const filterCatalogue = (products: Product[], f: CatalogueFilter) => {
  const query = f.q.trim().toLowerCase();
  return products.filter(
    (p) =>
      p.visible !== false &&
      (!f.category || p.category === f.category) &&
      (!query || `${p.name} ${p.brand}`.toLowerCase().includes(query)) &&
      p.price <= (f.max ?? Infinity) &&
      (!f.stock || (p.verified && p.stock > 0)) &&
      (!f.sale || (p.original_price && p.original_price > p.price)) &&
      (!f.brand || p.brand === f.brand),
  );
};

/**
 * The one written form of each order state — the staff pills and the
 * transition selects read from here together, so a dropdown never offers a
 * raw lowercase value the pills beside it would never show. Shared vocabulary
 * rather than a component, which is also why it lives in `store.ts`.
 */
export const STATUS_LABEL: Record<Order["status"], string> = {
  received: "Received",
  processing: "Processing",
  ready: "Ready",
  dispatched: "Dispatched",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PAYMENT_LABEL: Record<Order["payment_status"], string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  rejected: "Rejected",
};

/** Checkout form state — the payload sent to `orders.place` (plus the item list). */
export type CheckoutForm = {
  customer_name: string;
  phone: string;
  email: string;
  address: string;
  fulfillment: "delivery" | "pickup";
  zone: "central" | "greater" | "nationwide";
};

/**
 * Convex surfaces user-facing failures as `ConvexError({ message })`; plain
 * `Error` messages are redacted in production, so fall back to copy we choose.
 * Raw connection/transport errors (like in-flight connection drops) are translated
 * into clear, friendly messages rather than technical protocol traces.
 */
export const errorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "string" && data) return data;
    if (data && typeof data === "object" && "message" in data) {
      const message = (data as { message: unknown }).message;
      if (typeof message === "string" && message) return message;
    }
  }
  if (error instanceof Error && error.message) {
    const msg = error.message.trim();
    if (msg === "Server Error") return fallback;

    // Handle WebSocket / transport drop errors
    if (/connection lost|in flight|websocket|network error|failed to fetch/i.test(msg)) {
      return "Connection was temporarily interrupted. Please try again.";
    }

    // Handle authentication credentials failure
    if (/invalid email or password|incorrect password|could not authenticate/i.test(msg)) {
      return "Incorrect email or password. Please verify your credentials and try again.";
    }

    // Strip Convex internal tags like "[CONVEX A(auth:signIn)]" or "Called by client"
    if (msg.startsWith("[CONVEX") || /called by client/i.test(msg)) {
      const cleaned = msg
        .replace(/^\[CONVEX[^\]]*\]\s*/i, "")
        .replace(/\s*called by client\s*$/i, "")
        .trim();
      if (cleaned && !/connection lost/i.test(cleaned)) {
        return cleaned;
      }
      return "Connection was temporarily interrupted. Please try again.";
    }

    return msg;
  }
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
export const DEFAULT_SOCIAL_IMAGE = "/images/workspace.webp";

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
