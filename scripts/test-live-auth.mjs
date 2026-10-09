import { chromium } from '@playwright/test';

async function testRole(email, password, roleName) {
  console.log(`\n========================================`);
  console.log(`Testing ${roleName} (${email})...`);
  console.log(`========================================`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (!text.includes('[vite]') && !text.includes('Download the React DevTools')) {
      console.log(`[${roleName} BROWSER CONSOLE] ${msg.type()}: ${text}`);
    }
  });
  page.on('pageerror', err => console.error(`[${roleName} BROWSER ERROR]`, err.message));

  console.log('Navigating to https://mbventuresghana.com/account ...');
  await page.goto('https://mbventuresghana.com/account', { waitUntil: 'networkidle', timeout: 45000 });

  console.log('Page title:', await page.title());

  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  const submitButton = page.locator('form.auth-form button');

  await emailInput.fill(email);
  await passwordInput.fill(password);

  console.log('Submitting credentials...');
  await submitButton.click();

  console.log('Waiting for auth resolution...');
  try {
    await page.waitForSelector('text=Sign out', { timeout: 20000 });
    console.log(`✅ [${roleName}] Signed in successfully! "Sign out" button detected.`);
    
    // Check for role-specific access
    const bodyText = await page.textContent('body');
    if (bodyText.includes('Store staff hub')) {
      console.log(`✅ [${roleName}] "Store staff hub" button is visible.`);
    }

    // Now test navigating to /staff
    console.log(`Navigating to https://mbventuresghana.com/staff ...`);
    await page.goto('https://mbventuresghana.com/staff', { waitUntil: 'networkidle', timeout: 30000 });
    const staffText = await page.textContent('body');
    if (staffText.includes('Overview') || staffText.includes('Orders') || staffText.includes('Catalogue') || staffText.includes('Staff hub') || staffText.includes('MB Ventures GH')) {
      console.log(`✅ [${roleName}] /staff loaded successfully!`);
    } else {
      console.log(`[${roleName}] /staff content snippet:`, staffText.slice(0, 300));
    }
  } catch (e) {
    console.error(`❌ [${roleName}] Timed out waiting for signed-in state:`, e.message);
    const body = await page.textContent('body');
    console.log(`Body content:`, body.slice(0, 600));
  }

  await browser.close();
}

async function main() {
  await testRole('admin@mbventuresghana.com', 'MBVentures2025!Admin#Secure', 'Admin');
  await testRole('staff@mbventuresghana.com', 'MBVentures2025!Staff#Secure', 'Staff');
}

main().catch(err => {
  console.error('Test script failed:', err);
  process.exit(1);
});
