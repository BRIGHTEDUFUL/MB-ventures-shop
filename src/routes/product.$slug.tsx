import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { images } from "@/lib/store-images";
import { storeQuery, pageHead, money, specs, delivery, zones } from "@/lib/store";
import { toast } from "sonner";
export const Route = createFileRoute("/product/$slug")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(storeQuery);
    if (!data.products.some((p) => p.id === params.slug)) throw notFound();
    return data;
  },
  head: ({ loaderData, params }) =>
    pageHead(
      loaderData?.products.find((p) => p.id === params.slug)?.name || "Product",
      "Product specifications, Ghana cedi pricing and local delivery from MB Ventures GH.",
    ),
  component: ProductPage,
  errorComponent: PageError,
  notFoundComponent: PageNotFound,
});
function ProductPage() {
  const { slug } = Route.useParams(),
    {
      data: { products, settings },
    } = useSuspenseQuery(storeQuery);
  const p = products.find((p) => p.id === slug),
    cart = useCart(),
    navigate = useNavigate(),
    [quantity, setQuantity] = useState(1),
    [zone, setZone] = useState("central"),
    [gallery, setGallery] = useState(0),
    [zoom, setZoom] = useState(false);
  if (!p) return <PageNotFound />;
  const galleryImages = [images[p.image_key], ...(p.gallery ?? []).map((g) => images[g])];
  return (
    <div className="page-content wrap page-product">
      <div className="breadcrumbs">
        <Link to="/catalogue" search={{ category: "", q: "" }}>
          Shop
        </Link>
        <span>/</span>
        <Link to="/catalogue" search={{ category: p.category, q: "" }}>
          {p.category}
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
          <p className="mt-4 font-mono text-[11px] text-muted-foreground">
            SKU: MB-{p.id.toUpperCase()}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {specs(p.specs)
              .slice(0, 3)
              .map(([k, v]) => (
                <span key={k} className="rounded-full border border-border px-3 py-1 text-xs">
                  {v}
                </span>
              ))}
          </div>
          <p className="mt-7 text-3xl font-semibold">
            <span className={p.original_price ? "sale-price" : undefined}>{money(p.price)}</span>{" "}
            {p.original_price && (
              <del className="text-lg font-normal text-muted-foreground">
                {money(p.original_price)}
              </del>
            )}
          </p>
          <p
            className={
              "mt-3 text-sm " +
              (p.verified && p.stock > 0 ? "text-success-ink" : "text-muted-foreground")
            }
          >
            {!p.verified
              ? "Sample item · price and availability unconfirmed"
              : p.stock > 0
                ? `In stock · ${p.stock} available`
                : "Out of stock"}
          </p>
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="size-4" />
            Pickup at Abelenkpe, Accra
          </p>
          <div className="mt-7 flex gap-4">
            <Quantity value={quantity} onChange={setQuantity} />
            <Button
              className="flex-1"
              disabled={p.verified && p.stock === 0}
              onClick={() => cart.add(p, quantity)}
            >
              Add to cart <Plus />
            </Button>
          </div>
          <Button
            variant="outline"
            className="mt-3 w-full"
            disabled={p.verified && p.stock === 0}
            onClick={() => {
              cart.add(p, quantity);
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
              {money(delivery(settings, zone, p.price * quantity))} ·{" "}
              {zones.find((z) => z.id === zone)?.time}
            </p>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4" />
              Store warranty support. Contact us for this item's terms.
            </p>
            <div className="mt-5 flex gap-5">
              <a
                href={`https://wa.me/${settings.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello, I would like to ask about ${p.name}.`)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-xs text-link"
              >
                <MessageCircle className="size-4" />
                Ask on WhatsApp
              </a>
              <Button
                variant="link"
                className="h-auto p-0 text-xs text-link"
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
            Specifications shown are examples until verified by the store.
          </p>
        </div>
      </section>
      <section className="section">
        <SectionHeading title="For the rest of your setup" />
        <div className="product-grid">
          {products
            .filter((item) => item.id !== p.id)
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
