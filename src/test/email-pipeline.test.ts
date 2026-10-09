// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";

/**
 * End-to-end coverage of the email pipeline against the real Convex functions.
 * Everything runs in dry-run unless a test deliberately turns the credential
 * on, which is exactly how the deployment behaves today.
 */
const modules = import.meta.glob("../../convex/**/*.*s");

const ENV_KEYS = [
  "WEB3FORMS_ACCESS_KEY",
  "EMAIL_REPLY_TO",
  "ADMIN_ALERT_EMAIL",
  "EMAIL_DAILY_LIMIT",
  "EMAIL_DRY_RUN_LOG_CODES",
  "SITE_URL",
  "CONVEX_SITE_URL",
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env["SITE_URL"] = "http://localhost:5173";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Seeds the store and returns one account that holds the admin role. */
async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.seed, {});

  const created = await t.run(async (ctx) => {
    const product = await ctx.db.query("products").first();
    if (product === null) throw new Error("seed did not create a product");
    await ctx.db.patch(product._id, { verified: true, stock: 50 });

    const settings = await ctx.db.query("store_settings").unique();
    if (settings === null) throw new Error("seed did not create settings");
    await ctx.db.patch(settings._id, {
      ordering_enabled: true,
      momo_number: "0241234567",
      momo_name: "MB Ventures GH",
    });

    const userId = await ctx.db.insert("users", {
      name: "Ama Mensah",
      email: "ama@example.com",
      phone: "0241234567",
    });
    await ctx.db.insert("user_roles", { user_id: userId, role: "admin" });
    return { userId, productSlug: product.slug, inbox: settings.email };
  });

  const me = t.withIdentity({ subject: `${created.userId}|test-session` });
  return { t, me, ...created };
}

type Awaited<T> = T extends PromiseLike<infer U> ? U : T;

async function placeOrder(
  t: Awaited<ReturnType<typeof setup>>["t"],
  me: Awaited<ReturnType<typeof setup>>["me"],
  productSlug: string,
  overrides: Record<string, unknown> = {},
) {
  const order = await me.mutation(api.orders.place, {
    customer_name: "Ama Mensah",
    phone: "0241234567",
    email: "ama@example.com",
    address: "12 Abelenkpe Taxi Rank Road, Accra",
    fulfillment: "delivery",
    zone: "central",
    payment_method: "momo",
    provider: "MTN MoMo",
    transaction_reference: "1839201746",
    items: [{ id: productSlug, quantity: 1 }],
    ...overrides,
  });
  await t.finishAllScheduledFunctions(() => {});
  return order;
}

const drain = (t: Awaited<ReturnType<typeof setup>>["t"]) =>
  t.finishAllScheduledFunctions(() => {});

const allLogs = (t: Awaited<ReturnType<typeof setup>>["t"]) =>
  t.run((ctx) => ctx.db.query("emailLogs").collect());

const readOrder = (t: Awaited<ReturnType<typeof setup>>["t"], orderId: string) =>
  t.run(async (ctx) => {
    const id = ctx.db.normalizeId("orders", orderId);
    return id === null ? null : await ctx.db.get(id);
  });

const submitContact = (
  t: Awaited<ReturnType<typeof setup>>["t"],
  email: string,
  message = "Do you deliver to Community 25 and how long does it take?",
) =>
  t
    .mutation(api.contact.submit, {
      name: "Kwame Asante",
      email,
      subject: "Delivery to Tema",
      message,
    })
    .then(() => drain(t));

describe("dry-run mode", () => {
  it("renders and logs every message without a single network call", async () => {
    const { t } = await setup();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await submitContact(t, "kwame@example.com");

    expect(fetchSpy).not.toHaveBeenCalled();
    const rows = await allLogs(t);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.template).sort()).toEqual([
      "admin-contact-message",
      "contact-received",
    ]);
    for (const row of rows) {
      expect(row.status).toBe("skipped_dry_run");
      expect(row.mode).toBe("dry-run");
      // Dry-run keeps the body so the admin console can show exactly what
      // would have gone out.
      expect(row.html).toBeTruthy();
      expect(row.text).toBeTruthy();
    }
    expect(rows.find((row) => row.template === "contact-received")?.to).toBe("kwame@example.com");
  });
});

