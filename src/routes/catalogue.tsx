import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard, PageError, PageNotFound } from "@/components/store-ui";
import {
  filterCatalogue,
  searchScore,
  searchTerms,
  pageWindow,
  storeQuery,
  pageHead,
  money,
  PRICE_SLIDER_MAX,
} from "@/lib/store";

const PAGE_SIZE = 9;

/** The sort keys the URL can carry; absent = the shop's default for the query. */
type SortKey = "relevance" | "name" | "low" | "high";

/**
 * Everything the listing shows lives in the URL — the whole filter row is
 * shareable, survives a refresh, and the back button walks it back. The
 * parser is deliberately paranoid: a hand-edited link must degrade to a
 * sensible default, never to a broken grid.
 *
 * The params beyond `category`/`q` are optional in the *type* so the links
 * all over the app keep setting just those two; `validateSearch` still fills
 * every default at parse time and the component tightens them right back.
 */
type CatalogueSearch = {
  category: string;
  q: string;
  sort?: SortKey | null;
  /** Upper price bound; absent/`null` = no ceiling. */
  max?: number | null;
  stock?: boolean;
  sale?: boolean;
  brand?: string;
  page?: number;
};

/** `max` arrives as a number from the URL but may be anything a human types. */
const parseMax = (raw: unknown): number | null => {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.min(n, PRICE_SLIDER_MAX) : null;
};

