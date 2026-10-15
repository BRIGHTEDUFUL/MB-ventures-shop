# Staff / Admin Panel Sign-in Fix — Double-check Report

**Verdict: The fix is substantially correct and unblocks both the staff and admin
sign-in flows. Three issues remain that each need a targeted follow-up fix.**

---

## Summary

The two-file change (staff.tsx + account.tsx) successfully:

1. Moves the `isAdminUnlocked()` call out of the render body and into a
   `useState` / `useEffect` pair, eliminating the SSR hydration mismatch that
   was the root cause of admin panels not opening.
2. Routes admin accounts that sign in via the normal `/account` page to
   `/admin-hub/${ADMIN_HUB_TOKEN}` instead of silently failing.
3. Removes `signOut` from the navigation `useEffect` dependency array in
   `account.tsx` (was causing a stale-closure re-run loop).

TypeScript: `npx tsc --noEmit --skipLibCheck` exits 0 — no type errors.

---

## Checklist findings (item by item)

### 1. staff.tsx — direct `isAdminUnlocked()` calls in render

**PASS.** The import (`isAdminUnlocked, lockAdmin, ADMIN_HUB_TOKEN`) is still
present and used. The function is only called inside the `useEffect` body
(line 46: `setAdminUnlocked(isAdminUnlocked())`), never in the render path.
`adminUnlocked` state is used in the guard at line 96:

```tsx
if (role.data === "admin" && !adminUnlocked) { … }
```

`Link` is still used: two `<Link to="/account">` and one `<Link to="/">` are
present in the not-signed-in and not-staff screens, so the import is not
orphaned.

No TypeScript issues detected.

---

### 2. account.tsx — `isAdminUnlocked` import & usage

**PASS, but import is now only used as a callee inside `useEffect`.**

`isAdminUnlocked` is imported from `@/lib/admin-token` (line 15) and called
exactly once inside the mount-only `useEffect`:

```tsx
useEffect(() => {
  setAdminUnlocked(isAdminUnlocked());
}, []);
```

This is correct — the import is genuinely needed for that call.

Every former direct render/condition use of `isAdminUnlocked()` has been
replaced with the `adminUnlocked` state variable:

- line 93: `if (role.data === "admin" && !adminUnlocked)`
- line 106: `if (role.data === "admin" && adminUnlocked)`
- roleLine (line 198): `adminUnlocked ? "Store owner · full access" : "Customer account"`
- hub card guard (line 237): `role.data === "staff" || (role.data === "admin" && adminUnlocked)`

`signOut` is **not** in the navigation `useEffect` dependency array (lines
122–131). The dep array is:
`[loading, role.isPending, session, role.data, redirectTo, navigate, submitted, signup, adminUnlocked]`
— correct.

No TypeScript issues detected.

---

### 3. Staff sign-in flow trace

```
/account  →  submit()  →  setSubmitted(true)  →  role resolves "staff"
→  useEffect fires: submitted=true, role.data="staff"
→  navigate({ to: "/staff" })
→  staff.tsx StaffLayout: session present, role="staff"
→  role.data !== "admin" so the adminUnlocked guard is bypassed entirely
→  <StaffShell role="staff"> renders  ✓
```

**No blockers for staff.** The `role.data !== "admin" && role.data !== "staff"` check
correctly rejects non-team accounts only. Staff skip the `adminUnlocked` guard entirely.

---

### 4. Admin sign-in flow trace

**Flow A — admin signs in via `/admin-hub/mbvg-admin-2026` (correct path):**

```
/admin-hub/$token  →  beforeLoad validates token  →  AdminHubPage mounts
→  useEffect: unlockAdmin() writes to sessionStorage immediately
→  admin fills form, submit() calls unlockAdmin() again, then signIn()
→  useEffect: session + role="admin" → navigate({ to: "/staff" })
→  staff.tsx: useEffect runs setAdminUnlocked(isAdminUnlocked()) [true]
→  adminUnlocked=true → guard passes → <StaffShell role="admin"> ✓
```

**Flow B — admin accidentally navigates to `/account` first:**

```
/account  →  useEffect: role.data="admin", adminUnlocked=false
→  toast.info(…); window.location.href = `/admin-hub/mbvg-admin-2026`
→  lands on admin-hub, unlockAdmin() fires → continues as Flow A ✓
```

**No blockers.** Both paths work correctly.

---

### 5. ⚠ ISSUE 1 — Flash of "Access restricted" on `/staff` for unlocked admins

**STATUS: REAL BUG — needs a fix.**

