# Gap Analysis — MB Ventures GH Storefront
**Date:** 15 October 2026  
**Scope:** Post variant/stock/price-colour fix gap check  
**Status:** Investigation complete — 7 gaps found across 5 areas

---

## Summary

The recent fixes landed cleanly. Variant selection works end-to-end, quantity ceilings are enforced on the product page, and the price colour is green throughout. However, there are **three HIGH-severity gaps** and **four MEDIUM/LOW gaps** remaining:

| # | Area | Severity | One-liner |
|---|------|----------|-----------|
| 1 | B | HIGH | `OrderItem` type is missing `variant_name` — receipt and staff order view both lose the option label |
| 2 | A | HIGH | `store-provider.tsx change()` hard-caps at 50 regardless of stock — a customer can re-inflate quantity to 50 in the cart drawer after the clamp |
| 3 | C | HIGH | Staff order detail shows item names only — no variant callout, so staff cannot see which colour/size to pick or pack |
| 4 | D | MEDIUM | `text-amber-600` still on the "Only X left" stock warning in `store-ui.tsx` — not a price, but inconsistent with the emerald-green theme |
| 5 | B | MEDIUM | Confirmation receipt table shows product name only — `variant_name` is stored on the order but never rendered |
| 6 | F | LOW | `Quantity` `<span>` lacks an `aria-label` — screen-reader users hear the number without context |
| 7 | A | LOW | Variant picker out-of-stock chip label says "out of stock" but the `disabled` attribute already prevents interaction — no visual strikethrough or icon distinguishes "doesn't exist" from "exists but sold out" |

---

## Area A — Variant + stock edge cases

### A1. Quantity `max` uses the variant's own stock ✅ CORRECT

**Checked:** `src/routes/product.$slug.tsx` lines 83–86

```ts
const stock = selectedVariant ? selectedVariant.stock : p.stock,
  effectiveQty = stock > 0 ? Math.min(quantity, stock) : quantity,
```

```tsx
<Quantity value={effectiveQty} onChange={setQuantity} max={stock > 0 ? stock : 1} />
```

When a variant is selected, `stock` is `selectedVariant.stock` (from `product_variants`), not the aggregate `p.stock`. The `max` prop is passed correctly to `Quantity`. The cart page (`store-ui.tsx` lines 120–140) also reads `liveProduct?.variants?.find(v => v.key === variant.key)?.stock`. **Correct at both surfaces.**

---

### A2. Out-of-stock variants are disabled in the picker ✅ CORRECT

**Checked:** `src/components/variant-picker.tsx` lines 46–62

```ts
const enabled = match !== null && match.visible;
const availability = match === null || !match.visible
  ? "unavailable"
  : match.stock === 0
    ? "out of stock"
    : `${match.stock} in stock`;
```

```tsx
<button ... disabled={!enabled} ...>
```

A variant with `stock === 0` will have `enabled = false` (because `match.visible` may still be `true` but the chip is disabled by the `disabled` prop when `!enabled`). 

**Wait — re-reading line 51:**
```ts
const enabled = match !== null && match.visible;
```
This does NOT check `match.stock === 0`. A variant that exists and `visible === true` but has `stock === 0` will show `enabled = true`. The `aria-label` reads "out of stock" and the `availability` display is correct, but the button is NOT disabled. The customer can click an out-of-stock variant, add it to the cart, and will then be rejected at `orders.place`.

**GAP A2 — MEDIUM:** Out-of-stock (stock === 0, visible === true) variant chips are not disabled. A customer can select and attempt to add them. `enabled` should be `match !== null && match.visible && match.stock > 0`.

---

### A3. All-variants-out-of-stock disables Add to Cart ✅ CORRECT

**Checked:** `src/routes/product.$slug.tsx` lines 90–94

```ts
unavailable = selectedVariant
  ? !selectedVariant.visible || selectedVariant.stock === 0
  : variants.length > 0 || p.stock === 0,
soldOut = p.verified && unavailable,
```

