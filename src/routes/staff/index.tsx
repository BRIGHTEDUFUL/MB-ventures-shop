import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Boxes,
  ClipboardList,
  PackageSearch,
  ShoppingCart,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../../convex/_generated/api";
import { money, pageHead } from "@/lib/store";
import { EmptyState, Panel, PaymentPill, Stat, StatusPill } from "@/components/staff/bits";
import { FulfilmentSplit, PipelineChart, TillTape, TopSellers } from "@/components/staff/charts";

export const Route = createFileRoute("/staff/")({
  head: () =>
    pageHead("Dashboard", "Today's orders, takings, stock warnings and recent shop activity."),
  component: Dashboard,
});

/**
 * Week-on-week movement for a KPI card, written out so it can never be read as
 * a change in *today's* number — the card above it is today, this line is the
 * week. `format` turns the no-baseline case into an absolute gain: a percent
 * against zero is undefined, so the honest answer is the amount itself.
 */
function movement(
  now: number,
  before: number,
  format: (n: number) => string,
): { value: string; direction: "up" | "down" | "flat" } | undefined {
  if (before === 0 && now === 0) return undefined;
  if (before === 0) {
    return { value: `+${format(now)} this week`, direction: "up" };
  }
  const pct = Math.round(((now - before) / before) * 100);
  return {
    value: `${pct > 0 ? "+" : ""}${pct}% this week`,
    direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat",
  };
}

/** One row of the "Needs you" queue. */
type QueueItem = {
  key: string;
  icon: typeof Banknote;
  tone: "offer" | "destructive" | "plain";
  label: string;
  hint: string;
  to: "/staff/orders" | "/staff/inventory" | "/staff/products";
};

