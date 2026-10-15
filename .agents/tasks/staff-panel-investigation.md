# Investigation: Staff / Admin Panel Does Not Open After Sign-In

**Date:** 2026-10-15  
**Codebase:** circle-shop-express-main (MB Ventures GH)  
**Symptom:** After a successful sign-in, staff and admin users cannot open the `/staff` panel.

---

## Summary Answer

There are **two separate blocking bugs**:

1. **Admin accounts are entirely blocked** unless they enter through the hidden URL `/admin-hub/mbvg-admin-2026`. The regular `/account` sign-in silently signs them out and shows an error. This is intentional security design — but if admins don't know about this URL, they can never reach the panel.

2. **`role.isPending` is `true` forever in `account.tsx` when `session` is `null`** in TanStack Query v5. The `enabled: !!session` guard means the query never fires, but TanStack Query v5 treats a never-fired, `enabled: false` query as `status: "pending"`. The `useEffect` that drives post-login navigation has `role.isPending` as a bail-out condition (`if (loading || role.isPending || !session) return;`). After login, when `session` becomes truthy, the `myRole` query fires and goes from `isPending → resolved`. However, if the query resolves before the effect re-runs with `submitted: true` — or if the `setSubmitted(true)` + `queryClient.invalidateQueries()` calls in `submit()` complete in the wrong order — the navigation to `/staff` may never trigger. This is a real timing race.

3. **The biggest issue for both staff and admin**: `staff.tsx` has an **`isAdminUnlocked()` check** that reads `sessionStorage`. On a fresh sign-in via `/account`, this session storage key is never written — only `/admin-hub/<token>` calls `unlockAdmin()`. So any admin who signs in through the normal account page is immediately bounced to the "Access restricted" screen even after their role resolves correctly.

---

## Evidence by File

### `src/routes/staff.tsx` — The gate that blocks entry

```tsx
// Line 118-130
if (role.data === "admin" && !isAdminUnlocked()) {
  return (
    <AuthFrame title="Access restricted" lead="Admin authentication is not available from this link. Please use your private administrator access URL.">
      ...
    </AuthFrame>
  );
}
```

**Finding:** Any admin who reaches `/staff` without first visiting `/admin-hub/mbvg-admin-2026` hits this wall. The session storage check `isAdminUnlocked()` returns `false` for any browser tab that has not visited that URL in the current session.

The guard for staff is:
```tsx
if (role.data !== "admin" && role.data !== "staff") { // show "No staff access" }
```
This correctly passes staff through — **staff accounts should work** if navigation is triggered.

### `src/routes/account.tsx` — The navigation trigger for staff post-login

The `useEffect` at line 83:
```tsx
useEffect(() => {
  if (loading || role.isPending || !session) return;   // ← bail-out
  if (role.data === "admin" && !isAdminUnlocked()) {   // ← signs out admin
    void signOut();
    setError("Admin authentication is not available here...");
    return;
  }
  if (submitted) {
    setSubmitted(false);
    if (role.data === "staff") {
      navigate({ to: "/staff" });
      return;
    }
    if (role.data === "admin" && isAdminUnlocked()) {
      navigate({ to: "/staff" });
      return;
    }
    // ... customer redirect
  }
  if (redirectTo) navigate({ to: redirectTo });
}, [loading, role.isPending, session, role.data, redirectTo, navigate, signOut, submitted, signup]);
```

**Finding 1 — Admin sign-out on `/account`:** The first guard fires *before* the `submitted` check. When an admin signs in via `/account`, `isAdminUnlocked()` is `false` (no sessionStorage key), so the code calls `signOut()` and shows an error — the admin is immediately kicked out. This is working as designed, but it means **admins must use `/admin-hub/mbvg-admin-2026`**.

**Finding 2 — Staff navigation race:** After `signIn()` resolves in `submit()`:
```tsx
setSubmitted(true);             // state update — batched
void queryClient.invalidateQueries();  // triggers re-fetch of myRole
```
The sequence is: auth token is set → `useConvexAuth.isAuthenticated` becomes `true` → `useSession` returns `session` → `myRole` query fires → resolves with `"staff"` → `useEffect` re-runs with `submitted: true` and `role.data === "staff"` → `navigate({ to: "/staff" })`.

**This chain should work — but only if `role.isPending` doesn't get stuck.** In TanStack Query v5, a disabled query (`enabled: false`) has `status: "pending"` until it fires. If `session` is still `null` when the component mounts, `role` starts as `{ isPending: true, data: undefined }`. After sign-in, `session` becomes truthy, `enabled` flips to `true`, and the query fires. The bail-out condition `role.isPending` will block the effect from running until the query resolves — this is intentional and should be fine as long as the query resolves promptly.