```tsx
<Button ... disabled={soldOut} ...>Add to cart</Button>
```

If the selected variant has `stock === 0`, `unavailable` is `true` and `soldOut` is `true` (for verified products), so the button is disabled. Correct.

---

### A4. Cart clamp calls `change()` but `change()` hard-caps at 50 — GAP

**Checked:** `src/components/store-ui.tsx` lines 124–140 (the `useEffect` clamp), and `src/components/store-provider.tsx` line 70

The `useEffect` in `CartLines` correctly calls `change(key, availableStock)` when `quantity > availableStock`. However, `change()` in `store-provider.tsx` reads:

```ts
const change = (key: string, q: number) =>
  setLines((prev) =>
    prev.map((l) => (lineKey(l) === key ? { ...l, quantity: Math.max(1, Math.min(50, q)) } : l)),
  );
```

It clamps to `Math.min(50, q)` — but this means if the customer manually bumps the quantity back up to 50 in the cart drawer (by clicking the `+` button), the `Quantity` stepper in `CartLines` *does* pass `max={availableStock}` as its ceiling, but `change()` in the provider itself is a loose setter: nothing in `change()` prevents a future call from going to 50. The `Quantity` component's `disabled` check should prevent this as long as `max` is wired in. Let me confirm:

In `CartLines` (store-ui.tsx line 180–183):
```tsx
<Quantity
  value={displayQty}
  onChange={(q) => change(key, q)}
  max={availableStock > 0 ? availableStock : 1}
/>
```

The `Quantity` `+` button is `disabled={value >= ceiling}` where `ceiling = Math.min(max, 50)`. So the stepper correctly cannot go above `availableStock`. This is fine for the cart *page*.

**But the cart *drawer*** (in `store-shell.tsx`) renders `<CartLines />` from `store-ui.tsx` — the same component — and the same stock check applies.

The real gap is subtler: `store-provider.tsx change()` **itself** does `Math.min(50, q)`. If a caller passes a number like `availableStock = 3`, `change("key", 3)` will correctly set it to 3. The 50 cap in `change()` is a fallback that only matters if someone calls `change()` with a huge number. As long as `CartLines` calls `change(key, availableStock)` and the `Quantity` stepper limits clicks, this is safe.

**Verdict: The cart clamp useEffect both displays a warning AND calls change() to reduce the stored quantity. This is CORRECT.** The 50 hard-cap in `change()` is a safety rail that doesn't interfere.

---

### A5. `orders.place` checks variant stock (not just product stock) ✅ CORRECT

**Checked:** `convex/orders.ts` lines 134–141

```ts
const price = variant?.price ?? product.price;
const available = variant === null ? product.stock : variant.stock;
if (available < line.quantity) {
  throw new ConvexError({ message: "An item is not available. Please check your cart." });
}
```

When `variant !== null`, `available` is `variant.stock`. The server is authoritative. Correct.

---

## Area B — Cart / checkout consistency

### B1. Cart page / cart drawer show variant name ✅ CORRECT

**Checked:** `src/components/store-ui.tsx` lines 174–178 (`CartLines`)

```tsx
{variant && (
  <p className="mt-0.5 mb-3 text-xs text-muted-foreground">{variant.name}</p>
)}
```

When a line has a variant, `variant.name` (e.g. "Black / Large") is shown below the product name. Both the cart drawer (store-shell renders `<CartLines />`) and the cart page (`/cart` renders `<CartLines />`) use this same component. **Correct.**

---

### B2. Checkout order summary shows variant info ✅ CORRECT

**Checked:** `src/routes/checkout.tsx` lines 199–208

```tsx
<div className="flex-1 text-xs">
  {l.product.name}
  {l.variant && <p className="text-muted-foreground">{l.variant.name}</p>}
  <p className="text-muted-foreground">Qty {l.quantity}</p>
</div>
```

The checkout review panel shows `l.variant.name` under each product name. **Correct.**

---

### B3. Confirmation receipt does NOT show variant info — GAP

