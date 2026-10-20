# Progress

Running record of work on the storefront. Newest sections at the top; anything
still open is listed under **Open**.

---

## Audit fixes, image diet, and a deploy that can fail loudly (20 October 2026)

**Status:** Complete — every defect from the multi-agent audit is fixed and
shipped, production is rebuilt and verified, and the catalogue shrank from
**438 MB to 24.2 MB** of photography. Additions to the deploy script mean a
broken publish can no longer pass silently.

### Shipped

- **Audit fixes** (`7f99893` and follow-ups): 59 files across orders, payments,
  inventory, catalogue, email and staff UI. New tests for the Paystack
  `initialize`/`verify` happy paths (canned gateway reply + idempotency);
  fixed the live e2e runner (`scripts/run-live-e2e.mjs` spawned an undefined
  `cli`) and the live counter-order locators.
- **Quality gates:** tsc 0 · lint 0 errors (7 known react-refresh warnings) ·
  vitest **331/331** · prettier clean · build ok · Playwright read-only
  **36/36** · live suite **12/12**.
- **Deploy script** (`scripts/deploy-hostinger-api.mjs`): sends the Nitro build
  settings explicitly (`app_type: nitro`, `output_directory: .output`,
  `build_script: build`, `entry_file: server/index.mjs`,
  `package_manager: npm`, node 20), logs panel drift, and after publishing
  checks `/` + `/catalogue` **and** every referenced CSS/JS file — a broken
  publish now exits non-zero instead of looking green.
- **Image optimisation:** all 215 heavy storage photos re-encoded to WebP
  through the real staff upload path (`uploads:savePhoto` →
  `photos:retargetImage`), then the originals retired through
  `photos:deleteStorageIfUnreferenced` (reference-scanned). Result, measured on
  the live site: **217 images, 0 broken, 24.2 MB total, ~114 KB average**
  (was ~2 MB per image).

### Why the deploy broke (and the fix)

The Hostinger build settings endpoint returned nothing, so the platform fell
back to _publish_ mode with `build_script: none`: it published the raw source
tree, synced `public_html` (deleting the built `/assets/*`) and the site served
unstyled HTML with every CSS/JS request returning 500. Three separate API
details had to be right: the output directory is `.output` (not
`.output/public`), `build_script` is the **npm script name** (`build`, not
`npm run build` — the API rejects that with HTTP 422), and `entry_file` is
**relative to the output directory** (`server/index.mjs`). All three are now
sent by the script and documented in AGENTS.md §6.

### Storage sweep gotcha

Files imported during the Convex account migration serve **UUID-shaped**
storage URLs, while `_storage` rows use short base32 ids, so
`ctx.storage.delete(urlTail)` cannot decode them. The sweep now falls back to
matching `ctx.storage.getUrl()` and deletes the real row; 212 originals were
retired, 3 kept because an order/store setting still references them, and any
per-file problem is returned as `{ deleted: false, error }` instead of a bare 500.

---

## Full-stack live test of production (20 October 2026)

**Status:** Complete — every layer exercised against live production (backend
API, browser UI, payments, email, staff console); no application defects
found; one real mobile layout defect on `/catalogue` at 320px found by the
audit and fixed; test-matrix stock restored to the exact pre-test baseline.
The dev-deployment e2e suites remain gated on `npx convex login` (listed
under **Open** in the migration section below).

### What was asked

Run a comprehensive full-stack test of the production store — accounts,
permissions, functions, payments, products, inventory, everything — fix any
bugs found, and leave the stack updated and deployed.

### What was tested (all against `mbventuresgh.com` + `earnest-fennec-109`)

**API battery — 24/24 pass.** All four staff accounts sign in; roles and
permission floors correct (staff floor = orders+products, attendant floor =
orders+inventory, neither can manage team); team roster intact (6 members,
2 admins, both real staff gmail accounts preserved with their overrides);
`stats:overview` + `trends`; `health:report` (one benign finding: past orders
keep their stock snapshots); email log queryable, 0 suppressed; full
inventory write cycle on the hidden demo `gaming-desk` via the attendant
token (adjust +10 → history rows → reverse → net 0); `payments:status`
answers gracefully for unknown references.

**Storefront browser sweep (Playwright, live) — 15/15 routes, zero JS
errors.** Every route 200 with an h1 (incl. the styled 404); catalogue
search/filter/sort; product page (price, og:image, canonical); variant chips
toggle and flip `aria-pressed`; cart add → qty ± → remove round-trip clears
`localStorage["mb-cart"]`; contact form submit (toast + message landed in the
`/staff` inbox); track page graceful empty-state for a bogus reference.

**Purchase use case — the full journey.** Customer account created through
the real UI signup form; UI sign-in; product → cart → 2-step checkout →
**order placed** (confirmation page shows the `MB-…` reference); the order
appears in the account history and in guest tracking (reference + phone).
Staff drove it `received → processing → completed` with payment confirmed
(completion correctly refuses while payment is pending —
`validateStatusChange`), and the shelf decremented exactly. **Cancel +
restock:** a reserved order's cancellation returns its units exactly.
**Paystack online:** `orders.place(payment:"online")` locked the
server-computed pesewas amount; `payments.initialize` produced a real hosted
checkout URL (`checkout.paystack.com/…`); `payments:status` = pending; staff
cancellation of the unpaid order restocked exactly, and the money gate held —
a cancelled order stays cancelled.

**Staff console sweep (browser, entered through the app's own admin-unlock
flow).** Manager (admin): `/admin-hub/<token>` sessionStorage unlock → all
10 staff routes render real content; orders list shows references; search
narrows to a reference; order detail renders customer + money; messages
inbox shows the contact-form probe. Attendant (staff): dashboard, orders,
products and inventory all load at their permission floor; the team roster is
visible **by design** (`team.view` floor is staff) with zero management
controls (admin-only in the UI) and zero server rights (`team.manage`
mutations are refused).

**Email pipeline + webhook.** Per order: `admin-new-order` +
`order-received` on placement, `order-cancelled` / `order-completed` on
transitions — 5/5 recent sends all `sent`, 0 suppressed. `POST` to the new
`webhooks/paystack` route answers **401 to unsigned bodies** — the signature
gate is live on the new deployment and the Paystack dashboard now points at
it, so real charges confirm server-side.

### Findings (all design, not bugs)

- The staff console is gated for **admin** accounts behind
  `/admin-hub/<token>` (sessionStorage unlock, cleared when the tab closes) —
  direct URL visits show "Access restricted". Staff accounts are unaffected.
  The owner sees the redirect once per new session — intended behaviour.
- `team.view` is staff-floor: every staff member can see who else has access;
  only admins get management controls and only admins pass the server guard.
- Raw REST error envelopes redact plain errors (`Server Error` + `errorData`);
  the app's `errorMessage()` unwraps `ConvexError.data.message` correctly in
  every UI path tested (wrong password, out of stock, order terms, etc.).

### Test residue (documented, not hidden)

