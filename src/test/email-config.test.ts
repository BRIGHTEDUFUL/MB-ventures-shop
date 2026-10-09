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
  it("stays in dry-run until the Web3Forms access key exists", () => {
    expect(getEmailConfig(env({})).mode).toBe("dry-run");
    expect(getEmailConfig(env({ WEB3FORMS_ACCESS_KEY: "" })).mode).toBe("dry-run");
    expect(getEmailConfig(env({ WEB3FORMS_ACCESS_KEY: "   " })).mode).toBe("dry-run");
    expect(getEmailConfig(env({ WEB3FORMS_ACCESS_KEY: "w3f_123" })).mode).toBe("live");
  });

  it("never carries the access key in dry-run mode", () => {
    const config = getEmailConfig(env({ SITE_URL: "http://localhost:5173" }));
    expect(config.accessKey).toBe("");
    expect(config.mode).toBe("dry-run");
  });

  it("reads the supporting settings", () => {
    const config = getEmailConfig(
      env({
        WEB3FORMS_ACCESS_KEY: "w3f_123",
        EMAIL_REPLY_TO: "info@mbventuresghana.com",
        ADMIN_ALERT_EMAIL: "alerts@mbventuresghana.com",
        EMAIL_DAILY_LIMIT: "40",
        EMAIL_DRY_RUN_LOG_CODES: "true",
        SITE_URL: "http://localhost:5173",
      }),
    );
    expect(config).toEqual({
      mode: "live",
      accessKey: "w3f_123",
      replyTo: "info@mbventuresghana.com",
      adminAlertEmail: "alerts@mbventuresghana.com",
      dailyLimit: 40,
      logCodes: true,
      siteUrl: "http://localhost:5173",
    });
    // The Resend-era fields are gone for good.
    expect(config).not.toHaveProperty("from");
    expect(config).not.toHaveProperty("apiKey");
    expect(config).not.toHaveProperty("webhookSecret");
  });
});

describe("emailConfigView", () => {
  it("exposes only non-secret settings", () => {
    const dry = emailConfigView(getEmailConfig(env({})));
    expect(dry).toEqual({
      mode: "dry-run",
      dailyLimit: 100,
      logCodes: false,
      siteUrl: "",
      adminAlertEmail: "",
    });

    const live = emailConfigView(
      getEmailConfig(
        env({
          WEB3FORMS_ACCESS_KEY: "w3f_123",
          ADMIN_ALERT_EMAIL: "alerts@mbventuresghana.com",
          SITE_URL: "https://mbventuresghana.com",
        }),
      ),
    );
    expect(live).toEqual({
      mode: "live",
      dailyLimit: 100,
      logCodes: false,
      siteUrl: "https://mbventuresghana.com",
      adminAlertEmail: "alerts@mbventuresghana.com",
    });
  });

  it("never leaks the credential or a provider detail", () => {
    const view = emailConfigView(getEmailConfig(env({ WEB3FORMS_ACCESS_KEY: "w3f_super_secret" })));
    expect(view).not.toHaveProperty("accessKey");
    expect(view).not.toHaveProperty("from");
    expect(view).not.toHaveProperty("webhookEnabled");
    expect(JSON.stringify(view)).not.toContain("w3f_super_secret");
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