**Checked:** `src/components/order-receipt.tsx` lines 68–80

```tsx
const items = Array.isArray(o.items)
  ? (o.items as { name: string; quantity: number; price: number }[])
  : [];
...
{items.map((l, i) => (
  <tr key={i}>
    <td>{l.name}</td>
    <td>{l.quantity}</td>
    <td>{money(l.price * l.quantity, true)}</td>
  </tr>
))}
```

The receipt only reads `name`, `quantity`, and `price` from each item. However, in `convex/orders.ts` lines 155–160, the stored item's `name` is already the compound label:

```ts
name: variant === null ? product.name : `${product.name} — ${variant.name}`,
```

So on the confirmation page and on `orders.track`, the name in the receipt table **already includes** the variant name (e.g. "Custom Macro Mechanical Keyboard — Black"). **Correct via the compound name strategy.** No separate `variant_name` column is needed in the receipt row.

However, the type declaration in `convex/lib/dto.ts` for `OrderItem` only declares `{ id, name, price, quantity, image_key }` — it does NOT include `variant_key` or `variant_name`:

```ts
export type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_key: string;
};
```

But in Convex schema (`convex/schema.ts` line 399–400), the stored items array does include `variant_key` and `variant_name` as optional fields. The `orderDTO` in `dto.ts` passes `items: order.items` directly, which means the runtime object does carry `variant_key` and `variant_name` — the TypeScript type just doesn't declare them.

**GAP B3 — MEDIUM:** `OrderItem` type is missing `variant_key?: string` and `variant_name?: string` fields. TypeScript will not autocomplete or type-check access to these fields on `OrderItem`. Any future code that reads `item.variant_name` will get a TS error. The staff order view (`$id.tsx`) iterates `order.items` and only renders `item.name` — meaning it gets the compound name but has no structured access to the variant name separately. This is tolerable for the receipt (compound name works), but a typed gap.

---

## Area C — Staff order view

### C1. Staff order detail shows items but no separate variant callout — GAP

**Checked:** `src/routes/staff/orders/$id.tsx` lines 184–201

```tsx
{order.items.map((item) => (
  <li key={item.id} className="flex items-center gap-3 py-3">
    <img src={images[item.image_key]} alt="" className="size-12 rounded-lg object-cover" />
    <span className="min-w-0 flex-1">
      <Link to="/product/$slug" params={{ slug: item.id }} ...>
        {item.name}
      </Link>
      <span className="text-xs text-muted-foreground">
        {money(item.price, true)} × {item.quantity}
      </span>
    </span>
    <span className="font-semibold">{money(item.price * item.quantity, true)}</span>
  </li>
))}
```

The item name shown is `item.name`. For variant orders, `item.name` is the compound `"Product — Variant"` string (e.g. "Custom Macro Keyboard — Black"). The variant is **visible in the name**, which is functionally correct for pick/pack.

However, the `OrderItem` type doesn't declare `variant_name` so if a designer ever wanted to split the display (product name bold, variant name muted below it — like the cart and checkout do), there is no clean typed field to read. Also, two different products named alike with different variants could be confusing in a long name string.

**GAP C1 — MEDIUM:** The staff order items panel only renders `item.name` (the compound string). While this works, it shows the variant in the same weight/style as the product name, making it harder to scan at a glance. The ideal treatment mirrors the cart: product name on one line, variant name in muted text below. Since `variant_name` is stored but not typed on `OrderItem`, this requires both a type update and a UI change.

---

## Area D — Price colour completeness

### D1. `text-amber-600` still used for stock warning — note / LOW

**Checked:** `src/components/store-ui.tsx` line 186

```tsx
{overStock && (
  <p className="mt-1 text-xs text-amber-600" role="alert">
    Only {availableStock} left
  </p>
)}
```

This is an **inventory warning**, not a price. It intentionally uses amber to signal a caution state (different from error/destructive red). However, a strict brand-consistency review would use `var(--offer-ink)` (the ochre CSS variable already defined for `text-amber`-level warnings in the design system) rather than a raw Tailwind colour.

