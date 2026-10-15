# Holistic Storefront Audit — MB Ventures GH
**Date:** 15 October 2026
**Auditor:** Kiro (workflow step)
**Scope:** Customer-facing routes, shared components, cart/store logic

---

## Summary

The storefront is in good overall health after the recent variant/quantity/price-colour fixes. No TODO, FIXME, or stray `console.log` statements exist in `src/`. The `money()` helper formats GH₵ correctly. **4 issues found: 2 MEDIUM, 2 LOW.** The most notable gap is the order receipt (track, confirmation, account) not surfacing the human-readable variant label per line — customers who ordered a specific colour or size cannot confirm which option they bought from their receipt. The hero product card price on the homepage also lacks the green `--price-ink` colour applied everywhere else.

---

## Per-File Findings

### 1. `src/routes/index.tsx` — Homepage

**Status: 1 MEDIUM, 1 LOW**

| # | Severity | Finding |
|---|----------|---------|
| H-1 | MEDIUM | **Hero product card price is unstyled (not green).** Line 145: `<p className="mt-1 text-sm font-semibold">{money(featured.price)}</p>` — uses no colour class. Every other price surface (ProductCard via `.product-price` CSS, product detail page, cart lines, search panel) uses `--price-ink` (green). This one renders in the default foreground colour. Fix: add `style={{ color: "var(--price-ink)" }}`. |
| H-2 | LOW | **Setup section "Add to cart" buttons use `money(p.price)` without colour.** Lines 242-244 show price inline inside a ghost `<Button>` label with no price-ink colour. Cosmetically inconsistent but low-impact since the price is inside an action label, not a standalone price display. |

The hero hotspot `<Button>` click targets, hotspot navigation (prev/next), and the featured product "Add to cart" interaction are all correct. Visible product filter (`p.visible !== false`) is correctly applied. No broken links.

---

### 2. `src/routes/catalogue.tsx` — Product Listing

**Status: CLEAN**

- `ProductCard` is used for all items — price display delegates to the `.product-price` CSS class which correctly applies `var(--price-ink)`.
- Category filter uses the correct `c.id` (not `c.name`) as the select value, matching how the URL search param is written.
- Products with `visible: false` are correctly filtered out.
- Pagination logic is correct.
- Filter panel state resets page to 1 on change.
- Mobile filter drawer correctly mirrors the desktop filter panel.
- Brand filter built from `products.map(p => p.brand)` — includes hidden demo products' brands (since `products` in the component already filters to `p.visible !== false`). No issue.

---

### 3. `src/routes/product.$slug.tsx` — Product Detail

**Status: CLEAN**

- `VariantPicker` is wired correctly: `selected={selectedOptions}` and `onSelect` merges onto resolved options rather than raw `chosen` state, so a fresh page always shows a valid selection.
- `selectedVariant` lookup uses `variantKey()` with the correct axis-name list — canonical keys match the backend.
- `effectiveQty` clamps to available stock: `Math.min(quantity, stock)` — correct.
- `max={stock > 0 ? stock : 1}` passed to `<Quantity>` prevents over-ordering.
- `soldOut` fails closed when variants exist but none match — the Add/Buy buttons are correctly disabled.
- Price uses `--price-ink` via inline `style={{ color: "var(--price-ink)" }}` — green.
- `compareAt` only renders a struck-through price when `original_price > current price` — correct, no false discount display.
- `useEffect` resets `chosen` and `quantity` on slug change — prevents cross-product state bleed.

---

### 4. `src/routes/cart.tsx` — Cart Page

**Status: CLEAN**

- Delegates all line rendering to `<CartLines>` in `store-ui.tsx`.
- `<CartLines>` reads live stock from `storeQuery` and clamps quantities via `useEffect` (side-effect pattern is correct — no state mutation during render).
- Per-line `<Quantity max={availableStock > 0 ? availableStock : 1}>` prevents the stepper from going above stock.
- Over-stock warning message renders at line level.
- Line price uses `style={{ color: "var(--price-ink)" }}` — green.
- Variant name rendered below product name when present.

