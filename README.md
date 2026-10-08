# Circle Shop Express

Storefront for **MB Ventures GH** — a workspace and computer accessories shop at Circle, Accra.
Shoppers browse desks, office chairs, accessories, mounts and streaming gear in Ghana cedis, and
order for delivery across Ghana or collection from the Circle shop.

## Payments and fulfilment

Two payment methods only — there is no pay-at-counter option:

1. **Mobile Money** (MTN MoMo, Telecel Cash, AirtelTigo Money). The shopper submits a transaction
   reference, which staff verify manually before the order advances.
2. **Cash on Delivery** when the courier arrives.

**In-store pickup** at the Circle shop is available as a fulfilment option alongside the three
delivery zones (Accra Central, Greater Accra, Nationwide).

## Stack

| Layer | Choice |
| --- | --- |
| Framework | TanStack Start (file routes, SSR) on React 19 + Vite |
| Styling | Tailwind CSS v4, shadcn/ui, Archivo / Public Sans / IBM Plex Mono |
| Data | Convex — schema, queries/mutations, file storage |
| Auth | Convex Auth, email + password only (no OAuth, no email verification) |
| Client data | TanStack Query via `@convex-dev/react-query` |
| Tests | Vitest + Testing Library |

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

See `AGENTS.md` for seed and staff-grant commands.

## Status

`roadmap.md` tracks what is verified and what is outstanding, including the last verification run.
`CONVEX_PLAN.md` records the Supabase → Convex migration.
