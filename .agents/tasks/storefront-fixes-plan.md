# Implementation Plan — Storefront Fixes

Three independent fixes. Order: Fix 3 (price colour, CSS-only) → Fix 2 (quantity cap,
Quantity component then consumers) → Fix 1 (variant picker, state initialisation).
Each fix is fully independently verifiable before the next one starts.

---

## Fix 3 — Change price colour from amber/orange to green

### Finding

The "red" the user sees is actually `--offer-ink`, an oklch orange-amber colour
(`oklch(0.603 0.186 39)` = warm amber) used by the `.sale-price` CSS class.
Normal (non-sale) product prices inherit the dark foreground colour — they have no
explicit colour. The request is to make ALL prices green consistently.

The correct approach is:

1. Add a new `--price-ink` CSS custom property set to an accessible emerald green.
2. Apply `color: var(--price-ink)` in `.sale-price` (replacing `--offer-ink`).
3. Apply `color: var(--price-ink)` in `.product-price` (the card price wrapper).
4. Add `color: var(--price-ink)` inline via a utility class on the product detail
   page price (`<p className="mt-7 text-3xl font-semibold">`).
5. Leave `--offer-ink` alone — it is still used by the low-stock and sale badges
   (`.product-badge[data-tone="low"]` and `.product-badge[data-tone="sale"]`).
   Changing it there would break badge styling.

Do NOT touch any file under `src/routes/staff/` or `src/components/staff/`.

### Decision: use a dedicated `--price-ink` variable

Rather than hijacking `--offer-ink` (which would change badge colours too), a new
semantic variable `--price-ink` keeps price colour decoupled from offer/alert
semantics. Set to `oklch(0.45 0.13 155)` in light mode and `oklch(0.62 0.13 155)`
in dark mode — both map to emerald-green, pass AA contrast on white/dark card
backgrounds respectively.

---

- [ ] 1. Add `--price-ink` CSS custom property and apply it to price elements.

  In `src/styles.css`:

  a. In the `@theme inline` block (around line 32–36), add after `--color-offer-ink`:
     ```css
     --color-price-ink: var(--price-ink);
     ```

  b. In `:root` (light mode block, after `--offer: oklch(0.603 0.186 39);`), add:
     ```css
     --price-ink: oklch(0.45 0.13 155);
     ```

  c. Find the `.dark` block in `src/styles.css`. In the `.dark` block after
     `--offer-ink: color-mix(in oklch, var(--offer) 72%, white);`, add:
     ```css
     --price-ink: oklch(0.62 0.13 155);
     ```

  d. Change `.sale-price` (around line 1598–1600):
     ```css
     /* BEFORE */
     .sale-price {
       color: var(--offer-ink);
     }
     /* AFTER */
     .sale-price {
       color: var(--price-ink);
     }
     ```

  e. Add `color: var(--price-ink);` inside the existing `.product-price` rule (around line 597–600):
     ```css
     .product-price {
       color: var(--price-ink);   /* <-- add this line */
       margin-top: 12px;
       font-weight: 600;
       font-size: 16px;
     }
     ```

  Files: `src/styles.css`

- [ ] 2. Apply green to the product detail page price display.

  In `src/routes/product.$slug.tsx`, find the price paragraph (around line 158–162):
  ```tsx
  <p className="mt-7 text-3xl font-semibold">
    <span className={compareAt !== null ? "sale-price" : undefined}>{money(price)}</span>
  ```
  Change to:
  ```tsx
  <p className="mt-7 text-3xl font-semibold text-price-ink">
    <span className={compareAt !== null ? "sale-price" : undefined}>{money(price)}</span>
  ```

  The `text-price-ink` Tailwind class is auto-generated from the `--color-price-ink`
  entry added in step 1a above (Tailwind v4 maps `--color-*` → `text-*` utilities).

  Files: `src/routes/product.$slug.tsx`

  Verify (after step 2 is done): `npx tsc --noEmit` — 0 errors.
  Visual check: run `npm run dev`, open any product with `original_price` set and
  confirm the price renders in green rather than amber/orange.

---

## Fix 2 — Quantity selector must not exceed available stock

### Finding

`Quantity` in `src/components/store-ui.tsx` has `disabled={value >= 50}` hardcoded
with no `max` prop. The product detail page passes no stock cap to it. The cart's
`CartLines` (also in `store-ui.tsx`) likewise calls `<Quantity>` without a cap.

