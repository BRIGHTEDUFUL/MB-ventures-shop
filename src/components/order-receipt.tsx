import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { money, type Receipt } from "@/lib/store";
import { Printer, CheckCircle2 } from "lucide-react";
export function OrderReceipt({ order: o }: { order: Receipt }) {
  const items = Array.isArray(o.items)
    ? (o.items as { name: string; quantity: number; price: number }[])
    : [];
  return (
    <section className="receipt">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="size-7" />
        <h2 className="text-2xl">Order {o.reference}</h2>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Received {new Date(o.created_at).toLocaleString()} ·{" "}
        {o.fulfillment === "pickup" ? "Abelenkpe pickup" : "Courier delivery"}
      </p>
      <div className="my-6 flex flex-wrap gap-3">
        <span className="rounded-full bg-secondary px-4 py-2 text-xs capitalize">
          Order: {o.status}
        </span>
        <span className="rounded-full bg-secondary px-4 py-2 text-xs capitalize">
          Payment: {o.payment_status}
        </span>
      </div>
      <p className="mb-6 text-sm">
        {o.payment_method === "momo"
          ? // Legacy in-app MoMo order — keep describing what actually happened.
            o.payment_status === "confirmed"
            ? "Your Mobile Money payment has been confirmed by staff."
            : "Your Mobile Money reference awaits manual staff confirmation."
          : o.payment_status === "confirmed"
            ? "Payment received. Thank you."
            : o.fulfillment === "pickup"
              ? "Pay at the shop when you collect your order."
              : "Pay cash when the courier arrives."}
        {o.fulfillment === "pickup"
          ? " Please wait until your order is ready before visiting the shop."
          : ""}
      </p>
      <table className="spec-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((l, i) => (
            <tr key={i}>
              <td>{l.name}</td>
              <td>{l.quantity}</td>
              <td>{money(l.price * l.quantity, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto mt-5 max-w-sm">
        <div className="summary-row">
          <span>Subtotal</span>
          <span>{money(o.subtotal, true)}</span>
        </div>
        <div className="summary-row">
          <span>Delivery</span>
          <span>{money(o.delivery_fee, true)}</span>
        </div>
        <div className="summary-row summary-total">
          <span>Total</span>
          <span>{money(o.total, true)}</span>
        </div>
      </div>
      {o.history && (
        <div className="mt-8">
          <h3 className="mb-4 text-xl">Order timeline</h3>
          {o.history.map((h, i) => (
            <div key={i} className="mb-3 border-l-2 border-border pl-4">
              <p className="text-sm font-semibold capitalize">{h.status}</p>
              <p className="text-xs text-muted-foreground">
                {h.note} · {new Date(h.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="no-print mt-8 flex gap-3">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer />
          Print receipt
        </Button>
        <Button asChild>
          <Link to="/track">Track order</Link>
        </Button>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        MB Ventures GH · Abelenkpe taxi rank, Accra, Ghana
      </p>
    </section>
  );
}
