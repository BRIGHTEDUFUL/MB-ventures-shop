import { ConvexError, v } from "convex/values";
import { action, httpAction, internalMutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";
import { receiptDTO } from "./lib/dto";
import type { Order, Receipt } from "./lib/dto";
import { cancelUnpaidOrder } from "./lib/orderCancel";
import {
  PAYSTACK_BASE,
  PAYSTACK_CURRENCY,
  callbackUrlFor,
  chargeMismatch,
  channelLabel,
  getPaystackSecret,
  pesewas,
  pendingMinutes,
  readInitializeResponse,
  readVerifyResponse,
  readWebhookEvent,
  verifyPaystackSignature,
  type VerifiedCharge,
} from "./lib/paystack";
import { validators } from "./schema";
import { notifyOrderUpdated } from "./emails/orderTriggers";

/**
 * Online payments (Paystack). See `docs/PAYMENTS-PAYSTACK.md` for the full
 * picture. The order of operations is always:
 *
 *   orders.place(payment:"online")  → order + stock reservation, amount locked
 *   payments.initialize (action)    → hosted checkout, redirect URL
 *   payments.verify (action)        → the browser came back from Paystack
 *   POST /webhooks/paystack         → the browser did NOT come back
 *   internal.payments.markPaid      → the single pending→confirmed door
 *
 * The client never sends money facts: amounts are recomputed server-side,
 * references are server-generated, and the secret key never leaves these
 * functions.
 */

const chargeArgs = v.object({
  status: v.string(),
  reference: v.string(),
  amount: v.number(),
  currency: v.string(),
  channel: v.string(),
  paidAt: v.optional(v.union(v.number(), v.null())),
  transactionId: v.optional(v.union(v.number(), v.null())),
  authorizationCode: v.string(),
});

async function orderByReference(
  ctx: QueryCtx | MutationCtx,
  reference: string,
): Promise<Doc<"orders"> | null> {
  return await ctx.db
    .query("orders")
    .withIndex("by_reference", (q) => q.eq("reference", reference))
    .first();
}

/**
 * What `payments.status` answers with. Named (rather than inferred) so the
 * verify action — which lives in this same module and calls this query —
 * does not make the module's type graph reference itself.
 */
export type PaymentStatus = {
  reference: string;
  payment_method: Order["payment_method"];
  payment_status: Order["payment_status"];
  status: Order["status"];
  total: number;
  paid_at: number | null;
  payment_channel: string | null;
  receipt: Receipt;
};

/* ── Queries ─────────────────────────────────────────────────────────────── */

/**
 * Everything `payments.initialize` needs about the order it is about to
 * charge — and nothing the shopper must not see. The caller must own the
 * order (this is the only guarded entry point into a payment).
 */
export const orderForPayment = query({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const order = await orderByReference(ctx, args.reference.trim().toUpperCase());
    if (order === null) throw new ConvexError({ message: "Order not found." });
    if (order.user_id !== userId) {
      throw new ConvexError({ message: "This payment is not yours to start." });
    }
    if (
      order.payment_method !== "paystack" ||
      order.payment_status !== "pending" ||
      order.status !== "received"
    ) {
      throw new ConvexError({ message: "This order is not waiting for an online payment." });
    }
    return {
      reference: order.reference,
      total: order.total,
      amount_pesewas: order.payment_amount_pesewas ?? pesewas(order.total),
      customer_name: order.customer_name,
      email: order.email,
      phone: order.phone,
      fulfillment: order.fulfillment,
      // Resume hand-off for a shopper who tapped back out of Paystack.
      authorization_url: order.paystack_authorization_url ?? null,
    };
  },
});

/**
 * Public payment state + receipt by reference — the return page lives outside
 * any session handshake (Paystack redirects to it), and the reference is the
 * same unguessable `MB-…` token guest tracking already relies on. Only
 * payment-relevant fields are exposed; contact details are not.
 */
