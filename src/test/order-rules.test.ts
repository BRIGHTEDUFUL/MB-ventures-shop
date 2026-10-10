import { describe, expect, it } from "vitest";
import {
  deliveryFee,
  round2,
  validateCheckout,
  validateStatusChange,
  type CheckoutInput,
  type FeeSettings,
  type OrderState,
} from "../../convex/lib/rules";

const feeSettings: FeeSettings = {
  central_fee: 30,
  greater_fee: 50,
  nationwide_fee: 100,
  free_threshold: 5000,
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

describe("deliveryFee — what checkout charges and the cart estimates", () => {
  it("never charges for pickup", () => {
    expect(deliveryFee(feeSettings, "central", 100, "pickup")).toBe(0);
  });

  it("is free above the threshold", () => {
    expect(deliveryFee(feeSettings, "nationwide", 5001, "delivery")).toBe(0);
  });

  it("charges the configured zone fee at or below the threshold", () => {
    expect(deliveryFee(feeSettings, "central", 1650, "delivery")).toBe(30);
    expect(deliveryFee(feeSettings, "greater", 1650, "delivery")).toBe(50);
    expect(deliveryFee(feeSettings, "nationwide", 1650, "delivery")).toBe(100);
  });

  it("rounds totals to two decimals", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(19.999)).toBe(20);
  });
});

describe("validateCheckout — the server-side order gate", () => {
  it("blocks ordering while the switch is off", () => {
    expect(validateCheckout(checkout(), { ...feeSettings, ordering_enabled: false })).toBe(
      "Ordering is not open yet. Contact the Abelenkpe shop.",
    );
  });

  it("requires an address for delivery but not for pickup", () => {
    expect(validateCheckout(checkout({ address: "" }), feeSettings)).toBe(
      "Enter a delivery address.",
    );
    expect(validateCheckout(checkout({ fulfillment: "pickup", address: "" }), feeSettings)).toBe(
      null,
    );
  });

  it("accepts a valid order", () => {
    expect(validateCheckout(checkout(), feeSettings)).toBeNull();
  });
});
