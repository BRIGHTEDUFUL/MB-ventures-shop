import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, MapPin, Truck, Plus, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard, SectionHeading, PageError, PageNotFound } from "@/components/store-ui";
import { useCart } from "@/components/store-provider";
import { money, storeQuery, pageHead } from "@/lib/store";
import { heroProductIds, TRUST_ICONS } from "@/lib/home-content";
import { images, imageSize } from "@/lib/store-images";

/** Fixed positions over the hero photo, one per hotspot we actually render. */
const HOTSPOT_POSITIONS = ["hotspot-one", "hotspot-two", "hotspot-three"] as const;

export const Route = createFileRoute("/")({
  head: () =>
    pageHead(
      "Workspace gear, from Abelenkpe to your desk",
      "Shop desks, office chairs and everyday technology with delivery across Ghana and Abelenkpe pickup.",
    ),
  loader: ({ context }) => context.queryClient.ensureQueryData(storeQuery),
  component: Index,
  errorComponent: PageError,
  notFoundComponent: PageNotFound,
});
function Index() {
  const {
      data: { products: allProducts, settings, categories: allCats },
    } = useSuspenseQuery(storeQuery),
    products = allProducts.filter((p) => p.visible !== false),
    categories = allCats.filter((c) => c.visible && products.some((p) => p.category === c.id)),
    { add } = useCart();

  const picks = settings.featured_ids
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const rail = picks.length ? picks : products.slice(0, 4);

  // Hotspots are simply the first three featured picks that still exist, so
  // the staff featured list stays the single control — no slugs are written
  // into this file. A pick that was deleted drops out of the photo instead of
  // leaving a button that goes nowhere.
  const hotspots = heroProductIds(
    settings.featured_ids,
    products.map((p) => p.id),
  );
  const [selected, setSelected] = useState(hotspots[1] ?? hotspots[0] ?? "");
  const featured =
    products.find((p) => p.id === selected) ??
    products.find((p) => p.id === hotspots[0]) ??
    products[0];

  const stepHotspot = (direction: 1 | -1) => {
    const count = hotspots.length;
    if (count === 0) return;
    const index = hotspots.indexOf(selected);
    const next =
      index === -1 ? (direction === 1 ? 0 : count - 1) : (index + direction + count) % count;
    const nextId = hotspots[next];
    if (nextId !== undefined) setSelected(nextId);
  };

  return (
    <>
      <section className="hero">
        <img
          className="hero-photo"
          {...imageSize(settings.hero_image)}
          src={images[settings.hero_image]}
          alt="A furnished workspace with an adjustable desk and high-back office chair"
          fetchPriority="high"
        />
        <div className="hero-content">
          <p className="eyebrow !mb-4 !mt-0">MB Ventures GH · Abelenkpe, Accra</p>
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
                Visit our Abelenkpe shop
              </Link>
            </Button>
          </div>
        </div>
        {hotspots.map((id, index) => {
          const hotspot = products.find((p) => p.id === id);
          if (hotspot === undefined) return null;
          return (
            <Button
              key={id}
              className={`hotspot ${HOTSPOT_POSITIONS[index] ?? ""}`}
              data-active={selected === id ? "true" : undefined}
              aria-pressed={selected === id}
              title={`View the ${hotspot.name}`}
              aria-label={`View the ${hotspot.name} in this setup`}
              onClick={() => setSelected(id)}
            >
              <Plus />
            </Button>
          );
        })}
        {featured && (
          <div className="hero-product glass">
            <div className="mb-3 flex items-center justify-between">
              <p className="eyebrow text-muted-foreground">In this setup</p>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  aria-label="Previous setup product"
                  onClick={() => stepHotspot(-1)}
                  disabled={hotspots.length < 2}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  aria-label="Next setup product"
                  onClick={() => stepHotspot(1)}
                  disabled={hotspots.length < 2}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
            <div className="hero-product-top">
              <img
                {...imageSize(featured.image_key)}
                src={images[featured.image_key]}
                alt={featured.name}
              />
              <div className="min-w-0">
                <Link to="/product/$slug" params={{ slug: featured.id }}>
                  {/* An h2 keeps the outline legal: this card sits directly
                      under the hero h1, and the section headings that follow
                      are h2 as well. */}
                  <h2 className="text-sm font-semibold">{featured.name}</h2>
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
            Pickup at Abelenkpe
          </span>
          <span>
            <Truck className="size-3" />
            Delivery across Ghana
          </span>
        </div>
      </section>
      <div className="wrap">
        {settings.home_trust.length > 0 && (
          <section className="trust-strip" aria-label="Store assurances">
            {settings.home_trust.map((f) => {
              const Icon = TRUST_ICONS[f.icon] ?? MapPin;
              return (
                <div className="trust-item" key={`${f.icon}-${f.title}-${f.text}`}>
                  <Icon />
                  <div>
                    <strong>{f.title}</strong>
                    <p>{f.text}</p>
                  </div>
                </div>
              );
            })}
          </section>
        )}
        <section className="section">
          <SectionHeading title={settings.home_category_heading} />
          <div className="category-grid">
            {categories.map((c) => (
              <Link
                to="/catalogue"
                search={{ category: c.id, q: "" }}
                className="category-tile"
                key={c.id}
              >
                <img
                  {...imageSize(c.image_key)}
                  src={images[c.image_key]}
                  alt={c.name}
                  loading="lazy"
                />
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
          <SectionHeading title={settings.home_featured_heading} />
          <div className="product-grid product-rail">
            {rail.map((p) => (
              <ProductCard product={p} key={p.id} />
            ))}
          </div>
        </section>
        <section className="section setup-section">
          <img
            {...imageSize(settings.setup_image)}
            src={images[settings.setup_image]}
            className="setup-photo"
            alt="An office desk and chair in a daylight workspace"
            loading="lazy"
          />
          <div>
            <p className="eyebrow !mt-0">{settings.home_setup_eyebrow}</p>
            <h2 className="mt-4">{settings.home_setup_heading}</h2>
            <p>{settings.home_setup_body}</p>
            <div className="mt-6 divide-y divide-border">
              {rail.slice(0, 3).map((p) => (
                <div className="flex items-center justify-between py-3" key={p.id}>
                  <Link to="/product/$slug" params={{ slug: p.id }} className="min-h-10 text-sm">
                    {p.name}
                  </Link>
                  <Button
                    variant="ghost"
                    aria-label={`Add ${p.name} to setup`}
                    onClick={() => add(p)}
                    className="h-11 gap-3 px-3 text-xs"
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
        {settings.home_brands.length > 0 && (
          <div className="brand-strip section">
            {settings.home_brands.map((brand) => (
              <span key={brand}>{brand}</span>
            ))}
          </div>
        )}
        <section className="section grid gap-8 pb-4 md:grid-cols-[1fr_1fr]">
          <div>
            <p className="eyebrow text-muted-foreground">From online to in-store</p>
            <h2 className="mt-4 text-3xl">{settings.home_cta_heading}</h2>
          </div>
          <div>
            <p className="text-sm leading-7 text-muted-foreground">{settings.home_cta_body}</p>
            <Link
              to="/$page"
              params={{ page: "about" }}
              className="mt-5 inline-flex min-h-10 items-center gap-2 text-sm font-medium"
            >
              About MB Ventures GH <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
