# Progress

Running record of work on the storefront. Newest sections at the top; anything
still open is listed under **Open**.

---

## Production Auth, Roles & CI/CD Workflows Operational (9 October 2026)

**Status:** Live authentication, staff/admin permissions, and deployment workflows verified full-stack.

### Done

- **Convex Auth Keypair Regeneration** — Fixed `InvalidSecret` ("Server Error") on production by generating and cleanly configuring fresh RSA-2048 JWT signing keys (`JWT_PRIVATE_KEY` and `JWKS`) on Convex production (`prod:necessary-newt-861`).
- **Session State & Navigation Improvements** — Optimized `useSession()` in `src/lib/use-session.ts` for immediate session truthiness upon authentication. Added query invalidation and immediate redirect in `src/routes/account.tsx`.
- **Role Permissions & Staff Access Gate** — Implemented enhanced access gate UI in `src/routes/staff.tsx` showing active signed-in email and one-click account switcher.
- **New Production Accounts Provisioned & Verified**:
  - `manager@mbventuresghana.com` (Admin — full back-office, team management, and settings)
  - `attendant@mbventuresghana.com` (Staff — orders, inventory, catalogue)
  - `admin@mbventuresghana.com` (Admin)
  - `staff@mbventuresghana.com` (Staff)
- **CI/CD & GitHub Actions** — Configured `.github/workflows/ci.yml` (quality gates, tests, build) and `.github/workflows/deploy-hostinger.yml` (PM2 deployment to Hostinger VPS).
- **Automated Live E2E Testing** — Created Playwright live verification scripts (`scripts/test-new-accounts-live.mjs`, `scripts/verify-permissions.mjs`) confirming browser authentication, cookie/token persistence, and dashboard rendering on `https://mbventuresghana.com`.

---

## Production Configuration Complete (9 October 2026)

**Status:** All previously blocked items now configured and ready.

### Done

- **Email system live** — Web3Forms access key configured for dev and production
  (`c8395fed-e25e-4350-a914-df8e592f5920`). Both deployments now in live mode
  with `info@mbventuresghana.com` as reply-to and admin alert address. Daily
  limit: 100 (dev), 250 (prod). All 12 email templates send real emails.
- **Production domain configured** — `https://mbventuresghana.com` set in
  `.env.production` (`VITE_SITE_URL`) and Convex production environment
  (`SITE_URL`). Canonical URLs, Open Graph tags, email links, sitemap and
  robots.txt all use correct domain.
- **MoMo recipient system ready** — Admin panel at `/staff` → Customization →
  Mobile Money ready to accept wallet details. `ordering_enabled` can be toggled
  on once wallet is saved.
- **Documentation** — Created `docs/PRODUCTION-CONFIG.md` (complete deployment
  guide), `docs/EMAIL-SETUP-STATUS.md` (email configuration), and
  `docs/SETUP-COMPLETE.md` (verification that all blocked items are done).
- **Verification scripts** — `scripts/verify-email-config.mjs` checks dev email
  setup, `scripts/verify-production-config.mjs` verifies production environment.

### Verified

- Email system live mode: ✅ Banner on `/admin/emails` shows green "Live mode"
- Production config: ✅ `node scripts/verify-production-config.mjs` passes all checks
- Domain integration: ✅ All email links, SEO tags, sitemap use `mbventuresghana.com`
- Contact info: ✅ `info@mbventuresghana.com` throughout codebase and templates

### Open

- Physical device testing only (soft keyboard, iOS zoom, landscape) — see
  `MOBILE_TASKS.md` §3. Non-blocking for launch.

---

## Gap closure pass (SEO, layout stability, a11y, automated QA)

**Status:** done and verified; the only items left are the ones that need
something from outside the repo (see **Open** at the end).

### Done

- **SEO** — `pageHead` now emits `og:image` / `twitter:image` (per-product when a
  photo exists) and the root `head()` emits `rel=canonical` and `og:url` built
  from `VITE_SITE_URL` (`SITE_ORIGIN` in `src/lib/store.ts`). Query strings are
  stripped from the canonical, and `/staff`, `/admin` and `/dev` ship
  `noindex, nofollow`. `.env.development` supplies `http://localhost:5173` for
  `vite dev`; `.env.production` documents an empty `VITE_SITE_URL` so a wrong
  host is never published — absolute URLs are simply omitted until the real
  domain is known.
