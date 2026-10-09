#!/usr/bin/env node
/**
 * Verify email configuration is ready for live operation.
 * Run: node scripts/verify-email-config.mjs
 */

const requiredVars = [
  { name: "WEB3FORMS_ACCESS_KEY", secret: true },
  { name: "EMAIL_REPLY_TO", secret: false },
  { name: "ADMIN_ALERT_EMAIL", secret: false },
  { name: "EMAIL_DAILY_LIMIT", secret: false },
  { name: "SITE_URL", secret: false },
];

console.log("📧 Email Configuration Verification\n");
console.log("Checking Convex environment variables...\n");

async function checkVar(varName) {
  try {
    const { execSync } = await import("child_process");
    const result = execSync(`npx convex env get ${varName}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch (error) {
    return null;
  }
}

const results = {};
for (const { name, secret } of requiredVars) {
  const value = await checkVar(name);
  results[name] = value;

  if (value === null) {
    console.log(`❌ ${name}: Not set`);
  } else if (secret) {
    console.log(`✅ ${name}: Set (${value.substring(0, 8)}...)`);
  } else {
    console.log(`✅ ${name}: ${value}`);
  }
}

console.log("\n" + "=".repeat(60));

// Determine mode
const hasKey = results.WEB3FORMS_ACCESS_KEY !== null;
const mode = hasKey ? "LIVE" : "DRY-RUN";

if (hasKey) {
  console.log("🟢 Email System Status: LIVE MODE");
  console.log("\n✅ Emails will be sent via Web3Forms");
  console.log("✅ Messages will be forwarded to your inbox");
  console.log("✅ Test by visiting: http://localhost:5173/admin/emails");
} else {
  console.log("🟡 Email System Status: DRY-RUN MODE");
  console.log("\n⚠️  Emails are being logged but not sent");
  console.log("⚠️  Set WEB3FORMS_ACCESS_KEY to enable live delivery");
}

// Check for missing recommended vars
const missing = requiredVars.filter(({ name }) => results[name] === null).map(({ name }) => name);

if (missing.length > 0) {
  console.log("\n⚠️  Missing recommended variables:");
  missing.forEach((name) => console.log(`   - ${name}`));
}

// Provide next steps
console.log("\n" + "=".repeat(60));
console.log("Next Steps:\n");
console.log("1. Start dev server: npm run dev");
console.log("2. Visit admin console: http://localhost:5173/admin/emails");
console.log("3. Verify banner shows: " + (hasKey ? "LIVE MODE (green)" : "DRY RUN (amber)"));
console.log("4. Send a test message from the admin console");
console.log("5. Check your inbox at:", results.ADMIN_ALERT_EMAIL || "(not set)");

console.log("\n📚 Full documentation: docs/EMAIL.md");
console.log("📋 Setup status: docs/EMAIL-SETUP-STATUS.md\n");

process.exit(0);
