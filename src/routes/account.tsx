import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexMutation } from "@convex-dev/react-query";
import { CircleAlert, Info } from "lucide-react";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../convex/_generated/api";
import { useSession } from "@/lib/use-session";
import { pageHead, money, errorMessage } from "@/lib/store";
import { images, imageSize } from "@/lib/store-images";
import { AuthFrame } from "@/components/auth-frame";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const NEXT_ROUTES = ["/checkout", "/cart", "/track", "/staff", "/admin/emails"] as const;
type NextRoute = (typeof NEXT_ROUTES)[number];

const isNextRoute = (path?: string): path is NextRoute =>
  typeof path === "string" && (NEXT_ROUTES as readonly string[]).includes(path);

export const Route = createFileRoute("/account")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { next?: string; code?: string; signup?: string } => ({
    ...(typeof s["next"] === "string" ? { next: s["next"] } : {}),
    ...(typeof s["code"] === "string" ? { code: s["code"] } : {}),
    ...(typeof s["signup"] === "string" ? { signup: s["signup"] } : {}),
  }),
  head: () =>
    pageHead(
      "Your account",
      "Sign in or create an account to place an order, view your orders and save delivery details.",
    ),
  component: Account,
});

/**
 * A failed submit sits on its own line above the button: one tinted notice
 * with a glyph, so an error reads as an event rather than as stray red text.
 */
