# MB Ventures GH — Agent & AI IDE Reference

This file is the single source of truth for any AI IDE, agent, or collaborator
working in this repository. Read it in full before touching `convex/` or any route file.

**Last audited against the codebase: 15 October 2026.**

---

## 1. Project overview

**MB Ventures GH** is a live e-commerce storefront at `https://mbventuresgh.com`
selling workspace and computer accessories (desks, gaming gear, mounts, audio equipment)
from the Abelenkpe taxi rank shop in Accra, Ghana.

- **Ordering is LIVE.** 11 real products are in the database with real stock (10 units each).
- **Demo products** (10) are hidden (`visible: false, status: "draft"`) but preserved — never delete them.
- **Currency:** Ghana cedis (GH₵).
- **Domain cutover COMPLETE (verified 15 Oct 2026).** Production serves
  `https://mbventuresgh.com` from the **new Hostinger account** (client
  `1023530876`, hosting user `u963034723`, Node.js site, latest build
  `completed` 15 Oct 2026). The old `mbventuresghana.com` account is retired
  for hosting; the contact / reply-to address `info@mbventuresghana.com` is
  intentionally unchanged. See `docs/DOMAIN-MIGRATION.md` for the record.

---

## 2. Tech stack

| Layer       | Choice                                                                              |
| ----------- | ----------------------------------------------------------------------------------- |
| Framework   | TanStack Start (file routes, SSR) · React 19 · Vite                                 |
| Styling     | Tailwind CSS v4 · shadcn/ui · Archivo / Public Sans / IBM Plex Mono                 |
| Backend     | Convex (`convex/`) — schema, queries, mutations, scheduled functions                |
| Auth        | Convex Auth · email + password only · no OAuth · no email verify                    |
| Client data | TanStack Query via `@convex-dev/react-query`                                        |
| Email       | Web3Forms — dry-run until `WEB3FORMS_ACCESS_KEY` is set                             |
| Tests       | Vitest (234 tests, 16 files) + Playwright (36 read-only + 11 live checks)           |
| CI/CD       | Hostinger Node.js hosting via MCP deploys · GitHub Actions (secrets missing, skips) |

---

## 3. Repository layout (key paths)

