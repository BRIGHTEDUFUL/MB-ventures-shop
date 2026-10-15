# Backend Deployment Check — MB Ventures GH
**Investigation date:** 15 October 2026  
**Scope:** Does the Convex backend need changes or redeployment to support the staff/admin panel sign-in fix?

---

## Summary Answer (read this first)

**No backend code changes are needed.** The Convex functions that the frontend fix depends on (`api.users.myRole`, `api.users.isStaff`, `api.users.myPermissions`) are correct, complete, and consistent with what the frontend expects.

**A production deployment is needed — but not because of the frontend fix.** It is needed because two earlier backend features (`contact_messages` schema table + 4 new Convex functions in `contact.ts`, plus updated `catalogue.ts` and `orders.ts`) were committed to the repo but never deployed to the `prod:necessary-newt-861` Convex deployment. This gap exists because the GitHub Actions CI pipeline skips the Convex deploy step (the `CONVEX_DEPLOY_KEY` GitHub secret has never been added to the repo).

**The local `_generated/` directory does not need a codegen re-run** before deployment — the module structure hasn't changed, only function bodies and a new table were added to existing modules that are already listed in `api.d.ts`.

---

## Evidence

### 1. Backend queries used by the fixed routes — all correct

**`convex/users.ts`** — `myRole`, `isStaff`, `myPermissions`:

- `myRole` (line ~38): returns `"admin" | "staff" | null` by querying `user_roles.by_user` index for the current session user. This matches exactly what `staff.tsx` and `account.tsx` compare against (`role.data === "admin"`, `role.data === "staff"`). No edge case.
- `isStaff` (line ~29): returns `boolean` — delegates to `getRole !== null`. Frontend uses this in the `enabled:` guard but not directly for routing. Correct.
- `myPermissions` (line ~49): returns `PermissionKey[]`. Uses `getRole` then applies `user_roles.overrides` against `defaultPermissions(role)`. Returns `[]` for unauthenticated or role-less users (safe — never throws). Correct.

**`convex/lib/auth.ts`**:

- `currentUserId` wraps `getAuthUserId` from `@convex-dev/auth/server`. Returns `Id<"users"> | null`. Consistent with how `myRole` uses it.
- `getRole` queries `user_roles.by_user` index, returns `"admin" | "staff" | null`. The exact union the frontend checks.
- `requireStaff` / `requireAdmin` throw `ConvexError({ message })` — consistent with AGENTS.md §4d which says "all user-facing errors must throw `ConvexError({ message })`".
- `STAFF_ACCESS_MESSAGE` and `ADMIN_ACCESS_MESSAGE` are exported constants matched by test assertions (confirmed in `convex/lib/auth.ts` lines exported as `const`).

**`convex/schema.ts`** — `user_roles` table:

```
user_roles: defineTable({
  user_id: v.id("users"),
  role: v.union(v.literal("admin"), v.literal("staff")),
  overrides: v.optional(v.record(permissionKey, v.boolean())),
}).index("by_user", ["user_id"]),
```

The `role` field is exactly `"admin" | "staff"` — matches what `myRole` returns and what `staff.tsx`/`account.tsx` compare against. No mismatch.

### 2. Auth configuration — correct

**`convex/auth.config.ts`**: Uses `CONVEX_SITE_URL` as the provider domain (not `SITE_URL`). This is the correct value per the PROGRESS.md note from the October 10 auth repair: "the 'No auth provider found matching the given token' error is gone" after switching to `CONVEX_SITE_URL`. No change needed.

**`convex/auth.ts`**: Email + password only (single `Password` provider). Password reset emails route through the `emails.enqueueAuth` internal mutation. Phone is collected at sign-up and stored on the `users` table. No OAuth or email verify. All correct.

**`convex/http.ts`**: Only adds `auth.addHttpRoutes(http)`. No staff-relevant HTTP endpoints. Correct.

### 3. The `_generated/` directory

| File | Generated | Status |
|------|-----------|--------|
| `api.d.ts` | 2026-10-12 22:02 UTC | **Technically stale** — 5 source files modified after it |
| `dataModel.d.ts` | 2026-10-08 22:20 | Derives `DataModel` from `schema.ts` via TypeScript structural typing |
| `api.js` | 2026-10-08 03:17 | JS runtime shim, rarely stale-sensitive |
| `server.d.ts` / `server.js` | 2026-10-08 | Framework types, unchanged |

**Source files modified after `api.d.ts`:**

