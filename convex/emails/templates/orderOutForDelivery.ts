import {
  asRecord,
  renderEmail,
  siteLink,
  type BodyBlock,
  type RenderContext,
  type RenderedEmail,
} from "./base";
import { readOrder } from "./orderCommon";

/** Delivery orders only: the order moved to `dispatched`. */
export function render(data: unknown, ctx: RenderContext): RenderedEmail {
  const order = readOrder(asRecord(data));

  const blocks: BodyBlock[] = [
    { kind: "lead", text: `Your order ${order.reference} is on its way.` },
    {
      kind: "rows",
      rows: [
        ["Delivering to", order.address],
        ["Area", order.zone],
        ["Payment", order.paymentMethod],
        ["Order total", order.total],
      ],
    },
    {
      kind: "note",
      text:
        order.paymentMethod === "Cash on delivery"
          ? "Have the exact amount ready if you can. The courier collects payment on arrival."
          : "Your payment is already confirmed, so nothing is due on arrival.",
    },
    { kind: "p", text: "Answer the courier call so the drop-off goes smoothly." },
  ];

  return renderEmail({
    ctx,
    subject: `Order ${order.reference} is on its way`,
    heading: `Order ${order.reference} is on its way`,
    blocks,
    cta: { href: siteLink(ctx, "/track"), label: "Track your order" },
  });
}
