import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "@tanstack/react-query";
import { convexQueryOptions } from "./convex";
import { api } from "../../convex/_generated/api";

/**
 * Keeps the `{ session: { user: { id, email } }, loading }` shape the UI was
 * built around, but reads it from Convex Auth + the `users.me` query.
 * `profile` additionally exposes the stored name and phone (checkout prefill).
 */
export function useSession() {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const { data: profile } = useQuery({
    ...convexQueryOptions(api.users.me, {}),
    enabled: isAuthenticated && !authLoading,
  });
  const loading = authLoading || (isAuthenticated && profile === undefined);
  const session =
    isAuthenticated && profile ? { user: { id: profile.id, email: profile.email } } : null;
  return { session, loading, profile: profile ?? null };
}
