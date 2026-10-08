import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { connectConvex, convexHashFn, convexQueryClient, convexQueryFn } from "./lib/convex";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Convex query keys run through the Convex client: a WebSocket
        // subscription on the client, HTTP requests during SSR.
        queryKeyHashFn: convexHashFn,
        queryFn: convexQueryFn,
      },
    },
  });
  connectConvex(queryClient);

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    Wrap: ({ children }: { children: React.ReactNode }) => (
      <ConvexAuthProvider client={convexQueryClient.convexClient}>{children}</ConvexAuthProvider>
    ),
  });

  // Streams loader-fetched queries to the client during SSR.
  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
};