function Dashboard() {
  const overview = useQuery({ ...convexQueryOptions(api.stats.overview, {}) });
  const trends = useQuery({ ...convexQueryOptions(api.stats.trends, {}) });

  if (overview.isPending)
    return <p className="text-sm text-muted-foreground">Loading dashboard…</p>;
  if (overview.isError) {
    return <p role="alert">The dashboard could not load. Reload the page to try again.</p>;
  }

  const { orders, products, categories, recent_orders, activity } = overview.data;
  const t = trends.data;

  /* ------------------------------------------------------------- the queue */

  // Everything waiting on a human, in the order a shop would clear it: money
  // first, then the shelves, then the catalogue. One list, one place.
  const queue: QueueItem[] = [];
  if (orders.awaiting_payment > 0) {
    queue.push({
      key: "payment",
      icon: Banknote,
      tone: "offer",
      label: `Record ${orders.awaiting_payment} cash payment${orders.awaiting_payment === 1 ? "" : "s"}`,
      hint: "Orders out for delivery or collection that have not been marked paid.",
      to: "/staff/orders",
    });
  }
  if (products.out_of_stock > 0) {
    queue.push({
      key: "oos",
      icon: TriangleAlert,
      tone: "destructive",
      label: `${products.out_of_stock} product${products.out_of_stock === 1 ? "" : "s"} out of stock`,
      hint: "These cannot be ordered until the shelf count is corrected.",
      to: "/staff/inventory",
    });
  }
  if (products.low_stock.length > 0) {
    queue.push({
      key: "low",
      icon: Boxes,
      tone: "offer",
      label: `${products.low_stock.length} product${products.low_stock.length === 1 ? "" : "s"} running low`,
      hint: "Five or fewer on hand — worth a restock before the weekend.",
      to: "/staff/inventory",
    });
  }
  if (products.samples > 0) {
    queue.push({
      key: "samples",
      icon: BadgeCheck,
      tone: "plain",
      label: `Verify ${products.samples} sample listing${products.samples === 1 ? "" : "s"}`,
      hint: "Sample listings stay hidden from customers until verified.",
      to: "/staff/products",
    });
  }

  return (
    <div>
      <h2 className="page-title">Dashboard</h2>
      <p className="page-lead">Everything happening in the shop today.</p>

      {/* KPI strip ------------------------------------------------------- */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Orders today"
          icon={ShoppingCart}
          value={orders.today}
          sub={`${orders.active} open overall`}
          delta={t ? movement(t.week.orders, t.prev_week.orders, (n) => `${n} orders`) : undefined}
        />
        <Stat
          label="Takings today"
          icon={Wallet}
          value={money(orders.today_revenue, true)}
          sub="Confirmed payments"
          tone="success"
          delta={t ? movement(t.week.revenue, t.prev_week.revenue, (n) => money(n)) : undefined}
        />
        <Stat
          label="Awaiting payment"
          icon={Banknote}
          value={orders.awaiting_payment}
          sub="Cash not yet recorded"
          tone={orders.awaiting_payment > 0 ? "offer" : "plain"}
        />
        <Stat
          label="Products"
          icon={PackageSearch}
          value={products.total}
          sub={`${products.verified} live · ${products.samples} samples hidden`}
        />
      </div>

      {/* Needs you ------------------------------------------------------- */}
      <Panel
        className="mt-8"
        title="Needs you"
        description="Cash to record, shelves to fill, listings to verify — in that order."
        actions={<ButtonLink to="/staff/orders">All orders</ButtonLink>}
      >
        {queue.length === 0 ? (
          <EmptyState
            title="Nothing needs you"
            hint="Payments are recorded, shelves are stocked and every listing is verified."
          />
        ) : (
          <ul className="divide-y divide-border">
            {queue.map((item) => (
              <li key={item.key}>
                <Link
                  to={item.to}
                  className="group flex items-start gap-3 py-3.5 hover:underline sm:items-center"
                >
                  <span
                    className={
                      "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full sm:mt-0 " +
                      (item.tone === "destructive"
                        ? "bg-destructive/10 text-destructive"
                        : item.tone === "offer"
                          ? "bg-offer/15 text-offer"
                          : "bg-muted text-muted-foreground")
                    }
                  >
                    <item.icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{item.label}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{item.hint}</span>
                  </span>
                  <ArrowRight
                    className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:mt-0"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Charts ---------------------------------------------------------- */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          className="lg:col-span-2"
          title="Last 14 days"
          description="Orders placed each day, with the takings those days brought in."
        >
          {t ? (
            <TillTape daily={t.daily} />
          ) : (
            <p className="text-sm text-muted-foreground">Counting the till…</p>
          )}
        </Panel>

        <Panel title="Order pipeline" description="Where every order currently sits.">
          {t ? (
            <PipelineChart statuses={t.statuses} />
          ) : (
            <p className="text-sm text-muted-foreground">Counting orders…</p>
          )}
        </Panel>

        <Panel title="Pickup or delivery" description="How customers are choosing to collect.">
          {t ? (
            <FulfilmentSplit fulfilment={t.fulfilment} />
          ) : (
            <p className="text-sm text-muted-foreground">Counting orders…</p>
          )}
        </Panel>

        <Panel
          className="lg:col-span-2"
          title="Best sellers"
          description="By units sold. Cancelled orders are left out — nothing left the shelf."
        >
          {t ? (
            <TopSellers products={t.top_products} />
          ) : (
            <p className="text-sm text-muted-foreground">Counting sales…</p>
          )}
        </Panel>
      </div>

      {/* Orders, stock, catalogue ---------------------------------------- */}
      {/* `grid-cols-1` keeps the column at `minmax(0,1fr)` below `lg` — a bare
          `grid` sizes its track to max-content, and a long order row would drag
          the whole page sideways on a phone. */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <Panel
            title="Latest orders"
            description={`${orders.total} orders in total.`}
            actions={<ButtonLink to="/staff/orders">All orders</ButtonLink>}
          >
            {recent_orders.length === 0 ? (
              <EmptyState
                title="No orders yet"
                hint="New orders appear here the moment they land."
              />
            ) : (
              <ul className="divide-y divide-border">
                {recent_orders.map((o) => (
                  <li key={o.id}>
                    <Link
                      to="/staff/orders/$id"
                      params={{ id: o.id }}
                      className="flex flex-col gap-1 py-3 hover:underline sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                    >
                      <span className="min-w-0">
                        <span className="block font-mono text-sm font-semibold">{o.reference}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {o.customer_name} ·{" "}
                          {o.fulfillment === "pickup" ? "Abelenkpe pickup" : o.address}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <StatusPill status={o.status} />
                        <PaymentPill payment={o.payment_status} />
                        <span className="font-mono text-sm font-semibold tabular-nums">
                          {money(o.total)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Recent activity"
            actions={<ButtonLink to="/staff/activity">Full log</ButtonLink>}
          >
            {activity.length === 0 ? (
              <EmptyState
                title="No activity yet"
                hint="Catalogue, settings and stock changes are logged here."
              />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {activity.map((entry, i) => (
                  <li key={i} className="py-3">
                    <p>{entry.summary}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.actor_name} · {new Date(entry.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div>
          <Panel
            title="Stock warnings"
            description="Five or fewer on hand, plus empty shelves."
            actions={<ButtonLink to="/staff/inventory">Manage stock</ButtonLink>}
          >
            {products.out_of_stock === 0 && products.low_stock.length === 0 ? (
              <EmptyState
                title="Stock looks healthy"
                hint="Nothing is low or out of stock right now."
              />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {products.out_of_stock > 0 && (
                  <li className="flex items-center gap-2 py-3 font-semibold text-destructive">
                    <TriangleAlert className="size-4 shrink-0" aria-hidden />
                    {products.out_of_stock} product{products.out_of_stock === 1 ? "" : "s"} out of
                    stock
                  </li>
                )}
                {products.low_stock.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0 truncate">
                      {p.name}
                      {!p.verified && <span className="ml-2 text-xs text-offer">Sample</span>}
                    </span>
                    <span className="shrink-0 font-mono font-semibold tabular-nums text-offer">
                      {p.stock} left
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Catalogue health"
            description="Keep listings honest before customers see them."
            actions={<ButtonLink to="/staff/products">Products</ButtonLink>}
          >
            <ul className="divide-y divide-border text-sm">
              <li className="flex items-center justify-between py-3">
                <span>Sample listings awaiting verification</span>
                <span
                  className={
                    products.samples > 0
                      ? "font-mono font-semibold tabular-nums text-offer"
                      : "font-mono font-semibold tabular-nums"
                  }
                >
                  {products.samples}
                </span>
              </li>
              <li className="flex items-center justify-between py-3">
                <span>Verified, orderable listings</span>
                <span className="font-mono font-semibold tabular-nums text-success">
                  {products.verified}
                </span>
              </li>
              <li className="flex items-center justify-between py-3">
                <span>Categories</span>
                <span className="font-mono font-semibold tabular-nums">
                  {categories.total}
                  {categories.hidden > 0 && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({categories.hidden} hidden)
                    </span>
                  )}
                </span>
              </li>
            </ul>
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <ClipboardList className="size-3.5 shrink-0" aria-hidden />
              Stock changes are written to the movement log, so every count can be traced back.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ButtonLink({
  to,
  children,
}: {
  to: "/staff/orders" | "/staff/inventory" | "/staff/activity" | "/staff/products";
  children: string;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"
    >
      {children}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}