`store-provider.tsx` `change()` uses `Math.min(50, q)` — same hardcoded ceiling.

The fix: add an optional `max` prop to `Quantity`, default 50 (preserving existing
behaviour everywhere not updated), then wire it up at every consumption point.
The cart's `CartLines` needs live stock data to cap per-line quantities, so it
must receive the products list (currently it reads no external data — `useQuery`
is available but not used there). The simpler path: fetch products inside
`CartLines` using the already-available `storeQuery`, which is a cached query and
has zero extra network cost.

### Decision: fetch stock inside CartLines via storeQuery

`storeQuery` is already imported in `store-ui.tsx` (used by `FreeDelivery`).
`CartLines` can `useQuery(storeQuery)` and pass live stock as `max` to `Quantity`.
For the product detail page, stock is already in scope (`stock` variable). For the
cart in `store-provider`, the `change()` ceiling of 50 stays but also needs the
stock — but `change()` does not know the product's stock. The UI guard in
`CartLines` is the right place; the `change()` in the provider stays as a safety
clamp. No server mutation needs to change — `orders.place` already enforces stock
server-side.

---

- [ ] 3. Add `max` prop to the `Quantity` component in `src/components/store-ui.tsx`.

  Find the `Quantity` function signature:
  ```tsx
  export function Quantity({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  ```
  Change to:
  ```tsx
  export function Quantity({ value, onChange, max = 50 }: { value: number; onChange: (n: number) => void; max?: number }) {
  ```

  Change the `+` button's disabled prop from `disabled={value >= 50}` to `disabled={value >= max}`.

  Leave the `−` button and all other logic unchanged.

  Files: `src/components/store-ui.tsx`

- [ ] 4. Cap quantity at available stock on the product detail page.

  In `src/routes/product.$slug.tsx`, find the `<Quantity>` usage (around line 196):
  ```tsx
  <Quantity value={quantity} onChange={setQuantity} />
  ```
  Change to:
  ```tsx
  <Quantity value={quantity} onChange={setQuantity} max={stock > 0 ? stock : 1} />
  ```

  `stock` is already computed in scope (either `selectedVariant.stock` or `p.stock`).
  Using `stock > 0 ? stock : 1` prevents `max={0}` from locking the stepper at 0
  when stock is exhausted — the button disable logic (`soldOut`) already blocks the
  Add to Cart button in that case.

  Also clamp initial `quantity` when `selectedVariant` changes: after the
  `selectedVariant` derivation, add:
  ```tsx
  // Clamp quantity to available stock when variant changes
  // Use useEffect to avoid setting state during render
  ```
  Actually: simply cap the `onChange` handler inline:
  ```tsx
  <Quantity
    value={quantity}
    onChange={(n) => setQuantity(Math.min(n, stock > 0 ? stock : 1))}
    max={stock > 0 ? stock : 1}
  />
  ```
  This is enough — when the variant selection changes and stock drops below the
  current quantity, the next render will show `quantity > max` but the `+`
  button is disabled. A `useEffect` to clamp it is cleaner:

  After the existing `useState` declarations, add:
  ```tsx
  // Clamp quantity when variant stock changes
  useEffect(() => {
    if (stock > 0 && quantity > stock) setQuantity(stock);
  }, [stock]);
  ```
  Import `useEffect` — it is already imported at the top of the file (`useState` is there, check if `useEffect` is too — if not, add it to the React import).

  Files: `src/routes/product.$slug.tsx`

