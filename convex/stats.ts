import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requirePermission } from "./lib/permissions";
import { recentActivity, type ActivityEntry } from "./lib/activity";
import { orderDTO, type Order } from "./lib/dto";
import { round2 } from "./lib/rules";

/** Below this count a verified listing deserves a restock. */
export const LOW_STOCK_AT = 5;

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

    const lowStock = products
      .filter((p) => p.stock <= LOW_STOCK_AT)
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
