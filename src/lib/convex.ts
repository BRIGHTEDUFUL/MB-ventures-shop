import { ConvexQueryClient, convexQuery } from "@convex-dev/react-query";
import type { QueryClient, QueryFunction } from "@tanstack/react-query";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";

/**
 * The app's single Convex client: one WebSocket per browser tab, and a plain
 * HTTP client on the server (used to run loader queries during SSR).
 *
 * `dangerouslyUseInconsistentQueriesDuringSSR` keeps the server on plain
 * latest-version reads: the alternative (`consistentQuery`) pins one
 * boot-time timestamp for every SSR request on this long-lived process —
 * Convex only serves reads a short way into the past, so the storefront
 * would freeze at first-request state (or 500 outright) until restart.
 * Hydration stays correct because the client renders the streamed values
 * as-is; live updates then arrive over the WebSocket subscription.
 */
export const convexQueryClient = new ConvexQueryClient(import.meta.env["VITE_CONVEX_URL"], {
  dangerouslyUseInconsistentQueriesDuringSSR: true,
});

/** Global TanStack Query defaults for Convex query keys. */
export const convexQueryFn = convexQueryClient.queryFn() as QueryFunction;
export const convexHashFn = convexQueryClient.hashFn();

let connectedTo: QueryClient | undefined;

/**
 * Attach a QueryClient to the shared client so Convex subscriptions write
 * results into its cache. On the server this is a no-op: every request builds
 * its own QueryClient and loader queries run over plain HTTP instead (calling
 * `connect` twice would throw "already subscribed!").
 */
export function connectConvex(queryClient: QueryClient): void {
  if (typeof window === "undefined") return;
  if (connectedTo === queryClient) return;
  // Reconnect cleanly after HMR or a replaced QueryClient.
  if (convexQueryClient.unsubscribe) {
    convexQueryClient.unsubscribe();
    convexQueryClient.unsubscribe = undefined;
  }
  convexQueryClient.connect(queryClient);
  connectedTo = queryClient;
}

export type AnyConvexQuery = FunctionReference<"query", "public">;

export type ConvexQueryOptions<T extends AnyConvexQuery> = {
  queryKey: ["convexQuery", T, FunctionArgs<T>];
  queryFn: QueryFunction<FunctionReturnType<T>, ["convexQuery", T, FunctionArgs<T>], never>;
  staleTime: number;
};

/**
 * `convexQuery(...)` plus a **required, strongly typed `queryFn`**.
 *
 * The helper shipped by `@convex-dev/react-query` types `queryFn` as optional
 * (the client supplies it through QueryClient defaults), which this project's
 * `exactOptionalPropertyTypes` setting rejects at every `useQuery` call site.
 * Supplying it here keeps data typed as the Convex function's return type.
 */
export function convexQueryOptions<T extends AnyConvexQuery>(
  func: T,
  args: FunctionArgs<T>,
): ConvexQueryOptions<T> {
  const base = convexQuery(func, args);
  return {
    queryKey: base.queryKey as ConvexQueryOptions<T>["queryKey"],
    queryFn: convexQueryClient.queryFn() as unknown as ConvexQueryOptions<T>["queryFn"],
    // `convexQuery` always sets a numeric stale time (Infinity).
    staleTime: base.staleTime as number,
  };
}
