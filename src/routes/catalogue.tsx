import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { SlidersHorizontal, X, Grid2X2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard, PageError, PageNotFound } from "@/components/store-ui";
import { storeQuery, pageHead, money } from "@/lib/store";
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
  notFoundComponent: PageNotFound,
});
function Catalogue() {
  const {
      data: { products, categories: allCats },
    } = useSuspenseQuery(storeQuery),
    categories = allCats.filter((c) => c.visible),
    search = Route.useSearch(),
    navigate = Route.useNavigate();
  const [sort, setSort] = useState("name"),
    [max, setMax] = useState(5000),
    [stock, setStock] = useState(false),
    [sale, setSale] = useState(false),
    [brand, setBrand] = useState(""),
    [open, setOpen] = useState(false),
    [page, setPage] = useState(1);
  const filtered = products
    .filter(
      (p) =>
        (!search.category || p.category === search.category) &&
        (!search.q || `${p.name} ${p.brand}`.toLowerCase().includes(search.q.toLowerCase())) &&
        p.price <= max &&
        (!stock || (p.verified && p.stock > 0)) &&
        (!sale || p.original_price) &&
        (!brand || p.brand === brand),
    )
    .sort((a, b) =>
      sort === "low"
        ? a.price - b.price
        : sort === "high"
          ? b.price - a.price
          : a.name.localeCompare(b.name),
    );
  const title = search.q
    ? `Results for “${search.q}”`
    : categories.find((c) => c.id === search.category)?.name || "All workspace essentials";
  const filterPanel = (
    <>
      <h3>Categories</h3>
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
      <h3>Price</h3>
      <label>
        Up to {money(max)}
        <input
          type="range"
          min="0"
          max="5000"
          step="100"
          value={max}
          onChange={(e) => {
            setMax(Number(e.target.value));
            setPage(1);
          }}
        />
      </label>
      <h3>Brand</h3>
      <select aria-label="Filter brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
        <option value="">All brands</option>
        {[...new Set(products.map((p) => p.brand))].map((b) => (
          <option key={b}>{b}</option>
        ))}
      </select>
      <h3>Availability</h3>
      <label className="filter-line">
        <input type="checkbox" checked={stock} onChange={(e) => setStock(e.target.checked)} />
        In stock only
      </label>
      <label className="filter-line">
        <input type="checkbox" checked={sale} onChange={(e) => setSale(e.target.checked)} />
        On sale
      </label>
      <Button
        variant="link"
        className="mt-5 px-0"
        onClick={() => {
          setMax(5000);
          setStock(false);
          setSale(false);
          setBrand("");
        }}
      >
        Clear filters
      </Button>
    </>
  );
  return (
    <div className="page-content wrap">
      <p className="breadcrumbs">Home / Shop / {search.category || "All products"}</p>
      <h1 className="page-title">{title}</h1>
      <p className="page-lead">Desks, chairs and everyday technology for your workspace.</p>
      <p className="mt-4 text-xs text-muted-foreground">
        Sample catalogue. Prices and availability will be confirmed by the Abelenkpe shop before
        ordering opens.
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
          <select aria-label="Sort products" value={sort} onChange={(e) => setSort(e.target.value)}>
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
              {filtered.slice((page - 1) * 9, page * 9).map((p) => (
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
                  setMax(5000);
                  setStock(false);
                  setSale(false);
                  setBrand("");
                  navigate({ search: { q: "", category: "" } });
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
          <div className="mt-10 flex items-center justify-between border-t border-border pt-6">
            <p className="text-xs text-muted-foreground">
              Showing {filtered.length ? (page - 1) * 9 + 1 : 0} to{" "}
              {Math.min(page * 9, filtered.length)} of {filtered.length}
            </p>
            <div className="flex gap-2">
              {Array.from({ length: Math.ceil(filtered.length / 9) }, (_, i) => (
                <Button
                  key={i}
                  variant={page === i + 1 ? "default" : "outline"}
                  className="h-9 w-9 p-0"
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
