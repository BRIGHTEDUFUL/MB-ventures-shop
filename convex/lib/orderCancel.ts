import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { applyStockChange, stockStateOf } from "./stock";
import { notifyOrderUpdated } from "../emails/orderTriggers";

/**
 * The one way an order cancels itself: an online payment that never started,
 * was superseded by a newer attempt, or aged out unpaid. Three callers share
 * it — `orders.place` (supersede), `payments.abandon` (initialisation failed)
 * and `payments.expireStale` (the cron) — so the guards, the stock release
 * and the timeline note can never drift apart.
 *
 * Guards are re-checked here on purpose: every caller races the webhook and
 * the return page, and a late `charge.success` must always win. This returns
 * false (doing nothing at all) when the order is no longer an unpaid,
 * open `received` order — in particular never touches a confirmed payment,
 * a staff-cancelled order, or one whose units already left the shelf.
 */
export async function cancelUnpaidOrder(
  ctx: MutationCtx,
  order: Doc<"orders">,
  options: {
    /** Shown on the order timeline and (when `notify`) in the email. */
    reason: string;
    /** Who asked. null = the system (cron, gateway failure, supersede). */
    actorId: Doc<"users">["_id"] | null;
    /** Send the `order-cancelled` email. Supersede stays silent on purpose. */
    notify: boolean;
  },
): Promise<boolean> {
  if (order.payment_status !== "pending" || order.status !== "received") return false;

  const heldState = stockStateOf(order);
  for (const line of order.items) {
    const product = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", line.id))
      .first();
    if (product === null) continue; // listing removed since the order landed
    const heldKey = line.variant_key?.trim() ?? "";
    const suffix = heldKey === "" ? "" : `:${heldKey}`;
    if (heldState === "reserved") {
      // Goods still on the shelf: hand the same units back.
      await applyStockChange(ctx, {
        slug: product.slug,
        ...(heldKey === "" ? {} : { variant_key: heldKey }),
        command: { kind: "release", quantity: line.quantity },
        movement_type: "release",
        source: "order",
        reason: `Restock: order ${order.reference} cancelled — ${options.reason}`,
        ...(options.actorId === null ? {} : { actor_id: options.actorId }),
        reference: order.reference,
        // Same key shape as a staff cancellation: whichever path fires
        // first returns the units, the other becomes a no-op.
        operation_key: `cancel:${order.reference}:${product.slug}${suffix}`,
      });
    } else if (heldState === "committed") {
      // Unpaid but already dispatched — goods coming *back* is a restock,
      // not a released hold, in the ledger.
      await applyStockChange(ctx, {
        slug: product.slug,
        ...(heldKey === "" ? {} : { variant_key: heldKey }),
        command: { kind: "restock", quantity: line.quantity },
        movement_type: "restock",
        source: "order",
        reason: `Restock: order ${order.reference} cancelled after dispatch — ${options.reason}`,
        ...(options.actorId === null ? {} : { actor_id: options.actorId }),
        reference: order.reference,
        operation_key: `cancel:${order.reference}:${product.slug}${suffix}`,
      });
    }
    // `released` / `restocked` already gave everything back — cancelling
    // twice must not hand the shelf a second gift.
  }

  await ctx.db.patch(order._id, {
    status: "cancelled",
    stock_state: heldState === "committed" ? "restocked" : "released",
  });
  await ctx.db.insert("order_history", {
    order_id: order._id,
    status: "cancelled",
    note: options.reason,
    ...(options.actorId === null ? {} : { actor_id: options.actorId }),
  });

  if (options.notify) {
    const updated = await ctx.db.get(order._id);
    if (updated !== null) {
      await notifyOrderUpdated(ctx, updated, {
        previousStatus: "received",
        previousPayment: "pending",
        note: options.reason,
        actorId: options.actorId,
      });
    }
  }
  return true;
}