```
convex/
  schema.ts               Single source of truth for all 14 table schemas
  inventory_import.ts     Idempotent real-product migration — safe to re-run
  orders.ts               place, track, mine, staffList, staffGet, staffUpdate, staffNote, staffFixContact
  catalogue.ts            saveProduct, deleteProduct, saveSettings, saveDeliverySettings, …
  users.ts                me, isStaff, myRole, myPermissions, team, addStaff, setRole,
                          revokeRole, setPermission, grantStaff, updateProfile, deleteUser, …
  seed.ts                 seed, syncLocation, syncContactEmail (all internalMutation)
  inventory.ts            adjust, count, reverse, history
  health.ts               report, scan, dailyCheck — data-health cron
  stats.ts                overview, trends — dashboard analytics
  store.ts                get — public storefront data query
  contact.ts              Contact form handler
  emails.ts               config, list, suppressed, preview, send, test
  categories.ts           CRUD for product categories
  activity.ts             Activity log query
  uploads.ts              generateUploadUrl, savePhoto
  migrations.ts           backfillReservations (internal)
  crons.ts                Scheduled health checks
  auth.ts / auth.config.ts  Convex Auth setup
  http.ts                 HTTP endpoint wiring
  emails/
    config.ts             Email configuration constants
    enqueue.ts            Queue-and-send pipeline
    orderTriggers.ts      notifyOrderPlaced, notifyOrderUpdated
    queries.ts            Email log queries
    sample.ts             Sample data for previews
    transport.ts          Web3Forms HTTP transport + retry
    templates/            HTML email templates
  lib/
    stock.ts              applyStockChange — THE only way to mutate stock
    auth.ts               currentUserId, requireUser, requireStaff, requireAdmin, isStaff, getRole
    permissions.ts        requirePermission, PERMISSION_CATALOGUE — fine-grained per-action gates
    dto.ts                productDTO, categoryDTO, settingsDTO, orderDTO, receiptDTO, historyDTO,
                          Variant, OptionAxis, ProductMaster types
    rules.ts              Pure business rules shared by mutations and UI (fees, validation, phone)
    variants.ts           variantKey, deriveAxes, swatchFor, COLOUR_SWATCHES — option/variant logic
    settings.ts           getSettings — singleton store_settings helper
    errors.ts             fail(), readError(), ErrorCode type — typed backend errors
    activity.ts           logActivity, recentActivity — staff activity feed

src/
  routes/
    __root.tsx            Root layout (fonts, providers, Toaster)
    index.tsx             Homepage — hero, hotspots, featured rail
    catalogue.tsx         Product listing with filters
    product.$slug.tsx     Product detail page
    checkout.tsx          2-step checkout (details → review & place)
    cart.tsx              Full-page cart view
    account.tsx           Customer account / sign-in / sign-up
    track.tsx             Guest order tracking by reference + phone
    confirmation.tsx      Post-checkout confirmation
    login.tsx             Redirect → /account
    signin.tsx            Redirect → /account
    signup.tsx            Redirect → /account
    robots[.]txt.tsx      Dynamic robots.txt
    sitemap[.]xml.tsx     Dynamic XML sitemap
    $page.tsx             Catch-all for informational pages
    auth/
      signin.tsx          Auth sign-in page
      signup.tsx          Auth sign-up page
    staff.tsx             Staff hub layout (sidebar + guards)
    staff/
      index.tsx           Staff dashboard (stats, queue, charts)
      orders/
        index.tsx         Order list with filters
        $id.tsx           Single order detail + actions
      products/
        index.tsx         Product list + bulk actions
        $id.tsx           Product editor
        new.tsx           New product form
      inventory.tsx       Stock adjustments, history, stocktake
      categories.tsx      Category management
      customization.tsx   Store settings, hero, announcement, delivery
      team.tsx            Team roster, role grants, permission overrides
      messages.tsx        Customer inquiry inbox (read/reply)
      health.tsx          Data-health report + fix actions
      activity.tsx        Staff activity log
    admin/
      index.tsx           Redirect → /staff
      emails.tsx          Email log, config, test send, suppression list
    dev/
      email-preview.tsx   Email template preview (dev only)
  lib/
    store-images.ts       Image key → URL mapping + intrinsic sizes
    store.ts              storeQuery, money(), pageHead(), delivery(), errorMessage()
    convex.ts             Convex client setup + query options
    use-session.ts        Session hook
    cart.ts               Cart types and helpers
    home-content.ts       Homepage content helpers
    error-capture.ts      Error boundary capture
    error-page.ts         Error page utilities
    upload-image.ts       Client-side image upload helper
    utils.ts              cn() (clsx + tailwind-merge)
  hooks/
    use-mobile.tsx        Mobile breakpoint detection hook
  components/
    store-provider.tsx    Root cart provider (CartContext)
    store-ui.tsx          ProductCard, PageError, SectionHeading, Quantity
    store-shell.tsx       Page shell, header, footer, navigation, mobile drawer
    auth-frame.tsx        Auth form frame
    order-receipt.tsx     Printable order receipt
    variant-picker.tsx    Colour swatch + option picker for product pages
    product-gallery.tsx   Product photo viewer (arrows, swipe, thumbs, zoom)
    staff/
      shell.tsx           Staff sidebar layout + navigation
      bits.tsx            Reusable staff UI atoms (badges, status chips)
      charts.tsx          Dashboard charts (Recharts)
      home-editor.tsx     Homepage content editor (hero, trust, featured)
      product-form.tsx    Product create/edit form with validation
      variant-editor.tsx  Variant CRUD inside the product editor
    ui/                   shadcn/ui primitives (Button, Dialog, Sheet, etc.)

public/images/
  hero-workspace.webp      Hero background — cinematic workspace from real products (1376x768)
  store-logo.jpeg          Store logo
  products/               Real product photos (WebP, named by product slug)
    carbon-fiber-gaming-desk.webp
    electric-standing-desk-rgb-160.webp
    luminous-rgb-mouse-pad.webp
    custom-macro-mechanical-keyboard.webp
    custom-macro-mechanical-keyboard-gallery.webp
    dual-monitor-desk-mount.webp
    360-rotating-laptop-stand.webp
    rock-360-phone-tablet-stand.webp
    vertical-laptop-stand.webp
    monitor-light-bar.webp
    mottian-ai-smart-keyboard-mouse.webp
    rgb-dynamic-usb-microphone.webp

scripts/
  mobile-audit.mjs             Mobile layout audit (14 routes × 3 widths)
  create-new-accounts.mjs      Provision staff accounts on production
  create-production-accounts.mjs  Legacy account provisioning
  test-new-accounts-live.mjs   Verify new accounts end-to-end
  test-live-auth.mjs           Auth smoke tests
  verify-permissions.mjs       Permission system verification
  verify-email-config.mjs      Email config verification
  verify-production-config.mjs Full production config audit
  audit-screenshots.mjs        Screenshot audit helper
  run-live-e2e.mjs             Live e2e runner (places real orders)
  deploy-hostinger.sh          Manual SSH deploy script
  setup-production-env.sh      VPS environment setup
  pack-deploy.mjs              Build artifact packaging

e2e/
  storefront.spec.ts      Head, outline, SEO, sitemap, robots, badges, contact checks
  mobile.spec.ts          320/360/390/414 overflow matrix, tap targets, form fields
  purchase.spec.ts        Full purchase flow + staff operations e2e (live-gated)
  variants.spec.ts        Product options journey: editor, picker, order, inventory (live-gated)
  helpers.ts              Shared Playwright helpers

.github/workflows/
  ci.yml                  PR quality gates (tsc, lint, test, prettier, build)
  deploy-hostinger.yml    Main deploy: build → test → Convex deploy → VPS SSH
  clean-deploy.yml        Manual full wipe + redeploy (workflow_dispatch)
```

