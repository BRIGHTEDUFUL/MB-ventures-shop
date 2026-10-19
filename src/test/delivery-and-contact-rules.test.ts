import { describe, expect, it } from "vitest";

import {
  DEFAULT_ANNOUNCEMENT,
  announcementText,
  isValidEmail,
  normalizePhone,
  normalizeWhatsApp,
  validateWhatsApp,
  whatsappHref,
} from "../../convex/lib/rules";

/**
 * The contact-field normalisers checkout validation is built on, plus the
 * header copy helpers.
 *
 * The delivery-fee rules that used to live here (`deliveryFee`,
 * `remainingForFreeDelivery`, `displayFees`) are gone with the fees
 * themselves: the shop no longer charges delivery, so there is no boundary
 * for a cart hint to disagree with any more.
 */

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
