import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, ZoomIn, X, MapPin, Truck, ShieldCheck, MessageCircle, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/store-provider";
import {
  Quantity,
  PageError,
  PageNotFound,
  ProductCard,
  SectionHeading,
} from "@/components/store-ui";
import { VariantPicker } from "@/components/variant-picker";
import { images } from "@/lib/store-images";
import { storeQuery, pageHead, money, specs, delivery, zones, whatsappHref } from "@/lib/store";
import { findVariantByOptions } from "../../convex/lib/variants";
import { toast } from "sonner";
export const Route = createFileRoute("/product/$slug")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(storeQuery);
    if (!data.products.some((p) => p.id === params.slug && p.visible !== false)) throw notFound();
    return data;
  },
  head: ({ loaderData, params }) => {
    const product = loaderData?.products.find((p) => p.id === params.slug);
    return pageHead(
      product?.name || "Product",
      "Product specifications, Ghana cedi pricing and local delivery from MB Ventures GH.",
      // Social cards for a product lead with its own photo, not the shop default.
      product ? { image: images[product.image_key] } : undefined,
    );
  },
  component: ProductPage,
  errorComponent: PageError,
  notFoundComponent: () => <PageNotFound />,
});
function ProductPage() {
  const { slug } = Route.useParams(),
    {
      data: { products, settings, categories },
    } = useSuspenseQuery(storeQuery);
  const p = products.find((p) => p.id === slug),
    cart = useCart(),
    navigate = useNavigate(),
    [quantity, setQuantity] = useState(1),
    [zone, setZone] = useState("central"),
    [gallery, setGallery] = useState(0),
    [zoom, setZoom] = useState(false),
    // Axis name → chosen value. Seeded from the first visible variant on load.
    [chosen, setChosen] = useState<Record<string, string>>({});

  // Hoist axes and variants above the early return so hooks can reference them
  // safely. When p is null these default to empty arrays — no runtime error.
  const axes = p?.axes ?? [],
    variants = p?.variants ?? [];

  // Reset axis selection and quantity when navigating between products.
  // TanStack Router reuses the same component instance for different slugs, so
  // without an explicit reset the previous product's choices survive in state.
  // Keyed on slug: fires once per product, not on every re-render.
  // Seeds chosen from the first visible variant so the picker is never blank.
  useEffect(() => {
    const firstVisible = variants.find((v) => v.visible);
    setChosen(firstVisible?.options ?? {});
    setQuantity(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!p) return <PageNotFound />;

  // Merge chosen over first-variant defaults so any axis the user has
  // explicitly clicked is respected, and axes not yet touched fall back to the
  // first visible variant's value. Fully determined on first render.
  const defaultOptions = variants.find((v) => v.visible)?.options ?? variants[0]?.options ?? {};
  const selectedOptions = axes.length > 0 ? { ...defaultOptions, ...chosen } : defaultOptions;

  // The chosen options resolve to a variant by matching the options
  // themselves — never by a recomputed key string, since stored keys are
  // opaque identifiers past orders point at.
  const selectedVariant = findVariantByOptions(variants, selectedOptions);
  // With options on offer the *option* decides price, stock and SKU. A product
  // without them keeps exactly the numbers this page has always shown.
  const price = selectedVariant?.price ?? p.price,
    stock = selectedVariant ? selectedVariant.stock : p.stock,
    // Clamp the quantity to the available stock so that switching to a variant
    // with less stock never leaves a number that the server would reject.
    effectiveQty = stock > 0 ? Math.min(quantity, stock) : quantity,
    sku = selectedVariant?.sku ?? `MB-${p.id.toUpperCase()}`,
    // Fail closed: options are on offer but nothing buyable sits behind the
    // current choice, so the shopper must not be able to put it in the cart.
    unavailable = selectedVariant
      ? !selectedVariant.visible || selectedVariant.stock === 0
      : variants.length > 0 || p.stock === 0,
    soldOut = p.verified && unavailable,
    // A struck-through price only says "discount" when it is actually above
    // what is being charged. With options pricing themselves this used to
    // render GH₵ 250 with GH₵ 250 crossed out — a sale of nothing.
    compareAt = p.original_price !== null && p.original_price > price ? p.original_price : null;
  const galleryImages = [images[p.image_key], ...(p.gallery ?? []).map((g) => images[g])];
  // Prefers the staff-entered WhatsApp number, then the shop phone, and returns
  // null when neither is dialable — in which case we drop the link entirely
  // rather than ship a dead wa.me anchor.
  const whatsapp = whatsappHref(settings, `Hello, I would like to ask about ${p.name}.`);
  return (
    <div className="page-content wrap page-product">
      {/* One trail shape everywhere: Home and parent pages are links, the page
          you are on is plain text. The category shows its display name rather
          than its id. */}
      <div className="breadcrumbs">
        <Link to="/" className="flex min-h-10 items-center px-1.5 -mx-1.5">
          Home
        </Link>
        <span>/</span>
        <Link
          to="/catalogue"
          search={{ category: "", q: "" }}
          className="flex min-h-10 items-center px-1.5 -mx-1.5"
        >
          Shop
        </Link>
        <span>/</span>
        <Link
          to="/catalogue"
          search={{ category: p.category, q: "" }}
          className="flex min-h-10 items-center px-1.5 -mx-1.5"
        >
          {categories.find((c) => c.id === p.category)?.name ?? p.category}
        </Link>
        <span>/</span>
        <span>{p.name}</span>
      </div>
      <div className="two-column">
        <div>
          <div className="gallery">
            <img src={galleryImages[gallery]} alt={`${p.name}, view ${gallery + 1}`} />
            <Button
              variant="outline"
              className="absolute bottom-4 right-4 icon-control rounded-full"
              title="Zoom image"
              onClick={() => setZoom(true)}
              aria-label="Zoom product image"
            >
              <ZoomIn />
            </Button>
          </div>
          <div className="gallery-thumbs">
            {galleryImages.map((src, i) => (
              <Button
                variant="ghost"
                key={src}
                className="h-auto p-0"
                aria-label={`View product image ${i + 1}`}
                onClick={() => setGallery(i)}
              >
                <img
                  className={i === gallery ? "ring-2 ring-link" : ""}
                  src={src}
                  alt={`View ${i + 1}`}
                />
              </Button>
            ))}
          </div>
        </div>
        <div>
          <p className="eyebrow text-muted-foreground">{p.brand}</p>
          <h1 className="mt-3 font-display text-4xl font-semibold">{p.name}</h1>
          <p className="mt-4 font-mono text-xs text-muted-foreground">SKU: {sku}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {specs(p.specs)
              .slice(0, 3)
              .map(([k, v]) => (
                <span key={k} className="rounded-full border border-border px-3 py-1 text-xs">
                  {v}
                </span>
              ))}
          </div>
          <p className="mt-7 text-3xl font-semibold" style={{ color: "var(--price-ink)" }}>
            <span className={compareAt !== null ? "sale-price" : undefined}>{money(price)}</span>{" "}
            {compareAt !== null && (
              <del className="text-lg font-normal text-muted-foreground">{money(compareAt)}</del>
            )}
          </p>
          <p
            className={
              "mt-3 text-sm " +
              (p.verified
                ? stock > 0
                  ? "text-success-ink"
                  : "text-danger-ink"
                : "text-muted-foreground")
            }
          >
            {/* The option joins the sentence so two lines of the same shelf
                read as the colour and the count, not one number for both. */}
            {!p.verified
              ? "Sample item · price and availability unconfirmed"
              : stock > 0
                ? `In stock · ${stock} available${selectedVariant ? ` · ${selectedVariant.name}` : ""}`
                : `Out of stock${selectedVariant ? ` · ${selectedVariant.name}` : ""}`}
          </p>
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="size-4" />
            Pickup at Abelenkpe, Accra
          </p>
          <VariantPicker
            product={p}
            selected={selectedOptions}
            onSelect={(axis, value) => setChosen((prev) => ({ ...prev, [axis]: value }))}
          />
          <div className="mt-7 flex gap-4">
            <Quantity value={effectiveQty} onChange={setQuantity} max={stock > 0 ? stock : 1} />
            {/*
              The button says only "Add to cart". Naming the chosen option here
              too looked helpful, but `whitespace-nowrap` makes the button's
              min-content unshrinkable, so an auto-generated label like
              "Black / Standard" stretched the whole grid column — 396px of
              content in a 320px viewport. The stock line above already names it.
              `min-w-0` keeps the button able to shrink regardless of label.
            */}
            <Button
              className="min-w-0 flex-1"
              disabled={soldOut}
              onClick={() => cart.add(p, effectiveQty, selectedVariant)}
            >
              Add to cart <Plus />
            </Button>
          </div>
          <Button
            variant="outline"
            className="mt-3 w-full"
            disabled={soldOut}
            onClick={() => {
              cart.add(p, effectiveQty, selectedVariant);
              navigate({ to: "/checkout" });
            }}
          >
            Buy now
          </Button>
          {!p.verified && (
            <p className="mt-3 text-xs text-muted-foreground">
              You can prepare a cart. Ordering opens once the store confirms inventory.
            </p>
          )}
          <div className="mt-8 border-t border-border pt-6">
            <label className="flex items-center gap-2">
              <Truck className="size-4" />
              Delivery estimate
            </label>
            <select
              className="mt-3 text-sm"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              aria-label="Delivery area"
            >
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
            <p className="mt-3 text-sm">
              {money(delivery(settings, zone, price * effectiveQty))} ·{" "}
              {zones.find((z) => z.id === zone)?.time}
            </p>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4" />
              Store warranty support. Contact us for this item's terms.
            </p>
            <div className="mt-5 flex gap-5">
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-10 items-center gap-2 text-xs text-link"
                >
                  <MessageCircle className="size-4" />
                  Ask on WhatsApp
                </a>
              )}
              <Button
                variant="link"
                className="min-h-10 h-auto p-0 text-xs text-link"
                onClick={() =>
                  navigator.clipboard
                    .writeText(window.location.href)
                    .then(() => toast.success("Product link copied"))
                }
              >
                <Copy />
                Copy link
              </Button>
            </div>
          </div>
        </div>
      </div>
      <section className="section grid gap-12 md:grid-cols-2">
        <div>
          <h2 className="mb-5 text-2xl">Product overview</h2>
          <p className="text-sm leading-7 text-muted-foreground">{p.description}</p>
          <details className="mt-6 border-y border-border py-5">
            <summary className="cursor-pointer text-sm font-semibold">
              Delivery, pickup & returns
            </summary>
            <p className="mt-4 text-sm text-muted-foreground">
              Delivery across Ghana or collection from the Abelenkpe shop. Report damaged or
              incorrect goods promptly. Contact our shop for product-specific returns and warranty
              conditions.
            </p>
          </details>
        </div>
        <div>
          <h2 className="mb-5 text-2xl">Specifications</h2>
          <table className="spec-table">
            <tbody>
              {specs(p.specs).map(([k, v]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-xs text-muted-foreground">
            {!p.verified && "Specifications are indicative until confirmed by the store."}
          </p>
        </div>
      </section>
      <section className="section">
        <SectionHeading title="For the rest of your setup" />
        <div className="product-grid">
          {products
            .filter((item) => item.id !== p.id && item.visible !== false)
            .slice(0, 4)
            .map((item) => (
              <ProductCard product={item} key={item.id} />
            ))}
        </div>
      </section>
      <Dialog.Root open={zoom} onOpenChange={setZoom}>
        <Dialog.Portal>
          <Dialog.Overlay className="scrim" />
          <Dialog.Content
            className="search-panel !top-8 !max-h-[90vh]"
            aria-describedby={undefined}
          >
            <Dialog.Title className="mb-5 text-lg">{p.name}</Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                className="overlay-close icon-control"
                aria-label="Close product viewer"
              >
                <X />
              </Button>
            </Dialog.Close>
            <img
              src={galleryImages[gallery]}
              alt={p.name}
              className="max-h-[75vh] w-full object-contain"
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
