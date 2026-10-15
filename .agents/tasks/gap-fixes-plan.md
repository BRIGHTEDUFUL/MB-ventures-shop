# Implementation Plan — Gap Fixes
**Date:** 15 October 2026  
**Scope:** 5 gaps identified in `gap-analysis-2026-10-15.md`  
**Execution order:** 1 → 2 → 3 → 4 → 5 (Gap 3 depends on Gap 2; all others are independent)

---

## Architecture invariants — must not be broken

- `applyStockChange` is the only way to mutate stock in `convex/` — none of these gaps touch stock mutation, so this is safe by default
- `variantKey()` output format must NOT change — none of these gaps touch variant key generation
- All user-facing backend errors must be `ConvexError({ message })` — no new backend errors introduced
- Do NOT touch staff/admin UI colour scheme — Gap 3 adds muted text only; Gap 4 changes one warning colour only
- Demo products must NOT be deleted — no product data changes in any gap

---

## Gap 1 — MEDIUM: Out-of-stock variant chips not disabled

**File:** `src/components/variant-picker.tsx`  
**Line:** 51  
**Dependency:** None — standalone change

### What to do

Change the `enabled` expression so a variant with `stock === 0` (but `visible === true`) is also treated as unselectable. Currently `enabled = match !== null && match.visible` allows out-of-stock visible variants to be clicked, which sends the customer to a checkout path that `orders.place` will reject server-side.

### Before

```ts
const enabled = match !== null && match.visible;
```

### After

```ts
const enabled = match !== null && match.visible && match.stock > 0;
```

**Context:** The `availability` string already correctly reports `"out of stock"` when `match.stock === 0`, and the `aria-label` already exposes that string to screen readers. The `chipClass` already renders the `cursor-not-allowed opacity-50` style for `!enabled`. Adding `&& match.stock > 0` to `enabled` will:
- Disable the button element (`disabled={!enabled}`)
- Apply the greyed-out chip CSS class
- Preserve the `"out of stock"` `aria-label`

No CSS changes needed; the disabled state styling is already correct.

### Files to modify

- `src/components/variant-picker.tsx` — line 51 only

### Verify

```sh
npx tsc --noEmit
npx vitest --run
```

Expected: 0 TypeScript errors, all 216 tests pass (the `variants.test.ts` file covers `variantKey`/`deriveAxes` logic; the `convex-mutations.test.ts` covers `orders.place` stock rejection — neither test is broken by this change).

---

## Gap 2 — MEDIUM: `OrderItem` type missing `variant_key` and `variant_name` fields

**File:** `convex/lib/dto.ts`  
**Line:** ~113 (the `OrderItem` type declaration)  
**Dependency:** None — must be done before Gap 3

### What to do

Add two optional fields to the `OrderItem` TypeScript type. The Convex schema (`convex/schema.ts` lines 399–400) already declares `variant_key: v.optional(v.string())` and `variant_name: v.optional(v.string())` on the `items` array — the runtime objects already carry these fields; only the TypeScript type declaration is missing them.

The `orderDTO` function passes `items: order.items` directly (no transformation), so no change to `orderDTO` itself is needed — the values already flow through; we are only catching up the type.

### Before

```ts
export type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_key: string;
};
```

### After

```ts
export type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_key: string;
  /** The canonical variant key (from `variantKey()`). Present only when the order line is for a specific variant. */
  variant_key?: string;
  /** Human-readable variant label (e.g. "Black / Large"). Present only when `variant_key` is set. */
  variant_name?: string;
};
```

### Files to modify

- `convex/lib/dto.ts` — `OrderItem` type only (the `orderDTO` function body is unchanged)

### Verify

```sh
npx tsc --noEmit
npx vitest --run
```

Expected: 0 TypeScript errors. All 216 tests pass. TypeScript will now allow `item.variant_key` and `item.variant_name` access on any `OrderItem` value — which unblocks Gap 3.

---

## Gap 3 — MEDIUM: Staff order view missing separate variant label

**File:** `src/routes/staff/orders/$id.tsx`  
**Line:** ~196 (the `order.items.map` render block inside `<Panel title="Items">`)  
**Dependency:** Gap 2 must be done first (requires `OrderItem.variant_name` to be typed)

### What to do

In the staff order detail Items panel, the current render shows only `item.name` (which for variant orders is the compound `"Product — Variant"` string). Replace this with a two-line display: the product name on one line in the existing `font-medium` style, and `item.variant_name` in a muted smaller-font line below — mirroring the pattern used in `CartLines` (`store-ui.tsx` line 174–178) and the checkout summary (`checkout.tsx` line 203).

The `Link` component that wraps `item.name` must continue to link to the product page. The variant label is not a link — it is informational metadata for pick/pack.

### Before (lines ~196–204 inside the `order.items.map`)

```tsx
<span className="min-w-0 flex-1">
  <Link
    to="/product/$slug"
    params={{ slug: item.id }}
    className="block truncate font-medium hover:underline"
  >
    {item.name}
  </Link>
  <span className="text-xs text-muted-foreground">
    {money(item.price, true)} × {item.quantity}
  </span>
</span>
```

### After

```tsx
<span className="min-w-0 flex-1">
  <Link
    to="/product/$slug"
    params={{ slug: item.id }}
    className="block truncate font-medium hover:underline"
  >
    {/* Show only the product name, not the compound "Product — Variant" string.
        For variant orders, item.variant_name carries the option label separately. */}
    {item.variant_name
      ? item.name.replace(` — ${item.variant_name}`, "")
      : item.name}
  </Link>
  {item.variant_name && (
    <p className="mt-0.5 text-xs text-muted-foreground">{item.variant_name}</p>
  )}
  <span className="text-xs text-muted-foreground">
    {money(item.price, true)} × {item.quantity}
  </span>
</span>
```