---

## 4. Architecture invariants — NEVER break these

### 4a. Stock: applyStockChange is the only door

All stock mutations (set, adjust, reserve, release) **must** route through
`applyStockChange` in `convex/lib/stock.ts`. It enforces optimistic locking via
`products.version` and writes to `inventory_history`.
Bypassing it violates the single-writer invariant tested in `src/test/stock-single-writer.test.ts`.

```ts
// CORRECT
await applyStockChange(ctx, {
  slug: "carbon-fiber-gaming-desk",
  command: { kind: "set_on_hand", value: 10 },
  movement_type: "opening",
  source: "import",
  reason: "Initial stock",
});

// NEVER do this
await ctx.db.patch(productId, { stock: 10 });
```

### 4b. Server is authoritative on prices

`orders.place` recomputes price × quantity, delivery fee and total inside the
mutation. The browser shows estimates only.

### 4c. Product visibility

- `visible: true` → shown in catalogue, index, sitemap
- `visible: false` → hidden from all public routes
- `status: "draft"` → also hidden (demo/archived products)
- `productDTO` in `convex/lib/dto.ts` maps these to a `visible` boolean
- All listing routes check `p.visible !== false` — keep this filter in place

### 4d. Auth roles & permissions

| Role     | Access                                                   |
| -------- | -------------------------------------------------------- |
| customer | Browse, cart, checkout, account, order tracking          |
| staff    | + orders, inventory, catalogue editing (per permissions) |
| admin    | + team management, delivery fees, store settings         |