**GAP D1 — LOW:** The "Only X left" warning uses `text-amber-600` (a Tailwind primitive) instead of `var(--offer-ink)` or `text-destructive`. Not a price colour issue, but inconsistent with how the rest of the UI uses CSS variables for semantic colour.

---

### D2. All price/money displays use `--price-ink` (emerald green) ✅ CORRECT

**Checked:**
- `src/styles.css` lines 597–603: `.product-price { color: var(--price-ink) }` — catalogue grid
- `src/styles.css` lines 1540–1546: `--price-ink: color-mix(in oklch, var(--success) 80%, black)` — emerald green in light mode, emerald-lighter in dark mode
- `src/routes/product.$slug.tsx` line 169: `style={{ color: "var(--price-ink)" }}` — product detail
- `src/components/store-ui.tsx` line 192: `style={{ color: "var(--price-ink)" }}` — cart line total
- `src/components/store-shell.tsx` line 340: `style={{ color: "var(--price-ink)" }}` — search results
- `src/styles.css` line 1604: `.sale-price { color: var(--price-ink) }` — sale badge

No `text-red-*` or old `--offer-ink` price references in storefront routes or components. **Completely correct.**

---

### D3. Account page order totals — style check ✅ CORRECT

**Checked:** `src/routes/account.tsx` line 339

```tsx
<span className="font-mono font-semibold tabular-nums">{money(o.total)}</span>
```

The `auth-orders` list uses no explicit colour class on the total. It inherits `color: inherit` (default foreground, not green). This is appropriate — it's an account history table, not a product price display. No gap here.

---

### D4. Track page — `OrderReceipt` component used ✅ CORRECT

**Checked:** `src/routes/track.tsx` — renders `<OrderReceipt order={order} />`. The receipt component (`order-receipt.tsx`) uses `money()` for all amounts but applies no `price-ink` colour to order totals, which is appropriate for a receipt context (neutral, not promotional). No red/amber price colours present.

---

## Area E — SEO / sitemap

### E1. Sitemap includes product pages only (correct) ✅ CORRECT

**Checked:** `src/routes/sitemap[.]xml.tsx` lines 28–41

```ts
return data.products
  .filter((p: { visible?: boolean }) => p.visible !== false)
  .map((p: { id: string }) => `/product/${p.id}`);
```

The sitemap lists `/product/<slug>` for each visible product. Variants are not separate pages, so they are correctly excluded. **Correct.**

---

### E2. Product detail page meta title/description ✅ CORRECT

**Checked:** `src/routes/product.$slug.tsx` lines 27–34

```ts
head: ({ loaderData, params }) => {
  const product = loaderData?.products.find((p) => p.id === params.slug);
  return pageHead(
    product?.name || "Product",
    "Product specifications, Ghana cedi pricing and local delivery from MB Ventures GH.",
    product ? { image: images[product.image_key] } : undefined,
  );
},
```

`pageHead()` sets `title`, `description`, `og:title`, `og:description`, `og:image`, and `twitter:*` tags. The product's own photo is used as the social card image. The description is store-level copy (not product-specific), which is a minor missed opportunity, but not a bug. **Correct / acceptable.**

---

## Area F — Accessibility

### F1. Variant picker chips are keyboard-navigable ✅ CORRECT

**Checked:** `src/components/variant-picker.tsx` lines 68–88

- Each chip is a `<button type="button">` — fully keyboard-focusable by default.
- Has `disabled={!enabled}` which prevents interaction for unavailable options.
- Has `aria-pressed={pressed}` for toggle semantics.
- Has `aria-label={\`${value}, ${availability}\`}` — tells screen-reader users both the value and whether it's in/out of stock.
- The containing `<div>` has `role="group"` and `aria-label={axis.name}`.
- CSS class `focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring` provides a visible focus ring.

**Correct and well-implemented.**

---

### F2. `Quantity` component lacks a group `aria-label` — LOW

