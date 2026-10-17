import { describe, expect, it } from "vitest";

import { filterCatalogue, priceCeiling, type Product } from "../../src/lib/store";

/**
 * Pins the catalogue filter after the "expensive uploads are invisible" bug:
 * the price filter used a hard 5,000 default and slider maximum, so every
 * product priced above it — including the circled GH₵ 6,500 ASUS TUF — was
 * hidden on load and could not be reached by dragging. Two rules keep it
 * fixed: the ceiling comes from the shelf, and the default filter hides
 * nothing.
 */

const product = (over: Partial<Product> & Pick<Product, "id" | "price">): Product => ({
  name: over.id,
  brand: "Test brand",
  category: "desks",
  original_price: null,
  stock: 10,
  description: "",
  specs: {},
  image_key: "test",
  gallery: [],
  verified: true,
  visible: true,
  ...over,
});

/** The filter as it arrives from fresh component state — nothing narrowed. */
const open = { category: "", q: "", max: null, stock: false, sale: false, brand: "" };

describe("priceCeiling", () => {
  it("rounds the priciest product up to the next hundred", () => {
    const shelf = [product({ id: "cheap", price: 230 }), product({ id: "monitor", price: 10550 })];
    expect(priceCeiling(shelf)).toBe(10600);
  });

  it("leaves a price that is already a round hundred untouched", () => {
    expect(priceCeiling([product({ id: "desk", price: 5000 })])).toBe(5000);
  });

  it("still draws a sane slider for an empty catalogue", () => {
    expect(priceCeiling([])).toBe(1000);
  });
});

describe("filterCatalogue", () => {
  const shelf = [
    product({ id: "stand", price: 90 }),
    product({ id: "asus-tuf", price: 6500 }),
    product({ id: "curved-monitor", price: 10500 }),
    product({ id: "hidden-demo", price: 300, visible: false }),
  ];

  it("shows every listed product by default, whatever it costs", () => {
    expect(filterCatalogue(shelf, open).map((p) => p.id)).toEqual([
      "stand",
      "asus-tuf",
      "curved-monitor",
    ]);
  });

  it("narrows to the dragged ceiling", () => {
    expect(filterCatalogue(shelf, { ...open, max: 5000 }).map((p) => p.id)).toEqual(["stand"]);
  });

  it("treats a dragged-to-zero ceiling as a real bound, not 'no filter'", () => {
    // The old `!max || …` short-circuited at 0 and showed the whole shelf.
    expect(filterCatalogue(shelf, { ...open, max: 0 })).toEqual([]);
  });

  it("counts only a genuine markdown as on sale — a stale compare-at does not", () => {
    const saleShelf = [
      product({ id: "markdown", price: 100, original_price: 120 }),
      product({ id: "stale", price: 200, original_price: 200 }),
    ];
    expect(filterCatalogue(saleShelf, { ...open, sale: true }).map((p) => p.id)).toEqual([
      "markdown",
    ]);
  });

  it("in stock means verified with units — samples and zeroes drop out", () => {
    const stockShelf = [
      product({ id: "ok", price: 100 }),
      product({ id: "sample", price: 100, verified: false }),
      product({ id: "gone", price: 100, stock: 0 }),
    ];
    expect(filterCatalogue(stockShelf, { ...open, stock: true }).map((p) => p.id)).toEqual(["ok"]);
  });

  it("searches name and brand case-insensitively and can be combined with price", () => {
    const brandShelf = [
      product({ id: "tuf", price: 6500, brand: "ASUS" }),
      product({ id: "pad", price: 200, brand: "Chaho" }),
    ];
    expect(filterCatalogue(brandShelf, { ...open, q: "as" }).map((p) => p.id)).toEqual(["tuf"]);
    expect(
      filterCatalogue(brandShelf, { ...open, brand: "ASUS", max: 300 }).map((p) => p.id),
    ).toEqual([]);
  });
});
