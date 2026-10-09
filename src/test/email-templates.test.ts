import { describe, expect, it } from "vitest";
import {
  TEMPLATE_NAMES,
  isTemplateName,
  renderTemplate,
  templateGroup,
} from "../../convex/emails/templates";
import {
  escapeHtml,
  formatMoney,
  siteLink,
  type RenderContext,
} from "../../convex/emails/templates/base";
import { sampleDataFor } from "../../convex/emails/sample";

const ctx: RenderContext = {
  siteUrl: "https://shop.example/",
  shop: {
    name: "MB Ventures GH",
    address: "Abelenkpe taxi rank, Accra, Ghana",
    hours: "Monday to Saturday, 8:00 AM to 6:00 PM",
    phone: "+233 24 000 0000",
    email: "orders@mbventuresgh.com",
  },
};

const renderSample = (name: (typeof TEMPLATE_NAMES)[number]) =>
  renderTemplate(name, sampleDataFor(name, ctx), ctx);

/** Emoji, exclamation marks and em dashes are banned from every message. */
const FORBIDDEN = {
  exclamation: /!/,
  emDash: /—/,
  emoji: /\p{Extended_Pictographic}/u,
};

describe("template registry", () => {
  it("exposes the customer, admin and auth groups", () => {
    expect(TEMPLATE_NAMES).toHaveLength(12);
    expect(TEMPLATE_NAMES.map((name) => templateGroup(name))).toEqual([
      "customer",
      "customer",
      "customer",
      "customer",
      "customer",
      "customer",
      "customer",
      "admin",
      "admin",
      "admin",
      "auth",
      "auth",
    ]);
  });

  it("recognises known names only", () => {
    expect(isTemplateName("order-received")).toBe(true);
    expect(isTemplateName("nope")).toBe(false);
    expect(isTemplateName(42)).toBe(false);
    expect(() => renderTemplate("nope" as never, {}, ctx)).toThrow(/Unknown email template/);
  });
});

