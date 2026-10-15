# Implementation Plan — Variant Picker & Stock Fixes

**Task:** Fix the variant picker (colour/size chips are visible but non-interactive),
fix the stock-ceiling on the Quantity stepper when `max` could be 0, and confirm
the price colour is green (it already is — see note below).

**Branch assumption:** work on the current branch; commit locally; do not push.

---

## Findings from code exploration

### Root cause — selectedOptions never reflects the user's clicks

File: `src/routes/product.$slug.tsx`, lines ~71–78

```ts
selectedOptions =
  axes.length > 0 && axes.every((axis) => axis.values.includes(chosen[axis.name] ?? ""))
    ? chosen
    : (variants.find((v) => v.visible)?.options ?? variants[0]?.options ?? {});
```

`chosen` starts as `{}`. The guard `axes.every(axis => axis.values.includes(""))` is
always false because no axis has an empty string as a value. Therefore `selectedOptions`
is **always** the first variant's options, regardless of what the user clicked.

The VariantPicker receives this frozen value as `selected`, so:
- `pressed = selected[axis.name] === value` never becomes true from a user tap
- The chip `enabled` check uses the same frozen value, so only the first-variant's
  chip combination is ever enabled (all others appear greyed out)
- `setChosen` is called on click but the computed `selectedOptions` ignores it

### variant-picker.tsx — no bugs

The VariantPicker's `enabled` logic and `pressed` logic are correct given a correct
`selected` prop. The `cells.get(variantKey({ ...selected, [axis.name]: value }, axisNames))`
merge is the right approach. No changes needed here.

### Quantity component (store-ui.tsx) — currently correct but fragile

`const ceiling = max !== undefined ? Math.min(max, 50) : 50`

When `max=0` is passed, `ceiling=0` and increment is disabled. The product page already
guards this: `max={stock > 0 ? stock : 1}`. The cart lines in `store-ui.tsx` also guard
correctly: `max={availableStock > 0 ? availableStock : 1}`. No fix needed.

### catalogue.tsx — quick-add already correct

Variant products use `asChild={axisCount >= 1}` on the "+" button to navigate to the
product detail page instead of adding to cart. No change needed.

### cart.tsx — already correct

The cart page delegates to `CartLines` in `store-ui.tsx`. `CartLines` derives
`availableStock` from live store data with a correct variant lookup. No change needed.

### convex/orders.ts — correct

`orders.place` resolves variant by `variant_key`, checks `variant.stock` (not
`product.stock`) for availability, and calls `applyStockChange` with the correct
`variant_key`. Fully correct.

### convex/lib/stock.ts — correct

`applyStockChange` patches the variant, then calls `variantAggregate` to recompute
the product aggregate in the same transaction. Fully correct.

### convex/inventory.ts — correct

`adjust`, `count`, and `reverse` all route through `applyStockChange` with
`variant_key` when a variant is specified. Fully correct.

### convex/catalogue.ts — correct

`saveProduct` calls `applyStockChange` for stock, never patches `products.stock`
directly. `saveVariants` also uses `applyStockChange`. Fully correct.

### Price colour — already green, no change needed

`src/styles.css` lines 1540–1546 define:
```css
--price-ink: color-mix(in oklch, var(--success) 80%, black);
```
where `--success: oklch(0.52 0.125 153)` is hue 153 — teal-green, not red.
All price surfaces already use `var(--price-ink)` or `.product-price { color: var(--price-ink) }`.
**No CSS change is needed.** The user's complaint about red prices was satisfied in a
prior session (confirmed by `.agents/tasks/holistic-audit-2026-10-15.md` and
`gap-fixes-review.md`).

---

## Changes required

**One file needs changing: `src/routes/product.$slug.tsx`**

### Fix 1 — Seed `chosen` from the first visible variant when the product loads

Add an effect that fires when `slug` changes AND the product has variants.
This seeds `chosen` with the first visible variant's options so the picker
is never in a blank state.

