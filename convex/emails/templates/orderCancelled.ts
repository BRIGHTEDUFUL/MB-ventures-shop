import {
  asRecord,
  renderEmail,
  siteLink,
  type BodyBlock,
  type RenderContext,
  type RenderedEmail,
} from "./base";
import { readOrder } from "./orderCommon";

/** Sent when staff move an order to `cancelled`. */
export function render(data: unknown, ctx: RenderContext): RenderedEmail {
  const order = readOrder(asRecord(data));
  const reason = order.note === "" ? "The shop cancelled this order." : order.note;

  const blocks: BodyBlock[] = [
    { kind: "lead", text: `Order ${order.reference} has been cancelled.` },
    {
      kind: "rows",
      rows: [
        ["Order", order.reference],
        ["Amount affected", order.total],
      ],
    },
    { kind: "quote", text: reason },
    {
      kind: "p",
      text:
        order.paymentMethod === "Mobile Money"
          ? "Any payment already confirmed for this order will be reviewed by the shop. Contact us with your reference if you have already transferred money."
          : "No payment is due for a cancelled order.",
    },
    {
      kind: "note",
      text: "We are sorry for the inconvenience. Reply to this message to talk to the shop.",
    },
  ];

  return renderEmail({
    ctx,
    subject: `Order ${order.reference} was cancelled`,
    heading: `Order ${order.reference} was cancelled`,
    blocks,
    cta: { href: siteLink(ctx, "/catalogue"), label: "Back to the catalogue" },
  });
}
