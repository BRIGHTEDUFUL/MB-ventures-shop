import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getEmailConfig } from "./emails/config";
import { renderContext } from "./emails/queries";
import { scheduleEmail } from "./emails/enqueue";

/**
 * Contact form. Two messages go out: an alert to the shop and an
 * acknowledgement to whoever wrote in. Both are queued through the normal
 * pipeline, so they are deduped, rate-limited and logged like any other mail.
 */

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

export const submit = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    subject: v.optional(v.string()),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    const phone = (args.phone ?? "").trim();
    const subject = (args.subject ?? "").trim();
    const message = args.message.trim();

    if (name.length < 2) throw new ConvexError({ message: "Enter your name." });
    if (!/^[^\s@,;<>"]+@[^\s@,;<>".]+\.[^\s@,;<>"]{2,}$/.test(email)) {
      throw new ConvexError({ message: "Enter a valid email address." });
    }
    if (message.length < 10) {
      throw new ConvexError({ message: "Write at least a short sentence so we can help." });
    }
    if (message.length > 2000) {
      throw new ConvexError({ message: "Keep the message under 2000 characters." });
    }

    // Per-sender throttle: the index key already groups this sender's mail.
    const dedupeKey = `admin-contact-message:${email}`;
    const recent = await ctx.db
      .query("emailLogs")
      .withIndex("by_dedupe", (q) => q.eq("dedupe_ref", dedupeKey))
      .order("desc")
      .take(50);
    const now = Date.now();
    const withinWindow = recent.filter(
      (row) => row.status !== "failed" && now - row._creationTime < RATE_WINDOW_MS,
    ).length;
    if (withinWindow >= RATE_LIMIT) {
      throw new ConvexError({
        message:
          "You have sent several messages recently. Please wait a little before writing again.",
      });
    }

    const config = getEmailConfig();
    const settings = await renderContext(ctx);
    const shopInbox = config.adminAlertEmail !== "" ? config.adminAlertEmail : settings.shop.email;
    const form = {
      name,
      email,
      phone,
      subject: subject === "" ? "General question" : subject,
      message,
    };

    const alert = await scheduleEmail(ctx, {
      template: "admin-contact-message",
      to: shopInbox,
      data: { form },
      dedupeKey,
      category: "contact",
    });
    const ack = await scheduleEmail(ctx, {
      template: "contact-received",
      to: email,
      data: { form },
      category: "contact",
    });

    return { ok: true, queued: alert.logId !== null || ack.logId !== null };
  },
});
