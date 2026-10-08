import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../../convex/_generated/api";
import { money, pageHead } from "@/lib/store";
import { EmptyState, Panel, PaymentPill, Stat, StatusPill } from "@/components/staff/bits";

export const Route = createFileRoute("/staff/")({
  head: () =>
    pageHead("Dashboard", "Today's orders, takings, stock warnings and recent shop activity."),
  component: Dashboard,
});

function Dashboard() {
  const overview = useQuery({ ...convexQueryOptions(api.stats.overview, {}) });

  if (overview.isPending)
    return <p className="text-sm text-muted-foreground">Loading dashboard…</p>;
  if (overview.isError) {
    return <p role="alert">The dashboard could not load. Reload the page to try again.</p>;
  }

  const { orders, products, categories, recent_orders, activity } = overview.data;

  return (
    <div>
      <h2 className="page-title">Dashboard</h2>
      <p className="page-lead">Everything happening in the shop today.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Orders today"
          value={orders.today}
          sub={`${orders.active} open orders overall`}
        />
        <Stat
          label="Takings today"
          value={money(orders.today_revenue, true)}
          sub="Confirmed payments"
          tone="success"
        />
        <Stat
          label="Awaiting payment"
          value={orders.awaiting_payment}
          sub="Verify in the MoMo provider record"
          tone={orders.awaiting_payment > 0 ? "offer" : "plain"}
        />
        <Stat
          label="Products"
          value={products.total}
          sub={`${products.verified} verified · ${products.samples} samples`}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
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
                      className="flex items-center justify-between gap-3 py-3 hover:underline"
                    >
                      <span className="min-w-0">
                        <span className="block font-mono text-sm font-semibold">{o.reference}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {o.customer_name} ·{" "}
                          {o.fulfillment === "pickup" ? "Circle pickup" : o.address}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <StatusPill status={o.status} />
                        <PaymentPill payment={o.payment_status} />
                        <span className="text-sm font-semibold">{money(o.total)}</span>
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
                    <span className="shrink-0 font-semibold text-offer">{p.stock} left</span>
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
                  className={products.samples > 0 ? "font-semibold text-offer" : "font-semibold"}
                >
                  {products.samples}
                </span>
              </li>
              <li className="flex items-center justify-between py-3">
                <span>Verified, orderable listings</span>
                <span className="font-semibold text-success">{products.verified}</span>
              </li>
              <li className="flex items-center justify-between py-3">
                <span>Categories</span>
                <span className="font-semibold">
                  {categories.total}
                  {categories.hidden > 0 && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({categories.hidden} hidden)
                    </span>
                  )}
                </span>
              </li>
            </ul>
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
