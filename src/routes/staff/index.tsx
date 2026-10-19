import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Boxes,
  ClipboardList,
  MessageSquare,
  PackageSearch,
  ShoppingCart,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../../convex/_generated/api";
import { LOW_STOCK_AT, money, pageHead, storeQuery, type Order } from "@/lib/store";
import { useSession } from "@/lib/use-session";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  Panel,
  PaymentPill,
  QueryState,
  Stat,
  StatusPill,
} from "@/components/staff/bits";
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
  to: "/staff/orders" | "/staff/inventory" | "/staff/products" | "/staff/messages";
};

/** The counts behind the queue, whichever dashboard worked them out. */
type QueueCounts = {
  unreadMessages: number;
  awaitingPayment: number;
  outOfStock: number;
  lowStock: number;
  samples: number;
};

/**
 * Everything waiting on a human, in the order a shop would clear it: money
 * first, then customer messages, shelves, catalogue. One list, one place —
 * the full dashboard and the reduced one below feed it the same way.
 */
function buildQueue(c: QueueCounts): QueueItem[] {
  const queue: QueueItem[] = [];
  if (c.unreadMessages > 0) {
    queue.push({
      key: "messages",
      icon: MessageSquare,
      tone: "offer",
      label: `Review ${c.unreadMessages} unread customer message${c.unreadMessages === 1 ? "" : "s"}`,
      hint: "Customer inquiries submitted through the contact form.",
      to: "/staff/messages",
    });
  }
  if (c.awaitingPayment > 0) {
    queue.push({
      key: "payment",
      icon: Banknote,
      tone: "offer",
      label: `Record ${c.awaitingPayment} cash payment${c.awaitingPayment === 1 ? "" : "s"}`,
      hint: "Orders out for delivery or collection that have not been marked paid.",
      to: "/staff/orders",
    });
  }
  if (c.outOfStock > 0) {
    queue.push({
      key: "oos",
      icon: TriangleAlert,
      tone: "destructive",
      label: `${c.outOfStock} product${c.outOfStock === 1 ? "" : "s"} out of stock`,
      hint: "These cannot be ordered until the shelf count is corrected.",
      to: "/staff/inventory",
    });
  }
  if (c.lowStock > 0) {
    queue.push({
      key: "low",
      icon: Boxes,
      tone: "offer",
      label: `${c.lowStock} product${c.lowStock === 1 ? "" : "s"} running low`,
      hint: "Five or fewer on hand — worth a restock before the weekend.",
      to: "/staff/inventory",
    });
  }
  if (c.samples > 0) {
    queue.push({
      key: "samples",
      icon: BadgeCheck,
      tone: "plain",
      label: `Verify ${c.samples} sample listing${c.samples === 1 ? "" : "s"}`,
      hint: "Sample listings stay hidden from customers until verified.",
      to: "/staff/products",
    });
  }
  return queue;
}

/** The queue list itself, shared by the full and reduced dashboards. */
function QueueList({ queue }: { queue: QueueItem[] }) {
  if (queue.length === 0) {
    return (
      <EmptyState
        title="Nothing needs you"
        hint="Payments are recorded, shelves are stocked and every listing is verified."
      />
    );
  }
  return (
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
  );
}

