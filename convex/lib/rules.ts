/**
 * Pure order rules ported rule-for-rule from the Supabase Postgres functions
 * (`place_store_order`, `staff_update_order`, `track_store_order`) that this
 * backend replaces.
 *
 * These are the single source of truth for validation messages and the money
 * rules that decide what an order totals. The Convex mutations call them
 * authoritatively; the browser uses them for *estimates* only (AGENTS.md:
 * totals are estimates until the server computes them).
 *
 * Nothing in this file may import from `convex/` so it stays unit-testable.
 */

export type Zone = "central" | "greater" | "nationwide";
export type Fulfillment = "delivery" | "pickup";
/**
 * How an order is paid. Money never moves inside the app: `orders.place`
 * derives this from fulfilment (`pickup` → pay at the shop, `delivery` →
 * cash on arrival). `momo` survives only for orders placed under the old
 * in-app Mobile Money flow.
 */
export type PaymentMethod = "momo" | "cod" | "pay_at_store";
export type PaymentStatus = "pending" | "confirmed" | "rejected";
/** Channels a staff member can record (`orders.staffCreate`); `online` is stamped by checkout. */
export type OrderChannel = "online" | "whatsapp" | "phone" | "walk_in";
export type OrderStatus =
  "received" | "processing" | "ready" | "dispatched" | "completed" | "cancelled";

export const ZONES: Zone[] = ["central", "greater", "nationwide"];
export const ORDER_STATUSES: OrderStatus[] = [
  "received",
  "processing",
  "ready",
  "dispatched",
  "completed",
  "cancelled",
];
export const PAYMENT_STATUSES: PaymentStatus[] = ["pending", "confirmed", "rejected"];

/** Settings-driven copy shown in the header facts bar; empty means "hide it". */
export const DEFAULT_ANNOUNCEMENT = "Abelenkpe, Accra · Pickup in store · Delivery across Ghana";

/** On-hand counts at or below this deserve a restock — the "running low" line. */
export const LOW_STOCK_AT = 5;

/**
 * What checkout validation needs from the settings row: the ordering switch.
 *
 * The delivery-fee fields (`central_fee`, `greater_fee`, `nationwide_fee`,
 * `free_threshold`) still exist on `store_settings` as inert legacy — see the
 * schema — but no rule here reads them: the shop no longer charges delivery,
 * riders bill the customer directly.
 */
export interface CheckoutSettings {
  ordering_enabled: boolean;
}

export interface CheckoutInput {
  customer_name: string;
  phone: string;
  email: string;
  address: string;
  fulfillment: Fulfillment;
  zone: Zone;
  items: { id: string; quantity: number }[];
}

/** Order snapshot the staff dashboard validates status changes against. */
export interface OrderState {
  fulfillment: Fulfillment;
  status: OrderStatus;
  payment_status: PaymentStatus;
}

export const round2 = (value: number) => Math.round(value * 100) / 100;

/** Postgres used `regexp_replace(phone,'[^0-9+]','','g')` everywhere. */
export const normalizePhone = (raw: string) => raw.replace(/[^0-9+]/g, "");

/** Postgres checked `email NOT LIKE '%@%.%'`. */
export const isValidEmail = (email: string) => /.+@.+\..+/.test(email.trim());

/**
 * Digits only, in the form `https://wa.me/<digits>` expects.
 *
 * Staff paste whatever is in their contacts — `024 123 4567`,
 * `+233 (0) 24 123 4567` or `233241234567` — and all three must land on the
 * same chat, otherwise `wa.me` silently opens a dead link. Ghana is the only
 * country this store ships to, so a leading `0` (or a `2330` after a `+233`
 * paste) is promoted to `233`.
 */
export function normalizeWhatsApp(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("2330")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = `233${digits.slice(1)}`;
  return digits;
}

/**
 * Message a staff member can fix, or `null` when the value is usable.
 * Blank is valid: the storefront falls back to the shop phone number.
 */
export function validateWhatsApp(raw: string): string | null {
  const digits = normalizeWhatsApp(raw);
  if (digits === "") return null;
  if (digits.length < 9 || digits.length > 15) {
    return "Enter a valid WhatsApp number, e.g. 0241234567.";
  }
  return null;
}

/**
 * `wa.me` link for the store's WhatsApp, or `null` when neither the WhatsApp
 * field nor the shop phone yields a dialable number — callers then fall back
 * to a `tel:` link instead of rendering a dead anchor.
 */
