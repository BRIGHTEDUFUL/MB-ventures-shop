# Backend migration plan: Supabase → Convex

> **Status: complete.** All phases (0–6) are executed and verified. Dev deployment
> `dev:stoic-elephant-714` is where day-to-day work happens; production
> `prod:necessary-newt-861` has functions, auth keys, seeds and a smoke-tested
> storefront (browse, sign-up with phone, checkout prefill, ordering gate, staff
> authorization, anonymous tracking). See AGENTS.md → _Deployments_ for the
> commands. Remaining owner actions: register the real account and grant staff,
> flip `ordering_enabled` from `/staff` (payment is collected offline — no
> recipient details needed), and set
> `SITE_URL` to the real frontend domain if verification emails are ever added.

Goal: move **all** data, business logic, authorization, file storage and identity from Supabase
(Postgres + RLS + RPCs + Storage + Auth) to Convex, without breaking the storefront at any commit.

## 0. Confirmed decisions

| Topic              | Decision                                                                                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity           | Full move to **Convex Auth** (`@convex-dev/auth`, Password provider). Supabase Auth is removed.                                                                                                                         |
| Auth flows         | **Email + password only.** Sign-up collects **name, phone number and password** in addition to email (phone accepts digits/`+`, min 9). No OAuth.                                                                       |
| Who must sign in   | **Browsing is public** — no auth for home/catalogue/product/search/tracking. **Placing an order requires an account**: `/checkout` redirects to `/account` (cart is kept in localStorage). Staff pages stay role-gated. |
| Data to carry over | Seeds + settings only (10 products, 5 categories, `store_settings`). Orders/accounts start fresh.                                                                                                                       |
| Client data layer  | **Keep TanStack Query** via `@convex-dev/react-query` (`convexQuery` + existing loaders/suspense).                                                                                                                      |
| Photos             | **Convex file storage** (`generateUploadUrl` + `storage.getUrl`).                                                                                                                                                       |
| Convex project     | `necessary-newt-861` → API `https://necessary-newt-861.convex.cloud`, HTTP actions `https://necessary-newt-861.convex.site`                                                                                             |

## 1. What exists today (the surface being replaced)

**Server functions** (`src/lib/store.functions.ts`): `getStore` (only one actually used, via
`storeQuery`), plus `staffOrders` / `updateOrder` / `submitOrder` which are dead code — the UI calls
Supabase directly instead.

**Supabase usage in the UI** (8 files):