---

### 5. `src/routes/checkout.tsx` — Checkout

**Status: CLEAN**

- Order summary sidebar uses `lineKey(l)` as React key — correct for multi-variant products.
- Variant image shown when available: `l.variant?.image_key ?? l.product.image_key`.
- Variant name shown as secondary line under product name.
- Prices in sidebar use `money(..., true)` (2 decimal places) — consistent.
- Prices in sidebar are plain `<span>` with `text-xs` — no explicit colour class, but these are summary numbers inside a panel and the design renders them in foreground/default colour, which is acceptable (not a customer-facing primary price display). BORDERLINE but not flagged as a defect since checkout totals conventionally use foreground colour.
- `unavailable` check correctly computes per-variant stock for lines with a variant.
- `orders.place` sends only `{ id, quantity, variant_key? }` — backend recomputes all prices. Correct.

---

### 6. `src/routes/confirmation.tsx` — Order Confirmation

**Status: 1 MEDIUM (shared with track/receipt)**

Delegates entirely to `<OrderReceipt>` — see finding R-1 below.

---

### 7. `src/routes/track.tsx` — Order Tracking

**Status: 1 MEDIUM (shared with receipt)**

Delegates to `<OrderReceipt>` — see finding R-1 below. The lookup form, error handling, and receipt rendering path are all correct.

---

### 8. `src/routes/account.tsx` — Account / Order History

**Status: CLEAN (minor cosmetic gap noted)**

- Order history list (`api.orders.mine`) shows: reference, status, payment status, total, and a "View with phone number" link.
- It does **not** show line items or variant labels in this list — but this is a design choice (the list is a summary, not a receipt). The track link gets them to the full receipt. Acceptable.
- No price colour issue here — total uses `money()` inside a `font-mono font-semibold tabular-nums` span with no explicit colour; again a summary context, acceptable.
- Auth flow (sign-in, sign-up, forgot password, reset) is functionally complete.
- Admin redirect to hub token URL is functional.

---

### 9. `src/components/order-receipt.tsx` — Printable Receipt

**Status: 1 MEDIUM**

| # | Severity | Finding |
|---|----------|---------|
| R-1 | MEDIUM | **Variant label not shown per line item on the receipt.** The receipt renders items from `o.items` cast as `{ name, quantity, price }`. The `OrderItem` type **does** carry `variant_name?: string` (set by `orders.place` at line 160 of `convex/orders.ts`), but the receipt component discards it — the cast strips the field. A customer who ordered "Black" vs "White" of the same product sees only the product name with no indication which colour/size they ordered. Fix: widen the cast to include `variant_name?: string` and render it as a secondary line below the product name (matching the checkout sidebar pattern). |

The totals (subtotal, delivery fee, total), order timeline, status badges, and print button are all correct.

---

### 10. `src/components/store-shell.tsx` — Header / Footer / Navigation

**Status: CLEAN**

- Cart count badge in header: `cart.count > 0` guard, renders correctly on both desktop icon and mobile nav.
- Mobile nav badge: separate implementation at `-top-1.5 -right-2`, also correct.
- Cart count exposed as `lines.reduce((s, l) => s + l.quantity, 0)` — correct (counts total items, not unique products).
- Search panel shows prices with `style={{ color: "var(--price-ink)" }}` — green. Correct.
- Mobile menu drawer categories, contact card, and WhatsApp/phone buttons are all functional.
- ⌘K keyboard shortcut for search is wired correctly.
- Footer phone/WhatsApp links use settings values with fallback to hardcoded shop number — correct.
- `StoreHeader` mega menu closes on route change (`useEffect` on `pathname`) — correct.
- Mobile nav hides on `/staff` and `/admin` paths — correct.

---

## Production Hygiene

### TODO / FIXME / console.log