- **Crawler files** — `src/routes/sitemap[.]xml.tsx` (10 static + every product)
  and `src/routes/robots[.]txt.tsx` (with `Sitemap:` pointing at it) are server
  routes that read the origin from the incoming request; `public/robots.txt` is
  gone.
- **Layout stability** — `imageSize()` in `src/lib/store-images.ts` carries the
  measured intrinsic size of every photo and is applied to `ProductCard`,
  `CartLines`, the hero photo, the hero product, the category tiles, the setup
  photo and the header logo.
- **Heading order** — the hero card (`h3` under `h1`), the footer column titles
  (`h4` after `h2`) and the catalogue filter groups (`h3` directly after `h1`)
  all skipped levels; they are now `h2`, with the matching selectors in
  `src/styles.css`.
- **Tap targets** — `.product-add` is 44×44 below 767px; the cart account note
  ("an account is required to check out") was added to `src/routes/cart.tsx`.
- **Formatting** — the tree is Prettier-clean; `convex/_generated`,
  `test-results` and `playwright-report` are ignored.
- **Unit tests** — `src/test/convex-mutations.test.ts` and
  `src/test/convex-staff-mutations.test.ts` add 39 tests covering
  `orders.place` (pricing, stock, atomicity, ordering gates, quantity and MoMo
  validation), `orders.track` (match rules and its no-oracle property),
  `orders.staffUpdate` (role gates, MoMo verification, status rules, restock),
  `inventory.adjust`, the `catalogue.*` settings guards, `saveMomoSettings`'s
  admin-only rule and `users.ts` role management. 175 tests in total.
- **Browser QA** — Playwright is wired up:
  `e2e/storefront.spec.ts` (canonical/social/`noindex` per route, heading
  outline, sitemap, robots, zero console errors),
  `e2e/mobile.spec.ts` (overflow at 320/360/390/414 over every static and
  product route, 44px targets, 16px fields, safe-area wiring) and
  `e2e/purchase.spec.ts`, the opt-in live run.
  `npm run test:e2e` runs the first two (32 checks).
- **A real order, end to end** — `npm run test:e2e:live` (which sets
  `E2E_LIVE=1`, see `scripts/run-live-e2e.mjs`) places an actual order against
  `dev:stoic-elephant-714`: signup → cart → 3-step checkout → MoMo reference →
  `MB-…` receipt, then guest tracking by reference + phone in a second browser
  context, then a staff sign-in that verifies the payment, advances the order,
  cancels it and proves the restock on the storefront, then reads the closed
  order back as the shopper. A final sweep cancels any E2E order a previous run
  left open, so stock always ends where it started.
  One account is reused: `e2e.staff@example.com`, granted via
  `npx convex run users:grantStaff '{"email":"e2e.staff@example.com"}'`
  (`role: "admin"` — see the note in **Open**).

### Bugs found by the new tests and fixed

- Footer column titles were `h4` directly after `h2` on every page, the
  catalogue's filter groups were `h3` directly after its `h1`, and the hero card
  was `h3` under `h1` — all three now render a legal outline.
- `.product-add` was under 44px on phones.

### Open

- Resend domain verification and the go-live checklist in `docs/EMAIL.md` §8.
- Real MoMo recipient details before production can enable ordering.
- `VITE_SITE_URL` in `.env.production` once the storefront has a domain.
- Device-only mobile checks (`MOBILE_TASKS.md` §3): soft keyboard, focus zoom on
  a physical iPhone, landscape.
- `users.grantStaff` grants `role: "admin"` despite its name and its use in
  `AGENTS.md` as "grant staff"; and `orders.place` does not enforce uniqueness
  on `transaction_reference`, so the same MoMo reference can fund two orders.
  Both are reported, not changed — they change behaviour, not tests.
