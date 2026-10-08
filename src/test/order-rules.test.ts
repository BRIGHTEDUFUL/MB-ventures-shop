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
  momo_number: "0241234567",
  ordering_enabled: true,
};

const order = (overrides: Partial<OrderState> = {}): OrderState => ({
  fulfillment: "delivery",
  payment_method: "momo",
  status: "received",
  payment_status: "pending",
  ...overrides,
});

const checkout = (overrides: Partial<CheckoutInput> = {}): CheckoutInput => ({
  customer_name: "Ama Mensah",
  phone: "0241234567",
  email: "ama@example.com",
  address: "12 Ring Road East, Circle, Accra",
  fulfillment: "delivery",
  zone: "central",
  payment_method: "momo",
  provider: "MTN MoMo",
  transaction_reference: "MP2610001234",
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
    expect(
      validateStatusChange(
        order({ fulfillment: "pickup", payment_method: "momo" }),
        "dispatched",
        "confirmed",
      ),
    ).toBe("Status does not match fulfillment.");
  });

  it("blocks MoMo orders until payment is confirmed", () => {
    expect(
      validateStatusChange(
        order({ payment_method: "momo", payment_status: "pending" }),
        "processing",
        "pending",
      ),
    ).toBe("Verify Mobile Money before processing.");
  });

  it("blocks completion while payment is unconfirmed", () => {
    // MoMo hits its earlier gate; cash-on-delivery reaches the completion rule.
    expect(validateStatusChange(order({ payment_method: "cod" }), "completed", "pending")).toBe(
      "Confirm payment before completing the order.",
    );
  });

  it("allows the normal verified MoMo happy path", () => {
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
      "Ordering is not open yet. Contact the Circle shop.",
    );
  });

  it("requires Mobile Money details for MoMo payment", () => {
    expect(validateCheckout(checkout(), { ...feeSettings, momo_number: "" })).toBe(
      "Mobile Money details or reference are missing.",
    );
  });

  it("requires a known provider and reference", () => {
    expect(validateCheckout(checkout({ provider: "FakePay" }), feeSettings)).toBe(
      "Mobile Money details or reference are missing.",
    );
  });

  it("requires an address for delivery but not for pickup", () => {
    expect(validateCheckout(checkout({ address: "" }), feeSettings)).toBe(
      "Enter a delivery address.",
    );
    expect(
      validateCheckout(
        checkout({ fulfillment: "pickup", address: "", payment_method: "momo" }),
        feeSettings,
      ),
    ).toBeNull();
  });

  it("accepts a valid order", () => {
    expect(validateCheckout(checkout(), feeSettings)).toBeNull();
  });
});
