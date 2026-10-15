# Storefront fixes: variant picker, stock-cap quantity, green price colour — Pass 2

This is a second-pass review covering commit `fb78895`, which addresses all three HIGH/MEDIUM/LOW findings raised in the first-pass review (`a3de8b4`). The original change fixed three customer-facing gaps: products with variants being added to the cart without a selection, the quantity stepper having no stock awareness, and price text appearing red instead of green. Pass 1 flagged a React render-phase mutation, a stale `chosen` state on slug navigation, and an off-by-one in the variant redirect gate. All three are addressed in this commit.

**Watch for:**
- The `useEffect` clamp in `CartLines` omits `change` from its dependency array (confirmed, with an `eslint-disable` comment). The omission is safe in practice because `change` always wraps a stable `setLines` functional updater and the guard condition becomes false after one clamp — but it warrants attention on any future refactor that changes `change`'s behaviour.
- No new concerns introduced by this pass.

**Verdict**: APPROVED

---

## High-level view

The render-phase mutation from Pass 1 is correctly resolved. The `change(key, availableStock)` call that previously fired directly in the render body of `CartLines` has been moved into `useEffect([lines, data])`. The render body now computes `overStock` and `displayQty` as pure reads for display purposes only; the actual `setLines` call happens in the effect. The effect stabilises after one fire: after `change` clamps a line's quantity to `availableStock`, the next effect run finds `line.quantity === availableStock` and skips it. No infinite loop, no double-render.

The stale `chosen` state across slug navigation is addressed with a `useEffect(() => { setChosen({}); setQuantity(1); }, [slug])` added immediately after the `useState` declarations in `ProductPage`. This fires once per product before the render body makes any selection decisions, so the previous product's axis choices are gone before the new product's axes are examined. Both `chosen` and `quantity` are reset, preventing a stale quantity from carrying over to a lower-stock product.

The `optionCount > 1` gate in `ProductCard` — which would have allowed a single-variant product to bypass the redirect — is replaced with `axisCount >= 1`, where `axisCount = p.axes?.length ?? 0`. A product with any option axis at all now redirects to the detail page. The badge text still shows the variant count via `p.variants?.length ?? axisCount`, preserving the informational display.

The price colour work from Pass 1 is unchanged and correct. All storefront price surfaces use `--price-ink` via the CSS class (`product-price`, `sale-price`, `summary-total`) or inline style. No staff or admin route was touched.

---

<details>
<summary>Issues (0)</summary>

No new findings. All three Pass 1 findings are resolved.

</details>

---

<details>
<summary>Details</summary>

### CartLines clamp — useEffect correctness

The `useEffect` runs after every change to `lines` or `data`. For each line it computes `availableStock` by preferring the live `storeQuery` result for the product (and the specific variant when present), falling back to the cart-snapshot stock so the stepper renders correctly before the query returns. The clamp condition `availableStock > 0 && line.quantity > availableStock` has a deliberate asymmetry: it skips clamping when `availableStock === 0` (the `max={1}` on the stepper with the Add to Cart button disabled handles that state). After `change(key, availableStock)` fires and updates `lines`, the next effect invocation finds the condition false and exits. The loop terminates.

The `eslint-disable react-hooks/exhaustive-deps` on the `change` omission is justified: `change` in the provider is `const change = (key, q) => setLines((prev) => ...)` — a new closure on every render, not wrapped in `useCallback`. Including it in the dep array would cause the effect to re-fire on every `StoreProvider` render, reintroducing the instability the fix was meant to cure. Since `change` only calls `setLines` with a functional updater that reads `prev` — never the stale `lines` captured at definition time — the correctness is unaffected by the stale closure. The comment in the code explains this reasoning.

### Slug reset — chosen and quantity

The `useEffect([slug])` placement is correct: it comes before the `if (!p) return` guard, so it fires even on a not-found navigation. `setChosen({})` wipes axis selections. `setQuantity(1)` prevents a stale high quantity from applying to a lower-stock product before the effect fires. The validity gate for `selectedOptions`:

```ts
axes.length > 0 && axes.every((axis) => axis.values.includes(chosen[axis.name] ?? ""))
  ? chosen
  : variants.find((v) => v.visible)?.options ?? variants[0]?.options ?? {}
```

now has a clean `chosen = {}` to evaluate on every product load, so it always falls through to the first visible variant's options. The fallback is the same semantics the page had before the slug navigation concern was raised.

### axisCount gate

`p.axes` is populated in `productDTO` by `deriveAxes(variants)` whenever a product has variant rows. A product with one Colour variant and one Size variant gets `axes.length === 2`. A product with two Colour variants and no other axes gets `axes.length === 1`. Both correctly redirect to the detail page under `axisCount >= 1`. A plain product with no variants has `axes === undefined`, so `axisCount = 0` and the original `add(p)` path is taken. The fix matches the intended invariant: any product with an option axis requires the shopper to visit the detail page.

### Price colour — unchanged from Pass 1

No new surfaces were added or missed. The `--price-ink` CSS variable and its applications are confirmed correct. Staff routes are unaffected.

</details>

---

<details>
<summary>Files changed</summary>

| File | Change |
|---|---|
| `src/components/store-ui.tsx` | `useEffect` import added; `axisCount`/`>= 1` replaces `optionCount`/`> 1` in `ProductCard`; clamp moved from render body into `useEffect([lines, data])` in `CartLines`; render uses `displayQty` (pure read) |
| `src/routes/product.$slug.tsx` | `useEffect` added to React import; `useEffect([slug])` resets `chosen` and `quantity` on slug change |

Full diff: `git diff 7a85159 fb78895` in the workspace root.

</details>
