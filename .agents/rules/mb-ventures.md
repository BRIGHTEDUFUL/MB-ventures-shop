# MB Ventures GH — AI Rules

> Read `AGENTS.md` in the project root for the full reference.
> This file lists the hard rules every AI session must follow.

## Hard constraints

1. **Stock** — always use `applyStockChange` in `convex/lib/stock.ts`. Never patch `products.stock` directly.
2. **Prices** — server is authoritative. `orders.place` recomputes totals; the browser is an estimate.
3. **Demo products** — `standing-desk`, `gaming-desk`, `ergonomic-chair`, `office-chair`, `mechanical-keyboard`, `wireless-mouse`, `monitor-arm`, `laptop-stand`, `usb-microphone`, `stream-controller` are hidden (`visible: false`) but must never be deleted.
4. **Auth** — email + password only. No OAuth. No email verification. Do not add either.
5. **Email transport** — Web3Forms only (`WEB3FORMS_ACCESS_KEY`). Do not add Resend or SendGrid.
6. **Image keys** — register every image in `src/lib/store-images.ts` (base map + sizes map). Never hardcode a path in JSX.
7. **Secrets** — never commit `.env.local`, `.env.prod.local`, `CONVEX_DEPLOY_KEY`, `JWT_PRIVATE_KEY`, or `JWKS`.
8. **Errors** — user-facing Convex errors must throw `ConvexError({ message })`.

## Quality gates (must all pass before any deploy)

```sh
npx tsc --noEmit
npm run lint
npm test
npx prettier --check .
npm run build
npm run test:e2e
```

## Deployment flow

```sh
# 1. Backend
npx convex deploy --env-file .env.prod.local

# 2. Frontend (also auto-deploys via GitHub Actions on git push)
git add -A; git push origin main
```

## Windows PowerShell rules

- Use `;` not `&&` to chain commands
- Escape JSON args: `'{\"email\":\"x@y.com\"}'` not `'{"email":"x@y.com"}'`

## Live store facts

- Site: https://mbventuresghana.com
- Convex prod: necessary-newt-861
- Ordering: ENABLED
- Real products: 11 (see AGENTS.md §7)
- Hero image key: `hero-workspace` → `public/images/hero-workspace.jpg`
