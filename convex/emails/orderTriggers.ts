import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getEmailConfig } from "./config";
import { adminRecipient, scheduleEmail } from "./enqueue";
import type { TemplateName } from "./templates";

/**
 * Where order events become emails. Called from `orders.place` and
 * `orders.staffUpdate` *after* the database work is done, and it never throws,
 * so a notification problem can never roll an order back.
 */

export type Order = Doc<"orders">;

/** The payload every order template reads (see `templates/order-common.ts`). */
export function orderEmailData(order: Order, extra: Record<string, unknown> = {}) {
  return {
    reference: order.reference,
    fulfillment: order.fulfillment,
    zone: order.zone,
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    })),
    subtotal: order.subtotal,
    delivery_fee: order.delivery_fee,
    total: order.total,
    payment_method: order.payment_method,
    provider: order.provider ?? "",
    transaction_reference: order.transaction_reference ?? "",
    address: order.address,
    status: order.status,
    note: "",
    customer_name: order.customer_name,
    phone: order.phone,
    email: order.email,
    ...extra,
  };
}

/**
 * Which status change deserves a customer email. `processing` and `received`
 * stay silent: the confirmation mail already covers them.
 */
export function templateForStatus(order: Order): TemplateName | null {
  if (order.status === "ready" && order.fulfillment === "pickup") return "order-ready-pickup";
  if (order.status === "dispatched" && order.fulfillment === "delivery") {
    return "order-out-for-delivery";
  }
  if (order.status === "completed") return "order-completed";
  if (order.status === "cancelled") return "order-cancelled";
  return null;
}

/** Order placed: confirmation to the customer, alert to the shop. */
export async function notifyOrderPlaced(ctx: MutationCtx, order: Order): Promise<void> {
  const config = getEmailConfig();
  const inbox = await adminRecipient(ctx, config);

  await scheduleEmail(ctx, {
    template: "order-received",
    to: order.email,
    orderId: order._id,
    data: orderEmailData(order),
    category: "customer",
  });

  if (inbox !== "") {
    await scheduleEmail(ctx, {
      template: "admin-new-order",
      to: inbox,
      orderId: order._id,
      data: orderEmailData(order),
      category: "admin",
    });
  }
}

export type StatusChange = {
  previousStatus: string;
  previousPayment: string;
  note: string;
  actorId: Id<"users"> | null;
};

/** Payment confirmed and/or a status that carries a customer message. */
export async function notifyOrderUpdated(
  ctx: MutationCtx,
  order: Order,
  change: StatusChange,
): Promise<void> {
  const config = getEmailConfig();
  const inbox = await adminRecipient(ctx, config);
  const actor = change.actorId === null ? null : await ctx.db.get(change.actorId);
  const actorName = actor?.name?.trim() || actor?.email?.trim() || "Shop team";
  const data = orderEmailData(order, { note: change.note, actor_name: actorName });

  const paymentJustConfirmed =
    change.previousPayment !== "confirmed" && order.payment_status === "confirmed";
  const statusChanged = change.previousStatus !== order.status;

  if (paymentJustConfirmed) {
    await scheduleEmail(ctx, {
      template: "payment-confirmed",
      to: order.email,
      orderId: order._id,
      data,
      category: "customer",
    });
    if (inbox !== "") {
      await scheduleEmail(ctx, {
        template: "admin-payment-confirmed",
        to: inbox,
        orderId: order._id,
        data,
        category: "admin",
      });
    }
  }

  if (!statusChanged) return;
  const template = templateForStatus(order);
  if (template === null) return;

  await scheduleEmail(ctx, {
    template,
    to: order.email,
    orderId: order._id,
    data,
    category: "customer",
  });
}