/** The "Latest orders" rows, shared by the full and reduced dashboards. */
function OrderRows({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return <EmptyState title="No orders yet" hint="New orders appear here the moment they land." />;
  }
  return (
    <ul className="divide-y divide-border">
      {orders.map((o) => (
        <li key={o.id}>
          <Link
            to="/staff/orders/$id"
            params={{ id: o.id }}
            className="flex flex-col gap-1 py-3 hover:underline sm:flex-row sm:items-center sm:justify-between sm:gap-3"
          >
            <span className="min-w-0">
              <span className="block font-mono text-sm font-semibold">{o.reference}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {o.customer_name} · {o.fulfillment === "pickup" ? "Abelenkpe pickup" : o.address}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <StatusPill status={o.status} />
              <PaymentPill payment={o.payment_status} />
              <span className="font-mono text-sm font-semibold tabular-nums">{money(o.total)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Shelf rows the stock panel draws, from either data source. */
type ShelfRow = { id: string; name: string; stock: number; verified: boolean };

/** The "Stock warnings" list, shared by the full and reduced dashboards. */
function StockWarningRows({ outOfStock, lowStock }: { outOfStock: number; lowStock: ShelfRow[] }) {
  if (outOfStock === 0 && lowStock.length === 0) {
    return (
      <EmptyState title="Stock looks healthy" hint="Nothing is low or out of stock right now." />
    );
  }
  return (
    <ul className="divide-y divide-border text-sm">
      {outOfStock > 0 && (
        <li className="flex items-center gap-2 py-3 font-semibold text-destructive">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {outOfStock} product{outOfStock === 1 ? "" : "s"} out of stock
        </li>
      )}
      {lowStock.map((p) => (
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
  );
}

/** "Record an order" + "All orders" in a panel header. */
function OrdersActions({ canCreate }: { canCreate: boolean }) {
  return (
    <>
      {canCreate && (
        <Button asChild size="sm">
          <Link to="/staff/orders/new">Record an order</Link>
        </Button>
      )}
      <ButtonLink to="/staff/orders">All orders</ButtonLink>
    </>
  );
}

type ReducedReason = { kind: "revoked" } | { kind: "failed"; retry: () => void };

/**
 * The dashboard that still works when the report numbers are unavailable —
 * `reports.view` switched off by an override, or `stats.overview` failing
 * anyway. Everything it shows reads queries a plain staff role always holds:
 * the order list (`orders.view`), the public storefront bundle (stock on the
 * shelf) and the message count (`requireStaff`). Deliberately no takings and
 * no charts: those *are* the reports, and they are what the permission gates.
 * A lesser dashboard, never a dead end.
 */
function ReducedDashboard({
  greeting,
  subtitle,
  canCreate,
  reason,
}: {
  greeting: string;
  subtitle: string;
  canCreate: boolean;
  reason: ReducedReason;
}) {
  const unreadMessages = useQuery({ ...convexQueryOptions(api.contact.unreadCount, {}) });
  const recentOrders = useQuery({ ...convexQueryOptions(api.orders.staffList, { limit: 100 }) });
  const store = useQuery(storeQuery);

  // The same `isListed` rule the report query uses, applied to the public
  // bundle's DTO products — hidden demo rows are not shelf stock to count.
  const shelf = (store.data?.products ?? []).filter((p) => p.visible !== false);
  const outOfStock = shelf.filter((p) => p.stock === 0).length;
  const lowStock: ShelfRow[] = shelf
    .filter((p) => p.stock > 0 && p.stock <= LOW_STOCK_AT)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 8)
    .map((p) => ({ id: p.id, name: p.name, stock: p.stock, verified: p.verified }));

  const orders = recentOrders.data ?? [];
  const isOpen = (o: Order) => o.status !== "completed" && o.status !== "cancelled";
  const queue = buildQueue({
    unreadMessages: unreadMessages.data ?? 0,
    awaitingPayment: orders.filter((o) => isOpen(o) && o.payment_status === "pending").length,
    outOfStock,
    lowStock: lowStock.length,
    samples: shelf.filter((p) => !p.verified).length,
  });

  return (
    <div>
      <h2 className="page-title">{greeting}</h2>
      <p className="page-lead">{subtitle}</p>

      {reason.kind === "revoked" ? (
        <p className="mt-4 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          Takings, charts and report numbers are hidden because <strong>view reports</strong> is
          switched off for your account. Orders, stock and messages below all still work — the store
          owner can turn reports back on from the Team page.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <p role="alert">
            The report numbers could not load — nothing else is affected. The orders and stock below
            are live.
          </p>
          <Button variant="outline" size="sm" onClick={reason.retry}>
            Try again
          </Button>
        </div>
      )}

      <Panel
        className="mt-6"
        title="Needs you"
        description="Cash to record, shelves to fill, listings to verify — in that order."
        actions={<OrdersActions canCreate={canCreate} />}
      >
        <QueueList queue={queue} />
      </Panel>

      {/* `grid-cols-1` keeps the column at `minmax(0,1fr)` below `lg` — a bare
          `grid` sizes its track to max-content, and a long order row would drag
          the whole page sideways on a phone. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Latest orders" description="Your newest orders, newest first.">
          <QueryState
            pending={recentOrders.isPending}
            error={recentOrders.isError}
            label="Orders"
          />
          {recentOrders.isPending || recentOrders.isError ? null : (
            <OrderRows orders={orders.slice(0, 8)} />
          )}
        </Panel>

        <Panel
          title="Stock warnings"
          description="Five or fewer on hand, plus empty shelves."
          actions={<ButtonLink to="/staff/inventory">Manage stock</ButtonLink>}
        >
          <QueryState pending={store.isPending} error={store.isError} label="Stock" />
          {store.isPending || store.isError ? null : (
            <StockWarningRows outOfStock={outOfStock} lowStock={lowStock} />
          )}
        </Panel>
      </div>
    </div>
  );
}

function Dashboard() {
  const { session, profile } = useSession();
  const role = useQuery({ ...convexQueryOptions(api.users.myRole, {}), enabled: !!session });
  const permissions = useQuery({
    ...convexQueryOptions(api.users.myPermissions, {}),
    enabled: !!session,
  });
  // `stats.overview` / `stats.trends` are gated on `reports.view` server-side.
  // Asking for them without the permission is what dead-ended this page at
  // "The dashboard could not load." — one flipped override, and the whole hub
  // went offline. The requests are now made only when the permission is held,
  // and even a held-then-failed one falls back to the working dashboard above
  // rather than giving up on the page.
  const canSeeReports = permissions.isSuccess && permissions.data.includes("reports.view");
  const overview = useQuery({
    ...convexQueryOptions(api.stats.overview, {}),
    enabled: canSeeReports,
  });
  const trends = useQuery({ ...convexQueryOptions(api.stats.trends, {}), enabled: canSeeReports });
  const unreadMessages = useQuery({ ...convexQueryOptions(api.contact.unreadCount, {}) });

  if (permissions.isPending)
    return <p className="text-sm text-muted-foreground">Loading dashboard…</p>;
  if (permissions.isError) {
    return (
      <p role="alert">
        Your dashboard permissions could not be checked. Reload the page to try again.
      </p>
    );
  }

  const firstName = profile?.name?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Welcome back, ${firstName}` : "Welcome back";
  const subtitle =
    role.data === "admin"
      ? "Administrator dashboard — overview of store performance, orders, stock and operations."
      : "Staff dashboard — overview of shop orders, stock alerts and customer queue.";
  const canCreate = permissions.data.includes("orders.create");

  if (!canSeeReports) {
    return (
      <ReducedDashboard
        greeting={greeting}
        subtitle={subtitle}
        canCreate={canCreate}
        reason={{ kind: "revoked" }}
      />
    );
  }

  if (overview.isPending)
    return <p className="text-sm text-muted-foreground">Loading dashboard…</p>;
  if (overview.isError) {
    return (
      <ReducedDashboard
        greeting={greeting}
        subtitle={subtitle}
        canCreate={canCreate}
        reason={{ kind: "failed", retry: () => void overview.refetch() }}
      />
    );
  }

  const { orders, products, categories, recent_orders, activity } = overview.data;
  const t = trends.data;

  /* ------------------------------------------------------------- the queue */

  const queue = buildQueue({
    unreadMessages: unreadMessages.data ?? 0,
    awaitingPayment: orders.awaiting_payment,
    outOfStock: products.out_of_stock,
    lowStock: products.low_stock.length,
    samples: products.samples,
  });

  return (
    <div>
      <h2 className="page-title">{greeting}</h2>
      <p className="page-lead">{subtitle}</p>

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
        actions={<OrdersActions canCreate={canCreate} />}
      >
        <QueueList queue={queue} />
      </Panel>

      {/* Charts ---------------------------------------------------------- */}
      {/* One alert for the whole section: each chart reads the same query,
          and on failure four panels claiming to be "counting" forever would
          be the lie this dashboard exists to avoid. */}
      {trends.isError && (
        <p role="alert" className="mt-8 text-sm">
          This week's numbers could not load. Reload the page to try again.
        </p>
      )}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          className="lg:col-span-2"
          title="Last 14 days"
          description="Orders placed each day, with the takings those days brought in."
        >
          {t ? (
            <TillTape daily={t.daily} />
          ) : trends.isError ? null : (
            <p className="text-sm text-muted-foreground">Counting the till…</p>
          )}
        </Panel>

        <Panel title="Order pipeline" description="Where every order currently sits.">
          {t ? (
            <PipelineChart statuses={t.statuses} />
          ) : trends.isError ? null : (
            <p className="text-sm text-muted-foreground">Counting orders…</p>
          )}
        </Panel>

        <Panel title="Pickup or delivery" description="How customers are choosing to collect.">
          {t ? (
            <FulfilmentSplit fulfilment={t.fulfilment} />
          ) : trends.isError ? null : (
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
          ) : trends.isError ? null : (
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
            <OrderRows orders={recent_orders} />
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
            <StockWarningRows outOfStock={products.out_of_stock} lowStock={products.low_stock} />
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