Four test orders exist under customer "MB Test Shopper"
(`info@mbventuresgh.com`), each carrying a "Full-stack test…" staff note:
`MB-4549…` cancelled + restocked · `MB-399C…` completed + paid (GH₵90 — the
fulfilment proof; completed orders are immutable by design) · `MB-7B95…`
cancelled + restocked · `MB-DB99…` cancelled online order (its Paystack
transaction simply expires). The test product
(`360-adjustable-rotating-phone-tablet-stand-silver`) was returned to its
exact pre-test baseline (stock 2, reserved 0) with one documented
`inventory:adjust`.

### Mobile audit + fix

The live mobile audit (14 routes × 320/375/414px) flagged one real defect: on
`/catalogue` at 320px the toolbar's inner control row didn't wrap, so the
search box's min-width crushed the sort select to ~26px and overflowed the
page by ~32px (plus two undersized tap targets at 375px). Fixed in
`src/routes/catalogue.tsx` (control row now wraps and centres) and
`src/styles.css` (scoped `≤767px` rules: the search/sort share rows with
`flex: 1 1 <basis>`, the select keeps a 120px floor). All other 13 routes were
clean; the audit re-run after redeploy reports CLEAN across the full matrix.

### Gates

tsc 0 · lint 0 errors (7 pre-existing warnings) · vitest 326/326 · prettier
clean · production build green — before and after the mobile fix.

---

## Convex account migration + full-stack repoint (20 October 2026)

**Status:** Complete on production — backend, data, images and frontend all
served from the new Convex account; every SSR route answers 200 again. Two
follow-ups are user/dashboard actions (below under **Open**).

### What was asked

The old Convex account (`necessary-newt-861`) was disabled, taking the whole
store down with it (every SSR route 500'd). Migrate the backend — functions,
data and Convex-hosted images — to the user's new Convex account with zero
loss, repoint the full stack (backend + Hostinger frontend), deploy, and
verify auth, roles, email, products and payments end to end.

### What changed

**Backend (`earnest-fennec-109`, prod deploy key in `.env.prod.local`):**

- Full `convex export` of the disabled deployment (backed up first:
  `prod-snapshot.zip` + env dump, kept outside the repo) → `convex import`
  into the new account: **1,161 documents across 22 tables + all 232 `_storage`
  files**, byte-faithful. File IDs survive the import, so product photos were
  migrated by importing `_storage` and rewriting the hostname in every
  reference (`internal.migrations.rewriteStorageHost`, idempotent, dry-run
  capable — real run rewrote 109 documents / 218 refs; a verification dry run
  afterwards reports 0).
- Functions redeployed (34 indexes), all 8 env vars re-set on the new
  deployment and verified value-for-value; one stray garbage variable removed.
- Verified: `store:get` serves the catalogue with 0 old-host references, a
  storage file GET returns 200, `auth:signIn` (manager@) returns session
  tokens on the new backend.
- End-to-end verification on production: browser UI sign-in (manager@)
  succeeds over the client's WebSocket transport — staff hub appears, zero
  console errors; the REST+JWT layer answers correctly (401 for malformed
  tokens, anonymous callers get null identities); `users:team` shows the full
  roster (2 admins, 4 staff, fine-grained overrides intact); `emails:config`
  reports **live** mode, `info@mbventuresgh.com` as the alert inbox, every
  template present and the 250/day Web3Forms cap. One drift fixed to match
  the documented state (§9): `manager@` had `role=staff` in the migrated data
  (the drift predates the migration) and was restored to `admin` via
  `users:grantStaff`. Note for future agents: `auth:signIn` over the raw REST
  `/api/mutation` endpoint returns a generic Server Error envelope — the app
  never uses that path (browser auth goes over WebSocket; the admin CLI path
  works), so it is not a production defect.

**Frontend (Hostinger, `mbventuresgh.com`):**

- Root cause of the persistent 500s found and fixed: **vite gives
  `process.env` priority over the committed `.env` files**, and the Hostinger
  panel still carried the old `VITE_CONVEX_URL`/`VITE_CONVEX_SITE_URL` — the
  server build baked the disabled backend's URL, so every SSR route streamed
  a 500 while static assets stayed 200. Fixed by replacing the panel env
  (full-set PUT, 8 keys) and rebuilding. Documented as the "panel-env gotcha"
  in AGENTS.md.
- New permanent tool: `scripts/deploy-hostinger-api.mjs` — deploys through the
  public Hostinger API (upload → from-archive build → publish → restart →
  smoke-check), token from `$HOSTINGER_API_TOKEN` or the opencode config,
  never printed. AGENTS.md's deploy section now leads with it.
- Verified live: `/`, `/catalogue` (incl. `?q=` search SSR), `/cart`,
  `/checkout`, `/account`, `/track`, `/confirmation`, `/paystack/return`,
  `/sitemap.xml`, `/robots.txt` all 200; the served bundle matches the local
  build byte for byte.

**Catalogue reality + test fixtures:**

- The migrated data revealed the old deployment's catalogue had been replaced
  (19 Oct) with a **~79-product supplier catalogue** — only
  `electric-standing-desk-rgb-160` kept its slug from the original 11.
  74/74 sitemap product pages verified 200 on production. Docs repointed
  (AGENTS §8 marked historical, §11 "add a product" now staff-panel-first)
  and `convex/inventory_import.ts` carries a do-not-re-run-against-prod
  warning (it would resurrect ten superseded slugs as visible duplicates).
- The read-only Playwright suite keeps its original fixture slugs on purpose:
  it runs against **dev** (via `.env.local`), which is seeded by
  `inventory_import` with light, locally-hosted images. Running it against
  production instead times out — the supplier photos are ~2MB each at
  ~425KB/s, so a catalogue page pulls ~24MB (`load` never settles inside the
  90s budget). 15 checks still passed against prod (badges incl. the Sale
  logic, og:image resolution, heading outlines, robots, noindex, tel links,
  option-chip states). `scripts/mobile-audit.mjs` now audits
  `/product/electric-standing-desk-rgb-160` — the one slug shared by the dev
  fixture catalogue and the live one, so the audit reads the same page either
  way.

**Gate:** tsc 0 errors · lint 0 errors (7 known warnings) · 326/326 vitest ·
prettier clean · production build green · live probes as above.

### Open — all three closed (20 October 2026)

- **Dev deployment `wonderful-porpoise-243` linked.** `scripts/setup-dev-e2e.mjs`
  bootstraps it with the deploy key (no interactive login): env keys, the
  `e2e.staff@example.com` staff account and the options fixture. Both dev
  suites run from a fresh clone with `.env.local` in place.
- **Paystack webhook** re-registered by hand to
  `https://earnest-fennec-109.convex.site/webhooks/paystack` — see
  `docs/PAYMENTS-PAYSTACK.md`.
- **Photo weight** — `scripts/optimize-product-images.mjs` (sharp, dry-run by
  default) re-encodes oversized storage photos through the normal upload path;
  originals are retired only by the verified
  `photos:deleteStorageIfUnreferenced` sweep.

---

## Paystack online payments live + nationwide prepay rule (19 October 2026)

**Status:** Complete — live keys configured, dashboard verified, rules shipped
through the full quality gate.

### What was asked

Connect the payment system with the live Paystack keys, then enforce the
location rule: Accra customers keep paying in person (at the shop) or on
delivery, while customers outside Accra pay online before delivery.

### What changed

**Configuration (no code needed — production only):**

- `PAYSTACK_SECRET_KEY` (live) set on the production deployment via
  `npx convex env set … --env-file .env.prod.local` — never written to a repo
  file. `SITE_URL` was already `https://mbventuresgh.com`, so every
  initialisation carries the correct `callback_url`.
- `/staff → Customization → Ordering` → **Accept online payments (Paystack)**
  ticked on production (verified: `store:get` → `paystack_enabled: true`).
- Paystack dashboard (Live): callback URL set to
  `https://mbventuresgh.com/paystack/return`, webhook URL set to
  `https://necessary-newt-861.convex.site/webhooks/paystack`.
- Smoke test: live `/transaction/initialize` (GH₵1, GHS) returned an
  authorization URL; the webhook route now answers 401 to unsigned bodies
  (401, not 503 — the key is live and the signature gate is active).

**Code (nationwide prepay rule):**

- `convex/lib/rules.ts` — new pure `offlinePaymentProblem(zone, fulfillment,
payment)`: refuses cash for `nationwide` + delivery; Accra
  (`central`/`greater`) delivery and pickup keep their offline options.
- `convex/orders.ts` — `orders.place` enforces it server-side (the browser
  cannot forge an offline nationwide order); staff counter orders stay exempt.
- `src/routes/checkout.tsx` — checkout withdraws the "Pay on delivery" choice
  for nationwide delivery, moves the selection to "Pay online now" and
  explains why; while Paystack is switched off it tells nationwide shoppers to
  call the shop or use a Greater Accra address.
- Tests: `offlinePaymentProblem` unit cases in `order-rules.test.ts` and a
  refusal + stock-intact case in `convex-mutations.test.ts`.

**Gate:** tsc 0 errors · lint 0 errors (7 known warnings) · 316/316 tests ·
prettier clean · build succeeds. Shipped together with the counter-discount /
rider-fee feature from the parallel session (two commits).

---

## No shop delivery fees (riders collect) + staff counter discounts (19 October 2026)

**Status:** Complete — all gates green (316/316 vitest, 36/36 Playwright), deployed to dev + prod.

### What was asked

1. **Delivery fees are the rider's money.** The shop charges nothing for
   delivery — riders collect their fee from the customer directly. Stop
   charging it and stop showing fee numbers anywhere in the shop.
2. **Counter discounts.** Staff enter a flat GH₵ amount when a customer asks
   for one, when recording an order at the counter.

### What changed — delivery fees

- `orders.place` and `orders.staffCreate` now store `delivery_fee: 0`; the
  total is `round2(subtotal − discount)` (`place` has no discount:
  `round2(subtotal)`).
- The zone-fee engine was deleted from `convex/lib/rules.ts` (`deliveryFee`,
  `displayFees`, `remainingForFreeDelivery`, `DEFAULT_FEES`), together with the
  free-delivery progress bar (`FreeDelivery`), the Customization → Delivery fees
  tab (`DeliverySettings`), and every fee figure on checkout, cart, the product
  page, `/delivery`, staff order screens, receipts and the order emails — all
  replaced by "Delivery fee is paid directly to your rider."
- Legacy orders keep their stored fee and still render it. The
  `store_settings` fee fields, `saveDeliverySettings` and the
  `catalogue.delivery` permission key remain as inert legacy (dropping the
  permission key would break stored role overrides).

### What changed — counter discounts

- New permission **`orders.discount`** (floor staff; granted to staff + admin
  by default; revocable per person in `/staff` → Team).
  `orders.staffCreate` accepts an optional `discount` — blank means none
  (full-price sale, no Discount row, no timeline entry); when given it is
  validated server-side (finite, ≥ 0, ≤ the server-priced subtotal) and
  stamped on the order timeline. The form warns live while typing (same
  wording as the server) and never previews a negative total — the estimate
  clamps at GH₵ 0.
- `/staff/orders/new` shows a discount field when the permission is granted,
  with a live totals preview; receipts, the staff order page and the
  `order-received` / `adminNewOrder` emails show a Discount row only when > 0.
  Sales reports sum `order.total`, so revenue stays net of discounts.
- Online checkout cannot discount — `place`'s arguments have no such field.

### Also in this batch (second workstream, same tree)

- **Nationwide delivery is prepay-only** (`offlinePaymentProblem` in
  `convex/lib/rules.ts`): an online nationwide delivery order refuses
  `payment: "offline"` and checkout withdraws that choice; counter orders are
  exempt. With Paystack live the nationwide shopper prepaids in checkout.

### Verified

- `tsc` 0 errors · lint 0 errors (7 known warnings) · vitest **316/316** across
  20 files · Prettier clean · `vite build` succeeds · Playwright **36/36**
  (read-only).

## Web3Forms access key rotated (19 October 2026)

**Status:** Complete — new key live on dev + prod, verified with a real send.

### What was asked

Connect the store's forms to a new Web3Forms form (`My Form mbventuresgh`,
form/access key `ab22e273-…`, website URL
`https://mbventuresgh.com`, recipient `abdulganiwufuseini5@gmail.com`).

