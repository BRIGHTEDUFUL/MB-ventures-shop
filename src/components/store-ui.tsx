import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Minus, ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "./store-provider";
import { lineKey } from "@/lib/cart";
import { type Product, money, specs, storeQuery, displayFees } from "@/lib/store";
import { images, imageSize } from "@/lib/store-images";
import { remainingForFreeDelivery } from "../../convex/lib/rules";
export function ProductCard({ product: p }: { product: Product }) {
  const { add } = useCart();
  // Badge color carries the information: green in stock, ochre sale/low,
  // neutral for unverified samples so they never read as live inventory.
  // The option count only ever replaces the plain "In stock" — it is the one
  // thing a grid can say about a product you must open to choose from, and a
  // card is not the place to ask for a colour.
  const optionCount = p.variants?.length ?? 0;
  const badge: { text: string; tone?: "out" | "low" | "sale" | "stock" } = !p.verified
    ? { text: "Sample item" }
    : p.stock === 0
      ? { text: "Out of stock", tone: "out" }
      : p.stock < 5
        ? { text: `${p.stock} left`, tone: "low" }
        : p.original_price
          ? { text: "Sale", tone: "sale" }
          : optionCount > 1
            ? { text: `${optionCount} options` }
            : { text: "In stock", tone: "stock" };
  return (
    <article className="product-card">
      <div className="product-image">
        <Link to="/product/$slug" params={{ slug: p.id }}>
          <img {...imageSize(p.image_key)} src={images[p.image_key]} alt={p.name} loading="lazy" />
        </Link>
        <span className="product-badge" data-tone={badge.tone}>
          {badge.text}
        </span>
        <Button
          variant="ghost"
          className="product-add"
          aria-label={`Add ${p.name} to cart`}
          title="Add to cart"
          disabled={p.verified && p.stock === 0}
          onClick={() => add(p)}
        >
          <Plus />
        </Button>
      </div>
      <p className="brand">{p.brand}</p>
      <Link to="/product/$slug" params={{ slug: p.id }}>
        <h3>{p.name}</h3>
      </Link>
      <p className="spec">
        {specs(p.specs)
          .slice(0, 2)
          .map(([, v]) => v)
          .join(" · ")}
      </p>
      <div className="product-price">
        <span className={p.original_price ? "sale-price" : undefined}>{money(p.price)}</span>{" "}
        {p.original_price && (
          <del className="ml-2 text-xs font-normal text-muted-foreground">
            {money(p.original_price)}
          </del>
        )}
      </div>
      {!p.verified && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Example price · availability unconfirmed
        </p>
      )}
    </article>
  );
}
export function Quantity({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="quantity">
      <Button
        variant="ghost"
        aria-label="Decrease quantity"
        onClick={() => onChange(value - 1)}
        disabled={value <= 1}
      >
        <Minus className="size-3" />
      </Button>
      <span aria-live="polite">{value}</span>
      <Button
        variant="ghost"
        aria-label="Increase quantity"
        onClick={() => onChange(value + 1)}
        disabled={value >= 50}
      >
        <Plus className="size-3" />
      </Button>
    </div>
  );
}
export function CartLines() {
  const { lines, change, remove } = useCart();
  return (
    <>
      {lines.map((line) => {
        // Keyed by product *and* option, so two colours of one product stay
        // two rows and the quantity stepper moves only the one it sits on.
        const { product: p, variant, quantity } = line,
          key = lineKey(line),
          // The option's own price wins when it has one — the same rule the
          // subtotal and the server use.
          price = variant?.price ?? p.price,
          imageKey = variant?.image_key ?? p.image_key;
        return (
          <div className="cart-line" key={key}>
            <img {...imageSize(imageKey)} src={images[imageKey]} alt={p.name} />
            <div className="min-w-0">
              <Link to="/product/$slug" params={{ slug: p.id }} className="text-sm font-medium">
                {p.name}
              </Link>
              {variant && (
                <p className="mt-0.5 mb-3 text-xs text-muted-foreground">{variant.name}</p>
              )}
              <p className="mb-3 text-xs text-muted-foreground">{money(price, true)}</p>
              <Quantity value={quantity} onChange={(q) => change(key, q)} />
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">{money(price * quantity, true)}</p>
              <Button
                className="mt-3 icon-control"
                variant="ghost"
                title="Remove item"
                aria-label={`Remove ${p.name}${variant ? `, ${variant.name}` : ""}`}
                onClick={() => remove(key)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </>
  );
}
export function FreeDelivery() {
  const { subtotal } = useCart(),
    { data } = useQuery(storeQuery);
  // A saved threshold of 0 means "free delivery is on"; `|| 5000` would have
  // resurrected the default and shown a progress bar for a perk already earned.
  const threshold = displayFees(data?.settings).free_threshold;
  return (
    <div className="mt-6 text-xs text-muted-foreground">
      <p>
        {subtotal > threshold
          ? "Your order qualifies for free delivery"
          : `${money(remainingForFreeDelivery(threshold, subtotal))} away from free delivery`}
      </p>
      <progress
        className="mt-3 h-1 w-full accent-link"
        max={threshold + 1}
        value={Math.min(subtotal, threshold + 1)}
        aria-label="Free delivery progress"
      />
      <p className="mt-2 text-[10px]">Free delivery on orders over {money(threshold)}</p>
    </div>
  );
}
export function SectionHeading({ title, category }: { title: string; category?: string }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      <Link
        to="/catalogue"
        search={{ category: category || "", q: "" }}
        className="flex shrink-0 items-center gap-2 text-xs font-medium"
      >
        View all <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
export function PageError() {
  return (
    <div className="page-content wrap">
      <h1 className="page-title">The store could not load</h1>
      <p className="page-lead">Please refresh the page or contact the Abelenkpe shop.</p>
      <Button className="mt-6" onClick={() => window.location.reload()}>
        Refresh page
      </Button>
    </div>
  );
}
export function PageNotFound() {
  return (
    <div className="page-content wrap">
      <h1 className="page-title">Product not found</h1>
      <Button asChild className="mt-6">
        <Link to="/catalogue" search={{ category: "", q: "" }}>
          Shop the catalogue
        </Link>
      </Button>
    </div>
  );
}
