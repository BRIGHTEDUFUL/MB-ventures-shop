import { describe, expect, it } from "vitest";
import { buildGallery } from "@/lib/store-images";

/**
 * The photo list behind a product page: the chosen option's own photo first,
 * the product's main photo next, its extra photos after that — each shown
 * once, resolved through the same key map the rest of the shop uses.
 */
describe("buildGallery", () => {
  it("lists the product's own photos in order when no option photo is given", () => {
    expect(buildGallery("desk", ["chair", "mouse"], null)).toEqual([
      "/images/desk.webp",
      "/images/chair.webp",
      "/images/mouse.webp",
    ]);
  });

  it("puts the option's photo first", () => {
    expect(buildGallery("desk", ["chair"], "/images/mouse.webp")).toEqual([
      "/images/mouse.webp",
      "/images/desk.webp",
      "/images/chair.webp",
    ]);
  });

  it("accepts an uploaded https URL as an option photo", () => {
    const uploaded = "https://necessary-newt-861.convex.cloud/api/storage/abc";
    expect(buildGallery("desk", [], uploaded)).toEqual([uploaded, "/images/desk.webp"]);
  });

  it("lists a shared photo once", () => {
    // An option that keeps the product's own photo must not show it twice.
    expect(buildGallery("desk", ["chair"], "desk")).toEqual([
      "/images/desk.webp",
      "/images/chair.webp",
    ]);
  });

  it("ignores a blank option photo and empty gallery entries", () => {
    expect(buildGallery("desk", ["", "chair"], "")).toEqual([
      "/images/desk.webp",
      "/images/chair.webp",
    ]);
  });
});
