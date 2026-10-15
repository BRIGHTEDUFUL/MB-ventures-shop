# Storefront Fixes — Verification Record

**Iteration:** Second pass (addressing review findings from storefront-fixes-review.json)
**Commit:** fb78895
**Date:** 2026-10-15

---

## Review Findings Addressed

### HIGH — State mutation in render (CartLines clamp)

**Finding:** `if (overStock) change(key, clampedQty)` called `setLines` during the render phase
of `CartLines`, violating React's purity requirement and causing a guaranteed double-render.

**Fix:** Moved the clamp logic into a `useEffect([lines, data])` in `CartLines`. The render body
now only computes `displayQty` for display purposes (a pure read), and the `useEffect` fires the
`change()` call outside the render cycle. Added `eslint-disable react-hooks/exhaustive-deps`
comment because including `change` in the deps would cause an infinite loop (it's a new reference
on every render, not wrapped in `useCallback`).

### MEDIUM — Stale `chosen` state across slug navigation

**Finding:** `[chosen, setChosen] = useState({})` was never reset when TanStack Router reused
the same component instance for a new slug. Previous product's option choices could survive
momentarily for the new product.

**Fix:** Added `useEffect(() => { setChosen({}); setQuantity(1); }, [slug])` immediately after
the `useState` declarations in `ProductPage` (before the `if (!p) return` guard). Also resets
`quantity` to 1 on slug change, preventing stale quantity carrying over to a lower-stock product.
Added `useEffect` to the React import.

### LOW — `optionCount` counts variant rows instead of option axes

**Finding:** `optionCount = p.variants?.length ?? 0` with threshold `> 1` meant a product with
exactly one variant (one SKU, one axis) would never redirect to the detail page picker. The shopper
would silently add the product without its required variant_key.

**Fix:** Changed to `axisCount = p.axes?.length ?? 0` with threshold `>= 1`. This gates on the
presence of any option axis at all, not on the number of variant rows. The badge text still
shows the variant count via `p.variants?.length ?? axisCount`. All button/asChild/onClick/title
references updated from `optionCount > 1` to `axisCount >= 1`.

---

## Verification Results

### 1. TypeScript — `npx tsc --noEmit`
**Result: PASS** — 0 errors

### 2. Lint — `npm run lint`
**Result: PASS** — 0 errors, 7 pre-existing react-refresh warnings (expected)

### 3. Tests — `npx vitest --run`
**Result: PASS** — 216/216 tests across 15 files

```
Test Files  15 passed (15)
     Tests  216 passed (216)
  Duration  7.34s
```

### 4. Prettier — `npx prettier --check src/components/store-ui.tsx "src/routes/product.$slug.tsx"`
**Result: PASS** — All matched files use Prettier code style!

### 5. Build — `npm run build`
**Result: PASS** — Clean build, no errors

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/store-ui.tsx` | Added `useEffect` import; replaced `optionCount`/`> 1` with `axisCount`/`>= 1` in `ProductCard`; moved cart quantity clamp from render body into `useEffect([lines, data])` in `CartLines`; renamed `clampedQty` → `displayQty` in render |
| `src/routes/product.$slug.tsx` | Added `useEffect` to React import; added `useEffect([slug])` to reset `chosen` and `quantity` on product navigation |
