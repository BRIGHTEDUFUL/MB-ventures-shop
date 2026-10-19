import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * emailLogs retention: dry-run rows are dev artefacts (14 days), live rows are
 * a delivery record (90 days).
 */
crons.interval("purge old email logs", { hours: 24 }, internal.emails.cleanup, {});

/**
 * Inventory data health: one line on the activity feed when the set of
 * critical/high findings changes. Read-only over the data — it never repairs
 * anything by itself (see `convex/health.ts`).
 */
crons.daily("inventory health check", { hourUTC: 5, minuteUTC: 0 }, internal.health.dailyCheck, {});

/**
 * Online orders that never completed their Paystack payment age out: cancel
 * them and put the reserved stock back (see `internal.payments.expireStale`
 * and docs/PAYMENTS-PAYSTACK.md).
 */
crons.interval("expire unpaid online orders", { minutes: 15 }, internal.payments.expireStale, {});

export default crons;
