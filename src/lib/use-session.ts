import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "@tanstack/react-query";
import { convexQueryOptions } from "./convex";
import { api } from "../../convex/_generated/api";
import { useEffect, useState } from "react";

/**
 * Keeps the `{ session: { user: { id, email } }, loading }` shape the UI was
 * built around, but reads it from Convex Auth + the `users.me` query.
 * `profile` additionally exposes the stored name and phone (checkout prefill).
 *
 * A 5-second timeout prevents the page from being stuck on "Loading your
 * account…" forever if the Convex WebSocket can't connect — after the timeout
 * the user sees the sign-in form rather than an infinite spinner.
 */
export function useSession() {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const { data: profile } = useQuery({
    ...convexQueryOptions(api.users.me, {}),
    enabled: isAuthenticated && !authLoading,
  });

  // If Convex takes more than 5 s to resolve auth, stop blocking the UI.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!authLoading) return; // already resolved, no timer needed
    const id = setTimeout(() => setTimedOut(true), 5000);
    return () => clearTimeout(id);
  }, [authLoading]);

  // Reset timeout flag whenever auth resolves normally.
  useEffect(() => {
    if (!authLoading) setTimedOut(false);
  }, [authLoading]);

  const loading = !timedOut && (authLoading || (isAuthenticated && profile === undefined));
  const session = isAuthenticated
    ? { user: { id: profile?.id ?? "user", email: profile?.email ?? "" } }
    : null;
  return { session, loading, profile: profile ?? null };
}
