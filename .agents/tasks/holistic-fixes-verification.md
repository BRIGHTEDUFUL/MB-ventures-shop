# Holistic Fixes — Verification Evidence

**Date:** 2026-10-15  
**Iteration:** 2 (review finding addressed — verification evidence was missing)

## Changes Verified

All 4 fixes were already applied to source files prior to this run:

1. **Fix 1 — order-receipt.tsx**: Cast widened to include `variant_name?: string`; conditional `<span>` renders variant label below product name in receipt table.
2. **Fix 2 — index.tsx (hero price)**: `style={{ color: "var(--price-ink)" }}` added to `<p>` rendering `money(featured.price)` in the hero product card.
3. **Fix 3 — index.tsx (setup section prices)**: `money(p.price)` wrapped in `<span style={{ color: "var(--price-ink)" }}>` inside setup section ghost buttons.
4. **Fix 4 — account.tsx (order item summary)**: Item summary line added below status span; shows first item name (truncated at 40 chars) and `+ N more` count.

## Quality Gate Results

| Gate | Command | Result |
|------|---------|--------|
| TypeScript | `npx tsc --noEmit` | ✅ **0 errors** |
| Lint | `npm run lint` | ✅ **0 errors** (7 pre-existing react-refresh warnings — expected) |
| Tests | `npx vitest --run` | ✅ **216/216 passed** across 15 test files |
| Prettier | `npx prettier --check .` | ✅ **All files use Prettier code style** |
| Build | `npm run build` | ✅ **Succeeded** — `.output/` generated |

## Invariants Confirmed

- Staff/admin UI: untouched
- `variantKey()`: untouched  
- Price colours: `--price-ink` CSS variable used (green); no `text-red-*` introduced  
- Demo products: not deleted or modified  
- Backend `orders.mine`: no changes needed — `items` including `variant_name` already returned via `orderDTO()`