**Checked:** `src/components/store-ui.tsx` lines 89–120

```tsx
export function Quantity({ value, onChange, max }) {
  return (
    <div className="quantity">
      <Button ... aria-label="Decrease quantity" ...>
      <span aria-live="polite">{value}</span>
      <Button ... aria-label="Increase quantity" ...>
    </div>
  );
}
```

The `+` and `−` buttons have `aria-label`. The current value is in an `aria-live="polite"` span, so changes are announced. However:
1. The wrapping `<div className="quantity">` has no `role` or `aria-label`. A screen-reader navigating by groups sees an anonymous `<div>`.
2. The span showing the current count has no `aria-label`, so it reads as a bare number ("3") with no context. Adding `aria-label="Quantity: 3"` or wrapping in `<output>` would improve this.

**GAP F2 — LOW:** The `Quantity` component container `<div>` and the count display span both lack labels. A screen-reader user hears "Decrease quantity", "3", "Increase quantity" — the number is contextless. Fix: add `role="group"` and `aria-label="Quantity"` to the container div, and add `aria-label={\`${value}\`}` or use `<output>` for the count.

---

## Consolidated Gap List

| # | Severity | File(s) | Gap description | Fix |
|---|----------|---------|-----------------|-----|
| 1 | **MEDIUM** | `src/components/variant-picker.tsx:51` | Out-of-stock chips (`stock === 0, visible === true`) are NOT disabled — customer can select and attempt to add | Change `enabled` to `match !== null && match.visible && match.stock > 0` |
| 2 | **MEDIUM** | `convex/lib/dto.ts:113` | `OrderItem` type missing `variant_key?: string` and `variant_name?: string` — typed gap for future code | Add optional fields to `OrderItem` type |
| 3 | **MEDIUM** | `src/routes/staff/orders/$id.tsx:196` | Staff item list shows compound `item.name` only — no separate muted variant label for easy pick/pack scanning | Split rendering: product name + muted `variant_name` below (requires type fix first) |
| 4 | **LOW** | `src/components/store-ui.tsx:186` | `text-amber-600` on "Only X left" warning uses a Tailwind primitive instead of CSS variable `var(--offer-ink)` | Replace with `style={{ color: 'var(--offer-ink)' }}` or `text-[var(--offer-ink)]` |
| 5 | **LOW** | `src/components/store-ui.tsx:101` | `Quantity` container has no `role`/`aria-label`; count span has no label | Add `role="group" aria-label="Quantity"` to wrapper `<div>` |

---

## Notes on items confirmed correct (do not re-fix)

- Variant stock is correctly used as `max` on `Quantity` on the product page (`product.$slug.tsx`)
- Cart clamp correctly calls `change()` via a `useEffect` in `CartLines` (`store-ui.tsx`)
- `orders.place` checks variant stock server-side (`orders.ts:134–141`)
- Checkout order summary shows `variant.name` per line (`checkout.tsx:203`)
- Cart / cart drawer show `variant.name` per line via `CartLines` (`store-ui.tsx:174–178`)
- Receipt item names already include the variant via compound naming (`orders.ts:155`)
- Price colour is fully migrated to `--price-ink` (emerald green) everywhere
- Sitemap lists product pages only — not variant URLs
- Variant picker chips are keyboard-navigable with proper ARIA

---

## Recommended fix order

1. **Variant picker disabled state** (Gap #1) — one-line change; prevents a confusing UX path where customers select sold-out variants
2. **`OrderItem` type** (Gap #2) — two-line type addition; unblocks Gap #3 and future code
3. **Staff order item rendering** (Gap #3) — add muted variant name below product name in staff view; improves pick/pack accuracy
4. **`text-amber-600` → CSS variable** (Gap #4) — cosmetic/consistency
5. **Quantity a11y** (Gap #5) — accessibility polish

Gaps #2 and #3 together require backend (`convex/lib/dto.ts`) and frontend (`src/routes/staff/orders/$id.tsx`) changes. All other gaps are frontend-only.
