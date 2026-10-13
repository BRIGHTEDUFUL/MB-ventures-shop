import { useEffect, useState } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Search,
  ShoppingBag,
  User,
  ChevronDown,
  ArrowRight,
  MapPin,
  MessageCircle,
  Phone,
  Truck,
  X,
  Home,
  Grid2X2,
  Menu,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "./store-provider";
import { CartLines, FreeDelivery } from "./store-ui";
import { money, storeQuery, announcementText, whatsappHref } from "@/lib/store";
import { images, imageSize } from "@/lib/store-images";
export function StoreHeader() {
  const { data: hd } = useQuery(storeQuery),
    categories = (hd?.categories ?? []).filter((c) => c.visible),
    cart = useCart(),
    [mega, setMega] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => setMega(false), [pathname]);
  // Empty announcement = staff turned the bar off, so render nothing at all.
  // While settings are still loading we also render nothing: flashing a
  // default and then removing it shifts the sticky header underneath.
  const announcement = announcementText(hd?.settings);
  return (
    <>
      {announcement !== "" && (
        <div className="facts-bar flex items-center justify-between gap-2 bg-primary px-3 py-1.5 text-[11px] text-primary-foreground sm:px-8 sm:py-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="truncate sm:hidden">Abelenkpe, Accra · Ghana delivery</span>
            <span className="hidden truncate sm:inline">{announcement}</span>
          </span>
          <Link
            to="/track"
            className="flex shrink-0 items-center gap-1 whitespace-nowrap font-medium hover:underline"
          >
            <span>Track order</span>
            <ArrowRight className="size-3" aria-hidden />
          </Link>
        </div>
      )}
      <header className="store-header glass">
        <div className="header-top">
          <Link to="/" className="header-logo">
            <img {...imageSize("logo")} src={images["logo"]} alt="MB Ventures GH logo" />
            <span className="brand-text">
              MB VENTURES<span className="text-link"> GH</span>
              <small>YOUR WORKSPACE STORE</small>
            </span>
          </Link>
          <Button
            variant="ghost"
            className="header-search"
            onClick={() => cart.setSearchOpen(true)}
          >
            <span className="flex items-center gap-3">
              <Search className="size-4" />
              Search desks, chairs, accessories...
            </span>
            <kbd className="font-mono text-[10px]">⌘ K</kbd>
          </Button>
          <div className="header-actions flex items-center gap-2">
            <Button
              variant="ghost"
              className="icon-control md:hidden"
              aria-label="Search products"
              onClick={() => cart.setSearchOpen(true)}
            >
              <Search />
            </Button>
            <Button
              asChild
              variant="ghost"
              className="icon-control desktop-only"
              title="Your account"
            >
              <Link to="/account">
                <User />
              </Link>
            </Button>
            <Button
              variant="ghost"
              className="relative icon-control"
              aria-label={`Open cart, ${cart.count} items`}
              title="Open cart"
              onClick={() => cart.setCartOpen(true)}
            >
              <ShoppingBag />
              {cart.count > 0 && (
                <span
                  className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground"
                  aria-live="polite"
                >
                  {cart.count}
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              className="icon-control md:hidden"
              aria-label={cart.menuOpen ? "Close menu" : "Open menu"}
              onClick={() => cart.setMenuOpen(!cart.menuOpen)}
            >
              {cart.menuOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        <nav className="header-nav" aria-label="Product categories">
          <Button
            variant="ghost"
            className="h-6 gap-1 p-0 text-xs"
            onClick={() => setMega(!mega)}
            aria-expanded={mega}
          >
            Shop all <ChevronDown className="size-3" />
          </Button>
          {categories.map((c) => (
            <Link key={c.id} to="/catalogue" search={{ category: c.id, q: "" }}>
              {c.name}
            </Link>
          ))}
        </nav>
        {mega && (
          <div
            className="hidden md:block border-t border-border bg-card p-6"
            style={{ borderRadius: "0 0 18px 18px" }}
          >
            <div className="grid gap-6 sm:grid-cols-[1fr_220px]">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="mb-3 text-lg font-semibold">Shop your workspace</h3>
                  {categories.map((c) => (
                    <Link
                      className="my-2 block text-sm hover:text-link transition-colors"
                      key={c.id}
                      to="/catalogue"
                      search={{ category: c.id, q: "" }}
                    >
                      {c.name} <ArrowRight className="ml-1 inline size-3" />
                    </Link>
                  ))}
                </div>
                <div>
                  <h3 className="mb-3 text-lg font-semibold">From our Abelenkpe shop</h3>
                  <Link
                    className="my-2 block text-sm hover:text-link transition-colors"
                    to="/$page"
                    params={{ page: "delivery" }}
                  >
                    Delivery & pickup
                  </Link>
                  <Link
                    className="my-2 block text-sm hover:text-link transition-colors"
                    to="/$page"
                    params={{ page: "warranty" }}
                  >
                    Warranty
                  </Link>
                  <Link
                    className="my-2 block text-sm hover:text-link transition-colors"
                    to="/$page"
                    params={{ page: "contact" }}
                  >
                    Contact the shop
                  </Link>
                  <Link
                    className="my-2 block text-sm hover:text-link transition-colors"
                    to="/track"
                  >
                    Track an order
                  </Link>
                </div>
              </div>
              <img
                src={images[hd?.settings.setup_image ?? "workspace"]}
                alt="Workspace from our shop"
                className="hidden h-44 w-full rounded-lg object-cover sm:block"
              />
            </div>
          </div>
        )}
      </header>
    </>
  );
}
export function StoreOverlays() {
  const cart = useCart(),
    [query, setQuery] = useState("");
  // `setSearchOpen` is a stable state setter, so the ⌘K listener below can depend
  // on it directly instead of on the whole context object, which is recreated on
  // every render of the provider.
  const { setSearchOpen } = cart;
  const { data } = useQuery(storeQuery);
  const categories = (data?.categories ?? []).filter((c) => c.visible);
  const s = data?.settings;
  const whatsapp = s ? whatsappHref(s) : null;
  const router = useRouter();
  const results = (data?.products || [])
    .filter((p) => `${p.name} ${p.brand}`.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 6);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setMenuOpen } = cart;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [setSearchOpen]);
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname, setMenuOpen]);
  return (
    <>
      <Dialog.Root open={cart.cartOpen} onOpenChange={cart.setCartOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="scrim" />
          <Dialog.Content className="drawer-content" aria-describedby={undefined}>
            <Dialog.Title className="font-display text-2xl">
              Your cart <span className="ml-2 text-sm text-muted-foreground">({cart.count})</span>
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                className="overlay-close icon-control"
                aria-label="Close cart"
              >
                <X />
              </Button>
            </Dialog.Close>
            {cart.lines.length === 0 ? (
              <div className="mt-20 text-center">
                <ShoppingBag className="mx-auto mb-5 size-10 text-muted-foreground" />
                <p className="mb-6">Your cart is empty.</p>
                <Button onClick={() => cart.setCartOpen(false)} asChild>
                  <Link to="/catalogue" search={{ category: "", q: "" }}>
                    Shop the catalogue
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <CartLines />
                <FreeDelivery />
                <div className="summary-row summary-total mt-8">
                  <span>Subtotal</span>
                  <span>{money(cart.subtotal, true)}</span>
                </div>
                <p className="my-4 text-xs text-muted-foreground">
                  Delivery calculated at checkout. No payment is charged automatically.
                </p>
                <Button asChild className="w-full" onClick={() => cart.setCartOpen(false)}>
                  <Link to="/checkout">
                    Checkout <ArrowRight />
                  </Link>
                </Button>
                <Link
                  onClick={() => cart.setCartOpen(false)}
                  to="/cart"
                  className="mt-5 block text-center text-sm"
                >
                  View cart
                </Link>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={cart.searchOpen} onOpenChange={cart.setSearchOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="scrim" />
          <Dialog.Content className="search-panel" aria-describedby={undefined}>
            <Dialog.Title className="mb-5 font-display text-xl">Search the store</Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                className="overlay-close icon-control"
                aria-label="Close search"
              >
                <X />
              </Button>
            </Dialog.Close>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                cart.setSearchOpen(false);
                router.navigate({ to: "/catalogue", search: { q: query, category: "" } });
              }}
            >
              <label className="sr-only" htmlFor="store-search">
                Search products
              </label>
              <input
                id="store-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What does your setup need?"
                autoComplete="off"
              />
            </form>
            <p className="eyebrow mt-6 text-muted-foreground">
              {query ? "Products" : "Popular in the shop"}
            </p>
            {results.map((p) => (
              <Link
                key={p.id}
                to="/product/$slug"
                params={{ slug: p.id }}
                onClick={() => cart.setSearchOpen(false)}
                className="flex items-center gap-4 border-b border-border py-4"
              >
                <img
                  src={images[p.image_key]}
                  className="h-14 w-14 rounded-lg object-contain"
                  alt={p.name}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.brand} ·{" "}
                    {p.verified ? (p.stock ? "In stock" : "Out of stock") : "Sample catalogue"}
                  </p>
                </div>
                <span className="text-sm font-semibold">{money(p.price)}</span>
              </Link>
            ))}
            {results.length === 0 && (
              <p className="py-8 text-sm text-muted-foreground">
                No products match “{query}”. Try a different name.
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              {categories
                .filter((c) => !query || c.name.toLowerCase().includes(query.toLowerCase()))
                .map((c) => (
                  <Button
                    variant="secondary"
                    size="sm"
                    key={c.id}
                    asChild
                    onClick={() => cart.setSearchOpen(false)}
                  >
                    <Link to="/catalogue" search={{ category: c.id, q: "" }}>
                      {c.short_name}
                    </Link>
                  </Button>
                ))}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={cart.menuOpen} onOpenChange={cart.setMenuOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="scrim" />
          <Dialog.Content
            className="drawer-content mobile-menu-drawer"
            aria-describedby={undefined}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <Link to="/" onClick={() => cart.setMenuOpen(false)} className="header-logo">
                <img
                  {...imageSize("logo")}
                  src={images["logo"]}
                  alt="MB Ventures GH logo"
                  className="h-9 w-10 rounded-md object-cover"
                />
                <span className="brand-text text-sm">
                  MB VENTURES<span className="text-link"> GH</span>
                  <small className="text-[9px]">YOUR WORKSPACE STORE</small>
                </span>
              </Link>
              <Dialog.Close asChild>
                <Button variant="ghost" className="icon-control" aria-label="Close menu">
                  <X />
                </Button>
              </Dialog.Close>
            </div>

            <button
              type="button"
              onClick={() => {
                cart.setMenuOpen(false);
                cart.setSearchOpen(true);
              }}
              className="mt-4 flex w-full items-center justify-between rounded-xl border border-border bg-secondary/50 px-3.5 py-2.5 text-xs text-muted-foreground hover:bg-secondary transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <Search className="size-3.5" />
                Search desks, chairs, mounts...
              </span>
              <kbd className="font-mono text-[10px] bg-background px-1.5 py-0.5 rounded border border-border">
                ⌘ K
              </kbd>
            </button>

            <div className="mt-5">
              <p className="eyebrow text-muted-foreground mb-2 text-[11px] font-semibold tracking-wider uppercase">
                Shop Categories
              </p>
              <div className="space-y-1">
                {categories.map((c) => (
                  <Link
                    key={c.id}
                    to="/catalogue"
                    search={{ category: c.id, q: "" }}
                    onClick={() => cart.setMenuOpen(false)}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-medium hover:bg-secondary/70 transition-colors"
                  >
                    <span>{c.name}</span>
                    <ArrowRight className="size-3.5 text-muted-foreground shrink-0 ml-2" />
                  </Link>
                ))}
                <Link
                  to="/catalogue"
                  search={{ category: "", q: "" }}
                  onClick={() => cart.setMenuOpen(false)}
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-semibold text-link hover:bg-secondary/70 transition-colors"
                >
                  <span>View all products</span>
                  <ArrowRight className="size-3.5 shrink-0 ml-2" />
                </Link>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-border">
              <p className="eyebrow text-muted-foreground mb-2.5 text-[11px] font-semibold tracking-wider uppercase">
                Store & Customer Care
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Link
                  to="/$page"
                  params={{ page: "delivery" }}
                  onClick={() => cart.setMenuOpen(false)}
                  className="p-3 rounded-lg border border-border/70 hover:bg-secondary/50 transition-colors block"
                >
                  <div className="font-medium text-foreground">Delivery & Pickup</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Accra & Ghana wide</div>
                </Link>
                <Link
                  to="/track"
                  onClick={() => cart.setMenuOpen(false)}
                  className="p-3 rounded-lg border border-border/70 hover:bg-secondary/50 transition-colors block"
                >
                  <div className="font-medium text-foreground">Track Order</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Live order status</div>
                </Link>
                <Link
                  to="/$page"
                  params={{ page: "warranty" }}
                  onClick={() => cart.setMenuOpen(false)}
                  className="p-3 rounded-lg border border-border/70 hover:bg-secondary/50 transition-colors block"
                >
                  <div className="font-medium text-foreground">Warranty</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Tested & supported</div>
                </Link>
                <Link
                  to="/$page"
                  params={{ page: "contact" }}
                  onClick={() => cart.setMenuOpen(false)}
                  className="p-3 rounded-lg border border-border/70 hover:bg-secondary/50 transition-colors block"
                >
                  <div className="font-medium text-foreground">Contact Shop</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Reach the team</div>
                </Link>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-border">
              <div className="rounded-xl bg-secondary/40 p-4 border border-border">
                <div className="flex items-start gap-2.5">
                  <MapPin className="size-4 shrink-0 text-link mt-0.5" />
                  <div className="text-xs">
                    <p className="font-semibold text-foreground">Abelenkpe Taxi Rank, Accra</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {data?.settings?.hours || "Mon – Sat: 8:00 AM – 6:00 PM"}
                    </p>
                  </div>
                </div>
                <div className="mt-3.5 flex gap-2">
                  {whatsapp && (
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors"
                    >
                      <MessageCircle className="size-3.5" />
                      WhatsApp
                    </a>
                  )}
                  <a
                    href={`tel:${data?.settings?.phone || "0249564442"}`}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-border bg-card hover:bg-secondary font-medium text-xs transition-colors"
                  >
                    <Phone className="size-3.5" />
                    Call shop
                  </a>
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
export function MobileNavigation() {
  const cart = useCart();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // The hub renders its own bottom tab bar (see `StaffShell`). Two bars stacked
  // on a phone would halve the usable page and double every tap target, so the
  // storefront one steps aside for /staff and /admin.
  if (pathname.startsWith("/staff") || pathname.startsWith("/admin")) return null;
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      <Link
        to="/"
        activeOptions={{ exact: true }}
        data-status={pathname === "/" ? "active" : undefined}
      >
        <Home />
        <span>Home</span>
      </Link>
      <Link
        to="/catalogue"
        search={{ category: "", q: "" }}
        data-status={pathname.startsWith("/catalogue") ? "active" : undefined}
      >
        <Grid2X2 />
        <span>Shop</span>
      </Link>
      <button type="button" onClick={() => cart.setSearchOpen(true)}>
        <Search />
        <span>Search</span>
      </button>
      <button type="button" onClick={() => cart.setCartOpen(true)}>
        <div className="relative">
          <ShoppingBag />
          {cart.count > 0 && (
            <span className="absolute -top-1.5 -right-2 flex size-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
              {cart.count}
            </span>
          )}
        </div>
        <span>Cart</span>
      </button>
      <Link to="/account" data-status={pathname.startsWith("/account") ? "active" : undefined}>
        <User />
        <span>Account</span>
      </Link>
    </nav>
  );
}
export function StoreFooter() {
  const { data } = useQuery(storeQuery);
  const s = data?.settings,
    categories = (data?.categories ?? []).filter((c) => c.visible),
    whatsapp = s ? whatsappHref(s) : null;
  return (
    <footer className="store-footer wrap">
      <div className="footer-grid">
        <div>
          <Link to="/" className="header-logo">
            <img
              src={images["logo"]}
              className="h-12 w-14 rounded-lg object-cover"
              alt="MB Ventures GH"
            />
            <span className="brand-text">MB Ventures GH</span>
          </Link>
          <p>
            Computer accessories, desks and chairs. A real shop at Abelenkpe, Accra, with delivery
            across Ghana.
          </p>
        </div>
        <div>
          <h2>Shop</h2>
          {categories.map((c) => (
            <Link key={c.id} to="/catalogue" search={{ category: c.id, q: "" }}>
              {c.short_name}
            </Link>
          ))}
        </div>
        <div>
          <h2>Here to help</h2>
          <Link to="/$page" params={{ page: "delivery" }}>
            Delivery & pickup
          </Link>
          <Link to="/$page" params={{ page: "warranty" }}>
            Warranty
          </Link>
          <Link to="/$page" params={{ page: "faq" }}>
            Common questions
          </Link>
          <Link to="/track">Track your order</Link>
          <Link to="/$page" params={{ page: "about" }}>
            About the shop
          </Link>
          <Link to="/staff">Staff access</Link>
        </div>
        <div>
          <h2>Visit us at Abelenkpe</h2>
          <p>{s?.address || "Abelenkpe taxi rank, Accra, Ghana"}</p>
          <p>{s?.hours || "Monday to Saturday, 8:00 AM to 6:00 PM"}</p>
          <a href={`tel:${s?.phone || "0249564442"}`} className="flex items-center gap-2">
            <Phone className="mr-1 inline size-3" />
            {s?.phone || "0249564442"}
          </a>
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noreferrer" className="flex items-center gap-2">
              <MessageCircle className="mr-1 inline size-3" />
              Chat on WhatsApp
            </a>
          )}
          <a href={`mailto:${s?.email || "info@mbventuresghana.com"}`}>
            {s?.email || "info@mbventuresghana.com"}
          </a>
          <Link to="/$page" params={{ page: "contact" }}>
            Contact the shop <ArrowRight className="ml-1 inline size-3" />
          </Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} MB Ventures GH · Ghana</span>
        <span>Pickup at Abelenkpe · Cash on delivery</span>
        <span className="flex gap-4">
          <Link to="/$page" params={{ page: "terms" }}>
            Terms
          </Link>
          <Link to="/$page" params={{ page: "privacy" }}>
            Privacy
          </Link>
        </span>
      </div>
    </footer>
  );
}