describe("guards", () => {
  it("stops at the daily allowance and records why", async () => {
    const { t } = await setup();
    process.env["EMAIL_DAILY_LIMIT"] = "1";

    await submitContact(t, "first@example.com");
    await submitContact(t, "second@example.com");

    const rows = await allLogs(t);
    const rejected = rows.filter((row) => row.status === "failed");
    expect(rejected.length).toBeGreaterThanOrEqual(2);
    expect(rejected.every((row) => row.error?.includes("Daily email limit reached (1)"))).toBe(
      true,
    );
    expect(rows.some((row) => row.status === "skipped_dry_run")).toBe(true);
  });

  it("dedupes a repeat of the same message inside a minute", async () => {
    const { t } = await setup();

    await submitContact(t, "kwame@example.com");
    await submitContact(t, "kwame@example.com");

    expect(await allLogs(t)).toHaveLength(2);
  });

  it("never emails a suppressed recipient", async () => {
    const { t, me } = await setup();
    await me.mutation(api.emails.addSuppression, { email: "blocked@example.com" });

    await submitContact(t, "blocked@example.com");

    const rows = await allLogs(t);
    const toBlocked = rows.filter((row) => row.to === "blocked@example.com");
    expect(toBlocked).toHaveLength(1);
    expect(toBlocked[0]?.status).toBe("failed");
    expect(toBlocked[0]?.error).toContain("suppressed");

    const listed = await me.query(api.emails.suppressed, {});
    expect(listed.map((row) => row.email)).toEqual(["blocked@example.com"]);
  });

  it("hides the delivery log from anyone who is not staff", async () => {
    const { t } = await setup();
    const visitorId = await t.run((ctx) =>
      ctx.db.insert("users", { name: "Kojo Owusu", email: "kojo@example.com" }),
    );
    const visitor = t.withIdentity({ subject: `${visitorId}|session` });

    await expect(t.query(api.emails.suppressed, {})).rejects.toThrow(/Please sign in to continue/);
    await expect(t.query(api.emails.config, {})).rejects.toThrow(/Please sign in to continue/);
    await expect(visitor.query(api.emails.suppressed, {})).rejects.toThrow(/Admin access required/);
    await expect(visitor.query(api.emails.config, {})).rejects.toThrow(/Admin access required/);
    // Anything staff-level still admits a signed-in customer.
    await expect(
      visitor.mutation(api.emails.clearAttention, { id: "not-an-order" }),
    ).rejects.toThrow(/Staff access required/);
  });

  it("rejects an unusable address before it can reach the queue", async () => {
    const { t, me } = await setup();

    await expect(
      t.mutation(api.contact.submit, {
        name: "Someone",
        email: "not-an-address",
        message: "This should never be accepted at all.",
      }),
    ).rejects.toThrow(/valid email/);

    const { logId } = await me.mutation(internal.emails.enqueueTest, {
      template: "auth-reset-password",
      to: "also-broken",
    });
    const row = await t.run((ctx) => ctx.db.get(logId));
    expect(row?.status).toBe("failed");
    expect(row?.error).toContain("not valid");
  });

  it("caps auth mail at five per recipient per hour", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert("emailLogs", {
          template: "auth-verify-email",
          category: "auth",
          to: "ama@example.com",
          subject: "Confirm your email address",
          status: "sent",
          mode: "dry-run",
          order_id: null,
          dedupe_ref: "auth-verify-email:ama@example.com",
          data: {},
          attempt: 1,
        });
      }
    });

    await expect(
      t.mutation(internal.emails.enqueueAuth, {
        template: "auth-reset-password",
        to: "ama@example.com",
        url: "http://localhost:5173/account?code=abc123",
        token: "abc123",
      }),
    ).rejects.toThrow(/Too many reset requests/);
  });

  it("stores the reset code only behind EMAIL_DRY_RUN_LOG_CODES", async () => {
    const { t } = await setup();

    await t.mutation(internal.emails.enqueueAuth, {
      template: "auth-reset-password",
      to: "ama@example.com",
      url: "http://localhost:5173/account?code=abc123",
      token: "abc123",
    });
    let rows = await allLogs(t);
    expect(rows.find((row) => row.to === "ama@example.com")?.dry_run_code).toBeUndefined();

    // A different recipient: the one-minute dedupe would otherwise swallow it.
    process.env["EMAIL_DRY_RUN_LOG_CODES"] = "true";
    await t.mutation(internal.emails.enqueueAuth, {
      template: "auth-reset-password",
      to: "bo@example.com",
      url: "http://localhost:5173/account?code=def456",
      token: "def456",
    });
    rows = await allLogs(t);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.to === "bo@example.com")?.dry_run_code).toBe("def456");
  });
});

