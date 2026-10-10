# MB Ventures GH — Online Storefront

Live storefront for **MB Ventures GH** — a workspace and computer accessories shop at Abelenkpe taxi
rank, Accra. Shoppers browse desks, gaming gear, accessories, mounts and streaming equipment in
Ghana cedis, and order for delivery across Ghana or collection from the Abelenkpe shop.

🌐 **Live at:** [`https://mbventuresghana.com`](https://mbventuresghana.com)

## Current status

**Ordering is LIVE.** Real inventory is stocked and customers can place orders now.

- 11 real products live with actual photos
- 10 demo products hidden from the storefront (kept as drafts)
- Hero background is a cinematic workspace scene built from real product photos
- Staff/admin accounts provisioned and verified on production

## Payments and fulfilment

No payment is taken online — money always changes hands in person:

1. **Pay at the shop** — pickup orders from the Abelenkpe taxi rank shop are paid at the
   counter (cash or Mobile Money in person) when the order is collected.
2. **Cash on delivery** — delivery orders pay the courier in cash when the order arrives.

The payment method is derived server-side from the fulfilment choice. Staff record receipt in
`/staff`; completing an order requires the payment to be marked as received. Three delivery
zones are available (Accra Central, Greater Accra, Nationwide) alongside in-store pickup.

## Stack

| Layer       | Choice                                                               |
| ----------- | -------------------------------------------------------------------- |
| Framework   | TanStack Start (file routes, SSR) on React 19 + Vite                 |
| Styling     | Tailwind CSS v4, shadcn/ui, Archivo / Public Sans / IBM Plex Mono    |
| Data        | Convex — schema, queries/mutations, file storage                     |
| Auth        | Convex Auth, email + password only (no OAuth, no email verification) |
| Client data | TanStack Query via `@convex-dev/react-query`                         |
| Tests       | Vitest + Testing Library + Playwright                                |
| Hosting     | Hostinger VPS (Node/PM2) + GitHub Actions CI/CD                      |

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
npm test          # vitest (179 tests)
npm run format    # prettier
npm run test:e2e  # Playwright — 32 checks (head, outline, mobile overflow matrix)
```

Environment variables are documented in `.env.example` — copy it to `.env.local`
(gitignored) and fill in what you need. Email runs in **dry-run** until
`WEB3FORMS_ACCESS_KEY` is set; see `docs/EMAIL.md`.

## Architecture notes

- **Server is authoritative.** Prices, stock, delivery fees and order totals are recomputed inside
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

- **Dev:** `npm run dev` targets dev deployment `dev:stoic-elephant-714` (configured in `.env.local`).
- **Prod Convex:** `npx convex deploy --env-file .env.prod.local` targets `prod:necessary-newt-861`.
- **Prod Frontend:** GitHub Actions (`deploy-hostinger.yml`) builds and deploys to Hostinger VPS on every push to `main`.
- **Inventory migration:** `npx convex run inventory_import:apply --env-file .env.prod.local` (idempotent — safe to re-run).

See `AGENTS.md` for seed and staff-grant commands, and `docs/TEST-ACCOUNTS.md`
for the staff/admin test sign-ins.

## Live inventory

11 real products, 10 units each, prices in Ghana cedis (GH₵):

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
