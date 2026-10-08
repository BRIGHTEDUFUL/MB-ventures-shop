import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Product } from "@/lib/store";
import { toast } from "sonner";
type Line = { product: Product; quantity: number };
type Cart = {
  lines: Line[];
  add: (p: Product, q?: number) => void;
  change: (id: string, q: number) => void;
  remove: (id: string) => void;
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
      if (Array.isArray(stored)) setLines(stored.filter((l) => l.product?.id && l.quantity > 0));
    } catch {
      /* corrupt cart data: start empty */
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem("mb-cart", JSON.stringify(lines));
  }, [lines, ready]);
  const add = (product: Product, quantity = 1) => {
    setLines((prev) => {
      const found = prev.find((l) => l.product.id === product.id);
      return found
        ? prev.map((l) =>
            l.product.id === product.id
              ? { ...l, product, quantity: Math.min(50, l.quantity + quantity) }
              : l,
          )
        : [...prev, { product, quantity }];
    });
    toast.success(`${product.name} added to cart`);
  };
  const change = (id: string, q: number) =>
    setLines((prev) =>
      prev.map((l) => (l.product.id === id ? { ...l, quantity: Math.max(1, Math.min(50, q)) } : l)),
    );
  const remove = (id: string) => {
    const removed = lines.find((l) => l.product.id === id);
    setLines((prev) => prev.filter((l) => l.product.id !== id));
    if (removed)
      toast("Item removed", {
        action: {
          label: "Undo",
          onClick: () =>
            setLines((prev) => (prev.some((l) => l.product.id === id) ? prev : [...prev, removed])),
        },
      });
  };
  return (
    <CartContext.Provider
      value={{
        lines,
        add,
        change,
        remove,
        clear: () => setLines([]),
        cartOpen,
        setCartOpen,
        searchOpen,
        setSearchOpen,
        count: lines.reduce((s, l) => s + l.quantity, 0),
        subtotal: lines.reduce((s, l) => s + l.product.price * l.quantity, 0),
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
