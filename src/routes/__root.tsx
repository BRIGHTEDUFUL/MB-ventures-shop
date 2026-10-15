import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import { SITE_ORIGIN } from "@/lib/store";
import { StoreProvider } from "@/components/store-provider";
import {
  StoreHeader,
  StoreFooter,
  StoreOverlays,
  MobileNavigation,
} from "@/components/store-shell";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Root-level not-found and error screens. They render *inside* the store shell
 * (header, footer, nav), so they use the standard page scaffolding —
 * `.page-content` gives them the same top spacing and a 60vh floor as every
 * other page, and the same Button component every other action uses. A
 * `min-h-screen` here used to stack a full viewport under the header and push
 * the footer a whole screen below the message.
 */
function NotFoundComponent() {
  return (
    <div className="page-content wrap">
      <div className="py-10 text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <h2 className="mt-4 text-2xl font-semibold">Page not found</h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link to="/">Go home</Link>
          </Button>
          {/* The route-level not-found already offers the catalogue; the root
              one sends you back into the shop the same way. */}
          <Button asChild variant="outline">
            <Link to="/catalogue" search={{ category: "", q: "" }}>
              Shop the catalogue
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="page-content wrap">
      <div className="py-10 text-center">
        <h1 className="text-2xl font-semibold">This page didn't load</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: ({ matches }) => {
    // The last match is the leaf route actually being rendered, so one place
    // can emit a canonical URL (query strings stripped) for every page.
    const pathname = matches[matches.length - 1]?.pathname ?? "/";
    const canonical = SITE_ORIGIN ? `${SITE_ORIGIN}${pathname}` : undefined;
    // Staff, admin and local-only tooling must never show up in search results.
    const isPrivate = matches.some((m) => /^\/(staff|admin|dev)(\/|$)/.test(m.pathname));
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { title: "MB Ventures GH | Workspace store in Accra" },
        {
          name: "description",
          content: "Desks, chairs and computer accessories from the Abelenkpe shop in Accra.",
        },
        { property: "og:type", content: "website" },
        ...(canonical ? [{ property: "og:url", content: canonical }] : []),
        ...(isPrivate ? [{ name: "robots", content: "noindex, nofollow" }] : []),
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        { rel: "icon", href: "/favicon.png", type: "image/png" },
        ...(canonical ? [{ rel: "canonical", href: canonical }] : []),
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Auth state is reactive through Convex (`useConvexAuth` / Convex queries),
  // so there is no auth event to subscribe to here.
  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <StoreHeader />
        <main>
          <Outlet />
        </main>
        <StoreFooter />
        <MobileNavigation />
        <StoreOverlays />
        <Toaster position="bottom-center" richColors />
      </StoreProvider>
    </QueryClientProvider>
  );
}
