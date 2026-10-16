# Product variants — design and spec

Added 12 October 2026. This is the contract for the variants feature: read it
before touching `product_variants`, `applyStockChange`, the cart or checkout.

---

## 1. What a variant is

A **variant** is one buyable version of a product: _Black_, _White_, _Large_,
_Black / Large_. Each has its own stock, its own price (or inherits the
product's) and its own SKU.

A product has **zero or more** variants.

- **Zero variants** → the product behaves exactly as before. Nothing about the
  old path changes: `products.stock` is authoritative, `orders.place` reserves
  against the product, the storefront shows one price. Every pre-existing
  product, order and test keeps working untouched.
- **One or more variants** → the variants become the unit of sale. The product
  row still exists as the _parent_; it carries the shared copy, photo, category
  and description, and its `stock` / `reserved` become a **derived aggregate**
  (the sum across variants) so that every existing reader — the catalogue
  badge, the low-stock panel, data health, the staff product list — keeps
  working with no change.

The user's example, in this model:

```
Carbon Fiber Desk            stock 7   ← derived: 4 + 3
├─ Black   stock 4  GH₵ 1450  SKU DESK-BLK
└─ White   stock 3  GH₵ 1450  SKU DESK-WHT
```

---

## 2. Option axes and colour

Variants are defined by **option axes**. An axis is a named dimension with a
list of values:

| axis       | values               |
| ---------- | -------------------- |
| `Colour`   | Black, White, Silver |
| `Size`     | S, M, L              |
| `Material` | Aluminium, Steel     |

An axis set is _not_ a separate table. Axes are **derived** from the variants'
`options` records — one source of truth, so an axis can never drift out of sync
with the variants that use it. Add a value to an axis by adding a variant that
carries it.

A variant's `key` is the canonical, slug-safe identity of its combination:

```
"black"           → Colour=Black
"black--l"        → Colour=Black + Size=L
"space-grey-128"  → Colour=Space Grey + Storage=128
```

Keys are built by joining each axis value in the product's declared axis order,
slugified and lower-cased, with `--`. They are **stable** — a key never changes
once saved, because order lines, the cart and the stock ledger all point at it.

### Colour is a first-class axis

Colour is the axis this shop actually sells on, so it is treated specially in
three places:

1. **Swatches.** The storefront picker renders known colour names as a filled
   colour chip _in addition to_ the text label, so a shopper sees the colour
   rather than reading it. `convex/lib/variants.ts` exports
   `COLOUR_SWATCHES`, a map of ~50 common colour names to hex values. A colour
   that isn't in the map (a shop-specific name like "Midnight") falls back to a
   plain text chip — never a wrong or invented colour.
2. **Axis recognition.** An axis named `Colour`, `Color` or `Colorway`
   (case-insensitive) is treated as the colour axis: it renders as swatches,
   and it is the axis the product page offers first. `isColourAxis()` is the
   single place that decides.
3. **Line identity.** When an order line carries a colour, the colour is part of
   the line's display name ("Desk — Black"), so staff, receipts and the
   top-sellers report read the colour back.

---

## 3. Data model

### `product_variants` (new table)

```ts
product_variants: defineTable({
  product_slug: v.string(), // parent, `products.slug`
  key: v.string(), // "black--l" — unique within the product
  name: v.string(), // display label, e.g. "Black" or "Black / L"
  options: v.record(v.string(), v.string()), // { Colour: "Black", Size: "L" }
  price: v.optional(v.number()), // absent = inherit parent price
  sku: v.optional(v.string()),
  barcode: v.optional(v.string()),
  image_key: v.optional(v.string()), // absent = parent photo
  stock: v.number(),
  reserved: v.optional(v.number()),
  version: v.optional(v.number()),
  cost_price: v.optional(v.number()),
  sort_order: v.number(),
  visible: v.boolean(),
})
  .index("by_product", ["product_slug"])
  .index("by_product_key", ["product_slug", "key"])
  .index("by_sku", ["sku"]);
```

`stock` / `reserved` / `version` are named identically to the product fields on
purpose — `applyStockChange` handles both shapes with one code path, and the
single-writer source scan keeps policing them, because **no file outside
`convex/lib/stock.ts` may patch them**.

### Schema additions to existing tables

| table               | field                           | note                                     |
| ------------------- | ------------------------------- | ---------------------------------------- |
| `orders.items[]`    | `variant_key?`, `variant_name?` | optional → old orders keep validating    |
| `inventory_history` | `variant_key?`, `variant_name?` | optional → old movements keep validating |

No backfill needed anywhere: every addition is `v.optional`.

---

## 4. Stock — the single writer still holds

This is the part that must not be got wrong.

`applyStockChange` gains one optional field, `variant_key`. When it is present:

1. The variant row is the unit being moved, and the command arithmetic
   (`adjust` / `set_on_hand` / `reserve` / `release` / `commit` / `restock`) runs
   against **the variant's** stock and reserved.
2. The parent product's `stock` and `reserved` are then **recomputed as the sum
   across all visible-and-invisible variants** and written in the same patch.
   The aggregate is derived, never edited by hand.
3. Exactly **one** ledger row is written, naming the variant in
   `variant_key` / `variant_name` and the parent in `product_slug`, so the
   inventory log reads "Carbon Fiber Desk — Black: 4 → 3".
4. `products.version` and the variant's `version` both bump.

So: **variants do not create a second writer.** They extend the one that
exists. `src/test/stock-single-writer.test.ts` still passes with no edit,
because `convex/lib/stock.ts` remains the only file allowed to touch either
table's stock.

Derived-aggregate rules:

- The parent aggregate includes every variant regardless of `visible` — a
  hidden variant's units are still physically on the shelf and must not be
  silently sold.
- A product with variants whose aggregate is 0 reads as out of stock
  everywhere, exactly like a variantless product with `stock: 0`.
- Deleting the last variant **hands stock back to the parent** through
  `applyStockChange` (a `restock` movement), rather than zeroing the product —
  the units do not evaporate.

---

## 5. Cart, checkout and orders

Cart lines gain a variant:

```ts
type Line = { product: Product; variant?: Variant; quantity: number };
```

- The **merge key** becomes `product.id + "/" + (variant?.key ?? "")`, so Black
  and White sit on two lines and two Blacks merge into one.
- The line persists to `localStorage` with the variant snapshot, so a cart
  survives a reload with its colours intact.
- `subtotal` uses the **effective price** (variant price if set, else product).

`orders.place` takes `items: [{ id, quantity, variant_key? }]`. Server-side:

- `id` still resolves the parent by `by_slug` (unchanged).
- `variant_key`, when present, resolves the variant; the **server recomputes
  the price** from the variant and refuses the line if that variant is not
  `visible` or lacks stock. The browser never sets a price.
- The reservation is `applyStockChange({ slug, variant_key, command: reserve })`.
- The stored line records `variant_key` and `variant_name`, and its `name`
  already carries the colour ("Desk — Black").

`orders.staffUpdate` releases, commits and restocks against the same
`variant_key` the line recorded, so cancelling an order returns stock to
_Black_, not to the product as a whole.

Idempotency keys become `place:${reference}:${slug}:${variantKey}` — one intent,
one movement, per line.

---

## 6. Storefront

### Product page

- When the product has variants, the picker renders **one row per axis**, in the
  product's declared axis order.
- Colour axes render as swatches; every other axis renders as text chips.
- Chips are 44px minimum on phones, keyboard-operable, and carry
  `aria-pressed` / `aria-label` ("Black, 4 in stock").
- A combination with no variant behind it renders **disabled**, so a shopper
  cannot reach a dead end and then fail at checkout.
- Selecting a variant updates price, stock line, SKU and the delivery estimate
  in place.
- **Photos follow the option.** A variant's own photo (`image_key`) leads the
  product page's gallery the moment that option is picked; an option without
  one falls back to the product's own photos. `buildGallery`
  (`src/lib/store-images.ts`) builds the list — option photo first, then the
  product's main photo, then its gallery, each photo once.
- The gallery (`src/components/product-gallery.tsx`) steps through the photos
  with previous/next arrows, a swipe on touch screens and the thumbnail strip;
  arrows and swipe exist only when there is more than one photo. The zoom
  viewer steps through the same list. The index resets to the option's photo
  when the choice changes, and clamps when a shorter list takes over.
- "Add to cart" and "Buy now" are disabled when the selected combination is out
  of stock, and the button label names the choice ("Add Black to cart") when a
  single axis is in play.
- The product card and catalogue keep showing the parent's aggregate — a grid is
  not the place to pick a colour.

### Colour rendering

`src/components/variant-picker.tsx` owns swatch rendering. The hex map is
generated server-side into the variant DTO (`swatch`), so the client never
duplicates the colour table and a new colour name only has to be added in one
place (`convex/lib/variants.ts`).

---

## 7. Staff

### Product editor — new "Variants" panel

- Axis editor: add/remove axes, rename them, reorder their values.
- **Build combinations** button: cross-multiplies the axes into variant rows,
  preserving rows that already exist (matched by key) so re-generating never
  discards stock or a SKU someone typed.
- Per-variant row: name (auto, editable), price override, SKU, **photo**
  (upload/replace/remove — saved with the row, shown to shoppers as that
  option's lead image), stock.
- Stock on this panel is written through `catalogue.saveVariants`, which routes
  each change through `applyStockChange` — the form never patches stock.

### Inventory page

- A product with variants expands to show one row per variant, each with the
  same "change by / I counted" control the product row has.
- `inventory.adjust` and `inventory.count` accept an optional `variant_key`.
- The movement log shows the variant label on every row that has one.

### Data health

- `duplicate_sku` now scans variant SKUs alongside product SKUs — a variant SKU
  colliding with a product SKU is caught.
- `order_missing_product` resolves an order line through its variant as well as
  its product.

---

## 8. Permissions

No new permission key. Variants live entirely inside permissions that already
exist:

| action                      | permission            |
| --------------------------- | --------------------- |
| create/edit/delete variants | `catalogue.edit`      |
| adjust variant stock        | `inventory.adjust`    |
| stocktake a variant         | `inventory.stocktake` |

An attendant can therefore manage variants exactly as they manage products
today; the owner keeps team and email.

---

## 9. Deliberate limits

- **No cross-product option reuse.** Axes are per-product. A shop with 40 desks
  wanting the same three colours re-enters them; a shared "colour library" is
  machinery with no user here. (Recorded as a possible future enhancement.)
- **No generated matrix on the storefront.** A product with 3 axes × 4 values
  has 64 combinations; the picker offers them, it does not list them.
- **No variant-level delivery zones or weight.** Delivery is a store-wide fee
  schedule.
- **No partial-variant deletion while an open order holds it** — same rule as
  products: cancel the order first.

---

## 10. Invariants checklist

Before shipping, all of these must hold:

- [ ] `src/test/stock-single-writer.test.ts` passes **unmodified**
- [ ] A product with no variants behaves byte-identically to before
- [ ] `orders.place` recomputes variant price server-side
- [ ] Cancelling an order returns stock to the exact variant
- [ ] Colour swatches fall back to text rather than guessing a hex
- [ ] Every new interactive control is ≥44px on phones
- [ ] 320px: no horizontal overflow on the product page with 3 axes