describe("order triggers", () => {
  it("sends the confirmation and the shop alert exactly once on placement", async () => {
    const { t, me, productSlug, inbox } = await setup();
    await placeOrder(t, me, productSlug);

    const rows = await allLogs(t);
    expect(rows).toHaveLength(2);

    const confirmation = rows.filter((row) => row.template === "order-received");
    expect(confirmation).toHaveLength(1);
    expect(confirmation[0]?.to).toBe("ama@example.com");
    expect(confirmation[0]?.status).toBe("skipped_dry_run");
    expect(confirmation[0]?.subject).toMatch(/^Order MB-[0-9A-F]+ received$/);
    expect(confirmation[0]?.text).toContain("GH₵");

    const alert = rows.filter((row) => row.template === "admin-new-order");
    expect(alert).toHaveLength(1);
    expect(alert[0]?.to).toBe(inbox);
  });

  it("mails the customer once when staff confirm the payment", async () => {
    const { t, me, productSlug, inbox } = await setup();
    const order = await placeOrder(t, me, productSlug);
    expect(await allLogs(t)).toHaveLength(2);

    await me.mutation(api.orders.staffUpdate, {
      id: order.id,
      status: "received",
      payment: "confirmed",
    });
    await drain(t);
    expect(await allLogs(t)).toHaveLength(4);

    // Same call again: nothing changed, so nothing new goes out.
    await me.mutation(api.orders.staffUpdate, {
      id: order.id,
      status: "received",
      payment: "confirmed",
    });
    await drain(t);
    const rows = await allLogs(t);
    expect(rows).toHaveLength(4);
    expect(rows.filter((row) => row.template === "payment-confirmed")).toHaveLength(1);
    expect(rows.filter((row) => row.template === "admin-payment-confirmed")).toHaveLength(1);
    expect(rows.find((row) => row.template === "admin-payment-confirmed")?.to).toBe(inbox);
  });

  it("picks the template that matches delivery or pickup", async () => {
    const { t, me, productSlug } = await setup();
    const delivery = await placeOrder(t, me, productSlug);
    await me.mutation(api.orders.staffUpdate, {
      id: delivery.id,
      status: "dispatched",
      payment: "confirmed",
    });
    await drain(t);

    let rows = await allLogs(t);
    expect(rows.map((row) => row.template)).toContain("order-out-for-delivery");
    expect(rows.map((row) => row.template)).not.toContain("order-ready-pickup");

    const pickup = await placeOrder(t, me, productSlug, {
      fulfillment: "pickup",
      address: "Abelenkpe taxi rank, Accra, Ghana",
    });
    await me.mutation(api.orders.staffUpdate, {
      id: pickup.id,
      status: "ready",
      payment: "confirmed",
    });
    await drain(t);

    rows = await allLogs(t);
    const ready = rows.filter((row) => row.template === "order-ready-pickup");
    expect(ready).toHaveLength(1);
    expect(ready[0]?.text).toContain("ready to collect");
  });

  it("never rolls the order back when the email queue is full", async () => {
    const { t, me, productSlug } = await setup();
    process.env["EMAIL_DAILY_LIMIT"] = "1";
    await submitContact(t, "someone@example.com");

    const order = await placeOrder(t, me, productSlug);

    expect(order.id).toBeTruthy();
    const orders = await t.run((ctx) => ctx.db.query("orders").collect());
    expect(orders).toHaveLength(1);

    const rows = await allLogs(t);
    expect(
      rows.some((row) => row.status === "failed" && row.error?.includes("Daily email limit")),
    ).toBe(true);
  });
});

