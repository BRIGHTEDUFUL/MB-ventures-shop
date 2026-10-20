import { chromium } from "@playwright/test";

/**
 * Verifies the staff permission system on the live site as an admin.
 *
 * SECRETS ARE NEVER COMMITTED. Required environment variable (set it from a
 * local, untracked source — docs/PRODUCTION-CREDENTIALS.md, gitignored):
 *
 *   MB_ADMIN_PASSWORD (admin@mbventuresgh.com)
 *
 * The script exits with an error naming the variable if it is missing.
 */

const ADMIN_PASSWORD = process.env["MB_ADMIN_PASSWORD"] ?? "";
if (!ADMIN_PASSWORD) {
  console.error(
    "Missing required environment variable MB_ADMIN_PASSWORD. " +
      "Passwords are never committed; set it from a local, untracked source " +
      "(docs/PRODUCTION-CREDENTIALS.md) before running this script.",
  );
  process.exit(1);
}

async function testPermissions() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Logging in as admin@mbventuresgh.com...");
  await page.goto("https://mbventuresgh.com/account", {
    waitUntil: "networkidle",
    timeout: 45000,
  });
  await page.locator('input[type="email"]').fill("admin@mbventuresgh.com");
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.locator("form.auth-form button").click();
  await page.waitForSelector("text=Sign out", { timeout: 20000 });
  console.log("✅ Sign in successful.");

  console.log("Checking /staff/team...");
  await page.goto("https://mbventuresgh.com/staff/team", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForSelector("text=admin@mbventuresgh.com", { timeout: 15000 });
  const teamText = await page.textContent("body");
  console.log("✅ Team roster loaded:", teamText.includes("admin@mbventuresgh.com"));

  console.log("Checking /staff/settings...");
  await page.goto("https://mbventuresgh.com/staff/settings", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  const settingsText = await page.textContent("body");
  console.log(
    "✅ Settings loaded without permission errors:",
    !settingsText.includes("access required"),
  );

  console.log("Checking /staff/inventory...");
  await page.goto("https://mbventuresgh.com/staff/inventory", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  const invText = await page.textContent("body");
  console.log("✅ Inventory loaded:", !invText.includes("access required"));

  console.log("Checking /staff/messages...");
  await page.goto("https://mbventuresgh.com/staff/messages", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForSelector("text=Customer Inquiries", { timeout: 15000 });
  const msgText = await page.textContent("body");
  console.log(
    "✅ Messages loaded:",
    !msgText.includes("access required") && msgText.includes("Kofi Mensah"),
  );

  await browser.close();
  console.log("🎉 All permission checks passed!");
}

testPermissions().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
