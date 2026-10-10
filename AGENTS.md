# MB Ventures GH — Agent & AI IDE Reference

This file is the single source of truth for any AI IDE, agent, or collaborator
working in this repository. Read it in full before touching `convex/` or any route file.

---

## 1. Project overview

**MB Ventures GH** is a live e-commerce storefront at `https://mbventuresghana.com`
selling workspace and computer accessories (desks, gaming gear, mounts, audio equipment)
from the Abelenkpe taxi rank shop in Accra, Ghana.

- **Ordering is LIVE.** 11 real products are in the database with real stock (10 units each).
- **Demo products** (10) are hidden (`visible: false, status: "draft"`) but preserved — never delete them.
- **Currency:** Ghana cedis (GH₵).

---

## 2. Tech stack

| Layer       | Choice                                                               |
| ----------- | -------------------------------------------------------------------- |
| Framework   | TanStack Start (file routes, SSR) · React 19 · Vite                  |
| Styling     | Tailwind CSS v4 · shadcn/ui · Archivo / Public Sans / IBM Plex Mono  |
| Backend     | Convex (`convex/`) — schema, queries, mutations, scheduled functions |
| Auth        | Convex Auth · email + password only · no OAuth · no email verify     |
| Client data | TanStack Query via `@convex-dev/react-query`                         |
| Email       | Web3Forms — dry-run until `WEB3FORMS_ACCESS_KEY` is set              |
| Tests       | Vitest (179 tests) + Playwright (32 e2e checks)                      |
| CI/CD       | GitHub Actions → Hostinger VPS (Node/PM2)                            |

---

## 3. Repository layout (key paths)

```
convex/
  schema.ts               Single source of truth for all table schemas
  inventory_import.ts     Idempotent real-product migration — safe to re-run
  lib/
    stock.ts              applyStockChange — THE only way to mutate stock
    auth.ts               requireStaff / requireAdmin guards
    dto.ts                productDTO, categoryDTO, settingsDTO, orderDTO
    rules.ts              Pure business rules shared by mutations and UI
  orders.ts               orders.place, orders.staffUpdate, orders.track
  catalogue.ts            catalogue.saveSettings, saveDeliverySettings
  users.ts                users.me, users.grantStaff
  seed.ts                 seed:seed, seed:syncLocation

src/
  routes/
    index.tsx             Homepage — hero, hotspots, featured rail
    catalogue.tsx         Product listing with filters
    product.$slug.tsx     Product detail page
    checkout.tsx          2-step checkout (details → review & place)
    staff.tsx             Staff hub (orders, inventory, team, customization)
  lib/
    store-images.ts       Image key → URL mapping + intrinsic sizes
    store.ts              storeQuery, money(), pageHead(), delivery()
    use-session.ts        Session hook
  components/
    store-provider.tsx    Root cart provider (CartContext)
    store-ui.tsx          ProductCard, PageError, SectionHeading, Quantity

public/images/
  hero-workspace.jpg      Hero background — cinematic workspace from real products (1376x768)
  products/               Real product photos (PNG, named by product slug)
    carbon-fiber-gaming-desk.png
    electric-standing-desk-rgb-160.png
    luminous-rgb-mouse-pad.png
    custom-macro-mechanical-keyboard.png
    custom-macro-mechanical-keyboard-gallery.png
    dual-monitor-desk-mount.png
    360-rotating-laptop-stand.png
    rock-360-phone-tablet-stand.png
    vertical-laptop-stand.png
    monitor-light-bar.png
    mottian-ai-smart-keyboard-mouse.png
    rgb-dynamic-usb-microphone.png
```

---

## 4. Architecture invariants — NEVER break these

### 4a. Stock: applyStockChange is the only door

All stock mutations (set, adjust, reserve, release) **must** route through
`applyStockChange` in `convex/lib/stock.ts`. It enforces optimistic locking via
`products.version` and writes to `stock_movements`.
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

### 4d. Auth roles

| Role     | Access                                          |
| -------- | ----------------------------------------------- |
| customer | Browse, cart, checkout, account, order tracking |
| staff    | + orders, inventory, catalogue editing          |
| admin    | + team management                               |

Role rows live in `user_roles`. Guards: `lib/auth.requireStaff` / `requireAdmin`.
All user-facing errors must throw `ConvexError({ message })`.

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

---

## 5. Deployments

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

