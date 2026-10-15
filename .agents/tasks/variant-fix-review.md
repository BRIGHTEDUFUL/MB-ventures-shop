# Variant picker: selection fix and UI consistency pass

Two commits tighten the product page's option-picker: `cc06c6f` fixes the broken
selection logic (hooks ordering, blank initial state, broken chosen guard), and
`a038b95` follows up with a visual consistency pass (unified chip geometry,
stable CTA position across products with and without variants).

Watch for: the `useEffect` dependency on `variants` is intentionally suppressed
with an eslint-disable comment — this is technically correct for the intended
behaviour but creates a latent stale-closure risk if `variants` ever changes
independently of `slug`. The no-variant placeholder (`<div className="mt-7"
aria-hidden />`) carries `aria-hidden` on a div with no role, which is harmless
but slightly untidy.

**Verdict**: APPROVED

---

## High-level view

The hooks-above-early-return fix is correct and complete: `axes`, `variants`,
and the `useEffect` are all hoisted before `if (!p) return <PageNotFound />`,
and no hook appears after that guard. The `chosen` seeding inside the effect
means the picker is fully determined on first render and never shows a blank
state.

The `selectedOptions` merge (`{ ...defaultOptions, ...chosen }`) replaces the
old `axes.every()` guard, which failed whenever `chosen` was `{}` on first
render (before the effect ran) — the user had to click a chip just to activate
the selection, even though the product already had a default variant. The new
logic is always valid: `defaultOptions` covers every axis, and `chosen` overlays
the user's explicit clicks on top.

The `onSelect` functional update (`setChosen((prev) => ({ ...prev, [axis]: value })`)
is the correct form: it avoids the stale-closure problem that would arise if
`onSelect` closed over a render-cycle-old snapshot of `chosen`.

The UI consistency pass fixes the gap that made the Add-to-cart row jump upward
on products without variants. The placeholder div (`mt-7`) preserves the same
top-margin as the real picker, so the vertical rhythm is identical. Chip geometry
is now shared (`h-9 min-h-[44px] px-4 rounded-md font-medium`) — the old code
used `px-3 py-2 rounded-xl` and no explicit height, which let colour chips and
text chips drift to different heights when the swatch circle added internal
padding. The selected-state treatment changed from a filled primary button to a
tinted outline (`bg-primary/10 border-2 border-primary ring-2 ring-primary/20`),
which preserves the text colour (readable on light and dark themes) while giving
a clear highlight.

---

<details>
<summary>Issues (2)</summary>

1. **Suppressed effect dependency on `variants`** — `useEffect(() => { … }, [slug])` reads `variants` but omits it from the dependency array (suppressed with eslint-disable). Today `variants` changes only when `slug` changes, so the suppression is harmless. If a future feature causes `variants` to update without a slug change (e.g. real-time stock push), the effect will not re-run and `chosen` will not reseed. Mitigate when reactive stock updates are added; for now the suppression is an accepted tradeoff.

2. **`aria-hidden` on placeholder `<div>`** — `<div className="mt-7" aria-hidden />` uses `aria-hidden` on a presentational div that has no interactive content and no role. The attribute is redundant (browsers ignore `aria-hidden` on empty divs) but not harmful. Remove the attribute to keep the markup clean.

</details>

---

<details>
<summary>Details</summary>

### Hooks above the early return — confirmed clean

Before this fix `axes`, `variants`, and the `useEffect` all sat below `useState`
but above `if (!p) return <PageNotFound />`. The lint error was triggered because
`axes` and `variants` were derived from `p` (which could be undefined) and only
moved above the guard in this commit. The current file has:

```tsx
const axes = p?.axes ?? [],
  variants = p?.variants ?? [];

useEffect(() => { … }, [slug]);

if (!p) return <PageNotFound />;
```

No hook appears after the guard. The `useSuspenseQuery` and all `useState` calls
are in the destructure at the top of the function, unambiguously before any
conditional. Confirmed clean.

### Chosen seed and merge logic

The previous guard, `axes.every((axis) => axis.values.includes(chosen[axis.name] ?? ""))`,
returned false on the very first render because `chosen` started as `{}`.
That caused `selectedOptions` to fall back to `variants.find(v => v.visible)?.options`,
which was the correct value — but it was computed *around* `chosen` rather than
*from* it, so clicking a chip set `chosen` but on the next render the guard
still failed (the newly-set key hadn't propagated yet because the guard checked
all axes, not just the one that was clicked). The chip `onSelect` was using
`setChosen({ ...selectedOptions, [axis]: value })` which spread the resolved
fallback rather than the raw state, masking the underlying guard failure.

The new approach:

```tsx
const defaultOptions = variants.find(v => v.visible)?.options ?? variants[0]?.options ?? {};
const selectedOptions = axes.length > 0 ? { ...defaultOptions, ...chosen } : defaultOptions;
```

