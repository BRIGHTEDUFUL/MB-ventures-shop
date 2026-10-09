import type { RenderContext, RenderedEmail } from "./base";
import * as adminContactMessage from "./adminContactMessage";
import * as adminNewOrder from "./adminNewOrder";
import * as adminPaymentConfirmed from "./adminPaymentConfirmed";
import * as authResetPassword from "./authResetPassword";
import * as authVerifyEmail from "./authVerifyEmail";
import * as contactReceived from "./contactReceived";
import * as orderCancelled from "./orderCancelled";
import * as orderCompleted from "./orderCompleted";
import * as orderOutForDelivery from "./orderOutForDelivery";
import * as orderReadyPickup from "./orderReadyPickup";
import * as orderReceived from "./orderReceived";
import * as paymentConfirmed from "./paymentConfirmed";

export type TemplateGroup = "customer" | "admin" | "auth";

type TemplateModule = {
  render: (data: unknown, ctx: RenderContext) => RenderedEmail;
};

/**
 * Every template the system can send, grouped for the admin UI filters.
 * `render` is the only contract: it must not throw on malformed data.
 */
export const TEMPLATES = {
  "order-received": { group: "customer", module: orderReceived },
  "payment-confirmed": { group: "customer", module: paymentConfirmed },
  "order-ready-pickup": { group: "customer", module: orderReadyPickup },
  "order-out-for-delivery": { group: "customer", module: orderOutForDelivery },
  "order-completed": { group: "customer", module: orderCompleted },
  "order-cancelled": { group: "customer", module: orderCancelled },
  "contact-received": { group: "customer", module: contactReceived },
  "admin-new-order": { group: "admin", module: adminNewOrder },
  "admin-payment-confirmed": { group: "admin", module: adminPaymentConfirmed },
  "admin-contact-message": { group: "admin", module: adminContactMessage },
  "auth-reset-password": { group: "auth", module: authResetPassword },
  "auth-verify-email": { group: "auth", module: authVerifyEmail },
} satisfies Record<string, { group: TemplateGroup; module: TemplateModule }>;

export type TemplateName = keyof typeof TEMPLATES;

export const TEMPLATE_NAMES = Object.keys(TEMPLATES) as TemplateName[];

export const isTemplateName = (value: unknown): value is TemplateName =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(TEMPLATES, value);

export const templateGroup = (name: TemplateName): TemplateGroup => TEMPLATES[name].group;

/** Renders one template. Unknown names throw; bad payloads never do. */
export function renderTemplate(
  name: TemplateName,
  data: unknown,
  ctx: RenderContext,
): RenderedEmail {
  if (!isTemplateName(name)) throw new Error(`Unknown email template: ${String(name)}`);
  const rendered = TEMPLATES[name].module.render(data, ctx);
  if (
    rendered.subject.trim() === "" ||
    rendered.html.trim() === "" ||
    rendered.text.trim() === ""
  ) {
    throw new Error(`Template ${name} rendered an empty message.`);
  }
  return rendered;
}
