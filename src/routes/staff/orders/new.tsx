import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useConvexMutation } from "@convex-dev/react-query";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../../../convex/_generated/api";
import { PERMISSION_CATALOG } from "../../../../convex/lib/permission_catalog";
import { findVariantByOptions } from "../../../../convex/lib/variants";
import { errorMessage, money, pageHead, storeQuery, zones } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { FormActions, Panel } from "@/components/staff/bits";
import { VariantPicker } from "@/components/variant-picker";
import { images } from "@/lib/store-images";
import { toast } from "sonner";

export const Route = createFileRoute("/staff/orders/new")({
  head: () =>
    pageHead(
      "Record an order",
      "Take a WhatsApp, phone or walk-in order: customer, items, delivery, payment.",
    ),
  component: NewOrder,
});

type Channel = "walk_in" | "whatsapp" | "phone";
type Fulfillment = "pickup" | "delivery";
type Zone = "central" | "greater" | "nationwide";
type PaymentMethod = "pay_at_store" | "cod" | "momo";

/** One chosen line. Prices are snapshots the *server* will take; this is for the running estimate only. */
type Line = {
  id: string;
  name: string;
  image_key: string;
  price: number;
  quantity: number;
  variant_key?: string;
  variant_name?: string;
};

const CHANNELS: { value: Channel; label: string; hint: string }[] = [
  { value: "walk_in", label: "Walk-in", hint: "Customer is in the shop" },
  { value: "whatsapp", label: "WhatsApp", hint: "Order came by chat" },
  { value: "phone", label: "Phone", hint: "Order came by call" },
];

const lineKey = (id: string, variantKey?: string) => `${id}::${variantKey ?? ""}`;