### What changed

There was no code to change: every form (contact, order emails, auth mail)
already posts to Convex mutations, which hand mail to the Web3Forms transport
keyed by the deployment's `WEB3FORMS_ACCESS_KEY`. Connecting the new form is
therefore an env-var swap:

- **Convex dev + prod**: `WEB3FORMS_ACCESS_KEY` set to
  `ab22e273-…` via `npx convex env set`
  (prod with `--env-file .env.prod.local`), replacing `c8395fed-…`.
- **Tracked env templates and docs** that carried the old key were updated in
  place so a future re-deploy cannot revert to it: `.env.hostinger`,
  `.env.production.complete`, `COPY-PASTE-DEPLOYMENT.txt`,
  `DEPLOYMENT-SUMMARY.md`, `docs/BACKEND-STATUS.md`,
  `docs/EMAIL-SETUP-STATUS.md`, `docs/HOSTINGER-SETUP-CHECKLIST.md`,
  `docs/SETUP-COMPLETE.md`, `HOW-TO-IMPORT-ENV.md`, `PRODUCTION-ENV-SETUP.md`,
  `roadmap.md`, `scripts/setup-production-env.sh`.
  (`.env.local` / `.env.prod.local` never held the key — it lives only on the
  deployment.)

### Verified

- `npx convex env get WEB3FORMS_ACCESS_KEY` reads the new key on both
  deployments.
- A real contact-form submission on dev went through the production path
  (mutation → `scheduleEmail` → scheduler → `internal.emails.send` →
  Web3Forms). Both resulting `emailLogs` rows — `contact-received` and
  `admin-contact-message` — reached `status: "sent"`, `mode: "live"` on the
  first attempt with no error, so Convex's server-side egress is accepted by
  Web3Forms on this key.
- Note: direct `fetch` to `api.web3forms.com` **from a local dev machine** can
  hit a Cloudflare browser challenge (HTTP 403 "Just a moment…"). That is an
  IP/UA heuristic on the local network, not a key problem — sends from
  Convex's servers pass cleanly.

