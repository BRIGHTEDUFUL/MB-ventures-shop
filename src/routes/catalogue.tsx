import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { SlidersHorizontal, X, Grid2X2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard, PageError, PageNotFound } from "@/components/store-ui";
import { filterCatalogue, storeQuery, pageHead, money, PRICE_SLIDER_MAX } from "@/lib/store";
export const Route = createFileRoute("/catalogue")({
  validateSearch: (s: Record<string, unknown>) => ({
    category: typeof s["category"] === "string" ? s["category"] : "",
    q: typeof s["q"] === "string" ? s["q"] : "",
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(storeQuery),
  head: ({ match, loaderData }) =>
    pageHead(
      loaderData?.categories.find((c) => c.id === match.search.category)?.name ||
        "Shop the catalogue",
      "Computer accessories, desks, chairs, mounts and streaming equipment in Ghana cedis.",
    ),
  component: Catalogue,
  errorComponent: PageError,
  notFoundComponent: () => <PageNotFound title="Page not found" />,
});
function Catalogue() {
  const {
      data: { products, categories: allCats },
    } = useSuspenseQuery(storeQuery),
    categories = allCats.filter((c) => c.visible),
    // Brands come from the same shelf the grid draws from: a brand that only
    // exists on a hidden product would filter down to an empty grid.
    brands = [...new Set(products.filter((p) => p.visible !== false).map((p) => p.brand))].sort(),
    search = Route.useSearch(),
    navigate = Route.useNavigate();
  const [sort, setSort] = useState("name"),
    // No price bound by default — the filter stays wide open until the
    // shopper drags the slider (whose top is the shop's fixed GH₵ 50,000).
    [max, setMax] = useState<number | null>(null),
    [stock, setStock] = useState(false),
    [sale, setSale] = useState(false),
    [brand, setBrand] = useState(""),
    [open, setOpen] = useState(false),
    [page, setPage] = useState(1);
  const filtered = filterCatalogue(products, {
    category: search.category,
    q: search.q,
    max,
    stock,
    sale,
    brand,
  }).sort((a, b) =>
    sort === "low"
      ? a.price - b.price
      : sort === "high"
        ? b.price - a.price
        : a.name.localeCompare(b.name),
  );
  // Filters can shrink the list from under the current page (a header search
  // lands here without a reset), so the page is clamped to what exists.
  const pageCount = Math.max(1, Math.ceil(filtered.length / 9)),
    pageSafe = Math.min(page, pageCount);
  const title = search.q
    ? `Results for “${search.q}”`
    : categories.find((c) => c.id === search.category)?.name || "All workspace essentials";
  const filterPanel = (
    <>
      <h2>Categories</h2>
      <select
        aria-label="Filter category"
        value={search.category}
        onChange={(e) => {
          setPage(1);
          navigate({ search: { ...search, category: e.target.value } });
        }}
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <h2>Price</h2>
      <label>
        Up to {money(max ?? PRICE_SLIDER_MAX)}
        <input
          type="range"
          min="0"
          max={PRICE_SLIDER_MAX}
          step="100"
          value={Math.min(max ?? PRICE_SLIDER_MAX, PRICE_SLIDER_MAX)}
          onChange={(e) => {
            setMax(Number(e.target.value));
            setPage(1);
          }}
        />
      </label>
      <h2>Brand</h2>
      <select
        aria-label="Filter brand"
        value={brand}
        onChange={(e) => {
          setPage(1);
          setBrand(e.target.value);
        }}
      >
        <option value="">All brands</option>
        {brands.map((b) => (
          <option key={b}>{b}</option>
        ))}
      </select>
      <h2>Availability</h2>
      <label className="filter-line">
        <input
          type="checkbox"
          checked={stock}
          onChange={(e) => {
            setPage(1);
            setStock(e.target.checked);
          }}
        />
        In stock only
      </label>
      <label className="filter-line">
        <input
          type="checkbox"
          checked={sale}
          onChange={(e) => {
            setPage(1);
            setSale(e.target.checked);
          }}
        />
        On sale
      </label>
      <Button
        variant="link"
        className="mt-5 px-0"
        onClick={() => {
          setMax(null);
          setStock(false);
          setSale(false);
          setBrand("");
          setPage(1);
        }}
      >
        Clear filters
      </Button>
    </>
  );
  return (
    <div className="page-content wrap">
      {/* One trail shape everywhere: Home and parent pages are links, the page
          you are on is plain text. The category shows its display name, the
          same one the h1 uses, not its id. */}
      <p className="breadcrumbs">
        <Link to="/" className="flex min-h-10 items-center px-1.5 -mx-1.5">
          Home
        </Link>
        <span>/</span>
        <span>Shop</span>
        {search.category && (
          <>
            <span>/</span>
            <span>{categories.find((c) => c.id === search.category)?.name ?? search.category}</span>
          </>
        )}
      </p>
      <h1 className="page-title">{title}</h1>
      <p className="page-lead">
        Desks, chairs and everyday technology for your workspace in Ghana.
      </p>
      <div className="toolbar">
        <p className="text-xs text-muted-foreground">{filtered.length} products</p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="h-10 text-xs md:hidden"
            onClick={() => setOpen(true)}
          >
            <SlidersHorizontal />
            Filters
          </Button>
          <select
            aria-label="Sort products"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="name">Sort: Name</option>
            <option value="low">Price: Low to high</option>
            <option value="high">Price: High to low</option>
          </select>
          <Grid2X2 className="my-auto hidden size-4 md:block" />
        </div>
      </div>
      <div className="listing-layout">
        <aside className="filters">{filterPanel}</aside>
        <div>
          {filtered.length ? (
            <div className="product-grid">
              {filtered.slice((pageSafe - 1) * 9, pageSafe * 9).map((p) => (
                <ProductCard product={p} key={p.id} />
              ))}
            </div>
          ) : (
            <div className="py-20 text-center">
              <p>No products match these filters.</p>
              <Button
                variant="outline"
                className="mt-5"
                onClick={() => {
                  setMax(null);
                  setStock(false);
                  setSale(false);
                  setBrand("");
                  setPage(1);
                  navigate({ search: { q: "", category: "" } });
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
          <div className="mt-10 flex items-center justify-between border-t border-border pt-6">
            <p className="text-xs text-muted-foreground">
              Showing {filtered.length ? (pageSafe - 1) * 9 + 1 : 0} to{" "}
              {Math.min(pageSafe * 9, filtered.length)} of {filtered.length}
            </p>
            <div className="flex gap-2">
              {Array.from({ length: pageCount }, (_, i) => (
                <Button
                  key={i}
                  variant={pageSafe === i + 1 ? "default" : "outline"}
                  className="h-11 w-11 p-0"
                  onClick={() => setPage(i + 1)}
                >
                  {i + 1}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="scrim" />
          <Dialog.Content className="drawer-content" aria-describedby={undefined}>
            <Dialog.Title className="text-xl">Filter products</Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                className="overlay-close icon-control"
                aria-label="Close filters"
              >
                <X />
              </Button>
            </Dialog.Close>
            <div className="mt-6">{filterPanel}</div>
            <Button className="mt-8 w-full" onClick={() => setOpen(false)}>
              Show {filtered.length} products
            </Button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
