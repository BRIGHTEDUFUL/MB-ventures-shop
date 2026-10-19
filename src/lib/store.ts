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
// forms can never disagree about the announcement or a WhatsApp link. Delivery
// fees are no longer part of this: riders charge the customer directly, so no
// fee number ever reaches the browser.
export {
  DEFAULT_ANNOUNCEMENT,
  LOW_STOCK_AT,
  announcementText,
  normalizeWhatsApp,
  validateWhatsApp,
  whatsappHref,
} from "../../convex/lib/rules";

export const money = (n: number, decimals = false) =>
  `GH₵ ${n.toLocaleString("en-GH", { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: 2 })}`;

/**
 * Where an order came from, written the way the staff screens say it.
 * Rows without a channel (written before the field existed) render no chip.
 */
export const CHANNEL_LABEL: Record<NonNullable<Order["channel"]>, string> = {
  online: "Online",
  whatsapp: "WhatsApp",
  phone: "Phone",
  walk_in: "Walk-in",
};

/**
 * How an order is paid, spelled out for the payment panels. `paystack` is
 * here only so the map stays total — a staff-recorded order can never carry
 * it (the server refuses that method on `orders.staffCreate`).
 */
export const PAYMENT_METHOD_LABEL: Record<Order["payment_method"], string> = {
  momo: "Mobile Money",
  cod: "Cash on delivery",
  pay_at_store: "Pay at the shop",
  paystack: "Online payment (Paystack)",
};

/**
 * The catalogue price slider's fixed top: GH₵ 50,000, by the shop's choice.
 * The filter itself stays wide open until the shopper drags the slider —
 * the bound only exists once someone selects it — so this number is the
 * range's end, never a default filter. (The bug this replaces hard-coded
 * the *filter* at 5,000, silently hiding the GH₵ 5,600–10,500 monitors.)
 */
export const PRICE_SLIDER_MAX = 50_000;

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
  /**
   * `offline` keeps the pay-later model (cash at the counter / to the courier);
   * `online` routes the order through Paystack's hosted checkout. The choice
   * only appears when the store has online payments switched on.
   */
  payment: "online" | "offline";
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
export const zones = [
  { id: "central", name: "Accra Central & Abelenkpe", time: "Same day or next day" },
  { id: "greater", name: "Greater Accra", time: "1–2 business days" },
  { id: "nationwide", name: "Nationwide", time: "2–4 business days" },
];