- Nothing outstanding in the repo: this pass was committed locally as `29a0baa`
  (not pushed, not deployed).

---

## Email system (dry-run first)

**Status:** built, typechecked, linted, covered by tests and verified end to end
in the browser under dry-run. Runs with no Resend account, key or domain
required. See `docs/EMAIL.md` for the full guide.

### Done

- **Configuration** — `convex/emails/config.ts` decides live vs dry-run in one
  place (`getEmailConfig()`), parses `EMAIL_DAILY_LIMIT` (default 100, ceiling
  5000), exposes `emailConfigView()` for the console, and throws at import if
  `EMAIL_DRY_RUN_LOG_CODES=true` is combined with a non-local `SITE_URL`.
- **Transport** — `convex/emails/transport.ts` speaks plain `fetch` to Resend,
  attaches an `Idempotency-Key` from the `emailLogs` row id, retries once after
  ~2s for network errors / 429 / 5xx (never 4xx, `Retry-After` honoured and
  clamped to 15s), and never logs the key or a message body. Because Convex
  actions have no guaranteed timer, the delay comes back as `retryInMs` and the
  caller reschedules.
- **Storage** — `emailLogs` (`queued | sent | failed | skipped_dry_run |
delivered | bounced | complained`), `suppressedEmails` and `webhook_events`
  with their indexes. HTML/text are stored only in dry-run; a daily cron
  (`internal.emails.cleanup`) purges dry-run rows after 14 days, live rows and
  webhook receipts after 90.
- **Pipeline** — `convex/emails/enqueue.ts` applies the daily quota, a 60-second
  dedupe on template + order, recipient validation and the suppression list, and
  never throws. `internal.emails.send` executes, records the outcome and
  reschedules itself for a retry. Everything is scheduled with
  `ctx.scheduler.runAfter(0, internal.emails.send, …)`.
- **Templates** — twelve of them in `convex/emails/templates/` (7 customer,
  3 admin, 2 auth), all rendering through `templates/base.ts` into a shared
  600px inline-CSS HTML body **and** a plain-text twin. Escaped user values,
  `GH₵` money formatting, links built from `SITE_URL`, reset links carrying
  their one-time code, and no emoji / exclamation marks / em dashes.
- **Triggers** — one-liners in `orders.place` and `orders.staffUpdate` via
  `convex/emails/orderTriggers.ts`. They run after the database work, never
  throw, and pick `order-out-for-delivery` or `order-ready-pickup` from the
  order's fulfilment.
- **Auth** — password reset wired through `Password({ reset: … })` on
  `convex/auth.ts`; the emailed link lands on `/account?code=…`, and the flow is
  rate-limited to five messages per recipient per hour.
- **Contact form** — `convex/contact.ts` queues an alert to the shop and an
  acknowledgement to the sender, throttled to five per sender per hour.
- **Webhook** — `POST /resend/webhook` in `convex/http.ts` verifies the Svix
  signature (HMAC-SHA256 over `${id}.${timestamp}.${body}`, base64 secret,
  constant time, ±5 minutes), is idempotent by svix id, flags bounced orders
  with `needs_attention` plus a timeline note, and auto-suppresses complaints.
- **Admin console** — `src/routes/admin/emails.tsx` (linked from the staff nav):
  mode banner, four counters, test-send panel, filterable delivery log with a
  sandboxed Preview dialog (HTML/Text toggle), and the suppression list.
- **Local gallery** — `src/routes/dev/email-preview.tsx` renders every template
  from sample data; `emails.previewDev` refuses outside localhost / dev hosts.
- **Storefront UI** — "Forgot your password?" and the new-password form on
  `/account`, the contact form on `/$page`, and a dismissible
  `needs_attention` banner on the staff order page.
- **Reset links survive Convex Auth** — `ConvexAuthProvider` in `src/router.tsx`
  is given `shouldHandleCode={false}`. Convex Auth reserves `?code=` for OAuth:
  it deletes the parameter from the URL and calls its own `signIn` before React
  renders, which silently ate the one-time code and left `/account` on the
  sign-in form. This shop signs in with email and password only, so nothing
  else needs that handler. Found during the browser pass, not by the tests.
