import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useConvexMutation } from "@convex-dev/react-query";
import { ArrowLeft } from "lucide-react";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../../../convex/_generated/api";
import { errorMessage, money, pageHead, type Order } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel, PaymentPill, StatusPill } from "@/components/staff/bits";
import { images } from "@/lib/store-images";
import { toast } from "sonner";

export const Route = createFileRoute("/staff/orders/$id")({
  head: () => pageHead("Order", "Order details, payment verification and status timeline."),
  component: OrderDetail,
});

const statusOptions = (o: Order) =>
  [
    "received",
    "processing",
    ...(o.fulfillment === "pickup" ? ["ready"] : ["dispatched"]),
    "completed",
    "cancelled",
  ] as const;

function OrderDetail() {
  const { id } = Route.useParams();
  const detail = useQuery({ ...convexQueryOptions(api.orders.staffGet, { id }) });

  if (detail.isPending) return <p className="text-sm text-muted-foreground">Loading order…</p>;
  if (detail.isError) {
    return (
      <div>
        <BackLink />
        <p role="alert" className="mt-4">
          This order could not be loaded. It may have been removed.
        </p>
      </div>
    );
  }

  return <OrderView order={detail.data.order} history={detail.data.history} />;
}

function BackLink() {
  return (
    <Link
      to="/staff/orders"
      className="inline-flex items-center gap-1 text-sm text-link hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden />
      All orders
    </Link>
  );
}