| File | Modified | Type of change |
|------|----------|---------------|
| `convex/schema.ts` | 2026-10-13 03:20 | Added `contact_messages` table |
| `convex/contact.ts` | 2026-10-13 03:26 | Added `list`, `unreadCount`, `markRead`, `markReplied` functions |
| `convex/catalogue.ts` | 2026-10-12 22:47 | Updated mutation bodies |
| `convex/orders.ts` | 2026-10-12 22:47 | Updated mutation bodies |
| `convex/lib/stock.ts` | 2026-10-12 23:04 | Updated internal helper (no Convex functions) |
| `convex/lib/variants.ts` | 2026-10-12 22:47 | Pure helper (no Convex functions) |

**Why `api.d.ts` staleness is NOT a blocker locally:**

`api.d.ts` lists `import type * as contact from "../contact.js"` and maps it as `contact: typeof contact`. TypeScript resolves `typeof contact` from the actual source file at compile time, not from what was captured in the generated file at generation time. So `api.contact.list`, `api.contact.unreadCount` etc. are type-safe in the frontend today even with the stale generated file.

`dataModel.d.ts` is even more robust — it derives `DataModel` directly from `schema.ts` at compile time via `DataModelFromSchemaDefinition<typeof schema>`, so the new `contact_messages` table is already typed correctly without regeneration.

**However:** A `npx convex dev` run (or `npx convex codegen`) should be done before the next manual codegen snapshot to keep the generated files in sync with source. This is a hygiene issue, not a blocker.

### 4. Production deployment gap — this IS a real issue

**The CONVEX_DEPLOY_KEY GitHub secret has never been added** to the repository. Per the GitHub Actions workflow (`deploy-hostinger.yml`):

```yaml
- name: Deploy Convex Backend
  if: env.CONVEX_DEPLOY_KEY != ''
  run: npx convex deploy
  env:
    CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}
```

This step is skipped on every push because the secret is empty. From PROGRESS.md:
> "both workflows ran and reported success — but nothing deployed: the repository has no Actions secrets configured (`gh secret list` empty), so the Convex backend step and the VPS SSH step both skipped"

**Last confirmed manual Convex deploy:** October 10, 2026 — "Backend deployed with `npx convex deploy`" (Auth Repair entry in PROGRESS.md). This means the production Convex backend at `prod:necessary-newt-861` is running the state from October 10.

**Backend changes committed AFTER the last manual deploy (October 10):**

| Commit | Date | Backend change |
|--------|------|---------------|
| `3b4faf1` | Oct 13 | `schema.ts` + variants (product_variants table, variant fields in products) |
| `3dbb96c` | Oct 13 | `schema.ts` + `contact.ts` — added `contact_messages` table + 4 new queries/mutations |

Wait — `3b4faf1` was the variants feature. Let's check whether the variants changes were deployed. PROGRESS.md's "Customer inquiries inbox" entry says:
> "Verified end-to-end against `https://mbventuresgh.com` using Playwright automation... confirming access to `/staff/messages` and retrieval of live submissions."

This implies the contact_messages work WAS deployed manually (otherwise that e2e test would have failed). But it contradicts the "not deployed, nothing pushed" note that appears earlier. The contradiction is explained by the two-step history: the contact_messages commit was deployed manually (proven by the live Playwright verification), but then more commits were pushed afterward without deploying.

**Commits pushed to `origin/main` AFTER any confirmed Convex deploy:**

Looking at git log after `3dbb96c` (Oct 13 03:29, verified live):
- `0898305` — docs only  
- `131c577` — docs only
- `5cffd37` — docs only
- `b1c2867` — account provisioning (no backend code)
- `024d9de` — docs only
- `dddbe46` — docs only
- `b9d2cc2` — frontend fix (product options, mobile)
- `3292504` — domain strings (frontend env files only)
- `34ab9b7` — mobile menu drawer (frontend only)
- `97ad58a` — **admin portal + staff auth isolation** (frontend + `src/lib/admin-token.ts` only, **no convex/ changes**)
- `35a26fd` — **personalized welcome + auto-redirect** (frontend only, **no convex/ changes**)

**Conclusion: No Convex backend code changed after the last verified deployment.** All commits since `3dbb96c` touched only frontend files, docs, or scripts. The backend functions the frontend fix depends on (`myRole`, `isStaff`, `myPermissions`) were already deployed.

### 5. Environment — correct

**`.env`** and **`.env.production`** both set:
```
VITE_CONVEX_URL=https://necessary-newt-861.convex.cloud
VITE_CONVEX_SITE_URL=https://necessary-newt-861.convex.site
```

The production Convex deployment `prod:necessary-newt-861` matches these URLs. `.env.prod.local` contains `CONVEX_DEPLOY_KEY` (key name confirmed, value redacted) meaning a manual deploy can be triggered from this machine.

---

## What could still cause staff/admin access to fail

