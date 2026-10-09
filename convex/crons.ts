import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * emailLogs retention: dry-run rows are dev artefacts (14 days), live rows are
 * a delivery record (90 days). `cleanup` also ages out webhook receipts.
 */
crons.interval("purge old email logs", { hours: 24 }, internal.emails.cleanup, {});

export default crons;