Role rows live in `user_roles`. Guards: `lib/auth.requireStaff` / `requireAdmin`.
All user-facing errors must throw `ConvexError({ message })`.

**Fine-grained permissions** (added via `convex/lib/permissions.ts`): each staff
function calls `requirePermission(ctx, "orders.update")` instead of raw role
checks. Admins and staff get different default permission sets, and per-user
overrides (`user_roles.overrides`) can grant or revoke individual permissions
without inventing a new role. The closed set of permission keys lives in
`convex/schema.ts → PERMISSION_KEYS`:

```
catalogue.view, catalogue.edit, catalogue.delete, catalogue.bulk,
catalogue.categories, catalogue.settings, catalogue.delivery,
inventory.view, inventory.adjust, inventory.stocktake, inventory.health,
orders.view, orders.update,
reports.view, activity.view,
uploads.create,
team.view, team.manage,
emails.admin, emails.note
```

### 4e. Image keys

Images are referenced by a **string key**, not a URL. Key resolution is in
`src/lib/store-images.ts`. To add a new image:

1. Copy file to `public/images/` (or `public/images/products/`)
2. Add `"key": "/images/path.ext"` to the `base` object
3. Add `"key": [width, height]` to the `sizes` object

### 4f. Payments happen offline

There is no in-app payment step. `orders.place` derives `payment_method` from
fulfilment — `pickup ⇒ "pay_at_store"`, `delivery ⇒ "cod"` — and never accepts
provider or transaction-reference arguments. The `"momo"` literal stays in the
schema only so pre-existing MoMo orders keep validating; `store_settings.momo_number` /
`momo_name` are legacy optional fields that no UI or mutation touches. Staff record
receipt in `/staff`; completing an order still requires `payment_status: "confirmed"`.

### 4g. Product variants

Products can have **option axes** (Colour, Size, Type) and a flat list of
**variants**. Logic lives in `convex/lib/variants.ts` (pure — no Convex imports):

- `variantKey()` builds a canonical stable key from options — written into
  `product_variants.key`, `orders.items[].variant_key`, and inventory rows.
  It must **never** change meaning (old orders reference old keys).
- `deriveAxes()` extracts the option axes from a product's variants.
- `COLOUR_SWATCHES` maps known colour names to hex for rendering.
- `VARIANT_LIMITS` caps max options/axes per product.

Variants can also carry **one photo each** (`product_variants.image_key`,
set in the staff options panel). The product page's gallery puts the chosen
option's photo first — see `buildGallery()` in `src/lib/store-images.ts` and
`src/components/product-gallery.tsx`. An option without a photo falls back to
the product's own photos.

The `variant-picker.tsx` component renders swatches for colours and text chips
for other axes. `variant-editor.tsx` in the staff product editor manages CRUD.

---

## 5. Database schema — 14 tables

| Table               | Purpose                                               |
| ------------------- | ----------------------------------------------------- |
| `users`             | Auth users (name, email, phone, image)                |
| `user_roles`        | Staff/admin role + permission overrides               |
| `products`          | Product catalogue (slug, price, stock, variants)      |
| `product_variants`  | Per-product buyable variants (key, options, sku)      |
| `categories`        | Product categories (name, slug, order)                |
| `store_settings`    | Singleton store config (hero, fees, contact, …)       |
| `orders`            | Customer orders (items, status, payment, stock_state) |
| `order_history`     | Order status/payment timeline entries                 |
| `saved_addresses`   | Customer saved delivery addresses                     |
| `inventory_history` | Stock movement audit ledger (append-only)             |
| `activity_log`      | Staff activity feed (catalogue, settings, roles)      |
| `emailLogs`         | Email send log (status, template, recipient)          |
| `suppressedEmails`  | Bounced/complained addresses (auto-suppressed)        |
| `contact_messages`  | Customer contact form submissions (inbox)             |

