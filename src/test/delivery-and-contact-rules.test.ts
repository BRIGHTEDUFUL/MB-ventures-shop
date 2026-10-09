import { describe, expect, it } from "vitest";

import {
  DEFAULT_ANNOUNCEMENT,
  DEFAULT_FEES,
  announcementText,
  deliveryFee,
  displayFees,
  isValidEmail,
  normalizePhone,
  normalizeWhatsApp,
  remainingForFreeDelivery,
  validateWhatsApp,
  whatsappHref,
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

describe("normalizeWhatsApp", () => {
  it("maps every way of writing a Ghana number onto one wa.me target", () => {
    expect(normalizeWhatsApp("024 123 4567")).toBe("233241234567");
    expect(normalizeWhatsApp("+233 (0) 24 123 4567")).toBe("233241234567");
    expect(normalizeWhatsApp("233241234567")).toBe("233241234567");
  });

  it("is idempotent, so saving a saved value cannot drift it", () => {
    for (const raw of ["024 123 4567", "+233 (0) 24 123 4567", "233241234567"]) {
      const once = normalizeWhatsApp(raw);
      expect(normalizeWhatsApp(once)).toBe(once);
    }
  });

  it("strips everything non-numeric", () => {
    expect(normalizeWhatsApp("call or WhatsApp me")).toBe("");
    expect(normalizeWhatsApp("")).toBe("");
  });
});

describe("validateWhatsApp", () => {
  it("treats blank as valid — the storefront then falls back to the shop phone", () => {
    expect(validateWhatsApp("")).toBeNull();
    expect(validateWhatsApp("   ")).toBeNull();
  });

  it("accepts a normalised Ghana number", () => {
    expect(validateWhatsApp("024 123 4567")).toBeNull();
    expect(validateWhatsApp("+233 24 123 4567")).toBeNull();
  });

  it("rejects numbers too short or too long to dial", () => {
    expect(validateWhatsApp("1234")).toBeTypeOf("string");
    expect(validateWhatsApp("1".repeat(16))).toBeTypeOf("string");
  });
});

describe("whatsappHref", () => {
  const settings = { whatsapp: "024 123 4567", phone: "+233 24 000 0000" };

  it("prefers the staff-entered WhatsApp number over the shop phone", () => {
    expect(whatsappHref(settings)).toBe("https://wa.me/233241234567");
  });

  it("falls back to the shop phone when the WhatsApp field is empty", () => {
    expect(whatsappHref({ ...settings, whatsapp: "" })).toBe("https://wa.me/233240000000");
  });

  it("returns null rather than a dead anchor when neither number is dialable", () => {
    expect(whatsappHref({ whatsapp: "", phone: "" })).toBeNull();
    expect(whatsappHref({ whatsapp: "", phone: "1234" })).toBeNull();
  });

  it("URL-encodes the enquiry text", () => {
    expect(whatsappHref(settings, "Ask about desks & chairs")).toBe(
      "https://wa.me/233241234567?text=Ask%20about%20desks%20%26%20chairs",
    );
  });
});

describe("announcementText", () => {
  it("returns the announcement so the header can render the bar", () => {
    expect(announcementText({ announcement: DEFAULT_ANNOUNCEMENT })).toBe(DEFAULT_ANNOUNCEMENT);
  });

  it("returns an empty string when staff hide the bar", () => {
    // The old `?? default` could never fire on "", so the bar never hid.
    expect(announcementText({ announcement: "" })).toBe("");
    expect(announcementText({ announcement: "   " })).toBe("");
  });

  it("returns an empty string before settings load, so nothing flashes", () => {
    expect(announcementText(undefined)).toBe("");
    expect(announcementText(null)).toBe("");
  });
});

describe("displayFees", () => {
  it("falls back to the published defaults only while settings are absent", () => {
    expect(displayFees(undefined)).toEqual(DEFAULT_FEES);
    expect(displayFees(null)).toEqual(DEFAULT_FEES);
  });

  it("keeps a saved 0 — zero is how staff turn a zone free", () => {
    const saved = { ...DEFAULT_FEES, central_fee: 0 };
    expect(displayFees(saved)).toEqual(saved);
    // Regression: `fee || 30` used to resurrect the default and overcharge.
    expect(displayFees(saved).central_fee).toBe(0);
  });

  it("passes a full set of saved fees through untouched", () => {
    const saved = {
      central_fee: 12,
      greater_fee: 25,
      nationwide_fee: 60,
      free_threshold: 1500,
    };
    expect(displayFees(saved)).toEqual(saved);
  });
});
