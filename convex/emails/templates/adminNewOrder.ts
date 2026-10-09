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

/** Internal alert: a new order landed in the dashboard. */
export function render(data: unknown, ctx: RenderContext): RenderedEmail {
  const order = readOrder(asRecord(data));
  const input = asRecord(data);
  const customer = asRecord(input["customer"]);
  const name = str(customer["name"]) || str(input["customer_name"]) || "Customer";
  const phone = str(customer["phone"]) || str(input["phone"]);
  const email = str(customer["email"]) || str(input["email"]);

  const rows: [string, string][] = [
    ["Order", order.reference],
    ["Customer", name],
    ["Total", order.total],
    ["Payment", order.paymentMethod],
    ["Fulfilment", order.fulfillment === "pickup" ? "Pickup at Abelenkpe" : "Delivery"],
  ];
  if (phone !== "") rows.push(["Phone", phone]);
  if (email !== "") rows.push(["Email", email]);
  if (order.provider !== "") rows.push(["Provider", order.provider]);
  if (order.transactionReference !== "") rows.push(["Reference", order.transactionReference]);
  if (order.fulfillment === "delivery" && order.address !== "") {
    rows.push(["Address", order.address]);
  }

  const blocks: BodyBlock[] = [
    {
      kind: "lead",
      text:
        order.paymentMethod === "Mobile Money"
          ? `Order ${order.reference} is waiting for Mobile Money verification.`
          : `Order ${order.reference} was placed with cash on delivery.`,
    },
    { kind: "rows", rows },
    { kind: "items", items: order.items },
    { kind: "note", text: "Open the order in the store hub to verify the payment or add a note." },
  ];

  return renderEmail({
    ctx,
    subject: `New order ${order.reference}`,
    heading: `New order ${order.reference}`,
    blocks,
    cta: { href: siteLink(ctx, "/staff/orders"), label: "Open the orders list" },
  });
}
