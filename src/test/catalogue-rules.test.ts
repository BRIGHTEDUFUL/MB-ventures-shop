import { describe, expect, it } from "vitest";

import { PRICE_SLIDER_MAX, filterCatalogue, type Product } from "../../src/lib/store";

/**
 * Pins the catalogue price filter's contract: the slider's top is the shop's
 * fixed GH₵ 50,000, and the filter itself stays wide open until the shopper
 * drags it. The bug this replaces hard-coded the *filter* at 5,000, silently
 * hiding every pricier product (the GH₵ 6,500 ASUS TUF included) on load.
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

describe("PRICE_SLIDER_MAX", () => {
  it("is the shop's chosen slider top", () => {
    expect(PRICE_SLIDER_MAX).toBe(50_000);
  });
});

describe("filterCatalogue", () => {
  const shelf = [
    product({ id: "stand", price: 90 }),
    product({ id: "asus-tuf", price: 6500 }),
    product({ id: "curved-monitor", price: 10500 }),
    product({ id: "beyond-the-slider", price: 60000 }),
    product({ id: "hidden-demo", price: 300, visible: false }),
  ];

  it("shows every listed product by default — no filter until one is selected", () => {
    expect(filterCatalogue(shelf, open).map((p) => p.id)).toEqual([
      "stand",
      "asus-tuf",
      "curved-monitor",
      "beyond-the-slider",
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
