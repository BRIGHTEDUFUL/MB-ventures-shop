import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { convexQuery, useConvexAction, useConvexMutation } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/store-provider";
import { lineKey } from "@/lib/cart";
import { storeQuery, pageHead, money, zones, errorMessage, type CheckoutForm } from "@/lib/store";
import { useSession } from "@/lib/use-session";
import { images } from "@/lib/store-images";
import { offlinePaymentProblem } from "../../convex/lib/rules";

export const Route = createFileRoute("/checkout")({
  head: () =>
    pageHead(
      "Checkout",
      "Delivery across Ghana or pickup at Abelenkpe. Order now, pay when you collect or when your order arrives.",
    ),
  component: Checkout,
});

/** Draft survives an auth blip remounting the form — same idea as the cart. */
const DRAFT_KEY = "mb-checkout-draft";

const EMPTY_FORM: CheckoutForm = {
  customer_name: "",
  phone: "",
  email: "",
  address: "",
  fulfillment: "delivery",
  zone: "central",
  payment: "offline",
};

/** The persisted draft (`{ step, ...form }`), or null when absent/unreadable. */
function readDraft(): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function Checkout() {
  const cart = useCart(),
    { data } = useQuery(storeQuery),
    navigate = useNavigate();
  const { session, loading, profile } = useSession(),
    placeOrder = useConvexMutation(api.orders.place),
    startPayment = useConvexAction(api.payments.initialize);
  // Right after sign-up Convex Auth can resolve to "signed out" for a beat,
  // which bounces checkout through /account and back — remounting this
  // component with fresh state. The draft keeps both the step and the fields
  // intact so the shopper lands exactly where they were.
  const [draft] = useState<Record<string, unknown>>(() => readDraft() ?? {}),
    [step, setStep] = useState(() => (draft["step"] === 2 ? 2 : 1)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    // True from the moment an order lands — see the empty-cart effect below.
    [placed, setPlaced] = useState(false),
    // The reference of an already-placed online order. Kept so a payment that
    // fails to open can be retried without placing a second order.
    [payRef, setPayRef] = useState<string | null>(null),
    [form, setForm] = useState<CheckoutForm>(() => {
      const fields = { ...draft };
      delete fields["step"];
      return { ...EMPTY_FORM, ...fields } as CheckoutForm;
    });
  const set = (key: keyof CheckoutForm, value: string) =>
    setForm((f) => ({ ...f, [key]: value }) as CheckoutForm);

  // Nationwide delivery cannot be cash-on-arrival: long-haul couriers carry
  // the goods far from the shop, so the shared rule (also enforced
  // authoritatively inside orders.place) requires online payment. The
  // offline choice is withdrawn below and the selection moves to "online"
  // the moment the combination becomes prepay-only.
  const prepayOnly =
    form.fulfillment === "delivery" &&
    offlinePaymentProblem(form.zone, form.fulfillment, "offline") !== null;
  useEffect(() => {
    if (prepayOnly) setForm((f) => (f.payment === "online" ? f : { ...f, payment: "online" }));
  }, [prepayOnly]);

  // Persist every keystroke and step change so a transient auth reconnect
  // (which briefly swaps in the loading placeholder) cannot lose progress.
  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, ...form }));
  }, [step, form]);

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
  // nothing is lost on the way to /account and back. Once the stored cart has
  // been restored (`ready`), an empty one has nothing to check out — send it to
  // /cart, which shows the empty state and the way back to the catalogue. The
  // one-second grace keeps a momentary post-sign-up auth flip from bouncing
  // the shopper: a genuine sign-out still redirects, just a beat later.
  // `placed` steps out of the way once an order is through: clearing the cart
  // makes it empty, and this effect would otherwise race the jump to the
  // receipt with a jump to /cart — the order lands, but the shopper never
  // sees the reference that proves it.
  useEffect(() => {
    if (placed) return;
    if (cart.ready && cart.lines.length === 0) {
      navigate({ to: "/cart" });
      return;
    }
    if (loading || session) return;
    const id = setTimeout(() => navigate({ to: "/account", search: { next: "/checkout" } }), 1_000);
    return () => clearTimeout(id);
  }, [placed, cart.ready, cart.lines.length, loading, session, navigate]);

  if (loading || !data) return <div className="page-content wrap">Loading checkout…</div>;
  if (!session) return <div className="page-content wrap">Taking you to sign in…</div>;
  // Prices and stock are reconciled against the live catalogue exactly like
  // the cart drawer does (CartLines): the option is looked up by its key on
  // the live product, falling back to the cart's snapshot while data loads.
  // The browser still shows estimates only — the server recomputes every
  // number authoritatively when the order is placed.
  const lines = cart.lines.map((l) => {
    const live = data.products.find((p) => p.id === l.product.id);
    const liveVariant = l.variant
      ? live?.variants?.find((v) => v.key === l.variant!.key)
      : undefined;
    return {
      line: l,
      live,
      price:
        (l.variant ? (liveVariant?.price ?? l.variant.price) : null) ??
        live?.price ??
        l.product.price,
      stock: l.variant ? (liveVariant?.stock ?? l.variant.stock) : (live?.stock ?? l.product.stock),
    };
  });
  // The shop never charges delivery: riders collect their fee straight from
  // the customer, so the order total is the subtotal and no fee number is
  // ever shown.
  const subtotal = lines.reduce((sum, { line, price }) => sum + price * line.quantity, 0);
  const total = subtotal;
  // One reason per offending line — a sample product cannot be ordered at
  // all, a short shelf only needs a smaller quantity. Same wording family as
  // the cart drawer's "Only N left". (A missing product is also a sample —
  // there is nothing verified behind it to sell.)
  const issues = lines.flatMap(({ line: l, live, stock }) => {
    const label = l.variant ? `${l.product.name} (${l.variant.name})` : l.product.name;
    const issue = (reason: string) => [{ key: lineKey(l), label, reason }];
    if (!live || !live.verified) return issue("Sample item — not orderable yet");
    if (stock === 0) return issue("Out of stock");
    if (stock < l.quantity) return issue(`Only ${stock} left`);
    return [];
  });
  const canOrder = data.settings.ordering_enabled && issues.length === 0;
  /**
   * Hand an already-placed online order to Paystack. Split out from `place`
   * so a gateway failure is never reported as an order failure: the order
   * EXISTS at this point (its stock is held), and `payRef` lets the retry
   * re-open the same reference instead of placing a second order.
   */
  const pay = async (reference: string) => {
    setBusy(true);
    setError("");
    try {
      // The cart stays intact until the payment is verified on the way back
      // (/paystack/return), so an abandoned gateway page never loses work.
      const { authorization_url } = await startPayment({ reference });
      window.location.assign(authorization_url);
    } catch (e) {
      setError(
        errorMessage(
          e,
          "Your order is saved, but the payment page could not open. Please try the payment again or contact the shop.",
        ),
      );
      setBusy(false);
    }
  };
  const place = async () => {
    setBusy(true);
    setError("");
    let order: Awaited<ReturnType<typeof placeOrder>>;
    try {
      order = await placeOrder({
        ...form,
        // The browser sends identities only — product, option, quantity. The
        // price, the stock check and the label are all recomputed server-side.
        items: cart.lines.map((l) => ({
          id: l.product.id,
          quantity: l.quantity,
          ...(l.variant ? { variant_key: l.variant.key } : {}),
        })),
      });
    } catch (e) {
      setError(errorMessage(e, "Order could not be placed. Please try again."));
      setBusy(false);
      return;
    }
    if (form.payment === "online") {
      // The order and its stock hold already exist; now open the payment
      // page. Failures here are handled by `pay` with the honest message.
      setPayRef(order.reference);
      await pay(order.reference);
      return;
    }
    sessionStorage.setItem("mb-receipt", JSON.stringify(order));
    sessionStorage.removeItem(DRAFT_KEY);
    // Flag before clearing: the emptied cart must not bounce the shopper to
    // /cart on the very render that should carry them to the receipt.
    setPlaced(true);
    cart.clear();
    navigate({ to: "/confirmation", search: { ref: order.reference } });
  };
  return (
    <div className="page-content wrap">
      <p className="breadcrumbs">
        <Link to="/" className="flex min-h-10 items-center px-1.5 -mx-1.5">
          Home
        </Link>
        <span>/</span>
        <Link to="/cart" className="flex min-h-10 items-center px-1.5 -mx-1.5">
          Cart
        </Link>
        <span>/</span>
        <span>Checkout</span>
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
                  // An order already exists behind `payRef` — retry its
                  // payment rather than placing a second order.
                  else if (form.payment === "online" && payRef !== null) void pay(payRef);
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
                      {data.settings.paystack_enabled ? (
                        // Online payments are on: the shopper picks how to pay.
                        // The whole choice disappears when the switch is off,
                        // which keeps the pay-later flow byte-for-byte intact.
                        <div className="mt-3 space-y-2">
                          {[
                            {
                              id: "online" as const,
                              title: "Pay online now",
                              text: "Card, Mobile Money or bank transfer — secured by Paystack. Your order is confirmed the moment payment completes.",
                            },
                            // Cash-on-arrival is withdrawn for nationwide
                            // delivery — the courier network outside Accra
                            // cannot collect, so this order is prepaid.
                            ...(prepayOnly
                              ? []
                              : [
                                  {
                                    id: "offline" as const,
                                    title:
                                      form.fulfillment === "pickup"
                                        ? "Pay at the shop"
                                        : "Pay on delivery",
                                    text:
                                      form.fulfillment === "pickup"
                                        ? "Pay cash at the counter when you collect your order."
                                        : "Pay cash to the courier when your order arrives.",
                                  },
                                ]),
                          ].map((o) => (
                            <label className="solid-panel cursor-pointer" key={o.id}>
                              <input
                                type="radio"
                                className="!mr-2 !w-auto !min-h-0"
                                name="payment"
                                checked={form.payment === o.id}
                                onChange={() => set("payment", o.id)}
                              />
                              {o.title}
                              <p className="mt-2 text-xs text-muted-foreground">{o.text}</p>
                            </label>
                          ))}
                          {form.payment === "online" && (
                            <p className="text-xs text-muted-foreground">
                              You will be taken to Paystack's secure checkout page. Your items stay
                              reserved while you pay.
                            </p>
                          )}
                          {prepayOnly && (
                            <p className="text-xs text-muted-foreground">
                              Deliveries outside Accra are prepaid: our courier partners carry your
                              order to you, so cash cannot change hands on arrival. Within Greater
                              Accra you can still pay on delivery or at the shop.
                            </p>
                          )}
                        </div>
                      ) : (
                        <>
                          <p className="mt-3 text-sm">
                            {prepayOnly
                              ? "Orders delivered outside Accra are paid online by card, Mobile Money or bank transfer."
                              : form.fulfillment === "pickup"
                                ? "Pay at the shop when you collect your order."
                                : "Pay cash to the courier when your order arrives."}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {prepayOnly
                              ? "Online payment is being switched on — please call the shop to place this order, or choose a Greater Accra address."
                              : "No payment is taken online. Have the exact amount ready where possible."}
                          </p>
                        </>
                      )}
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
                      ? form.payment === "online" && step === 2
                        ? "Taking you to Paystack…"
                        : "Placing order…"
                      : step < 2
                        ? "Continue"
                        : !canOrder
                          ? data.settings.ordering_enabled
                            ? "Fix your cart to order"
                            : "Ordering not open yet"
                          : form.payment === "online"
                            ? payRef !== null
                              ? "Try payment again"
                              : `Pay ${money(total, true)} online`
                            : "Place order"}
                  </Button>
                </div>
              </form>
            </div>
            <aside className="solid-panel h-fit">
              <h2 className="mb-5 text-xl">Your order</h2>
              {lines.map(({ line: l, price }) => (
                // The line key, not the product id: Black and White are two
                // rows, and React would collapse them onto one otherwise.
                <div key={lineKey(l)} className="mb-4 flex items-center gap-3">
                  <img
                    src={images[l.variant?.image_key ?? l.product.image_key]}
                    alt={l.product.name}
                    className="size-12 object-contain"
                  />
                  <div className="flex-1 text-xs">
                    {l.product.name}
                    {l.variant && <p className="text-muted-foreground">{l.variant.name}</p>}
                    <p className="text-muted-foreground">Qty {l.quantity}</p>
                  </div>
                  <span className="text-xs">{money(price * l.quantity, true)}</span>
                </div>
              ))}
              <div className="summary-row">
                <span>Subtotal</span>
                <span>{money(subtotal, true)}</span>
              </div>
              {form.fulfillment === "delivery" ? (
                // No number here on purpose: riders charge the customer
                // directly, so the shop has no fee to quote.
                <p className="my-4 text-xs text-muted-foreground">
                  Delivery fee is paid directly to your rider.
                </p>
              ) : null}
              <div className="summary-row summary-total">
                <span>Total</span>
                <span>{money(total, true)}</span>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                {data.settings.paystack_enabled && form.payment === "online"
                  ? "Pay online — your order is reserved the moment you place it, and confirmed as soon as payment completes."
                  : `${form.fulfillment === "pickup" ? "Pay at the shop when you collect your order." : "Pay cash when your order arrives."} `}{" "}
                Prices are rechecked by the store when your order is placed.
              </p>
              {/* "Temporarily closed" is only honest when the ordering switch
                  is off — a sample item or a short shelf is a cart problem,
                  not a closed shop, and gets its own per-line list below. */}
              {!data.settings.ordering_enabled && (
                <p className="notice mt-4">
                  Orders are temporarily closed. Contact the Abelenkpe shop or check back soon.
                </p>
              )}
              {issues.length > 0 && (
                <div className="mt-4 rounded-xl border border-offer/40 bg-offer/10 p-4 text-sm">
                  <p className="font-semibold">Fix these before ordering:</p>
                  <ul className="mt-2 space-y-1">
                    {issues.map((i) => (
                      <li key={i.key}>
                        {i.label} — <span className="text-offer">{i.reason}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/cart"
                    className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-link underline"
                  >
                    Adjust your cart
                  </Link>
                </div>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