Automatic — GitHub Actions (`.github/workflows/deploy-hostinger.yml`) on every push to `main`.

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

## 6. Quality gates — must all pass before any deploy

```sh
npx tsc --noEmit          # 0 errors
npm run lint              # 0 errors (7 pre-existing react-refresh warnings are OK)
npm test                  # 179/179
npx prettier --check .    # clean
npm run build             # succeeds
npm run test:e2e          # 32/32 Playwright checks
```

Optional (places a real order in dev — opt-in only):

```sh
npm run test:e2e:live
```

---

## 7. Live store state (as of 9 Oct 2026)

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
- hero_image: "hero-workspace" (public/images/hero-workspace.jpg — 1376x768)
- hero_title: "Your workspace. Elevated."
- Featured hotspots: electric-standing-desk-rgb-160, 360-rotating-laptop-stand, custom-macro-mechanical-keyboard
- Payments: no in-app payment — pickup pays at the shop counter, delivery pays cash on
  arrival; staff mark payment received in /staff (legacy MoMo recipient fields are kept
  in the row for old orders but no UI or mutation touches them)

---

## 8. Staff / admin accounts (production)

| Email                         | Role  | Purpose                          |
| ----------------------------- | ----- | -------------------------------- |
| manager@mbventuresghana.com   | admin | Full back-office, team, settings |
| admin@mbventuresghana.com     | admin | Full admin                       |
| attendant@mbventuresghana.com | staff | Orders and inventory             |
| staff@mbventuresghana.com     | staff | Orders and products              |

Full credentials and recovery steps: `docs/TEST-ACCOUNTS.md`.
Sign in at `/account`. Staff/admin see a "Store staff hub" button to `/staff`.

---

## 9. Environment files

| File             | Purpose                                   | In git?         |
| ---------------- | ----------------------------------------- | --------------- |
| .env             | Shared VITE_CONVEX_URL (production)       | Yes             |
| .env.development | VITE_SITE_URL=http://localhost:5173       | Yes             |
| .env.production  | VITE_SITE_URL=https://mbventuresghana.com | Yes             |
| .env.local       | Dev CONVEX_DEPLOYMENT + secrets           | No (gitignored) |
| .env.prod.local  | CONVEX_DEPLOY_KEY                         | No (gitignored) |
| .env.example     | Full variable template                    | Yes             |

Never commit .env.local or .env.prod.local.
Never log CONVEX_DEPLOY_KEY, JWT_PRIVATE_KEY, or JWKS.

---

## 10. Common tasks

### Add a new product

1. Add image to `public/images/products/<slug>.png`
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

### Verify a production password

```powershell
npx convex run auth:signIn '{\"provider\":\"password\",\"params\":{\"flow\":\"signIn\",\"email\":\"admin@mbventuresghana.com\",\"password\":\"...\"}}' --env-file .env.prod.local
```

---

## 11. Things that must NOT happen

- Do NOT bypass applyStockChange — never patch products.stock directly
- Do NOT delete demo products — they are preserved intentionally
- Do NOT add OAuth, social login or email verification to signup
- Do NOT reintroduce in-app payment inputs (MoMo references, provider pickers) — payment
  is always collected offline and `payment_method` is derived from fulfilment in `orders.place`
- Do NOT use Resend or SendGrid — email transport is Web3Forms only
- Do NOT push CONVEX_DEPLOY_KEY, JWT_PRIVATE_KEY or JWKS to git
- Do NOT invent product slugs or prices — use only convex/inventory_import.ts
- Do NOT show products with verified: false as confirmed stock

---

## 12. Windows PowerShell specifics

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

---

## 13. Docs map

| File                       | Contents                                       |
| -------------------------- | ---------------------------------------------- |
| AGENTS.md (this file)      | Architecture, invariants, workflow, full state |
| README.md                  | Project overview, stack, live inventory table  |
| docs/TEST-ACCOUNTS.md      | Staff/admin credentials, password recovery     |
| docs/PROGRESS.md           | Chronological change log                       |
| docs/EMAIL.md              | Email system full guide                        |
| docs/PRODUCTION-CONFIG.md  | Deployment configuration reference             |
| docs/INVENTORY-AUDIT.md    | Full product specs and original inventory doc  |
| roadmap.md                 | Feature completion status                      |
| convex/inventory_import.ts | Canonical source of all real product data      |
