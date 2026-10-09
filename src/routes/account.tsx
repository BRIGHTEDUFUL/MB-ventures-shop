import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexMutation } from "@convex-dev/react-query";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../convex/_generated/api";
import { useSession } from "@/lib/use-session";
import { pageHead, money, errorMessage } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const NEXT_ROUTES = ["/checkout", "/cart", "/track"] as const;
type NextRoute = (typeof NEXT_ROUTES)[number];

export const Route = createFileRoute("/account")({
  validateSearch: (s: Record<string, unknown>): { next?: string; code?: string } => ({
    ...(typeof s["next"] === "string" ? { next: s["next"] } : {}),
    ...(typeof s["code"] === "string" ? { code: s["code"] } : {}),
  }),
  head: () =>
    pageHead(
      "Your account",
      "Sign in or create an account to place an order, view your orders and save delivery details.",
    ),
  component: Account,
});

function Account() {
  const { next, code } = Route.useSearch(),
    navigate = useNavigate();
  const { session, loading, profile } = useSession(),
    { signIn, signOut } = useAuthActions();
  const [signup, setSignup] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [address, setAddress] = useState(""),
    [forgot, setForgot] = useState(false),
    [resetSent, setResetSent] = useState(false),
    [newPassword, setNewPassword] = useState(""),
    [confirmPassword, setConfirmPassword] = useState("");
  const redirectTo: NextRoute | "" = (NEXT_ROUTES as readonly string[]).includes(next ?? "")
    ? (next as NextRoute)
    : "";
  const orders = useQuery({ ...convexQueryOptions(api.orders.mine, {}), enabled: !!session });
  const addresses = useQuery({ ...convexQueryOptions(api.addresses.list, {}), enabled: !!session });
  const addAddress = useConvexMutation(api.addresses.add);
  const removeAddress = useConvexMutation(api.addresses.remove);

  // Send the visitor back to where they came from (e.g. /checkout) once signed in.
  useEffect(() => {
    if (!loading && session && redirectTo) navigate({ to: redirectTo });
  }, [loading, session, redirectTo, navigate]);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(
        "password",
        signup
          ? { flow: "signUp", email, password, name, phone }
          : { flow: "signIn", email, password },
      );
      if (signup) toast.success("Account created. Welcome to MB Ventures GH.");
    } catch (err) {
      setError(
        signup
          ? errorMessage(
              err,
              "Your account could not be created. Check your details and try again.",
            )
          : errorMessage(err, "Email or password is incorrect."),
      );
    } finally {
      setBusy(false);
    }
  };

  /**
   * Step one of the reset: ask for the address, hand it to the password
   * provider, which queues `auth-reset-password` through the shared pipeline.
   */
  const submitForgot = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn("password", { flow: "reset", email });
      setResetSent(true);
    } catch (err) {
      setError(errorMessage(err, "We could not start a password reset for that address."));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Step two: the emailed link lands on `/account?code=…`, so the code comes
   * from the URL while the address and new password are typed in. Convex Auth
   * needs the address to know which account the code belongs to.
   */
  const submitNewPassword = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await signIn("password", {
        flow: "reset-verification",
        email,
        code: code ?? "",
        newPassword,
      });
      toast.success("Password updated. You are signed in.");
      navigate({ to: redirectTo || "/" });
    } catch (err) {
      setError(
        errorMessage(err, "That reset link has expired or is no longer valid. Request a new one."),
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="page-content wrap">Loading account…</div>;
  return (
    <div className="page-content wrap">
      <h1 className="page-title">
        {session ? "Your account" : signup ? "Create your account" : "Welcome back"}
      </h1>
      {session ? (
        <>
          <p className="page-lead">{session.user.email}</p>
          {profile?.name || profile?.phone ? (
            <p className="text-sm text-muted-foreground">
              {profile.name}
              {profile.name && profile.phone ? " · " : ""}
              {profile.phone}
            </p>
          ) : null}
          <div className="mt-5 flex gap-4">
            <Button
              variant="outline"
              onClick={() => {
                void signOut();
              }}
            >
              Sign out
            </Button>
            <Button variant="outline" asChild>
              <Link to="/track">Track an order</Link>
            </Button>
          </div>
          <h2 className="mb-5 mt-10 text-2xl">Your orders</h2>
          {orders.isError ? (
            <p>Orders could not load. Please try again.</p>
          ) : orders.data?.length ? (
            orders.data.map((o) => (
              <div
                key={o.id}
                className="flex flex-wrap justify-between gap-3 border-b border-border py-5"
              >
                <span className="font-mono text-sm">{o.reference}</span>
                <span className="text-sm capitalize">
                  {o.status} · Payment {o.payment_status}
                </span>
                <span>{money(o.total)}</span>
                <Link className="text-sm underline" to="/track">
                  View with phone number
                </Link>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No orders yet. Your first order will appear here.
            </p>
          )}
          <h2 className="mb-5 mt-10 text-2xl">Saved addresses</h2>
          {addresses.data?.map((a) => (
            <div key={a.id} className="flex justify-between border-b border-border py-3 text-sm">
              <span>{a.address}</span>
              <Button
                variant="ghost"
                onClick={async () => {
                  try {
                    await removeAddress({ id: a.id });
                  } catch (err) {
                    toast.error(errorMessage(err, "Address could not be removed."));
                  }
                }}
              >
                Remove
              </Button>
            </div>
          ))}
          <form
            className="mt-4 flex max-w-xl gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await addAddress({ name: "Delivery", address, phone: "" });
                setAddress("");
              } catch (err) {
                toast.error(errorMessage(err, "Address could not be saved."));
              }
            }}
          >
            <input
              required
              aria-label="Save delivery address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street address & landmark"
            />
            <Button>Save</Button>
          </form>
        </>
      ) : code ? (
        <div className="mt-8 max-w-md">
          <p className="mb-4 text-sm text-muted-foreground">
            Choose a new password. The one-time code from your email is already attached to this
            page, so all we need is the address it was sent to.
          </p>
          <form className="space-y-4" onSubmit={submitNewPassword}>
            <label>
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              New password
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
            {newPassword && confirmPassword && newPassword !== confirmPassword ? (
              <p role="alert" className="text-sm text-destructive">
                The two passwords do not match.
              </p>
            ) : null}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button disabled={busy} className="w-full">
              {busy ? "Please wait…" : "Set new password"}
            </Button>
          </form>
          <Button variant="link" className="mt-4 px-0" onClick={() => navigate({ to: "/" })}>
            Back to the store
          </Button>
        </div>
      ) : forgot ? (
        <div className="mt-8 max-w-md">
          {resetSent ? (
            <>
              <p className="font-semibold">Check your email</p>
              <p className="mt-2 text-sm text-muted-foreground">
                If <span className="font-medium">{email}</span> has an account, a reset link is on
                its way. The link is valid for 60 minutes.
              </p>
              <Button
                variant="outline"
                className="mt-5"
                onClick={() => {
                  setForgot(false);
                  setResetSent(false);
                  setError("");
                }}
              >
                Back to sign in
              </Button>
            </>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Enter the address you signed up with and we will email you a link to set a new
                password.
              </p>
              <form className="space-y-4" onSubmit={submitForgot}>
                <label>
                  Email
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button disabled={busy} className="w-full">
                  {busy ? "Sending…" : "Email me a reset link"}
                </Button>
              </form>
              <Button
                variant="link"
                className="mt-4 px-0"
                onClick={() => {
                  setForgot(false);
                  setError("");
                }}
              >
                Back to sign in
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="mt-8 max-w-md">
          {redirectTo && (
            <p className="mb-4 text-sm text-muted-foreground">
              Sign in to continue to{" "}
              <span className="font-medium">{redirectTo.replace("/", "")}</span>.
            </p>
          )}
          <form className="space-y-4" onSubmit={submit}>
            {signup && (
              <>
                <label>
                  Full name
                  <input
                    required
                    minLength={2}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Phone number
                  <input
                    required
                    type="tel"
                    minLength={9}
                    autoComplete="tel"
                    placeholder="024 123 4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
              </>
            )}
            <label>
              Email
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
                autoComplete={signup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button disabled={busy} className="w-full">
              {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
            </Button>
          </form>
          <Button
            variant="link"
            className="mt-4 px-0"
            onClick={() => {
              setSignup(!signup);
              setError("");
            }}
          >
            {signup ? "Already have an account? Sign in" : "New here? Create an account"}
          </Button>
          {!signup && (
            <div>
              <Button
                variant="link"
                className="px-0"
                onClick={() => {
                  setForgot(true);
                  setError("");
                }}
              >
                Forgot your password?
              </Button>
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            An account is needed to place an order — your cart stays saved while you sign in. Staff
            access is granted separately by the store owner.
          </p>
        </div>
      )}
    </div>
  );
}