Currently at line ~57–60 (the useEffect for slug change):
```ts
useEffect(() => {
  setChosen({});
  setQuantity(1);
}, [slug]);
```

Replace with:
```ts
useEffect(() => {
  const firstVisible = variants.find((v) => v.visible);
  setChosen(firstVisible?.options ?? {});
  setQuantity(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [slug]);
```

**Rationale:** After this change, `chosen` starts with a complete set of axis values,
so `axes.every(axis => axis.values.includes(chosen[axis.name] ?? ""))` becomes true
on first render. The guard passes and `selectedOptions = chosen`, which reflects
user clicks from the very first render.

### Fix 2 — Simplify `selectedOptions` to always use `chosen` when it fully covers all axes, and merge partial choices otherwise

Replace lines ~69–76:
```ts
selectedOptions =
  axes.length > 0 && axes.every((axis) => axis.values.includes(chosen[axis.name] ?? ""))
    ? chosen
    : (variants.find((v) => v.visible)?.options ?? variants[0]?.options ?? {}),
```

With a two-step merge:
```ts
// Merge chosen over the first-variant defaults so any axis the user has
// explicitly picked is respected, and axes they haven't touched yet fall
// back to the first visible variant's value. This way the picker is always
// fully determined and user clicks are always reflected immediately.
const defaultOptions = variants.find((v) => v.visible)?.options ?? variants[0]?.options ?? {};
selectedOptions = axes.length > 0 ? { ...defaultOptions, ...chosen } : defaultOptions,
```

**Rationale:** The merge `{ ...defaultOptions, ...chosen }` means:
- On first render (after seeding `chosen` from Fix 1), `chosen = defaultOptions`, so
  `selectedOptions = defaultOptions`. Correct — first variant is pre-selected.
- After clicking "White": `chosen = { Colour: "White" }`, merged over defaults gives
  `{ Colour: "White", ...otherAxesFromDefault }`. Correct — user's choice wins.
- If the user clicks Size without touching Colour, the Colour still reflects the
  initial default. Correct.
- When `axes.length === 0` (no-variant product), `selectedOptions = defaultOptions = {}`.
  Correct — nothing changes for single-variant products.

### Fix 3 — Update `onSelect` callback to merge onto `chosen` (not `selectedOptions`)

Currently at line ~137:
```ts
onSelect={(axis, value) => setChosen({ ...selectedOptions, [axis]: value })}
```

This should merge onto `chosen` directly so each click accumulates independently:
```ts
onSelect={(axis, value) => setChosen((prev) => ({ ...prev, [axis]: value }))}
```

**Rationale:** With the current code, `onSelect` spreads `selectedOptions` (which
was computed from defaults) rather than the raw user choices. After Fix 1+2 this
would mostly work, but merging onto `prev` (the raw chosen state) is strictly correct
and avoids a subtle double-default re-introduction on each click.

---

## Implementation steps