- [ ] 5. Cap quantity per line in CartLines and clamp with a warning when stale.

  In `src/components/store-ui.tsx`, inside the `CartLines` function, add a
  `useQuery(storeQuery)` call:
  ```tsx
  export function CartLines() {
    const { lines, change, remove } = useCart();
    const { data } = useQuery(storeQuery);   // <-- add this line
    ...
  ```
  `storeQuery` and `useQuery` are already imported in this file (used by `FreeDelivery`).

  Inside the `.map((line) => { ... })`, after the destructure:
  ```tsx
  const { product: p, variant, quantity } = line,
  ```
  Add a live-stock lookup:
  ```tsx
  const liveProduct = data?.products.find((prod) => prod.id === p.id);
  const liveVariant = variant
    ? liveProduct?.variants?.find((v) => v.key === variant.key)
    : undefined;
  const availableStock =
    liveVariant !== undefined
      ? liveVariant.stock
      : liveProduct?.stock ?? 50;
  const stockExceeded = liveProduct !== undefined && quantity > availableStock;
  ```

  Update the `<Quantity>` in `CartLines` from:
  ```tsx
  <Quantity value={quantity} onChange={(q) => change(key, q)} />
  ```
  to:
  ```tsx
  <Quantity
    value={Math.min(quantity, availableStock > 0 ? availableStock : quantity)}
    onChange={(q) => change(key, Math.min(q, availableStock > 0 ? availableStock : q))}
    max={availableStock > 0 ? availableStock : quantity}
  />
  ```

  After the `<Quantity>` block (still inside the per-line div), add a warning:
  ```tsx
  {stockExceeded && (
    <p className="mt-1 text-xs text-destructive" role="alert">
      Only {availableStock} left — quantity adjusted
    </p>
  )}
  ```

  Files: `src/components/store-ui.tsx`

  Verify (after steps 3–5): `npx tsc --noEmit` — 0 errors. `npm test` — all 216 tests pass.

---

## Fix 1 — Variant picker not working: initial state and multi-axis selection

### Finding

The `VariantPicker` component is correctly implemented: chips call `onSelect`,
`aria-pressed` tracks the current selection, disabled chips block impossible combos.

The product page is also mostly correct: `selectedOptions` falls back to the first
visible variant's options when `chosen` is empty (initial state). `onSelect` merges
onto `selectedOptions` via `setChosen({ ...selectedOptions, [axis]: value })`.

**However there are two real bugs:**

**Bug A — Initial `chosen` is `{}` but the picker renders a pre-selected state.**
On first load, `chosen = {}`, and `axes.every((axis) => axis.values.includes(""))` is
`false`, so `selectedOptions` falls back to `variants.find(v => v.visible)?.options`.
The picker renders those options as `aria-pressed`, which looks fine, but `chosen` is
still `{}`. This means if the user clicks a chip on axis B without touching axis A,
`setChosen({ ...selectedOptions, [axis]: value })` correctly carries forward axis A
from `selectedOptions`. So single-click works.

**Bug B — `chosen` is never seeded from the fallback on mount.**
The critical failure: after a user clicks a chip on axis A, `chosen` becomes
`{ "Colour": "Black" }`. Then `axes.every((axis) => axis.values.includes(chosen[axis.name] ?? ""))` 
fails for axis B (size/type), so `selectedOptions` again falls back to the first variant.
This means clicking axis A alone *reverts* axis B to the fallback, which is
confusing and can silently over-ride the user's intent.

More importantly: when axes have no overlap (e.g., two colours × two sizes = 4 variants),
the first click on axis A produces `chosen = { Colour: "Red" }`, which passes the
"all axes answered?" check only if there's ONE axis. With two axes, it fails, and
`selectedOptions` falls back to the first variant again, snapping axis B back —
the user's click on axis A appears to not take effect.

**The fix**: seed `chosen` from the first buyable variant when the product's axes are
determined, using a `useEffect` that fires once per product slug. This makes
`chosen` authoritative from the start, so the `axes.every(...)` guard passes and
every subsequent click is a true delta on the current selection.

**Bug C — `useEffect` for quantity clamp.** Already handled in Fix 2 step 4.

### Decision: seed `chosen` in a useEffect keyed on the product slug

Rather than changing the `selectedOptions` fallback logic (which is correct and
serves as a render-time safety net), seed the `chosen` state via `useEffect` on
mount (keyed on `slug` so navigating product→product reseeds). This makes the
initial state explicit and removes the mismatch between rendered selection and
tracked state.

---

