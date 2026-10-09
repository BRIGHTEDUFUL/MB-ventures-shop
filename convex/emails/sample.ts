import type { TemplateName } from "./templates";
import { siteLink, type RenderContext } from "./templates/base";

/**
 * Example payloads for `/dev/email-preview`, the admin "send test" button and
 * the rendering tests. Sample copy only — never presented as real inventory.
 */

export const SAMPLE_ITEMS = [
  { name: "Electric sit-stand desk", quantity: 1, price: 2400 },
  { name: "MX mechanical wireless keyboard", quantity: 1, price: 1299 },
];

const orderFields = (fulfillment: "delivery" | "pickup") => ({
  reference: "MB-2FA41C09",
  fulfillment,
  zone: "central",
  items: SAMPLE_ITEMS,
  subtotal: 3699,
  delivery_fee: fulfillment === "pickup" ? 0 : 30,
  total: fulfillment === "pickup" ? 3699 : 3729,
  payment_method: "momo",
  provider: "MTN MoMo",
  transaction_reference: "1839201746",
  address:
    fulfillment === "pickup"
      ? "Abelenkpe taxi rank, Accra, Ghana"
      : "12 Abelenkpe Taxi Rank Road, Accra",
  status: fulfillment === "pickup" ? "ready" : "dispatched",
  note: "",
  customer_name: "Ama Mensah",
  phone: "0241234567",
  email: "ama@example.com",
});

const AUTH_URL = (ctx: RenderContext) => `${siteLink(ctx, "/account")}?code=SAMPLE-CODE-1234`;

/** The payload a template expects, keyed by template name. */
export function sampleDataFor(template: TemplateName, ctx: RenderContext): Record<string, unknown> {
  switch (template) {
    case "order-received":
    case "payment-confirmed":
    case "order-completed":
      return orderFields("delivery");
    case "order-ready-pickup":
      return orderFields("pickup");
    case "order-out-for-delivery":
      return orderFields("delivery");
    case "order-cancelled":
      return { ...orderFields("delivery"), note: "The desk is out of stock this week." };
    case "admin-new-order":
    case "admin-payment-confirmed":
      return orderFields("delivery");
    case "admin-contact-message":
    case "contact-received":
      return {
        form: {
          name: "Kwame Asante",
          email: "kwame@example.com",
          phone: "0205550199",
          subject: "Delivery to Tema",
          message: "Do you deliver to Community 25 and how long does it take?",
        },
      };
    case "auth-reset-password":
      return { url: AUTH_URL(ctx), expires: "60 minutes" };
    case "auth-verify-email":
      return { url: AUTH_URL(ctx) };
  }
}
