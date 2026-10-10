# Progress

Running record of work on the storefront. Newest sections at the top; anything
still open is listed under **Open**.

---

## Shop number unified on 0249564442 + a full mobile pass (10 October 2026)

**Status:** Complete — all gates green (tsc, lint, 189 unit tests, prettier,
build, 32 e2e).

### Done

- **One shop number everywhere: 0249564442** — production `store_settings` now
  holds `0249564442` for both the phone and the WhatsApp recipient, so every
  `tel:` link and every "Ask on WhatsApp" / "Chat on WhatsApp" button points at
  the same number (WhatsApp normalises to `wa.me/233249564442`). Changed through
  the staff Contact pane, which pre-fills the rest of the form, so the address,
  hours and email were left untouched. The `+233 24 000 0000` placeholder is gone
  from the seed default, the email render context and both UI fallbacks.
- **Mobile audit became a repeatable check** — new `scripts/mobile-audit.mjs`
  measures every public route plus the signed-in staff pages at 320/375/414px
  and reports horizontal overflow, elements pushed off screen, sub-12px text,
  sub-40px controls and inputs under 16px (the iOS focus-zoom trap). It takes a
  base URL and optional credentials, so it can be pointed at dev or production:
  `node scripts/mobile-audit.mjs http://localhost:8080 --email=… --password=…`.
- **823 findings down to 0** — the baseline against production was 1 clipped
  element, 528 undersized tap targets and 294 sub-12px text runs. All three
  classes are now clean on every route and width measured.
- **Hero calls-to-action no longer clip or hide** — the two hero buttons need
  ~340px side by side and a 320px phone has 272px, so they ran off the edge and
  were then covered by the "In this setup" card (a pre-existing bug on production
  as well). They now wrap to full width, and the mobile hero grew from 710px to
  800px so the card — which is anchored to the hero's bottom edge — clears them.
  Measured gap is 20px at 320px and 127px at 414px.
- **12px floor on mobile text** — the 10–11px micro-labels (announcement bar,
  product brand and spec, badges, trust strip, footer legal, eyebrows, category
  counts) are all 12px on phones. Desktop is untouched.
- **Tap targets grown on phones only** — footer links 19px → 44px, Terms/Privacy
  16px → 40px, "View all" → 40px, pagination and the setup-rail price buttons
  36px → 44px, and the WhatsApp / Copy link / About / product-name links → 40px.
  Breadcrumb links grew from 29×38 to 41×40 by expanding into the gaps between
  the "/" separators rather than by moving them.
- **Header de-cluttered on phones** — "YOUR WORKSPACE STORE" needs ~170px and the
  header has ~86px to spare at 320px once the logo and three icon buttons are
  placed, so it wrapped across three lines. Hidden below 768px, taking 40px off
  the header height (110px → 70px at 320px).

### Note

Lightning CSS — which Tailwind v4 runs through both the Vite dev server and
production builds — silently dropped a `.breadcrumbs a { … }` rule from the dev
stylesheet while keeping every neighbouring rule. The breadcrumb fix is
therefore written as Tailwind utilities on the `<Link>`s instead of a stylesheet
rule, and the production bundle was checked rule-by-rule. Worth knowing if a CSS
rule ever appears to have no effect in dev.

---

## Staff & Admin Hub Redesign — dashboard charts, grouped nav, sign-out (10 October 2026)

**Status:** Complete — all gates green (tsc, lint, 189 unit tests, prettier,
build, 32 e2e).

### Done

- **Dashboard rebuilt around a "Needs you" queue** — `/staff` opens with four
  KPI cards (orders today, takings today, awaiting payment, products), then a
  priority queue: unrecorded cash → empty shelves → thin stock → sample listings
  awaiting verification, each deep-linking to the staff page that clears it.
  Latest orders, activity, stock warnings and catalogue health follow.
- **Four charts in a new `src/components/staff/charts.tsx`** — a composed
  bar+line till tape (14 days of orders against confirmed takings), horizontal
  pipeline bars covering all six order states, a pickup/delivery donut, and best
  sellers ranked by units with cancelled orders excluded. Every chart has a
  written `aria-label` summary and an empty state; recharts is drawn through the
  existing shadcn wrapper at a fixed height with colours from the CSS vars.