function FieldError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="auth-error">
      <CircleAlert aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function Account() {
  const { next, code, signup: signupParam } = Route.useSearch(),
    navigate = useNavigate(),
    queryClient = useQueryClient();
  const { session, loading, profile } = useSession(),
    { signIn, signOut } = useAuthActions();
  const role = useQuery({ ...convexQueryOptions(api.users.myRole, {}), enabled: !!session });
  const [signup, setSignup] = useState(signupParam === "true"),
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
  const redirectTo = isNextRoute(next) ? next : "";
  const orders = useQuery({ ...convexQueryOptions(api.orders.mine, {}), enabled: !!session });
  const addresses = useQuery({ ...convexQueryOptions(api.addresses.list, {}), enabled: !!session });
  const addAddress = useConvexMutation(api.addresses.add);
  const removeAddress = useConvexMutation(api.addresses.remove);

  // Send the visitor back to where they came from (e.g. /checkout or /staff) once signed in.
  useEffect(() => {
    if (!loading && session && redirectTo) navigate({ to: redirectTo });
  }, [loading, session, redirectTo, navigate]);

  /** Wraps a promise with a timeout so a hung Convex connection never silently disables the button. */
  const withTimeout = <T,>(promise: Promise<T>, ms: number, timeoutMsg: string): Promise<T> => {
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMsg)), ms),
    );
    return Promise.race([promise, timer]);
  };

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await withTimeout(
        signIn(
          "password",
          signup
            ? { flow: "signUp", email, password, name, phone }
            : { flow: "signIn", email, password },
        ),
        15000,
        "Connection was temporarily interrupted. Please try again.",
      );
      if (signup) {
        toast.success("Account created. Welcome to MB Ventures GH.");
      } else {
        toast.success("Signed in successfully.");
      }
      void queryClient.invalidateQueries();
      if (redirectTo) {
        navigate({ to: redirectTo });
      }
    } catch (err) {
      const msg = signup
        ? errorMessage(err, "Your account could not be created. Check your details and try again.")
        : errorMessage(err, "Email or password is incorrect.");
      setError(msg);
      // Toast as backup so the error is always visible even if the form scrolls.
      toast.error(msg);
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
      await withTimeout(
        signIn("password", { flow: "reset", email }),
        15000,
        "Connection was temporarily interrupted. Please try again.",
      );
      setResetSent(true);
    } catch (err) {
      const msg = errorMessage(err, "We could not start a password reset for that address.");
      setError(msg);
      toast.error(msg);
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

  if (loading)
    return (
      <div className="page-content wrap auth-page auth-loading">
        <img src={images["logo"]} {...imageSize("logo")} alt="" />
        <p>Loading your account…</p>
      </div>
    );

  // Signed in: the account itself, still inside the same frame so the page
  // never switches identity between checking out and reading orders.
  if (session)
    return (
      <AuthFrame
        wide
        title="Your account"
        lead={
          <>
            <span>{session.user.email}</span>
            {profile?.name || profile?.phone ? (
              <span className="auth-profile">
                {profile.name}
                {profile.name && profile.phone ? " · " : ""}
                {profile.phone}
              </span>
            ) : null}
          </>
        }
      >
        <div className="mt-6 flex flex-wrap gap-4">
          {role.data === "admin" || role.data === "staff" ? (
            <Button asChild>
              <Link to="/staff">Store staff hub</Link>
            </Button>
          ) : null}
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
        <h2 className="auth-section-heading">Your orders</h2>
        {orders.isError ? (
          <p className="auth-empty">Orders could not load. Please try again.</p>
        ) : orders.data?.length ? (
          <ul className="auth-orders">
            {orders.data.map((o) => (
              <li key={o.id}>
                <span className="font-mono text-sm">{o.reference}</span>
                <span className="text-sm capitalize">
                  {o.status} · Payment {o.payment_status}
                </span>
                <span className="font-semibold">{money(o.total)}</span>
                <Link className="text-sm underline" to="/track">
                  View with phone number
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="auth-empty">No orders yet. Your first order will appear here.</p>
        )}
        <h2 className="auth-section-heading">Saved addresses</h2>
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
          className="auth-address-form"
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
      </AuthFrame>
    );

  // The emailed reset link carries its one-time code.
  if (code)
    return (
      <AuthFrame
        title="Choose a new password"
        lead="The one-time code from your email is already attached to this page, so all we need is the address it was sent to."
      >
        <form className="auth-form" onSubmit={submitNewPassword}>
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
            <FieldError>The two passwords do not match.</FieldError>
          ) : null}
          <FieldError>{error}</FieldError>
          <Button disabled={busy} className="w-full">
            {busy ? "Please wait…" : "Set new password"}
          </Button>
        </form>
        <div className="auth-switch">
          <Button variant="link" onClick={() => navigate({ to: "/" })}>
            Back to the store
          </Button>
        </div>
      </AuthFrame>
    );

  // Asking for a reset link, and the confirmation once it is queued.
  if (forgot)
    return (
      <AuthFrame
        title={resetSent ? "Check your email" : "Reset your password"}
        lead={
          resetSent ? (
            <>
              If <strong>{email}</strong> has an account, a reset link is on its way. The link is
              valid for 60 minutes.
            </>
          ) : (
            "Enter the address you signed up with and we will email you a link to set a new password."
          )
        }
      >
        {resetSent ? (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setForgot(false);
              setResetSent(false);
              setError("");
            }}
          >
            Back to sign in
          </Button>
        ) : (
          <>
            <form className="auth-form" onSubmit={submitForgot}>
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
              <FieldError>{error}</FieldError>
              <Button disabled={busy} className="w-full">
                {busy ? "Sending…" : "Email me a reset link"}
              </Button>
            </form>
            <div className="auth-switch">
              <Button
                variant="link"
                onClick={() => {
                  setForgot(false);
                  setError("");
                }}
              >
                Back to sign in
              </Button>
            </div>
          </>
        )}
      </AuthFrame>
    );

  // Sign in and sign up share one form; the toggle below it swaps the flow.
  return (
    <AuthFrame
      title={signup ? "Create your account" : "Welcome back"}
      lead={
        signup
          ? "Create an account to place an order, follow a delivery and keep your details for next time."
          : "Sign in to pick up where you left off — your cart stays saved while you do."
      }
    >
      {redirectTo && (
        <p className="auth-note">
          <Info aria-hidden />
          <span>
            Sign in to continue to <strong>{redirectTo.replace("/", "")}</strong>.
          </span>
        </p>
      )}
      <form className="auth-form" onSubmit={submit}>
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
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
        </Button>
      </form>
      <div className="auth-switch">
        <Button
          variant="link"
          onClick={() => {
            setSignup(!signup);
            setError("");
          }}
        >
          {signup ? "Already have an account? Sign in" : "New here? Create an account"}
        </Button>
        {!signup && (
          <Button
            variant="link"
            onClick={() => {
              setForgot(true);
              setError("");
            }}
          >
            Forgot your password?
          </Button>
        )}
      </div>
      <p className="auth-footnote">
        An account is needed to place an order — your cart stays saved while you sign in. Staff
        access is granted separately by the store owner.
      </p>
    </AuthFrame>
  );
}