- [x] 1. Edit `src/routes/product.$slug.tsx`:

      **Step A — fix the useEffect seed (around line 57–60)**

      Old:
      ```ts
      useEffect(() => {
        setChosen({});
        setQuantity(1);
      }, [slug]);
      ```

      New:
      ```ts
      useEffect(() => {
        const firstVisible = variants.find((v) => v.visible);
        setChosen(firstVisible?.options ?? {});
        setQuantity(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [slug]);
      ```

      Note: `p` is derived from `products.find(...)` — use `variants` (already in scope
      as `const axes = p.axes ?? [], variants = p.variants ?? []`) or reference it
      directly. The cleanest approach is to keep the existing `variants` const and
      reference it in the effect. Since `variants` is derived inside the component body
      *after* the `if (!p) return` guard, you may need to hoist the early return check.
      The safest implementation: move the `if (!p) return` check before the `useEffect`
      to ensure `p` is always defined — BUT React rules require all hooks to run before
      any early return. **Correct approach:** keep hooks before the early return, and
      inside the effect use `products.find((pr) => pr.id === slug)?.variants` or hoist
      `variants` into a variable above the effect using a conditional:

      ```ts
      // Declare these BEFORE the if(!p) guard so hooks always see them:
      const axes = p?.axes ?? [],
        variants = p?.variants ?? [];

      // The useEffect can now reference `variants` safely:
      useEffect(() => {
        const firstVisible = variants.find((v) => v.visible);
        setChosen(firstVisible?.options ?? {});
        setQuantity(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [slug]);

      if (!p) return <PageNotFound />;
      // ... rest of component
      ```

      This requires moving `const axes = ..., variants = ...` above the `if (!p)` guard
      and also above the `useEffect`. The current file has `const p = ...` before the
      hooks; it then hits the early return. The hooks currently follow the early return
      which is technically a React rules violation anyway (hooks after conditional return).
      Reorganize the component in this order:
      1. All `useState` and `useEffect` hooks
      2. `if (!p) return <PageNotFound />`
      3. Derived constants (`axes`, `variants`, `selectedOptions`, etc.)

      **Step B — fix selectedOptions computation (around line 69–76)**

      Old:
      ```ts
      selectedOptions =
        axes.length > 0 && axes.every((axis) => axis.values.includes(chosen[axis.name] ?? ""))
          ? chosen
          : (variants.find((v) => v.visible)?.options ?? variants[0]?.options ?? {}),
      ```

      New:
      ```ts
      selectedOptions = (() => {
        if (axes.length === 0) return {};
        const defaults = variants.find((v) => v.visible)?.options ?? variants[0]?.options ?? {};
        return { ...defaults, ...chosen };
      })(),
      ```

      Or equivalently as a plain `const` since we're restructuring the component body:
      ```ts
      const defaultOptions = variants.find((v) => v.visible)?.options ?? variants[0]?.options ?? {};
      const selectedOptions = axes.length > 0 ? { ...defaultOptions, ...chosen } : defaultOptions;
      ```

      **Step C — fix the onSelect callback (around line 135–137)**

      Old:
      ```ts
      onSelect={(axis, value) => setChosen({ ...selectedOptions, [axis]: value })}
      ```

      New:
      ```ts
      onSelect={(axis, value) => setChosen((prev) => ({ ...prev, [axis]: value }))}
      ```

      Files: `src/routes/product.$slug.tsx`
      Verify: `npx tsc --noEmit` — 0 errors.

- [x] 2. Run quality gates to confirm no regressions:

      ```powershell
      npx tsc --noEmit
      npm run lint
      npm test
      npm run build
      ```

      **Results (run after commit cc06c6f — verified by integration verifier):**
      - `npx tsc --noEmit` — ✅ 0 errors
      - `npm run lint` — ✅ 0 errors (7 pre-existing react-refresh warnings, as expected)
      - `npm test` — ✅ 216/216 tests passed across 15 files
      - `npm run build` — ✅ succeeded (built in 1.88s, .output/ generated)

      **Integration verification status: PASSED — all gates green, no fixes needed.**

---

## Convex schema changes

**None required.** The schema, all mutations, and all queries are correct as-is.
The bug is entirely in the front-end derived state computation.

## Summary of all file changes

| File | Change |
|------|--------|
| `src/routes/product.$slug.tsx` | Reorganize hooks before early return; seed `chosen` from first visible variant on slug change; fix `selectedOptions` to merge partial choices over defaults; fix `onSelect` to use functional state update |
| `src/styles.css` | No change — `--price-ink` is already emerald green |
| `src/components/variant-picker.tsx` | No change — logic is correct |
| `src/components/store-ui.tsx` | No change — `Quantity` max guard is correct |
| `src/routes/catalogue.tsx` | No change — quick-add redirect is correct |
| `src/routes/cart.tsx` | No change — quantity max derivation is correct |
| `convex/orders.ts` | No change — variant stock check is correct |
| `convex/lib/stock.ts` | No change — `applyStockChange` + `variantAggregate` correct |
| `convex/inventory.ts` | No change — all operations route through applyStockChange |
| `convex/catalogue.ts` | No change — saveProduct/saveVariants use applyStockChange |