function OrderView({
  order,
  history,
}: {
  order: Order;
  history: { status: string; note: string; actor_name: string; created_at: string }[];
}) {
  const closed = order.status === "completed" || order.status === "cancelled";
  const [status, setStatus] = useState<Order["status"]>(order.status);
  const [payment, setPayment] = useState<Order["payment_status"]>(order.payment_status);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customer, setCustomer] = useState({
    customer_name: order.customer_name,
    phone: order.phone,
    address: order.address,
  });

  // Re-sync the controls whenever the server state moves (e.g. another tab).
  useEffect(() => {
    setStatus(order.status);
    setPayment(order.payment_status);
  }, [order.status, order.payment_status]);

  const update = useConvexMutation(api.orders.staffUpdate);
  const addNote = useConvexMutation(api.orders.staffNote);
  const fixContact = useConvexMutation(api.orders.staffFixContact);

  const saveUpdate = async () => {
    if (
      payment === "confirmed" &&
      order.payment_status !== "confirmed" &&
      !window.confirm(
        order.payment_method === "momo"
          ? "Have you verified the transaction and amount in the provider record?"
          : "Has the courier confirmed cash collection?",
      )
    ) {
      return;
    }
    if (status === "cancelled" && order.status !== "cancelled") {
      if (!window.confirm("Cancel this order? Stock returns to the shelf and the order closes."))
        return;
    }
    setBusy(true);
    try {
      await update({
        id: order.id,
        status,
        payment,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setNote("");
      toast.success("Order updated");
    } catch (err) {
      toast.error(errorMessage(err, "Order could not be updated."));
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    setBusy(true);
    try {
      await addNote({ id: order.id, note });
      setNote("");
      toast.success("Note added");
    } catch (err) {
      toast.error(errorMessage(err, "Note could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const saveCustomer = async () => {
    setBusy(true);
    try {
      await fixContact({ id: order.id, ...customer });
      setEditingCustomer(false);
      toast.success("Customer details updated");
    } catch (err) {
      toast.error(errorMessage(err, "Customer details could not be updated."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <BackLink />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="page-title">{order.reference}</h2>
          <p className="text-sm text-muted-foreground">
            Placed {new Date(order.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={order.status} />
          <PaymentPill payment={order.payment_status} />
          <span className="text-xl font-semibold">{money(order.total, true)}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <Panel title="Items" description="Prices are the snapshots taken at checkout.">
            <ul className="divide-y divide-border">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  <img
                    src={images[item.image_key]}
                    alt=""
                    className="size-12 rounded-lg object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <Link
                      to="/product/$slug"
                      params={{ slug: item.id }}
                      className="block truncate font-medium hover:underline"
                    >
                      {item.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {money(item.price, true)} × {item.quantity}
                    </span>
                  </span>
                  <span className="font-semibold">{money(item.price * item.quantity, true)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-1.5 text-sm">
              <div className="summary-row">
                <span>Subtotal</span>
                <span>{money(order.subtotal, true)}</span>
              </div>
              <div className="summary-row">
                <span>Delivery fee</span>
                <span>{order.delivery_fee === 0 ? "Free" : money(order.delivery_fee, true)}</span>
              </div>
              <div className="summary-row font-semibold">
                <span>Total</span>
                <span>{money(order.total, true)}</span>
              </div>
            </div>
          </Panel>

          <Panel title="Timeline" description="Every status change and note, oldest first.">
            {history.length === 0 ? (
              <EmptyState title="No history yet" />
            ) : (
              <ol className="space-y-4">
                {history.map((entry, i) => (
                  <li key={i} className="relative border-l border-border pl-4">
                    <span
                      className={`absolute -left-1.5 top-1.5 size-3 rounded-full ${
                        entry.status === "cancelled"
                          ? "bg-destructive"
                          : entry.status === "completed"
                            ? "bg-success"
                            : "bg-primary"
                      }`}
                      aria-hidden
                    />
                    <p className="text-sm font-semibold capitalize">
                      {entry.status.replace("_", " ")}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </p>
                    <p className="text-sm">{entry.note}</p>
                    <p className="text-xs text-muted-foreground">{entry.actor_name}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="min-w-0">
          <Panel
            title="Update order"
            description={
              closed
                ? "This order is closed; its status can no longer change."
                : "Payment must be confirmed before processing a MoMo order."
            }
          >
            <div className="space-y-4">
              <label>
                Order status
                <select
                  value={status}
                  disabled={closed}
                  onChange={(e) => setStatus(e.target.value as Order["status"])}
                >
                  {statusOptions(order).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Payment status
                <select
                  value={payment}
                  onChange={(e) => setPayment(e.target.value as Order["payment_status"])}
                >
                  {["pending", "confirmed", "rejected"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Note (optional)
                <textarea
                  rows={2}
                  placeholder="e.g. Customer asked to deliver after 5pm"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={saveUpdate}>
                  {busy ? "Working…" : "Save update"}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || note.trim() === ""}
                  onClick={saveNote}
                  title="Add the note without changing any status"
                >
                  Add note only
                </Button>
              </div>
            </div>
          </Panel>

          <Panel
            title="Payment"
            description={
              order.payment_method === "momo"
                ? "Check the provider record before confirming."
                : "Cash on delivery — confirm after courier collection."
            }
          >
            <dl className="space-y-2 text-sm">
              <div className="summary-row">
                <dt>Method</dt>
                <dd className="capitalize">{order.payment_method}</dd>
              </div>
              {order.provider && (
                <div className="summary-row">
                  <dt>Provider</dt>
                  <dd>{order.provider}</dd>
                </div>
              )}
              <div className="summary-row">
                <dt>Reference</dt>
                <dd className="font-mono">{order.transaction_reference || "—"}</dd>
              </div>
              <div className="summary-row">
                <dt>Status</dt>
                <dd>
                  <PaymentPill payment={order.payment_status} />
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel
            title="Customer"
            actions={
              !editingCustomer && (
                <Button variant="outline" size="sm" onClick={() => setEditingCustomer(true)}>
                  Edit
                </Button>
              )
            }
          >
            {editingCustomer ? (
              <div className="space-y-3">
                <label>
                  Name
                  <input
                    value={customer.customer_name}
                    onChange={(e) => setCustomer({ ...customer, customer_name: e.target.value })}
                  />
                </label>
                <label>
                  Phone
                  <input
                    type="tel"
                    value={customer.phone}
                    onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                  />
                </label>
                <label>
                  Address
                  <input
                    value={customer.address}
                    onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                    placeholder={order.fulfillment === "pickup" ? "Not needed for pickup" : ""}
                  />
                </label>
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy} onClick={saveCustomer}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCustomer({
                        customer_name: order.customer_name,
                        phone: order.phone,
                        address: order.address,
                      });
                      setEditingCustomer(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Correcting contact details keeps guest tracking working. Prices and items cannot
                  be edited after checkout.
                </p>
              </div>
            ) : (
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Name</dt>
                  <dd className="font-medium">{order.customer_name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Phone</dt>
                  <dd className="font-mono">{order.phone}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Email</dt>
                  <dd className="break-all">{order.email}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {order.fulfillment === "pickup" ? "Pickup" : "Delivery"}
                  </dt>
                  <dd>
                    {order.fulfillment === "pickup" ? (
                      "Circle pickup"
                    ) : (
                      <>
                        {order.address}
                        <span className="ml-1 text-muted-foreground">({order.zone})</span>
                      </>
                    )}
                  </dd>
                </div>
              </dl>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
