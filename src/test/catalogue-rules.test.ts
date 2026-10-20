import { describe, expect, it } from "vitest";

import {
  PRICE_SLIDER_MAX,
  filterCatalogue,
  pageWindow,
  searchProducts,
  searchScore,
  searchTerms,
  type Product,
} from "../../src/lib/store";

/**
 * Pins the catalogue price filter's contract: the slider's top is the shop's
 * fixed GH₵ 50,000, and the filter itself stays wide open until the shopper
 * drags it. The bug this replaces hard-coded the *filter* at 5,000, silently
 * hiding every pricier product (the GH₵ 6,500 ASUS TUF included) on load.
 *
 * The search block below pins the shared matcher the header overlay and the
 * catalogue grid both stand on: every term must land somewhere, name hits
 * outrank description mentions, and hidden rows never surface.
 */

/** A catalogue row for the tests; `price` defaults because search ignores it. */
const product = (over: Partial<Product> & Pick<Product, "id"> & { price?: number }): Product => ({
  name: over.id,
  brand: "Test brand",
  category: "desks",
  price: 100,
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

  it("needs every term of a multi-word query to land, across fields", () => {
    const mixed = [
      product({
        id: "desk",
        name: "Gaming Desk",
        description: "A solid steel frame for your setup",
      }),
      product({ id: "stand", name: "Monitor Arm", description: "Clamp mount for gaming desks" }),
    ];
    // "gaming" lands in both products' copy, but "frame" only lands in the
    // desk's description — a term that lands nowhere excludes the product.
    expect(filterCatalogue(mixed, { ...open, q: "gaming frame" }).map((p) => p.id)).toEqual([
      "desk",
    ]);
    // A term that lands nowhere excludes the product, whatever else matched.
    expect(filterCatalogue(mixed, { ...open, q: "gaming projector" })).toEqual([]);
  });
});

describe("searchTerms", () => {
  it("splits a query into trimmed lowercase terms", () => {
    expect(searchTerms("  RGB  Mic ")).toEqual(["rgb", "mic"]);
    expect(searchTerms("   ")).toEqual([]);
  });
});

describe("searchScore", () => {
  const desk = product({
    id: "desk",
    name: "Carbon Fiber Gaming Desk",
    description: "A sturdy desk for your setup",
  });
  const mic = product({
    id: "mic",
    name: "Dynamic USB Microphone",
    brand: "Fifine",
    specs: { Connection: "USB-C" },
  });

  it("matches words sitting in different fields", () => {
    expect(searchScore(mic, searchTerms("fifine usb-c"))).toBeGreaterThan(0);
  });

  it("ranks a name hit above a description mention of the same word", () => {
    const byCopy = product({
      id: "chair",
      name: "Office Chair",
      description: "Great for gaming at your desk",
    });
    expect(searchScore(desk, searchTerms("gaming"))).toBeGreaterThan(
      searchScore(byCopy, searchTerms("gaming")),
    );
  });

  it("scores nothing when a single term lands nowhere", () => {
    expect(searchScore(desk, searchTerms("gaming projector"))).toBe(0);
  });
});

describe("searchProducts", () => {
  const shelf = [
    product({ id: "pad", name: "Gaming Mouse Pad" }),
    product({ id: "desk", name: "Carbon Fiber Gaming Desk" }),
    product({ id: "ghost", name: "Gaming Desk (draft)", visible: false }),
  ];

  it("ranks the best match first", () => {
    // Both products carry "gaming", but only the desk carries both terms.
    expect(searchProducts(shelf, "gaming desk").map((p) => p.id)).toEqual(["desk"]);
  });

  it("never surfaces a hidden row — the §4c gate lives in the matcher", () => {
    expect(searchProducts(shelf, "gaming").map((p) => p.id)).not.toContain("ghost");
  });
});

describe("pageWindow", () => {
  it("lists a short run flat", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
  });

  it("hugs the start and the end with an ellipsis before the last page", () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5, 6, null, 20]);
    expect(pageWindow(20, 20)).toEqual([1, null, 15, 16, 17, 18, 19, 20]);
  });

  it("keeps first, last and a window around the current page", () => {
    const run = pageWindow(10, 20);
    expect(run[0]).toBe(1);
    expect(run.at(-1)).toBe(20);
    expect(run).toContain(10);
    expect(run).toContain(null);
    expect(run.filter((n) => typeof n === "number")).toHaveLength(7);
  });
});
