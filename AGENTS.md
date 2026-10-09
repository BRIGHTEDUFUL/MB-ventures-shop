## Store architecture

- Use TanStack file routes with shared store components and a root cart provider so navigation preserves the shopping flow.
- Backend is **Convex** (`convex/`): public queries serve read-only storefront DTOs, while `orders.place`, `orders.staffUpdate`, `catalogue.*` and `uploads.*` are the transactional functions that hold authoritative prices, stock, delivery settings and status transitions; browser totals are estimates only.
- Auth is Convex Auth with the email + password provider only (no OAuth, no email verification). Sign-up stores name and phone; profile reads come from `users:me`, and staff privileges live in the `user_roles` table guarded by `lib/auth.requireStaff`. Storefront copy, featured picks, the announcement bar and the delivery fees are staff-level (`catalogue.saveSettings`, `catalogue.saveDeliverySettings`); the Mobile Money recipient is admin-only (`catalogue.saveMomoSettings`) because it decides whose wallet the money lands in. All user-facing failures must throw `ConvexError({ message })` so the text reaches the browser.
- Guest tracking requires an unguessable receipt reference plus the order phone number (`orders.track`); no session needed.
- Keep unverified demonstration products distinct from live inventory and block their checkout until staff confirms them; never present invented inventory as real store facts.

## Quality gates

- Run `npx tsc --noEmit`, `npm run lint`, `npm test`, `npx prettier --check .` and `npm run build` before calling anything done. Playwright adds two more: `npm run test:e2e` (storefront head/outline/crawler checks plus the 320/360/390/414 mobile matrix — 32 checks) and `npm run test:e2e:live`, which places a **real order** in dev, works it as staff, cancels it and verifies the restock (`e2e/purchase.spec.ts`; opt-in only, never part of a plain test run).
- Absolute URLs (canonical, `og:url`, sitemap) come from `VITE_SITE_URL`; it is `http://localhost:5173` in `.env.development` and empty in `.env.production` until the real domain exists — empty omits the absolute URL rather than publishing a wrong host.
- The live run signs in as `e2e.staff@example.com` (`E2E_STAFF_PASSWORD` overrides the default) and needs `npx convex run users:grantStaff '{"email":"e2e.staff@example.com"}'` once.

## Deployments

- **Dev** (day to day): `npm run dev` runs `vite dev` and `convex dev` together; `.env.local` points both at the dev deployment `dev:stoic-elephant-714`.
- **Prod**: `npx convex deploy` with `CONVEX_DEPLOY_KEY` from `.env.prod.local` targets `prod:necessary-newt-861`. Tracked `.env` carries the production `VITE_CONVEX_URL`, so production builds need no extra configuration; `.env*.local` files are gitignored.
- Prod runs its own auth keys (`JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL`); regenerate them with the `@convex-dev/auth` CLI if they ever leak. `SITE_URL` is a placeholder until the real frontend domain is known (runtime auth only reads `CONVEX_SITE_URL`, which Convex provides).
- Idempotent seed: `npx convex run seed:seed` (add `--prod` for production).
- Grant staff after the owner registers: `npx convex run users:grantStaff '{"email":"..."}'` (add `--prod` for production). Windows PowerShell strips quotes from native args — pass the JSON with escaped quotes (`'{\"email\":\"...\"}'`).
- Staff/admin test sign-ins, password checks and the account-recovery path live in `docs/TEST-ACCOUNTS.md` (prod currently has no admin account — register, then grant).
- Staff then flip settings from `/staff` (`ordering_enabled` stays off until MoMo recipient details are saved).
