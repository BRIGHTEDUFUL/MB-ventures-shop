/**
 * Option axes, variant keys and colour swatches.
 *
 * Everything in this file is **pure**: no Convex imports, no ctx, no I/O. That
 * is deliberate — the key-building rule is depended on by the cart, the stock
 * ledger, order lines and the storefront picker, so it must be identical in
 * every one of those places and unit-testable on its own.
 *
 * The one rule that matters most: **`variantKey` is canonical and stable.**
 * A key is written into `product_variants.key`, into `orders.items[].variant_key`
 * and into every `inventory_history` row. If it ever changed meaning, past
 * orders would point at the wrong colour.
 */

/**
 * Colour name → hex, for rendering a swatch instead of (as well as) a word.
 *
 * A shop trading in workspace gear sells a narrow, predictable palette, so the
 * common names are covered. A name that is missing — a supplier's "Midnight
 * Tide", say — must fall back to a plain text chip: showing a *wrong* colour is
 * worse than showing none, so `swatchFor` never guesses and never interpolates.
 */
export const COLOUR_SWATCHES: Record<string, string> = {
  black: "#1c1c1e",
  "jet black": "#1c1c1e",
  "matte black": "#2b2b2b",
  "carbon black": "#35383b",
  white: "#f7f7f5",
  "off-white": "#efece4",
  ivory: "#fbf7ec",
  silver: "#c0c4c8",
  "space grey": "#8e9196",
  "space gray": "#8e9196",
  gray: "#8e9196",
  grey: "#8e9196",
  charcoal: "#4b4f54",
  graphite: "#5b6068",
  gunmetal: "#53565c",
  midnight: "#23272f",
  "midnight blue": "#26394f",
  navy: "#26394f",
  blue: "#2f6fb5",
  "royal blue": "#2a5db0",
  "sky blue": "#6fb3e0",
  "light blue": "#a8cbe8",
  "dark blue": "#1f3a5f",
  red: "#c0392b",
  crimson: "#a9202b",
  burgundy: "#6d1f2c",
  rose: "#d98a9a",
  pink: "#e07a9a",
  orange: "#e07b39",
  amber: "#e0a339",
  yellow: "#e6c33a",
  gold: "#c9a227",
  "rose gold": "#c9938a",
  green: "#3f8f5a",
  "forest green": "#2f6b45",
  mint: "#8fd0a8",
  olive: "#6f7440",
  lime: "#a8c93a",
  brown: "#7a5233",
  tan: "#c8a882",
  beige: "#ddd2bd",
  cream: "#f2e8d2",
  purple: "#6b4fa0",
  violet: "#7c5cbf",
  lavender: "#b7a6d8",
  teal: "#2f8a8a",
  turquoise: "#3ab0b0",
  clear: "#e8eef0",
  smoke: "#9aa0a4",
  transparent: "#e8eef0",
};

/**
 * The hex for a colour name, or `null` when we do not know it.
 *
 * Matching is on the trimmed, lower-cased name and also on the name with
 * whitespace collapsed, so "Space  Grey" and "space grey" both resolve.
 */
export function swatchFor(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalised = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalised === "") return null;
  return COLOUR_SWATCHES[normalised] ?? null;
}

/** Axis names that mean "colour" — the one axis a shopper reads first. */
const COLOUR_AXIS_NAMES = new Set(["colour", "color", "colorway"]);

/**
 * Is this axis the colour axis?
 *
 * Recognised by name rather than by position, because the shop is free to call
 * it "Colour", "Color" or "Colorway" and all three must render as swatches.
 */
export function isColourAxis(name: string): boolean {
  return COLOUR_AXIS_NAMES.has(name.trim().toLowerCase());
}

/** Slug-safe fragment of an axis value, used to build a variant key. */
export function slugifyAxisValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The canonical key for a combination.
 *
 * Values are joined in `axisOrder` (the product's declared axis order, not the
 * object's insertion order) so the same combination always produces the same
 * key no matter which order the form happened to submit it in.
 */
export function variantKey(options: Record<string, string>, axisOrder: readonly string[]): string {
  const parts = axisOrder
    .map((axis) => slugifyAxisValue(options[axis] ?? ""))
    .filter((part) => part !== "");
  return parts.join("--");
}

/**
 * The shopper-facing label: "Black / Large".
 *
 * Axis order again, so the label reads the same way the picker does.
 */
export function variantLabel(
  options: Record<string, string>,
  axisOrder: readonly string[],
): string {
  return axisOrder
    .map((axis) => (options[axis] ?? "").trim())
    .filter((value) => value !== "")
    .join(" / ");
}

/** One option axis with its values in the order staff arranged them. */
export type Axis = {
  name: string;
  values: string[];
  /** True for the colour axis, which renders as swatches. */
  colour: boolean;
};

/**
 * Derive the axes a product's variants actually use.
 *
 * Axes and their values are *derived*, never stored — one source of truth, so
 * an axis can never name a value no variant carries. The first axis seen wins
 * the value order, and a value that later variants repeat is not duplicated.
 *
 * The colour axis is floated to the front: on a phone, choosing the colour is
 * the decision that narrows the field fastest.
 */
export function deriveAxes(variants: readonly { options: Record<string, string> }[]): Axis[] {
  const order: string[] = [];
  const values = new Map<string, string[]>();

  for (const variant of variants) {
    for (const [axis, value] of Object.entries(variant.options)) {
      const trimmed = value.trim();
      if (trimmed === "") continue;
      if (!values.has(axis)) {
        values.set(axis, []);
        order.push(axis);
      }
      const list = values.get(axis) as string[];
      if (!list.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
        list.push(trimmed);
      }
    }
  }

  const axes: Axis[] = order.map((name) => ({
    name,
    values: values.get(name) ?? [],
    colour: isColourAxis(name),
  }));

  // Colour first, everything else in the order staff entered it.
  return [...axes.filter((a) => a.colour), ...axes.filter((a) => !a.colour)];
}

/**
 * Every combination of the given axes, in a stable order (last axis varies
 * fastest, the way a size list reads under a colour row).
 *
 * Used by the staff editor's "Build combinations" button and by the storefront
 * to know which combinations have no variant behind them.
 */
export function combineAxes(
  axes: readonly { name: string; values: string[] }[],
): { key: string; name: string; options: Record<string, string> }[] {
  if (axes.length === 0) return [];

  let rows: { key: string; name: string; options: Record<string, string> }[] = [
    { key: "", name: "", options: {} },
  ];

  for (const axis of axes) {
    if (axis.values.length === 0) continue;
    const next: typeof rows = [];
    for (const row of rows) {
      for (const value of axis.values) {
        const options = { ...row.options, [axis.name]: value };
        next.push({
          key: variantKey(
            options,
            axes.map((a) => a.name),
          ),
          name: variantLabel(
            options,
            axes.map((a) => a.name),
          ),
          options,
        });
      }
    }
    rows = next;
  }
  return rows;
}

/** Guard rails for what a product may carry. Shared by the mutation and the form. */
export const VARIANT_LIMITS = {
  /** Enough for Colour × Size × Material without the editor becoming a wall. */
  axes: 4,
  valuesPerAxis: 20,
  /** A hard ceiling on the cross-product, so a typo cannot generate 1000 rows. */
  combinations: 200,
  axisName: 40,
  valueName: 40,
  name: 120,
} as const;

/** A combination is only meaningful if every axis it names has a value. */
export function isCompleteCombination(
  options: Record<string, string>,
  axes: readonly string[],
): boolean {
  return axes.every((axis) => (options[axis] ?? "").trim() !== "");
}
