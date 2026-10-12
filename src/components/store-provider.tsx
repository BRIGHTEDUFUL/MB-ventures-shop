import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Product } from "@/lib/store";
import type { Variant } from "../../convex/lib/dto";
import { lineKey, type Line } from "@/lib/cart";
import { toast } from "sonner";

type Cart = {
  lines: Line[];
  /** True once the localStorage cart has been restored; before that, `lines` is still []. */
  ready: boolean;
  add: (p: Product, q?: number, v?: Variant) => void;
  /** `key` is `lineKey(line)`, not a product id — one product can hold two lines. */
  change: (key: string, q: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  cartOpen: boolean;
  setCartOpen: (v: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  count: number;
  subtotal: number;
};
const CartContext = createContext<Cart | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<Line[]>([]),
    [ready, setReady] = useState(false),
    [cartOpen, setCartOpen] = useState(false),
    [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("mb-cart") || "[]");
      // A cart written before options existed has no `variant` field; those
      // lines restore as plain product lines. Anything without a product id is
      // dropped, because `lineKey` would have nothing stable to key it by.
      if (Array.isArray(stored)) setLines(stored.filter((l) => l.product?.id && l.quantity > 0));
    } catch {
      /* corrupt cart data: start empty */
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem("mb-cart", JSON.stringify(lines));
  }, [lines, ready]);
  const add = (product: Product, quantity = 1, variant?: Variant) => {
    const key = lineKey({ product, variant });
    setLines((prev) => {
      const found = prev.some((l) => lineKey(l) === key);
      return found
        ? prev.map((l) =>
            lineKey(l) === key
              ? {
                  ...l,
                  product,
                  // Spread rather than assign: `variant` is optional, so an
                  // option-less line never grows an `undefined` field.
                  ...(variant ? { variant } : {}),
                  quantity: Math.min(50, l.quantity + quantity),
                }
              : l,
          )
        : [...prev, { product, ...(variant ? { variant } : {}), quantity }];
    });
    toast.success(`${product.name}${variant ? ` (${variant.name})` : ""} added to cart`);
  };
  const change = (key: string, q: number) =>
    setLines((prev) =>
      prev.map((l) => (lineKey(l) === key ? { ...l, quantity: Math.max(1, Math.min(50, q)) } : l)),
    );
  const remove = (key: string) => {
    const removed = lines.find((l) => lineKey(l) === key);
    setLines((prev) => prev.filter((l) => lineKey(l) !== key));
    if (removed)
      toast("Item removed", {
        action: {
          label: "Undo",
          onClick: () =>
            setLines((prev) => (prev.some((l) => lineKey(l) === key) ? prev : [...prev, removed])),
        },
      });
  };
  return (
    <CartContext.Provider
      value={{
        lines,
        ready,
        add,
        change,
        remove,
        clear: () => setLines([]),
        cartOpen,
        setCartOpen,
        searchOpen,
        setSearchOpen,
        count: lines.reduce((s, l) => s + l.quantity, 0),
        // The effective price: an option that prices itself wins over the
        // product, which is the same rule the server applies when it
        // recomputes the order.
        subtotal: lines.reduce((s, l) => s + (l.variant?.price ?? l.product.price) * l.quantity, 0),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("Store provider missing");
  return context;
}
