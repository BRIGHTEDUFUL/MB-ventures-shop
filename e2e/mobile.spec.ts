import { expect, test, type Page } from "@playwright/test";
import { STATIC_ROUTES, productRoutes, waitForHydration } from "./helpers";

/** Phone widths from MOBILE_TASKS §0.1, plus the two breakpoint edges. */
const WIDTHS = [
  { width: 320, height: 568 },
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 414, height: 896 },
];

async function routesFor(page: Page): Promise<string[]> {
  return [...STATIC_ROUTES, ...(await productRoutes(page))];
}

/**
 * The whole point of the sweep in MOBILE_TASKS: one line per route per width.
 * A single long row or an unbreakable string widens the document, and this is
 * what catches it.
 */
async function assertNoHorizontalOverflow(page: Page, route: string) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    scrollWidth,
    `${route} overflows horizontally (${scrollWidth}px document in a ${innerWidth}px viewport)`,
  ).toBeLessThanOrEqual(innerWidth + 1);
}

test.describe("Horizontal overflow", () => {
  for (const size of WIDTHS) {
    test(`no route overflows at ${size.width}px`, async ({ page }) => {
      await page.setViewportSize(size);
      const routes = await routesFor(page);
      expect(routes.length).toBeGreaterThan(10);

      const failures: string[] = [];
      for (const route of routes) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        // Let the stream finish and any late font swap settle before measuring.
        await page.waitForTimeout(250);
        try {
          await assertNoHorizontalOverflow(page, route);
        } catch (err) {
          failures.push(err instanceof Error ? err.message : String(err));
        }
      }
      expect(failures, `${failures.length} route(s) overflow at ${size.width}px`).toEqual([]);
    });
  }
});

test.describe("Touch and form ergonomics", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the product-card add button is a 44px target", async ({ page }) => {
    await page.goto("/");
    const box = await page.locator(".product-add").first().boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("cart quantity steppers are 44px targets", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await page.locator(".product-add").first().click();

    await page.goto("/cart");
    await waitForHydration(page);
    const box = await page.locator(".quantity button").first().boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });

  test("form fields never trigger the iOS focus zoom", async ({ page }) => {
    for (const route of ["/checkout", "/account", "/track"]) {
      await page.goto(route);
      const sizes = await page.locator("input, select, textarea").evaluateAll((nodes) =>
        nodes
          .filter((n) => (n as HTMLElement).offsetParent !== null)
          .map((n) => ({
            fontSize: parseFloat(getComputedStyle(n).fontSize),
            label: n.getAttribute("name") || n.getAttribute("type") || n.tagName,
          })),
      );
      for (const field of sizes) {
        expect(
          field.fontSize,
          `${route}: ${field.label} renders at ${field.fontSize}px — iOS zooms anything under 16px`,
        ).toBeGreaterThanOrEqual(16);
      }
    }
  });

  test("the bottom navigation clears the home indicator", async ({ page }) => {
    await page.goto("/");
    const meta = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(meta, "safe-area padding only resolves with viewport-fit=cover").toContain(
      "viewport-fit=cover",
    );
    const usesSafeArea = await page.evaluate(() =>
      [...document.styleSheets].some((sheet) => {
        try {
          return [...sheet.cssRules].some((rule) =>
            rule.cssText?.includes("env(safe-area-inset-bottom)"),
          );
        } catch {
          return false;
        }
      }),
    );
    expect(usesSafeArea).toBe(true);
  });
});