Plus the Convex Auth tables (`authAccounts`, `authSessions`, etc.) inherited
from `@convex-dev/auth`.

---

## 6. Deployments

### Dev (daily work)

```sh
npm run dev   # runs vite dev + convex dev together
```

`.env.local` (gitignored) → dev deployment `dev:stoic-elephant-714`.

### Convex production deploy

```sh
npx convex deploy --env-file .env.prod.local
```

Targets `prod:necessary-newt-861`. `.env.prod.local` holds `CONVEX_DEPLOY_KEY` — never commit it.

### Frontend production deploy

Deploys target the **new Hostinger account** (verified 15 Oct 2026): client
`1023530876`, hosting user `u963034723`, Node.js site `mbventuresgh.com`
(root `/home/u963034723/domains/mbventuresgh.com/public_html`, nitro app,
Node 20, output `.output`). The Hostinger MCP token for this account lives in
`~/.config/opencode/opencode.jsonc` (never commit it).

Deployed via **Hostinger MCP** (`hosting_deploy-js-application`): pack source
with `node scripts/pack-deploy.mjs` (creates `deploy.zip` via `git archive HEAD`),
then upload and trigger a server-side build through the MCP tool. The server runs
`npm run build` with the environment variables set in the Hostinger control panel,
publishes `.output`, and restarts the Node.js process. Poll
`hosting_list-js-deployments` until the build state is `completed`.

GitHub Actions (`.github/workflows/deploy-hostinger.yml`) also deploys on every
push to `main` — but the `HOSTINGER_*` secrets are not configured in the repo,
so the SSH deploy step skips. Use the MCP method above for frontend deploys until
the secrets are added.

> **Manual deploy (Hostinger MCP — recommended until GitHub secrets are set up):**
>
> ```powershell
> node scripts/pack-deploy.mjs   # creates deploy.zip
> # Then use Hostinger MCP tool: hosting_deploy-js-application
> # domain: mbventuresgh.com, archivePath: <absolute path to deploy.zip>
> ```

### Full production deploy (both layers)

```sh
npx convex deploy --env-file .env.prod.local   # backend first
git add -A; git push origin main               # triggers GitHub Actions for frontend
```

### Inventory migration (idempotent — safe to re-run anytime)

```sh
npx convex run inventory_import:apply --env-file .env.prod.local
```

Hides demo products, upserts 11 real products, sets stock to 10 each,
enables ordering, sets hero image + featured product IDs.

Homepage copy refresh (pay-later wording; only replaces the exact old strings,
so deliberate staff edits survive — run once on production with the deploy):

```sh
npx convex run inventory_import:patchHomeCopy --env-file .env.prod.local
```

### Seeding

```sh
npx convex run seed:seed                              # dev
npx convex run seed:seed --env-file .env.prod.local   # prod
```

### Grant staff/admin role (run AFTER user has signed up)

```powershell
# Windows PowerShell — always use escaped quotes
npx convex run users:grantStaff '{\"email\":\"you@example.com\",\"role\":\"admin\"}' --env-file .env.prod.local
# Omit role to default to admin. Use \"role\":\"staff\" for standard staff.
```

---

## 7. Quality gates — must all pass before any deploy

```sh
npx tsc --noEmit          # 0 errors
npm run lint              # 0 errors (7 pre-existing react-refresh warnings are OK)
npm test                  # 234/234 across 16 test files
npx prettier --check .    # clean
npm run build             # succeeds
npm run test:e2e          # 36/36 Playwright checks (read-only)
```

Optional (writes a real order + option fixture to dev — opt-in only, self-cleaning):

```sh
npm run test:e2e:live     # 11/11 live journey checks (purchase + options)
```

Optional (needs a dev server or a live URL; run it whenever layout, CSS or
mobile navigation is touched):

```sh
node scripts/mobile-audit.mjs http://localhost:8080                       # dev
node scripts/mobile-audit.mjs https://mbventuresgh.com --email=… --password=…
# Expect "CLEAN — no mobile defects found across 14 routes × 3 widths."
```