| File                                  | Calls                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/lib/store.ts`                    | `storeQuery` → `getStore` server fn                                                                           |
| `src/routes/checkout.tsx`             | `rpc('place_store_order')`                                                                                    |
| `src/routes/track.tsx`                | `rpc('track_store_order')`                                                                                    |
| `src/routes/account.tsx`              | auth sign in/up/out, `orders`, `saved_addresses` (becomes the single auth page: email + **phone** + password) |
| `src/routes/staff.tsx`                | `rpc('is_staff')`, `orders`, `store_settings` update, `rpc('staff_update_order')`                             |
| `src/components/catalogue-editor.tsx` | `products` CRUD + Storage upload/signed URLs                                                                  |
| `src/routes/__root.tsx`               | `auth.onAuthStateChange` → router/query invalidation                                                          |
| `src/lib/use-session.ts`              | session state (`session.user.id` / `.email`)                                                                  |

**Google OAuth** (the legacy OAuth integration wrapper) is dropped entirely — auth is email/password only.

**Postgres objects to port** (`drizzle/migrations/*.sql`):
tables `products`, `categories`, `store_settings`, `orders`, `order_history`, `saved_addresses`,
`user_roles`; RPCs `place_store_order`, `track_store_order`, `staff_update_order`, `is_staff`;
RLS policies on every table; Storage policies on the `product-photos` bucket; seed rows.

**AGENTS.md invariants that must survive the port:** server-authoritative prices/stock/fees/order
creation; staff-only privileges; anonymous tracking via unguessable reference + phone (no login
needed); unverified
demo products stay unorderable; browser totals are estimates only.

## 2. Target architecture

```
convex/
  schema.ts          tables + indexes (replaces drizzle/*.sql)
  auth.ts            Convex Auth config (Password provider only)
  auth.config.ts     http.ts        generated by `npx @convex-dev/auth`
  store.ts           public reads: store.get
  orders.ts          place / track / mine / staffList / staffUpdate
  catalogue.ts       staff writes: products, categories, settings
  addresses.ts       owner CRUD for saved addresses
  users.ts           me / isStaff / (internal) grantStaff
  uploads.ts         generateUploadUrl + savePhoto (staff)
  seed.ts            idempotent seed: products + categories + settings
  lib/auth.ts        requireUser(ctx), requireStaff(ctx)
  lib/rules.ts       pure validation/fee/stock rules (shared with tests + UI estimates)
  _generated/        codegen (commit it)
```

Client keeps React Query; Convex is the transport:

- `ConvexQueryClient` in `src/router.tsx` (sets `queryKeyHashFn` / `queryFn`, `connect(queryClient)`),
  `<ConvexAuthProvider>` in the router `Wrap`, `setupRouterSsrQueryIntegration(...)`.
- `storeQuery` in `src/lib/store.ts` becomes `convexQuery(api.store.get, {})` → route loaders,
  `useSuspenseQuery` and `useQuery` call sites stay as they are.
- Writes use `useConvexMutation(...)` (optionally wrapped in `useMutation` for `busy`/`error` state).

**Convention:** Convex documents use snake_case field names identical to Postgres, and every
_public query returns the legacy Supabase-shaped DTO_ (`id`, `created_at` ISO string, `price`
number). That keeps cart localStorage, `p.id` slugs, `new Date(o.created_at)` and `money(p.price)`
working across ~10 route/component files with near-zero UI churn.

## 3. Schema mapping

| Postgres                  | Convex table                                                                      | Notes                                                                                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `products.id` (slug)      | `slug` + `id` alias in DTO                                                        | index `by_slug`                                                                                                                                                                                                         |
| `products.original_price` | `v.optional(v.number())`                                                          |                                                                                                                                                                                                                         |
| `products.gallery text[]` | `v.array(v.string())`                                                             | built-in keys **or** https URLs                                                                                                                                                                                         |
| `products.specs jsonb`    | `v.record(v.string(), v.string())`                                                |                                                                                                                                                                                                                         |
| `products.verified/stock` | `v.boolean()` / `v.number()`                                                      | validated in code (Convex has no CHECKs)                                                                                                                                                                                |
| `categories.*`            | `categories` (`slug`, `name`, `short_name`, `image_key`, `sort_order`, `visible`) | index `by_slug`                                                                                                                                                                                                         |
| `store_settings(id=1)`    | `store_settings` singleton doc (`key: "singleton"`, index `by_key`)               | includes `featured_ids: string[]`                                                                                                                                                                                       |
| `orders.*`                | `orders`                                                                          | `userId: v.id("users")` (always set — checkout requires an account), `reference` index `by_reference`, `items: v.array(v.object({id,name,price,quantity,image_key}))`, `created_at` = ISO string (from `_creationTime`) |
| `order_history.*`         | `order_history`                                                                   | `orderId` + index `by_order`; `actorId` nullable                                                                                                                                                                        |
| `saved_addresses.*`       | `saved_addresses`                                                                 | `userId` + index `by_user`                                                                                                                                                                                              |
| `user_roles`              | `user_roles`                                                                      | `userId: v.id("users")`, `role: "admin"                                                                                                                                                                                 | "staff"`, index `by_user` |
| —                         | `users`                                                                           | **owned by Convex Auth** (`email`, `name`) **plus `phone: v.optional(v.string())`** written by the Password provider's `profileParams`                                                                                  |
| Storage `product-photos`  | Convex `_storage`                                                                 | store `Id<"_storage">` → resolve to https URL at write time                                                                                                                                                             |

Additional indexes: `orders.by_user`, `orders.by_created` (staff list, desc by `_creationTime`).

Differences that need explicit handling:

1. **No `UNIQUE` constraint on `orders.reference`** → generate `MB-` + 8 random bytes hex and loop
   until `by_reference` lookup misses.
2. **No `FOR UPDATE`** → Convex mutations are serializable transactions with optimistic
   concurrency; reading a product, checking stock and decrementing it inside one mutation is
   already race-safe (conflicting last-unit orders abort and retry, then fail the stock check).
3. **No RLS / CHECK constraints** → every rule lives in the function body (section 4) behind `v`
   argument validators.
4. **Money is `v.number()`** (Postgres was `numeric`) → round subtotal/fee/total to 2 decimals in
   the mutation so totals stay stable.

## 4. Authorization matrix (RLS → code)

| Data                                         | Today                                     | Convex rule                                                                                   |
| -------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| products / categories / settings read        | RLS `USING(true)` to anon                 | public `query`                                                                                |
| products / categories write, settings update | `is_staff()`                              | `requireStaff(ctx)` at top of mutation                                                        |
| place order                                  | `SECURITY DEFINER` fn, guest or logged-in | **`requireUser(ctx)`** — orders are only created by a signed-in account (`userId` always set) |
| track order                                  | ref + phone match                         | public query (no auth needed), same predicate, returns DTO only                               |
| my orders                                    | `user_id = auth.uid()`                    | `requireUser(ctx)` + filter by user id                                                        |
| order history read                           | staff **or** owner                        | inside `track` (ref+phone) and staff queries                                                  |
| staff order list/update                      | `is_staff()`                              | `requireStaff(ctx)`                                                                           |
| saved addresses                              | owner-only                                | `requireUser(ctx)` + `userId` match on every op                                               |
| role lookup (`is_staff`)                     | `auth.uid()`                              | `requireUser` + `user_roles` index lookup                                                     |
| photo upload                                 | Storage policies `bucket + is_staff`      | `requireStaff(ctx)` in `uploads.ts`                                                           |

All user-facing failures must `throw new ConvexError({ message })` — plain `Error` messages are
**redacted in production deployments**, so checkout/staff error text would become "Server Error".

## 5. Business logic port (rule-for-rule)

`place_store_order(payload)` → `convex/orders.ts place`:

1. Load settings; reject when `ordering_enabled` is false.
2. Validate `customer_name ≥ 2`, `phone ≥ 9`, `email` matches `%@%.%`.
3. `items` length 1–50; each `quantity` 1–50.
4. `pickup ⇒ payment_method = momo`.
5. `momo ⇒ settings.momo_number set ∧ transaction_reference ≥ 5 ∧ provider ∈ {MTN MoMo, Telecel Cash, AirtelTigo Money}`.
6. `delivery ⇒ address ≥ 5`.
7. Per item: product must exist, `verified === true`, `stock ≥ quantity`; **price read from the DB
   row**, line snapshot pushed into `items`; decrement `stock`.
8. Fee only when `delivery ∧ subtotal ≤ free_threshold`, by zone (`central|greater|nationwide`);
   invalid zone on a delivery order throws.
9. Insert order — **`userId` is the signed-in user** (`requireUser` already ran), contact fields
   taken from the checkout form (prefilled from the account profile: name + phone), sanitized
   phone, normalized `reference`; insert `order_history` entry `received`; return the receipt DTO.

`staff_update_order` → `convex/orders.ts staffUpdate`: `requireStaff`; reject edits to
`completed|cancelled`; status/payment enums; `ready ⇒ pickup`, `dispatched ⇒ delivery`; momo orders
cannot advance past `received` while payment ≠ `confirmed`; `completed ⇒ payment confirmed`;
`cancel` restocks every line; write `order_history` with `actorId`.

`track_store_order` → `orders.track`: match `upper(trim(reference))` + phone normalized to
`[^0-9+]`; return reference/status/payment/items/totals/`created_at`/history — nothing else.

`is_staff` → `lib/auth.ts requireStaff` + `users.isStaff` query.

Client-side `delivery()` estimate in `src/lib/store.ts` stays as-is (browser estimate only); the
server recomputes independently — extract shared predicates into `convex/lib/rules.ts` so the two
cannot drift.

## 6. Client integration (file-by-file)

**Add:** `convex`, `@convex-dev/react-query`, `@convex-dev/auth`, `@tanstack/react-router-ssr-query`
(+ let `npx @convex-dev/auth` install its own deps) and `concurrently` for scripts.
**Bump:** `@tanstack/react-query` to ≥ 5.102 (Convex loader helpers use `staleTime: "static"`).

| File                                             | Change                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/router.tsx`                                 | `new ConvexQueryClient(VITE_CONVEX_URL)`; `queryClient` defaults `queryKeyHashFn`/`queryFn`; `convexQueryClient.connect(queryClient)`; `Wrap` → `<ConvexAuthProvider client={convexQueryClient.convexClient}>`; `setupRouterSsrQueryIntegration({router, queryClient})`                                                 |
| `src/lib/store.ts`                               | `storeQuery = convexQuery(api.store.get, {})`; replace `Database['public']…` types with local `Product/Order/Settings/Category/Receipt` interfaces (legacy-shaped)                                                                                                                                                      |
| `src/routes/{index,catalogue,product.$slug}.tsx` | no logic change; loaders keep `ensureQueryData(storeQuery)` (verify on first run; fallback: `queryClient.query({...storeQuery, staleTime:'static'})`)                                                                                                                                                                   |
| `src/routes/checkout.tsx`                        | **auth gate**: `useConvexAuth()` → when unauthenticated, redirect to `/account` (cart persists in localStorage; `?next=/checkout`); `supabase.rpc('place_store_order')` → `useConvexMutation(api.orders.place)`; map `ConvexError.data.message` to the existing error line; prefill name/phone from the account profile |
| `src/routes/track.tsx`                           | gated `useQuery({...convexQuery(api.orders.track, {ref, phone}), enabled: submitted})`                                                                                                                                                                                                                                  |
| `src/routes/account.tsx`                         | becomes the **only** auth page: sign-in (email + password) and sign-up (name + **phone** + email + password) via `useAuthActions().signIn('password', {…, flow})`, `signOut()`; orders/addresses via `convexQuery` + `useConvexMutation`; honours `?next=` to return to checkout                                        |
| `src/routes/staff.tsx`                           | role → `api.users.isStaff`; orders → `api.orders.staffList`; settings → `api.catalogue.saveSettings`; status updates → `api.orders.staffUpdate`                                                                                                                                                                         |
| `src/components/catalogue-editor.tsx`            | `api.catalogue.saveProduct/deleteProduct`, `api.uploads.*`; `refresh()` props become optional (queries are reactive now)                                                                                                                                                                                                |
| `src/lib/use-session.ts`                         | rewrite on `useConvexAuth()` + `convexQuery(api.users.me)` but keep the `{session:{user:{id,email}}, loading}` shape to limit churn                                                                                                                                                                                     |
| `src/routes/__root.tsx`                          | drop the Supabase `onAuthStateChange` subscriber (auth changes are reactive through Convex)                                                                                                                                                                                                                             |
| `src/start.ts`                                   | drop `attachSupabaseAuth`; keep CSRF + error middleware                                                                                                                                                                                                                                                                 |
| `package.json`                                   | scripts: `dev` → `concurrently -k "vite dev" "convex dev"`, `convex:codegen`, `convex:deploy`                                                                                                                                                                                                                           |
| `tsconfig.json`                                  | add `convex/**/*.ts` to `include`                                                                                                                                                                                                                                                                                       |
| `.env`                                           | add `VITE_CONVEX_URL=https://necessary-newt-861.convex.cloud` (normally written by `npx convex dev` into `.env.local`, already covered by `*.local`); remove Supabase keys in phase 5                                                                                                                                   |