`defaultOptions` is always a complete set of axis keys, so `selectedOptions` is
always a valid variant key. `chosen` contains only the axes the user has
explicitly touched, so it overrides only what the user changed. On first render
`chosen` is `{}` and `selectedOptions === defaultOptions`. After the effect fires
`chosen` is seeded from the first visible variant (same value as `defaultOptions`),
so the merge is idempotent. After a user click `chosen[axis]` is set and that
axis's value diverges from the default.

**Single-axis product (Colour only):** `defaultOptions` has one key, `chosen`
may have zero or one. Works correctly. **Two-axis product (Colour + Size):**
`defaultOptions` has two keys. If the user clicks Colour but not Size, `chosen`
has one key and the merge fills in the missing Size from the default — the
variant lookup lands on a real variant. Works correctly. **No-variants product:**
`axes.length === 0` so `selectedOptions = defaultOptions = {}`. `selectedVariant`
resolves to undefined, and the price/stock fall back to `p.price`/`p.stock`.
`soldOut` uses `variants.length > 0 || p.stock === 0` — for a no-variant product
`variants.length === 0` so `soldOut` is driven purely by `p.stock`. Works correctly.

### Out-of-stock chip disabling

The `enabled` flag in `VariantPicker` is:

```tsx
const enabled = match !== null && match.visible && match.stock > 0;
```

`match` is the variant found by looking up the full key after substituting the
chip's value into the current selection. Because `selected` (= `selectedOptions`)
is now always a complete set of keys, `variantKey({ ...selected, [axis.name]: value }, axisNames)`
always resolves to a real key. Before the fix `selected` could be `{}` on first
render, causing `variantKey` to produce a key like `colour:black` when the real
keys are `colour:black|size:m` — the `cells` map would miss and `match` would be
`null`, disabling every chip. That race is gone.

### Chip geometry and visual consistency

The old `chipBase` had no explicit height (`py-2` plus line-height determined
height implicitly) and `rounded-xl`. A colour chip with a swatch circle inside
measured taller than a plain-text chip because the circle added internal height
through the `gap-2` spacing. The new `h-9 min-h-[44px] px-4 rounded-md` gives
both types the same logical height. `min-h-[44px]` preserves the touch-target
floor required by WCAG 2.5.8 regardless of content. The `rounded-md` (6px)
replaces `rounded-xl` (12px), which brings chip corners in line with the rest of
the shadcn/ui component set used on the page (Button, select).

The selected-state change from `bg-primary text-primary-foreground` (filled) to
`bg-primary/10 border-2 border-primary text-primary ring-2 ring-primary/20` (tinted
outline) avoids the white-on-coloured-background contrast risk that the old filled
chip introduced when `--primary` is a mid-range hue. The ring adds a second
visual cue alongside the border for users who perceive colour unreliably.

### No-variant layout stability

Previously `VariantPicker` returned `null` for products without axes. The calling
code (`product.$slug.tsx`) placed the picker between the price/stock line and
`<div className="mt-7 flex gap-4">` (the Add-to-cart row). When the picker
returned `null`, the `mt-7` on the Add-to-cart div still applied but the page
height was shorter by the typical `mt-7 space-y-5` block that a two-option
product produces. Navigating from a product with variants to one without variants
caused the CTA buttons to jump upward noticeably.

The fix returns `<div className="mt-7" aria-hidden />` — a zero-height spacer
with the same top margin as the real picker's outer div. This is a reasonable
choice: it doesn't reserve the full height of a picker row (which would leave a
confusing blank region), but it does anchor the CTA buttons to the same baseline
they would sit at if the product had no variants at all. The page layout is
identical between a product with zero variants and a product where the server
returns `axes: []`.

One minor note: `aria-hidden` on a div with no content is redundant. Assistive
technologies already skip empty, non-interactive divs. Removing the attribute
would make the intent clearer (it's a layout spacer, not hidden content).

</details>

---

<details>
<summary>Files changed</summary>

| File | What changed |
|---|---|
| `src/routes/product.$slug.tsx` | Hoisted `axes`, `variants`, and `useEffect` above early return; seeded `chosen` from first visible variant in effect; replaced `axes.every()` guard with `{ ...defaultOptions, ...chosen }` merge; switched `onSelect` to functional `setChosen` update |
| `src/components/variant-picker.tsx` | `null` return replaced with `<div className="mt-7">` placeholder; unified `chipBase` to `h-9 min-h-[44px] px-4 rounded-md font-medium`; selected state changed from filled primary to tinted outline; swatch border follows pressed state; opacity reduced from 50% to 40% on disabled chips |

Full diff: `git diff 9dcf3d8 HEAD`

</details>
