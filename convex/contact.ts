import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getEmailConfig } from "./emails/config";
import { renderContext } from "./emails/queries";
import { scheduleEmail } from "./emails/enqueue";
import { requireStaff } from "./lib/auth";
import type { Doc } from "./_generated/dataModel";

/**
 * Contact form. Messages are saved to the `contact_messages` table for staff
 * and admin visibility in the hub. Two notifications go out: an alert to the
 * shop inbox (ADMIN_ALERT_EMAIL, else store_settings.email) and an
 * acknowledgement to whoever wrote in.
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

    // 1. Store in the database so staff & admin can review it in the back-office
    await ctx.db.insert("contact_messages", {
      name,
      email,
      ...(phone !== "" ? { phone } : {}),
      subject: form.subject,
      message,
      status: "unread",
    });

    // 2. Queue outbound notification emails (to shop inbox and customer)
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

/** Staff and admin list of customer messages */
export const list = query({
  args: {
    status: v.optional(
      v.union(v.literal("all"), v.literal("unread"), v.literal("read"), v.literal("replied")),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const filterStatus = args.status ?? "all";
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);

    let rows: Doc<"contact_messages">[];
    if (filterStatus !== "all") {
      rows = await ctx.db
        .query("contact_messages")
        .withIndex("by_status", (q) => q.eq("status", filterStatus))
        .order("desc")
        .take(limit);
    } else {
      rows = await ctx.db.query("contact_messages").order("desc").take(limit);
    }

    return rows.map((r) => ({
      id: r._id,
      name: r.name,
      email: r.email,
      phone: r.phone ?? null,
      subject: r.subject,
      message: r.message,
      status: r.status,
      created_at: new Date(r._creationTime).toISOString(),
      read_at: r.read_at ? new Date(r.read_at).toISOString() : null,
    }));
  },
});

/** Unread messages count for badge display in navigation */
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const unread = await ctx.db
      .query("contact_messages")
      .withIndex("by_status", (q) => q.eq("status", "unread"))
      .take(100);
    return unread.length;
  },
});

/** Mark a message as read */
export const markRead = mutation({
  args: {
    id: v.id("contact_messages"),
  },
  handler: async (ctx, args) => {
    const userId = await requireStaff(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({ message: "Message not found." });
    }
    if (existing.status === "unread") {
      await ctx.db.patch(args.id, {
        status: "read",
        read_at: Date.now(),
        read_by: userId,
      });
    }
    return { ok: true };
  },
});

/** Mark a message as replied */
export const markReplied = mutation({
  args: {
    id: v.id("contact_messages"),
  },
  handler: async (ctx, args) => {
    const userId = await requireStaff(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({ message: "Message not found." });
    }
    await ctx.db.patch(args.id, {
      status: "replied",
      read_at: existing.read_at ?? Date.now(),
      read_by: existing.read_by ?? userId,
    });
    return { ok: true };
  },
});