export const Route = createFileRoute("/catalogue")({
  validateSearch: (s: Record<string, unknown>): CatalogueSearch => ({
    category: typeof s["category"] === "string" ? s["category"] : "",
    q: typeof s["q"] === "string" ? s["q"] : "",
    sort:
      s["sort"] === "relevance" ||
      s["sort"] === "name" ||
      s["sort"] === "low" ||
      s["sort"] === "high"
        ? s["sort"]
        : null,
    max: parseMax(s["max"]),
    stock: s["stock"] === true || s["stock"] === "true",
    sale: s["sale"] === true || s["sale"] === "true",
    brand: typeof s["brand"] === "string" ? s["brand"] : "",
    page:
      typeof s["page"] === "number" && Number.isInteger(s["page"]) && s["page"] > 0 ? s["page"] : 1,
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
    rawSearch = Route.useSearch(),
    navigate = Route.useNavigate();
  // The links across the app only set `category`/`q`, so the type keeps the
  // rest optional — but `validateSearch` filled every default at parse time,
  // and this tightens them right back so the panel code never sees undefined.
  // Memoised on the fields (not the object) so `setParams` below keeps a
  // stable dependency across renders.
  const search: Required<CatalogueSearch> = useMemo(
    () => ({
      category: rawSearch.category,
      q: rawSearch.q,
      sort: rawSearch.sort ?? null,
      max: rawSearch.max ?? null,
      stock: rawSearch.stock ?? false,
      sale: rawSearch.sale ?? false,
      brand: rawSearch.brand ?? "",
      page: rawSearch.page ?? 1,
    }),
    [
      rawSearch.category,
      rawSearch.q,
      rawSearch.sort,
      rawSearch.max,
      rawSearch.stock,
      rawSearch.sale,
      rawSearch.brand,
      rawSearch.page,
    ],
  );
  const [drawer, setDrawer] = useState(false),
    // The toolbar's own search box: local state while typing, URL on pause,
    // so a fast typist doesn't create a history entry per keystroke.
    [draft, setDraft] = useState(search.q);

  /**
   * The one writer for the URL. Cleared values are dropped rather than
   * written as `&stock=false` litter — the router omits `undefined` keys —
   * and any filter change restarts the listing at page 1.
   */
  const setParams = useCallback(
    (patch: Partial<CatalogueSearch>, replace = false) => {
      const merged: Required<CatalogueSearch> = { ...search, ...patch, page: patch.page ?? 1 };
      const next: Record<string, string | number | boolean> = {};
      if (merged.category) next["category"] = merged.category;
      if (merged.q) next["q"] = merged.q;
      if (merged.sort) next["sort"] = merged.sort;
      if (merged.max !== null) next["max"] = merged.max;
      if (merged.stock) next["stock"] = true;
      if (merged.sale) next["sale"] = true;
      if (merged.brand) next["brand"] = merged.brand;
      if (merged.page > 1) next["page"] = merged.page;
      navigate({ search: next as unknown as CatalogueSearch, replace });
    },
    [search, navigate],
  );

  const q = search.q.trim(),
    terms = searchTerms(q),
    // Relevance is what a search deserves and a plain browse doesn't need:
    // with no query every score ties and it falls back to name order.
    sort: SortKey = search.sort ?? (terms.length ? "relevance" : "name");

  // Debounce the toolbar box into the URL; `replace` keeps typing out of the
  // history. Back/forward, a chip or a fresh overlay search change `q` from
  // under the box — the effect below keeps the field in step, and the guard
  // here stops those renders from navigating back to a stale draft.
  useEffect(() => {
    if (draft.trim() === search.q) return;
    const timer = setTimeout(() => setParams({ q: draft.trim() }, true), 300);
    return () => clearTimeout(timer);
  }, [draft, search.q, setParams]);
  useEffect(() => setDraft(search.q), [search.q]);

  const filtered = filterCatalogue(products, {
    category: search.category,
    q,
    max: search.max,
    stock: search.stock,
    sale: search.sale,
    brand: search.brand,
  }).sort((a, b) =>
    sort === "low"
      ? a.price - b.price
      : sort === "high"
        ? b.price - a.price
        : sort === "relevance"
          ? searchScore(b, terms) - searchScore(a, terms) || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name),
  );

  // Facet counts respect every filter *except* the category itself — you are
  // choosing between them — so a category reading 0 is one that would empty
  // the grid if picked, and the numbers stay honest as other filters change.
  const facets = useMemo(() => {
    const tally = new Map<string, number>();
    const matching = filterCatalogue(products, {
      category: "",
      q: search.q.trim(),
      max: search.max,
      stock: search.stock,
      sale: search.sale,
      brand: search.brand,
    });
    for (const p of matching) tally.set(p.category, (tally.get(p.category) ?? 0) + 1);
    return { total: matching.length, tally };
  }, [products, search.q, search.max, search.stock, search.sale, search.brand]);

  // Filters can shrink the list from under the current page (a header search
  // lands here without a reset), so the page is clamped to what exists.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
    pageSafe = Math.min(search.page, pageCount);
  const title = q
    ? `Results for “${q}”`
    : categories.find((c) => c.id === search.category)?.name || "All workspace essentials";

  // One row of removable chips beats a puzzle of "what is even on right
  // now": each chip removes exactly its own filter, "Clear all" wipes the lot.
  const chips: Array<{ label: string; clear: () => void }> = [];
  if (q) chips.push({ label: `“${q}”`, clear: () => setParams({ q: "" }) });
  if (search.category)
    chips.push({
      label: categories.find((c) => c.id === search.category)?.name ?? search.category,
      clear: () => setParams({ category: "" }),
    });
  if (search.brand) chips.push({ label: search.brand, clear: () => setParams({ brand: "" }) });
  if (search.max !== null)
    chips.push({ label: `Up to ${money(search.max)}`, clear: () => setParams({ max: null }) });
  if (search.stock)
    chips.push({ label: "In stock only", clear: () => setParams({ stock: false }) });
  if (search.sale) chips.push({ label: "On sale", clear: () => setParams({ sale: false }) });
  const clearAll = () =>
    setParams({ q: "", category: "", brand: "", max: null, stock: false, sale: false });

  const filterPanel = (
    <>
      <h2>Categories</h2>
      <div className="facet-list" role="group" aria-label="Filter category">
        <button
          type="button"
          className="facet-option"
          aria-pressed={!search.category}
          onClick={() => setParams({ category: "" })}
        >
          <span>All categories</span>
          <span className="facet-count">{facets.total}</span>
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className="facet-option"
            aria-pressed={search.category === c.id}
            onClick={() => setParams({ category: c.id })}
          >
            <span>{c.name}</span>
            <span className="facet-count">{facets.tally.get(c.id) ?? 0}</span>
          </button>
        ))}
      </div>
      <h2>Price</h2>
      <label>
        Up to {money(search.max ?? PRICE_SLIDER_MAX)}
        <input
          type="range"
          min="0"
          max={PRICE_SLIDER_MAX}
          step="100"
          value={Math.min(search.max ?? PRICE_SLIDER_MAX, PRICE_SLIDER_MAX)}
          onChange={(e) => {
            // Dragging fires per tick — `replace` so one drag is one history
            // entry instead of fifty.
            setParams({ max: Number(e.target.value) }, true);
          }}
        />
      </label>
      <div className="price-presets">
        {([null, 250, 500, 1000, 2000] as const).map((cap) => (
          <button
            key={cap ?? "any"}
            type="button"
            className="price-preset"
            aria-pressed={search.max === cap}
            onClick={() => setParams({ max: cap })}
          >
            {cap === null ? "Any" : `≤ ${money(cap)}`}
          </button>
        ))}
      </div>
      <h2>Brand</h2>
      <select
        aria-label="Filter brand"
        value={search.brand}
        onChange={(e) => setParams({ brand: e.target.value })}
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
          checked={search.stock}
          onChange={(e) => setParams({ stock: e.target.checked })}
        />
        In stock only
      </label>
      <label className="filter-line">
        <input
          type="checkbox"
          checked={search.sale}
          onChange={(e) => setParams({ sale: e.target.checked })}
        />
        On sale
      </label>
      <Button variant="link" className="mt-5 px-0" onClick={clearAll}>
        Clear all filters
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
        <p className="text-xs text-muted-foreground">
          {filtered.length} product{filtered.length === 1 ? "" : "s"}
          {q ? ` for “${q}”` : ""}
        </p>
        <div className="flex gap-3">
          <div className="toolbar-search">
            <label className="sr-only" htmlFor="catalogue-search">
              Search products
            </label>
            <input
              id="catalogue-search"
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Search products…"
              autoComplete="off"
            />
          </div>
          <Button
            variant="outline"
            className="h-10 text-xs md:hidden"
            onClick={() => setDrawer(true)}
          >
            <SlidersHorizontal />
            Filters
          </Button>
          <select
            aria-label="Sort products"
            value={sort}
            onChange={(e) => setParams({ sort: e.target.value as SortKey })}
          >
            <option value="relevance">Sort: Relevance</option>
            <option value="name">Sort: Name</option>
            <option value="low">Price: Low to high</option>
            <option value="high">Price: High to low</option>
          </select>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="filter-chips">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className="filter-chip"
              onClick={chip.clear}
              aria-label={`Remove filter ${chip.label}`}
            >
              {chip.label}
              <X aria-hidden />
            </button>
          ))}
          {chips.length > 1 && (
            <button type="button" className="filter-chip filter-chip-clear" onClick={clearAll}>
              Clear all
            </button>
          )}
        </div>
      )}
      <div className="listing-layout">
        <aside className="filters">{filterPanel}</aside>
        <div>
          {filtered.length ? (
            <div className="product-grid">
              {filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE).map((p) => (
                <ProductCard product={p} key={p.id} />
              ))}
            </div>
          ) : (
            <div className="py-20 text-center">
              <p>{q ? `No products match “${q}”.` : "No products match these filters."}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Try a different search, or clear the filters above.
              </p>
              <Button variant="outline" className="mt-5" onClick={clearAll}>
                Clear all filters
              </Button>
            </div>
          )}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
            <p className="text-xs text-muted-foreground">
              Showing {filtered.length ? (pageSafe - 1) * PAGE_SIZE + 1 : 0} to{" "}
              {Math.min(pageSafe * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            {pageCount > 1 && (
              <nav className="pagination" aria-label="Catalogue pages">
                <Button
                  variant="outline"
                  className="h-11 px-3"
                  disabled={pageSafe <= 1}
                  aria-label="Previous page"
                  onClick={() => setParams({ page: pageSafe - 1 })}
                >
                  Prev
                </Button>
                {pageWindow(pageSafe, pageCount).map((n, i) =>
                  n === null ? (
                    <span key={`gap-${i}`} className="pagination-gap" aria-hidden>
                      …
                    </span>
                  ) : (
                    <Button
                      key={n}
                      variant={pageSafe === n ? "default" : "outline"}
                      className="h-11 w-11 p-0"
                      aria-current={pageSafe === n ? "page" : undefined}
                      aria-label={`Page ${n}`}
                      onClick={() => setParams({ page: n })}
                    >
                      {n}
                    </Button>
                  ),
                )}
                <Button
                  variant="outline"
                  className="h-11 px-3"
                  disabled={pageSafe >= pageCount}
                  aria-label="Next page"
                  onClick={() => setParams({ page: pageSafe + 1 })}
                >
                  Next
                </Button>
              </nav>
            )}
          </div>
        </div>
      </div>
      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
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
            <Button className="mt-8 w-full" onClick={() => setDrawer(false)}>
              Show {filtered.length} products
            </Button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
