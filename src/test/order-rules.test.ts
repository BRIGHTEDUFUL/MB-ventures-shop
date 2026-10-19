import { describe, expect, it } from "vitest";
import {
  offlinePaymentProblem,
  round2,
  validateCheckout,
  validateManualOrder,
  validateStatusChange,
  type CheckoutInput,
  type CheckoutSettings,
  type ManualOrderInput,
  type OrderState,
} from "../../convex/lib/rules";

/**
 * Checkout only needs the ordering switch from settings any more: the shop
 * does not charge delivery (riders bill the customer directly), so there is
 * no fee table to pass in.
 */
const settings: CheckoutSettings = {
  ordering_enabled: true,
};

const order = (overrides: Partial<OrderState> = {}): OrderState => ({
  fulfillment: "delivery",
  status: "received",
  payment_status: "pending",
  ...overrides,
});

const checkout = (overrides: Partial<CheckoutInput> = {}): CheckoutInput => ({
  customer_name: "Ama Mensah",
  phone: "0241234567",
  email: "ama@example.com",
  address: "12 Abelenkpe Taxi Rank Road, Accra",
  fulfillment: "delivery",
  zone: "central",
  items: [{ id: "ergonomic-chair", quantity: 1 }],
  ...overrides,
});

/** A counter sale as `orders.staffCreate` sees it before defaults are applied. */
const manualOrder = (overrides: Partial<ManualOrderInput> = {}): ManualOrderInput => ({
  customer_name: "Yaw Owusu",
  phone: "0244556677",
  email: "",
  address: "",
  fulfillment: "pickup",
  zone: "central",
  items: [{ id: "standing-desk", quantity: 1 }],
  payment_method: "pay_at_store",
  payment_status: "pending",
  channel: "whatsapp",
  ...overrides,
});

describe("validateStatusChange — the staff hub's transition guard", () => {
  it("refuses to reopen a completed order", () => {
    expect(
      validateStatusChange(
        order({ status: "completed", payment_status: "confirmed" }),
        "processing",
        "confirmed",
      ),
    ).toBe("This order is closed.");
  });

  it("refuses to reopen a cancelled order", () => {
    expect(validateStatusChange(order({ status: "cancelled" }), "received", "pending")).toBe(
      "This order is closed.",
    );
  });

  it("allows a no-op save on a closed order", () => {
    expect(
      validateStatusChange(
        order({ status: "completed", payment_status: "confirmed" }),
        "completed",
        "confirmed",
      ),
    ).toBeNull();
  });

  it("keeps 'ready' exclusive to pickup orders", () => {
    expect(validateStatusChange(order({ fulfillment: "delivery" }), "ready", "confirmed")).toBe(
      "Status does not match fulfillment.",
    );
  });

  it("keeps 'dispatched' exclusive to delivery orders", () => {
    expect(validateStatusChange(order({ fulfillment: "pickup" }), "dispatched", "confirmed")).toBe(
      "Status does not match fulfillment.",
    );
  });

  it("lets an order advance to processing while payment is still pending", () => {
    // Money changes hands offline, so no status short of completion is gated.
    expect(
      validateStatusChange(order({ payment_status: "pending" }), "processing", "pending"),
    ).toBeNull();
  });

  it("blocks completion while payment is unconfirmed", () => {
    expect(validateStatusChange(order(), "completed", "pending")).toBe(
      "Confirm payment before completing the order.",
    );
  });

  it("allows the normal paid happy path", () => {
    expect(
      validateStatusChange(order({ payment_status: "confirmed" }), "processing", "confirmed"),
    ).toBeNull();
    expect(
      validateStatusChange(
        order({ status: "dispatched", payment_status: "confirmed" }),
        "completed",
        "confirmed",
      ),
    ).toBeNull();
  });
});

describe("round2 — the money rounding both order doors share", () => {
  it("rounds totals to two decimals", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(19.999)).toBe(20);
  });
});

describe("validateCheckout — the server-side order gate", () => {
  it("blocks ordering while the switch is off", () => {
    expect(validateCheckout(checkout(), { ...settings, ordering_enabled: false })).toBe(
      "Ordering is not open yet. Contact the Abelenkpe shop.",
    );
  });

  it("requires an address for delivery but not for pickup", () => {
    expect(validateCheckout(checkout({ address: "" }), settings)).toBe("Enter a delivery address.");
    expect(validateCheckout(checkout({ fulfillment: "pickup", address: "" }), settings)).toBe(null);
  });

  it("accepts a valid order", () => {
    expect(validateCheckout(checkout(), settings)).toBeNull();
  });
});

describe("offlinePaymentProblem — outside Accra, delivery is prepaid", () => {
  it("refuses cash-on-delivery for a nationwide delivery", () => {
    expect(offlinePaymentProblem("nationwide", "delivery", "offline")).toMatch(
      /must be paid online/,
    );
  });

  it("accepts online payment for a nationwide delivery", () => {
    expect(offlinePaymentProblem("nationwide", "delivery", "online")).toBeNull();
  });

  it("keeps cash options inside Accra and at the counter", () => {
    expect(offlinePaymentProblem("central", "delivery", "offline")).toBeNull();
    expect(offlinePaymentProblem("greater", "delivery", "offline")).toBeNull();
    expect(offlinePaymentProblem("nationwide", "pickup", "offline")).toBeNull();
  });
});

describe("validateManualOrder — the discount a staff member types at the counter", () => {
  it("accepts an order with no discount, and one that simply omits the field", () => {
    expect(validateManualOrder(manualOrder())).toBeNull();
    expect(validateManualOrder(manualOrder({ discount: 0 }))).toBeNull();
  });

  it("accepts a fractional discount — the mutation rounds it before storing", () => {
    expect(validateManualOrder(manualOrder({ discount: 12.345 }))).toBeNull();
  });

  it("refuses NaN and infinities before they can poison the total", () => {
    expect(validateManualOrder(manualOrder({ discount: Number.NaN }))).toBe(
      "Enter a valid discount.",
    );
    expect(validateManualOrder(manualOrder({ discount: Number.POSITIVE_INFINITY }))).toBe(
      "Enter a valid discount.",
    );
    expect(validateManualOrder(manualOrder({ discount: Number.NEGATIVE_INFINITY }))).toBe(
      "Enter a valid discount.",
    );
  });

  it("refuses a negative discount — it would add money to the order", () => {
    expect(validateManualOrder(manualOrder({ discount: -0.01 }))).toBe(
      "The discount can't be negative.",
    );
    expect(validateManualOrder(manualOrder({ discount: -100 }))).toBe(
      "The discount can't be negative.",
    );
  });

  it("still runs the rest of the counter validation when a discount is given", () => {
    // The discount is one more field, never a way to skip the others — and
    // how big it may be is checked in `orders.staffCreate` against the real
    // subtotal, which this pure function never sees.
    expect(validateManualOrder(manualOrder({ discount: 50, items: [] }))).toBe(
      "Add at least one item to the order.",
    );
    expect(validateManualOrder(manualOrder({ discount: 50, payment_method: "cod" }))).toBe(
      "Cash on delivery only applies to delivery orders.",
    );
  });
});