## 7. Auth migration (Convex Auth — email + password only)

1. `npx @convex-dev/auth` → generates `convex/auth.ts`, `auth.config.ts`, `http.ts` (HTTP routes on
   `https://necessary-newt-861.convex.site`). Keep only the `Password` provider — no OAuth.
2. **Phone on sign-up**: add `phone: v.optional(v.string())` to the `users` schema and collect it in
   the sign-up form (`name`, `phone`, `email`, `password`). Pass it through the provider's
   `profileParams` so it lands on the user document; validate `^[+0-9\s-]{9,}$` client-side and
   normalize to digits/`+` server-side (same normalization `orders.phone` uses).
3. Frontend: `ConvexAuthProvider` in the router `Wrap`; `useAuthActions()` for
   `signIn('password', {…, flow: 'signIn'|'signUp'})` and `signOut()`;
   `useConvexAuth()` replaces `supabase.auth.getSession()/onAuthStateChange`.
4. `users.ts me` query returns `{_id, email, name, phone}` → used by the account page, the checkout
   prefill and the staff role lookup.
5. **Auth boundary**: `requireUser(ctx)` at the top of `orders.place`, `orders.mine`,
   `addresses.*`; every read used for browsing (`store.get`, `orders.track`, product/category
   listings) stays public, so visiting the shop never triggers a sign-in.