### Watch out

The receiving inbox follows the key: Web3Forms forwards every submission to
the one inbox bound to the form. After the swap it was still
`abdulganiwufuseini5@gmail.com`; on 19 October 2026 the form's Recipient
Emails was changed in the Web3Forms dashboard to `info@mbventuresgh.com`, so
all store mail lands at the shop inbox. Re-verified end-to-end afterwards:
a fresh contact-form submission produced `contact-received` +
`admin-contact-message` rows at `status: "sent"`, `mode: "live"`, first
attempt. (Changing the recipient needs no code or deploy — the key is
unchanged.)

---

## Official email moved to info@mbventuresgh.com (17 October 2026)

**Status:** Complete — all quality gates green (tsc, lint, 256 unit tests,
prettier, build, 36 read-only e2e); backend + frontend deployed, data synced.

### What was asked

Change the shop's official email — the visible contact address, the one the
forms route to, and everything email-related — from `info@mbventuresghana.com`
(the pre-cutover address kept alive only because Web3Forms forwarded to it) to
`info@mbventuresgh.com`.

### What changed

- **Storefront / staff UI**: footer and `/contact` mailto fallbacks
  (`store-shell.tsx`, `$page.tsx`) and the staff inbox's "All alerts also go
  to …" line (`staff/messages.tsx`) now read `info@mbventuresgh.com`.
- **Backend defaults**: seed default (`convex/seed.ts`), the pre-seed render
  fallback (`convex/emails/queries.ts`), and the contact-handler comment.
  `seed:syncContactEmail` now also treats the old address as stale, so
  running it flips the live `store_settings.email` row — the one row that
  drives the storefront footer, every email footer, and the admin-alert
  fallback.
- **Convex env (prod + dev)**: `EMAIL_REPLY_TO` and `ADMIN_ALERT_EMAIL` set to
  the new address.
- **Scripts**: `verify-production-config.mjs` hard-asserted the old address as
  its pass condition (would have started failing) and
  `setup-production-env.sh` wrote it into the VPS env — both updated.
- **Templates & docs**: `.env.hostinger`, `.env.example`,
  `.env.production.complete`, `COPY-PASTE-DEPLOYMENT.txt`, the root deploy
  docs, `docs/EMAIL-SETUP-STATUS.md`, `PRODUCTION-CONFIG.md`,
  `BACKEND-STATUS.md`, `SETUP-COMPLETE.md`, `HOSTINGER-SETUP-CHECKLIST.md`,
  `TEST-ACCOUNTS.md` (password-recovery step), `roadmap.md`, AGENTS.md §1/§8,
  and the inverted guardrail in `docs/DOMAIN-MIGRATION.md` §11 plus a
  superseded-note at its top. Dated history (this file, the cutover log,
  `.agents/tasks/`) stays intact; test fixtures moved to the new domain too —
  no old-domain strings remain outside historical records.

### The Web3Forms constraint (the one account-side step)

Web3Forms delivers **every** message — customer and admin alike — to the one
inbox bound to the access key, regardless of the `to`/`replyto` payload
(`convex/emails/transport.ts` header). Code + env point everything at the new
address, but physical delivery follows the key: the Web3Forms dashboard's
receiving address must be switched to `info@mbventuresgh.com` (or a fresh key
minted for it). Until that happens mail keeps arriving at the old inbox.
`docs/EMAIL.md` §7 now documents the procedure.

### Verification

- Gates: tsc 0 · lint 0 errors · prettier clean · 256/256 unit tests · build
  ok · e2e 36/36.
- Convex prod redeployed; `store:get` returns the new email; footer and
  `/contact` serve `mailto:info@mbventuresgh.com`; Hostinger build completed;
  `suppressedEmails` confirmed not to contain the new address.

---

## Catalogue price filter hid every product above GH₵ 5,000 (17 October 2026)

**Status:** Complete — all quality gates green (tsc, lint, **256 unit tests**,
prettier, build, 36 read-only e2e); fix verified on production HTML.

### What was asked

Admin uploads (new AOC / ASUS / CHAHO stock) were "not showing" on the
storefront — the circled price filter was the suspect. Investigate, fix, and
audit related issues; guess nothing.

### The bug (evidence, not guesswork)

The catalogue's price filter was **hardcoded to GH₵ 5,000** in four places:
`useState(5000)` default, `max="5000"` on the slider, and two
`setMax(5000)` resets. Production carried `type="range" min="0" max="5000"`
in its served HTML, so every listed product priced above it was filtered out
on load **and unreachable by dragging** — including the circled ASUS TUF
(6,500), plus ultrawide-curved-monitor (5,600), redmi (6,200) and the
49-inch 165Hz monitor (10,500).

### The fix (`src/routes/catalogue.tsx` + `src/lib/store.ts`)

- `PRICE_SLIDER_MAX` — the slider's top is the shop's chosen **fixed GH₵
  50,000** (amended the same day, per the owner). The filter itself starts
  **fully open** (`max = null`, "Up to GH₵ 50,000" shown at rest) and only
  narrows once the shopper drags the slider — no constant can ever hide the
  catalogue from itself again, because the bound only exists once selected.
- `filterCatalogue(products, filter)` — the filter predicate extracted as a
  pure, tested rule shared by the grid and the "N products" count. A
  drag-to-zero is a real bound (the old `!max ||` short-circuit treated 0 as
  "no filter" and showed everything).
- Related defects fixed in the same block: brand list now built from listed
  products only (a hidden-only brand used to filter to an empty grid); the
  page resets on brand / in-stock / on-sale / sort changes and is clamped to
  the pages that exist (a header search could land on an empty page); "On
  sale" requires `original_price > price` — only a genuine markdown.

### Verification