describe("attention flag", () => {
  it("clears a flag staff have dealt with", async () => {
    const { t, me, productSlug } = await setup();
    const order = await placeOrder(t, me, productSlug);

    // Simulate the flag a staff member has already acted on: the webhook path
    // that used to set it is gone, so patch it directly.
    await t.run(async (ctx) => {
      const id = ctx.db.normalizeId("orders", order.id);
      if (id === null) throw new Error("unknown order");
      await ctx.db.patch(id, { needs_attention: "Customer email bounced" });
    });
    expect((await readOrder(t, order.id))?.needs_attention).toBe("Customer email bounced");

    await me.mutation(api.emails.clearAttention, { id: order.id });

    const after = await readOrder(t, order.id);
    expect(after?.needs_attention).toBeUndefined();
    const history = await t.run((ctx) => ctx.db.query("order_history").collect());
    expect(history.some((entry) => entry.note.includes("Email alert dismissed"))).toBe(true);
  });
});

describe("live mode", () => {
  it("posts to Web3Forms with the access key in the body and keeps no copy", async () => {
    const { t } = await setup();
    process.env["WEB3FORMS_ACCESS_KEY"] = "w3f_live_key_for_tests";

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ success: true }),
    }));
    vi.stubGlobal("fetch", fetchSpy);

    await submitContact(t, "kwame@example.com");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const calls = fetchSpy.mock.calls as unknown as Array<[string, RequestInit]>;
    for (const [url] of calls) {
      expect(url).toBe("https://api.web3forms.com/submit");
    }

    const rows = await allLogs(t);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe("sent");
      expect(row.mode).toBe("live");
      // Live rows never keep a copy of the message.
      expect(row.html).toBeUndefined();
      expect(row.text).toBeUndefined();
    }

    const headers = calls[0]![1].headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Authorization"]).toBeUndefined();

    const body = JSON.parse(String(calls[0]![1].body)) as Record<string, unknown>;
    expect(body["access_key"]).toBe("w3f_live_key_for_tests");
    expect(body["to"]).toMatch(/@/);
    expect(typeof body["subject"]).toBe("string");
    expect((body["subject"] as string).length).toBeGreaterThan(0);
    expect(typeof body["body"]).toBe("string");
    expect((body["body"] as string).length).toBeGreaterThan(0);
  });

  it("stays in dry-run when no access key is configured", async () => {
    const { t } = await setup();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await submitContact(t, "kwame@example.com");

    expect(fetchSpy).not.toHaveBeenCalled();
    const rows = await allLogs(t);
    expect(rows.every((row) => row.mode === "dry-run")).toBe(true);
  });
});

describe("template preview gallery", () => {
  it("answers with every template on localhost and refuses elsewhere", async () => {
    const { t } = await setup();

    const open = await t.query(api.emails.previewDev, {});
    expect(open.allowed).toBe(true);
    expect(open.items).toHaveLength(12);
    expect(open.items.every((item) => item.html.includes("<!DOCTYPE html>"))).toBe(true);

    process.env["SITE_URL"] = "https://mbventuresgh.com";
    const gated = await t.query(api.emails.previewDev, {});
    expect(gated).toEqual({ allowed: false, items: [] });
  });
});

describe("contact form", () => {
  it("throttles a sender that keeps writing in", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert("emailLogs", {
          template: "admin-contact-message",
          category: "contact",
          to: "info@mbventuresghana.com",
          subject: "Contact form: Delivery to Tema",
          status: "sent",
          mode: "dry-run",
          order_id: null,
          dedupe_ref: "admin-contact-message:kwame@example.com",
          data: {},
          attempt: 1,
        });
      }
    });

    await expect(
      t.mutation(api.contact.submit, {
        name: "Kwame Asante",
        email: "kwame@example.com",
        subject: "Delivery to Tema",
        message: "Do you deliver to Community 25 and how long does it take?",
      }),
    ).rejects.toThrow(/several messages recently/);
  });

  it("asks for a real sentence", async () => {
    const { t } = await setup();
    await expect(
      t.mutation(api.contact.submit, {
        name: "Kwame Asante",
        email: "kwame@example.com",
        message: "hi",
      }),
    ).rejects.toThrow(/at least a short sentence/);
  });
});

describe("cleanup cron", () => {
  it("keeps recent rows and leaves nothing else behind", async () => {
    const { t } = await setup();
    await submitContact(t, "kwame@example.com");
    const removed = await t.mutation(internal.emails.cleanup, {});
    expect(removed.removed).toBe(0);
    expect(await allLogs(t)).toHaveLength(2);
  });
});
