import { createFileRoute, Link } from "@tanstack/react-router";
import { useCart } from "@/components/store-provider";
import { CartLines, FreeDelivery } from "@/components/store-ui";
import { money, pageHead } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
export const Route = createFileRoute("/cart")({
  head: () =>
    pageHead(
      "Your cart",
      "Review your workspace gear and checkout with delivery or Abelenkpe pickup.",
    ),
  component: CartPage,
});
function CartPage() {
  const cart = useCart();
  return (
    <div className="page-content wrap">
      <h1 className="page-title">Your cart</h1>
      {cart.lines.length ? (
        <div className="two-column">
          <div>
            <CartLines />
            <Link
              to="/catalogue"
              search={{ category: "", q: "" }}
              className="mt-6 inline-block text-sm"
            >
              Continue shopping
            </Link>
          </div>
          <aside className="solid-panel h-fit">
            <h2 className="text-xl">Order summary</h2>
            <FreeDelivery />
            <div className="summary-row summary-total">
              <span>Subtotal</span>
              <span>{money(cart.subtotal, true)}</span>
            </div>
            <p className="my-5 text-xs text-muted-foreground">
              Delivery calculated at checkout. Payments are always confirmed by our shop team.
            </p>
            <p className="mb-4 rounded-lg border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
              Placing an order needs an MB Ventures GH account — it is how we link the order to you
              for tracking. Your cart stays right here while you sign in or register.
            </p>
            <Button asChild className="w-full">
              <Link to="/checkout">
                Checkout <ArrowRight />
              </Link>
            </Button>
          </aside>
        </div>
      ) : (
        <>
          <p className="mt-8 text-muted-foreground">Your cart is empty.</p>
          <Button asChild className="mt-6">
            <Link to="/catalogue" search={{ category: "", q: "" }}>
              Shop the catalogue
            </Link>
          </Button>
        </>
      )}
    </div>
  );
}
