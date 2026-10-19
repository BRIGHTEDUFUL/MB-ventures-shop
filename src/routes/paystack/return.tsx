import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useConvexAction } from "@convex-dev/react-query";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { useCart } from "@/components/store-provider";
import { Button } from "@/components/ui/button";
import { errorMessage, money, pageHead, type Receipt } from "@/lib/store";

export const Route = createFileRoute("/paystack/return")({
  validateSearch: (s: Record<string, unknown>): { reference: string } => ({
    // Paystack appends ?reference=… to the callback URL. `ref` is accepted
    // too, so the page can be driven by hand (or in tests) with either name.
    reference:
      typeof s["reference"] === "string"
        ? s["reference"]
        : typeof s["ref"] === "string"
          ? s["ref"]
          : "",
  }),
  head: () => pageHead("Payment", "Confirming your Paystack payment for MB Ventures GH."),
  component: PaystackReturn,
});

/**
 * Where Paystack sends the shopper back to. The browser never decides the
 * outcome itself — it asks `payments.verify`, which re-checks the charge
 * against the order's locked amount on the server. The page polls a few
 * times because MoMo and some cards settle a few seconds after the redirect;
 * the webhook finishes the job even if this page is closed.
 */
function PaystackReturn() {
  const { reference } = Route.useSearch(),
    cart = useCart(),
    navigate = useNavigate(),
    verify = useConvexAction(api.payments.verify);
  const [state, setState] = useState<
      "checking" | "paid" | "pending" | "failed" | "cancelled" | "error"
    >("checking"),
    [message, setMessage] = useState(""),
    [total, setTotal] = useState<number | null>(null),
    // Bumped by "Check again": each bump restarts the verification effect.
    [nonce, setNonce] = useState(0);
  const receipt = useRef<Receipt | null>(null);

  useEffect(() => {
    if (reference.trim() === "") {
      setState("error");
      setMessage("This payment page was opened without an order reference.");
      return;
    }
    let alive = true;
    setState("checking");
    setMessage("");
    (async () => {
      // Four gentle retries over ~15s before admitting it is still settling.
      for (let attempt = 0; attempt <= 4; attempt++) {
        let result: Awaited<ReturnType<typeof verify>>;
        try {
          result = await verify({ reference });
        } catch (e) {
          if (!alive) return;
          setState("error");
          setMessage(errorMessage(e, "We could not confirm your payment. Please try again."));
          return;
        }
        if (!alive) return;
        if (result.state === "paid") {
          receipt.current = result.receipt?.receipt ?? null;
          setTotal(result.receipt?.total ?? null);
          setState("paid");
          return;
        }
        if (result.state === "cancelled") {
          setState("cancelled");
          return;
        }
        if (result.state === "failed") {
          setState("failed");
          setMessage("The payment did not go through. You have not been charged.");
          return;
        }
        if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 3500));
        if (!alive) return;
      }
      setState("pending");
    })();
    return () => {
      alive = false;
    };
  }, [reference, nonce, verify]);

  // Paid: clear the cart (the order owns those items now) and hand the shopper
  // to the same receipt page a cash checkout lands on.
  useEffect(() => {
    if (state !== "paid") return;
    if (receipt.current !== null) {
      sessionStorage.setItem("mb-receipt", JSON.stringify(receipt.current));
    }
    cart.clear();
    const id = setTimeout(
      () => navigate({ to: "/confirmation", search: { ref: reference } }),
      1500,
    );
    return () => clearTimeout(id);
  }, [state, reference, cart, navigate]);

  return (
    <div className="page-content wrap">
      {state === "checking" && (
        <>
          <h1 className="page-title">Confirming your payment…</h1>
          <p className="page-lead">
            Please wait while we verify order {reference.trim().toUpperCase()} with Paystack. This
            takes a few seconds — do not close this page.
          </p>
        </>
      )}
      {state === "paid" && (
        <>
          <h1 className="page-title">Payment confirmed — thank you!</h1>
          <p className="page-lead">
            Order {reference.trim().toUpperCase()}
            {total !== null ? ` · ${money(total, true)}` : ""} is confirmed. Taking you to your
            receipt…
          </p>
        </>
      )}
      {state === "pending" && (
        <>
          <h1 className="page-title">We have not received your payment yet</h1>
          <p className="page-lead">
            Your order {reference.trim().toUpperCase()} is still reserved while the payment settles.
            If you completed payment on Paystack, give it a moment and check again.
          </p>
          <div className="mt-8 flex gap-3">
            <Button onClick={() => setNonce((n) => n + 1)}>Check again</Button>
            <Button variant="outline" asChild>
              <Link to="/checkout">Back to checkout</Link>
            </Button>
          </div>
        </>
      )}
      {state === "failed" && (
        <>
          <h1 className="page-title">The payment did not go through</h1>
          <p className="page-lead">{message}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your order {reference.trim().toUpperCase()} is still reserved for a while — you can try
            paying again from checkout, or choose to pay on delivery instead.
          </p>
          <div className="mt-8 flex gap-3">
            <Button asChild>
              <Link to="/checkout">Try payment again</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/cart">Back to cart</Link>
            </Button>
          </div>
        </>
      )}
      {state === "cancelled" && (
        <>
          <h1 className="page-title">This order was cancelled</h1>
          <p className="page-lead">
            Order {reference.trim().toUpperCase()} is no longer waiting for payment — the reserved
            items went back to the shop. You are welcome to order again.
          </p>
          <div className="mt-8">
            <Button asChild>
              <Link to="/catalogue" search={{ category: "", q: "" }}>
                Back to the catalogue
              </Link>
            </Button>
          </div>
        </>
      )}
      {state === "error" && (
        <>
          <h1 className="page-title">Payment confirmation hit a snag</h1>
          <p className="page-lead">{message}</p>
          <div className="mt-8 flex gap-3">
            <Button onClick={() => setNonce((n) => n + 1)}>Check again</Button>
            <Button variant="outline" asChild>
              <Link to="/checkout">Back to checkout</Link>
            </Button>
          </div>
        </>
      )}
      {/* Only rendered for a beat before the redirect, but keeps the receipt
          in the same sessionStorage slot /confirmation already reads. */}
      {state === "paid" && receipt.current !== null && (
        <p className="mt-6 text-sm text-muted-foreground">
          A confirmation email is on its way to your inbox.
        </p>
      )}
    </div>
  );
}