---

## 8. Live store state (as of 15 Oct 2026)

### Real products — all visible, active, 10 units each

| Slug                             | Name                                            | Price GH₵ | Category    |
| -------------------------------- | ----------------------------------------------- | --------- | ----------- |
| carbon-fiber-gaming-desk         | Black Carbon Fiber Gaming Desk (140x60cm)       | 1450      | desks       |
| electric-standing-desk-rgb-160   | Electric Height-Adjustable Desk RGB (160x60cm)  | 2800      | desks       |
| luminous-rgb-mouse-pad           | Luminous RGB Oversized Mouse Pad (900x400mm)    | 210       | accessories |
| custom-macro-mechanical-keyboard | Custom Macro Mechanical Keyboard w/ LCD         | 1500      | accessories |
| mottian-ai-smart-keyboard-mouse  | Mottian AI Smart Wireless Keyboard and Mouse    | 1000      | accessories |
| dual-monitor-desk-mount          | Dual Monitor Desk Mount (14-30 inch)            | 1120      | mounts      |
| 360-rotating-laptop-stand        | 360 Degree Rotating Aluminum Laptop Stand       | 230       | mounts      |
| vertical-laptop-stand            | Vertical Laptop Stand Storage Base              | 240       | mounts      |
| rock-360-phone-tablet-stand      | Rock 360 Degree Foldable Phone and Tablet Stand | 100       | mounts      |
| monitor-light-bar                | Monitor Light Bar Screen Lamp                   | 450       | accessories |
| rgb-dynamic-usb-microphone       | Professional RGB Dynamic USB Microphone         | 2000      | audio       |

### Demo products — hidden (visible: false, status: draft — DO NOT DELETE)

standing-desk, gaming-desk, ergonomic-chair, office-chair, mechanical-keyboard,
wireless-mouse, monitor-arm, laptop-stand, usb-microphone, stream-controller

### Store settings

- ordering_enabled: true
- hero_image: "hero-workspace" (public/images/hero-workspace.webp — 1376x768)
- hero_title: "Your workspace. Elevated."
- Featured hotspots: electric-standing-desk-rgb-160, mottian-ai-smart-keyboard-mouse, custom-macro-mechanical-keyboard
- Contact: `phone` and `whatsapp` are both `0249654442` — one shop number for
  every `tel:` link and every WhatsApp button. Edit both together in
  `/staff` → Customization → Contact.
- Payments: no in-app payment — pickup pays at the shop counter, delivery pays cash on
  arrival; staff mark payment received in /staff (legacy MoMo recipient fields are kept
  in the row for old orders but no UI or mutation touches them)

---

## 9. Staff / admin accounts (production)

| Email                      | Role  | Purpose                          |
| -------------------------- | ----- | -------------------------------- |
| manager@mbventuresgh.com   | admin | Full back-office, team, settings |
| admin@mbventuresgh.com     | admin | Full admin                       |
| attendant@mbventuresgh.com | staff | Orders and inventory             |
| staff@mbventuresgh.com     | staff | Orders and products              |

> These four accounts are **live on production** (provisioned 13 Oct 2026 via
> `node scripts/create-new-accounts.mjs`, each verified signup → grant →
> sign-in). Cutover is complete (15 Oct 2026), so these `@mbventuresgh.com`
> logins are the primary accounts; the legacy `@mbventuresghana.com` accounts
> are obsolete — see `docs/DOMAIN-MIGRATION.md` §6 and `docs/TEST-ACCOUNTS.md`.

Full credentials and recovery steps: `docs/TEST-ACCOUNTS.md` and `docs/PRODUCTION-CREDENTIALS.md`.
Sign in at `/account`. Staff/admin see a "Store staff hub" button to `/staff`.

---

## 10. Environment files

