import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuthActions } from "@convex-dev/auth/react";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../convex/_generated/api";
import { useSession } from "@/lib/use-session";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/store";
import { AuthFrame } from "@/components/auth-frame";
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

  const { signOut } = useAuthActions();

  if (loading || (session && role.isPending)) {
    return <AuthFrame title="Store hub" lead="Checking who you are…" />;
  }
  if (!session) {
    return (
      <AuthFrame
        title="Store hub"
        lead="Sign in with your staff account to record payments, manage stock and keep the storefront current."
      >
        <Button asChild className="mt-6 w-full sm:w-auto">
          <Link to="/account" search={{ next: "/staff" }}>
            Sign in to continue
          </Link>
        </Button>
        <p className="mt-5 text-sm text-muted-foreground">
          Shopping instead?{" "}
          <Link to="/" className="font-medium text-link hover:underline">
            Back to the store
          </Link>
        </p>
      </AuthFrame>
    );
  }
  if (role.isError) {
    return (
      <AuthFrame
        title="Store hub"
        lead={
          <span role="alert">Your access could not be checked. Reload the page to try again.</span>
        }
      >
        <Button asChild className="mt-6 w-full sm:w-auto">
          <Link to="/account">Go to account</Link>
        </Button>
      </AuthFrame>
    );
  }
  if (role.data !== "admin" && role.data !== "staff") {
    return (
      <AuthFrame
        title="No staff access"
        lead={
          <>
            <span>
              This account is signed in but is not on the shop team, so the store hub is closed to
              it.
            </span>
            {session.user.email ? (
              <span className="mt-1 block text-sm opacity-80">
                Currently signed in as: <strong>{session.user.email}</strong>
              </span>
            ) : null}
          </>
        }
      >
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            variant="default"
            onClick={async () => {
              await signOut();
              window.location.href = "/account?next=/staff";
            }}
          >
            Sign out & switch account
          </Button>
          <Button asChild variant="outline">
            <Link to="/account">Go to account</Link>
          </Button>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          Staff access is granted by the store owner from the Team page. If you work at the shop,
          ask them to add your email.
        </p>
      </AuthFrame>
    );
  }
  return (
    <StaffShell role={role.data}>
      <Outlet />
    </StaffShell>
  );
}
