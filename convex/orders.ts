import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";
import { requirePermission } from "./lib/permissions";
import {
  historyDTO,
  isListed,
  orderDTO,
  receiptDTO,
  type HistoryEntry,
  type Order,
  type Receipt,
} from "./lib/dto";
import { getSettings } from "./lib/settings";
import {
  normalizePhone,
  offlinePaymentProblem,
  round2,
  validateCheckout,
  validateManualOrder,
  validateStatusChange,
} from "./lib/rules";
import { applyStockChange, stockStateOf, type MovementSource, type StockState } from "./lib/stock";
import { cancelUnpaidOrder } from "./lib/orderCancel";
import { fail } from "./lib/errors";
import { pesewas } from "./lib/paystack";
import { validators } from "./schema";
import {
  notifyManualOrderPlaced,
  notifyOrderPlaced,
  notifyOrderUpdated,
} from "./emails/orderTriggers";

const checkoutArgs = {
  customer_name: v.string(),
  phone: v.string(),
  email: v.string(),
  address: v.string(),
  fulfillment: validators.fulfillment,
  zone: validators.zone,
  items: v.array(
    v.object({
      id: v.string(),
      quantity: v.number(),
      // Which option of `id` was bought. Absent = the product sells as a
      // single thing, which is every product that has no variants.
      variant_key: v.optional(v.string()),
    }),
  ),
  // How the shopper wants to pay. `offline` (the default) keeps the pay-later
  // model — derived from fulfilment, cash at the counter or to the courier.
  // `online` opts into Paystack: the order still lands here first (stock is
  // held immediately), and the browser is then sent to the hosted checkout
  // by `payments.initialize`. The gateway reference and amount are NEVER
  // accepted from the client — they are computed and stored right here.
  payment: v.optional(v.union(v.literal("online"), v.literal("offline"))),
};

