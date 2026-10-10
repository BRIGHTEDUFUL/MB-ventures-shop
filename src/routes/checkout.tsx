import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/store-provider";
import {
  storeQuery,
  pageHead,
  money,
  delivery,
  zones,
  errorMessage,
  type CheckoutForm,
} from "@/lib/store";
import { useSession } from "@/lib/use-session";
import { images } from "@/lib/store-images";

export const Route = createFileRoute("/checkout")({
  head: () =>
    pageHead(
      "Checkout",
      "Delivery across Ghana or pickup at Abelenkpe. Order now, pay when you collect or when your order arrives.",
    ),
  component: Checkout,
});

function Checkout() {
  const cart = useCart(),
    { data } = useQuery(storeQuery),
    navigate = useNavigate();
  const { session, loading, profile } = useSession(),
    placeOrder = useConvexMutation(api.orders.place);
  const [step, setStep] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [form, setForm] = useState<CheckoutForm>({
      customer_name: "",
      phone: "",
      email: "",
      address: "",
      fulfillment: "delivery",
      zone: "central",
    });
  const set = (key: keyof CheckoutForm, value: string) =>
    setForm((f) => ({ ...f, [key]: value }) as CheckoutForm);

  // Prefill contact details from the account profile (only where empty).
  useEffect(() => {
    if (profile)
      setForm((f) => ({
        ...f,
        customer_name: f.customer_name || profile.name,
        phone: f.phone || profile.phone,
        email: f.email || profile.email,
      }));
  }, [profile]);
  // Placing an order requires an account; the cart lives in localStorage, so
  // nothing is lost on the way to /account and back.
  useEffect(() => {
    if (!loading && !session) navigate({ to: "/account", search: { next: "/checkout" } });
  }, [loading, session, navigate]);

  if (loading || !data) return <div className="page-content wrap">Loading checkout…</div>;
  if (!session) return <div className="page-content wrap">Taking you to sign in…</div>;
  const fee = delivery(data.settings, form.zone, cart.subtotal, form.fulfillment === "pickup"),
    total = cart.subtotal + fee;
  const unavailable = cart.lines.some((l) => {
    const p = data.products.find((p) => p.id === l.product.id);
    return !p?.verified || p.stock < l.quantity;
  });
  const canOrder = data.settings.ordering_enabled && !unavailable;
  const place = async () => {
    setBusy(true);
    setError("");
    try {
      const order = await placeOrder({
        ...form,
        items: cart.lines.map((l) => ({ id: l.product.id, quantity: l.quantity })),
      });
      sessionStorage.setItem("mb-receipt", JSON.stringify(order));
      cart.clear();
      navigate({ to: "/confirmation", search: { ref: order.reference } });
    } catch (e) {
      setError(errorMessage(e, "Order could not be placed. Please try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-content wrap">
      <p className="breadcrumbs">
        <Link to="/cart">Cart</Link> / Checkout
      </p>
      <h1 className="page-title">Checkout</h1>
      {!cart.lines.length ? (
        <>
          <p>Your cart is empty.</p>
          <Button asChild className="mt-5">
            <Link to="/catalogue" search={{ category: "", q: "" }}>
              Start shopping
            </Link>
          </Button>
        </>
      ) : (
        <>
          <div className="checkout-steps">
            {["Your details", "Review & place order"].map((label, i) => (
              <span key={label} className={step === i + 1 ? "active" : ""}>
                {i + 1}. {label}
              </span>
            ))}
          </div>
          <div className="two-column">
            <div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setError("");
                  if (step < 2) setStep(step + 1);
                  else place();
                }}
              >
                <h2 className="mb-6 text-2xl">
                  {step === 1 ? "Where should your order go?" : "Check your order"}
                </h2>
                {step === 1 && (
                  <>
                    <div className="form-grid">
                      <label>
                        Full name
                        <input
                          required
                          minLength={2}
                          autoComplete="name"
                          value={form.customer_name}
                          onChange={(e) => set("customer_name", e.target.value)}
                        />
                      </label>
                      {!profile?.phone && (
                        <label>
                          Phone number
                          <input
                            required
                            type="tel"
                            minLength={9}
                            autoComplete="tel"
                            placeholder="024 123 4567"
                            value={form.phone}
                            onChange={(e) => set("phone", e.target.value)}
                          />
                        </label>
                      )}
                      <label className="full">
                        Email
                        <input
                          required
                          type="email"
                          autoComplete="email"
                          value={form.email}
                          onChange={(e) => set("email", e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="mt-7 grid gap-3 sm:grid-cols-2">
                      {[
                        {
                          id: "delivery" as const,
                          title: "Courier delivery",
                          text: "To your address in Ghana · Pay cash on arrival",
                        },
                        {
                          id: "pickup" as const,
                          title: "Abelenkpe in-store pickup",
                          text: "Collection only · Pay at the shop",
                        },
                      ].map((o) => (
                        <label className="solid-panel cursor-pointer" key={o.id}>
                          <input
                            type="radio"
                            className="!mr-2 !w-auto !min-h-0"
                            name="fulfillment"
                            checked={form.fulfillment === o.id}
                            onChange={() => set("fulfillment", o.id)}
                          />
                          {o.title}
                          <p className="mt-2 text-xs text-muted-foreground">{o.text}</p>
                        </label>
                      ))}
                    </div>
                    {form.fulfillment === "delivery" ? (
                      <div className="form-grid mt-6">
                        <label className="full">
                          Delivery area
                          <select value={form.zone} onChange={(e) => set("zone", e.target.value)}>
                            {zones.map((z) => (
                              <option key={z.id} value={z.id}>
                                {z.name} — {z.time}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="full">
                          Street address & landmark
                          <textarea
                            required
                            minLength={5}
                            autoComplete="street-address"
                            value={form.address}
                            onChange={(e) => set("address", e.target.value)}
                            placeholder="House number, street, town and nearby landmark"
                          />
                        </label>
                      </div>
                    ) : (
                      <p className="mt-6 text-sm text-muted-foreground">
                        {data.settings.address}. {data.settings.hours}. Wait for your order to be
                        marked ready, then collect it and pay at the counter.
                      </p>
                    )}
                  </>
                )}
                {step === 2 && (
                  <div className="space-y-6">
                    <div className="solid-panel">
                      <h3>Your details</h3>
                      <p className="mt-3 text-sm">
                        {form.customer_name} — {form.phone}
                        <br />
                        {form.email}
                        <br />
                        {form.fulfillment === "pickup"
                          ? `Collect at ${data.settings.address}`
                          : form.address}
                      </p>
                    </div>
                    <div className="solid-panel">
                      <h3>Payment</h3>
                      <p className="mt-3 text-sm">
                        {form.fulfillment === "pickup"
                          ? "Pay at the shop when you collect your order."
                          : "Pay cash to the courier when your order arrives."}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        No payment is taken online. Have the exact amount ready where possible.
                      </p>
                    </div>
                    <label className="filter-line">
                      <input required type="checkbox" />I agree to the{" "}
                      <Link to="/$page" params={{ page: "terms" }} className="underline">
                        order terms
                      </Link>
                      .
                    </label>
                  </div>
                )}
                {error && (
                  <p className="mt-5 text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <div className="mt-8 flex gap-3">
                  {step > 1 && (
                    <Button variant="outline" type="button" onClick={() => setStep(step - 1)}>
                      Back
                    </Button>
                  )}
                  <Button type="submit" disabled={busy || (step === 2 && !canOrder)}>
                    {busy
                      ? "Placing order…"
                      : step < 2
                        ? "Continue"
                        : canOrder
                          ? "Place order"
                          : "Ordering not open yet"}
                  </Button>
                </div>
              </form>
            </div>
            <aside className="solid-panel h-fit">
              <h2 className="mb-5 text-xl">Your order</h2>
              {cart.lines.map((l) => (
                <div key={l.product.id} className="mb-4 flex items-center gap-3">
                  <img
                    src={images[l.product.image_key]}
                    alt={l.product.name}
                    className="size-12 object-contain"
                  />
                  <div className="flex-1 text-xs">
                    {l.product.name}
                    <p className="text-muted-foreground">Qty {l.quantity}</p>
                  </div>
                  <span className="text-xs">{money(l.product.price * l.quantity, true)}</span>
                </div>
              ))}
              <div className="summary-row">
                <span>Subtotal</span>
                <span>{money(cart.subtotal, true)}</span>
              </div>
              <div className="summary-row">
                <span>{form.fulfillment === "pickup" ? "Abelenkpe pickup" : "Delivery"}</span>
                <span>{fee ? money(fee, true) : "Free"}</span>
              </div>
              <div className="summary-row summary-total">
                <span>Total</span>
                <span>{money(total, true)}</span>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                {form.fulfillment === "pickup"
                  ? "Pay at the shop when you collect your order."
                  : "Pay cash when your order arrives."}{" "}
                Prices are rechecked by the store when your order is placed.
              </p>
              {!canOrder && (
                <p className="mt-4 rounded-lg bg-secondary p-3 text-xs">
                  Orders are temporarily closed. Contact the Abelenkpe shop or check back soon.
                </p>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