export const status = query({
  args: { reference: v.string() },
  handler: async (ctx, args): Promise<PaymentStatus | null> => {
    const reference = args.reference.trim().toUpperCase();
    if (reference === "") return null;
    const order = await orderByReference(ctx, reference);
    if (order === null) return null;
    const history = await ctx.db
      .query("order_history")
      .withIndex("by_order", (q) => q.eq("order_id", order._id))
      .collect();
    return {
      reference: order.reference,
      payment_method: order.payment_method,
      payment_status: order.payment_status,
      status: order.status,
      total: order.total,
      paid_at: order.paid_at ?? null,
      payment_channel: order.payment_channel ?? null,
      receipt: receiptDTO(order, history),
    };
  },
});

/* ── Actions (talk to Paystack) ──────────────────────────────────────────── */

/**
 * Start (or resume) the hosted checkout for an order the shopper just placed.
 * On any failure to start, the order is rolled back (`payments.abandon`):
 * a reservation that can never be paid for must not sit on the shelf.
 */
export const initialize = action({
  args: { reference: v.string() },
  handler: async (ctx, args): Promise<{ authorization_url: string }> => {
    const order = await ctx.runQuery(api.payments.orderForPayment, {
      reference: args.reference.trim().toUpperCase(),
    });
    // Back-button resume: the first initialisation already produced a page.
    if (order.authorization_url !== null) return { authorization_url: order.authorization_url };

    const secret = getPaystackSecret(process.env);
    if (secret === "") {
      throw new ConvexError({
        message:
          "Online payment is not available right now. Please pay on delivery or at the shop.",
      });
    }

    const [firstName, ...rest] = order.customer_name.split(" ");
    const body: Record<string, unknown> = {
      email: order.email,
      amount: order.amount_pesewas,
      currency: PAYSTACK_CURRENCY,
      reference: order.reference,
      first_name: firstName,
      ...(rest.length === 0 ? {} : { last_name: rest.join(" ") }),
      phone: order.phone,
      metadata: { order_reference: order.reference, fulfillment: order.fulfillment },
    };
    // Paystack rejects http callbacks, so localhost relies on the dashboard
    // return URL; https origins get an explicit bounce to the return page.
    const callback = callbackUrlFor(process.env["SITE_URL"] ?? "");
    if (callback !== null) body["callback_url"] = callback;

    const release = async (reason: string) => {
      await ctx.runMutation(internal.payments.abandon, { reference: order.reference, reason });
    };

    let response: Response;
    try {
      response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      await release("Online payment could not be started (payment service unreachable).");
      throw new ConvexError({
        message:
          "We could not start the online payment, so your order was released. Please try again.",
      });
    }

    const payload: unknown = await response.json().catch(() => null);
    const started = response.ok ? readInitializeResponse(payload) : null;
    // The gateway echoes our reference back — anything else is not this
    // order's checkout session.
    if (started === null || started.reference !== order.reference) {
      await release("Online payment could not be started (payment service refused).");
      throw new ConvexError({
        message:
          "We could not start the online payment, so your order was released. " +
          "Please try again, or choose to pay on delivery.",
      });
    }

    await ctx.runMutation(internal.payments.recordInit, {
      reference: order.reference,
      accessCode: started.accessCode,
      authorizationUrl: started.authorizationUrl,
    });
    return { authorization_url: started.authorizationUrl };
  },
});

/**
 * The browser came back from Paystack (or the shopper taps "check again").
 * Asks Paystack what really happened and confirms the order through the one
 * door (`markPaid`) if the money is right. Safe to call repeatedly.
 */
