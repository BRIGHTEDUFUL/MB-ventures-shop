# MB Ventures GH — Online Storefront

Live storefront for **MB Ventures GH** — a workspace and computer accessories shop at Abelenkpe taxi
rank, Accra. Shoppers browse desks, gaming gear, accessories, mounts and streaming equipment in
Ghana cedis, and order for delivery across Ghana or collection from the Abelenkpe shop.

🌐 **Live at:** [`https://mbventuresgh.com`](https://mbventuresgh.com)

## Current status

**Ordering is LIVE.** Real inventory is stocked and customers can place orders now.

- Production carries a ~79-product supplier catalogue with real photos in Convex storage
- 10 demo products hidden from the storefront (kept as drafts)
- Hero background is a cinematic workspace scene built from real product photos
- Staff/admin accounts provisioned and verified on production

## Payments and fulfilment

Two ways to settle offline, both chosen at checkout:

1. **Pay at the shop** — pickup orders are paid at the counter (cash or Mobile Money in
   person) when the order is collected.
2. **Cash on delivery** — delivery orders pay the rider in cash when the order arrives.

**Online payment (Paystack) is live as an opt-in**: when the staff switch is on, checkout
offers "Pay online now" and a charge confirms the order only after Paystack's signed
confirmation. Nationwide delivery is prepay-only. The shop never adds a delivery fee —
riders collect theirs from the customer directly. Staff record offline receipt in `/staff`;
completing an order requires the payment to be marked as received. Full flow:
`docs/PAYMENTS-PAYSTACK.md`.

Delivery zones are recorded on orders (Accra Central, Greater Accra, Nationwide) alongside
in-store pickup; they no longer carry a shop-side fee.

## Stack

| Layer       | Choice                                                                              |
| ----------- | ----------------------------------------------------------------------------------- |
| Framework   | TanStack Start (file routes, SSR) on React 19 + Vite                                |
| Styling     | Tailwind CSS v4, shadcn/ui, Archivo / Public Sans / IBM Plex Mono                   |
| Data        | Convex — schema, queries/mutations, file storage                                    |
| Auth        | Convex Auth, email + password only (no OAuth, no email verification)                |
| Client data | TanStack Query via `@convex-dev/react-query`                                        |
| Tests       | Vitest + Testing Library + Playwright                                               |
| Hosting     | Hostinger managed Node.js hosting (deployed via `scripts/deploy-hostinger-api.mjs`) |

## Development

Requires Node.js and npm ([install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)).

```sh
npm i
npm run dev      # vite dev + convex dev together
```

Other commands:

```sh
npm run build    # production build
npm start         # run the built server
npm run lint      # eslint
npm test          # vitest — unit + convex integration tests
npm run format    # prettier
npm run test:e2e  # Playwright read-only suite (boots its own dev server)
```

Environment variables are documented in `.env.example` — copy it to `.env.local`
(gitignored) and fill in what you need. Email runs in **dry-run** until
`WEB3FORMS_ACCESS_KEY` is set; it is already set on the shared dev and prod
Convex deployments (key `ab22e273-…`, forwarding to `info@mbventuresgh.com`),
so a fresh local `.env.local` without it simply keeps email in dry-run. See
`docs/EMAIL.md`.

## Architecture notes

- **Server is authoritative.** Prices, stock and order totals are recomputed inside
  Convex mutations; anything the browser shows is an estimate until the order is placed. The
  payment method (`pay_at_store` for pickup, `cod` for delivery) is derived the same way.
- Business rules live in `convex/lib/rules.ts` as pure functions shared by the mutations and the UI,
  and are covered by `src/test/*.test.ts`.
- **Browsing needs no account.** Placing an order does: signed-out shoppers are sent to
  `/account?next=/checkout` and the cart stays in `localStorage`.
- **Guest tracking** uses an unguessable receipt reference plus the order phone number — no login.
- **Product visibility** is controlled by `visible` field in the `products` table. Demo products are
  hidden (`visible: false, status: "draft"`) but preserved in the database.
- **Stock management** routes through `convex/lib/stock.ts → applyStockChange`. Never bypass it.
- Hero background at `public/images/hero-workspace.webp` is a generated workspace scene using real
  product photography.

Read `AGENTS.md` for the full set of invariants before changing anything in `convex/`.

## Deployments

- **Dev:** `npm run dev` targets dev deployment `dev:wonderful-porpoise-243` (configured in `.env.local`).
- **Prod Convex:** `npx convex deploy --env-file .env.prod.local` targets `prod:earnest-fennec-109`.
- **Prod Frontend:** `node scripts/pack-deploy.mjs` then `node scripts/deploy-hostinger-api.mjs`
  (Hostinger API: upload → server-side build → publish). The script sends the Nitro build
  settings explicitly and fails the deploy if the live CSS/JS does not answer 200. The GitHub
  Actions deploy step skips — its `HOSTINGER_*` secrets are not configured.
- **Product photos** live in Convex storage and are optimised (217 files, ~24 MB total, ~114 KB
  average). Re-encode with `node scripts/optimize-product-images.mjs` (`--apply`, then
  `--delete-old`); see AGENTS.md §8.
- **Dev fixture catalogue:** `npx convex run inventory_import:apply` — **dev only**. Production
  carries the ~79-product supplier catalogue; never re-apply the fixture there.

See `AGENTS.md` for seed and staff-grant commands, and `docs/TEST-ACCOUNTS.md`
for the staff/admin test sign-ins.

## Live inventory

The original 11-product fixture catalogue (dev seed — production now carries the
supplier catalogue; see AGENTS.md §8), 10 units each, prices in Ghana cedis (GH₵):

| Product                                                   | Price  |
| --------------------------------------------------------- | ------ |
| Black Carbon Fiber Gaming Desk (140×60cm)                 | ₵1,450 |
| Solid Wood Electric Height-Adjustable Desk RGB (160×60cm) | ₵2,800 |
| Luminous RGB Oversized Mouse Pad (900×400mm)              | ₵210   |
| Custom Macro Mechanical Keyboard w/ LCD Display           | ₵1,500 |
| Mottian AI Smart Wireless Keyboard & Mouse                | ₵1,000 |
| Dual Monitor Desk Mount (14–30 inch)                      | ₵1,120 |
| 360° Rotating Aluminum Laptop Stand                       | ₵230   |
| Vertical Laptop Stand Storage Base                        | ₵240   |
| Rock 360° Foldable Phone & Tablet Stand                   | ₵100   |
| Monitor Light Bar Screen Lamp                             | ₵450   |
| Professional RGB Dynamic USB Microphone                   | ₵2,000 |

See `docs/PROGRESS.md` for full change history, `docs/TEST-ACCOUNTS.md` for staff credentials,
and `docs/PRODUCTION-CONFIG.md` for deployment details.
