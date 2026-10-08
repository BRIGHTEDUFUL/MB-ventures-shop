import { describe, expect, it } from "vitest";

import {
  deliveryFee,
  isValidEmail,
  normalizePhone,
  remainingForFreeDelivery,
  type FeeSettings,
} from "../../convex/lib/rules";

/**
 * Complements `order-rules.test.ts`: covers the browser-side estimate helpers
 * and the contact-field normalisers that checkout validation is built on.
 *
 * The important invariant is that `deliveryFee` and `remainingForFreeDelivery`
 * agree on the free-delivery boundary — the cart must never claim delivery is
 * free while the server still charges for it.
 */

const settings: FeeSettings = {
  central_fee: 30,
  greater_fee: 45,
  nationwide_fee: 70,
  free_threshold: 5000,
  momo_number: "0241234567",
  ordering_enabled: true,
};

describe("remainingForFreeDelivery", () => {
  it("keeps one cedi in hand while the cart sits exactly on the threshold", () => {
    // deliveryFee still charges at 5000 (it uses `subtotal > threshold`), so
    // reporting "0 away" here would promise free delivery the server won't give.
    expect(remainingForFreeDelivery(settings.free_threshold, 5000)).toBe(1);
    expect(remainingForFreeDelivery(settings.free_threshold, 4999)).toBe(2);
  });

  it("drops to zero exactly when the fee is waived", () => {
    expect(remainingForFreeDelivery(settings.free_threshold, 5001)).toBe(0);
    expect(remainingForFreeDelivery(settings.free_threshold, 12000)).toBe(0);
  });

  it("never reports a negative remainder", () => {
    expect(remainingForFreeDelivery(5000, 8000)).toBe(0);
    expect(remainingForFreeDelivery(0, 100)).toBe(0);
  });

  it("matches deliveryFee across the whole boundary window", () => {
    for (let subtotal = 4990; subtotal <= 5010; subtotal++) {
      const fee = deliveryFee(settings, "central", subtotal, "delivery");
      const remaining = remainingForFreeDelivery(settings.free_threshold, subtotal);
      expect(remaining === 0, `subtotal ${subtotal}: remaining=${remaining}, fee=${fee}`).toBe(
        fee === 0,
      );
    }
  });

  it("matches deliveryFee at the exact values the cart renders", () => {
    // GH₵ 2,400 cart against a GH₵ 5,000 threshold shows "GH₵ 2,601 away".
    expect(remainingForFreeDelivery(5000, 2400)).toBe(2601);
    expect(deliveryFee(settings, "central", 2400, "delivery")).toBe(30);
  });
});

describe("deliveryFee boundary", () => {
  it("charges on the threshold and waives the cedi after it", () => {
    expect(deliveryFee(settings, "central", 5000, "delivery")).toBe(30);
    expect(deliveryFee(settings, "central", 5001, "delivery")).toBe(0);
  });

  it("waives pickup regardless of subtotal or zone", () => {
    expect(deliveryFee(settings, "nationwide", 10, "pickup")).toBe(0);
    expect(deliveryFee(settings, "central", 99999, "pickup")).toBe(0);
  });
});

describe("normalizePhone", () => {
  it("keeps only digits and +, matching the Postgres regexp_replace", () => {
    expect(normalizePhone("+233 (0) 24 123 4567")).toBe("+2330241234567");
    expect(normalizePhone("024-123-4567")).toBe("0241234567");
    expect(normalizePhone("024 123 4567")).toBe("0241234567");
  });

  it("strips letters so a junk value cannot pass the 9-digit check", () => {
    expect(normalizePhone("call me anytime")).toBe("");
    expect(normalizePhone("12345")).toBe("12345");
    expect(normalizePhone("")).toBe("");
  });
});

describe("isValidEmail", () => {
  it("accepts a local@domain.tld address and tolerates padding", () => {
    expect(isValidEmail("ama@example.com")).toBe(true);
    expect(isValidEmail("  ama@example.com ")).toBe(true);
    expect(isValidEmail("a.b+c@shop.com.gh")).toBe(true);
  });

  it("rejects addresses with no domain dot or no local part", () => {
    expect(isValidEmail("ama@example")).toBe(false);
    expect(isValidEmail("ama.mensah")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});