export const verify = action({
  args: { reference: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    state: "paid" | "pending" | "failed" | "cancelled";
    receipt: PaymentStatus | null;
  }> => {
    const reference = args.reference.trim().toUpperCase();
    const snapshot = await ctx.runQuery(api.payments.status, { reference });
    if (snapshot === null) throw new ConvexError({ message: "Order not found." });
    if (snapshot.payment_status === "confirmed") return { state: "paid", receipt: snapshot };
    if (snapshot.payment_method !== "paystack") return { state: "failed", receipt: snapshot };
    if (snapshot.status === "cancelled") return { state: "cancelled", receipt: snapshot };

    const secret = getPaystackSecret(process.env);
    if (secret === "") {
      throw new ConvexError({ message: "Online payment is not available right now." });
    }

    let response: Response;
    try {
      response = await fetch(
        `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
        {
          headers: { Authorization: `Bearer ${secret}` },
        },
      );
    } catch {
      throw new ConvexError({
        message: "We could not reach the payment service. Please check again in a moment.",
      });
    }

    if (!response.ok) {
      // 404 is Paystack saying "no such transaction" — honest answer: the
      // shopper never reached the charge. Anything else is transient.
      if (response.status === 404) return { state: "pending", receipt: snapshot };
      throw new ConvexError({
        message: "We could not confirm your payment. Please check again in a moment.",
      });
    }
    const charge = readVerifyResponse(await response.json().catch(() => null));
    if (charge === null) {
      throw new ConvexError({
        message: "We could not confirm your payment. Please check again in a moment.",
      });
    }

    if (charge.status === "success") {
      const outcome = await ctx.runMutation(internal.payments.markPaid, { reference, charge });
      const fresh = await ctx.runQuery(api.payments.status, { reference });
      if (outcome.ok) return { state: "paid", receipt: fresh ?? snapshot };
      if (outcome.reason.startsWith("mismatch")) {
        throw new ConvexError({
          message:
            "A payment was received but it does not match this order's amount. " +
            "Please contact the shop with your reference.",
        });
      }
      return {
        state: outcome.reason === "cancelled" ? "cancelled" : "failed",
        receipt: fresh ?? snapshot,
      };
    }
    if (
      charge.status === "failed" ||
      charge.status === "abandoned" ||
      charge.status === "reversed"
    ) {
      return { state: "failed", receipt: snapshot };
    }
    // `ongoing` / `pending` / `queued`: the charge is still settling — the
    // return page keeps checking and the webhook will finish the job.
    return { state: "pending", receipt: snapshot };
  },
});

/* ── Internal mutations (the database side) ──────────────────────────────── */

export const recordInit = internalMutation({
  args: { reference: v.string(), accessCode: v.string(), authorizationUrl: v.string() },
  handler: async (ctx, args) => {
    const order = await orderByReference(ctx, args.reference);
    if (order === null) return { ok: false };
    // The session is only worth keeping while the payment can still happen.
    if (order.payment_method !== "paystack" || order.payment_status !== "pending") {
      return { ok: false };
    }
    await ctx.db.patch(order._id, {
      paystack_access_code: args.accessCode,
      paystack_authorization_url: args.authorizationUrl,
    });
    return { ok: true };
  },
});

/**
 * The single `pending → confirmed` door for online payments. Every caller —
 * the return page's verify action and Paystack's webhook — funnels through
 * here, and the charge is re-validated against the order's locked amount
 * before anything is written. Idempotent: a second call changes nothing and
 * sends no second email.
 */
export const markPaid = internalMutation({
  args: { reference: v.string(), charge: chargeArgs },
  handler: async (ctx, args): Promise<{ ok: boolean; reason: string }> => {
    const order = await orderByReference(ctx, args.reference);
    if (order === null) return { ok: false, reason: "unknown-reference" };
    if (order.payment_method !== "paystack") return { ok: false, reason: "not-paystack" };
    // Webhook and return page race by design; the first one to confirm wins.
    if (order.payment_status === "confirmed") return { ok: true, reason: "already-confirmed" };
    // A late charge can never resurrect a cancelled order (stock already
    // went back to the shelf) — the money is reviewed by staff instead.
    if (order.status === "cancelled") return { ok: false, reason: "cancelled" };

    const charge: VerifiedCharge = {
      status: args.charge.status,
      reference: args.charge.reference,
      amount: args.charge.amount,
      currency: args.charge.currency,
      channel: args.charge.channel,
      paidAt: args.charge.paidAt ?? null,
      transactionId: args.charge.transactionId ?? null,
      authorizationCode: args.charge.authorizationCode,
    };
    const mismatch = chargeMismatch(charge, {
      reference: order.reference,
      amountPesewas: order.payment_amount_pesewas ?? pesewas(order.total),
    });
    if (mismatch !== null) {
      console.warn(`[paystack] refused charge for ${order.reference}: ${mismatch}`);
      return { ok: false, reason: `mismatch:${mismatch}` };
    }

    const paidAt = charge.paidAt ?? Date.now();
    await ctx.db.patch(order._id, {
      payment_status: "confirmed",
      provider: "paystack",
      transaction_reference:
        charge.authorizationCode ||
        (charge.transactionId === null ? order.reference : String(charge.transactionId)),
      paid_at: paidAt,
      ...(charge.channel === "" ? {} : { payment_channel: charge.channel }),
      ...(charge.transactionId === null ? {} : { paystack_transaction_id: charge.transactionId }),
    });
    await ctx.db.insert("order_history", {
      order_id: order._id,
      status: order.status,
      note: `Payment received online via Paystack (${channelLabel(charge.channel)}).`,
    });

    // Customer + shop get the same "payment confirmed" mail a staff
    // confirmation would trigger — notifications only, never throws.
    const updated = await ctx.db.get(order._id);
    if (updated !== null) {
      await notifyOrderUpdated(ctx, updated, {
        previousStatus: order.status,
        previousPayment: "pending",
        note: "",
        actorId: null,
      });
    }
    return { ok: true, reason: "confirmed" };
  },
});

/** Roll back an order whose online payment never got off the ground. */
export const abandon = internalMutation({
  args: { reference: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    const order = await orderByReference(ctx, args.reference);
    if (order === null) return { ok: false };
    return {
      ok: await cancelUnpaidOrder(ctx, order, {
        reason: args.reason,
        actorId: null,
        notify: false,
      }),
    };
  },
});

/**
 * Cron: every online order still waiting after the hold window was never
 * paid — the shopper closed the tab and nothing (return page or webhook)
 * ever reported a charge. Cancel it and put the stock back.
 */
export const expireStale = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ ok: true; cancelled: number }> => {
    const minutes = pendingMinutes(process.env);
    const cutoff = Date.now() - minutes * 60_000;
    let cancelled = 0;
    // Full scan on purpose: there is no index on (method, payment_status),
    // the table is tiny, and the health cron scans the same way.
    const orders = await ctx.db.query("orders").collect();
    for (const order of orders) {
      if (order.payment_method !== "paystack" || order.payment_status !== "pending") continue;
      if (order.status !== "received" || order._creationTime > cutoff) continue;
      const did = await cancelUnpaidOrder(ctx, order, {
        reason: `Online payment was not completed within ${minutes} minutes — order cancelled, stock returned.`,
        actorId: null,
        notify: true,
      });
      if (did) cancelled += 1;
    }
    return { ok: true, cancelled };
  },
});

/* ── Webhook ─────────────────────────────────────────────────────────────── */

/**
 * `POST /webhooks/paystack` — the authoritative fallback for the customers
 * whose browser never comes back to `/paystack/return`. The body must carry
 * a valid HMAC-SHA512 signature before anything is believed, and the actual
 * confirmation still goes through `markPaid` with its amount check.
 */
export const paystackWebhook = httpAction(async (ctx, request) => {
  const secret = getPaystackSecret(process.env);
  if (secret === "") return new Response("Paystack is not configured.", { status: 503 });

  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";
  if (!(await verifyPaystackSignature(raw, signature, secret))) {
    return new Response("Invalid signature.", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Malformed body.", { status: 400 });
  }

  const event = readWebhookEvent(payload);
  if (event.event === "charge.success" && event.data !== null) {
    // `markPaid` re-checks reference, currency and amount — a correctly
    // signed event for the wrong money confirms nothing.
    await ctx.runMutation(internal.payments.markPaid, {
      reference: event.data.reference,
      charge: event.data,
    });
  }
  // Everything else (charge.failed, subscription noise, …) is acknowledged:
  // retrying an event we will never act on helps nobody.
  return new Response("ok");
});