export function whatsappHref(
  settings: { whatsapp: string; phone: string },
  message?: string,
): string | null {
  const target = normalizeWhatsApp(settings.whatsapp) || normalizeWhatsApp(settings.phone);
  if (target.length < 9) return null;
  const base = `https://wa.me/${target}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/**
 * The announcement to show, or `""` when the bar should not render at all.
 * `""` is a deliberate "hide it" from staff, so it must not fall back to a
 * default (the old `?? default` could never fire on an empty string).
 */
export const announcementText = (settings: { announcement: string } | null | undefined): string =>
  settings ? settings.announcement.trim() : "";

/**
 * Fees are gone. The shop no longer charges delivery — riders bill the
 * customer directly — so there is no `deliveryFee`, no free-delivery
 * threshold and no cart hint left to keep in step with the server. The only
 * thing checkout still decides about fulfilment is the address.
 *
 * Returns the user-facing message, or `null` when the payload is valid.
 */
export function validateCheckout(input: CheckoutInput, settings: CheckoutSettings): string | null {
  if (!settings.ordering_enabled) return "Ordering is not open yet. Contact the Abelenkpe shop.";

  if (
    input.customer_name.trim().length < 2 ||
    normalizePhone(input.phone).length < 9 ||
    !isValidEmail(input.email)
  ) {
    return "Enter your name, phone and email.";
  }

  if (input.items.length < 1 || input.items.length > 50) {
    return "Your cart is empty or too large.";
  }
  for (const line of input.items) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 50) {
      return "Invalid quantity.";
    }
  }

  if (input.fulfillment === "delivery" && input.address.trim().length < 5) {
    return "Enter a delivery address.";
  }

  return null;
}

/**
 * Deliveries outside Accra travel with long-haul couriers after the goods
 * have left the shop, and the shop quotes no delivery fee up front — "cash
 * on arrival" cannot cover a failed delivery hundreds of kilometres away. A
 * `nationwide` delivery order must therefore be paid online at checkout;
 * Accra (`central` / `greater`) delivery and shop pickup keep their offline
 * options, and staff counter orders are deliberately exempt (taken in person
 * — `validateManualOrder`).
 *
 * Returns the shopper-facing message refusing an offline payment, or null
 * when the choice is fine. Shared by `orders.place` (authoritative) and the
 * checkout page (which hides the offline option and explains why).
 */
export function offlinePaymentProblem(
  zone: Zone,
  fulfillment: Fulfillment,
  payment: "online" | "offline",
): string | null {
  if (payment === "offline" && fulfillment === "delivery" && zone === "nationwide") {
    return "Orders delivered outside Accra must be paid online — card, Mobile Money or bank transfer.";
  }
  return null;
}

/** What `orders.staffCreate` receives, after defaults are applied by the mutation. */
export interface ManualOrderInput {
  customer_name: string;
  phone: string;
  /** May be empty — many walk-ins have no email. Valid when present. */
  email: string;
  address: string;
  fulfillment: Fulfillment;
  zone: Zone;
  items: { id: string; quantity: number }[];
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  channel: Exclude<OrderChannel, "online">;
  /**
   * Flat GH₵ off the order, entered by staff at the counter. Optional; the
   * shape check lives here (no NaN, nothing negative) while the round-trip
   * bound against the subtotal is checked in `orders.staffCreate`, which is
   * the only place that knows the price the server computed.
   */
  discount?: number | undefined;
}

/**
 * Validation for an order a staff member records themselves
 * (`orders.staffCreate`). Deliberate differences from `validateCheckout`:
 *
 * - **No `ordering_enabled` gate.** That switch governs the storefront; a sale
 *   that already happened at the counter is always written down.
 * - **Email is optional** (a walk-in often has none) but must be valid when
 *   given, so an address can never be quietly recorded broken.
 * - **The payment method is checked instead of derived.** Checkout derives it
 *   from fulfilment because the shopper picks nothing; the staff form offers
 *   all three offline methods, so each is pinned to the fulfilment it can
 *   honestly describe — and `paystack` is not accepted at all: money through
 *   Paystack only ever comes from the customer's own hosted checkout.
 */
export function validateManualOrder(input: ManualOrderInput): string | null {
  if (input.customer_name.trim().length < 2 || normalizePhone(input.phone).length < 9) {
    return "Enter the customer's name and phone number.";
  }
  if (input.email.trim() !== "" && !isValidEmail(input.email)) {
    return "Enter a valid email address, or leave it blank.";
  }
  if (input.items.length < 1 || input.items.length > 50) {
    return "Add at least one item to the order.";
  }
  for (const line of input.items) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 50) {
      return "Invalid quantity.";
    }
  }
  if (input.fulfillment === "delivery" && input.address.trim().length < 5) {
    return "Enter a delivery address.";
  }
  if (input.payment_method === "pay_at_store" && input.fulfillment !== "pickup") {
    return "Pay at the shop only applies to pickup orders.";
  }
  if (input.payment_method === "cod" && input.fulfillment !== "delivery") {
    return "Cash on delivery only applies to delivery orders.";
  }
  if (!PAYMENT_STATUSES.includes(input.payment_status)) return "Invalid payment status.";
  // The discount is a plain cedi amount a staff member types at the counter:
  // NaN or Infinity would poison the total, and a negative one would *add*
  // money. (How big it may be is decided against the subtotal in
  // `orders.staffCreate`, where the server has priced the lines.)
  if (input.discount !== undefined && !Number.isFinite(input.discount)) {
    return "Enter a valid discount.";
  }
  if (input.discount !== undefined && input.discount < 0) {
    return "The discount can't be negative.";
  }
  if (input.channel !== "whatsapp" && input.channel !== "phone" && input.channel !== "walk_in") {
    return "Choose where the order came from.";
  }
  return null;
}

/**
 * Staff status/payment transition rules
 * (`public.staff_update_order`). Returns the message, or `null` when allowed.
 */
export function validateStatusChange(
  order: OrderState,
  newStatus: OrderStatus,
  newPayment: PaymentStatus,
): string | null {
  if (
    (order.status === "completed" || order.status === "cancelled") &&
    newStatus !== order.status
  ) {
    return "This order is closed.";
  }
  if (!ORDER_STATUSES.includes(newStatus)) return "Invalid status.";
  if (!PAYMENT_STATUSES.includes(newPayment)) return "Invalid payment status.";
  if (newStatus === "ready" && order.fulfillment !== "pickup") {
    return "Status does not match fulfillment.";
  }
  if (newStatus === "dispatched" && order.fulfillment !== "delivery") {
    return "Status does not match fulfillment.";
  }
  // An order may advance to any open status while payment is still pending —
  // money changes hands offline (at the counter or to the courier), so only
  // *closing* it needs the payment confirmed.
  if (newStatus === "completed" && newPayment !== "confirmed") {
    return "Confirm payment before completing the order.";
  }
  return null;
}
