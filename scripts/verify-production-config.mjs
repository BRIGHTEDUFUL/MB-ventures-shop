#!/usr/bin/env node
/**
 * Verify production configuration for mbventuresghana.com
 * Run: node scripts/verify-production-config.mjs
 */

import { execSync } from "child_process";

console.log("🏭 Production Configuration Verification\n");
console.log("Domain: https://mbventuresghana.com");
console.log("Email: info@mbventuresghana.com");
console.log("Deployment: prod:necessary-newt-861\n");
console.log("=" .repeat(60));

const requiredVars = [
  "SITE_URL",
  "WEB3FORMS_ACCESS_KEY",
  "EMAIL_REPLY_TO",
  "ADMIN_ALERT_EMAIL",
  "EMAIL_DAILY_LIMIT",
];

async function checkProductionVar(varName) {
  try {
    const result = execSync(`npx convex env get ${varName} --prod`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch (error) {
    return null;
  }
}

console.log("\n📋 Convex Production Environment:\n");

const results = {};
let allSet = true;

for (const varName of requiredVars) {
  const value = await checkProductionVar(varName);
  results[varName] = value;

  if (value === null) {
    console.log(`❌ ${varName}: NOT SET`);
    allSet = false;
  } else if (varName === "WEB3FORMS_ACCESS_KEY") {
    console.log(`✅ ${varName}: ${value.substring(0, 10)}...`);
  } else {
    console.log(`✅ ${varName}: ${value}`);
  }
}

console.log("\n" + "=".repeat(60));

// Check expected values
const checks = [
  {
    name: "Production domain",
    condition: results.SITE_URL === "https://mbventuresghana.com",
    expected: "https://mbventuresghana.com",
    actual: results.SITE_URL,
  },
  {
    name: "Reply-to email",
    condition: results.EMAIL_REPLY_TO === "info@mbventuresghana.com",
    expected: "info@mbventuresghana.com",
    actual: results.EMAIL_REPLY_TO,
  },
  {
    name: "Admin alert email",
    condition: results.ADMIN_ALERT_EMAIL === "info@mbventuresghana.com",
    expected: "info@mbventuresghana.com",
    actual: results.ADMIN_ALERT_EMAIL,
  },
  {
    name: "Web3Forms key set",
    condition: results.WEB3FORMS_ACCESS_KEY !== null && results.WEB3FORMS_ACCESS_KEY.length > 0,
    expected: "Non-empty key",
    actual: results.WEB3FORMS_ACCESS_KEY ? "Set" : "Not set",
  },
  {
    name: "Daily limit reasonable",
    condition: results.EMAIL_DAILY_LIMIT && parseInt(results.EMAIL_DAILY_LIMIT) >= 100,
    expected: "≥ 100",
    actual: results.EMAIL_DAILY_LIMIT,
  },
];

console.log("\n✅ Configuration Checks:\n");

let allChecksPassed = true;
for (const check of checks) {
  if (check.condition) {
    console.log(`✅ ${check.name}: ${check.actual}`);
  } else {
    console.log(`❌ ${check.name}: Expected "${check.expected}", got "${check.actual}"`);
    allChecksPassed = false;
  }
}

console.log("\n" + "=".repeat(60));

// Check .env.production file
console.log("\n📄 Frontend Environment (.env.production):\n");

try {
  const fs = await import("fs");
  const envProd = fs.readFileSync(".env.production", "utf8");
  
  const hasConvexUrl = envProd.includes("VITE_CONVEX_URL=https://necessary-newt-861.convex.cloud");
  const hasSiteUrl = envProd.includes("VITE_SITE_URL=https://mbventuresghana.com");
  
  console.log(hasConvexUrl ? "✅" : "❌", "VITE_CONVEX_URL points to production");
  console.log(hasSiteUrl ? "✅" : "❌", "VITE_SITE_URL set to mbventuresghana.com");
} catch (error) {
  console.log("❌ Could not read .env.production");
}

console.log("\n" + "=".repeat(60));

// Overall status
if (allSet && allChecksPassed) {
  console.log("\n🎉 Production Configuration: COMPLETE\n");
  console.log("✅ All environment variables set correctly");
  console.log("✅ Domain configured: https://mbventuresghana.com");
  console.log("✅ Email configured: info@mbventuresghana.com");
  console.log("✅ Web3Forms key set for email delivery");
  console.log("✅ Email system ready for live operation\n");
  
  console.log("Next Steps:");
  console.log("1. Deploy backend: npx convex deploy --prod");
  console.log("2. Build frontend: npm run build");
  console.log("3. Deploy frontend to hosting");
  console.log("4. Point DNS to hosting");
  console.log("5. Test: https://mbventuresghana.com\n");
  
  process.exit(0);
} else {
  console.log("\n⚠️  Production Configuration: INCOMPLETE\n");
  
  if (!allSet) {
    console.log("❌ Some environment variables are missing");
    console.log("   Run the commands in docs/PRODUCTION-CONFIG.md\n");
  }
  
  if (!allChecksPassed) {
    console.log("❌ Some configuration values are incorrect");
    console.log("   Review docs/PRODUCTION-CONFIG.md for expected values\n");
  }
  
  process.exit(1);
}