`adminUnlocked` is initialized to `false` in `staff.tsx`. On every mount (page
load, tab restore, SPA navigation to `/staff`) the sequence is:

1. Component renders with `adminUnlocked = false`  
2. Role is still pending OR resolves to "admin"  
3. If role resolves before the `useEffect` fires → renders "Access restricted"  
4. `useEffect` fires → `setAdminUnlocked(true)` → re-render clears it

The flash is real and visible because:
- `useEffect` fires *after* paint
- The role query resolves from cache nearly instantly on revisits

The current `useEffect` dep is `[role.data]`, meaning it re-fires when role
resolves — this helps but does **not** eliminate the flash. The first render
with `role.data = "admin"` and `adminUnlocked = false` will always show the
restricted screen for at least one frame.

**Recommended fix:** initialise `adminUnlocked` with a lazy initializer that
reads `sessionStorage` synchronously but is guarded against SSR:

```tsx
const [adminUnlocked, setAdminUnlocked] = useState(() => {
  if (typeof window === "undefined") return false;
  return isAdminUnlocked();
});
// Keep the useEffect only as a fallback for role-change re-checks
useEffect(() => {
  setAdminUnlocked(isAdminUnlocked());
}, [role.data]);
```

`useState(() => fn())` runs the initializer only on the client (because the
component renders on the server with `typeof window === "undefined"`) and the
result is available on the very first render, before any `useEffect` fires.
This removes the flash entirely.

The same pattern should be applied to `account.tsx`'s `adminUnlocked` state,
though the impact there is lower because the account page doesn't show a hard
restricted screen — it redirects instead.

---

### 6. ⚠ ISSUE 2 — `admin/emails.tsx` still calls `isAdminUnlocked()` directly in render

**STATUS: INCONSISTENCY — same SSR bug as before the fix, in a different file.**

`src/routes/admin/emails.tsx` line 67:

```tsx
if (!session || role.data !== "admin" || !isAdminUnlocked()) {
```

This is a direct synchronous call to `isAdminUnlocked()` in the render body —
the exact pattern the fix eliminated in `staff.tsx` and `account.tsx`. On
server render it returns `false`, so the gate always shows "Access restricted"
HTML in the initial SSR payload. After hydration, React re-renders and the real
value is used — but the user may see the restricted screen briefly (same flash
as Issue 1) and search engines crawling the page receive the restricted content.

**Recommended fix:** Apply the same `useState + useEffect` pattern (or the lazy
initializer from Issue 1's fix) to `emails.tsx`.

---

### 7. ⚠ ISSUE 3 — `adminUnlocked` state not rechecked after `unlockAdmin()` is called in `admin-hub.$token.tsx` submit()

**STATUS: TIMING EDGE CASE — low severity but worth noting.**

In `admin-hub.$token.tsx`, `submit()` calls `unlockAdmin()` and then
immediately calls `navigate({ to: "/staff" })`. When `staff.tsx` mounts fresh
via SPA navigation, `useEffect` fires after the first render. If the role
resolves before the effect runs, the one-frame flash from Issue 1 applies. The
recommended lazy initializer from Issue 1 covers this case too.

Additionally, the post-sign-in effect in `admin-hub.$token.tsx`:

```tsx
useEffect(() => {
  if (!loading && session && role.data === "admin") {
    unlockAdmin();
    toast.success(…);
    void navigate({ to: "/staff" });
  }
}, [loading, session, role.data, navigate]);
```

calls `navigate` inside the effect without first ensuring the effect has not
already been triggered by a stale dep. This is fine in practice (React dedupes
navigation) but could show double toasts on fast mounts. Not a blocker.

---

## Conclusions and recommended fixes

| # | File | Issue | Severity | Fix |
|---|------|-------|----------|-----|
| 1 | `staff.tsx` | Flash of "Access restricted" because `adminUnlocked` initializes `false` | Medium | Use lazy `useState(() => typeof window !== "undefined" ? isAdminUnlocked() : false)` |
| 2 | `admin/emails.tsx` | Direct `isAdminUnlocked()` call in render — SSR hydration mismatch | Medium | Apply the same `useState+useEffect` or lazy initializer pattern |
| 3 | `account.tsx` | Same lazy-initializer improvement (lower urgency — no hard gate) | Low | Use lazy `useState(() => ...)` for `adminUnlocked` |

**The core sign-in flows for both staff and admin are unblocked.** Staff can
sign in and reach `/staff` with no issues. Admins signing in via
`/admin-hub/mbvg-admin-2026` reach `/staff` correctly. The remaining issues
are UX polish (flash) and a parallel SSR inconsistency in `emails.tsx`.