- **New backend query `stats.trends`** — guarded by `reports.view` and kept
  separate from `overview` so the dashboard is two round trips. Returns the
  14-day zero-filled daily series (UTC buckets, matching Accra's GMT+0), all six
  status buckets, the fulfilment split, top 6 products, and this-week vs
  last-week totals.
- **Nav grouped, header given an identity** — the shell sidebar now reads
  Selling / Catalogue / Shop settings, and the header shows the signed-in user's
  initials, email and a Sign out button in place of the bare "Account" link.
- **Gate and account hub polished** — `/staff`'s access gate has clearer copy
  and a role-aware welcome; the signed-in `/account` view gains an identity
  strip (avatar, name, role · phone, Sign out), a role-aware "Open the store
  hub" card, and Track an order / Keep shopping mini-cards. The display name is
  now stated once rather than in both the lead and the strip.
- **`low_stock` no longer double-counts empty shelves** — `stats.overview` now
  reports only _sellable-but-thin_ stock (0 < stock ≤ 5); counting the zero
  shelves is `out_of_stock`'s job alone. Before this, one empty shelf appeared
  as two rows in the "Needs you" queue.
- **KPI copy made honest** — the products card claimed "Products live: 21" while
  21 included the 10 hidden demo drafts; it now reads "Products · 11 live · 10
  samples hidden". Deltas spell out "this week" and fall back to an absolute
  gain when last week was zero, instead of an unlabelled percentage or the word
  "new".
- **10 new tests in `src/test/stats-trends.test.ts`** — both queries covered.
  `_creationTime` cannot be written on insert, and convex-test only lets time
  run forward (it clamps every insert after the previous one), so orders are
  seeded oldest-first against a fixed midnight anchor with only `Date` faked —
  never timers, so anything Convex schedules still runs for real.

### Verified live

- Dev dashboard: all four charts render as real SVG with aria summaries, zero
  console errors/warnings; sign-out from the shell header lands on `/account`;
  `recharts_measurement_span` is pinned at `top: -20000px`, so it cannot widen a
  page under the 320px overflow check.
- Test counts in AGENTS, README, roadmap and the deployment/status docs moved
  179 → 189. PROGRESS.md's dated entries keep their original figures — they are
  a log, not a current-state claim.

---

**Status:** Complete — every tracked doc now describes the store as it actually
is; quality gates green (tsc, lint, 179 unit tests, prettier, build, 32 e2e).

### Done

- **Payments docs de-MoMo'd** — DEPLOYMENT-READY, DEPLOYMENT-SUMMARY,
  QUICK-START, SETUP-COMPLETE, HOSTINGER-SETUP-CHECKLIST, BACKEND-STATUS,
  USER-MANAGEMENT, PRODUCTION-ENV-SETUP, HOSTINGER-DEPLOYMENT and
  PRODUCTION-CREDENTIALS no longer instruct anyone to configure a Mobile Money
  wallet, and no longer claim a MoMo verification gate exists. They now describe
  the pay-later model: pickup pays at the counter, delivery pays cash, staff
  record receipt in `/staff`.
- **CONVEX_PLAN.md marked superseded** — §5 (the original `momo` +
  transaction-reference rules) carries a dated note pointing at the current
  derivation in AGENTS.md §4f instead of being silently rewritten (it is a
  historical migration plan).
- **Stale "ready to deploy" statuses corrected** — DEPLOYMENT-READY,
  DEPLOYMENT-SUMMARY, QUICK-START, SETUP-COMPLETE, EMAIL-SETUP-STATUS,
  GITHUB-AUTO-DEPLOY, HOSTINGER-SETUP-CHECKLIST now say _live in production_
  (they still described a pre-launch store).
- **Test counts normalised to 179** — five docs claimed 186/186; the real
  Vitest count is 179. MOBILE_TASKS' dated 175/175 line is a historical log
  entry and was left alone.
- **AGENTS.md §7 date → 10 Oct 2026**, PRODUCTION-CREDENTIALS last-verified →
  10 Oct (with the MoMo wallet row in the permission matrix replaced by
  payment-receipt confirmation), INVENTORY-AUDIT's `store_settings` row notes
  the MoMo columns are legacy/unused.
- **Typos and footguns fixed** — `users:grantStaft` → `grantStaff` with proper
  PowerShell JSON escaping in BACKEND-STATUS; four "Last Updated: 2025-01-10"
  stamps corrected; "January 10, 2025" → "October 10, 2026".
- **Left intentionally** — PROGRESS.md, MOBILE_TASKS.md, PLAN-*.md and
  INVENTORY-DECISIONS.md contain dated historical records of how things were;
  those read as history, not current-state claims, so they were not rewritten.

---

## Auth Repair, UI/UX Audit & Performance Pass (10 October 2026)

**Status:** Live on production — verified in a real browser (desktop + mobile).

### Done

- **Production auth fixed** — `convex/auth.config.ts` now derives the provider
  domain from `CONVEX_SITE_URL` (the issuer `@convex-dev/auth` actually mints)
  instead of `SITE_URL`. New admin/staff accounts on mbventuresghana.com can
  sign in and reach `/staff` again; the "No auth provider found matching the
  given token" error is gone. Backend deployed with `npx convex deploy`.
- **UI audit (desktop 1440×900 + mobile 390×844)** — full screenshot sweep of
  every storefront, account and staff/admin route via
  `scripts/audit-screenshots.mjs`. Fixed what it found:
  - **Mojibake copy** — `store-shell.tsx` / `catalogue.tsx` contained
    corrupted UTF-8 (`âŒ˜ K`, `Â·`, `Â©`, `â€œ…â€`); restored `⌘ K`, `·`,
    `©` and curly quotes.
  - **Mobile staff dashboard** — order references no longer sit under the
    status pills; rows stack ref → chips on phones.
  - **Empty-cart checkout** — `/checkout` with an empty (restored) cart now
    redirects to `/cart`'s empty state instead of the sign-in gate; the cart
    provider exposes `ready` so the guard can't race the localStorage
    restore.
  - **Empty category tiles** — the homepage hides categories with zero
    visible products ("Office chairs · 0 products" is gone).
- **E2E hardening (32/32 green)** — the cart-stepper check waits for the cart
  provider to hydrate before quick-adding (it previously failed ~50% of runs
  because the click landed before handlers attached); the og:image checks use
  a live product (`monitor-light-bar`) instead of the hidden `ergonomic-chair`
  demo fixture, and the fallback assertion matches any extension.
- **Performance: WebP everywhere** — every storefront photo re-encoded to
  WebP at identical dimensions (hero 739 KB → 117 KB, carbon-fiber desk
  847 KB → 91 KB; ~3.9 MB → ~1.2 MB total). Keys are extensionless so only
  the base path map changed; `DEFAULT_SOCIAL_IMAGE` moved to
  `workspace.webp` so the og:image fallback keeps working. Docs updated.
- **Deploy workflow repaired** — `deploy-hostinger.yml` used
  `if: ${{ secrets.HOSTINGER_HOST != '' }}` at job level, which GitHub
  rejects outright (every run died at 0s with a workflow-file error). The
  credential check now runs inside a step via `env`, so the workflow parses
  and the SSH deploy only runs when the secret exists. Note: the VPS also
  auto-deploys `main` via its own git-pull build loop, which is how the
  frontend reaches production within minutes of a push.
- **Production account audit** — all four documented accounts verified
  end-to-end in a real browser (sign-in, role badge, permission boundaries
  both directions, sign-out, zero page errors): `manager@` / `admin@` see
  the Team grant form, Mobile Money recipient panel and Emails console;
  `attendant@` / `staff@` are correctly walled out of all three. The
  undocumented `1234@rmao.com` (Jeffery Glassburn) admin grant left over
  from 9 October provisioning was revoked via the live Team page — the
  account remains as a plain customer. `user_roles` now matches
  `docs/TEST-ACCOUNTS.md` exactly.
- **Contact numbers live** — shop phone and WhatsApp set to `053 276 7269`
  (the former MoMo recipient number, repurposed as contact-only per the
  owner) via the staff Contact pane; the footer, contact page and every
  "Ask on WhatsApp" button now use `tel:053 276 7269` /
  `wa.me/233532767269`, replacing the `+233 24 000 0000` placeholder. The
  stale "verified before launch" disclaimers on the contact and privacy
  pages were dropped in the same pass.
- **Hero hotspot swap (owner request)** — the featured pick that reveals
  first on the hero photo is now the Mottian AI Smart Voice Typing
  Wireless Keyboard & Mouse Set instead of the 360° laptop stand.
  Changed in production via Customization → Featured and mirrored in
  `inventory_import.ts`'s featured list so a future
  `inventory_import:apply` re-run keeps it.

### Verified live

- Sign-in as `manager@…` (admin) and `attendant@…` (staff) on
  mbventuresghana.com — role badges render, `/staff` subpages load.
- Account audit (10 Oct): manager/admin see every admin surface, staff are
  gated out of Team grant forms and the Emails console; the role table matches
  the docs after the `1234@rmao.com` revocation.
- Homepage serves `hero-workspace.webp` (200), real `⌘`/`·` glyphs, and only
  the four populated category tiles.

---

## Checkout Resilience & Storefront Hardening (9 October 2026)

**Status:** Complete — all gates green (tsc, lint, 179 unit tests, prettier,
build, 32 Playwright checks, live purchase journey 4/4).

### Done

- **Checkout draft persistence** (`src/routes/checkout.tsx`) — root cause found
  via trace analysis: right after sign-up, Convex Auth can resolve to "signed
  out" for a beat, which bounced checkout through `/account?next=/checkout` and
  back, remounting the component — a Continue click landing in that window was
  swallowed and every typed field was lost. The draft (`mb-checkout-draft` in
  sessionStorage) now stores **step + form fields**, so any remount restores the
  shopper exactly where they were; it is cleared when an order is placed. The
  sign-out redirect also gained a one-second grace, so a transient auth flip
  never navigates at all (a genuine sign-out still bounces, just a beat later).
- **Product pages no longer overflow phones** — the specs table's min-content
  stretched the overview grid track past the viewport (575px document at a 320px
  viewport on the standing-desk page). `min-width: 0` on `.section.grid > *`
  lets the existing `overflow-x: auto` scroll container do its job; all 11 real
  product pages now fit the 320/360/390/414 overflow matrix.
- **Sitemap filters hidden drafts** — `/sitemap.xml` was advertising
  `/product/ergonomic-chair` and the other hidden demo products, which 404 for
  shoppers (violating the visibility invariant in AGENTS.md §4c). The route now
  drops `visible: false` rows.
- **e2e specs point at real products** — the og:image and heading-outline checks
  use real visible products (the old demo chair is a hidden draft), and the live
  journey orders `rock-360-phone-tablet-stand` in place of the hidden chair.
- **First-tap reliability in specs** — the product grid becomes interactive just
  after the hydration marker clears, so the specs now retry the first
  interaction (checkout Continue, homepage add-to-cart) until the app reflects
  it — the same race a very fast shopper can hit.
- **Live journey trace off** (`e2e/purchase.spec.ts`) — the trace writer races
  context close on this Windows setup (`ENOENT` under `test-results`), turning
  green runs red; screenshots and the error-context snapshot still capture on
  failure.
- **`inventory_import:patchHomeCopy`** — idempotent internal mutation that swaps
  the pre-pay-later homepage copy (`home_cta_body` and the trust-strip wallet
  row) for the current defaults **only when it still matches the exact old
  text**, so a deliberate staff edit is never clobbered. Dev already carries the
  new copy; production still has the old one, so run it as part of the next
  production deploy: `npx convex run inventory_import:patchHomeCopy --env-file
.env.prod.local`

---

## Pay-later Checkout — In-App MoMo Flow Removed (9 October 2026)

**Status:** Complete — all gates green (tsc, lint, 179 unit tests, prettier,
build, 32 Playwright checks).

### Done

- **Checkout reduced to two steps** (`src/routes/checkout.tsx`) — details →
  review & place. The Mobile Money step (provider picker + transaction
  reference) is gone; nothing in the browser asks for payment details any more.
- **Payment method derived server-side** — `orders.place` accepts only
  customer, fulfilment, zone and items; it sets `payment_method:
"pay_at_store"` for pickup and `"cod"` for delivery. `provider` /
  `transaction_reference` are legacy-null on every new order and no longer
  appear in the staff order search.
- **MoMo recipient system removed** — `catalogue.saveMomoSettings`, internal
  `catalogue:setMomo`, `applyMomoRecipient`, `validateMomoRecipient`,
  `MOMO_PROVIDERS` and the `catalogue.momo` permission key are gone. The
  ordering switch no longer depends on a saved wallet. Stale stored
  `catalogue.momo` permission overrides are inert (stored overrides are
  filtered against the current permission keys).
- **Schema kept backwards-compatible** — `paymentMethod` union widened to
  `"momo" | "cod" | "pay_at_store"`; `momo_number` / `momo_name` on
  `store_settings` became optional legacy fields. Existing production MoMo
  orders keep validating unchanged — no destructive schema change and no data
  migration.
- **Status rules simplified** — "Verify Mobile Money before processing" is
  gone; the only payment gate left is "Confirm payment before completing the
  order", so staff can work an order while the cash is still on its way.
- **Staff UI updated** — orders list lead/search copy, order detail Payment
  panel (friendly method labels; provider/reference rows only for legacy MoMo
  orders), confirmation dialog now asks whether the cash has been received.
  Customization lost its "Payments" tab and the ordering-pane MoMo warning.
- **Emails updated** — customer confirmation says "pay at the counter"
  (pickup) or "pay the courier in cash" (delivery); the admin alert leads on
  fulfilment. Legacy MoMo payloads still render their provider/reference rows.
  Samples now mirror the derived-method model.
- **Copy swept** — footer, auth frame, about/delivery/FAQ/terms/privacy pages,
  home defaults (`home_cta_body`, trust strip), staff team/hub copy: no more
  "manual MoMo verification" language anywhere customer- or staff-facing.
- **Tests** — MoMo-gate tests replaced with method-derivation and
  pending-payment-advance coverage; the `saveMomoSettings` / `setMomo`
  suites were deleted; email template tests gained a legacy-MoMo rendering
  check. 179 tests total. `e2e/purchase.spec.ts` rewritten for the two-step
  flow (search placeholder, confirm-payment dialog, staff flow).

---

## Real Inventory Launch, Hero Image & Docs Overhaul (9 October 2026)

**Status:** Live — ordering enabled, real products on the storefront.

### Done

- **Real inventory imported** — 11 products from the owner's inventory document
  inserted into production via `convex/inventory_import:apply` (idempotent).
  Each product has 10 units of stock, real pricing in GH₵, and verified product
  photos extracted from the inventory document.
- **Demo products hidden** — 10 placeholder products set to `visible: false,
status: "draft"`. They remain in the database but are invisible on the
  storefront, catalogue, search and sitemap.
- **Product photos** — 12 PNG files (11 products + 1 gallery variant) extracted
  and committed to `public/images/products/`. Image keys registered in
  `src/lib/store-images.ts` with correct intrinsic dimensions.
- **Hero background replaced** — Cinematic workspace photo (`hero-workspace.jpg`,
  1376×768) generated from real product photography. Features the carbon fiber
  gaming desk, custom macro keyboard, USB microphone, monitor light bar, and
  gaming chair. Set on production via `inventory_import:patchHeroImage`.
- **Hero copy updated** — Title: "Your workspace. Elevated." Subtitle describes
  delivery and Abelenkpe pickup.
- **Hero hotspots** — Click-to-reveal product cards feature the three flagship
  products: electric standing desk, 360° laptop stand, custom macro keyboard.
- **Storefront cleaned up** — Removed "Sample catalogue" disclaimer from catalogue
  page. Specs disclaimer now only shows for unverified/demo products. Related
  products section filters to visible items only.
- **Ordering enabled** — `ordering_enabled: true` set in production store settings.
- **AGENTS.md fully rewritten** — Authoritative AI context covering: tech stack,
  key file paths, architecture invariants, stock rules, auth roles, image key
  system, all deployment commands, live inventory state, staff accounts, env
  files, common tasks, anti-patterns, and Windows PowerShell specifics.
- **CLAUDE.md created** — Short alias picked up by Claude Code, Cursor, and
  similar AI IDEs.
- **`.agents/rules/mb-ventures.md` created** — Machine-readable rules file for
  Antigravity IDE and compatible agents.
- **README.md updated** — Live inventory table, current status, updated deployment
  commands.
- **docs/PROGRESS.md updated** (this section).

### Verified

- `npx tsc --noEmit` — 0 errors
- `npm run lint` — 0 errors (7 pre-existing react-refresh warnings)
- `npm run build` — succeeds
- `npx convex run inventory_import:apply --env-file .env.prod.local` — 11 real
  products updated, 10 demo products hidden, ordering enabled
- `npx convex run inventory_import:patchHeroImage --env-file .env.prod.local` — OK
- Pushed to `main` — GitHub Actions deploys frontend to Hostinger

### Open

- Run `npm run test:e2e` to verify Playwright checks still pass against updated
  storefront (some tests may need tuning for the new product URLs).
- Physical device testing (soft keyboard, iOS focus zoom, landscape) — see
  `MOBILE_TASKS.md §3`.

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
