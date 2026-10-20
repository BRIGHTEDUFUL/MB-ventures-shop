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
8. **Errors** — user-facing Convex errors must throw `ConvexError({ message })`. Typed errors use `fail()` from `convex/lib/errors.ts`.
9. **Permissions** — every staff mutation must call `requirePermission(ctx, "key")` from `convex/lib/permissions.ts`, not raw `requireStaff`/`requireAdmin`. The closed set of permission keys lives in `convex/schema.ts → PERMISSION_KEYS`.
10. **Variants** — `variantKey()` output in `convex/lib/variants.ts` must never change format. Old orders reference those keys.
11. **Payment method** — derived server-side from fulfilment (`pickup → pay_at_store`, `delivery → cod`). No in-app payment inputs.

## Quality gates (must all pass before any deploy)

```sh
npx tsc --noEmit
npm run lint
npm test                  # 216/216 across 15 files
npx prettier --check .
npm run build
npm run test:e2e          # 32/32 Playwright checks
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

- Site: https://mbventuresgh.com
- Convex prod: earnest-fennec-109
- Ordering: ENABLED
- Real products: 11 (see AGENTS.md §8)
- Hero image key: `hero-workspace` → `public/images/hero-workspace.webp`
- Database tables: 14 (see AGENTS.md §5)

## Key modules

| Module                     | Purpose                                              |
| -------------------------- | ---------------------------------------------------- |
| `convex/lib/stock.ts`      | `applyStockChange` — single stock choke point        |
| `convex/lib/permissions.ts`| `requirePermission` — fine-grained action gates      |
| `convex/lib/rules.ts`      | Pure business rules (fees, validation, phone)        |
| `convex/lib/variants.ts`   | Variant key building, axes, colour swatches          |
| `convex/lib/dto.ts`        | All public DTOs (Product, Order, Receipt, …)         |
| `convex/lib/errors.ts`     | `fail()`, `readError()`, typed ErrorCode             |
| `convex/lib/settings.ts`   | `getSettings()` — singleton store_settings           |
| `convex/lib/activity.ts`   | `logActivity()` — staff activity feed                |
| `convex/emails/`           | Full email pipeline (queue, transport, templates)    |
| `src/lib/store-images.ts`  | Image key → URL resolution + intrinsic sizes         |
| `src/lib/store.ts`         | Client utilities (money, pageHead, delivery, …)      |
