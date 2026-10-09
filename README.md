# Circle Shop Express

Storefront for **MB Ventures GH** — a workspace and computer accessories shop at Abelenkpe taxi
rank, Accra.
Shoppers browse desks, office chairs, accessories, mounts and streaming gear in Ghana cedis, and
order for delivery across Ghana or collection from the Abelenkpe shop.

## Payments and fulfilment

Two payment methods only — there is no pay-at-counter option:

1. **Mobile Money** (MTN MoMo, Telecel Cash, AirtelTigo Money). The shopper submits a transaction
   reference, which staff verify manually before the order advances.
2. **Cash on Delivery** when the courier arrives.

**In-store pickup** at the Abelenkpe taxi rank shop is available as a fulfilment option alongside
the three delivery zones (Accra Central, Greater Accra, Nationwide).

## Stack

| Layer       | Choice                                                               |
| ----------- | -------------------------------------------------------------------- |
| Framework   | TanStack Start (file routes, SSR) on React 19 + Vite                 |
| Styling     | Tailwind CSS v4, shadcn/ui, Archivo / Public Sans / IBM Plex Mono    |
| Data        | Convex — schema, queries/mutations, file storage                     |
| Auth        | Convex Auth, email + password only (no OAuth, no email verification) |
| Client data | TanStack Query via `@convex-dev/react-query`                         |
| Tests       | Vitest + Testing Library                                             |

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
npm test          # vitest
npm run format    # prettier
```

Environment variables are documented in `.env.example` — copy it to `.env.local`
(gitignored) and fill in what you need. Email runs in **dry-run** until
`WEB3FORMS_ACCESS_KEY` is set, so no credentials are required to develop; see
`docs/EMAIL.md`.

## Architecture notes

- **Server is authoritative.** Prices, stock, delivery fees and order totals are recomputed inside
  Convex mutations; anything the browser shows is an estimate until the order is placed.
- Business rules live in `convex/lib/rules.ts` as pure functions shared by the mutations and the UI,
  and are covered by `src/test/*.test.ts`.
- **Browsing needs no account.** Placing an order does: signed-out shoppers are sent to
  `/account?next=/checkout` and the cart stays in `localStorage`.
- **Guest tracking** uses an unguessable receipt reference plus the order phone number — no login.
- Unverified demonstration products are labelled `Sample item` and cannot be checked out.

Read `AGENTS.md` for the full set of invariants before changing anything in `convex/`.

## Deployments

- **Dev:** `npm run dev` targets the dev deployment configured in `.env.local`.
- **Prod:** `npx convex deploy` (key in `.env.prod.local`). The tracked `.env` carries the
  production `VITE_CONVEX_URL`, so production builds need no extra configuration.

See `AGENTS.md` for seed and staff-grant commands, and `docs/TEST-ACCOUNTS.md`
for the staff/admin test sign-ins.

## Status

Production-ready. Email system live with Web3Forms, domain configured (`mbventuresghana.com`),
inventory system with reservations complete. See `roadmap.md` for verification status,
`docs/PROGRESS.md` for recent work, and `docs/PRODUCTION-CONFIG.md` for deployment guide.
`CONVEX_PLAN.md` records the Supabase → Convex migration.
