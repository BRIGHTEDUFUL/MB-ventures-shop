import {
  asRecord,
  renderEmail,
  siteLink,
  str,
  type BodyBlock,
  type RenderContext,
  type RenderedEmail,
} from "./base";
import { readOrder } from "./orderCommon";

/** Internal alert: a payment was verified, so the order can advance. */
export function render(data: unknown, ctx: RenderContext): RenderedEmail {
  const order = readOrder(asRecord(data));
  const by = str(asRecord(data)["actor_name"]) || "A staff member";

  const rows: [string, string][] = [
    ["Order", order.reference],
    ["Amount", order.total],
    ["Method", order.paymentMethod],
    ["Confirmed by", by],
  ];
  if (order.provider !== "") rows.push(["Provider", order.provider]);
  if (order.transactionReference !== "") rows.push(["Reference", order.transactionReference]);

  const blocks: BodyBlock[] = [
    { kind: "lead", text: `Payment confirmed for order ${order.reference}.` },
    { kind: "rows", rows },
    { kind: "note", text: "Advance the order in the store hub when the next step is ready." },
  ];

  return renderEmail({
    ctx,
    subject: `Payment confirmed for order ${order.reference}`,
    heading: `Payment confirmed for order ${order.reference}`,
    blocks,
    cta: { href: siteLink(ctx, "/staff/orders"), label: "Open the orders list" },
  });
}
