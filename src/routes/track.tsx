import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useConvex } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { OrderReceipt } from "@/components/order-receipt";
import { type Receipt, pageHead, errorMessage } from "@/lib/store";
export const Route = createFileRoute("/track")({
  head: () =>
    pageHead(
      "Track your order",
      "Find your receipt and order status with your reference and phone number.",
    ),
  component: Track,
});
function Track() {
  const [ref, setRef] = useState(""),
    [phone, setPhone] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [order, setOrder] = useState<Receipt | null>(null);
  const convex = useConvex();
  return (
    <div className="page-content wrap">
      <h1 className="page-title">Track your order</h1>
      <p className="page-lead">Use the reference and phone number you entered at checkout.</p>
      <form
        className="my-8 max-w-lg space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setOrder(null);
          try {
            const data = await convex.query(api.orders.track, { ref, customer_phone: phone });
            if (!data) setError("No matching order found. Check your reference and phone number.");
            else setOrder(data);
          } catch (err) {
            setError(
              errorMessage(err, "No matching order found. Check your reference and phone number."),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Order reference
          <input required placeholder="MB-…" value={ref} onChange={(e) => setRef(e.target.value)} />
        </label>
        <label>
          Phone number
          <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <Button disabled={busy}>{busy ? "Looking up…" : "Find order"}</Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
      {order && <OrderReceipt order={order} />}
    </div>
  );
}