**Rationale for the `replace` call:** The `name` field stored on the order item is the compound string written by `orders.place` (`product.name — variant.name`). Splitting with `replace` instead of storing `product_name` separately avoids any backend change — the compound name is the only reliable source for the product name on historical order rows, and the `variant_name` field is the exact suffix that was appended.

**Note on historical orders (no variants):** For orders placed before variants were introduced, `item.variant_name` is `undefined`, so the `replace` is skipped and `item.name` renders unchanged. The conditional `{item.variant_name && ...}` ensures the muted line is only rendered when the field is present.

### Files to modify

- `src/routes/staff/orders/$id.tsx` — the `<span className="min-w-0 flex-1">` block inside `order.items.map`

### Verify

```sh
npx tsc --noEmit
npx vitest --run
```

Expected: 0 TypeScript errors (TypeScript will resolve `item.variant_name` correctly because Gap 2 added it to `OrderItem`). All 216 tests pass.

---

## Gap 4 — LOW: "Only X left" warning colour

**File:** `src/components/store-ui.tsx`  
**Line:** 186  
**Dependency:** None — standalone change

### What to do

The "Only X left" overstock warning currently uses the Tailwind primitive `text-amber-600`. The gap analysis requests changing this to `text-orange-500` for a consistent warning colour (not red, not green). This is a pure CSS class swap — no logic changes.

Also check `src/routes/cart.tsx` and `src/routes/product.$slug.tsx` for any other "Only X left" occurrences — the grep search above confirms neither file contains this text or `amber-600`, so the single change in `store-ui.tsx` is sufficient.

### Before

```tsx
{overStock && (
  <p className="mt-1 text-xs text-amber-600" role="alert">
    Only {availableStock} left
  </p>
)}
```

### After

```tsx
{overStock && (
  <p className="mt-1 text-xs text-orange-500" role="alert">
    Only {availableStock} left
  </p>
)}
```

### Files to modify

- `src/components/store-ui.tsx` — line 186, class name only

### Verify

```sh
npx tsc --noEmit
npx vitest --run
npx prettier --check .
```

Expected: 0 errors, all 216 tests pass, prettier clean.

---

## Gap 5 — LOW: `Quantity` component missing group `aria-label`

**File:** `src/components/store-ui.tsx`  
**Lines:** ~89–105 (the `Quantity` component return block)  
**Dependency:** None — standalone change

### What to do

Add `role="group"` and `aria-label="Quantity"` to the wrapping `<div className="quantity">` so screen-reader users know the stepper's purpose. The `aria-live="polite"` on the count span is already correct and sufficient for announcing value changes; no additional label is needed on the span itself — adding one would cause double-announcement ("Quantity 3, 3").

### Before

```tsx
return (
  <div className="quantity">
    <Button
      variant="ghost"
      aria-label="Decrease quantity"
      onClick={() => onChange(value - 1)}
      disabled={value <= 1}
    >
      <Minus className="size-3" />
    </Button>
    <span aria-live="polite">{value}</span>
    <Button
      variant="ghost"
      aria-label="Increase quantity"
      onClick={() => onChange(value + 1)}
      disabled={value >= ceiling}
    >
      <Plus className="size-3" />
    </Button>
  </div>
);
```

### After

```tsx
return (
  <div className="quantity" role="group" aria-label="Quantity">
    <Button
      variant="ghost"
      aria-label="Decrease quantity"
      onClick={() => onChange(value - 1)}
      disabled={value <= 1}
    >
      <Minus className="size-3" />
    </Button>
    <span aria-live="polite">{value}</span>
    <Button
      variant="ghost"
      aria-label="Increase quantity"
      onClick={() => onChange(value + 1)}
      disabled={value >= ceiling}
    >
      <Plus className="size-3" />
    </Button>
  </div>
);
```

The only change is `<div className="quantity">` → `<div className="quantity" role="group" aria-label="Quantity">`. No logic, no style, no behaviour changes.

### Files to modify

- `src/components/store-ui.tsx` — the `<div className="quantity">` opening tag only

### Verify

```sh
npx tsc --noEmit
npx vitest --run
```

Expected: 0 TypeScript errors, all 216 tests pass. The `Quantity` component renders in multiple places (`product.$slug.tsx` product page, `store-ui.tsx` cart lines, `staff/inventory.tsx`) — all inherit the fix automatically via the shared component.

---

## Full verification sequence (run after all 5 gaps are applied)

```sh
npx tsc --noEmit
npm run lint
npx vitest --run
npx prettier --check .
npm run build
```

Expected outcomes:
- `npx tsc --noEmit` → 0 errors (7 pre-existing `react-refresh` lint warnings are acceptable per AGENTS.md §7)
- `npm run lint` → 0 errors
- `npx vitest --run` → 216/216 tests pass across 15 test files
- `npx prettier --check .` → clean
- `npm run build` → succeeds

Optional mobile audit (run if layout or CSS is touched):

```sh
node scripts/mobile-audit.mjs http://localhost:8080
```

Expected: `"CLEAN — no mobile defects found across 14 routes × 3 widths."`

---

## Summary of files changed

| File | Gap(s) | Change type |
|------|--------|-------------|
| `src/components/variant-picker.tsx` | 1 | 1-line logic fix |
| `convex/lib/dto.ts` | 2 | 2-line type addition |
| `src/routes/staff/orders/$id.tsx` | 3 | UI render block (~5 lines) |
| `src/components/store-ui.tsx` | 4, 5 | 1 class swap + 2 HTML attributes |

No backend mutations, no schema changes, no new dependencies, no new files.
