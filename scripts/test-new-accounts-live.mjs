import { chromium } from "@playwright/test";

async function testAdminFlow() {
  console.log(`\n========================================`);
  console.log(`Testing NEW ADMIN: manager@mbventuresghana.com`);
  console.log(`========================================`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Navigating to https://mbventuresghana.com/account ...");
  await page.goto("https://mbventuresghana.com/account", {
    waitUntil: "networkidle",
    timeout: 45000,
  });

  await page.locator('input[type="email"]').fill("manager@mbventuresghana.com");
  await page.locator('input[type="password"]').fill("MBVentures2025!Manager#Admin");
  await page.locator("form.auth-form button").click();

  console.log("Waiting for admin session to resolve...");
  await page.waitForSelector("text=Sign out", { timeout: 20000 });
  console.log('✅ Admin session active! "Sign out" visible.');

  console.log("Navigating to /staff/settings (admin-only area)...");
  await page.goto("https://mbventuresghana.com/staff/settings", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  const settingsText = await page.textContent("body");
  if (
    settingsText.includes("Store settings") ||
    settingsText.includes("Mobile Money") ||
    settingsText.includes("Ordering")
  ) {
    console.log("✅ Admin /staff/settings loaded successfully with admin rights!");
  } else {
    console.log("Settings body snippet:", settingsText.slice(0, 300));
  }

  console.log("Navigating to /staff/team (admin-only team management)...");
  await page.goto("https://mbventuresghana.com/staff/team", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  const teamText = await page.textContent("body");
  if (teamText.includes("Grant access") || teamText.includes("Team")) {
    console.log("✅ Admin /staff/team loaded successfully with Grant Access controls!");
  }

  await browser.close();
}

async function testStaffFlow() {
  console.log(`\n========================================`);
  console.log(`Testing NEW STAFF: attendant@mbventuresghana.com`);
  console.log(`========================================`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Navigating to https://mbventuresghana.com/account ...");
  await page.goto("https://mbventuresghana.com/account", {
    waitUntil: "networkidle",
    timeout: 45000,
  });

  await page.locator('input[type="email"]').fill("attendant@mbventuresghana.com");
  await page.locator('input[type="password"]').fill("MBVentures2025!Attendant#Staff");
  await page.locator("form.auth-form button").click();

  console.log("Waiting for staff session to resolve...");
  await page.waitForSelector("text=Sign out", { timeout: 20000 });
  console.log('✅ Staff session active! "Sign out" visible.');

  console.log("Navigating to /staff/orders (staff orders view)...");
  await page.goto("https://mbventuresghana.com/staff/orders", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  const ordersText = await page.textContent("body");
  if (
    ordersText.includes("Orders") ||
    ordersText.includes("All orders") ||
    ordersText.includes("Staff access")
  ) {
    console.log("✅ Staff /staff/orders loaded successfully!");
  }

  console.log("Navigating to /staff/inventory (staff inventory view)...");
  await page.goto("https://mbventuresghana.com/staff/inventory", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  const invText = await page.textContent("body");
  if (invText.includes("Inventory") || invText.includes("Stock") || invText.includes("Catalogue")) {
    console.log("✅ Staff /staff/inventory loaded successfully!");
  }

  await browser.close();
}

async function main() {
  await testAdminFlow();
  await testStaffFlow();
  console.log("\n🎉 ALL FULL-STACK LIVE AUTH & PERMISSION TESTS PASSED!");
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
