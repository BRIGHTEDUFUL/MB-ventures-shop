import { expect, test } from "@playwright/test";
import { STATIC_ROUTES, collectPageProblems, productRoutes, waitForHydration } from "./helpers";

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
    // A real, visible product — hidden drafts 404 and fall back to the default.
    await page.goto("/product/electric-standing-desk-rgb-160");
    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(image).toBeTruthy();
    expect(image).toContain("/images/products/electric-standing-desk-rgb-160.webp");
  });
});

test.describe("Heading outline", () => {
  for (const route of ["/", "/catalogue", "/product/monitor-light-bar", "/about", "/delivery"]) {
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

test.describe("Storefront badges & contact", () => {
  test("every card badge is one the shop actually means", async ({ page }) => {
    await page.goto("/catalogue");
    const cards = page.locator("article.product-card");
    expect(await cards.count(), "the catalogue should show products").toBeGreaterThan(0);

    for (const card of await cards.all()) {
      const badge = card.locator(".product-badge");
      await expect(badge).toHaveCount(1);
      const text = (await badge.textContent())?.trim() ?? "";
      // The closed set the ProductCard badge ternary can produce, and the
      // tone each wording must carry. A badge outside this table means the
      // card is inventing information.
      expect(text, "badge wording").toMatch(
        /^(Sale|Out of stock|In stock|Sample item|\d+ left|\d+ options)$/,
      );
      const tone = await badge.getAttribute("data-tone");
      if (text === "Sale") expect(tone, "Sale must be shouted in green").toBe("sale");
      else if (text === "Out of stock") expect(tone).toBe("out");
      else if (/^\d+ left$/.test(text)) expect(tone).toBe("low");
      else if (text === "In stock") expect(tone).toBe("stock");
      else expect(tone, `“${text}” carries no tone`).toBeNull();
    }

    // The desk is on sale (original above live price) and shouts it in green.
    // Search narrows the paginated grid down to the one card being asserted.
    await page.goto("/catalogue?q=Electric");
    const onSale = page.locator("article.product-card").filter({
      has: page.locator('a[href="/product/electric-standing-desk-rgb-160"]'),
    });
    await expect(onSale.locator(".product-badge")).toHaveText("Sale");
  });

  test("the footer's tap-to-call number is the number it shows", async ({ page }) => {
    await page.goto("/");
    const tel = page.locator('footer a[href^="tel:"]');
    await expect(tel).toHaveCount(1);
    const href = (await tel.getAttribute("href")) ?? "";
    const shown = ((await tel.textContent()) ?? "").replace(/[\s-]/g, "");
    // The shop was once listed under one number and dialled under another;
    // whatever number the footer displays, that is the number it must call.
    expect(href.replace(/^tel:/, "").replace(/[\s-]/g, "")).toBe(shown);
    expect(shown.length, "the shop number should be a real number").toBeGreaterThanOrEqual(9);
  });

  test("a product with several photos steps through them; a plain one shows no arrows", async ({
    page,
  }) => {
    // The keyboard ships two photos, so it gets the step-through controls.
    // Hydration first: the SSR button exists but carries no handler yet.
    await page.goto("/product/custom-macro-mechanical-keyboard");
    await waitForHydration(page);
    const main = page.locator(".gallery > img").first();
    const first = await main.getAttribute("src");
    expect(first).toContain("custom-macro-mechanical-keyboard.webp");
    await page.getByRole("button", { name: "Next image" }).click();
    await expect(main).toHaveAttribute("src", /custom-macro-mechanical-keyboard-gallery\.webp/);
    await page.getByRole("button", { name: "Previous image" }).click();
    await expect(main).toHaveAttribute("src", first!);

    // The light bar has one photo: a control that cannot do anything is noise.
    await page.goto("/product/monitor-light-bar");
    await waitForHydration(page);
    await expect(page.getByRole("button", { name: "Next image" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Previous image" })).toHaveCount(0);
  });

  test("an options product offers only combinations it can actually sell", async ({ page }) => {
    await page.goto("/product/rgb-dynamic-usb-microphone");
    const group = page.getByRole("group", { name: "Colour" });
    // The options fixture lives in the dev deployment; the live spec
    // (`npm run test:e2e:live`) exercises it. Until then this check has
    // nothing to look at.
    test.skip(
      (await group.count()) === 0,
      "no options fixture in dev yet — run the live suite once",
    );
    const chips = group.getByRole("button");
    expect(await chips.count(), "the Colour axis should offer its values").toBeGreaterThan(1);
    // A chip's disabled state must mirror its own availability label: what
    // the page says and what the page lets you do can never disagree.
    for (const chip of await chips.all()) {
      const label = (await chip.getAttribute("aria-label")) ?? "";
      const unbuyable = /out of stock|unavailable$/.test(label);
      expect(await chip.isEnabled(), `chip “${label}”`).toBe(!unbuyable);
    }
  });
});
