import { chromium } from "@playwright/test";

/**
 * Live auth smoke test for the production admin and staff accounts.
 *
 * SECRETS ARE NEVER COMMITTED. Required environment variables (set them from a
 * local, untracked source — docs/PRODUCTION-CREDENTIALS.md, gitignored):
 *
 *   MB_ADMIN_PASSWORD (admin@mbventuresgh.com)
 *   MB_STAFF_PASSWORD (staff@mbventuresgh.com)
 *
 * The script exits with an error naming any missing variable.
 */

const ADMIN_PASSWORD = process.env["MB_ADMIN_PASSWORD"] ?? "";
const STAFF_PASSWORD = process.env["MB_STAFF_PASSWORD"] ?? "";
for (const [name, value] of [
  ["MB_ADMIN_PASSWORD", ADMIN_PASSWORD],
  ["MB_STAFF_PASSWORD", STAFF_PASSWORD],
]) {
  if (!value) {
    console.error(
      `Missing required environment variable ${name}. ` +
        "Passwords are never committed; set it from a local, untracked source " +
        "(docs/PRODUCTION-CREDENTIALS.md) before running this script.",
    );
    process.exit(1);
  }
}

async function testRole(email, password, roleName) {
  console.log(`\n========================================`);
  console.log(`Testing ${roleName} (${email})...`);
  console.log(`========================================`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("console", (msg) => {
    const text = msg.text();
    if (!text.includes("[vite]") && !text.includes("Download the React DevTools")) {
      console.log(`[${roleName} BROWSER CONSOLE] ${msg.type()}: ${text}`);
    }
  });
  page.on("pageerror", (err) => console.error(`[${roleName} BROWSER ERROR]`, err.message));

  console.log("Navigating to https://mbventuresgh.com/account ...");
  await page.goto("https://mbventuresgh.com/account", {
    waitUntil: "networkidle",
    timeout: 45000,
  });

  console.log("Page title:", await page.title());

  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  const submitButton = page.locator("form.auth-form button");

  await emailInput.fill(email);
  await passwordInput.fill(password);

  console.log("Submitting credentials...");
  await submitButton.click();

  console.log("Waiting for auth resolution...");
  try {
    await page.waitForSelector("text=Sign out", { timeout: 20000 });
    console.log(`✅ [${roleName}] Signed in successfully! "Sign out" button detected.`);

    // Check for role-specific access
    const bodyText = await page.textContent("body");
    if (bodyText.includes("Store staff hub")) {
      console.log(`✅ [${roleName}] "Store staff hub" button is visible.`);
    }

    // Now test navigating to /staff
    console.log(`Navigating to https://mbventuresgh.com/staff ...`);
    await page.goto("https://mbventuresgh.com/staff", {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    const staffText = await page.textContent("body");
    if (
      staffText.includes("Overview") ||
      staffText.includes("Orders") ||
      staffText.includes("Catalogue") ||
      staffText.includes("Staff hub") ||
      staffText.includes("MB Ventures GH")
    ) {
      console.log(`✅ [${roleName}] /staff loaded successfully!`);
    } else {
      console.log(`[${roleName}] /staff content snippet:`, staffText.slice(0, 300));
    }
  } catch (e) {
    console.error(`❌ [${roleName}] Timed out waiting for signed-in state:`, e.message);
    const body = await page.textContent("body");
    console.log(`Body content:`, body.slice(0, 600));
  }

  await browser.close();
}

async function main() {
  await testRole("admin@mbventuresgh.com", ADMIN_PASSWORD, "Admin");
  await testRole("staff@mbventuresgh.com", STAFF_PASSWORD, "Staff");
}

main().catch((err) => {
  console.error("Test script failed:", err);
  process.exit(1);
});
