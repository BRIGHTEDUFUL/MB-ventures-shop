import {
  asRecord,
  renderEmail,
  siteLink,
  type BodyBlock,
  type RenderContext,
  type RenderedEmail,
} from "./base";
import { fulfilmentLine, readOrder } from "./orderCommon";

/** Order confirmation sent the moment `orders.place` succeeds. */
export function render(data: unknown, ctx: RenderContext): RenderedEmail {
  const order = readOrder(asRecord(data));

  const blocks: BodyBlock[] = [
    { kind: "lead", text: `Hi, we have your order ${order.reference}.` },
    { kind: "p", text: fulfilmentLine(order) },
    { kind: "items", items: order.items },
    {
      kind: "rows",
      rows: [
        ["Subtotal", order.subtotal],
        ["Delivery", order.deliveryFee],
        ["Total", order.total],
        ["Payment", order.paymentMethod],
        ...(order.transactionReference === ""
          ? []
          : ([["Reference", order.transactionReference]] as [string, string][])),
        ...(order.fulfillment === "pickup"
          ? ([["Collection point", order.address || ctx.shop.address]] as [string, string][])
          : ([["Deliver to", order.address]] as [string, string][])),
      ],
    },
    {
      kind: "note",
      text:
        order.paymentMethod === "Mobile Money"
          ? "Our team confirms Mobile Money payments by hand. You will get a message as soon as your payment is verified."
          : "You can pay the courier in cash when your order arrives.",
    },
    { kind: "p", text: `Track your order any time with reference ${order.reference}.` },
  ];

  return renderEmail({
    ctx,
    subject: `Order ${order.reference} received`,
    heading: `Order ${order.reference} received`,
    blocks,
    cta: { href: siteLink(ctx, "/track"), label: "Track your order" },
  });
}
