import {
  asRecord,
  renderEmail,
  siteLink,
  type BodyBlock,
  type RenderContext,
  type RenderedEmail,
} from "./base";
import { readOrder } from "./orderCommon";

/** Sent when staff move an order's payment to `confirmed`. */
export function render(data: unknown, ctx: RenderContext): RenderedEmail {
  const order = readOrder(asRecord(data));

  const rows: [string, string][] = [
    ["Order", order.reference],
    ["Amount", order.total],
    ["Method", order.paymentMethod],
  ];
  if (order.provider !== "") rows.push(["Provider", order.provider]);
  if (order.transactionReference !== "") rows.push(["Reference", order.transactionReference]);

  const blocks: BodyBlock[] = [
    { kind: "lead", text: `Your payment for order ${order.reference} has been confirmed.` },
    { kind: "rows", rows },
    {
      kind: "p",
      text:
        order.fulfillment === "pickup"
          ? "We are preparing your order for collection from the Abelenkpe taxi rank shop."
          : "We are preparing your order for delivery.",
    },
    {
      kind: "note",
      text: "Keep the order reference handy if you need to speak to us about this purchase.",
    },
  ];

  return renderEmail({
    ctx,
    subject: `Payment confirmed for order ${order.reference}`,
    heading: `Payment confirmed for order ${order.reference}`,
    blocks,
    cta: { href: siteLink(ctx, "/track"), label: "Track your order" },
  });
}
