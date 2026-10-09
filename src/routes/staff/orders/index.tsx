import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../../../convex/_generated/api";
import { money, pageHead, type Order } from "@/lib/store";
import { EmptyState, PaymentPill, QueryState, StatusPill } from "@/components/staff/bits";

export const Route = createFileRoute("/staff/orders/")({
  head: () => pageHead("Orders", "Verify payments, update order status and track every order."),
  component: OrdersList,
});

const STATUS_FILTERS: { value: Order["status"] | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "received", label: "Received" },
  { value: "processing", label: "Processing" },
  { value: "ready", label: "Ready (pickup)" },
  { value: "dispatched", label: "Dispatched (delivery)" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const PAYMENT_FILTERS: { value: Order["payment_status"] | ""; label: string }[] = [
  { value: "", label: "All payments" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "rejected", label: "Rejected" },
];

function OrdersList() {
  const [status, setStatus] = useState<Order["status"] | "">("");
  const [payment, setPayment] = useState<Order["payment_status"] | "">("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounced so typing doesn't fire a query per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const orders = useQuery({
    ...convexQueryOptions(api.orders.staffList, {
      ...(status !== "" ? { status } : {}),
      ...(payment !== "" ? { payment } : {}),
      ...(debouncedSearch !== "" ? { q: debouncedSearch } : {}),
    }),
  });

  return (
    <div>
      <h2 className="page-title">Orders</h2>
      <p className="page-lead">
        Verify Mobile Money against the provider's transaction record before confirming payment.
      </p>

      <div className="toolbar mt-6">
        <input
          aria-label="Search orders"
          placeholder="Search reference, customer, phone or MoMo reference"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filter by order status"
          value={status}
          onChange={(e) => setStatus(e.target.value as Order["status"] | "")}
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by payment status"
          value={payment}
          onChange={(e) => setPayment(e.target.value as Order["payment_status"] | "")}
        >
          {PAYMENT_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5">
        <QueryState pending={orders.isPending} error={orders.isError} label="Orders" />
        {orders.isPending ? null : orders.data?.length ? (
          <ul className="space-y-3">
            {orders.data.map((o) => (
              <li key={o.id}>
                <Link
                  to="/staff/orders/$id"
                  params={{ id: o.id }}
                  className="solid-panel flex flex-wrap items-center justify-between gap-3 transition-colors hover:border-primary/40"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-base font-semibold">{o.reference}</span>
                      <StatusPill status={o.status} />
                      <PaymentPill payment={o.payment_status} />
                    </span>
                    <span className="mt-1 block truncate text-sm text-muted-foreground">
                      {o.customer_name} · {o.phone} ·{" "}
                      {o.fulfillment === "pickup" ? "Abelenkpe pickup" : `${o.address} (${o.zone})`}{" "}
                      · {o.items.length} item{o.items.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold">{money(o.total, true)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString()}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No orders match these filters"
            hint="Clear the search or filters — or enjoy the quiet moment."
          />
        )}
      </div>
    </div>
  );
}