function NewOrder() {
  const navigate = useNavigate();
  const permissions = useQuery({ ...convexQueryOptions(api.users.myPermissions, {}) });
  const store = useQuery(storeQuery);
  const create = useConvexMutation(api.orders.staffCreate);

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<Channel>("walk_in");
  const [note, setNote] = useState("");
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [zone, setZone] = useState<Zone>("central");
  const [address, setAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pay_at_store");
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "confirmed">("pending");
  // Optional discount off the subtotal, in cedis. Only staff holding
  // `orders.discount` see the input; the server enforces the same permission.
  const [discount, setDiscount] = useState("");

  // Product picker (reset for every new line).
  const [productId, setProductId] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);

  const [lines, setLines] = useState<Line[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The method has to describe the fulfilment it sits on: cash on delivery is
  // meaningless for a pickup and "pay at the shop" for a courier job. Only an
  // impossible pairing is corrected — a chosen MoMo survives the toggle.
  useEffect(() => {
    setPaymentMethod((m) =>
      (m === "cod" && fulfillment === "pickup") ||
      (m === "pay_at_store" && fulfillment === "delivery")
        ? fulfillment === "pickup"
          ? "pay_at_store"
          : "cod"
        : m,
    );
  }, [fulfillment]);

  if (permissions.isPending)
    return <p className="text-sm text-muted-foreground">Checking your access…</p>;
  if (permissions.isError) {
    return (
      <div>
        <BackLink />
        <p role="alert" className="mt-4">
          Your access could not be checked. Reload the page to try again.
        </p>
      </div>
    );
  }
  // The server enforces this too (`orders.staffCreate` is guarded by the same
  // permission) — this panel just stops the form from being filled in for
  // nothing, and says the same sentence the refusal would.
  if (!permissions.data.includes("orders.create")) {
    return (
      <div>
        <BackLink />
        <p role="alert" className="mt-4">
          You do not have permission to {PERMISSION_CATALOG["orders.create"].label}. Ask the store
          owner to turn it on from the Team page.
        </p>
      </div>
    );
  }
  // The discount field is a privilege, not a feature: without the permission
  // the input never renders (and `orders.staffCreate` would refuse it anyway).
  const canDiscount = permissions.data.includes("orders.discount");

  if (store.isPending) return <p className="text-sm text-muted-foreground">Loading catalogue…</p>;
  if (store.isError) {
    return (
      <div>
        <BackLink />
        <p role="alert" className="mt-4">
          The catalogue could not load. Reload the page to try again.
        </p>
      </div>
    );
  }

  // Exactly what checkout offers — and exactly what `staffCreate` accepts:
  // listed and verified, no hidden demo rows, no samples.
  const products = store.data.products.filter((p) => p.visible !== false && p.verified);
  const product = products.find((p) => p.id === productId) ?? null;
  const variants = product?.variants ?? [];
  const axes = product?.axes ?? [];
  // Every chip resolves against a FULL options set — `findVariantByOptions`
  // compares whole signatures — so a bare `{}` selection would make each
  // chip's probe miss the other axes and grey out the entire picker (nothing
  // clickable, ever). Seed from the first sellable variant the way the
  // product page does; explicit picks override the seed, and switching
  // product clears them (`resetPicker`) so the new product reseeds itself.
  const seedOptions =
    variants.find((v) => v.visible && v.stock > 0)?.options ??
    variants.find((v) => v.visible)?.options ??
    variants[0]?.options ??
    {};
  const activeSelection = axes.length > 0 ? { ...seedOptions, ...selected } : selected;
  const chosenVariant =
    product === null || variants.length === 0
      ? null
      : (findVariantByOptions(variants, activeSelection) ?? null);
  const picking = product !== null && axes.length > 0;
  const allAxesChosen = axes.every((axis) => (activeSelection[axis.name] ?? "") !== "");
  const available = product === null ? 0 : ((picking ? chosenVariant?.stock : product.stock) ?? 0);

  const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  // The shop never charges delivery — the rider collects the fee straight from
  // the customer — so the running total is the subtotal less any discount.
  // Raw parse first (submit validates it), then a display-safe value so a
  // half-typed input never renders "GH₵ NaN" in the totals.
  const discountNumber = discount.trim() === "" ? 0 : Number(discount);
  const discountValue = Number.isFinite(discountNumber) && discountNumber > 0 ? discountNumber : 0;

  const resetPicker = () => {
    setSelected({});
    setQuantity(1);
  };

  const addToOrder = () => {
    setFormError(null);
    if (product === null) {
      setFormError("Choose a product first.");
      return;
    }
    if (picking && !allAxesChosen) {
      setFormError("Choose an option before adding this item.");
      return;
    }
    if (picking && (chosenVariant === null || !chosenVariant.visible)) {
      setFormError("That option is not available.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setFormError("Quantity must be at least 1.");
      return;
    }

    const variantKey = picking ? chosenVariant?.key : undefined;
    const variantName = picking ? chosenVariant?.name : undefined;
    const unitPrice = (picking ? chosenVariant?.price : null) ?? product.price;
    const imageKey = (picking ? chosenVariant?.image_key : null) ?? product.image_key;
    const already = lines
      .filter((l) => lineKey(l.id, l.variant_key) === lineKey(product.id, variantKey))
      .reduce((sum, l) => sum + l.quantity, 0);
    if (already + quantity > available) {
      setFormError(
        available === 0
          ? "That item is out of stock."
          : `Only ${available} in stock${already > 0 ? ` (${already} already in this order)` : ""}.`,
      );
      return;
    }

    setLines((current) => {
      const key = lineKey(product.id, variantKey);
      const existing = current.find((l) => lineKey(l.id, l.variant_key) === key);
      if (existing) {
        // Merge rather than duplicate: two rows for one option would ask the
        // server to hold the same units twice under one idempotency key.
        return current.map((l) => (l === existing ? { ...l, quantity: l.quantity + quantity } : l));
      }
      return [
        ...current,
        {
          id: product.id,
          name: product.name,
          image_key: imageKey,
          price: unitPrice,
          quantity,
          ...(variantKey ? { variant_key: variantKey } : {}),
          ...(variantName ? { variant_name: variantName } : {}),
        },
      ];
    });
    resetPicker();
  };

  const removeLine = (key: string) => {
    setFormError(null);
    setLines((current) => current.filter((l) => lineKey(l.id, l.variant_key) !== key));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (customerName.trim().length < 2 || phone.replace(/[^0-9+]/g, "").length < 9) {
      setFormError("Enter the customer's name and phone number.");
      return;
    }
    if (email.trim() !== "" && !/.+@.+\..+/.test(email.trim())) {
      setFormError("Enter a valid email address, or leave it blank.");
      return;
    }
    if (lines.length === 0) {
      setFormError("Add at least one item to the order.");
      return;
    }
    if (fulfillment === "delivery" && address.trim().length < 5) {
      setFormError("Enter a delivery address.");
      return;
    }
    // Same two rules the server applies — caught here so the form says it
    // before the round trip.
    if (discount.trim() !== "" && (!Number.isFinite(discountNumber) || discountNumber < 0)) {
      setFormError("Enter a discount of zero or more.");
      return;
    }
    if (discountNumber > subtotal) {
      setFormError("The discount can't be bigger than the order.");
      return;
    }
    if (
      paymentStatus === "confirmed" &&
      !window.confirm(
        "Mark this order as paid right now? Only confirm it when the money is already in hand.",
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const created = await create({
        customer_name: customerName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        fulfillment,
        zone,
        channel,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        items: lines.map((l) => ({
          id: l.id,
          quantity: l.quantity,
          ...(l.variant_key ? { variant_key: l.variant_key } : {}),
        })),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(discountNumber > 0 ? { discount: discountNumber } : {}),
      });
      toast.success("Order recorded");
      navigate({ to: "/staff/orders/$id", params: { id: created.id } });
    } catch (err) {
      const message = errorMessage(err, "The order could not be recorded.");
      setFormError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const methodOptions: { value: PaymentMethod; label: string }[] = [
    ...(fulfillment === "pickup"
      ? [{ value: "pay_at_store" as const, label: "Pay at the shop" }]
      : []),
    ...(fulfillment === "delivery" ? [{ value: "cod" as const, label: "Cash on delivery" }] : []),
    { value: "momo" as const, label: "Mobile Money received" },
  ];

  return (
    <div>
      <BackLink />
      <h2 className="page-title mt-4">Record an order</h2>
      <p className="page-lead">
        For sales that happen in the shop — WhatsApp, phone or at the counter. The server prices
        every item and holds the stock, exactly like an online order. Delivery riders collect their
        fee from the customer; the shop never charges one.
      </p>

      <form onSubmit={submit} className="mt-6">
        <Panel title="Customer" description="Who is this order for, and how did it reach you?">
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium">Where did the order come from?</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {CHANNELS.map((c) => (
                  <label
                    key={c.value}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
                      channel === c.value
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <input
                      type="radio"
                      name="channel"
                      checked={channel === c.value}
                      onChange={() => setChannel(c.value)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {CHANNELS.find((c) => c.value === channel)?.hint} — recorded against your name in
                the order history.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                Customer name
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Ama Mensah"
                  autoComplete="off"
                />
              </label>
              <label>
                Phone
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 024 123 4567"
                  autoComplete="off"
                />
              </label>
              <label>
                Email (optional)
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Only if they want a confirmation"
                  autoComplete="off"
                />
              </label>
              <label>
                Note for the team (optional)
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Collect after 5pm"
                />
              </label>
            </div>
          </div>
        </Panel>

        <Panel
          title="Items"
          description="Prices and stock are checked by the server — what you see here is the estimate."
        >
          <div className="space-y-4">
            <label>
              Product
              <select
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  resetPicker();
                  setFormError(null);
                }}
              >
                <option value="">Choose a product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.stock === 0 && p.variants == null}>
                    {p.name} — {money(p.price)} ({p.stock} in stock)
                  </option>
                ))}
              </select>
            </label>

            {product !== null && picking ? (
              <VariantPicker
                product={product}
                selected={activeSelection}
                onSelect={(axis, value) => {
                  setSelected((prev) => ({ ...prev, [axis]: value }));
                  setFormError(null);
                }}
              />
            ) : null}

            {product !== null && !picking && product.stock === 0 ? (
              <p role="alert" className="text-sm text-destructive">
                This product is out of stock.
              </p>
            ) : null}

            <div className="flex flex-wrap items-end gap-3">
              <label className="w-28">
                Quantity
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={Math.max(available, 1)}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))
                  }
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={product === null || (picking && !allAxesChosen) || available === 0}
                onClick={addToOrder}
              >
                Add to order
              </Button>
              {product !== null && (picking ? chosenVariant !== null : true) ? (
                <span className="text-sm text-muted-foreground">{available} in stock</span>
              ) : null}
            </div>

            {lines.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                No items yet — choose a product and add it.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {lines.map((line) => (
                  <li
                    key={lineKey(line.id, line.variant_key)}
                    className="flex items-center gap-3 py-3"
                  >
                    <img
                      src={images[line.image_key]}
                      alt=""
                      className="size-12 rounded-lg object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{line.name}</span>
                      {line.variant_name && (
                        <span className="block text-xs text-muted-foreground">
                          {line.variant_name}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {money(line.price, true)} × {line.quantity}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold">
                      {money(line.price * line.quantity, true)}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeLine(lineKey(line.id, line.variant_key))}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-1.5 text-sm">
              <div className="summary-row">
                <span>Subtotal (estimate)</span>
                <span>{money(subtotal, true)}</span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          title="Pickup or delivery"
          description="Pickup is paid at the counter; riders collect their delivery fee from the customer."
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <label
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
                  fulfillment === "pickup"
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                <input
                  type="radio"
                  name="fulfillment"
                  checked={fulfillment === "pickup"}
                  onChange={() => setFulfillment("pickup")}
                />
                Pickup in Abelenkpe
              </label>
              <label
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
                  fulfillment === "delivery"
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                <input
                  type="radio"
                  name="fulfillment"
                  checked={fulfillment === "delivery"}
                  onChange={() => setFulfillment("delivery")}
                />
                Delivery
              </label>
            </div>

            {fulfillment === "delivery" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  Delivery area
                  <select value={zone} onChange={(e) => setZone(e.target.value as Zone)}>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} — {z.time}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Delivery address
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. 12 Abelenkpe Taxi Rank Road, Accra"
                  />
                </label>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Pickup — the customer pays at the shop counter.
              </p>
            )}
            {fulfillment === "delivery" ? (
              <p className="text-xs text-muted-foreground">
                Delivery fee is paid directly to your rider.
              </p>
            ) : null}

            <div className="space-y-1.5 text-sm">
              {canDiscount && (
                <label className="summary-row">
                  Discount (GH₵)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    className="w-24 !mt-0 text-right"
                    value={discount}
                    onChange={(e) => {
                      setDiscount(e.target.value);
                      setFormError(null);
                    }}
                    placeholder="0"
                  />
                </label>
              )}
              {canDiscount &&
                discount.trim() !== "" &&
                (!Number.isFinite(discountNumber) || discountNumber < 0) && (
                  <p className="text-sm text-destructive">Enter a discount of zero or more.</p>
                )}
              {canDiscount && discountNumber > subtotal && (
                <p className="text-sm text-destructive">
                  The discount can't be bigger than the order.
                </p>
              )}
              {discountValue > 0 && (
                <div className="summary-row">
                  <span>Discount</span>
                  <span>−{money(discountValue, true)}</span>
                </div>
              )}
              <div className="summary-row font-semibold">
                <span>Total (estimate)</span>
                <span>{money(Math.max(0, subtotal - discountValue), true)}</span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          title="Payment"
          description="Where the money changes hands — recorded now, or marked to collect later."
        >
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium">Method</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {methodOptions.map((m) => (
                  <label
                    key={m.value}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
                      paymentMethod === m.value
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment_method"
                      checked={paymentMethod === m.value}
                      onChange={() => setPaymentMethod(m.value)}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium">Payment status</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <label
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
                    paymentStatus === "pending"
                      ? "border-offer/50 bg-offer/10 text-offer"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment_status"
                    checked={paymentStatus === "pending"}
                    onChange={() => setPaymentStatus("pending")}
                  />
                  Still to collect
                </label>
                <label
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
                    paymentStatus === "confirmed"
                      ? "border-success/50 bg-success/10 text-success"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment_status"
                    checked={paymentStatus === "confirmed"}
                    onChange={() => setPaymentStatus("confirmed")}
                  />
                  Money already received
                </label>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Completing the order later still requires payment to be marked received.
              </p>
            </div>
          </div>
        </Panel>

        {formError ? (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
          >
            {formError}
          </p>
        ) : null}

        <FormActions busy={busy} note="Totals and stock are confirmed by the server when you save.">
          <Button type="submit" disabled={busy || lines.length === 0}>
            {busy ? "Saving…" : "Create order"}
          </Button>
          <Button asChild variant="outline">
            <Link to="/staff/orders">Cancel</Link>
          </Button>
        </FormActions>
      </form>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/staff/orders" className="text-sm text-link hover:underline">
      ← Back to orders
    </Link>
  );
}
