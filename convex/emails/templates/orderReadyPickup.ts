import {
  asRecord,
  renderEmail,
  siteLink,
  type BodyBlock,
  type RenderContext,
  type RenderedEmail,
} from "./base";
import { readOrder } from "./orderCommon";

/** Pickup orders only: the order moved to `ready`. */
export function render(data: unknown, ctx: RenderContext): RenderedEmail {
  const order = readOrder(asRecord(data));

  const blocks: BodyBlock[] = [
    { kind: "lead", text: `Your order ${order.reference} is ready to collect.` },
    { kind: "p", text: "Please wait for the ready message before you travel to the shop." },
    {
      kind: "rows",
      rows: [
        ["Collection point", order.address || ctx.shop.address],
        ["Opening hours", ctx.shop.hours],
        ["Order total", order.total],
        ["Payment", order.paymentMethod],
      ],
    },
    {
      kind: "note",
      text:
        order.paymentMethod === "Mobile Money"
          ? "Mobile Money payment is confirmed already, so nothing is due at the counter."
          : "Bring the order reference with you when you collect.",
    },
  ];

  return renderEmail({
    ctx,
    subject: `Order ${order.reference} is ready for pickup`,
    heading: `Order ${order.reference} is ready for pickup`,
    blocks,
    cta: { href: siteLink(ctx, "/track"), label: "Track your order" },
  });
}
