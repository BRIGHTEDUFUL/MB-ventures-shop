import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { CircleAlert } from "lucide-react";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../convex/_generated/api";
import { useSession } from "@/lib/use-session";
import { pageHead, errorMessage } from "@/lib/store";
import { AuthFrame } from "@/components/auth-frame";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ADMIN_HUB_TOKEN, unlockAdmin } from "@/lib/admin-token";

/**
 * Admin hub entry point & dedicated authentication portal.
 *
 * Visiting /admin-hub/<token> with the correct token unlocks administrative
 * privileges for this browser session. If unauthenticated, it presents the
 * dedicated Administrator Sign In form.
 *
 * Any invalid token silently redirects to / with zero information leakage.
 * Standard /account and the footer "Staff access" link do NOT permit admin auth.
 */
export const Route = createFileRoute("/admin-hub/$token")({
  beforeLoad: ({ params }) => {
    if (params.token !== ADMIN_HUB_TOKEN) {
      throw redirect({ to: "/" });
    }
  },
  head: () =>
    pageHead("Administrator portal", "Authorized store administration access for MB Ventures GH."),
  component: AdminHubPage,
});

function AdminHubPage() {
  const { session, loading } = useSession();
  const role = useQuery({ ...convexQueryOptions(api.users.myRole, {}), enabled: !!session });
  const { signIn, signOut } = useAuthActions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Ensure admin is unlocked as soon as this authorized route is mounted
  useEffect(() => {
    unlockAdmin();
  }, []);

  // If already authenticated as admin, navigate directly into the store hub
  useEffect(() => {
    if (!loading && session && role.data === "admin") {
      unlockAdmin();
      void navigate({ to: "/staff" });
    }
  }, [loading, session, role.data, navigate]);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      unlockAdmin();
      await signIn("password", { flow: "signIn", email, password });
      unlockAdmin();
      void queryClient.invalidateQueries();
      toast.success("Administrator session unlocked.");
      void navigate({ to: "/staff" });
    } catch (err) {
      const msg = errorMessage(err, "Email or password is incorrect.");
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  if (loading || (session && role.isPending)) {
    return <AuthFrame title="Administrator portal" lead="Verifying credentials…" />;
  }

  // If signed in as non-admin (e.g. staff or customer account), offer to switch
  if (session && role.data !== "admin") {
    return (
      <AuthFrame
        title="Administrator portal"
        lead={
          <>
            <span>This portal is strictly reserved for store administrators.</span>
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
            }}
          >
            Sign out &amp; switch account
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Back to store</Link>
          </Button>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Administrator portal"
      lead="Sign in with your administrator account to access store controls, team management and operations."
    >
      <form className="auth-form" onSubmit={submit}>
        <label>
          Admin email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? (
          <p role="alert" className="auth-error">
            <CircleAlert aria-hidden />
            <span>{error}</span>
          </p>
        ) : null}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Authorizing…" : "Sign in as administrator"}
        </Button>
      </form>
      <p className="auth-footnote">
        Private administrative access. Direct unauthorized attempts to reach this portal are
        strictly prohibited.
      </p>
    </AuthFrame>
  );
}
