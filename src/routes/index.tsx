import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowRight,
  MapPin,
  Truck,
  ShieldCheck,
  Wallet,
  Plus,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard, SectionHeading, PageError, PageNotFound } from "@/components/store-ui";
import { useCart } from "@/components/store-provider";
import { money, storeQuery, pageHead } from "@/lib/store";
import { images } from "@/lib/store-images";
export const Route = createFileRoute("/")({
  head: () =>
    pageHead(
      "Workspace gear, from Circle to your desk",
      "Shop desks, office chairs and everyday technology with delivery across Ghana and Circle pickup.",
    ),
  loader: ({ context }) => context.queryClient.ensureQueryData(storeQuery),
  component: Index,
  errorComponent: PageError,
  notFoundComponent: PageNotFound,
});
function Index() {
  const {
      data: { products, settings, categories: allCats },
    } = useSuspenseQuery(storeQuery),
    categories = allCats.filter((c) => c.visible),
    { add } = useCart(),
    [selected, setSelected] = useState(settings.featured_ids[1] ?? settings.featured_ids[0] ?? "");
  const featured = products.find((p) => p.id === selected) || products[0];
  const picks = settings.featured_ids
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const rail = picks.length ? picks : products.slice(0, 4);
  return (
    <>
      <section className="hero">
        <img
          className="hero-photo"
          src={images[settings.hero_image]}
          alt="A furnished workspace with an adjustable desk and high-back office chair"
          fetchPriority="high"
        />
        <div className="hero-content">
          <p className="eyebrow !mb-4 !mt-0">MB Ventures GH · Circle, Accra</p>
          <h1>{settings.hero_title}</h1>
          <p>{settings.hero_subtitle}</p>
          <div className="hero-ctas">
            <Button asChild className="hero-primary">
              <Link to="/catalogue" search={{ category: "", q: "" }}>
                Shop your setup <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" className="hero-secondary">
              <Link to="/$page" params={{ page: "delivery" }}>
                Visit our Circle shop
              </Link>
            </Button>
          </div>
        </div>
        <Button
          className="hotspot hotspot-one"
          data-active={selected === "standing-desk" ? "true" : undefined}
          aria-pressed={selected === "standing-desk"}
          title="View the desk"
          aria-label="View the desk in this setup"
          onClick={() => setSelected("standing-desk")}
        >
          <Plus />
        </Button>
        <Button
          className="hotspot hotspot-two"
          data-active={selected === "ergonomic-chair" ? "true" : undefined}
          aria-pressed={selected === "ergonomic-chair"}
          title="View the chair"
          aria-label="View the chair in this setup"
          onClick={() => setSelected("ergonomic-chair")}
        >
          <Plus />
        </Button>
        <Button
          className="hotspot hotspot-three"
          data-active={selected === "mechanical-keyboard" ? "true" : undefined}
          aria-pressed={selected === "mechanical-keyboard"}
          title="View the keyboard"
          aria-label="View the keyboard in this setup"
          onClick={() => setSelected("mechanical-keyboard")}
        >
          <Plus />
        </Button>
        {featured && (
          <div className="hero-product glass">
            <div className="mb-3 flex items-center justify-between">
              <p className="eyebrow text-muted-foreground">In this setup</p>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  aria-label="Previous setup product"
                  onClick={() =>
                    setSelected(selected === "standing-desk" ? "ergonomic-chair" : "standing-desk")
                  }
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  aria-label="Next setup product"
                  onClick={() =>
                    setSelected(
                      selected === "mechanical-keyboard"
                        ? "ergonomic-chair"
                        : "mechanical-keyboard",
                    )
                  }
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
            <div className="hero-product-top">
              <img src={images[featured.image_key]} alt={featured.name} />
              <div className="min-w-0">
                <Link to="/product/$slug" params={{ slug: featured.id }}>
                  <h3 className="text-sm font-semibold">{featured.name}</h3>
                </Link>
                <p className="mt-1 text-sm font-semibold">{money(featured.price)}</p>
                {!featured.verified && (
                  <p className="text-[9px] text-muted-foreground">Sample item · example price</p>
                )}
              </div>
            </div>
            <Button className="mt-4 h-9 w-full text-xs" onClick={() => add(featured)}>
              Add to cart <Plus className="size-3" />
            </Button>
          </div>
        )}
        <div className="hero-facts">
          <span>
            <MapPin className="size-3" />
            Pickup at Circle
          </span>
          <span>
            <Truck className="size-3" />
            Delivery across Ghana
          </span>
        </div>
      </section>
      <div className="wrap">
        <section className="trust-strip" aria-label="Store assurances">
          {[
            { icon: MapPin, title: "A real shop at Circle", text: "Visit us in Accra" },
            { icon: Truck, title: "Delivery across Ghana", text: "Accra, Tema and beyond" },
            { icon: ShieldCheck, title: "Store warranty", text: "Support from our shop" },
            { icon: Wallet, title: "Pay your way", text: "Mobile Money or cash on delivery" },
          ].map((f) => (
            <div className="trust-item" key={f.title}>
              <f.icon />
              <div>
                <strong>{f.title}</strong>
                <p>{f.text}</p>
              </div>
            </div>
          ))}
        </section>
        <section className="section">
          <SectionHeading title="Find your workspace essentials" />
          <div className="category-grid">
            {categories.map((c) => (
              <Link
                to="/catalogue"
                search={{ category: c.id, q: "" }}
                className="category-tile"
                key={c.id}
              >
                <img src={images[c.image_key]} alt={c.name} loading="lazy" />
                <span className="category-label">
                  {c.name}
                  <small>
                    {products.filter((p) => p.category === c.id).length} products{" "}
                    <ArrowRight className="float-right size-3" />
                  </small>
                </span>
              </Link>
            ))}
          </div>
        </section>
        <section className="section">
          <SectionHeading title="For your everyday setup" />
          <div className="product-grid product-rail">
            {rail.map((p) => (
              <ProductCard product={p} key={p.id} />
            ))}
          </div>
        </section>
        <section className="section setup-section">
          <img
            src={images[settings.setup_image]}
            className="setup-photo"
            alt="An office desk and chair in a daylight workspace"
            loading="lazy"
          />
          <div>
            <p className="eyebrow !mt-0">Work, play, and everything in between</p>
            <h2 className="mt-4">
              A place for
              <br />
              your best work.
            </h2>
            <p>
              Start with a desk and chair. Add the tools you use every day. Put your workspace
              together with help from our Circle shop.
            </p>
            <div className="mt-6 divide-y divide-border">
              {rail.slice(0, 3).map((p) => (
                <div className="flex items-center justify-between py-3" key={p.id}>
                  <Link to="/product/$slug" params={{ slug: p.id }} className="text-sm">
                    {p.name}
                  </Link>
                  <Button
                    variant="ghost"
                    aria-label={`Add ${p.name} to setup`}
                    onClick={() => add(p)}
                    className="h-9 gap-3 px-2 text-xs"
                  >
                    {money(p.price)} <Plus className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
            <Button className="mt-5" onClick={() => rail.slice(0, 3).forEach((p) => add(p))}>
              Add the setup <ArrowRight />
            </Button>
          </div>
        </section>
        <div className="brand-strip section">
          <span>Logitech</span>
          <span>IKEA</span>
          <span>elgato</span>
        </div>
        <section className="section grid gap-8 pb-4 md:grid-cols-[1fr_1fr]">
          <div>
            <p className="eyebrow text-muted-foreground">From online to in-store</p>
            <h2 className="mt-4 text-3xl">
              Your Circle shop.
              <br />
              Now closer to your doorstep.
            </h2>
          </div>
          <div>
            <p className="text-sm leading-7 text-muted-foreground">
              Collect your order at Circle Commercial Area, Accra, or have it delivered to your
              door. Our shop team handles your order and confirms every Mobile Money payment
              personally.
            </p>
            <Link
              to="/$page"
              params={{ page: "about" }}
              className="mt-5 inline-flex items-center gap-2 text-sm font-medium"
            >
              About MB Ventures GH <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