describe("every template", () => {
  it("renders a subject, HTML body and text twin from sample data", () => {
    for (const name of TEMPLATE_NAMES) {
      const rendered = renderSample(name);
      expect(rendered.subject.trim(), `${name} subject`).not.toBe("");
      expect(rendered.html.trim(), `${name} html`).not.toBe("");
      expect(rendered.text.trim(), `${name} text`).not.toBe("");
    }
  });

  it("uses the shared 600px table layout with a text alternative", () => {
    for (const name of TEMPLATE_NAMES) {
      const rendered = renderSample(name);
      expect(rendered.html.startsWith("<!DOCTYPE html>"), `${name} doctype`).toBe(true);
      expect(rendered.html).toContain('width="600"');
      expect(rendered.html).toContain("style=");
      expect(rendered.html).not.toContain("<script");
      // The text twin is for plain-text clients: no markup at all.
      expect(rendered.text).not.toMatch(/<[a-z]+/i);
      expect(rendered.text).toContain(ctx.shop.address);
      expect(rendered.text).toContain(ctx.shop.email);
    }
  });

  it("keeps copy house rules: no emoji, no exclamation marks, no em dashes", () => {
    for (const name of TEMPLATE_NAMES) {
      const rendered = renderSample(name);
      const where = `${name} subject+text: ${rendered.subject} ${rendered.text}`;
      expect(rendered.subject).not.toMatch(FORBIDDEN.exclamation);
      expect(rendered.text).not.toMatch(FORBIDDEN.exclamation);
      expect(rendered.subject).not.toMatch(FORBIDDEN.emDash);
      expect(rendered.text).not.toMatch(FORBIDDEN.emDash);
      expect(where).not.toMatch(FORBIDDEN.emoji);
    }
  });

  it("builds every link from SITE_URL", () => {
    for (const name of TEMPLATE_NAMES) {
      const rendered = renderSample(name);
      const hrefs = [...rendered.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
      for (const href of hrefs) {
        expect(href, `${name} href`).toMatch(/^https:\/\/shop\.example/);
      }
    }
  });

  it("survives a payload with nothing useful in it", () => {
    for (const name of TEMPLATE_NAMES) {
      expect(() => renderTemplate(name, {}, ctx), name).not.toThrow();
      expect(() => renderTemplate(name, "nonsense", ctx), name).not.toThrow();
    }
  });
});

describe("order emails", () => {
  it("carries the reference and the money in the order currency", () => {
    const delivery = renderTemplate("order-received", sampleDataFor("order-received", ctx), ctx);
    expect(delivery.subject).toBe("Order MB-2FA41C09 received");
    expect(delivery.text).toContain("MB-2FA41C09");
    expect(delivery.text).toContain("GH₵ 3,699.00"); // subtotal
    expect(delivery.text).toContain("GH₵ 30.00"); // delivery fee
    expect(delivery.text).toContain("GH₵ 3,729.00"); // total
    expect(delivery.text).toContain("1839201746");
  });

  it("words delivery and pickup differently", () => {
    const delivery = renderTemplate("order-received", sampleDataFor("order-received", ctx), ctx);
    expect(delivery.text).toContain("You chose delivery to your address.");
    expect(delivery.text).toContain("Deliver to: 12 Abelenkpe Taxi Rank Road, Accra");

    const pickup = renderTemplate("order-received", sampleDataFor("order-ready-pickup", ctx), ctx);
    expect(pickup.text).toContain(
      "You chose to collect the order from our Abelenkpe taxi rank shop.",
    );
    expect(pickup.text).toContain("Free (pickup)");
    expect(pickup.text).not.toContain("GH₵ 30.00");
    expect(pickup.text).toContain("Collection point: Abelenkpe taxi rank, Accra, Ghana");
  });

  it("routes each status to the right message", () => {
    expect(renderSample("order-ready-pickup").text).toContain("ready to collect");
    expect(renderSample("order-out-for-delivery").text).toContain("is on its way");
    expect(renderSample("order-completed").subject).toBe("Order MB-2FA41C09 is complete");
    expect(renderSample("order-cancelled").text).toContain("The desk is out of stock this week.");
    expect(renderSample("payment-confirmed").subject).toBe(
      "Payment confirmed for order MB-2FA41C09",
    );
  });

  it("shows the staff member on the admin copy", () => {
    const rendered = renderTemplate(
      "admin-payment-confirmed",
      { ...sampleDataFor("admin-payment-confirmed", ctx), actor_name: "Kojo Oteng" },
      ctx,
    );
    expect(rendered.text).toContain("Kojo Oteng");
    expect(rendered.text).toContain("MB-2FA41C09");
  });
});

describe("contact emails", () => {
  const form = {
    form: {
      name: "Kwame Asante",
      email: "kwame@example.com",
      phone: "0205550199",
      subject: "Delivery to Tema",
      message: "Do you deliver to Community 25 and how long does it take?",
    },
  };

  it("shows the message to staff and acknowledges the sender", () => {
    const admin = renderTemplate("admin-contact-message", form, ctx);
    expect(admin.subject).toBe("Contact form: Delivery to Tema");
    expect(admin.text).toContain("kwame@example.com");
    expect(admin.text).toContain("Do you deliver to Community 25");

    const ack = renderTemplate("contact-received", form, ctx);
    expect(ack.text).toContain("Thanks Kwame Asante");
  });
});

describe("escaping", () => {
  it("neutralises script tags a customer could type into a form", () => {
    const hostile = {
      form: {
        name: '<script>alert("xss")</script>',
        email: "attacker@example.com",
        subject: "Hello <img src=x onerror=alert(1)>",
        message: 'Please call me on <b>024</b> or "whatever"',
      },
    };
    const admin = renderTemplate("admin-contact-message", hostile, ctx);
    expect(admin.html).not.toContain("<script>");
    expect(admin.html).not.toContain("<img src=x");
    expect(admin.html).toContain("&lt;script&gt;");
    expect(admin.html).toContain("&lt;img src=x");
    // The text twin keeps the raw characters — it is not HTML.
    expect(admin.text).toContain('<script>alert("xss")</script>');
  });

  it("neutralises a hostile customer name on an order email", () => {
    const order = sampleDataFor("order-received", ctx);
    const rendered = renderTemplate(
      "order-received",
      {
        ...order,
        customer_name: "<script>alert('x')</script>",
        address: "</td><script>x</script>",
      },
      ctx,
    );
    expect(rendered.html).not.toContain("<script>alert");
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).not.toContain("</td><script>");
  });

  it("escapes every value passed straight through escapeHtml", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });
});

describe("auth emails", () => {
  it("points the reset link at the account page and keeps the one-time code", () => {
    const url = "https://shop.example/account?code=one-time-code-1234";
    const rendered = renderTemplate("auth-reset-password", { url, expires: "60 minutes" }, ctx);
    expect(rendered.html).toContain('href="https://shop.example/account?code=one-time-code-1234"');
    expect(rendered.text).toContain(url);
    expect(rendered.text).toContain("60 minutes");
  });

  it("falls back to the account page when the payload has no link", () => {
    const rendered = renderTemplate("auth-reset-password", {}, ctx);
    expect(rendered.html).toContain('href="https://shop.example/account"');
  });
});

describe("formatMoney", () => {
  it("groups thousands and always shows two decimals", () => {
    expect(formatMoney(0)).toBe("GH₵ 0.00");
    expect(formatMoney(30)).toBe("GH₵ 30.00");
    expect(formatMoney(3699)).toBe("GH₵ 3,699.00");
    expect(formatMoney(1234567.5)).toBe("GH₵ 1,234,567.50");
    expect(formatMoney(-250)).toBe("-GH₵ 250.00");
    expect(formatMoney(Number.NaN)).toBe("GH₵ 0.00");
  });
});

describe("siteLink", () => {
  it("never doubles up the slash", () => {
    expect(siteLink(ctx, "/track")).toBe("https://shop.example/track");
    expect(siteLink(ctx, "track")).toBe("https://shop.example/track");
    expect(siteLink({ ...ctx, siteUrl: "https://shop.example" }, "track")).toBe(
      "https://shop.example/track",
    );
  });
});
