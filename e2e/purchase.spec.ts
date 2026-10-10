import { expect, test } from "@playwright/test";
import { waitForHydration } from "./helpers";

/**
 * The one check the roadmap has never had: a real order, placed end to end,
 * then worked by staff. It writes to the dev deployment — a shopper account, an
 * order, a timeline — so it only runs when asked for: `npm run test:e2e:live`
 * (which sets E2E_LIVE=1 for you) or `E2E_LIVE=1 npx playwright test
 * e2e/purchase.spec.ts`. A plain `npm run test:e2e` never touches it.
 *
 * The staff account it uses is created once (sign up at /account, then
 * `npx convex run users:grantStaff '{"email":"…"}'`). The order is cancelled at
 * the end, which restocks the product, so the run leaves dev stock as it found
 * it.
 */
const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? "e2e.staff@example.com";
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD ?? "E2eStaff!2026";

// The trace writer races context close on some Windows setups (sync/AV
// scanning of test-results), turning green runs into ENOENT failures.
// Screenshots and the error-context snapshot are still captured on failure.
test.use({ trace: "off" });

/** Shared between the tests in this file (one worker, tests run in order). */
const journey = { reference: "", phone: "", initialStock: "" };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test.describe("Live purchase journey", () => {
  test.skip(
    process.env.E2E_LIVE !== "1",
    "opt in with `npm run test:e2e:live` — this writes a real order to dev",
  );

  test("shopper signs up, checks out and tracks the order", async ({ page, browser }) => {
    const stamp = Date.now();
    const email = `e2e.shopper.${stamp}@example.com`;
    const name = "E2E Shopper";
    journey.phone = "0240000444";
    const address = "12 Abelenkpe lane, Accra — opposite the taxi rank";

    // 1. A cheap, in-stock real product — the run orders one and cancels at
    //    the end, so dev stock finishes where it started.
    await page.goto("/product/rock-360-phone-tablet-stand");
    await waitForHydration(page);
    await expect(
      page.getByRole("heading", { level: 1, name: /Rotating Foldable Phone/ }),
    ).toBeVisible();
    // Remember what the shelf says now — the run must leave it this way.
    const stockLine = await page.getByText(/In stock · \d+ available/).textContent();
    journey.initialStock = stockLine?.trim() ?? "";
    expect(journey.initialStock).not.toBe("");
    await expect(async () => {
      await page
        .getByRole("button", { name: /add to cart/i })
        .first()
        .click();
      const stored = await page.evaluate(() => localStorage.getItem("mb-cart") ?? "[]");
      expect(stored).not.toBe("[]");
    }).toPass({ timeout: 30_000 });

    // 2. Cart → checkout, which bounces a signed-out shopper to sign-up.
    await page.goto("/cart");
    await waitForHydration(page);
    await expect(page.locator(".cart-line")).toHaveCount(1);
    await page.getByRole("link", { name: /checkout/i }).click();
    await page.waitForURL(/\/account\?next=%2Fcheckout|\/account\?next=\/checkout/);
    await waitForHydration(page);

    await page.getByRole("button", { name: /New here\? Create an account/ }).click();
    await page.getByLabel("Full name").fill(name);
    await page.getByLabel("Phone number").fill(journey.phone);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("Shopper!2026");
    await page.locator("form").getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/checkout/, { timeout: 30_000 });
    await waitForHydration(page);

    // 3. Step one — delivery details (the phone comes from the profile).
    //    Right after sign-up the auth client can resolve to "signed out" for
    //    a beat, which bounces checkout through /account and back — a click
    //    landing inside that window is swallowed by the unmount. The form is
    //    drafted to sessionStorage, so retrying loses nothing.
    await expect(page.getByRole("heading", { name: /Where should your order go/ })).toBeVisible();
    await page.getByLabel("Street address & landmark").fill(address);
    await expect(page.getByLabel("Street address & landmark")).toHaveValue(address);
    await expect(async () => {
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByRole("heading", { name: /Check your order/ })).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 30_000 });

    // 4. Step two — review and place. No payment details are collected:
    //    the courier takes cash on arrival.
    await expect(page.getByText(/Pay cash to the courier when your order arrives/i)).toBeVisible();
    await page.locator('.filter-line input[type="checkbox"]').check();
    const placeButton = page.getByRole("button", { name: "Place order" });
    await expect(placeButton, "ordering must be open in dev for this run").toBeEnabled();
    await placeButton.click();

    await page.waitForURL(/\/confirmation\?ref=/, { timeout: 30_000 });
    const referenceFromUrl = new URL(page.url()).searchParams.get("ref")!;
    expect(referenceFromUrl).toMatch(/^MB-[0-9A-F]{16}$/);
    journey.reference = referenceFromUrl;
    await expect(page.getByText(referenceFromUrl)).toBeVisible();

    // 5. Guest tracking — no session, reference + phone only.
    const guest = await browser.newContext();
    const tracker = await guest.newPage();
    await tracker.goto("/track");
    await waitForHydration(tracker);
    await tracker.getByLabel("Order reference").fill(referenceFromUrl);
    await tracker.getByLabel("Phone number").fill(journey.phone);
    await tracker.getByRole("button", { name: "Find order" }).click();
    await expect(tracker.getByText(referenceFromUrl)).toBeVisible({ timeout: 20_000 });
    await expect(tracker.getByText(/received/i).first()).toBeVisible();
    await guest.close();
  });

  test("staff records the payment, advances the order, then closes it", async ({
    page,
    browser,
  }) => {
    test.skip(!journey.reference, "the shopper test did not place an order");

    // Confirming a payment and cancelling both ask `window.confirm`, which
    // Playwright dismisses by default — dismissing would abort the save.
    page.on("dialog", (dialog) => void dialog.accept());

    /** The status/payment pills on the order header are the server's own answer. */
    const pill = (text: string) =>
      page
        .locator("span")
        .filter({ hasText: new RegExp(`^${text}$`) })
        .first();

    // 1. Sign in with the granted staff account.
    await page.goto("/account");
    await waitForHydration(page);
    await page.getByLabel("Email").fill(STAFF_EMAIL);
    await page.getByLabel("Password").fill(STAFF_PASSWORD);
    await page.locator("form").getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible({
      timeout: 30_000,
    });

    // 2. Find the order.
    await page.goto("/staff/orders");
    await waitForHydration(page);
    await page
      .getByPlaceholder("Search reference, customer, phone or email")
      .fill(journey.reference);
    await page.getByRole("link", { name: new RegExp(escapeRegExp(journey.reference)) }).click();
    await page.waitForURL(/\/staff\/orders\//);
    // The list is still mounted until the detail replaces it, and its own
    // "Filter by payment status" select answers getByLabel("Payment status")
    // too — so wait for the detail's heading and the list's search box to go.
    await expect(page.getByRole("heading", { name: journey.reference })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByLabel("Search orders")).toHaveCount(0);

    const paymentSelect = page.getByLabel("Payment status");
    const statusSelect = page.getByLabel("Order status");

    // 3. Record the payment as received (cash on delivery), then advance.
    await paymentSelect.selectOption("confirmed");
    await expect(paymentSelect).toHaveValue("confirmed");
    await page.getByRole("button", { name: "Save update" }).click();
    await expect(pill("confirmed")).toBeVisible({ timeout: 20_000 });

    // 4. Advance the order.
    await statusSelect.selectOption("processing");
    await expect(statusSelect).toHaveValue("processing");
    await page.getByRole("button", { name: "Save update" }).click();
    await expect(pill("processing")).toBeVisible({ timeout: 20_000 });

    // 5. Close it out. Cancelling restocks the product, so dev inventory ends
    //    the run exactly where it started.
    await statusSelect.selectOption("cancelled");
    await expect(statusSelect).toHaveValue("cancelled");
    await page.getByRole("button", { name: "Save update" }).click();
    await expect(pill("cancelled")).toBeVisible({ timeout: 20_000 });

    // The stock the order took comes back — that is the restock, proven on the
    // storefront rather than in the database.
    const shelf = await browser.newPage();
    await shelf.goto("/product/rock-360-phone-tablet-stand");
    await expect(shelf.getByText(journey.initialStock)).toBeVisible({ timeout: 20_000 });
    await shelf.close();
  });

  test("the closed order is still visible to the shopper who placed it", async ({ page }) => {
    test.skip(!journey.reference, "the shopper test did not place an order");
    await page.goto("/track");
    await waitForHydration(page);
    await page.getByLabel("Order reference").fill(journey.reference);
    await page.getByLabel("Phone number").fill(journey.phone);
    await page.getByRole("button", { name: "Find order" }).click();
    await expect(page.getByText(journey.reference)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/cancelled/i).first()).toBeVisible();
  });

  /**
   * A run that dies halfway leaves an open order holding stock, so this sweep
   * closes every E2E order it can find — and then *proves* none is left. Each
   * live run therefore finishes with dev inventory exactly where it started,
   * whatever happened on the way.
   */
  test("no E2E order is left open in dev", async ({ page }) => {
    // Cancelling asks `window.confirm`, which Playwright dismisses by default.
    page.on("dialog", (dialog) => void dialog.accept());

    await page.goto("/account");
    await waitForHydration(page);
    await page.getByLabel("Email").fill(STAFF_EMAIL);
    await page.getByLabel("Password").fill(STAFF_PASSWORD);
    await page.locator("form").getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible({
      timeout: 30_000,
    });

    /** The staff list filtered down to this run's orders, filter fully settled. */
    const e2eOrders = async (): Promise<{ href: string; text: string }[]> => {
      await page.goto("/staff/orders");
      await waitForHydration(page);
      await page.getByLabel("Search orders").fill("E2E Shopper");
      const rows = page.locator('a[href^="/staff/orders/"]');
      const empty = page.getByText("No orders match these filters");
      await expect(rows.first().or(empty)).toBeVisible({ timeout: 20_000 });
      // The search debounces for 300ms; reading the list before it settles
      // would both miss orders and risk touching one that is not ours.
      await expect
        .poll(
          () =>
            rows.evaluateAll((nodes) =>
              nodes.every((n) => (n.textContent ?? "").includes("E2E Shopper")),
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

    // One cancellation per pass, each starting from a freshly filtered list.
    for (let pass = 0; pass < 10; pass++) {
      const open = (await e2eOrders()).filter(isOpen);
      if (open.length === 0) break;

      await page.goto(open[0].href);
      await waitForHydration(page);
      // The detail page gates on an access check before it renders its form.
      await expect(page.getByRole("heading", { name: "Update order" })).toBeVisible({
        timeout: 20_000,
      });
      const statusSelect = page.getByLabel("Order status");
      await statusSelect.selectOption("cancelled");
      await expect(statusSelect).toHaveValue("cancelled");
      await page.getByRole("button", { name: "Save update" }).click();
      await expect(
        page
          .locator("span")
          .filter({ hasText: /^cancelled$/ })
          .first(),
      ).toBeVisible({ timeout: 20_000 });
    }

    // Authoritative: an open E2E order means stock is still held, so fail loudly.
    const leftOpen = (await e2eOrders()).filter(isOpen);
    expect(
      leftOpen.map((order) => order.text.slice(0, 60)),
      "every E2E order must be closed before the run ends",
    ).toEqual([]);
  });
});
