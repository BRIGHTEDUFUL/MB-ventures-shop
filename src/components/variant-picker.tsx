import { type Product } from "@/lib/store";
import { combineAxes, variantKey } from "../../convex/lib/variants";

/**
 * The option picker: one row per axis, colour axis first (that ordering
 * already comes back from the server in `product.axes`).
 *
 * Every chip is resolved against `product.variants` before it renders, so a
 * combination the shop does not actually sell is disabled rather than offered
 * and then refused at checkout — the shopper can only ever walk the page
 * towards a variant that exists. The keys are the canonical ones from
 * `convex/lib/variants.ts`, the same strings the cart, the order lines and the
 * stock ledger point at, so the picker can never disagree with the backend.
 *
 * The colour circle is the hex the server worked out (`Variant.swatch`). When
 * that is `null` the colour name is not in the swatch table and the chip is
 * plain text: showing a *wrong* colour is worse than showing none, so nothing
 * here ever guesses a hex.
 *
 * When the product has no variant axes the component renders an empty
 * placeholder div with the same top margin, keeping the CTA buttons at a
 * consistent vertical position regardless of whether variant axes exist.
 */
export function VariantPicker({
  product,
  selected,
  onSelect,
}: {
  product: Product;
  /** Axis name → chosen value. Always one value per axis this product has. */
  selected: Record<string, string>;
  onSelect: (axis: string, value: string) => void;
}) {
  const axes = product.axes ?? [];
  const variants = product.variants ?? [];

  // Empty placeholder keeps the CTA buttons at a fixed vertical position
  // whether or not the product has variant axes. Without this the Add-to-cart
  // row jumps up on products without options, making the page feel inconsistent
  // when navigating between products.
  if (axes.length === 0 || variants.length === 0) {
    return <div className="mt-7" aria-hidden />;
  }

  const axisNames = axes.map((axis) => axis.name);
  // The full option grid, keyed the way a variant is keyed. A chip is enabled
  // only when the cell it would land on has a variant behind it, which is what
  // keeps an impossible combination from ever reaching the cart.
  const cells = new Map(
    combineAxes(axes).map((cell) => [cell.key, variants.find((v) => v.key === cell.key) ?? null]),
  );

  // Base classes shared by every chip regardless of type, state, or axis.
  // h-9 (36px logical, 44px min touch via the inline min-h) + px-4 keeps text
  // chips and colour chips on the same grid row without an explicit height on
  // the swatch buttons.
  const chipBase =
    "inline-flex h-9 min-h-[44px] min-w-[44px] max-w-full items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <div className="mt-7 space-y-5">
      {axes.map((axis) => (
        <div key={axis.name} role="group" aria-label={axis.name}>
          <p className="mb-2 text-sm font-medium text-muted-foreground">{axis.name}</p>
          <div className="flex flex-wrap gap-2">
            {axis.values.map((value) => {
              const match =
                cells.get(variantKey({ ...selected, [axis.name]: value }, axisNames)) ?? null;
              // A hidden variant is as unbuyable as one that does not exist —
              // orders.place refuses both — so both render disabled, and the
              // label says which of the two the shopper is looking at.
              const enabled = match !== null && match.visible && match.stock > 0;
              const availability =
                match === null || !match.visible
                  ? "unavailable"
                  : match.stock === 0
                    ? "out of stock"
                    : `${match.stock} in stock`;
              // The hex lives on a variant, so it is read from one carrying
              // this colour — preferring the variant the choice resolves to,
              // so the circle always matches what would turn up. Only the
              // colour axis gets one; on a Size row every variant carries its
              // parent colour, and painting that next to "Large" would lie.
              const swatch = axis.colour
                ? ((match ?? variants.find((v) => v.options[axis.name] === value))?.swatch ?? null)
                : null;
              const pressed = (selected[axis.name] ?? "") === value;

              // Disabled: same opacity + cursor treatment for both chip types.
              // Selected (pressed): 2-px primary border + subtle tinted bg so
              //   the highlight reads clearly without needing a filled button.
              // Default in-stock: card background, border on hover.
              const chipClass = !enabled
                ? "cursor-not-allowed border-border bg-card text-muted-foreground opacity-40"
                : pressed
                  ? "cursor-pointer border-2 border-primary bg-primary/10 text-primary ring-2 ring-primary/20 ring-offset-1"
                  : "cursor-pointer border-border bg-card text-foreground hover:border-primary/60 hover:bg-secondary";

              return (
                <button
                  key={value}
                  type="button"
                  disabled={!enabled}
                  aria-pressed={pressed}
                  aria-label={`${value}, ${availability}`}
                  onClick={() => onSelect(axis.name, value)}
                  className={`${chipBase} ${chipClass}`}
                >
                  {swatch !== null && (
                    <span
                      aria-hidden
                      className={
                        "size-4 shrink-0 rounded-full border" +
                        (pressed ? " border-primary" : " border-border")
                      }
                      style={{ backgroundColor: swatch }}
                    />
                  )}
                  {/* Long colour names must wrap rather than push the row past
                      the 320px phone floor. */}
                  <span className="min-w-0 break-words">{value}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
