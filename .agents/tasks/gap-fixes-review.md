# Five storefront gap fixes: variant picker, order type, staff order view, warning colour, quantity a11y

Five targeted fixes addressing the gaps identified on 15 October 2026. The changes cover one frontend-only logic fix (variant chip disabled state), one TypeScript type gap (OrderItem), one staff UI improvement (variant label in order detail), one CSS class swap (warning colour), and one accessibility attribute addition (Quantity group role). No backend mutations, no schema changes, no new dependencies. All five quality gates — tsc, lint, vitest, prettier, build — pass clean.

Watch for: the staff order view name-splitting logic uses `String.replace()` to strip the variant suffix from the compound name field — this is a fragile pattern that can silently mangle product names containing ` — ` in their own title. Confidence: **confirmed** (see details). Everything else is straightforward and correct.

**Verdict**: APPROVED

---

## High-level view

The variant chip disabled-state fix is complete and correct. `enabled` now requires `match.stock > 0` in addition to `match.visible`, matching exactly what `orders.place` enforces server-side. The chip's disabled styling and ARIA label were already correct; this one expression change closes the gap between what the UI permitted and what the backend accepts.

The `OrderItem` type addition in `convex/lib/dto.ts` is a straightforward catch-up — the schema already declared both fields, the `orderDTO` function already passes `order.items` through unmodified, so only the TypeScript declaration was missing. Both fields are correctly marked optional to preserve compatibility with pre-variant historical orders.

The staff order detail view now splits the compound `"Product — Variant"` name using `String.replace()`. The approach works for the current naming convention but carries a fragility: if a product name itself contains ` — `, the replace will consume part of the product title. This is a known trade-off documented in the plan; it is not a blocker since no current product name contains that pattern, but it is worth noting.

The `text-amber-600` → `text-orange-500` swap on the "Only X left" warning is confirmed. A search across all storefront TSX files shows no remaining `text-red-*` or `text-amber-*` occurrences, and the `--price-ink` emerald-green CSS variable on all price surfaces is untouched.

The `role="group" aria-label="Quantity"` addition to the Quantity component wrapper is confirmed and correct. The existing `aria-live="polite"` on the count span remains in place; there is no double-announcement risk.

---

<details>
<summary>Issues (1)</summary>

1. **Fragile name-splitting in staff order view** — `item.name.replace(\` — ${item.variant_name}\`, "")` will silently truncate any product whose own name contains the literal string ` — `. No current product has this pattern, but it is a latent correctness hazard. To eliminate it, store `product_name` as a separate field on the order item in `orders.place` (or derive it from `item.name.split(" — ")[0]` only when a trusted separator is guaranteed). This is low priority for the current inventory but should be addressed before adding products with em-dash styling in their names.

</details>

---

<details>
<summary>Details</summary>

### Gap 1 — Out-of-stock variant chips correctly disabled

`variant-picker.tsx` line 51 now reads:

```ts
const enabled = match !== null && match.visible && match.stock > 0;
```

The disabled chip styling (`cursor-not-allowed opacity-50`), the `disabled={!enabled}` button attribute, and the `aria-label` fallback to `"out of stock"` were already present in the base code. This single expression change makes the visible-but-zero-stock case map to the disabled path. Confirmed by reading the full file. No new TypeScript errors introduced.

### Gap 2 — OrderItem type now includes variant fields

`convex/lib/dto.ts` `OrderItem` carries:

```ts
variant_key?: string;
variant_name?: string;
```

Both are optional, which is correct — every order placed before variants were introduced still validates. The schema at `convex/schema.ts` lines 399–400 confirms both fields were already declared on the `items` array validator. The `orderDTO` function passes `items: order.items` unmodified, so no runtime data is lost in either direction. TypeScript will now resolve `item.variant_key` and `item.variant_name` on `OrderItem` values, which unblocks Gap 3 without error.

### Gap 3 — Staff order view: fragile name-splitting

The staff order items block now renders:

```tsx
{item.variant_name
  ? item.name.replace(` — ${item.variant_name}`, "")
  : item.name}
...
{item.variant_name && (
  <p className="mt-0.5 text-xs text-muted-foreground">{item.variant_name}</p>
)}
```

The muted secondary line for `variant_name` is correct — conditional on truthiness, uses the right `text-xs text-muted-foreground` style, and is not a link. The product name link correctly continues to link to `/product/$slug`.

The name-splitting step uses `String.replace()` to remove the variant suffix appended by `orders.place`. This works correctly for every product in the current inventory because no product name contains the literal string ` — `. However, the approach is fragile: if a product name were titled "Carbon — Pro Edition" and its variant_name were "Pro Edition", the replace would leave only "Carbon" — silently wrong. The plan documents this as a known trade-off; the current inventory makes it safe. Confidence: **confirmed** — checked against the 11 real product names in AGENTS.md §8, none contain ` — `.

### Gap 4 — Warning colour confirmed changed

`store-ui.tsx` line 186 reads `text-orange-500` (confirmed by reading the file). A grep across all `src/**/*.tsx` finds zero remaining `text-red-*` or `text-amber-*` occurrences. The `--price-ink` variable continues to be the sole mechanism for price colour on all storefront surfaces: `.product-price`, `.sale-price`, product detail page, cart line totals, and shell search results.

### Gap 5 — Quantity a11y confirmed

`store-ui.tsx` Quantity component wrapper reads `<div className="quantity" role="group" aria-label="Quantity">`. The `aria-live="polite"` on the count span is preserved. No double-announcement risk: `aria-label` on the group names the control type; `aria-live` on the count announces value changes only.

### Invariants confirmed

- `applyStockChange` remains the only stock mutator — grep for `ctx.db.patch.*stock` returns no matches.
- `variantKey()` function signature and body are untouched — confirmed by reading `convex/lib/variants.ts`.
- No `text-red-*` introduced anywhere in storefront components or routes.
- Staff/admin colour scheme untouched — none of the five changes touch any file under `src/routes/staff/` except the variant label addition in `orders/$id.tsx`, which uses only `text-muted-foreground` (the existing muted style already used throughout the staff UI).

</details>

---

<details>
<summary>Files changed</summary>

| File | What changed |
|------|-------------|
| `src/components/variant-picker.tsx` | `enabled` expression gains `&& match.stock > 0` |
| `convex/lib/dto.ts` | `OrderItem` type gains `variant_key?` and `variant_name?` |
| `src/routes/staff/orders/$id.tsx` | Items panel splits compound name and shows muted variant label line |
| `src/components/store-ui.tsx` | "Only X left" class `text-amber-600` → `text-orange-500`; Quantity wrapper gains `role="group" aria-label="Quantity"` |

</details>
