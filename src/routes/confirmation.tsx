import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { OrderReceipt } from "@/components/order-receipt";
import { type Receipt, pageHead } from "@/lib/store";
export const Route = createFileRoute("/confirmation")({
  validateSearch: (s: Record<string, unknown>) => ({
    ref: typeof s["ref"] === "string" ? s["ref"] : "",
  }),
  head: () => pageHead("Order received", "Your MB Ventures GH order receipt."),
  component: Confirmation,
});
function Confirmation() {
  const { ref } = Route.useSearch(),
    [order, setOrder] = useState<Receipt | null>(null);
  useEffect(() => {
    try {
      const o = JSON.parse(sessionStorage.getItem("mb-receipt") || "null");
      if (o?.reference === ref) setOrder(o);
    } catch {
      /* no stored receipt */
    }
  }, [ref]);
  return (
    <div className="page-content wrap">
      <h1 className="page-title">Thank you for your order.</h1>
      <p className="page-lead mb-8">
        Keep your reference handy. Our Circle shop team will handle the next steps.
      </p>
      {order ? (
        <OrderReceipt order={order} />
      ) : (
        <p className="mt-8">
          To securely retrieve your receipt,{" "}
          <Link className="underline" to="/track">
            enter your reference and phone number
          </Link>
          .
        </p>
      )}
    </div>
  );
}
