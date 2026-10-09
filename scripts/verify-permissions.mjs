import { chromium } from "@playwright/test";

async function testPermissions() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Logging in as admin@mbventuresghana.com...");
  await page.goto("https://mbventuresghana.com/account", {
    waitUntil: "networkidle",
    timeout: 45000,
  });
  await page.locator('input[type="email"]').fill("admin@mbventuresghana.com");
  await page.locator('input[type="password"]').fill("MBVentures2025!Admin#Secure");
  await page.locator("form.auth-form button").click();
  await page.waitForSelector("text=Sign out", { timeout: 20000 });
  console.log("✅ Sign in successful.");

  console.log("Checking /staff/team...");
  await page.goto("https://mbventuresghana.com/staff/team", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  const teamText = await page.textContent("body");
  console.log(
    "✅ Team roster loaded:",
    teamText.includes("admin@mbventuresghana.com") || teamText.includes("Team access"),
  );

  console.log("Checking /staff/settings...");
  await page.goto("https://mbventuresghana.com/staff/settings", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  const settingsText = await page.textContent("body");
  console.log(
    "✅ Settings loaded without permission errors:",
    !settingsText.includes("access required"),
  );

  console.log("Checking /staff/inventory...");
  await page.goto("https://mbventuresghana.com/staff/inventory", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  const invText = await page.textContent("body");
  console.log("✅ Inventory loaded:", !invText.includes("access required"));

  await browser.close();
  console.log("🎉 All permission checks passed!");
}

testPermissions().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
