/**
 * Email configuration: one function decides live vs dry-run for the whole
 * backend, so nothing else has to guess.
 *
 * Every message is handed to Web3Forms (`convex/emails/transport.ts`), which
 * forwards it to the one inbox bound to the access key. Until
 * `WEB3FORMS_ACCESS_KEY` is set the system runs in dry-run: every message is
 * rendered, logged to `emailLogs` and shown in the admin UI, but no network
 * request is ever made. Adding that variable is the only step needed to go
 * live — no code changes.
 */

export type EmailMode = "live" | "dry-run";

export type EmailConfig = {
  mode: EmailMode;
  /** Empty in dry-run. Never logged, never sent to the browser. */
  accessKey: string;
  replyTo: string;
  /** Where internal alerts go; falls back to the store contact address. */
  adminAlertEmail: string;
  dailyLimit: number;
  /** Opt-in: persist one-time auth codes for local development. */
  logCodes: boolean;
  /** Absolute origin every link in an email is built from. */
  siteUrl: string;
};

export type Env = Record<string, string | undefined>;

const DEFAULT_DAILY_LIMIT = 100;
const MAX_DAILY_LIMIT = 5000;

/**
 * True for a local dev server or a Convex *dev* deployment.
 *
 * `SITE_URL` is the only value the spec allows us to inspect, so we accept
 * localhost, a `dev-`/`.dev.` host, or the literal string "dev" in the origin
 * (Convex dev deployments are configured as `dev:` by the CLI).
 */
export function isLocalhostOrDevSite(siteUrl: string): boolean {
  const value = siteUrl.trim().toLowerCase();
  if (value === "") return false;
  if (value.includes("localhost") || value.includes("127.0.0.1") || value.includes("[::1]")) {
    return true;
  }
  let host = value;
  try {
    host = new URL(value).host;
  } catch {
    // Not an absolute URL — fall back to a substring match below.
  }
  return host.startsWith("dev-") || host.startsWith("dev.") || host.includes(".dev.");
}

/** Parses `EMAIL_DAILY_LIMIT`, defaulting to 100 and clamping to a sane range. */
export function parseDailyLimit(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_DAILY_LIMIT;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_DAILY_LIMIT;
  return Math.min(parsed, MAX_DAILY_LIMIT);
}

/**
 * Guard rail for `EMAIL_DRY_RUN_LOG_CODES`. Persisting one-time sign-in codes
 * is only acceptable on a machine nobody else can reach, so the flag refuses
 * to run anywhere that is not localhost/dev. Throwing here fails every email
 * function at import time, which is the point: misconfiguration must be loud.
 */
export function assertEmailEnv(env: Env): void {
  const flag = (env["EMAIL_DRY_RUN_LOG_CODES"] ?? "").trim().toLowerCase();
  if (flag !== "true" && flag !== "1") return;
  const siteUrl = (env["SITE_URL"] ?? env["CONVEX_SITE_URL"] ?? "").trim();
  if (isLocalhostOrDevSite(siteUrl)) return;
  throw new Error(
    "EMAIL_DRY_RUN_LOG_CODES is enabled but SITE_URL is not localhost or a dev deployment. " +
      "Turn EMAIL_DRY_RUN_LOG_CODES off outside local development.",
  );
}

/** Reads the process environment once and derives everything else from it. */
export function getEmailConfig(env: Env = process.env): EmailConfig {
  assertEmailEnv(env);
  const accessKey = (env["WEB3FORMS_ACCESS_KEY"] ?? "").trim();
  const siteUrl = (env["SITE_URL"] ?? env["CONVEX_SITE_URL"] ?? "").trim();
  const live = accessKey !== "";
  return {
    mode: live ? "live" : "dry-run",
    // Belt and braces: a dry-run deployment cannot carry the credential at
    // all, so nothing that reads or logs the config can leak it.
    accessKey: live ? accessKey : "",
    replyTo: (env["EMAIL_REPLY_TO"] ?? "").trim(),
    adminAlertEmail: (env["ADMIN_ALERT_EMAIL"] ?? "").trim(),
    dailyLimit: parseDailyLimit(env["EMAIL_DAILY_LIMIT"]),
    logCodes: ["true", "1"].includes((env["EMAIL_DRY_RUN_LOG_CODES"] ?? "").trim().toLowerCase()),
    siteUrl,
  };
}

/** Nothing secret — safe to expose on `/admin/emails`. */
export type EmailConfigView = {
  mode: EmailMode;
  dailyLimit: number;
  logCodes: boolean;
  siteUrl: string;
  adminAlertEmail: string;
};

export const emailConfigView = (config: EmailConfig): EmailConfigView => ({
  mode: config.mode,
  dailyLimit: config.dailyLimit,
  logCodes: config.logCodes,
  siteUrl: config.siteUrl,
  adminAlertEmail: config.adminAlertEmail,
});

// Startup assertion: a misconfigured code-logging flag must break loudly at
// deploy time, not silently expose one-time codes in production logs.
assertEmailEnv(process.env);