**Finding 3 — The `redirectTo` fallback fires before `submitted` is processed:** There is an unconditional redirect at the bottom:
```tsx
if (redirectTo) navigate({ to: redirectTo });
```
This runs whenever `session` is truthy, `role` is resolved, and `submitted` is false. If a staff member navigates to `/account?next=/staff` (as the "Sign in to continue" button does from `staff.tsx`), `redirectTo` is `/staff`. After sign-in, if the `submitted` guard somehow doesn't execute, this fallback should still redirect them to `/staff`. **This is a safety net for the staff flow.**

### `src/lib/admin-token.ts` — The sessionStorage unlock mechanism

```ts
export function isAdminUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === ADMIN_HUB_TOKEN;
  } catch {
    return false;  // SSR or private mode
  }
}
```

**Finding:** `sessionStorage` is per-tab and cleared on tab close. The value is only written by `unlockAdmin()`, which is called in two places:
- `src/routes/admin-hub.$token.tsx` — on mount and after successful sign-in
- Nowhere in `src/routes/account.tsx`

So admin accounts signing in through `/account` will never be unlocked.

### `src/routes/admin-hub.$token.tsx` — The correct admin sign-in flow

```tsx
useEffect(() => {
  unlockAdmin();  // called immediately on mount
}, []);

const submit = async (e) => {
  unlockAdmin();           // called before signIn
  await signIn("password", { flow: "signIn", email, password });
  unlockAdmin();           // called again after signIn
  navigate({ to: "/staff" });
};
```

**Finding:** This is the only route that calls `unlockAdmin()`. The token is `"mbvg-admin-2026"` (hardcoded in `src/lib/admin-token.ts`), and the URL is `/admin-hub/mbvg-admin-2026`. Admins who don't know this URL have no way in. There is no UI hint anywhere about this URL.

### `src/lib/use-session.ts` — Session hook

```ts
const loading = !timedOut && (authLoading || (isAuthenticated && profile === undefined));
const session = isAuthenticated
  ? { user: { id: profile?.id ?? "user", email: profile?.email ?? "" } }
  : null;
```

**Finding:** `session` is non-null as soon as `isAuthenticated` is `true`, even before `profile` loads (it uses fallback values). This means `role` query's `enabled: !!session` becomes true immediately after auth resolves. No issue here.

### `convex/users.ts` — `myRole` query

```ts
export const myRole = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (userId === null) return null;
    return await getRole(ctx, userId);
  },
});
```

**Finding:** Returns `"admin" | "staff" | null`. Unauthenticated callers get `null`. No errors thrown. This is correct.

### `src/router.tsx` — Provider hierarchy

```tsx
Wrap: ({ children }) => (
  <ConvexAuthProvider client={convexQueryClient.convexClient} shouldHandleCode={false}>
    {children}
  </ConvexAuthProvider>
),
```

**Finding:** `ConvexAuthProvider` wraps the entire router, making `useConvexAuth()` available everywhere. `shouldHandleCode={false}` prevents Convex from consuming the `?code=` parameter (used for password reset). No issue here.

---

## Root Cause Summary

| # | Who is affected | Root cause | Severity |
|---|---|---|---|
| 1 | **Admin** | Admins signing in via `/account` are immediately signed out by `account.tsx` because `isAdminUnlocked()` is `false`. The only way in is `/admin-hub/mbvg-admin-2026`, which is undocumented in the UI. | **Critical — blocks 100% of admin access** |
| 2 | **Admin** | Even if an admin somehow reaches `/staff`, the same `isAdminUnlocked()` check in `staff.tsx` shows "Access restricted". | **Critical — same root cause as #1** |
| 3 | **Staff** | If staff sign in through `/account` directly (not via `?next=/staff`), the `submitted` flag navigates them to `/staff`. But `staff.tsx` loads `myRole` again and shows "Checking who you are…" while it resolves — this should be fast but any Convex WebSocket latency makes the panel appear to not open. | **Minor — resolves once query arrives** |
| 4 | **Staff** | The "Sign in to continue" button in `staff.tsx` links to `/account?next=/staff`, but `NEXT_ROUTES` in `account.tsx` restricts valid `next` values to a hardcoded list. `/staff` is in the list, so the `redirectTo` fallback fires. However, the `submitted` block fires first if sign-in was just completed. This path is safe. | **Not a bug** |

---

## Conclusions