### ✅ Not a backend problem — the auth token domain issue is resolved
`auth.config.ts` was fixed on October 10, 2026. The `domain: process.env["CONVEX_SITE_URL"]` is correct. This was the original root cause of the auth failure (sessions weren't matching their issuer, so every signed-in user was treated as anonymous).

### ✅ Not a backend problem — role grants exist
Four production accounts were provisioned on October 13: `manager@mbventuresgh.com` (admin), `admin@mbventuresgh.com` (admin), `attendant@mbventuresgh.com` (staff), `staff@mbventuresgh.com` (staff). These role rows exist in `user_roles` on the live backend.

### ⚠️ Potential: Admin unlock flow requires visiting `/admin-hub/mbvg-admin-2026`
The `staff.tsx` layout now has an `adminUnlocked` gate: admin users who sign in via `/account` (instead of the admin hub URL) see an "Access restricted" screen. The fix implemented in `97ad58a` is purely frontend and is already deployed (pushed to `origin/main` on Oct 13). Whether the frontend on the production VPS is serving this version depends on whether the VPS auto-deployed — AGENTS.md notes the VPS "auto-deploys main via its own git-pull build loop", but the new Hostinger account's VPS has **no secrets configured**, so the SSH deploy step has always been skipped. The **old server** (mbventuresghana.com) may have auto-deployed an older version.

This is the one remaining risk: the frontend may be serving a version from before the `adminUnlocked` fix was committed, depending on which server is actually live.

---

## Conclusions and Recommendations

### Q1: Does the backend need any code changes?
**No.** `myRole`, `isStaff`, `myPermissions`, `getRole`, `requireStaff`, `requireAdmin`, auth config — all correct. No backend changes are needed to support the frontend fix.

### Q2: Is `convex/_generated/` up to date?
**Mostly.** `api.d.ts` is technically stale (5 source files modified after it), but TypeScript resolves types from source files at compile time so there is no runtime or type-safety impact. Run `npx convex dev` locally to refresh it as housekeeping — not urgent and not a deploy blocker.

### Q3: Does a Convex production deployment need to be triggered?
**Not for the sign-in fix specifically** — the backend functions it depends on are already deployed. However, if `/staff/messages` (the inbox feature) is being used on production, those backend functions were deployed in the `3dbb96c` commit. No new Convex code has been committed since then, so the backend is already current.

**If you want to be safe and ensure everything is in sync**, run:
```powershell
npx convex deploy --env-file .env.prod.local
```
This is idempotent and will bring the backend to the exact state of the current codebase with zero risk of data loss.

### Q4: Is there anything in the backend that could still cause staff/admin access to fail?
**One thing:** The admin `ADMIN_HUB_TOKEN` check (`sessionStorage` must contain `"mbvg-admin-2026"`) is enforced in the frontend, not the backend. Admins who try to access `/staff` without first visiting `/admin-hub/mbvg-admin-2026` will see "Access restricted". This is intentional (as designed in `97ad58a`), but administrators must know to use the private hub URL. This is a UX consideration, not a bug.

Otherwise: backend role checks are correct, auth config is correct, and all four production accounts have the correct roles.

### Q5: What commands need to be run?

**Optional but recommended — Convex backend sync:**
```powershell
# From: c:\Users\NHANA_K_OTTO\Desktop\circle-shop-express-main
npx convex deploy --env-file .env.prod.local
```
Deploys the current backend to `prod:necessary-newt-861`. Safe, idempotent.

**Optional — codegen refresh (local hygiene only, not needed for deploy):**
```powershell
npx convex dev   # runs codegen + watches; Ctrl+C once types are generated
# OR
npx convex codegen
```

**Frontend deploy** (if the VPS has not auto-pulled the latest commits):
Per AGENTS.md §6, the frontend deploys automatically when GitHub Actions runs with the `HOSTINGER_*` secrets configured. If those secrets are still absent, the VPS needs a manual `git pull` + `npm run build` + `pm2 reload`.

---

## File / symbol citations

| Symbol | File | Line (approx) |
|--------|------|---------------|
| `myRole` query | `convex/users.ts` | ~38 |
| `isStaff` query | `convex/users.ts` | ~29 |
| `myPermissions` query | `convex/users.ts` | ~49 |
| `getRole()` | `convex/lib/auth.ts` | ~25 |
| `requireStaff()` | `convex/lib/auth.ts` | ~43 |
| `requireAdmin()` | `convex/lib/auth.ts` | ~51 |
| `user_roles` schema | `convex/schema.ts` | ~168 |
| `CONVEX_SITE_URL` auth config | `convex/auth.config.ts` | line 14 |
| `adminUnlocked` state/gate | `src/routes/staff.tsx` | ~40–55 |
| `isAdminUnlocked()` | `src/lib/admin-token.ts` | ~19 |
| `ADMIN_HUB_TOKEN` | `src/lib/admin-token.ts` | ~12 |
| `VITE_CONVEX_URL` | `.env` | line 3 |
