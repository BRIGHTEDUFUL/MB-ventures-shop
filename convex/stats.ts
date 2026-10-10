import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requirePermission } from "./lib/permissions";
import { recentActivity, type ActivityEntry } from "./lib/activity";
import { orderDTO, type Order } from "./lib/dto";
import { round2 } from "./lib/rules";

/** Below this count a verified listing deserves a restock. */
export const LOW_STOCK_AT = 5;

/** Days shown on the dashboard till tape. */
export const TREND_DAYS = 14;

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type Trends = {
  /** One bucket per day, oldest first, zero-filled so the chart never gaps. */
  daily: { date: string; label: string; orders: number; revenue: number }[];
  statuses: { status: Order["status"]; count: number }[];
  fulfilment: { pickup: number; delivery: number };
  top_products: { name: string; units: number; revenue: number }[];
  /** Last 7 days against the 7 before them, for the card deltas. */
  week: { orders: number; revenue: number };
  prev_week: { orders: number; revenue: number };
};

export type Overview = {
  orders: {
    today: number;
    today_revenue: number;
    awaiting_payment: number;
    active: number;
    total: number;
  };
  products: {
    total: number;
    verified: number;
    samples: number;
    out_of_stock: number;
    low_stock: { id: string; name: string; stock: number; verified: boolean }[];
  };
  categories: { total: number; hidden: number };
  recent_orders: Order[];
  activity: ActivityEntry[];
};

/**
 * One round trip for the dashboard: today's takings, payment queue, stock
 * warnings, sample listings awaiting verification, plus recent orders/activity.
 */
export const overview = query({
  args: {},
  handler: async (ctx): Promise<Overview> => {
    await requirePermission(ctx, "reports.view");
    const [orders, products, categories, activity] = await Promise.all([
      ctx.db.query("orders").order("desc").take(500),
      ctx.db.query("products").collect(),
      ctx.db.query("categories").collect(),
      recentActivity(ctx, 8),
    ]);

    // Accra is GMT+0, so a UTC midnight boundary matches the shop's day.
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayStartMs = dayStart.getTime();
    const today = orders.filter((o) => o._creationTime >= dayStartMs);
    const isOpen = (o: Doc<"orders">) => o.status !== "completed" && o.status !== "cancelled";

    // Deliberately excludes the empty shelves: `out_of_stock` already reports
    // those, and a zero appearing in both lists makes one shelf look like two
    // problems. This is the "still sellable but getting thin" set.
    const lowStock = products
      .filter((p) => p.stock > 0 && p.stock <= LOW_STOCK_AT)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 8)
      .map((p) => ({ id: p.slug, name: p.name, stock: p.stock, verified: p.verified }));

    return {
      orders: {
        today: today.length,
        today_revenue: round2(
          today.filter((o) => o.payment_status === "confirmed").reduce((s, o) => s + o.total, 0),
        ),
        awaiting_payment: orders.filter((o) => isOpen(o) && o.payment_status === "pending").length,
        active: orders.filter(isOpen).length,
        total: orders.length,
      },
      products: {
        total: products.length,
        verified: products.filter((p) => p.verified).length,
        samples: products.filter((p) => !p.verified).length,
        out_of_stock: products.filter((p) => p.stock === 0).length,
        low_stock: lowStock,
      },
      categories: {
        total: categories.length,
        hidden: categories.filter((c) => !c.visible).length,
      },
      recent_orders: orders.slice(0, 5).map(orderDTO),
      activity,
    };
  },
});

/**
 * Chart fuel for the dashboard: the 14-day till tape, where the pipeline sits
 * right now, pickup against delivery, what is actually selling, and the
 * week-on-week comparison the KPI cards quote.
 *
 * One pass over the recent order rows — the same rows `overview` reads — so
 * the charts cost no extra round trip beyond this query itself. Days are
 * bucketed in UTC because Accra is GMT+0 and the shop's day boundary is
 * midnight here, not somewhere else (same rule as `overview`).
 */
export const trends = query({
  args: {},
  handler: async (ctx): Promise<Trends> => {
    await requirePermission(ctx, "reports.view");
    const orders = await ctx.db.query("orders").order("desc").take(1000);

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();
    const dayMs = 86_400_000;

    // The tape runs oldest-first so the chart reads left to right in time.
    const daily: Trends["daily"] = [];
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const day = new Date(todayMs - i * dayMs);
      daily.push({
        date: day.toISOString().slice(0, 10),
        label: DAY_LABELS[day.getUTCDay()] ?? "",
        orders: 0,
        revenue: 0,
      });
    }
    const bucketOf = new Map(daily.map((d, i) => [d.date, i]));

    const statuses = new Map<Order["status"], number>();
    const fulfilment = { pickup: 0, delivery: 0 };
    const products = new Map<string, { units: number; revenue: number }>();
    const week = { orders: 0, revenue: 0 };
    const prevWeek = { orders: 0, revenue: 0 };
    const weekStartMs = todayMs - 7 * dayMs;

    for (const o of orders) {
      const createdAt = o._creationTime;

      const bucket = bucketOf.get(new Date(createdAt).toISOString().slice(0, 10));
      const todayBucket = bucket === undefined ? undefined : daily[bucket];
      if (todayBucket) {
        todayBucket.orders += 1;
        // Takings count money the shop has actually seen: confirmed payments.
        if (o.payment_status === "confirmed") {
          todayBucket.revenue = round2(todayBucket.revenue + o.total);
        }
      }

      // This week is the last 7 days including today; last week the 7 before.
      if (createdAt >= weekStartMs) {
        week.orders += 1;
        if (o.payment_status === "confirmed") week.revenue = round2(week.revenue + o.total);
      } else if (createdAt >= weekStartMs - 7 * dayMs) {
        prevWeek.orders += 1;
        if (o.payment_status === "confirmed") prevWeek.revenue = round2(prevWeek.revenue + o.total);
      }

      statuses.set(o.status, (statuses.get(o.status) ?? 0) + 1);
      fulfilment[o.fulfillment] += 1;

      // Cancelled orders never moved goods, so they never sold anything.
      if (o.status !== "cancelled") {
        for (const item of o.items) {
          const key = item.name.trim();
          const tally = products.get(key) ?? { units: 0, revenue: 0 };
          tally.units += item.quantity;
          tally.revenue = round2(tally.revenue + item.price * item.quantity);
          products.set(key, tally);
        }
      }
    }

    // Every pipeline stage shows, even at zero — an empty column is information.
    const statusOrder: Order["status"][] = [
      "received",
      "processing",
      "ready",
      "dispatched",
      "completed",
      "cancelled",
    ];

    return {
      daily,
      statuses: statusOrder.map((status) => ({ status, count: statuses.get(status) ?? 0 })),
      fulfilment,
      top_products: [...products.entries()]
        .map(([name, tally]) => ({ name, units: tally.units, revenue: tally.revenue }))
        .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
        .slice(0, 6),
      week,
      prev_week: prevWeek,
    };
  },
});