6. Staff bootstrap: internal `users:grantStaff` mutation, run once with
   `npx convex run users:grantStaff '{"email":"owner@example.com"}'` (no `user_roles` rows to import).
7. Known behaviour changes to accept or schedule:
   - **Existing Supabase accounts do not carry over** — owner re-registers, then is granted staff.
   - **Checkout now requires an account** (was guest-capable). `/account` is the single sign-in /
     sign-up page, with `?next=` to return to `/cart`/`/checkout`; the cart itself stays in
     localStorage so nothing is lost by the redirect.
   - **Tracking stays anonymous**: reference + phone, no login required (unchanged rule from AGENTS.md).
   - **No email confirmation by default** (Supabase had `emailRedirectTo`). Add verification later
     via a Resend/SMTP provider if wanted.

## 8. Photos

`catalogue-editor.tsx upload()` becomes: mutation `uploads.generateUploadUrl` → `fetch(url, {method:'POST', body:file})`
→ mutation `uploads.savePhoto({storageId, kind})` → `await ctx.storage.getUrl(storageId)` stored in
`image_key` / `gallery`. Because the result is an https URL, `src/lib/store-images.ts`'s Proxy and
every `<img src={images[...]}>` keep working unchanged. Seeded products keep their built-in photo
keys, so nothing is re-uploaded; any staff-uploaded Supabase URLs already stored in rows keep
working until the Supabase project is switched off (optional follow-up: one script to re-host them).

