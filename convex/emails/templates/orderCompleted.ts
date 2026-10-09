import {
  asRecord,
  renderEmail,
  type BodyBlock,
  type RenderContext,
  type RenderedEmail,
} from "./base";
import { readOrder } from "./orderCommon";

/** Sent when staff mark an order `completed`. */
export function render(data: unknown, ctx: RenderContext): RenderedEmail {
  const order = readOrder(asRecord(data));

  const blocks: BodyBlock[] = [
    { kind: "lead", text: `Order ${order.reference} is complete. Thank you for shopping with us.` },
    {
      kind: "rows",
      rows: [
        ["Order total", order.total],
        ["Payment", order.paymentMethod],
      ],
    },
    {
      kind: "p",
      text: "We hope the setup works well for you. Reply to the shop if anything is not right.",
    },
    {
      kind: "note",
      text: "Warranty cover depends on the product. Keep your order reference and receipt.",
    },
  ];

  return renderEmail({
    ctx,
    subject: `Order ${order.reference} is complete`,
    heading: `Order ${order.reference} is complete`,
    blocks,
  });
}