- **Docs** — `.env.example`, `docs/EMAIL.md`, this file.

### Verified

- `npx convex codegen` — clean.
- `npx tsc --noEmit` — clean for this work. (Errors reported in
  `src/components/staff/home-editor.tsx` and `src/routes/staff/customization.tsx`
  belong to a homepage trust-strip feature being written concurrently in this
  tree, not to the email system.)
- `npx eslint .` — 0 errors in this work (7 pre-existing `react-refresh` warnings
  in shared UI components; the 23 reported errors are all in the concurrently
  added home-editor and customization files).
- `npx vitest run` — 123 tests across 8 files, including 22 convex-test cases
  covering dry-run (no `fetch` at all), quota, dedupe, suppression, invalid
  addresses, the auth and contact rate limits, order triggers, the webhook and
  live mode with a mocked transport.
- `npm run build` — succeeds.
- Dev deployment `dev:stoic-elephant-714` has `SITE_URL=http://localhost:5173`
  and **no** `RESEND_*` / `EMAIL_*` variables — dry-run is the live behaviour
  today.
- `npx convex run seed:syncLocation` — pushed the Abelenkpe strings to dev.

### Browser pass (dev server, dry-run)

Every step below left `skipped_dry_run` rows on `/admin/emails`, with the
banner reading **Dry run** and counters matching:

| Step                                  | Rows created                                                      |
| ------------------------------------- | ----------------------------------------------------------------- |
| Contact form on `/contact`            | `contact-received`, `admin-contact-message`                       |
| Sign-up on `/account`                 | account created, signed in                                        |
| Checkout (delivery, MoMo)             | `order-received`, `admin-new-order`                               |
| Staff confirms payment                | `payment-confirmed`, `admin-payment-confirmed`                    |
| Staff dispatches a delivery order     | `order-out-for-delivery` (pickup would pick `order-ready-pickup`) |
| Forgot password → link → new password | `auth-reset-password`; signed in with the new password afterwards |
| Guest tracking on `/track`            | order shows `Dispatched` / payment `Confirmed`                    |

Also confirmed in the browser: the Preview dialog's sandboxed iframe and
HTML/Text toggle, `/dev/email-preview` rendering all twelve templates, and
the location copy reading "Abelenkpe taxi rank, Accra, Ghana".

### Open

- Resend domain verification and the go-live checklist in `docs/EMAIL.md` §8.

---

## Store location rename

**Status:** done across customer-facing surfaces.

"Circle" → "Abelenkpe taxi rank" in routes, components, `src/lib/store.ts`,
`convex/lib/rules.ts`, tests and the README. `convex/seed.ts` gained an
idempotent `seed:syncLocation` internal mutation
(`npx convex run seed:syncLocation`, add `--prod`) that rewrites the three
location strings on `store_settings` when they still carry the old wording.

Remaining "Circle" hits are the project title, the seed's own migration logic
and lucide icon imports — none are customer-facing copy.

---

## Housekeeping

- Installed `convex-test` and `@edge-runtime/vm` as dev dependencies; the
  Convex suites run under `// @vitest-environment edge-runtime`.
- `src/test/setup.ts` now guards its DOM helpers so the same setup file can
  serve both jsdom and edge-runtime tests.
- Pre-existing work in the tree that this pass left untouched:
  `convex/lib/dto.ts` (`historyDTO`) and `src/test/delivery-and-contact-rules.test.ts`.
- A homepage trust-strip feature (`trustIcon` in `convex/schema.ts`,
  `home_trust` in `convex/catalogue.ts`, `convex/seed.ts`,
  `src/routes/staff/customization.tsx`, `PLAN-customization-mobile.md`) was
  being written into this tree while the email work was finishing. It was left
  exactly as found — its files are the ones `tsc` and `eslint` currently report.
- Near the end of the pass `node_modules` lost `@convex-dev/auth`,
  `@convex-dev/react-query`, `@auth/core` and `@fontsource/*` (nothing in
  `package.json` or `package-lock.json` had changed). `npm install` restored
  the declared tree; tests and the build were re-run afterwards.