## 9. Seed

`convex/seed.ts` (internal, idempotent — insert only when the table is empty or the slug is
missing): 10 products from `0000_store_orders_catalogue.sql`, 5 categories + `featured_ids` +
settings defaults from `0003_customizable_store.sql`, `store_settings` singleton with
`ordering_enabled=false`. Run with `npx convex run seed:seed`.

## 10. What gets deleted (phase 5 only)

`src/integrations/supabase/*`, the legacy OAuth wrapper file,
`src/lib/store.functions.ts`, `drizzle/`, `drizzle.config.ts`, `supabase/config.toml`,
Supabase entries in `.env`/`package.json` (`@supabase/supabase-js`, `drizzle-kit`, `drizzle-orm`,
`postgres`), and the Supabase bullets in `AGENTS.md`. **Kept:** `previewAuthStorage` only if still
referenced (it is Supabase-bound → delete with the rest). The editor toolchain was removed in a
later pass: the build uses the standard TanStack Start + Vite plugins directly.

## 11. Phased execution (branch stays green after every phase)

| Phase                             | Work                                                                                                                                                                                                   | Verify before moving on                                                                                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0. Scaffold**                   | `npx convex dev` in repo root (attaches `necessary-newt-861`, writes `VITE_CONVEX_URL`), install deps, router/`__root` wiring, empty `schema.ts`, scripts, tsconfig include                            | App boots, console shows a connected Convex client; existing Supabase pages still work                                                                                                                                                                                                           |
| **1. Schema + public reads**      | `schema.ts` (all tables/indexes), `store.ts` query, `seed.ts`, swap `storeQuery`, delete `getStore` server fn                                                                                          | Home/catalogue/product/search/nav render seeded data; live-editing a product in the Convex dashboard updates an open page                                                                                                                                                                        |
| **2. Auth + account**             | Convex Auth init (Password only), `phone` on `users`, `users.me`, `use-session` rewrite, `/account` sign-in + sign-up (name/phone/email/password, `?next=`), `addresses.*`, `users:grantStaff` command | Browse the whole shop signed out; sign up with a phone number; sign in/out; addresses scoped to the user; `npx convex run users:grantStaff` grants access                                                                                                                                        |
| **3. Orders**                     | `orders.place` (behind `requireUser`) + `orders.track` with full §5 rules, `ConvexError` messages, checkout auth gate + profile prefill, track + confirmation pages                                    | Signed-out `/checkout` redirects to `/account` with the cart intact; blocked while `ordering_enabled=false`; enable → happy path decrements stock; oversell/failed validation show the same copy as today; tracking works with ref+phone and no login; unverified demo product cannot be ordered |
| **4. Staff + catalogue + photos** | `staffList`, `staffUpdate`, `catalogue.*`, `settings`, `uploads.*`, `staff.tsx` + `catalogue-editor.tsx`                                                                                               | Full status/payment transitions incl. momo guard, closed-order rejection and cancel-restock; photo upload renders; non-staff session gets "Staff access required."                                                                                                                               |
| **5. Remove Supabase**            | Delete §10 files/deps/env entries, update `AGENTS.md`, `npm run lint && npm test && npm run build`                                                                                                     | No `supabase` import remains; build has no missing-env warnings                                                                                                                                                                                                                                  |
| **6. Ship**                       | `npx convex deploy` (production) + set `VITE_CONVEX_URL` in the deployment build env; smoke test prod                                                                                                  | Prod checkout + staff update + auth pass; old Supabase project can be archived                                                                                                                                                                                                                   |

## 12. Risks / open items

- **Editor coupling**: the editor's Supabase panel, preview sign-in and injected `SUPABASE_*` env
  vars stop being used after phase 5, and all editor tooling has since been removed from the repo.
  Confirm the build works with only `VITE_CONVEX_URL`.
- **SSR prefetch**: loaders run on the server; confirm `ConvexQueryClient` fetches over its
  transport during SSR in this Nitro/Node build (fallback: gate loaders to client-side
  prefetch, since `useSuspenseQuery` still server-renders).
- **Product decisions**: email verification on sign-up (off by default) and whether checkout should
  also allow an editable phone field when the profile phone is missing.
- **Behaviour change to socialise**: shoppers must now create an account to place an order
  (browsing and tracking remain auth-free). This should be stated on the cart/checkout UI.
- **Convex free tier** is ample for this catalogue; watch reads if staff dashboard stays open all day.
- **Tests**: routing test is unaffected; add `convex-test` (or pure `lib/rules.ts` unit tests) for
  place/staff rules — recommended gate for phase 2.
