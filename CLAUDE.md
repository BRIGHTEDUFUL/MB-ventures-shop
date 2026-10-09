# MB Ventures GH — Claude / Cursor / Copilot Context

> **Read `AGENTS.md` first.** This file is a short alias that points every AI
> IDE to the authoritative reference.

## Quick orientation

- **Live store:** https://mbventuresghana.com — ordering is enabled, real products in stock
- **Backend:** Convex (`convex/`) — `prod:necessary-newt-861`
- **Frontend:** TanStack Start SSR → Hostinger VPS via GitHub Actions
- **Auth:** Email + password only (Convex Auth). No OAuth.
- **Email:** Web3Forms. No Resend.

## The one rule to remember

> All stock changes go through `applyStockChange` in `convex/lib/stock.ts`.
> Everything else follows from `AGENTS.md`.

## Before you start any task

1. Read `AGENTS.md` — architecture, invariants, inventory state, deployment workflow
2. Run `npm run dev` to spin up local dev
3. Check `docs/TEST-ACCOUNTS.md` if you need staff/admin access

## Before you finish any task

```sh
npx tsc --noEmit && npm run lint && npm test && npm run build
```

All must pass. Then push — GitHub Actions handles the rest.