| File             | Purpose                                | In git?         |
| ---------------- | -------------------------------------- | --------------- |
| .env             | Shared VITE_CONVEX_URL (production)    | Yes             |
| .env.development | VITE_SITE_URL=http://localhost:5173    | Yes             |
| .env.production  | VITE_SITE_URL=https://mbventuresgh.com | Yes             |
| .env.local       | Dev CONVEX_DEPLOYMENT + secrets        | No (gitignored) |
| .env.prod.local  | CONVEX_DEPLOY_KEY                      | No (gitignored) |
| .env.example     | Full variable template                 | Yes             |
| .env.hostinger   | Hostinger VPS env template             | Yes             |

Never commit .env.local or .env.prod.local.
Never log CONVEX_DEPLOY_KEY, JWT_PRIVATE_KEY, or JWKS.

---

## 11. Common tasks

### Add a new product

1. Add image to `public/images/products/<slug>.webp`
2. Register key in `src/lib/store-images.ts` (base map + sizes map)
3. Add entry to `REAL_PRODUCTS` in `convex/inventory_import.ts`
4. `npx convex run inventory_import:apply --env-file .env.prod.local`
5. `git push origin main` — GitHub Actions deploys the new image

### Change the hero image

1. Add image to `public/images/`
2. Register key in `src/lib/store-images.ts`
3. `npx convex run inventory_import:patchHeroImage --env-file .env.prod.local`
4. `git push origin main`

### Change featured hotspot products

Edit `featured_ids` in `inventory_import.ts` apply mutation, re-run `inventory_import:apply`.
Or use the staff panel at /staff Customization.

### Add a permission to a staff member

Use `/staff` → Team → click a member → toggle individual permissions.
Or via CLI: `npx convex run users:setPermission` (requires admin).

### Verify a production password

```powershell
npx convex run auth:signIn '{\"provider\":\"password\",\"params\":{\"flow\":\"signIn\",\"email\":\"admin@mbventuresgh.com\",\"password\":\"...\"}}' --env-file .env.prod.local
```

---

## 12. Things that must NOT happen

- Do NOT bypass applyStockChange — never patch products.stock directly
- Do NOT delete demo products — they are preserved intentionally
- Do NOT add OAuth, social login or email verification to signup
- Do NOT reintroduce in-app payment inputs (MoMo references, provider pickers) — payment
  is always collected offline and `payment_method` is derived from fulfilment in `orders.place`
- Do NOT use Resend or SendGrid — email transport is Web3Forms only
- Do NOT push CONVEX_DEPLOY_KEY, JWT_PRIVATE_KEY or JWKS to git
- Do NOT invent product slugs or prices — use only convex/inventory_import.ts
- Do NOT show products with verified: false as confirmed stock
- Do NOT change `variantKey()` output format — old orders reference those keys

---

## 13. Windows PowerShell specifics

PowerShell does not support && to chain commands. Use ; instead:

```powershell
git add -A; git commit -m "message"     # correct
git add -A && git commit -m "message"   # syntax error in PowerShell
```

PowerShell strips inner quotes from native args — always escape JSON:

```powershell
# correct
npx convex run users:grantStaff '{\"email\":\"x@y.com\",\"role\":\"admin\"}' --env-file .env.prod.local

# wrong — PowerShell drops quotes
npx convex run users:grantStaff '{"email":"x@y.com"}' --env-file .env.prod.local
```

That escaping breaks down for JSON containing spaces (e.g. a `name` field) —
the argument splits and `convex run` reports "too many arguments". Passing the
JSON via a PowerShell variable does not help either (the quotes get eaten). For
such payloads, drive the CLI from a Node script with an args array instead —
see `scripts/create-new-accounts.mjs` (`spawnSync` with `shell: true` and
`\"`-escaped JSON).

---

## 14. Docs map