/** `MB-` + 8 random bytes hex, retried until unique (Postgres had a UNIQUE constraint). */
async function uniqueReference(ctx: QueryCtx): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const reference =
      `MB-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
    const existing = await ctx.db
      .query("orders")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .first();
    if (existing === null) return reference;
  }
  // Ten colliding candidates means the orders table's current state is in the
  // way, not the caller's input — a typed error so the browser still gets the
  // sentence (plain `Error` messages are redacted to "Server Error").
  fail("STATE_CONFLICT", "Could not generate an order reference. Try again.");
}

async function historyFor(ctx: QueryCtx, orderId: Id<"orders">) {
  return await ctx.db
    .query("order_history")
    .withIndex("by_order", (q) => q.eq("order_id", orderId))
    .collect();
}

/** One line as a browser may describe it: identity, option, quantity. No money. */
type LineInput = { id: string; quantity: number; variant_key?: string | undefined };

/** Which door is holding the stock, for the ledger and the idempotency keys. */
type HoldDoor = {
  source: MovementSource;
  /** The staff member taking the order; undefined for a storefront checkout. */
  actorId?: Id<"users"> | undefined;
  /** Key namespace: `place:` for checkout, `manual:` for counter orders. */
  prefix: "place" | "manual";
  /** "cart" or "order" — the noun the refusal messages address the caller by. */
  what: "cart" | "order";
};

/**
 * Turn browser-supplied line identities into priced order lines, holding the
 * stock for each one. Shared by `place` (storefront) and `staffCreate`
 * (counter): both doors send only ids, options and quantities, and everything
 * money- or stock-shaped — the price, the label, the availability check and
 * the reservation itself — is decided here. Neither caller can therefore buy a
 * Black desk at White's price, skip the option picker, or hold stock the shop
 * does not have.
 */
async function holdLines(
  ctx: MutationCtx,
  reference: string,
  items: LineInput[],
  door: HoldDoor,
): Promise<{ lines: Order["items"]; subtotal: number }> {
  let subtotal = 0;
  const lines: Order["items"] = [];

  for (const line of items) {
    const product = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", line.id))
      .unique();
    // The storefront filters hidden and draft products out of every listing,
    // so checkout refuses them too — a crafted cart cannot buy something the
    // shop has pulled from sale. The counter form only offers listed products,
    // so both doors refuse exactly the same set.
    if (product === null || !product.verified || !isListed(product)) {
      throw new ConvexError({
        message: `An item is not available. Please check your ${door.what}.`,
      });
    }

    // Resolve the option, if the line named one. The browser sends only an
    // identity — the price, the stock check and the label are all decided
    // here, so a tampered cart cannot buy a Black desk at White's price.
    const wantedKey = line.variant_key?.trim() ?? "";
    const variant =
      wantedKey === ""
        ? null
        : await ctx.db
            .query("product_variants")
            .withIndex("by_product_key", (q) =>
              q.eq("product_slug", product.slug).eq("key", wantedKey),
            )
            .unique();
    if (wantedKey !== "" && (variant === null || !variant.visible)) {
      throw new ConvexError({
        message: `An item is no longer available. Please check your ${door.what}.`,
      });
    }

    // Guard: if this product sells in multiple versions, the order line must
    // name one of them. A tampered cart (or a future API caller) that skips
    // the picker would otherwise charge the base price and bypass per-variant
    // stock checks, which is both commercially wrong and a stock-integrity
    // violation. We only look for visible variants so a product whose sole
    // visible variant was just removed degrades gracefully to the base product.
    if (variant === null) {
      const hasVisibleVariants = await ctx.db
        .query("product_variants")
        .withIndex("by_product", (q) => q.eq("product_slug", product.slug))
        .filter((q) => q.eq(q.field("visible"), true))
        .first();
      if (hasVisibleVariants !== null) {
        throw new ConvexError({ message: "Please select an option before ordering." });
      }
    }

    const price = variant?.price ?? product.price;
    const available = variant === null ? product.stock : variant.stock;
    if (available < line.quantity) {
      throw new ConvexError({
        message: `An item is not available. Please check your ${door.what}.`,
      });
    }

    subtotal += price * line.quantity;
    lines.push({
      id: product.slug,
      // The option becomes part of the name so staff, receipts and the
      // top-sellers report all read the colour back without a join.
      name: variant === null ? product.name : `${product.name} — ${variant.name}`,
      price,
      quantity: line.quantity,
      image_key: variant?.image_key ?? product.image_key,
      ...(variant === null ? {} : { variant_key: variant.key, variant_name: variant.name }),
    });
    // The units are *held*, not gone: `stock` (available) drops so nobody
    // else can buy them, `reserved` grows by the same amount, and on-hand
    // (= stock + reserved) is unchanged until the goods actually leave.
    // Same visible number as the old direct decrement, but cancellable
    // without guessing what to restore.
    await applyStockChange(ctx, {
      slug: product.slug,
      ...(variant === null ? {} : { variant_key: variant.key }),
      command: { kind: "reserve", quantity: line.quantity },
      movement_type: "reserve",
      source: door.source,
      reason: `Sold on order ${reference}`,
      reference,
      ...(door.actorId === undefined ? {} : { actor_id: door.actorId }),
      // One intent, one movement: a retried client cannot double-hold. The
      // option is part of the key so two colours of one order are two holds.
      operation_key: `${door.prefix}:${reference}:${product.slug}${
        variant === null ? "" : `:${variant.key}`
      }`,
    });
  }

  return { lines, subtotal: round2(subtotal) };
}

/**
 * Place an order. Replaces `public.place_store_order(payload)`:
 * authoritative pricing/stock, ordering switch, and the full checkout
 * validation set — all inside one transaction, so concurrent purchases of the
 * last unit cannot oversell.
 *
 * The browser never sends a price, a fee or a discount: the total is
 * `round2(subtotal)` and nothing else. Delivery is free to the shop — the
 * rider is paid by the customer directly — and discounts belong to the
 * counter (`orders.staffCreate`), so this argument list deliberately has no
 * field for either.
 *
 * Requires a signed-in account (confirmed product decision); browsing and
 * tracking stay public.
 */
export const place = mutation({
  args: checkoutArgs,
  handler: async (ctx, args): Promise<Order> => {
    const userId = await requireUser(ctx);
    const settings = await getSettings(ctx);

    const problem = validateCheckout(
      {
        customer_name: args.customer_name,
        phone: args.phone,
        email: args.email,
        address: args.address,
        fulfillment: args.fulfillment,
        zone: args.zone,
        items: args.items,
      },
      settings,
    );
    if (problem !== null) throw new ConvexError({ message: problem });

    // Deliveries beyond Accra ride with long-haul couriers and cannot be
    // cash-on-arrival: the shopper must pay online. The checkout UI steers
    // nationwide delivery to "Pay online now" — this shared rule is the
    // authoritative backstop for anyone who forges the argument. Staff
    // counter orders (`staffCreate`) are exempt: taken in person at the shop.
    const offlineProblem = offlinePaymentProblem(
      args.zone,
      args.fulfillment,
      args.payment ?? "offline",
    );
    if (offlineProblem !== null) throw new ConvexError({ message: offlineProblem });

    // Online payment must be both switched on by staff and configured on the
    // server; the checkout only offers the choice when this passes.
    const online = args.payment === "online";
    if (online && settings.paystack_enabled !== true) {
      throw new ConvexError({
        message:
          "Online payment is not available right now. Please pay on delivery or at the shop.",
      });
    }

    // A shopper who backs out of Paystack and checks out again must not
    // leave the first reservation holding stock forever: the older unpaid
    // online order is cancelled (stock returned, deliberately silent — no
    // cancellation mail for a checkout that never finished). Payment is
    // still pending here, so a `charge.success` racing this cancellation
    // always wins inside `cancelUnpaidOrder`'s guard.
    if (online) {
      const recent = await ctx.db
        .query("orders")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .order("desc")
        .take(25);
      for (const old of recent) {
        if (old.payment_method !== "paystack") continue;
        if (old.payment_status !== "pending" || old.status !== "received") continue;
        await cancelUnpaidOrder(ctx, old, {
          reason: "Superseded by a newer checkout attempt.",
          actorId: null,
          notify: false,
        });
      }
    }

    const reference = await uniqueReference(ctx);
    const { lines, subtotal } = await holdLines(ctx, reference, args.items, {
      source: "checkout",
      prefix: "place",
      what: "cart",
    });

    // The shop no longer charges delivery: the rider is paid by the customer
    // directly, so a new order books `delivery_fee: 0` and the total is the
    // subtotal to the pesewa. There is no fee lookup left that could fail on
    // the zone — `validators.zone` is a closed union, so a delivery order
    // always names a real area (the old "Choose a delivery area." guard was
    // unreachable and went with the fees).
    const orderId = await ctx.db.insert("orders", {
      reference,
      user_id: userId,
      // Every storefront checkout says so — the counterpart to the counter
      // channels (`whatsapp` / `phone` / `walk_in`) staff pick in /staff.
      channel: "online",
      customer_name: args.customer_name.trim(),
      email: args.email.trim(),
      phone: normalizePhone(args.phone),
      address: args.address.trim(),
      fulfillment: args.fulfillment,
      zone: args.zone,
      // Offline orders keep the pay-later model: the method is simply where
      // the cash changes hands (pickup → shop counter, delivery → courier).
      // Online orders are paid through Paystack; the charge is confirmed
      // later by the return page or the webhook, never by the browser here.
      payment_method: online ? "paystack" : args.fulfillment === "pickup" ? "pay_at_store" : "cod",
      payment_status: "pending",
      status: "received",
      subtotal,
      delivery_fee: 0,
      total: round2(subtotal),
      items: lines,
      // The exact amount (pesewas) a Paystack charge must match to confirm
      // this order. Locked now, next to the total it was computed from.
      ...(online ? { payment_amount_pesewas: pesewas(round2(subtotal)) } : {}),
      // Tracks what happened to the physical units for this order, so a
      // later cancellation returns them exactly once and never twice.
      stock_state: "reserved",
    });

    await ctx.db.insert("order_history", {
      order_id: orderId,
      status: "received",
      note: online
        ? "Order received. Complete the online payment to confirm it — your items are reserved while you pay."
        : args.fulfillment === "pickup"
          ? "Order received. Pay at the shop when you collect your order."
          : "Order received. Pay cash when your order arrives.",
    });

    const order = await ctx.db.get(orderId);
    if (order === null) fail("NOT_FOUND", "Order could not be saved.");

    // Notifications only: a failure here is swallowed inside
    // `scheduleEmail`, so the order itself always commits.
    await notifyOrderPlaced(ctx, order);

    return orderDTO(order);
  },
});

/**
 * Look up an order by reference + phone. Replaces `public.track_store_order`.
 * Public: no account needed, but the reference (unguessable) plus the phone
 * number are both required — this is the AGENTS.md guest-tracking rule.
 */
export const track = query({
  args: { ref: v.string(), customer_phone: v.string() },
  handler: async (ctx, args): Promise<Receipt | null> => {
    const reference = args.ref.trim().toUpperCase();
    const phone = normalizePhone(args.customer_phone);
    if (reference === "" || phone === "") return null;

    const order = await ctx.db
      .query("orders")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .first();
    if (order === null || order.phone !== phone) return null;

    return receiptDTO(order, await historyFor(ctx, order._id));
  },
});

/**
 * The signed-in customer's own orders, newest first, each carrying its timeline
 * so `/orders` can show progress without a second round trip per order.
 */
export const mine = query({
  args: {},
  handler: async (ctx): Promise<(Order & { history: HistoryEntry[] })[]> => {
    const userId = await requireUser(ctx);
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .order("desc")
      .take(100);
    return await Promise.all(
      orders.map(async (order) => ({
        ...orderDTO(order),
        history: historyDTO(await historyFor(ctx, order._id)),
      })),
    );
  },
});

/**
 * Staff dashboard feed (filtered server-side): newest first, matching the
 * status/payment/search filters, capped at the 300 most recent orders.
 */
export const staffList = query({
  args: {
    status: v.optional(validators.orderStatus),
    payment: v.optional(validators.paymentStatus),
    q: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Order[]> => {
    await requirePermission(ctx, "orders.view");
    const search = (args.q ?? "").trim().toLowerCase();
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 300);
    const orders = await ctx.db.query("orders").order("desc").take(300);
    return orders
      .filter((o) => {
        if (args.status !== undefined && o.status !== args.status) return false;
        if (args.payment !== undefined && o.payment_status !== args.payment) return false;
        if (search !== "") {
          // Channels are searchable too — "whatsapp" finds the orders taken
          // from WhatsApp, which is how the shop re-reads a day's messages.
          const haystack =
            `${o.reference} ${o.customer_name} ${o.phone} ${o.email} ${o.channel ?? ""}`.toLowerCase();
          if (!haystack.includes(search)) return false;
        }
        return true;
      })
      .slice(0, limit)
      .map(orderDTO);
  },
});

export type StaffHistoryEntry = {
  status: string;
  note: string;
  actor_name: string;
  created_at: string;
};

/** One order plus its full timeline (with the staff member on each entry). */
export const staffGet = query({
  args: { id: v.string() },
  handler: async (ctx, args): Promise<{ order: Order; history: StaffHistoryEntry[] }> => {
    await requirePermission(ctx, "orders.view");
    const orderId = ctx.db.normalizeId("orders", args.id);
    if (orderId === null) throw new ConvexError({ message: "Order not found." });
    const order = await ctx.db.get(orderId);
    if (order === null) throw new ConvexError({ message: "Order not found." });

    const rows = await ctx.db
      .query("order_history")
      .withIndex("by_order", (q) => q.eq("order_id", orderId))
      .collect();
    const history: StaffHistoryEntry[] = await Promise.all(
      rows.map(async (row) => {
        const actor = row.actor_id ? await ctx.db.get(row.actor_id) : null;
        return {
          status: row.status,
          note: row.note,
          actor_name: actor?.name?.trim() || actor?.email?.trim() || "Shop system",
          created_at: new Date(row._creationTime).toISOString(),
        };
      }),
    );
    history.sort((a, b) => a.created_at.localeCompare(b.created_at));

    return { order: orderDTO(order), history };
  },
});

/**
 * Record an order a staff member took in the shop — a WhatsApp message, a
 * phone call, a walk-in at the counter. The mirror of `place` with the same
 * guarantees: the server prices every line, holds the stock and books the
 * (zero) delivery fee inside one transaction, so a counter sale counts
 * against the shelf exactly like an online one and flows through the same
 * `staffUpdate` cancel/complete machinery afterwards.
 *
 * This is the only door that takes a discount: a flat GH₵ amount staff enter
 * at the counter, held to `orders.discount` and bounded by the subtotal the
 * server just computed.
 *
 * Guarded by `orders.create` (staff floor): an attendant can record sales
 * without admin access. The customer's account stays empty — a walk-in has
 * none — while `created_by` records who took the order.
 */
export const staffCreate = mutation({
  args: {
    customer_name: v.string(),
    phone: v.string(),
    // Optional: a walk-in often has no email, and one must never be invented
    // (scheduling a confirmation to `""` only earns a failed email-log row).
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    fulfillment: validators.fulfillment,
    zone: validators.zone,
    items: v.array(
      v.object({
        id: v.string(),
        quantity: v.number(),
        // Which option of `id` was bought — same identity-only contract as
        // checkout: the price and stock of the option are decided server-side.
        variant_key: v.optional(v.string()),
      }),
    ),
    // The sale's three shop-side channels. `online` is excluded on purpose:
    // that one is stamped by `orders.place`, never chosen by hand.
    channel: v.optional(v.union(v.literal("whatsapp"), v.literal("phone"), v.literal("walk_in"))),
    // The three offline methods only. `paystack` is deliberately not accepted:
    // money through Paystack only ever comes from the customer's own hosted
    // checkout, never from a form staff fill in.
    payment_method: v.optional(
      v.union(v.literal("momo"), v.literal("cod"), v.literal("pay_at_store")),
    ),
    // `confirmed` means the cash/MoMo is already in hand while the order is
    // taken, so it is recorded in the same breath instead of as a later update.
    payment_status: v.optional(validators.paymentStatus),
    // A flat GH₵ off the whole order, set once here and never editable later.
    // Guarded by `orders.discount` below once a price exists to compare it to.
    discount: v.optional(v.number()),
    // Anything the customer promised or asked for, kept on the timeline.
    note: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Order> => {
    const actorId = await requirePermission(ctx, "orders.create");
    const actor = await ctx.db.get(actorId);
    const actorName = actor?.name?.trim() || actor?.email?.trim() || "Shop staff";

    const email = (args.email ?? "").trim();
    const address = (args.address ?? "").trim();
    const channel = args.channel ?? "walk_in";
    const payment_method =
      args.payment_method ?? (args.fulfillment === "pickup" ? "pay_at_store" : "cod");
    const payment_status = args.payment_status ?? "pending";
    const note = (args.note ?? "").trim();
    if (note.length > 500) {
      throw new ConvexError({ message: "Keep the note under 500 characters." });
    }

    const problem = validateManualOrder({
      customer_name: args.customer_name,
      phone: args.phone,
      email,
      address,
      fulfillment: args.fulfillment,
      zone: args.zone,
      items: args.items,
      payment_method,
      payment_status,
      channel,
      discount: args.discount,
    });
    if (problem !== null) throw new ConvexError({ message: problem });

    const reference = await uniqueReference(ctx);
    const { lines, subtotal } = await holdLines(ctx, reference, args.items, {
      source: "attendant",
      actorId,
      prefix: "manual",
      what: "order",
    });

    // A discount is a counter-only privilege: no discount, no question. With
    // one, the caller must hold `orders.discount` (staff floor by default,
    // revocable per person), then the amount has to fit inside the subtotal
    // the server just priced — a bigger one would pay the shop to take the
    // goods. Every throw here rolls the whole transaction back, so a refused
    // discount never leaves stock held.
    const rawDiscount = args.discount ?? 0;
    if (!Number.isFinite(rawDiscount)) {
      throw new ConvexError({ message: "Enter a valid discount." });
    }
    if (rawDiscount > 0) {
      await requirePermission(ctx, "orders.discount");
    }
    const discount = round2(rawDiscount);
    if (discount > subtotal) {
      throw new ConvexError({ message: "The discount can't be bigger than the order." });
    }

    const orderId = await ctx.db.insert("orders", {
      reference,
      // No customer account: a walk-in sale belongs to nobody's login. Who
      // *took* the order is `created_by` below.
      channel,
      created_by: actorId,
      created_by_name: actorName,
      customer_name: args.customer_name.trim(),
      email,
      phone: normalizePhone(args.phone),
      address,
      fulfillment: args.fulfillment,
      zone: args.zone,
      payment_method,
      payment_status,
      status: "received",
      subtotal,
      // The shop does not charge delivery — the rider is paid by the
      // customer directly — so a counter order books the same 0 fee a
      // storefront checkout does. Only a discount can move the total away
      // from the subtotal, and only when one was entered.
      delivery_fee: 0,
      ...(discount > 0 ? { discount } : {}),
      total: round2(subtotal - discount),
      items: lines,
      // Held, exactly like a checkout reservation: a later cancellation
      // releases it once, a completion commits it once (`staffUpdate`).
      stock_state: "reserved",
    });

    // The timeline, in words the customer would recognise if they called in.
    const taken =
      channel === "whatsapp"
        ? "Order taken from WhatsApp"
        : channel === "phone"
          ? "Order taken by phone"
          : "Walk-in order recorded";
    const howToPay =
      payment_method === "pay_at_store"
        ? "Pay at the shop when the customer collects."
        : payment_method === "cod"
          ? "Pay cash when the order arrives."
          : payment_status === "confirmed"
            ? "Mobile Money received at the counter."
            : "Mobile Money payment pending — confirm it once it lands.";
    await ctx.db.insert("order_history", {
      order_id: orderId,
      status: "received",
      note: `${taken}. ${howToPay}`,
      actor_id: actorId,
    });
    if (discount > 0) {
      // Same shape as the "taken" note above: plain words on the timeline, in
      // the cedis-and-round2 money format the rest of the back office uses.
      await ctx.db.insert("order_history", {
        order_id: orderId,
        status: "received",
        note: `Discount of GH₵ ${discount} applied.`,
        actor_id: actorId,
      });
    }
    if (note !== "") {
      await ctx.db.insert("order_history", {
        order_id: orderId,
        status: "received",
        note,
        actor_id: actorId,
      });
    }
    if (payment_status === "confirmed") {
      await ctx.db.insert("order_history", {
        order_id: orderId,
        status: "received",
        note: "Payment: confirmed · Received when the order was taken.",
        actor_id: actorId,
      });
    }

    const order = await ctx.db.get(orderId);
    if (order === null) fail("NOT_FOUND", "Order could not be saved.");

    // Notifications only: a failure here is swallowed inside `scheduleEmail`,
    // so the order itself always commits (same contract as `place`).
    await notifyManualOrderPlaced(ctx, order);

    return orderDTO(order);
  },
});

/**
 * Staff status/payment transitions. Replaces `public.staff_update_order`,
 * including the closed-order rule, the fulfillment/status match and
 * restocking on cancellation. Payment is collected offline (at the counter or
 * by the courier), so staff simply record it here — no in-app verification.
 */
export const staffUpdate = mutation({
  args: {
    id: v.string(),
    status: validators.orderStatus,
    payment: validators.paymentStatus,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "orders.update");
    const orderId = ctx.db.normalizeId("orders", args.id);
    if (orderId === null) throw new ConvexError({ message: "Order not found." });

    const order = await ctx.db.get(orderId);
    if (order === null) throw new ConvexError({ message: "Order not found." });

    const problem = validateStatusChange(order, args.status, args.payment);
    if (problem !== null) throw new ConvexError({ message: problem });
    const note = (args.note ?? "").trim();
    if (note.length > 500)
      throw new ConvexError({ message: "Keep the note under 500 characters." });

    const previousStatus = order.status;
    const previousPayment = order.payment_status;

    // What is this order currently doing to the shelf? Orders written before
    // `stock_state` existed infer it from their status (the migration writes
    // the same answer), so a legacy row behaves exactly like a new one.
    const heldState = stockStateOf(order);
    let nextStockState: StockState | undefined;

    if (order.status !== "cancelled" && args.status === "cancelled") {
      for (const line of order.items) {
        const product = await ctx.db
          .query("products")
          .withIndex("by_slug", (q) => q.eq("slug", line.id))
          .first();
        if (product === null) continue; // listing removed after the order closed
        // The units go back to the *option* they left from — cancelling must
        // not hand Black's stock to White.
        const heldKey = line.variant_key?.trim() ?? "";
        const onto = heldKey === "" ? {} : { variant_key: heldKey };
        const suffix = heldKey === "" ? "" : `:${heldKey}`;
        if (heldState === "reserved") {
          // The goods never left: hand the same units back to the shelf.
          await applyStockChange(ctx, {
            slug: product.slug,
            ...onto,
            command: { kind: "release", quantity: line.quantity },
            movement_type: "release",
            source: "order",
            reason: `Restock: order ${order.reference} cancelled`,
            actor_id: actorId,
            reference: order.reference,
            operation_key: `cancel:${order.reference}:${product.slug}${suffix}`,
          });
        } else if (heldState === "committed") {
          // Already out of the shop — this is goods coming *back*, which is a
          // different story in the ledger than a hold being dropped.
          await applyStockChange(ctx, {
            slug: product.slug,
            ...onto,
            command: { kind: "restock", quantity: line.quantity },
            movement_type: "restock",
            source: "order",
            reason: `Restock: order ${order.reference} cancelled after dispatch`,
            actor_id: actorId,
            reference: order.reference,
            operation_key: `cancel:${order.reference}:${product.slug}${suffix}`,
          });
        }
        // `released` / `restocked` already gave the units back — cancelling
        // twice (or cancelling a refunded-then-cancelled order) must not.
      }
      nextStockState = heldState === "committed" ? "restocked" : "released";
    } else if (
      (args.status === "dispatched" || args.status === "completed") &&
      heldState === "reserved"
    ) {
      // The goods left the shop: the hold becomes a real reduction of the
      // shelf count. Available stock was already taken at checkout, so only
      // `reserved` moves — and only once, because the state below is written
      // in this same transaction.
      for (const line of order.items) {
        const product = await ctx.db
          .query("products")
          .withIndex("by_slug", (q) => q.eq("slug", line.id))
          .first();
        if (product === null) continue;
        const heldKey = line.variant_key?.trim() ?? "";
        await applyStockChange(ctx, {
          slug: product.slug,
          ...(heldKey === "" ? {} : { variant_key: heldKey }),
          command: { kind: "commit", quantity: line.quantity },
          movement_type: "commit",
          source: "order",
          reason: `Order ${order.reference} ${args.status === "dispatched" ? "dispatched" : "completed"} — stock leaves the shelf`,
          actor_id: actorId,
          reference: order.reference,
          operation_key: `commit:${order.reference}:${product.slug}${
            heldKey === "" ? "" : `:${heldKey}`
          }`,
        });
      }
      nextStockState = "committed";
    }

    await ctx.db.patch(orderId, {
      status: args.status,
      payment_status: args.payment,
      ...(nextStockState !== undefined ? { stock_state: nextStockState } : {}),
    });
    await ctx.db.insert("order_history", {
      order_id: orderId,
      status: args.status,
      note: note === "" ? `Payment: ${args.payment}` : `Payment: ${args.payment} · ${note}`,
      actor_id: actorId,
    });

    const updated = await ctx.db.get(orderId);
    if (updated !== null) {
      await notifyOrderUpdated(ctx, updated, {
        previousStatus,
        previousPayment,
        note,
        actorId,
      });
    }

    return { ok: true };
  },
});

/** Staff note on an order without changing its status (call logs, promises). */
export const staffNote = mutation({
  args: { id: v.string(), note: v.string() },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "orders.update");
    const note = args.note.trim();
    if (note === "") throw new ConvexError({ message: "Enter a note." });
    if (note.length > 500)
      throw new ConvexError({ message: "Keep the note under 500 characters." });
    const orderId = ctx.db.normalizeId("orders", args.id);
    if (orderId === null) throw new ConvexError({ message: "Order not found." });
    const order = await ctx.db.get(orderId);
    if (order === null) throw new ConvexError({ message: "Order not found." });

    await ctx.db.insert("order_history", {
      order_id: orderId,
      status: order.status,
      note,
      actor_id: actorId,
    });
    return { ok: true };
  },
});

/**
 * Correct customer details (phone typos break guest tracking; address changes
 * happen before dispatch). Totals and items stay untouched — those are
 * re-priced only through the original checkout.
 */
export const staffFixContact = mutation({
  args: {
    id: v.string(),
    customer_name: v.string(),
    phone: v.string(),
    address: v.string(),
  },
  handler: async (ctx, args) => {
    const actorId = await requirePermission(ctx, "orders.update");
    const orderId = ctx.db.normalizeId("orders", args.id);
    if (orderId === null) throw new ConvexError({ message: "Order not found." });
    const order = await ctx.db.get(orderId);
    if (order === null) throw new ConvexError({ message: "Order not found." });

    const name = args.customer_name.trim();
    const phone = normalizePhone(args.phone);
    const address = args.address.trim();
    if (name.length < 2) throw new ConvexError({ message: "Enter the customer's name." });
    if (phone.length < 9) throw new ConvexError({ message: "Enter a valid phone number." });
    if (order.fulfillment === "delivery" && address.length < 5) {
      throw new ConvexError({ message: "Enter a delivery address." });
    }

    const changes: string[] = [];
    if (name !== order.customer_name) changes.push("name");
    if (phone !== order.phone) changes.push("phone");
    if (address !== order.address) changes.push("address");
    if (changes.length === 0) return { ok: true };

    await ctx.db.patch(orderId, { customer_name: name, phone, address });
    await ctx.db.insert("order_history", {
      order_id: orderId,
      status: order.status,
      note: `Customer ${changes.join(", ")} updated.`,
      actor_id: actorId,
    });
    return { ok: true };
  },
});
