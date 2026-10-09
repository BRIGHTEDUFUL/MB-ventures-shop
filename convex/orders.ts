import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireStaff, requireUser } from "./lib/auth";
import {
  historyDTO,
  orderDTO,
  receiptDTO,
  type HistoryEntry,
  type Order,
  type Receipt,
} from "./lib/dto";
import { getSettings } from "./lib/settings";
import {
  deliveryFee,
  normalizePhone,
  round2,
  validateCheckout,
  validateStatusChange,
} from "./lib/rules";
import { recordStockChange } from "./inventory";
import { validators } from "./schema";
import { notifyOrderPlaced, notifyOrderUpdated } from "./emails/orderTriggers";

const checkoutArgs = {
  customer_name: v.string(),
  phone: v.string(),
  email: v.string(),
  address: v.string(),
  fulfillment: validators.fulfillment,
  zone: validators.zone,
  payment_method: validators.paymentMethod,
  provider: v.optional(v.string()),
  transaction_reference: v.optional(v.string()),
  items: v.array(v.object({ id: v.string(), quantity: v.number() })),
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
  throw new Error("Could not generate an order reference. Try again.");
}

async function historyFor(ctx: QueryCtx, orderId: Id<"orders">) {
  return await ctx.db
    .query("order_history")
    .withIndex("by_order", (q) => q.eq("order_id", orderId))
    .collect();
}

/**
 * Place an order. Replaces `public.place_store_order(payload)`:
 * authoritative pricing/stock/fees, ordering switch, and the full checkout
 * validation set — all inside one transaction, so concurrent purchases of the
 * last unit cannot oversell.
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
        payment_method: args.payment_method,
        provider: args.provider,
        transaction_reference: args.transaction_reference,
        items: args.items,
      },
      settings,
    );
    if (problem !== null) throw new ConvexError({ message: problem });

    let subtotal = 0;
    const lines: Order["items"] = [];
    const reference = await uniqueReference(ctx);

    for (const line of args.items) {
      const product = await ctx.db
        .query("products")
        .withIndex("by_slug", (q) => q.eq("slug", line.id))
        .unique();
      if (product === null || !product.verified || product.stock < line.quantity) {
        throw new ConvexError({ message: "An item is not available. Please check your cart." });
      }
      subtotal += product.price * line.quantity;
      lines.push({
        id: product.slug,
        name: product.name,
        price: product.price,
        quantity: line.quantity,
        image_key: product.image_key,
      });
      await ctx.db.patch(product._id, { stock: product.stock - line.quantity });
      await recordStockChange(ctx, {
        product_slug: product.slug,
        product_name: product.name,
        previous_stock: product.stock,
        new_stock: product.stock - line.quantity,
        reason: `Sold on order ${reference}`,
      });
    }

    subtotal = round2(subtotal);
    const fee = deliveryFee(settings, args.zone, subtotal, args.fulfillment);
    if (fee === null) throw new ConvexError({ message: "Choose a delivery area." });
    const orderId = await ctx.db.insert("orders", {
      reference,
      user_id: userId,
      customer_name: args.customer_name.trim(),
      email: args.email.trim(),
      phone: normalizePhone(args.phone),
      address: args.address.trim(),
      fulfillment: args.fulfillment,
      zone: args.zone,
      payment_method: args.payment_method,
      ...(args.provider !== undefined && args.provider.trim() !== ""
        ? { provider: args.provider.trim() }
        : {}),
      ...(args.transaction_reference !== undefined && args.transaction_reference.trim() !== ""
        ? { transaction_reference: args.transaction_reference.trim() }
        : {}),
      payment_status: "pending",
      status: "received",
      subtotal,
      delivery_fee: fee,
      total: round2(subtotal + fee),
      items: lines,
    });

    await ctx.db.insert("order_history", {
      order_id: orderId,
      status: "received",
      note: "Order received. Payment awaiting staff confirmation.",
    });

    const order = await ctx.db.get(orderId);
    if (order === null) throw new Error("Order could not be saved.");

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
    await requireStaff(ctx);
    const search = (args.q ?? "").trim().toLowerCase();
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 300);
    const orders = await ctx.db.query("orders").order("desc").take(300);
    return orders
      .filter((o) => {
        if (args.status !== undefined && o.status !== args.status) return false;
        if (args.payment !== undefined && o.payment_status !== args.payment) return false;
        if (search !== "") {
          const haystack =
            `${o.reference} ${o.customer_name} ${o.phone} ${o.email} ${o.transaction_reference ?? ""}`.toLowerCase();
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
    await requireStaff(ctx);
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
 * Staff status/payment transitions. Replaces `public.staff_update_order`,
 * including the MoMo verification gates, the closed-order rule, the
 * fulfillment/status match and restocking on cancellation.
 */
export const staffUpdate = mutation({
  args: {
    id: v.string(),
    status: validators.orderStatus,
    payment: validators.paymentStatus,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actorId = await requireStaff(ctx);
    const orderId = ctx.db.normalizeId("orders", args.id);
    if (orderId === null) throw new ConvexError({ message: "Order not found." });

    const order = await ctx.db.get(orderId);
    if (order === null) throw new ConvexError({ message: "Order not found." });

    const problem = validateStatusChange(order, args.status, args.payment);
    if (problem !== null) throw new ConvexError({ message: problem });

    const previousStatus = order.status;
    const previousPayment = order.payment_status;

    if (order.status !== "cancelled" && args.status === "cancelled") {
      for (const line of order.items) {
        const product = await ctx.db
          .query("products")
          .withIndex("by_slug", (q) => q.eq("slug", line.id))
          .first();
        if (product !== null) {
          await ctx.db.patch(product._id, { stock: product.stock + line.quantity });
          await recordStockChange(ctx, {
            product_slug: product.slug,
            product_name: product.name,
            previous_stock: product.stock,
            new_stock: product.stock + line.quantity,
            reason: `Restock: order ${order.reference} cancelled`,
            actor_id: actorId,
          });
        }
      }
    }

    await ctx.db.patch(orderId, { status: args.status, payment_status: args.payment });
    const note = (args.note ?? "").trim();
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
    const actorId = await requireStaff(ctx);
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
    const actorId = await requireStaff(ctx);
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