| File                              | Contents                                                         |
| --------------------------------- | ---------------------------------------------------------------- |
| AGENTS.md (this file)             | Architecture, invariants, workflow, full state                   |
| CLAUDE.md                         | Short alias for other AI IDEs → points to AGENTS.md              |
| README.md                         | Project overview, stack, live inventory table                    |
| roadmap.md                        | Feature completion status + verification run                     |
| CONVEX_PLAN.md                    | Original Convex migration plan from Supabase                     |
| MOBILE_TASKS.md                   | Mobile audit tasks and device testing checklist                  |
| convex/inventory_import.ts        | Canonical source of all real product data                        |
| **docs/**                         |                                                                  |
| docs/TEST-ACCOUNTS.md             | Staff/admin credentials, password recovery                       |
| docs/PRODUCTION-CREDENTIALS.md    | Production account passwords + role matrix                       |
| docs/PROGRESS.md                  | Chronological change log (newest at top)                         |
| docs/EMAIL.md                     | Email system full guide (templates, config, transport)           |
| docs/EMAIL-SETUP-STATUS.md        | Email configuration verification status                          |
| docs/PRODUCTION-CONFIG.md         | Deployment configuration reference                               |
| docs/DOMAIN-MIGRATION.md          | Domain cutover runbook (mbventuresgh.com, new Hostinger account) |
| docs/INVENTORY-AUDIT.md           | Full product specs and original inventory doc                    |
| docs/INVENTORY-DECISIONS.md       | Design decisions log (D1–D9)                                     |
| docs/PRODUCT-VARIANTS.md          | Options (colour/size/type): data model, stock, UI                |
| docs/USER-MANAGEMENT.md           | User and role management reference                               |
| docs/BACKEND-STATUS.md            | Backend health and migration status                              |
| docs/HOSTINGER-SETUP-CHECKLIST.md | VPS setup steps for the new Hostinger account                    |
| docs/SETUP-COMPLETE.md            | Initial setup completion record                                  |
| **Root deploy docs** (reference)  |                                                                  |
| DEPLOYMENT-READY.md               | Deployment readiness checklist                                   |
| DEPLOYMENT-SUMMARY.md             | Deployment procedure summary                                     |
| HOSTINGER-DEPLOYMENT.md           | Detailed Hostinger VPS deployment guide                          |
| HOSTINGER-DEPLOY-COMMANDS.md      | Quick-reference deploy commands                                  |
| GITHUB-AUTO-DEPLOY.md             | GitHub Actions auto-deploy setup                                 |
| PRODUCTION-ENV-SETUP.md           | Production environment variable setup                            |
| QUICK-START.md                    | Quick start for new developers                                   |

---

## 15. Test files

| File                               | Coverage                                       |
| ---------------------------------- | ---------------------------------------------- |
| gallery.test.ts                    | buildGallery ordering, variant photo, dedupe   |
| convex-mutations.test.ts           | orders.place, checkout, cart rollback          |
| convex-staff-mutations.test.ts     | Staff order updates, payment, cancellation     |
| stock-single-writer.test.ts        | applyStockChange invariant enforcement         |
| inventory-reverse.test.ts          | Movement reversal logic                        |
| order-rules.test.ts                | Fee calculation, status transitions            |
| delivery-and-contact-rules.test.ts | Phone normalisation, fee display, WhatsApp     |
| permissions.test.ts                | Role defaults, per-user overrides              |
| variants.test.ts                   | Key building, axis derivation, colour swatches |
| home-content-settings.test.ts      | Homepage content CRUD                          |
| stats-trends.test.ts               | Dashboard analytics queries                    |
| email-config.test.ts               | Email configuration validation                 |
| email-pipeline.test.ts             | Queue → send → log pipeline                    |
| email-templates.test.ts            | Template rendering + HTML escaping             |
| email-transport.test.ts            | Web3Forms transport + retry behaviour          |
| app-routing.test.tsx               | Route existence + redirects                    |
