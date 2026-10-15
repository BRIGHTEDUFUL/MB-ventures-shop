# Backend Audit Report — MB Ventures GH

**Date:** 2026-10-15  
**Scope:** Convex backend audit for variant picker, stock-cap, and price-colour fixes

---

## 1. Files Verified

| File | Purpose |
|---|---|
| `convex/orders.ts` (place mutation, lines 97–190) | Order placement, variant resolution, stock reservation |
| `convex/lib/stock.ts` (applyStockChange function) | Single-writer stock mutation — variant and product aggregate paths |
| `convex/lib/dto.ts` (variantDTO, productDTO) | Public DTOs — verified variant stock is exposed |
| `convex/store.ts` (get query) | Public storefront bundle — verified variants + stock returned |
| `src/lib/store.ts` (storeQuery) | Frontend query — verified uses `api.store.get`, returns full StoreData |

---

## 2. Findings

### 2a. Variant resolution in orders.place — CORRECT (no change needed)

`orders.place` correctly:
- Reads `variant_key` from the order line
- Looks up the variant via `by_product_key` index (product_slug + key)
- Rejects a non-empty key that resolves to a missing or invisible variant
- Uses `variant.stock` (not `product.stock`) for the availability check when a variant is present
- Calls `applyStockChange` with `variant_key` so per-variant stock is decremented

### 2b. Per-variant stock decrement via applyStockChange — CORRECT (no change needed)

`applyStockChange` in `convex/lib/stock.ts`:
- When `variant_key` is present, patches the variant's `stock`/`reserved` counts
- Recomputes the product aggregate via `variantAggregate()` in the same transaction
- The aggregate and variant are always in sync — they cannot disagree

### 2c. Per-variant stock exposed to storefront — CORRECT (no change needed)

- `variantDTO` exposes `stock: variant.stock`
- `productDTO` passes the variant list (which includes stock) into the returned Product
- `store.get` loads all variant rows, groups by product, and passes them to `productDTO`
- `storeQuery` in `src/lib/store.ts` uses `api.store.get` and returns `StoreData` (with `products[]`, each containing `variants[]` when applicable)
- The cart page can read `liveProduct?.variants?.find(v => v.key === line.variant.key)?.stock` as designed

### 2d. **GAP FOUND AND FIXED** — Missing validation for variant-product lines with no variant_key

**The gap:** When `variant_key` is absent or empty, `orders.place` set `variant = null` and proceeded to use the product's base price and aggregate stock. There was no check that the product actually _requires_ a variant selection. A tampered cart (or any API caller) could order a variant-product at the base price without specifying a colour/size, bypassing per-variant stock isolation entirely.

**The fix:** After resolving `variant = null` (when `wantedKey === ""`), a query is made to `product_variants` for any visible variant on that product. If one exists, the mutation throws:

```ts
throw new ConvexError({ message: "Please select an option before ordering." });
```

**Degrades gracefully:** A product whose sole visible variant was just hidden/removed continues to be orderable as a plain (no-variant) product, since the query for visible variants returns nothing.

**File changed:** `convex/orders.ts`  
**Commit:** `fix: require variant_key when product has visible variants in orders.place`

---

## 3. No Other Changes

All other aspects of the backend were already correctly implemented:
- `applyStockChange` is never bypassed — the single-writer invariant holds
- `variantKey()` output format is unchanged
- No schema changes were made
- Demo products are untouched
- No OAuth, payment inputs, or non-Web3Forms email providers were introduced

---

## 4. Quality Gate Results

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run lint` | ✅ 0 errors (7 pre-existing react-refresh warnings only) |
| `npx vitest --run` | ✅ 216/216 tests passed |
| `npx prettier --check .` | ✅ All files formatted correctly |
| `npm run build` | ✅ Build succeeded |
