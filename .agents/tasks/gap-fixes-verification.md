# Gap Fixes — Verification Record
**Date:** 15 October 2026  
**Iteration:** 1  
**All 5 gaps applied and verified.**

---

## 1. `npx tsc --noEmit`
**Result:** PASS — Exit code 0, 0 errors.

---

## 2. `npm run lint`
**Result:** PASS — Exit code 0, 0 errors. 7 pre-existing `react-refresh/only-export-components` warnings (expected per AGENTS.md §7).

Files with warnings (all pre-existing, none introduced by this change):
- `src/components/store-provider.tsx` line 110
- `src/components/ui/badge.tsx` line 32
- `src/components/ui/button.tsx` line 49
- `src/components/ui/form.tsx` line 163
- `src/components/ui/navigation-menu.tsx` line 111
- `src/components/ui/sidebar.tsx` line 743
- `src/components/ui/toggle.tsx` line 42

---

## 3. `npx vitest --run`
**Result:** PASS — 216/216 tests across 15 files.

```
Test Files  15 passed (15)
     Tests  216 passed (216)
  Start at  13:46:09
  Duration  10.26s
```

---

## 4. `npx prettier --check .`
**Result:** PASS — "All matched files use Prettier code style!"

---

## 5. `npm run build`
**Result:** PASS — Build succeeded ("✓ built in 5.45s"), output written to `.output/`.

---

## Changes applied

| Gap | File | Change |
|-----|------|--------|
| 1 | `src/components/variant-picker.tsx` | `enabled` now also requires `match.stock > 0` — out-of-stock visible variants are disabled |
| 2 | `convex/lib/dto.ts` | Added `variant_key?: string` and `variant_name?: string` to `OrderItem` type |
| 3 | `src/routes/staff/orders/$id.tsx` | Staff order items show product name + muted variant label on separate lines |
| 4 | `src/components/store-ui.tsx` | "Only X left" warning changed from `text-amber-600` to `text-orange-500` |
| 5 | `src/components/store-ui.tsx` | `Quantity` wrapper div gains `role="group" aria-label="Quantity"` |