The **only blocking issue for admins** is the `isAdminUnlocked()` / sessionStorage mechanism. Admins must visit the secret URL `/admin-hub/mbvg-admin-2026` first. This appears to be intentional security design per the code comments, but it is functionally invisible to any admin who doesn't have the URL bookmarked.

**Staff accounts work correctly** — if a staff member signs in and the `myRole` query resolves as `"staff"`, `account.tsx` navigates them to `/staff` and `staff.tsx` renders `<StaffShell>`. The only practical friction is Convex query latency during the loading state.

---

## Recommendations

### Fix 1 (Critical): Make admin sign-in work from `/admin-hub` automatically on return visits

In `src/routes/admin-hub.$token.tsx`, the `useEffect` already calls `unlockAdmin()` and redirects to `/staff` if the user is already authenticated as admin. This means an admin who bookmarks `/admin-hub/mbvg-admin-2026` and visits it while already signed in will be redirected correctly. **The fix is documentation/onboarding: all admin accounts must use `/admin-hub/mbvg-admin-2026` as their bookmark, not `/account`.**

If the intent is to allow admins to also sign in via `/account`, then `account.tsx` needs to call `unlockAdmin()` before signing in, and `staff.tsx`'s admin check must be removed or changed. That would remove the admin hub security feature.

### Fix 2 (Recommended): Remove or soften the admin sign-out behavior in `account.tsx`

Currently when an admin signs in via `/account`, the code signs them out immediately:
```tsx
if (role.data === "admin" && !isAdminUnlocked()) {
  void signOut();
  setError("Admin authentication is not available here...");
  return;
}
```

This is silent and confusing. A better UX would be to redirect to `/admin-hub/mbvg-admin-2026` instead of signing them out — but only if the token is considered "public enough" to show in a redirect. If the token should remain secret, the current behavior is correct, and the fix is to ensure all admin accounts only ever use the hub URL.

### Fix 3 (For staff, minor): Add a loading state in `staff.tsx` for when `role` query is resolving after navigation

The current loading check `session && role.isPending` shows "Checking who you are…" — this is correct. No code change needed, but if the WebSocket takes more than a second, it feels like the panel didn't open. Adding a 2–3 second timeout with a fallback message or retry button would improve perceived responsiveness.

### Fix 4 (For admins already knowing the URL): Verify sessionStorage survives the `/staff` navigation

After `admin-hub` calls `navigate({ to: "/staff" })`, the `sessionStorage` key persists (same tab, same session). The `staff.tsx` then reads `isAdminUnlocked()` which should return `true`. This chain is correct in theory. **If admins report that even the hub URL doesn't work, the issue may be SSR-related**: `isAdminUnlocked()` has a `try/catch` that returns `false` in non-browser environments, which would permanently block access during SSR. TanStack Start SSR renders `staff.tsx` on the server — and on the server, `sessionStorage` is undefined, so `isAdminUnlocked()` returns `false`.

**This is likely the actual bug**: During SSR of `/staff`, the server renders the "Access restricted" screen and sends that HTML to the client. On hydration, the client re-runs `isAdminUnlocked()` — but if React hydrates without re-running the conditional, the locked UI persists. TanStack Start + React 19 should re-run client-side checks after hydration, but if `staff.tsx` is SSR'd and the initial HTML contains the locked AuthFrame, there may be a hydration mismatch or the client never switches to the unlocked state before the user sees the screen.

**The safe fix for this**: Use a `useState(false)` initialized to `false` and set it client-side in a `useEffect` — the same pattern used by `use-session.ts` for the auth timeout. This ensures the `isAdminUnlocked()` check only fires on the client, avoiding the SSR false-negative.

---

## Actionable Fix Summary

| Priority | File | Change |
|---|---|---|
| **P0** | `src/routes/staff.tsx` | Replace direct `isAdminUnlocked()` call in render with a `useState` initialized from `useEffect`, so the SSR render never sees `false` and creates a locked screen that persists after hydration. |
| **P0** | `src/routes/account.tsx` | Same fix for the `isAdminUnlocked()` call in `useEffect` — but more importantly, the admin sign-out behavior should either redirect to the hub or be documented clearly. |
| **P1** | `src/routes/admin-hub.$token.tsx` | Already works; ensure the URL `mbvg-admin-2026` is in `docs/TEST-ACCOUNTS.md` or `docs/PRODUCTION-CREDENTIALS.md` for all admin users. |
| **P2** | Staff-facing docs | Add a note that staff sign in via `/account` and admins must use `/admin-hub/mbvg-admin-2026`. |
