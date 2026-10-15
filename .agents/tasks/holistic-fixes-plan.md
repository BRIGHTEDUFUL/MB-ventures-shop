# Implementation Plan — Holistic Storefront Cosmetic Fixes

**Based on:** `.agents/tasks/holistic-audit-2026-10-15.md`
**Files touched:** `src/components/order-receipt.tsx`, `src/routes/index.tsx`, `src/routes/account.tsx`
**Tests to run:** `npm test` (216 tests) + `npx tsc --noEmit`

---

- [ ] 1. **Fix 1 — Show variant label per line item on the receipt**
  
  In `src/components/order-receipt.tsx`, the `items` cast at line 7 strips `variant_name`:
  ```tsx
  // BEFORE (line 7-9)
  const items = Array.isArray(o.items)
    ? (o.items as { name: string; quantity: number; price: number }[])
    : [];
  ```
  The `OrderItem` type in `convex/lib/dto.ts` (lines 113–124) already declares
  `variant_name?: string`. The `Receipt` type includes `items: OrderItem[]`.
  
  **Change A — widen the cast** (line 8): add `variant_name?: string` to the cast type:
  ```tsx
  // AFTER
  const items = Array.isArray(o.items)
    ? (o.items as { name: string; quantity: number; price: number; variant_name?: string }[])
    : [];
  ```
  
  **Change B — render the variant label** in the `<tbody>` row (currently at line 55–58):
  ```tsx
  // BEFORE
  <tr key={i}>
    <td>{l.name}</td>
    <td>{l.quantity}</td>
    <td>{money(l.price * l.quantity, true)}</td>
  </tr>
  ```
  ```tsx
  // AFTER
  <tr key={i}>
    <td>
      {l.name}
      {l.variant_name && (
        <span className="block text-xs text-muted-foreground">{l.variant_name}</span>
      )}
    </td>
    <td>{l.quantity}</td>
    <td>{money(l.price * l.quantity, true)}</td>
  </tr>
  ```
  
  **Files:** `src/components/order-receipt.tsx`
  
  **Verify:**
  ```sh
  npx tsc --noEmit
  npm test
  ```
  TypeScript must report 0 errors. The `email-templates.test.ts` and `convex-mutations.test.ts` tests must continue to pass.

---

- [ ] 2. **Fix 2 — Hero product card price not green**
  
  In `src/routes/index.tsx`, at approximately line 145, inside the `{featured && ...}` block,
  locate the `<p>` that renders the featured product price:
  ```tsx
  // BEFORE (line ~145)
  <p className="mt-1 text-sm font-semibold">{money(featured.price)}</p>
  ```
  Add `style={{ color: "var(--price-ink)" }}` to match every other price surface in the store:
  ```tsx
  // AFTER
  <p className="mt-1 text-sm font-semibold" style={{ color: "var(--price-ink)" }}>{money(featured.price)}</p>
  ```
  
  Context: this `<p>` is inside the `<div className="hero-product glass">` card, inside the
  `<div className="min-w-0">` that also holds the product name `<h2>`.
  Do not touch the `!featured.verified` sample-item warning below it, or anything else in the hero.
  
  **Files:** `src/routes/index.tsx`
  
  **Verify:**
  ```sh
  npx tsc --noEmit
  npm test
  ```
  0 TypeScript errors. All 216 tests pass.

---

- [ ] 3. **Fix 3 — Setup section prices not green**
  
  In `src/routes/index.tsx`, inside the `<section className="section setup-section">` block,
  there is a `.map()` over `rail.slice(0, 3)` that produces a `<Button variant="ghost">` for
  each product (at approximately lines 237–246):
  ```tsx
  // BEFORE (line ~242)
  <Button
    variant="ghost"
    aria-label={`Add ${p.name} to setup`}
    onClick={() => add(p)}
    className="h-11 gap-3 px-3 text-xs"
  >
    {money(p.price)} <Plus className="size-3" />
  </Button>
  ```
  Wrap the `{money(p.price)}` text in a `<span>` with `style={{ color: "var(--price-ink)" }}`:
  ```tsx
  // AFTER
  <Button
    variant="ghost"
    aria-label={`Add ${p.name} to setup`}
    onClick={() => add(p)}
    className="h-11 gap-3 px-3 text-xs"
  >
    <span style={{ color: "var(--price-ink)" }}>{money(p.price)}</span> <Plus className="size-3" />
  </Button>
  ```
  
  Note: the `{money(p.price)}` expression renders as a raw text node directly inside
  the `<Button>` JSX alongside the `<Plus>` icon. Wrapping the text node in a `<span>`
  is the correct approach since inline styles cannot target bare text nodes.
  
  **Files:** `src/routes/index.tsx`
  
  **Verify:**
  ```sh
  npx tsc --noEmit
  npm test
  ```
  0 TypeScript errors. All 216 tests pass.

---

- [ ] 4. **Fix 4 — Account order history shows no item detail**
  
  In `src/routes/account.tsx`, the order history `<ul className="auth-orders">` renders
  each order as a `<li>` (approximately lines 288–301):
  ```tsx
  // BEFORE
  {orders.data.map((o) => (
    <li key={o.id}>
      <span className="font-mono text-sm">{o.reference}</span>
      <span className="text-sm capitalize">
        {o.status} · Payment {o.payment_status}
      </span>
      <span className="font-mono font-semibold tabular-nums">{money(o.total)}</span>
      <Link className="text-sm underline" to="/track">
        View with phone number
      </Link>
    </li>
  ))}
  ```
  
  After the status `<span>`, add a brief items summary using the `items` array already present on the `Order` type (which `orders.mine` returns via `orderDTO`). The first item's name is
  truncated at 40 characters; if there are 2+ items, append `+ N more`:
  ```tsx
  // AFTER
  {orders.data.map((o) => (
    <li key={o.id}>
      <span className="font-mono text-sm">{o.reference}</span>
      <span className="text-sm capitalize">
        {o.status} · Payment {o.payment_status}
      </span>
      {o.items.length > 0 && (
        <span className="text-sm text-muted-foreground">
          {o.items[0].name.length > 40
            ? o.items[0].name.slice(0, 40) + "…"
            : o.items[0].name}
          {o.items.length > 1 ? ` + ${o.items.length - 1} more` : ""}
        </span>
      )}
      <span className="font-mono font-semibold tabular-nums">{money(o.total)}</span>
      <Link className="text-sm underline" to="/track">
        View with phone number
      </Link>
    </li>
  ))}
  ```
  
  The `Order` type (from `convex/lib/dto.ts`, re-exported via `src/lib/store.ts`) includes
  `items: OrderItem[]`, and `orders.mine` already populates this field through `orderDTO()`.
  No backend change is needed — the data is already returned.
  
  **Files:** `src/routes/account.tsx`
  
  **Verify:**
  ```sh
  npx tsc --noEmit
  npm test
  ```
  0 TypeScript errors. All 216 tests pass.

---

## Final verification pass

After all 4 fixes are applied:

```sh
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Expected outcomes:
- `tsc`: 0 errors
- `lint`: 0 errors (7 pre-existing react-refresh warnings are acceptable)
- `npm test`: 216/216 tests passing across 15 files
- `npm run build`: succeeds with no errors

## Invariants confirmed

- Staff/admin UI is untouched.
- `variantKey()` is untouched.
- No `text-red-*` classes are introduced; prices use `--price-ink` (green CSS variable).
- Demo products are not touched.
- Backend `orders.mine` already returns `items` with `variant_name`; no Convex mutation needed.
- Receipt layout and print styling are unchanged; the variant label is a new `<span>` inside the existing `<td>`, which prints correctly inline.
