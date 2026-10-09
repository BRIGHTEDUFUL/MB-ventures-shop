#!/usr/bin/env node
/**
 * Create production admin and staff accounts
 * Run this after registering the accounts at /auth/signup
 *
 * Usage: node scripts/create-production-accounts.mjs
 */

import { execSync } from "child_process";

const accounts = [
  {
    email: "admin@mbventuresghana.com",
    name: "MB Ventures Admin",
    role: "Administrator",
  },
  {
    email: "staff@mbventuresghana.com",
    name: "MB Ventures Staff",
    role: "Staff",
  },
];

console.log("=".repeat(60));
console.log("Production Account Setup - MB Ventures GH");
console.log("=".repeat(60));
console.log("");

console.log("STEP 1: Register accounts at https://mbventuresghana.com/account?signup=true");
console.log("");

for (const account of accounts) {
  console.log(`${account.role} Account:`);
  console.log(`  Name: ${account.name}`);
  console.log(`  Email: ${account.email}`);
  console.log(`  Password: [See docs/PRODUCTION-CREDENTIALS.md]`);
  console.log("");
}

console.log("Have you registered both accounts? (yes/no)");
console.log("");
console.log("If yes, continue with STEP 2 to grant privileges:");
console.log("");

console.log("STEP 2: Grant staff privileges (Windows PowerShell):");
console.log("");

for (const account of accounts) {
  const roleArg = account.role === "Staff" ? ',\\"role\\":\\"staff\\"' : ',\\"role\\":\\"admin\\"';
  const cmd = `npx convex run users:grantStaff '{\\"email\\":\\"${account.email}\\"${roleArg}}' --prod`;
  console.log(`# Grant ${account.role} role:`);
  console.log(cmd);
  console.log("");
}

console.log("Or run in bash/sh:");
console.log("");

for (const account of accounts) {
  const roleArg = account.role === "Staff" ? ',"role":"staff"' : ',"role":"admin"';
  const cmd = `npx convex run users:grantStaff '{"email":"${account.email}"${roleArg}}' --prod`;
  console.log(`# Grant ${account.role} role:`);
  console.log(cmd);
  console.log("");
}

console.log("=".repeat(60));
console.log("");
console.log("VERIFICATION:");
console.log("");
console.log("1. Sign in at https://mbventuresghana.com/auth/signin");
console.log("2. Navigate to /staff");
console.log("3. Verify admin sees Mobile Money settings");
console.log("4. Verify staff does NOT see Mobile Money settings");
console.log("");
console.log("For detailed instructions, see:");
console.log("  • docs/PRODUCTION-CREDENTIALS.md");
console.log("  • docs/HOSTINGER-SETUP-CHECKLIST.md (Phase 7)");
console.log("");