- New `src/test/catalogue-rules.test.ts` (7 tests) pins the contract:
  default filter shows everything (even beyond the slider's 50,000 top);
  sale/stock/search predicates. Suite: **256/256 across 17 files**.
- Production data before deploy: 42 products / 37 listed; the four
  expensive ones sat at `max="5000"`-hidden. After deploy: catalogue HTML
  carries `max="10500"` and all listed products pass by default.
- Note for the shop: 19 of the 37 listed products are at **stock 0**
  (all four expensive uploads included) and will read as red "Out of stock"
  badges now that they are visible — several look like they were uploaded
  on the old form whose quantity silently defaulted to 0. Quantities are
  topped up per product in `/staff` → Products → Edit.

---

## Product form stock — explicit In stock / Out of stock (with colours) + the sellable↔shelf fix (16 October 2026)

**Status:** Complete — all quality gates green (tsc, lint, **249 unit tests**,
prettier, build, 36 read-only e2e); the full flow verified live on dev.

### What was asked

Uploading a product must offer an explicit choice — **in stock (sale) with a
quantity** or **out of stock** — it must work, and it must use the proper
colours (green in stock / sale, red out of stock).

### The form (`src/components/staff/product-form.tsx`)

- New **Availability** selector in "Stock & codes": two chips —
  **In stock — for sale** (green `success` chip when selected, reveals the
  "Available to sell" quantity, min 1) and **Out of stock** (red
  `destructive` chip, saves 0, with a note on what shoppers will see).
  Storefront badges were already green/red (`stock`/`sale`/`out` tones) —
  the form now matches them.
- New products start **In stock with an empty required quantity** instead of
  the old silent `stock: "0"` default, so nothing ships as Out of stock by
  accident; edits reflect the current count. Options products show the chips
  read-only, derived from the option total (the Options panel owns the
  counts), keeping the `Available to sell` read-only field and its exact hint
  that the live `variants.spec.ts` asserts.

### The backend blocker this exposed (fixed)

- The form shows what is **sellable** (`products.stock`, free of holds) but
  `set_on_hand` counts the **shelf** (= sellable + units promised to open
  orders). `saveProduct` (plain products), `bulkUpdate` and `saveVariants`
  sent the sellable number straight through — so with any open order on a
  product, every save **silently ate the held units**, and marking it out of
  stock **failed outright** with the garbled "There are only 1 units free — 1
  of the 0 counted…" message (reproduced live on dev before the fix). All
  three now convert (`sellable + reserved = on hand`), matching the options
  branch that already did it correctly.
- `lib/stock.ts`'s below-hold message rewritten to say something true and
  actionable ("You counted 0 units, but 1 unit is already promised to open
  orders — count at least 1, or resolve those orders first.") — audit skip
  #24, pulled in now that this flow is front and centre.

### Verified end to end (dev)

Out-of-stock on rock-360 (1 unit promised to an open order) → `Product
saved`, `stock 0 / reserved 1`, catalogue shows the red **Out of stock**
badge with add-to-cart disabled → back to In stock 9 → `stock 9 / reserved 1`
and the card is buyable again. Four new regression tests pin the contract:
unchanged saves never erode holds, zeroing works, bulk matches, and an
option's re-save keeps its own hold.

---

## Full-stack inventory & management audit — 63 verified findings fixed (16 October 2026)

**Status:** Complete — all quality gates green (tsc, lint, **245 unit tests**,
prettier, build, 36 read-only e2e, mobile audit CLEAN on 14 routes × 3 widths).

### What was asked

A read-only audit of the inventory and management stack "full stack" — the
Convex backend _and_ the staff frontend — with every finding verified against
the code before touching it (two parallel audits: 31 backend findings, 32
frontend).

### Backend fixes (all in `convex/`)

- **Visibility unified** — extracted `isListed()` into `convex/lib/dto.ts`
  (`visible ?? status === "active" ?? verified`) and reused it in
  `productDTO`, the `orders.place` guard and `stats.overview`, so the
  dashboard can never disagree with the catalogue about which products count.
- **`orders.place`** refuses unlisted/unverified products; `staffUpdate` note
  capped at 500 chars (validated before the patch).
- **`users.ts`** — the unauthenticated `listAllUsers` PII dump was **deleted**;
  `allUsers` now searches _before_ limiting; `team` exposes `overrides`;
  `deleteUser` also cleans `saved_addresses` (auth rows are untouchable —
  documented in a comment); `setPermission`'s activity message uses the
  catalogue labels.
- **`catalogue.ts`** — `deleteProduct` refuses to delete products with open
  orders (paginated scan) and scrubs the featured singleton; `bulkUpdate`
  dedupes ids, refuses stock edits on options products and bumps `version` on
  the else-branch patch; `saveVariants` caps every free-text field.
- **`inventory.ts`** — `adjust` note capped at 200; `reverse` refuses
  product-level legacy movements on products that now have variants.
- **`stats.ts`** — take-caps removed: `overview`/`trends` paginate through
  **every** order (`allOrders()`), so the dashboard never silently truncates
  at 500/1000.
- **`lib/rules.ts`** — canonical payment-status error message.

### Permission system — shared catalogue + a real Team UI

- **`convex/lib/permission_catalog.ts` (new, pure)** — `PERMISSION_CATALOG`,
  `PERMISSION_KEYS_IN_ORDER`, `defaultPermissions()`, `groupedPermissions()`
  and `PERMISSION_KEYS` were extracted out of `convex/lib/permissions.ts`
  (which imports `@convex-dev/auth/server` and therefore cannot be bundled for
  the browser). `permissions.ts` re-exports them, so every existing backend
  import path keeps working, and the Team screen imports the pure module
  directly — following the `variants.ts` pattern.
- **`src/routes/staff/team.tsx`** — each roster row (admins only) gains a
  **Permissions** button opening a full permission matrix: every permission,
  grouped, drawn as role default + this person's own overrides, with the
  effective value ticked, a `· changed` marker and a per-permission `reset`.
  Writes go through `users.setPermission` (`granted: boolean | null`).
  **Your own panel is read-only** — the backend allows a self-edit (the CLI
  stays the escape hatch) but a sole admin must not be able to click
  themselves out of `team.manage`.

### Frontend fixes (`src/routes/staff/…`, `src/components/staff/…`)

- `inventory` — counted-mode empty-input guard + `e.g. N` placeholders;
  `customization` — no role-reveal flash while the role query is pending or
  errored; `products` — shared `pageHead` + selection resets when
  search/show/category change; `staff/index` — trends query error alert and
  the four chart fallbacks respect `isError`.
- `activity` — ACTION_LABEL gaps filled (inventory.count/reverse,
  settings.delivery, role.permission, user.update/delete, email.suppress);
  `messages` — catches rendered through `errorMessage`; `admin/emails` —
  suppression failures toast and `isError` guards the empty state; `health` —
  each fix row now links to the right destination (`FIX_TARGET`).
- `bits.tsx` — `STATUS_LABEL`/`PAYMENT_LABEL` maps; the order-detail selects
  show capitalized labels instead of raw lowercase values. The maps live in
  `src/lib/store.ts` (not the component file) so `react-refresh` stays at the
  documented 7 warnings.
- `styles.css` — the mobile bottom-nav labels were **9px** (below the audit's
  12px floor): raised to 12px with horizontal padding trimmed to fit 375px,
  and labels drop to icon-only below 360px where five labelled items cannot
  fit a 264px bar. Mobile audit is CLEAN on all 14 routes × 3 widths.

### Deliberate skips (recorded, not forgotten)

- **`contact.ts` permission-key migration** — it still uses `requireStaff`
  rather than a fine-grained permission; low-risk follow-up.
- **Auth-row cleanup in `deleteUser`** — Convex Auth owns `authAccounts`/
  `authSessions`; leaving them is safe and documented inline.
- **`stock.ts` error-message cosmetics** (finding #24) — contextual copy is
  fine; not worth the test churn.

### Tests

**245/245 across 16 files** (+11): hidden-product refusal in `place`,
`staffUpdate` note cap, `reverse` options guard, `saveVariants` string caps,
`team` overrides exposure, `allUsers` search-past-limit, `deleteUser` leaves
no role/address, `bulkUpdate` dedupe + version + options guard,
`deleteProduct` held-order refusal + featured scrub, and the `isListed`
stats rework.

---

## Variant photo gallery — option colours drive the photos, arrows step through (15 October 2026)

**Status:** Complete — all quality gates green (tsc, lint, 234 unit tests,
prettier, build, 36 read-only e2e). Live suite updated (one new test) and
verified on the deploy.

### What was asked

Customers could not browse a product's photos properly (no way to step
through them) and picking a colour never changed the picture — even though
the backend has carried one photo per variant (`product_variants.image_key`)
since the options feature shipped.

### What was done

- **`src/components/product-gallery.tsx` (new)** — the product page's photo
  viewer, extracted from the route: previous/next arrows, horizontal swipe
  (touch, `touchAction: pan-y` so vertical scroll never gets trapped), a
  `1 / 3` counter pill mirroring the zoom button, the thumbnail strip and the
  zoom viewer (which now steps through the same list). Controls exist only
  when there is more than one photo.
- **Colour → photo** — `buildGallery()` in `src/lib/store-images.ts` builds
  the list: the chosen option's own photo first, then the product's main
  photo and gallery, each photo once. The product page resets the viewer to
  the option's photo when the selection changes and clamps the index when a
  shorter list takes over; an option without a photo keeps the product's set.
- **Staff can set the photo** — the options panel gained a per-row
  upload/replace/remove control (`Add photo`, same wording as the product
  form's Photos section). The row already carried `image_key` through the
  save; now it can be filled. The panel copy explains that shoppers see the
  photo the moment they pick that option.
- **No backend change** — schema, `variantArg`, `saveVariants` and
  `variantDTO` already carried `image_key` end to end; this feature is
  frontend + staff-UI only, so no Convex deploy was needed.
- **Guard rails** — `.gallery-thumbs` gained `overflow-x: auto` (a nine-photo
  strip must scroll, not widen a 320px page); the viewer clamps out-of-range
  indices; slug navigation now also resets the photo index (it used to
  survive navigation).

### Tests

- `src/test/gallery.test.ts` (new, 5 tests) — ordering, variant photo first,
  https-URL pass-through, dedupe, blank keys.
- `src/test/variants.test.ts` — new round-trip: `saveVariants` keeps a
  variant photo across re-saves and honours its removal.
- `e2e/storefront.spec.ts` — read-only: a two-photo product steps through its
  photos; a one-photo product shows no arrows.
- `e2e/variants.spec.ts` (live) — new test: staff uploads a photo per colour
  on the mouse pad, saves, reload proves persistence; the shopper test now
  asserts each colour opens on its own photo, the arrows step into the
  product's own picture, and the buy flow is unchanged.

---

## UI consistency audit — shared vocabulary, not-found screens, one breadcrumb shape (15 October 2026)

**Status:** Complete — all quality gates green (tsc, lint, 228 unit tests,
prettier, build, 35 e2e). Mobile audit clean apart from the pre-existing 9px
bottom-tab labels (deliberate, from the sitewide mobile pass).

### What was found

- **Three breadcrumb shapes.** The product page linked its parents with
  phone-sized tap targets, checkout had a bare `Cart / Checkout`, and the
  catalogue printed `Home / Shop / <category-id>` as dead text — "Home" was not
  a link, and the raw category id showed where the h1 showed the display name.
- **Two hand-rolled "not found" treatments.** The root screens in `__root.tsx`
  re-created shadcn's Button classes by hand and used `min-h-screen` _inside_
  the site shell, stacking a full viewport under the header and pushing the
  footer a screen below the message. The catch-all `/$page` route also said
  "Product not found" for a missing _page_.
- **Two different ad-hoc notice boxes** in cart and checkout where the design
  system already defines `.notice`.
- **Off-token colours:** an orange-500 cart over-stock warning and emerald-600
  staff WhatsApp pills, bypassing `--offer`/`--success` (and their dark-mode
  mixes).
- **~80 lines of dead CSS** from the Supabase-era UI (`.selection*`,
  `.checkout-step`, `.step-number`, `.progress-track`, `.error-text`,
  `.content-reading`, `.admin-tabs`, `.admin-table`, `.status`, `.timeline`),
  none referenced anywhere in the repo — a second, unused vocabulary sitting
  next to the live one.

### What was done

- **One breadcrumb shape everywhere:** Home and parent pages are links with the
  established `min-h-10` tap targets, the current page is plain text, and both
  catalogue and product crumbs show the category's display name. `.breadcrumbs`
  gained `align-items: center` so the 40px links and the plain spans share one
  line (verified in the production CSS bundle — the Lightning-CSS caveat in the
  mobile pass applies to `.breadcrumbs a` rules, not to this one).
- **`__root.tsx` error screens rebuilt on the system:** `.page-content wrap`
  scaffolding, the real `Button` component (default + outline), "Go home" plus
  "Shop the catalogue" like the route-level not-found, and `Link` navigation.
- **`PageNotFound` takes a `title`:** the product route keeps "Product not
  found"; `/$page` and the catalogue pass "Page not found".
- **`.notice` adopted** for the cart sign-in note and the checkout
  orders-closed note; the ad-hoc boxes are gone.
- **Token colours:** cart over-stock warning → `text-offer`; staff WhatsApp
  reply pill → `bg-success/15 text-success` (same pattern as StatusPill /
  PaymentPill, dark mode included).

---

## E2E coverage for options + checkout receipt race fix (15 October 2026)

**Status:** Complete — all quality gates green.

### What was found

- The live runner (`scripts/run-live-e2e.mjs`) hardcoded `e2e/purchase.spec.ts`,
  so any new live spec was silently skipped.
- **Checkout race:** after a successful `orders.place`, `cart.clear()` fired the
  empty-cart effect on `/checkout`, which raced the jump to `/confirmation`
  with a jump to `/cart`. The order landed, but the shopper saw an empty cart
  instead of their receipt reference (reproduced in a live run).
- The e2e suite had no coverage for the product-options feature (picker chips,
  per-variant price/stock, staff options editor, per-option inventory).

### What was done

- `src/routes/checkout.tsx` — `placed` state: once an order lands, the
  empty-cart effect steps aside so the receipt always wins.
- `e2e/variants.spec.ts` (new, live-gated `E2E_LIVE=1`) — full options journey
  on dev: staff gives the hidden `gaming-desk` demo product Black/White (editor
  create path, **no write-off confirm** on build/rebuild, aggregate 3+2=5
  read-only), shopper buys `Black / XL` on the two-axis mouse-pad fixture
  (White/XL correctly disabled, GH₵ 250 variant price through cart, review and
  receipt), staff sees the option on the order and per-option inventory (1 on
  hand, total 9), cancel hands the unit back (2 on hand), and a sweep proves no
  run order is left open.
- `e2e/storefront.spec.ts` — always-on checks: every catalogue card badge is in
  the closed wording/tone set, the footer's tel: link dials exactly the number
  it displays, and (when the dev options fixture exists) a chip's disabled
  state must mirror its availability label.
- `scripts/run-live-e2e.mjs` — runs both live specs.

### Verified

`npx tsc --noEmit` 0 errors · `npm run lint` 0 errors · `npm test` 228/228 ·
`npx prettier --check .` clean · `npm run build` ok · `npm run test:e2e`
35/35 · `npm run test:e2e:live` 10/10 (purchase 4 + options 6, dev deployment).

---

## Hostinger account reconnection + cutover docs reconciliation (15 October 2026)

**Status:** Complete — MCP reauthenticated to the new account; docs match reality.

### What was found

- The connected Hostinger MCP API token belonged to the **old** account (which
  owns `mbventuresghana.com`, not `mbventuresgh.com`) — every `hosting_*` MCP
  call for the live domain failed with "No website found" / DNS 403.
- The domain cutover had in fact **already completed** on 15 Oct 2026: the new
  Hostinger account (client `1023530876`, user `u963034723`) hosts
  `mbventuresgh.com` as a managed Node.js site with `completed` builds, and the
  live site returns 200 with correct canonicals. The repo docs still described
  the cutover as pending.
- Convex production (`prod:necessary-newt-861`) verified healthy: deploy key
  authenticates, `store:get` returns live catalogue data, `SITE_URL` already
  flipped to `https://mbventuresgh.com` (the runbook's §6 pending command —
  already executed).
- GitHub Actions still has **zero secrets** (`gh secret list` empty) — CI
  deploys skip; frontend deploys remain manual via Hostinger MCP.

### What was done

1. Signed into hPanel (new account) via the in-app browser; confirmed the
   account owns exactly one domain: `mbventuresgh.com`.
2. Generated an hPanel API token (Account → API, 1-month expiry) and verified
   it directly against `developers.hostinger.com/api/hosting/v1/websites` —
   returns the `mbventuresgh.com` nodejs site.
3. Replaced `HOSTINGER_API_TOKEN` in `~/.config/opencode/opencode.jsonc`
   (global opencode MCP config — not in the repo) with the new-account token.
   Requires an OpenCode restart for the MCP server to pick it up; until then
   the MCP tools still target the old account.
4. Updated stale docs to the verified reality:
   - `AGENTS.md` §1 cutover banner → COMPLETE with account facts; §2 CI/CD
     row; §5 frontend-deploy section (new account details, build polling);
     §9 legacy-account note.
   - `docs/DOMAIN-MIGRATION.md` status header → 🟢 CUTOVER COMPLETE with
     verification evidence; intro paragraph; §4 current-vs-target; §5 marked
     executed via managed hosting; §6 `SITE_URL` flip marked done.

### Open

- **GitHub Actions secrets** still missing (`HOSTINGER_*`, optional
  `CONVEX_DEPLOY_KEY`) — CI deploys stay skipped until added (§5.4).
- **Hostinger MCP restart** needed in OpenCode to bind the new token.
- **Old-domain sunset** (§7: 301 redirect, Search Console) not started.

---

## Staff & admin panel sign-in fix + full deployment (15 October 2026)

**Status:** Complete — live on `https://mbventuresgh.com`.

### Problem

After a successful sign-in, staff and admin accounts were not opening the `/staff`
panel. Two root causes were found and fixed:

1. **SSR hydration mismatch** — `isAdminUnlocked()` reads `sessionStorage`, which
   is unavailable during server-side rendering. Calling it directly in the render
   body caused the server to emit "Access restricted" HTML. On hydration the
   locked screen persisted, even for legitimately unlocked admins. Affected
   `staff.tsx`, `account.tsx`, and `admin/emails.tsx`.

2. **Admin accounts silently signed out at `/account`** — the `useEffect` in
   `account.tsx` called `signOut()` when an admin landed on `/account` without
   the sessionStorage unlock, showing a cryptic error. Admins had no clear path
   forward.

### Fixes applied

- **`src/routes/staff.tsx`** — replaced direct `isAdminUnlocked()` render call
  with a lazy `useState(() => typeof window !== "undefined" ? isAdminUnlocked() : false)`
  initializer + `useEffect` re-check on role change. SSR always gets `false`;
  client gets the real value on first paint with no flash. Added "Go to
  administrator portal" button on the locked screen so admins are never stranded.

- **`src/routes/account.tsx`** — same lazy initializer for `adminUnlocked`.
  Replaced the `signOut()` path for admins arriving at `/account` with a redirect
  to `/admin-hub/mbvg-admin-2026` with an explanatory toast. Removed `signOut`
  from the navigation `useEffect` dependency array.

- **`src/routes/admin/emails.tsx`** — applied the same `useState + useEffect`
  SSR-safe pattern (was calling `isAdminUnlocked()` directly in the render body).

### Deployments

- Convex backend deployed to `prod:necessary-newt-861` with fresh deploy key.
- All four production role grants re-confirmed (`manager`, `admin`, `attendant`,
  `staff` @ `mbventuresgh.com`).
- Frontend deployed to Hostinger via MCP (`hosting_deploy-js-application`):
  archive built from `git archive HEAD`, uploaded, built on-server in 31.7s.
- Hostinger Node.js env vars updated to include `WEB3FORMS_ACCESS_KEY`,
  `EMAIL_REPLY_TO`, and `ADMIN_ALERT_EMAIL`.

### Sign-in URLs

| Role  | URL                                                  |
| ----- | ---------------------------------------------------- |
| Staff | `https://mbventuresgh.com/account`                   |
| Admin | `https://mbventuresgh.com/admin-hub/mbvg-admin-2026` |

---

## Mobile menu drawer & responsive header UX redesign (13 October 2026)

**Status:** Complete & validated across Vitest & Playwright test suites.

### Done

- **Full-height mobile navigation drawer (`MobileMenuDrawer`):** Replaced the desktop mega menu dropdown on mobile viewports with a dedicated Radix UI sliding drawer. The drawer provides clean category navigation with non-wrapping arrow cues, quick search access, 2x2 grid for customer service (Delivery & Pickup, Track Order, Warranty, Contact), and Abelenkpe shop operating hours with 1-tap WhatsApp and Call buttons. Automatically dismisses on route change.
- **Header menu toggle isolation:** The header hamburger button now toggles the mobile drawer on mobile screens (`md:hidden`), while desktop screens continue using the desktop 2-column mega menu card. Tapping the header button on mobile now smoothly transitions the icon (`Menu` <-> `X`) and opens the drawer with a backdrop scrim.
- **Announcement bar text truncation fix:** Adapted the top facts bar on mobile screens so "Accra · Pickup in store · De..." no longer truncates mid-word, rendering as "Abelenkpe, Accra · Ghana delivery" and cleanly fitting narrow phone displays.
- **Preserved all test invariants:** Maintained single unique selector for the cart header button in Playwright tests (`button[aria-label^="Open cart"]`), ensuring all 32 Playwright tests and 216 Vitest tests pass cleanly.

---

## Customer inquiries inbox & contact message persistence (13 October 2026)

**Status:** Complete & verified live on `https://mbventuresgh.com`.

### Done

- **Persisted contact submissions:** Shopper messages submitted via `/contact` are now stored in Convex's `contact_messages` table (`name`, `email`, `phone`, `subject`, `message`, `status`: unread / read / replied, `read_at`, `read_by`). Both notification emails still fire as before (admin alert to `info@mbventuresghana.com` + shopper acknowledgement).
- **Staff inquiries inbox at `/staff/messages`:** New staff view with search (by customer name, email, phone, subject or body), filter tabs (All, Unread, Read, Replied), one-click "Mark read" and "Mark replied" actions, pre-composed `mailto:` reply link, and a 1-tap WhatsApp reply button that normalises Ghanaian phone numbers (`233...`).
- **Dashboard & navigation unread count badges:** The staff dashboard (`/staff`) now includes an actionable "Inquiries" row in the queue highlighting unread messages, and the staff sidebar shell renders a real-time unread counter badge.
- **Verification on production:** Tested end-to-end against `https://mbventuresgh.com` using Playwright automation (`scripts/verify-permissions.mjs`), confirming sign-in as `admin@mbventuresgh.com`, access to `/staff/messages`, and retrieval of live submissions.

---

## Domain migration prepared: mbventuresghana.com → mbventuresgh.com (12–13 October 2026)

**Status:** Repo fully switched over locally — **not deployed**, nothing pushed.
Full runbook: `docs/DOMAIN-MIGRATION.md`.

The store is moving to `https://mbventuresgh.com` on a **new Hostinger
account**. The backend stays exactly where it is (Convex
`prod:necessary-newt-861`); only the frontend origin, the hosting target and
the staff logins change.

What changed in the tree (41 tracked files, rule-based swap + hand edits):

- Site URL → `https://mbventuresgh.com` everywhere it drove SEO/canonical
  URLs, CI, workflows, scripts and docs — `.env.production`,
  `.env.example`, `.env.hostinger`, `.env.production.complete`,
  `.hostinger-env`, both GitHub workflows, every deploy doc and script.
- Staff/admin **login** addresses → `@mbventuresgh.com`
  (`manager@`, `admin@`, `attendant@`, `staff@`) in `AGENTS.md`,
  `docs/TEST-ACCOUNTS.md`, `docs/PRODUCTION-CREDENTIALS.md` and the
  provisioning/verification scripts.
- Server paths and process names: `/var/www/mbventuresghana` →
  `/var/www/mbventuresgh`; PM2 app name (`ecosystem.config.js`, workflows,
  `scripts/*.sh`) → `mbventuresgh`.
- Hand edits: cutover-pending banners in `AGENTS.md`, `docs/TEST-ACCOUNTS.md`
  and `docs/PRODUCTION-CREDENTIALS.md`; secrets-repoint warning in
  `deploy-hostinger.yml`.

Deliberately untouched: `info@mbventuresghana.com` (the live Web3Forms inbox —
contact, reply-to, admin alerts and the UI fallbacks all keep it), the
`WEB3FORMS_ACCESS_KEY`, the Convex deployment URLs, and `convex/auth.config.ts`
(JWT issuer must stay `CONVEX_SITE_URL`). `docs/PROGRESS.md` history is
unmodified; passwords were not rotated (rotation procedure in the runbook §9).

Cutover itself — DNS, SSL, nginx, GitHub `HOSTINGER_*` secrets,
`npx convex env set SITE_URL https://mbventuresgh.com --prod`, and registering
the four new-domain accounts — is documented step-by-step in
`docs/DOMAIN-MIGRATION.md` §5–§8 and waits for deploy time. Until then a push
to `main` would deploy the new domain strings to the **old** server, so main
must not be pushed before cutover.

**Consolidation (13 October).** `main` is now the single source of truth: the
second worktree at `Temp/opencode/mbv-deploy` (branch `fix/auth-and-ui`) was
audited file-by-file against `main` and contains **no unique work** — its
branch is a strict ancestor of `main` and its uncommitted tree is a stale
10-October snapshot of `main` (pre-variants `stock.ts`/`orders.ts`, the old
placeholder phone, 179/186 test counts, old-domain text). Nothing needed
porting; it was left untouched and can be removed safely. All quality gates
pass on the combined tree: tsc, lint, 216/216 vitest, prettier, build and
32/32 Playwright e2e.

**Staff accounts provisioned early (13 October).** The four `@mbventuresgh.com`
logins (manager, admin — admins; attendant, staff — staff) now exist on
`prod:necessary-newt-861`, each verified signup → role grant → sign-in via
`node scripts/create-new-accounts.mjs` (extended from two to all four
accounts). The legacy `@mbventuresghana.com` accounts remain active until the
cutover revokes their `user_roles` rows. The only backend env still to flip at
cutover is `SITE_URL=https://mbventuresgh.com` — deliberately left on the old
domain so live email links keep working until the new site serves traffic.
All local env files (`.env*`) and CI workflow envs verified complete for a
full-stack deploy; the sole remaining deploy-time inputs are the GitHub
`HOSTINGER_*` secrets for the new VPS (runbook §5.4).

**Pushed to GitHub (13 October).** `main` went to `origin` on the user's
instruction (8 commits, `3b4faf1` → `131c577`). Both workflows ran and
reported success — but **nothing deployed**: the repository has no Actions
secrets configured (`gh secret list` empty), so the Convex backend step and
the VPS SSH step both skipped (annotated "HOSTINGER_HOST secret is not
configured - skipping the VPS deploy step"). The live old site and the prod
backend are therefore untouched. When the new Hostinger service is connected,
adding the six `HOSTINGER_*` secrets (runbook §5.4) is the only missing
input — one `workflow_dispatch` of the Deploy workflow (or any push to
`main`) then publishes the current version to `mbventuresgh.com`.

Commits for this whole effort: `3292504` domain swap + runbook · `dddbe46`
test-count doc fix · `024d9de` consolidation audit · `b1c2867` account
provisioning · `5cffd37` documentation refresh. Full chronological detail,
including every infrastructure write and audit performed:
`docs/DOMAIN-MIGRATION.md` §12.

---

**Status:** Complete — data fix only, no source change.

Production `store_settings` was still carrying the pre-migration address in two
fields: `address` read `Circle Commercial Area, Accra, Ghana` and `announcement`
read `Circle, Accra · Pickup in store · Delivery across Ghana`. Both were
customer-facing — the address is rendered in the footer, on `/contact`, `/track`
and at checkout, and it also reaches order emails and printed receipts.

The fix needed no code. `convex/seed.ts` already ships `seed:syncLocation`, an
idempotent mutation that rewrites exactly the three location strings when they
still mention "Circle" and leaves anything the shop edited itself alone. Run
once against production:

```sh
npx convex run seed:syncLocation --env-file .env.prod.local
```

It reported `{"updated": ["address", "announcement"]}` — the third field,
`hero_subtitle`, does not mention Circle and was correctly left untouched.

Now live on `/`, `/contact`, `/track`, `/checkout` and `/catalogue`:
`address` = "Abelenkpe taxi rank, Accra, Ghana" and `announcement` =
"Abelenkpe, Accra · Pickup in store · Delivery across Ghana". Zero "Circle"
strings remain in any customer-facing page.

Worth remembering: `hero_subtitle`, `email` and the announcement are all
`store_settings` data edited at `/staff` → Customization, so a fresh seed
default and a live row can legitimately differ. When copy looks stale on
production but the source already reads correctly, check the row before
touching the source — the migration may simply never have been run.

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
