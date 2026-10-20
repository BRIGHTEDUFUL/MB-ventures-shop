# MB Ventures GH — Claude / Cursor / Copilot Context

> **Read `AGENTS.md` first.** This file is a short alias that points every AI
> IDE to the authoritative reference.

## Quick orientation

- **Live store:** https://mbventuresgh.com — ordering is enabled, real products in stock
- **Backend:** Convex (`convex/`) — `prod:earnest-fennec-109`
- **Frontend:** TanStack Start SSR → Hostinger managed Node.js hosting (deploy via `scripts/deploy-hostinger-api.mjs`; the GitHub Actions deploy step is not configured)
- **Auth:** Email + password only (Convex Auth). No OAuth.
- **Email:** Web3Forms. No Resend.
- **Tests:** Vitest + Playwright suites — current counts in `AGENTS.md` §7

## The rules to remember

> 1. All stock changes go through `applyStockChange` in `convex/lib/stock.ts`.
> 2. All staff function access goes through `requirePermission` in `convex/lib/permissions.ts`.
> 3. Variant key format (`variantKey()` in `convex/lib/variants.ts`) must never change.
> 4. Everything else follows from `AGENTS.md`.

## Before you start any task

1. Read `AGENTS.md` — architecture, invariants, inventory state, deployment workflow
2. Run `npm run dev` to spin up local dev
3. Check `docs/TEST-ACCOUNTS.md` if you need staff/admin access

## Before you finish any task

```sh
npx tsc --noEmit; npm run lint; npm test; npm run build
```

All must pass. Then commit. Pushing does **not** deploy the frontend — the
GitHub Actions Hostinger secrets are not configured; run
`node scripts/pack-deploy.mjs` then `node scripts/deploy-hostinger-api.mjs`.

## Windows PowerShell

- Use `;` not `&&` to chain commands
- Escape JSON args: `'{\"email\":\"x@y.com\"}'` not `'{"email":"x@y.com"}'`
