import { expect, test, type Page } from "@playwright/test";
import { waitForHydration } from "./helpers";

/**
 * The options journey, end to end: staff gives a product its colours, a shopper
 * picks one combination out of several and buys exactly that one, staff sees
 * the option on the order and the shelf, and the cancelled order hands the
 * unit back.
 *
 * It writes to the dev deployment — a hidden demo product gains options, an
 * order is placed and cancelled — so it only runs when asked for: `npm run
 * test:e2e:live` (which sets E2E_LIVE=1) or `E2E_LIVE=1 npx playwright test
 * e2e/variants.spec.ts`. A plain `npm run test:e2e` never touches it.
 *
 * Two fixtures are used, both in the dev deployment. `gaming-desk` is a
 * hidden demo product, so giving it options cannot surface anywhere public —
 * it is where the editor's create path is proven. `luminous-rgb-mouse-pad` is
 * a prepared fixture product selling in Black/White × Standard/XL (the live
 * catalogue dropped the original); the shopper buys one combination and the
 * order is cancelled at the end, which restocks the option, so the run
 * leaves dev stock as it found it.
 */
const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? "e2e.staff@example.com";
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD ?? "E2eStaff!2026";

const BLANK_DESK = "gaming-desk";
const PAD = "luminous-rgb-mouse-pad";

// The trace writer races context close on some Windows setups (sync/AV
// scanning of test-results), turning green runs into ENOENT failures.
// Screenshots and the error-context snapshot are still captured on failure.
test.use({ trace: "off" });

