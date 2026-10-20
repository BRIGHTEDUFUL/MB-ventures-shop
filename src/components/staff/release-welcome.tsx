import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Boxes,
  Check,
  MessageSquare,
  PackageSearch,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSession } from "@/lib/use-session";

/** Bump the version to greet everyone again after a notable release. */
const RELEASE_VERSION = "1.0";
const STORAGE_KEY = "mbvg-store-hub-release";

/**
 * The shop's first-run greeting, shown over the staff hub once per browser
 * (per release version). It is deliberately small: four things the hub does,
 * the release highlights, and two doors into the work — not a tour.
 *
 * `localStorage` is read in an effect rather than at render, so SSR renders
 * nothing and hydration never disagrees with the client.
 */
export function ReleaseWelcome() {
  const { profile } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== RELEASE_VERSION) setOpen(true);
    } catch {
      // Private mode / storage disabled: greet for this page view only.
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, RELEASE_VERSION);
    } catch {
      // Nothing to remember; the dialog simply returns on the next visit.
    }
    setOpen(false);
  };

  const name = profile?.name?.trim() ?? "";
  const greeting = name ? `${name}, welcome to Store Hub` : "Welcome to Store Hub";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else dismiss();
      }}
    >
      <DialogContent className="max-h-[90vh] gap-5 overflow-y-auto sm:max-w-2xl">
        {/* A quiet ribbon in the shop's palette — decoration only. */}
        <div
          aria-hidden
          className="-mx-6 -mt-6 h-1.5 rounded-t-lg bg-gradient-to-r from-primary via-offer to-link"
        />

        <DialogHeader className="gap-2.5">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-offer/10 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-offer-ink uppercase">
            <Sparkles className="size-3.5" aria-hidden />
            Official release · v{RELEASE_VERSION}
          </span>
          <DialogTitle className="text-2xl sm:text-3xl">{greeting}</DialogTitle>
          <DialogDescription className="max-w-xl text-sm leading-relaxed">
            MB Ventures GH now runs end to end from this room — the storefront, counter sales, stock
            and customer messages. Here is what is new for you.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Feature
            icon={ShoppingCart}
            title="Orders, online and at the counter"
            body="Walk-in, WhatsApp and phone sales are recorded here — with stock held the moment you take them."
          />
          <Feature
            icon={PackageSearch}
            title="A catalogue that sells itself"
            body="Products, photos, colours and sizes sit in one editor, and the storefront updates with them."
          />
          <Feature
            icon={Boxes}
            title="Stock you can explain"
            body="Every unit is reserved, sold, returned or counted — and the ledger shows who moved it and why."
          />
          <Feature
            icon={MessageSquare}
            title="Customer messages in one inbox"
            body="Contact-form inquiries and the emails we send about each order are logged beside the order."
          />
        </div>

        <div className="rounded-xl border bg-muted/40 p-4">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            New in this release
          </p>
          <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
            {[
              "Paystack online checkout",
              "Counter orders & discounts",
              "Product options with photos",
              "Live stock ledger & health checks",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild onClick={dismiss}>
            <Link to="/staff/orders">
              Open today&apos;s orders
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button variant="outline" asChild onClick={dismiss}>
            <Link to="/staff/orders/new">Record a counter sale</Link>
          </Button>
          <Button variant="ghost" onClick={dismiss}>
            I&apos;ll explore
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ShoppingCart;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/5 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
