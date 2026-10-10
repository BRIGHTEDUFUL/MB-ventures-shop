// One-off UI audit: full-page screenshots of every route at desktop + mobile.
// Run with the dev server already up on :8080. Outputs to .artifacts/audit/.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = process.env.AUDIT_BASE ?? "http://localhost:8080";
const OUT = ".artifacts/audit";
const EMAIL = "e2e.staff@example.com";
const PASSWORD = process.env.E2E_STAFF_PASSWORD ?? "E2eStaff!2026";

const PUBLIC = [
  ["home", "/"],
  ["catalogue", "/catalogue"],
  ["product", "/product/electric-standing-desk-rgb-160"],
  ["cart", "/cart"],
  ["checkout", "/checkout"],
  ["account-signedout", "/account"],
  ["track", "/track"],
  ["about", "/about"],
  ["faq", "/faq"],
  ["contact", "/contact"],
];

const STAFF = [
  ["staff-dashboard", "/staff"],
  ["staff-orders", "/staff/orders"],
  ["staff-inventory", "/staff/inventory"],
  ["staff-products", "/staff/products"],
  ["staff-team", "/staff/team"],
  ["staff-customization", "/staff/customization"],
  ["staff-activity", "/staff/activity"],
  ["staff-health", "/staff/health"],
  ["staff-categories", "/staff/categories"],
  ["admin-emails", "/admin/emails"],
  ["account-signedin", "/account"],
];

const VIEWPORTS = [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
];

async function shoot(page, name, vp) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${vp}-${name}.png`, fullPage: true });
  console.log(`captured ${vp}-${name}`);
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

for (const [vpName, viewport] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`PAGEERROR ${vpName}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`CONSOLE ${vpName}: ${m.text()}`);
  });

  for (const [name, path] of PUBLIC) {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    await shoot(page, name, vpName);
  }

  // Sign in for the staff pass.
  await page.goto(BASE + "/account", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText("Store staff hub").waitFor({ timeout: 20_000 });

  for (const [name, path] of STAFF) {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    await shoot(page, name, vpName);
  }

  await ctx.close();
}

await browser.close();
console.log("audit complete");