/** Shared between the tests in this file (one worker, tests run in order). */
const journey = { reference: "", phone: "" };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Sign in with the granted staff account and land on the account page. */
async function staffSignIn(page: Page): Promise<void> {
  await page.goto("/account");
  await waitForHydration(page);
  await page.getByLabel("Email").fill(STAFF_EMAIL);
  await page.getByLabel("Password").fill(STAFF_PASSWORD);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe("Live options journey", () => {
  test.skip(
    process.env.E2E_LIVE !== "1",
    "opt in with `npm run test:e2e:live` — this writes options and an order to dev",
  );

  test("staff gives a product two colours and the total keeps itself", async ({ page }) => {
    // A confirm dialog here means the build is about to write stock off.
    // With unchanged options it must never ask — first run or hundredth.
    // (Only confirm-type dialogs count: a full-page reload from the dev
    // server's HMR surfaces as a beforeunload dialog with no message.)
    const confirms: string[] = [];
    page.on("dialog", (dialog) => {
      if (dialog.type() === "confirm") confirms.push(dialog.message());
      void dialog.accept();
    });

    await staffSignIn(page);
    await page.goto(`/staff/products/${BLANK_DESK}`);
    await waitForHydration(page);
    await expect(page.getByRole("heading", { name: "Option types" })).toBeVisible({
      timeout: 20_000,
    });

    // Idempotent fixture: reuse the Colour axis when a previous run made one.
    const axis = page.getByLabel("Option type 1 name");
    if ((await axis.count()) === 0) {
      await page.getByLabel("New option type").fill("Colour");
      await page.getByRole("button", { name: "Add option", exact: true }).click();
    }
    await expect(axis).toHaveValue(/colo/i);
    for (const value of ["Black", "White"]) {
      if ((await page.getByRole("button", { name: `Remove ${value}` }).count()) === 0) {
        await page.getByLabel(`Add a value to ${await axis.inputValue()}`).fill(value);
        await page.getByRole("button", { name: "Add value", exact: true }).click();
      }
    }

    await page.getByRole("button", { name: "Build combinations" }).click();
    await expect(page.getByText("2 options laid out.")).toBeVisible();
    expect(confirms, "laying out unchanged options must never ask to write stock off").toEqual([]);

    await page.getByLabel("Stock for Black").fill("3");
    await page.getByLabel("Stock for White").fill("2");
    await page.getByRole("button", { name: "Save options" }).click();
    await expect(page.getByText("Saved 2 options for this product.")).toBeVisible({
      timeout: 20_000,
    });

    // Reload and prove the backend kept every count — and that the product's
    // own stock field is now the derived total (3 + 2), read-only.
    await page.reload();
    await waitForHydration(page);
    await expect(page.getByText("2 in total")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("Stock for Black")).toHaveValue("3");
    await expect(page.getByLabel("Stock for White")).toHaveValue("2");
    const ownStock = page.getByLabel("Available to sell");
    await expect(ownStock).toHaveAttribute("aria-readonly", "true");
    await expect(ownStock).toHaveValue("5");
    await expect(
      page.getByText("Total across your options — change each count in the Options panel below."),
    ).toBeVisible();

    // The write-off trap, on real data: rebuilding the same axes must keep
    // every row — keys, counts and all — without a single dialog.
    await page.getByRole("button", { name: "Build combinations" }).click();
    await expect(page.getByText("2 options laid out.")).toBeVisible();
    expect(confirms, "rebuilding saved options must never ask to write stock off").toEqual([]);
    await expect(page.getByLabel("Stock for Black")).toHaveValue("3");
    await expect(page.getByLabel("Stock for White")).toHaveValue("2");
  });

  test("the shelf counts the options one by one", async ({ page }) => {
    await staffSignIn(page);
    await page.goto("/staff/inventory");
    await waitForHydration(page);
    await page.getByLabel("Search stock").fill("Gaming workstation desk");
    await expect(
      page.getByText(
        "This product sells in options, so stock is kept per option — the total above is added up for you.",
      ),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("5 on hand", { exact: true })).toBeVisible();
    await expect(page.getByText("3 on hand", { exact: true })).toBeVisible();
    await expect(page.getByText("2 on hand", { exact: true })).toBeVisible();
  });

  test("staff gives each colour its own photo", async ({ page }) => {
    await staffSignIn(page);
    await page.goto(`/staff/products/${PAD}`);
    await waitForHydration(page);
    await expect(page.getByText("4 in total")).toBeVisible({ timeout: 20_000 });

    // Two different real photos, one per colour. The row only offers
    // "Replace photo" once a photo is held, which is also the signal that
    // the upload finished and the draft is ready to save.
    await page
      .getByLabel("Photo for Black / Standard")
      .setInputFiles("public/images/products/luminous-rgb-mouse-pad.webp");
    await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveCount(1);
    await page
      .getByLabel("Photo for White / Standard")
      .setInputFiles("public/images/products/monitor-light-bar.webp");
    await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveCount(2);

    await page.getByRole("button", { name: "Save options" }).click();
    await expect(page.getByText("Saved 4 options for this product.")).toBeVisible({
      timeout: 20_000,
    });

    // Reload: the backend kept both photos, and the sizes kept their stock.
    await page.reload();
    await waitForHydration(page);
    await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveCount(2, {
      timeout: 20_000,
    });
    await expect(page.getByLabel("Stock for Black / Standard")).toHaveValue("4");
  });

  test("a shopper picks one combination out of the matrix and buys it", async ({ page }) => {
    const stamp = Date.now();
    const email = `e2e.options.${stamp}@example.com`;
    journey.phone = "0240000555";

    // 1. Two axes. The default lands on the first visible combination.
    await page.goto(`/product/${PAD}`);
    await waitForHydration(page);
    const colour = page.getByRole("group", { name: "Colour" });
    const size = page.getByRole("group", { name: "Size" });
    await expect(colour.getByRole("button", { name: "Black, 4 in stock" })).toBeEnabled();
    await expect(size.getByRole("button", { name: "Standard, 4 in stock" })).toBeEnabled();
    await expect(page.getByText("In stock · 4 available · Black / Standard")).toBeVisible();

    // 1b. The colour's own photo leads the gallery, and the arrows step from
    //     it into the product's own pictures. (Staff gave the two Standard
    //     colours their photos in the editor test above.)
    const mainImage = page.locator(".gallery > img").first();
    const blackPhoto = await mainImage.getAttribute("src");
    expect(blackPhoto, "Black should open on its own photo").toContain("api/storage");
    await colour.getByRole("button", { name: "White, 4 in stock" }).click();
    await expect(mainImage, "White should show a different photo").not.toHaveAttribute(
      "src",
      blackPhoto!,
    );
    const whitePhoto = await mainImage.getAttribute("src");
    expect(whitePhoto, "White should open on its own photo").toContain("api/storage");
    await page.getByRole("button", { name: "Next image" }).click();
    await expect(mainImage).toHaveAttribute("src", "/images/products/luminous-rgb-mouse-pad.webp");
    await page.getByRole("button", { name: "Previous image" }).click();
    await expect(mainImage).toHaveAttribute("src", whitePhoto!);
    // Back on Black for the buy flow below.
    await colour.getByRole("button", { name: "Black, 4 in stock" }).click();
    await expect(mainImage).toHaveAttribute("src", blackPhoto!);

    // 2. Choosing XL re-resolves the Colour row against it: Black / XL exists,
    //    White / XL does not — so White grays out rather than lying in wait.
    await size.getByRole("button", { name: "XL, 2 in stock" }).click();
    await expect(colour.getByRole("button", { name: "Black, 2 in stock" })).toBeEnabled();
    const whiteXl = colour.getByRole("button", { name: "White, out of stock" });
    await expect(whiteXl).toBeDisabled();
    // The chosen combination carries its own price and its own count.
    await expect(page.getByText("In stock · 2 available · Black / XL")).toBeVisible();
    await expect(page.getByText("GH₵ 250", { exact: true })).toBeVisible();

    // 3. Buy exactly that combination.
    await page.getByRole("button", { name: /Add to cart/ }).click();
    await page.goto("/cart");
    await waitForHydration(page);
    await expect(page.locator(".cart-line")).toHaveCount(1);
    await expect(page.locator(".cart-line").first()).toContainText("Black / XL");
    await expect(page.locator(".cart-line").first()).toContainText("250.00");
    await page.getByRole("link", { name: /checkout/i }).click();
    await page.waitForURL(/\/account\?next=%2Fcheckout|\/account\?next=\/checkout/);
    await waitForHydration(page);

    // 4. Sign up a shopper and place the order (cash on arrival).
    await page.getByRole("button", { name: /New here\? Create an account/ }).click();
    await page.getByLabel("Full name").fill("E2E Options Shopper");
    await page.getByLabel("Phone number").fill(journey.phone);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("Shopper!2026");
    await page.locator("form").getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/checkout/, { timeout: 30_000 });
    await waitForHydration(page);
    await expect(page.getByRole("heading", { name: /Where should your order go/ })).toBeVisible();
    await page.getByLabel("Street address & landmark").fill("5 Abelenkpe lane, Accra");
    await expect(async () => {
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByRole("heading", { name: /Check your order/ })).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 30_000 });
    // The review names the option, not just the product.
    await expect(page.getByText("Black / XL").first()).toBeVisible();
    await page.locator('.filter-line input[type="checkbox"]').check();
    const placeButton = page.getByRole("button", { name: "Place order" });
    await expect(placeButton, "ordering must be open in dev for this run").toBeEnabled();
    await placeButton.click();

    await page.waitForURL(/\/confirmation\?ref=/, { timeout: 30_000 });
    journey.reference = new URL(page.url()).searchParams.get("ref")!;
    expect(journey.reference).toMatch(/^MB-[0-9A-F]{16}$/);
    // The receipt keeps the option too.
    await expect(page.getByText("Black / XL").first()).toBeVisible();
  });

  test("staff sees the bought option on the order and on the shelf", async ({ page }) => {
    test.skip(!journey.reference, "the shopper test did not place an order");

    await staffSignIn(page);

    // 1. The order names the combination twice: once in the line, once beneath.
    await page.goto("/staff/orders");
    await waitForHydration(page);
    await page.getByLabel("Search orders").fill(journey.reference);
    await page.getByRole("link", { name: new RegExp(escapeRegExp(journey.reference)) }).click();
    await page.waitForURL(/\/staff\/orders\//);
    await expect(page.getByRole("heading", { name: journey.reference })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Black / XL").first()).toBeVisible();

    // 2. The reserved unit left only that option — the others never moved.
    await page.goto("/staff/inventory");
    await waitForHydration(page);
    await page.getByLabel("Search stock").fill("Luminous");
    const row = page.locator("li").filter({ hasText: /^Black \/ XL/ });
    await expect(row.getByText("1 on hand")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("White / XL0 on hand")).toBeVisible();

    // 3. The editor shows the same story, with the total kept for you.
    await page.goto(`/staff/products/${PAD}`);
    await waitForHydration(page);
    await expect(page.getByText("4 in total")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("Stock for Black / XL")).toHaveValue("1");
    await expect(page.getByLabel("Available to sell")).toHaveAttribute("aria-readonly", "true");
    await expect(page.getByLabel("Available to sell")).toHaveValue("9");
  });

  test("cancelling the order hands the unit back to its option", async ({ page }) => {
    test.skip(!journey.reference, "the shopper test did not place an order");

    // Cancelling asks `window.confirm`, which Playwright dismisses by default.
    page.on("dialog", (dialog) => void dialog.accept());

    await staffSignIn(page);
    await page.goto("/staff/orders");
    await waitForHydration(page);
    await page.getByLabel("Search orders").fill(journey.reference);
    await page.getByRole("link", { name: new RegExp(escapeRegExp(journey.reference)) }).click();
    await page.waitForURL(/\/staff\/orders\//);
    await expect(page.getByRole("heading", { name: journey.reference })).toBeVisible({
      timeout: 20_000,
    });
    const statusSelect = page.getByLabel("Order status");
    await statusSelect.selectOption("cancelled");
    await page.getByRole("button", { name: "Save update" }).click();
    await expect(
      page
        .locator("span")
        .filter({ hasText: /^cancelled$/ })
        .first(),
    ).toBeVisible({ timeout: 20_000 });

    // The shelf, proven where shoppers see it: the option is buyable again.
    await page.goto(`/product/${PAD}`);
    await waitForHydration(page);
    await page
      .getByRole("group", { name: "Size" })
      .getByRole("button", { name: "XL, 2 in stock" })
      .click();
    await expect(
      page
        .getByRole("group", { name: "Colour" })
        .getByRole("button", { name: "Black, 2 in stock" }),
    ).toBeEnabled();
    await expect(page.getByText("In stock · 2 available · Black / XL")).toBeVisible();
  });

  /**
   * A run that dies halfway leaves an open order holding a unit, so this sweep
   * closes every options-run order it can find — and then *proves* none is
   * left. Each live run therefore finishes with dev inventory exactly where it
   * started, whatever happened on the way.
   */
  test("no options-run order is left open in dev", async ({ page }) => {
    page.on("dialog", (dialog) => void dialog.accept());

    await staffSignIn(page);

    const e2eOrders = async (): Promise<{ href: string; text: string }[]> => {
      await page.goto("/staff/orders");
      await waitForHydration(page);
      await page.getByLabel("Search orders").fill("E2E Options Shopper");
      const rows = page.locator('a[href^="/staff/orders/"]');
      const empty = page.getByText("No orders match these filters");
      await expect(rows.first().or(empty)).toBeVisible({ timeout: 20_000 });
      await expect
        .poll(
          () =>
            rows.evaluateAll((nodes) =>
              nodes.every((n) => (n.textContent ?? "").includes("E2E Options Shopper")),
            ),
          { timeout: 20_000 },
        )
        .toBe(true);
      return rows.evaluateAll((nodes) =>
        nodes.map((n) => ({
          href: n.getAttribute("href") ?? "",
          text: n.textContent ?? "",
        })),
      );
    };

    const isOpen = (order: { text: string }) => !/cancelled/i.test(order.text);

    for (let pass = 0; pass < 10; pass++) {
      const open = (await e2eOrders()).filter(isOpen);
      if (open.length === 0) break;

      await page.goto(open[0].href);
      await waitForHydration(page);
      await expect(page.getByRole("heading", { name: "Update order" })).toBeVisible({
        timeout: 20_000,
      });
      const statusSelect = page.getByLabel("Order status");
      await statusSelect.selectOption("cancelled");
      await page.getByRole("button", { name: "Save update" }).click();
      await expect(
        page
          .locator("span")
          .filter({ hasText: /^cancelled$/ })
          .first(),
      ).toBeVisible({ timeout: 20_000 });
    }

    const leftOpen = (await e2eOrders()).filter(isOpen);
    expect(
      leftOpen.map((order) => order.text.slice(0, 60)),
      "every options-run order must be closed before the run ends",
    ).toEqual([]);
  });
});
