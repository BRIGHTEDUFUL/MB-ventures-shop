import { describe, expect, it } from "vitest";
import {
  assertEmailEnv,
  emailConfigView,
  getEmailConfig,
  isLocalhostOrDevSite,
  parseDailyLimit,
  type Env,
} from "../../convex/emails/config";

const env = (overrides: Env): Env => ({ ...overrides });

describe("isLocalhostOrDevSite", () => {
  it("accepts local addresses in every common spelling", () => {
    expect(isLocalhostOrDevSite("http://localhost:5173")).toBe(true);
    expect(isLocalhostOrDevSite("https://127.0.0.1:8787")).toBe(true);
    expect(isLocalhostOrDevSite("http://[::1]:5173")).toBe(true);
    expect(isLocalhostOrDevSite("localhost")).toBe(true);
  });

  it("accepts dev-shaped hosts", () => {
    expect(isLocalhostOrDevSite("https://dev-stoic-elephant.convex.site")).toBe(true);
    expect(isLocalhostOrDevSite("https://dev.something.example")).toBe(true);
    expect(isLocalhostOrDevSite("https://shop.dev.example")).toBe(true);
  });

  it("rejects production origins and empty values", () => {
    expect(isLocalhostOrDevSite("https://necessary-newt-861.convex.site")).toBe(false);
    expect(isLocalhostOrDevSite("https://mbventuresgh.com")).toBe(false);
    expect(isLocalhostOrDevSite("")).toBe(false);
    expect(isLocalhostOrDevSite("   ")).toBe(false);
  });
});

describe("parseDailyLimit", () => {
  it("defaults to 100 when unset or unusable", () => {
    expect(parseDailyLimit(undefined)).toBe(100);
    expect(parseDailyLimit("")).toBe(100);
    expect(parseDailyLimit("   ")).toBe(100);
    expect(parseDailyLimit("not-a-number")).toBe(100);
    expect(parseDailyLimit("0")).toBe(100);
    expect(parseDailyLimit("-5")).toBe(100);
  });

  it("reads an explicit value and clamps the absurd ones", () => {
    expect(parseDailyLimit("25")).toBe(25);
    expect(parseDailyLimit(" 7 ")).toBe(7);
    expect(parseDailyLimit("999999")).toBe(5000);
  });
});

describe("getEmailConfig mode detection", () => {
  it("stays in dry-run until both the key and the sender exist", () => {
    expect(getEmailConfig(env({})).mode).toBe("dry-run");
    expect(getEmailConfig(env({ RESEND_API_KEY: "re_123" })).mode).toBe("dry-run");
    expect(getEmailConfig(env({ EMAIL_FROM: "Shop <info@mbventures.test>" })).mode).toBe("dry-run");
    expect(
      getEmailConfig(env({ RESEND_API_KEY: "re_123", EMAIL_FROM: "Shop <info@mbventures.test>" }))
        .mode,
    ).toBe("live");
  });

  it("never carries the API key in dry-run mode", () => {
    const config = getEmailConfig(env({ EMAIL_FROM: "Shop <info@mbventures.test>" }));
    expect(config.apiKey).toBe("");
    expect(config.from).toBe("");
  });

  it("reads the supporting settings", () => {
    const config = getEmailConfig(
      env({
        RESEND_API_KEY: "re_123",
        EMAIL_FROM: "MB Ventures GH <info@mbventures.test>",
        EMAIL_REPLY_TO: "orders@mbventuresgh.com",
        ADMIN_ALERT_EMAIL: "alerts@mbventuresgh.com",
        EMAIL_DAILY_LIMIT: "40",
        RESEND_WEBHOOK_SECRET: "whsec_abc",
        EMAIL_DRY_RUN_LOG_CODES: "true",
        SITE_URL: "http://localhost:5173",
      }),
    );
    expect(config).toMatchObject({
      mode: "live",
      replyTo: "orders@mbventuresgh.com",
      adminAlertEmail: "alerts@mbventuresgh.com",
      dailyLimit: 40,
      webhookSecret: "whsec_abc",
      logCodes: true,
      siteUrl: "http://localhost:5173",
    });
  });
});

describe("emailConfigView", () => {
  it("hides the sender address until the deployment is live", () => {
    const dry = emailConfigView(getEmailConfig(env({ RESEND_API_KEY: "re_123" })));
    expect(dry.from).toBe("");
    expect(dry.mode).toBe("dry-run");

    const live = emailConfigView(
      getEmailConfig(
        env({ RESEND_API_KEY: "re_123", EMAIL_FROM: "MB Ventures GH <info@mbventures.test>" }),
      ),
    );
    expect(live.from).toBe("MB Ventures GH <info@mbventures.test>");
    expect(live.mode).toBe("live");
  });

  it("reports webhook readiness", () => {
    expect(emailConfigView(getEmailConfig(env({}))).webhookEnabled).toBe(false);
    expect(
      emailConfigView(getEmailConfig(env({ RESEND_WEBHOOK_SECRET: "whsec_abc" }))).webhookEnabled,
    ).toBe(true);
  });
});

describe("assertEmailEnv", () => {
  it("is silent unless code logging was asked for", () => {
    expect(() =>
      assertEmailEnv(env({ SITE_URL: "https://necessary-newt-861.convex.site" })),
    ).not.toThrow();
    expect(() =>
      assertEmailEnv(env({ EMAIL_DRY_RUN_LOG_CODES: "false", SITE_URL: "https://shop.example" })),
    ).not.toThrow();
  });

  it("allows one-time code logging on localhost and dev deployments", () => {
    expect(() =>
      assertEmailEnv(env({ EMAIL_DRY_RUN_LOG_CODES: "true", SITE_URL: "http://localhost:5173" })),
    ).not.toThrow();
    expect(() =>
      assertEmailEnv(
        env({ EMAIL_DRY_RUN_LOG_CODES: "1", CONVEX_SITE_URL: "https://dev-stoic.convex.site" }),
      ),
    ).not.toThrow();
  });

  it("refuses one-time code logging anywhere else", () => {
    expect(() =>
      assertEmailEnv(
        env({
          EMAIL_DRY_RUN_LOG_CODES: "true",
          SITE_URL: "https://necessary-newt-861.convex.site",
        }),
      ),
    ).toThrow(/EMAIL_DRY_RUN_LOG_CODES/);
  });
});