**None found.** A grep across all `src/**/*.{ts,tsx}` for `TODO`, `FIXME`, and `console.log` returned zero matches. The codebase is clean.

---

## `money()` Helper Verdict

**CORRECT.**

```ts
// src/lib/store.ts line 27
export const money = (n: number, decimals = false) =>
  `GH₵ ${n.toLocaleString("en-GH", { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: 2 })}`;
```

- Symbol: `GH₵` — correct Ghana cedis symbol with a space separator.
- Locale: `en-GH` — uses Ghanaian number formatting (comma thousands separator, period decimal).
- With `decimals=true` (used in cart, checkout, confirmation, receipt): renders `GH₵ 1,450.00` — correct.
- Without `decimals` (used in product cards, hero): renders `GH₵ 1,450` — acceptable for listing/preview contexts.
- No issue with negative numbers (prices are always positive in this domain).

---

## `ProductCard` Price Colour Verdict

**CORRECT (green).**

The `.product-price` CSS class in `styles.css` (line 597) sets `color: var(--price-ink)`. The `--price-ink` variable is defined as `color-mix(in oklch, var(--success) 80%, black)` in light mode and `color-mix(in oklch, var(--success) 62%, white)` in dark mode. Both are emerald-green, AA-compliant on their respective backgrounds. The `ProductCard` component uses `<div className="product-price">`, so the price inherits the green colour automatically through CSS — no inline style needed there, unlike other surfaces that use `style={{ color: "var(--price-ink)" }}` directly.

---

## Cart Quantity Cap Logic Verdict

**CORRECT.**

Three layers cooperate:

1. **`<Quantity max={stock > 0 ? stock : 1}>` on the product detail page** — the stepper's `+` button is disabled when `value >= ceiling` where `ceiling = Math.min(stock, 50)`. This prevents selecting more than stock before adding to cart.

2. **`effectiveQty = stock > 0 ? Math.min(quantity, stock) : quantity`** on the product page — when a variant switch brings less stock than the current quantity, the displayed quantity is clamped before passing to `cart.add()`.

3. **`CartLines` `useEffect` clamp** — after the cart renders, a side-effect reads live stock from `storeQuery` and calls `change(key, availableStock)` when `quantity > availableStock`. The `change()` function in the provider caps at `Math.min(50, q)`. The `<Quantity max={availableStock}>` in `CartLines` also disables the `+` button at stock.

4. **`checkout.tsx` `unavailable` check** — before allowing order placement, the checkout recomputes `const stock = l.variant ? l.variant.stock : p.stock` and blocks if `stock < l.quantity`.

The only edge case is the `Math.min(50, q)` hard cap in `store-provider.tsx`'s `change()` function. If a product had more than 50 units in stock (none of the current 11 real products do — all are set to 10), the hard cap of 50 could silently prevent someone from ordering 60 units even if stock allowed it. At current inventory levels this is a non-issue, but it's worth noting for future high-volume products.

---

## Recommended Actions (Prioritised)

| Priority | Action | File | Severity |
|----------|--------|------|----------|
| 1 | **Show variant label per line on receipt** — widen the item cast in `order-receipt.tsx` to include `variant_name?: string` and render it as a secondary line below the product name | `src/components/order-receipt.tsx` | MEDIUM |
| 2 | **Green price on hero product card** — add `style={{ color: "var(--price-ink)" }}` to the featured product price `<p>` in the hero glass card | `src/routes/index.tsx` line 145 | MEDIUM |
| 3 | **Green price on setup section buttons** — add `style={{ color: "var(--price-ink)" }}` to the price text inside the setup section's ghost buttons | `src/routes/index.tsx` lines 242-244 | LOW |
| 4 | **Consider showing item count or variant summary in account order history list** — currently shows only reference, status and total; a brief "2 items" or the first item name would aid recognition | `src/routes/account.tsx` | LOW |

---

*End of audit. No code was changed in this step.*
