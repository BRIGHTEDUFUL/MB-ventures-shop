import { asArray, asRecord, formatMoney, num, str, type OrderLine } from "./base";

/** Shape shared by every order-driven template (see `convex/emails/enqueue.ts`). */
export type OrderEmailFields = {
  reference: string;
  fulfillment: "delivery" | "pickup";
  items: OrderLine[];
  subtotal: string;
  /** Legacy fee (never shown on new orders), "Free (pickup)" or the rider line. */
  deliveryFee: string;
  /** Flat GH₵ off a counter order. 0 on every row that has none. */
  discount: number;
  total: string;
  paymentMethod: string;
  /** pending / confirmed / rejected — decides "nothing is due" wording. */
  paymentStatus: string;
  provider: string;
  transactionReference: string;
  address: string;
  status: string;
  note: string;
  zone: string;
};

const PAYMENT_LABELS: Record<string, string> = {
  // Legacy in-app Mobile Money orders (pre pay-later) still label correctly.
  momo: "Mobile Money",
  cod: "Cash on delivery",
  pay_at_store: "Pay at the shop",
  // Online payments taken through Paystack at checkout.
  paystack: "Online payment (Paystack)",
};

/** True when the order's money moves through Paystack rather than offline. */
export const isOnlinePayment = (fields: OrderEmailFields): boolean =>
  fields.paymentMethod === PAYMENT_LABELS["paystack"];

const ZONE_LABELS: Record<string, string> = {
  central: "Accra Central and Abelenkpe",
  greater: "Greater Accra",
  nationwide: "Nationwide",
};

/** Reads an order payload defensively — a malformed row must not throw. */
export function readOrder(data: Record<string, unknown>): OrderEmailFields {
  const items: OrderLine[] = asArray(data["items"])
    .map((raw) => {
      const item = asRecord(raw);
      const name = str(item["name"]);
      if (name === "") return null;
      return {
        name,
        quantity: Math.max(1, Math.round(num(item["quantity"], 1))),
        money: formatMoney(num(item["price"], 0)),
      };
    })
    .filter((line): line is OrderLine => line !== null);

  const fulfillment = str(data["fulfillment"], "delivery");
  const paymentMethod = str(data["payment_method"], "cod");

  return {
    reference: str(data["reference"], "MB-00000000"),
    fulfillment: fulfillment === "pickup" ? "pickup" : "delivery",
    items,
    subtotal: formatMoney(num(data["subtotal"], 0)),
    // Three cases, in priority order: a pickup never carries a fee; a legacy
    // row booked while fees were still on keeps rendering its stored number;
    // everything the shop writes today says who actually gets paid — the
    // rider, directly by the customer.
    deliveryFee:
      fulfillment === "pickup"
        ? "Free (pickup)"
        : num(data["delivery_fee"], 0) > 0
          ? formatMoney(num(data["delivery_fee"], 0))
          : "Paid directly to your rider",
    discount: num(data["discount"], 0),
    total: formatMoney(num(data["total"], 0)),
    paymentMethod: PAYMENT_LABELS[paymentMethod] ?? paymentMethod,
    paymentStatus: str(data["payment_status"], "pending"),
    provider: str(data["provider"]),
    transactionReference: str(data["transaction_reference"]),
    address: str(data["address"]),
    status: str(data["status"]),
    note: str(data["note"]),
    zone: ZONE_LABELS[str(data["zone"])] ?? str(data["zone"]),
  };
}

/** Delivery vs pickup wording, kept in one place so the two never drift. */
export const fulfilmentLine = (fields: OrderEmailFields): string =>
  fields.fulfillment === "pickup"
    ? "You chose to collect the order from our Abelenkpe taxi rank shop."
    : "You chose delivery to your address.";
