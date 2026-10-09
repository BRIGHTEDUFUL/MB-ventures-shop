import { expect, test } from "@playwright/test";
import { STATIC_ROUTES, collectPageProblems, productRoutes } from "./helpers";

test.describe("Document head", () => {
  for (const route of STATIC_ROUTES) {
    test(`${route} renders a canonical URL and a social card`, async ({ page }) => {
      const problems = collectPageProblems(page);
      const response = await page.goto(route);
      expect(response?.status(), `${route} should return 200`).toBe(200);

      const origin = new URL(page.url()).origin;
      const canonicals = await page.locator('link[rel="canonical"]').all();
      expect(canonicals, `${route} should ship exactly one canonical`).toHaveLength(1);

      const href = await canonicals[0].getAttribute("href");
      // Query strings never belong in a canonical — checkout carries ?next=, the
      // catalogue carries ?category= and ?q=, and all of them are one page.
      expect(href?.startsWith(origin)).toBe(true);
      expect(href).not.toContain("?");

      await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
      await expect(page.locator('meta[name="twitter:image"]')).toHaveCount(1);
      await expect(page.locator('meta[property="og:url"]')).toHaveCount(1);
      expect(await page.title()).toContain("MB Ventures GH");
      expect(problems, `${route} should log no browser errors`).toEqual([]);
    });
  }

  test("staff, admin and dev consoles are noindex", async ({ page }) => {
    for (const route of ["/staff", "/admin/emails"]) {
      await page.goto(route);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    }
  });

  test("product pages share their own photo", async ({ page }) => {
    await page.goto("/product/ergonomic-chair");
    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(image).toBeTruthy();
    expect(image).not.toContain("/images/workspace.jpg");
  });
});

test.describe("Heading outline", () => {
  for (const route of ["/", "/catalogue", "/product/ergonomic-chair", "/about", "/delivery"]) {
    test(`${route} never skips a heading level`, async ({ page }) => {
      await page.goto(route);
      const levels = await page
        .locator("h1, h2, h3, h4, h5, h6")
        .evaluateAll((nodes) =>
          nodes
            .filter((n) => (n as HTMLElement).offsetParent !== null)
            .map((n) => Number(n.tagName.slice(1))),
        );
      expect(levels.length, "page should have at least one heading").toBeGreaterThan(0);
      expect(levels[0], "the first visible heading must be the page h1").toBe(1);
      for (let i = 1; i < levels.length; i++) {
        expect(
          levels[i] - levels[i - 1],
          `heading h${levels[i]} follows h${levels[i - 1]} on ${route}`,
        ).toBeLessThanOrEqual(1);
      }
    });
  }
});

test.describe("Crawler files", () => {
  test("sitemap lists the static pages and every product", async ({ page }) => {
    const res = await page.request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/xml");
    const xml = await res.text();
    expect(xml).toContain("<urlset");
    expect(xml).toContain("/catalogue");

    const products = await productRoutes(page);
    expect(products.length, "every seeded product should be listed").toBeGreaterThan(0);
    for (const path of products) {
      const productPage = await page.request.get(path);
      expect(productPage.status(), `${path} should be reachable`).toBe(200);
    }
  });

  test("robots.txt allows crawling and points at the sitemap", async ({ page }) => {
    const res = await page.request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("User-agent: *");
    expect(body).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
  });
});