- [ ] 6. Seed `chosen` state from the first buyable variant on product load.

  In `src/routes/product.$slug.tsx`:

  a. Verify `useEffect` is imported (it should be with `useState` already — check
     the import line). If not, add it: `import { useState, useEffect } from "react";`

  b. After the existing `useState` declarations and before the `if (!p) return ...`
     guard, add:

  ```tsx
  // Seed chosen from the first buyable variant so the picker renders and
  // tracks state consistently from the first render. Keyed on `slug` so
  // navigating between product pages reseeds correctly.
  useEffect(() => {
    if (axes.length === 0) return;
    const first = variants.find((v) => v.visible && v.stock > 0) ?? variants.find((v) => v.visible) ?? variants[0];
    if (first) setChosen(first.options);
  }, [slug]);
  ```

  Note: `axes` and `variants` are derived after `if (!p) return`, so the `useEffect`
  must be placed BEFORE the `if (!p) return` guard (React hooks must not be called
  conditionally). Move or re-declare `axes` and `variants` before the guard, or use
  `p?.axes ?? []` and `p?.variants ?? []` inside the effect. Use the latter form:

  ```tsx
  useEffect(() => {
    const productAxes = p?.axes ?? [];
    const productVariants = p?.variants ?? [];
    if (productAxes.length === 0) return;
    const first =
      productVariants.find((v) => v.visible && v.stock > 0) ??
      productVariants.find((v) => v.visible) ??
      productVariants[0];
    if (first) setChosen(first.options);
  }, [slug]);
  ```

  Place this `useEffect` immediately after the `useState` declarations (before `if (!p) return`).

  Files: `src/routes/product.$slug.tsx`

- [ ] 7. Keep the Add to Cart button disabled until all axes are resolved.

  In `src/routes/product.$slug.tsx`, the `unavailable` variable already handles this
  case: when `selectedVariant` is `undefined` and `variants.length > 0`,
  `unavailable = true` → `soldOut = true` → button disabled.

  After fix 6, `chosen` is always seeded, so `selectedOptions` will equal `chosen`
  and `selectedVariant` will be found. If the product has a variant with `visible: false`
  or `stock: 0`, `unavailable` is still set correctly.

  No change needed here — verify the existing logic is preserved.

  Files: `src/routes/product.$slug.tsx` (read-only verification)

- [ ] 8. Remove the quantity reset when navigating between products.

  Currently `quantity` state persists when navigating product→product (both use the
  same route component). If a user had qty=3 on one product and moves to another
  with stock=2, the quantity stays at 3 (exceeding stock). The `useEffect` from Fix 2
  step 4 will clamp it, but the transition looks odd.

  Add one more effect, keyed on `slug`, to reset quantity to 1:

  ```tsx
  useEffect(() => {
    setQuantity(1);
  }, [slug]);
  ```

  Place this immediately after the `chosen` seeding effect from step 6.

  Files: `src/routes/product.$slug.tsx`

  Verify (after steps 6–8): `npx tsc --noEmit` — 0 errors. `npm test` — all
  216 tests pass. `npm run build` — succeeds.

---

## Summary of files changed

| File | Changes |
|------|---------|
| `src/styles.css` | Add `--price-ink` CSS variable (light + dark), `--color-price-ink` in theme; apply to `.sale-price` and `.product-price` |
| `src/routes/product.$slug.tsx` | Add `text-price-ink` to price `<p>`; add `max` + `useEffect` stock clamp to `Quantity`; add `useEffect` to seed `chosen` from first buyable variant; add `useEffect` to reset quantity on slug change |
| `src/components/store-ui.tsx` | Add `max` prop to `Quantity`; update `CartLines` to read live stock via `storeQuery`, pass `max` to `Quantity`, show stock-exceeded warning |

## Verification

Run after all changes are applied:

```powershell
npx tsc --noEmit           # expect 0 errors
npm run lint               # expect 0 errors (7 pre-existing react-refresh warnings OK)
npm test                   # expect 216/216 passing
npm run build              # expect clean build
```

Manual smoke tests:
1. Open a product with variants — all chips render, clicking any chip updates the
   selection immediately, the selected chip shows as "pressed" (border-primary bg).
2. On a 2-axis product (e.g. Colour × Size), clicking colour updates colour while
   size stays selected; clicking size updates size while colour stays selected.
3. The Add to Cart button is enabled when a valid buyable variant is selected and
   disabled when the selection resolves to an out-of-stock or hidden variant.
4. The quantity `+` button is disabled at the available stock count (not at 50).
5. On the cart page, items show correct quantity limits; if a limit is exceeded, a
   small warning appears.
6. All product prices render in green (emerald), not amber/orange, across product
   cards, the product detail page, cart, checkout summary, and confirmation.
7. Staff pages (under `/staff`) are visually unchanged.
