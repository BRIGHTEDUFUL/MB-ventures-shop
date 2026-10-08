import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../convex/_generated/api";
import { useSession } from "@/lib/use-session";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/store";
import { StaffShell } from "@/components/staff/shell";

export const Route = createFileRoute("/staff")({
  head: () =>
    pageHead(
      "Store hub",
      "Restricted hub for order verification, catalogue, inventory, storefront customization and team access.",
    ),
  component: StaffLayout,
});

/**
 * Access gate for the whole hub: sign-in first, then a `user_roles` check
 * (server-side `requireStaff` / `requireAdmin` remain the real boundary).
 * Children only mount once the shell renders, so their queries never run
 * for visitors without access.
 */
function StaffLayout() {
  const { session, loading } = useSession();
  const role = useQuery({ ...convexQueryOptions(api.users.myRole, {}), enabled: !!session });

  if (loading || (session && role.isPending)) {
    return <div className="page-content wrap">Checking access…</div>;
  }
  if (!session) {
    return (
      <div className="page-content wrap">
        <h1 className="page-title">Staff access</h1>
        <p className="page-lead">
          Sign in with your staff account to verify payments, manage stock and update the store.
        </p>
        <Button asChild className="mt-6">
          <Link to="/account" search={{ next: "/staff" }}>
            Go to account
          </Link>
        </Button>
      </div>
    );
  }
  if (role.isError) {
    return (
      <div className="page-content wrap">
        <h1 className="page-title">Staff access</h1>
        <p className="page-lead" role="alert">
          Your access could not be checked. Reload the page to try again.
        </p>
        <Button asChild className="mt-6">
          <Link to="/account">Go to account</Link>
        </Button>
      </div>
    );
  }
  if (role.data !== "admin" && role.data !== "staff") {
    return (
      <div className="page-content wrap">
        <h1 className="page-title">Staff access</h1>
        <p className="page-lead">
          Your account does not have staff permission. Ask the store owner to grant access.
        </p>
        <Button asChild className="mt-6">
          <Link to="/account">Go to account</Link>
        </Button>
      </div>
    );
  }
  return (
    <StaffShell role={role.data}>
      <Outlet />
    </StaffShell>
  );
}
