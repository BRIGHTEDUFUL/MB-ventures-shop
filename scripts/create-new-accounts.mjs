import { spawnSync } from "child_process";

/**
 * Provisions the four @mbventuresgh.com staff/admin logins on the production
 * Convex deployment (see docs/DOMAIN-MIGRATION.md §6). Each account is signed
 * up through the same public auth action the signup form uses, granted its
 * role, then verified with a real sign-in. Safe to re-run: an already-registered
 * email skips signup and just re-grants + re-verifies.
 *
 * SECRETS ARE NEVER COMMITTED. The four passwords must be supplied via
 * environment variables before running; they are stored in the local-only
 * docs/PRODUCTION-CREDENTIALS.md (gitignored) — not in this repository:
 *
 *   MB_MANAGER_PASSWORD   (manager@mbventuresgh.com, admin)
 *   MB_ADMIN_PASSWORD     (admin@mbventuresgh.com, admin)
 *   MB_ATTENDANT_PASSWORD (attendant@mbventuresgh.com, staff)
 *   MB_STAFF_PASSWORD     (staff@mbventuresgh.com, staff)
 *
 * Example (PowerShell, from a local untracked source):
 *   $env:MB_MANAGER_PASSWORD = "…"; node scripts/create-new-accounts.mjs
 *
 * The script exits with an error naming any missing variable.
 */

function requiredEnv(name) {
  const value = process.env[name] ?? "";
  if (!value) {
    console.error(
      `Missing required environment variable ${name}. ` +
        "Passwords are never committed; set it from a local, untracked source " +
        "(docs/PRODUCTION-CREDENTIALS.md) before running this script.",
    );
    process.exit(1);
  }
  return value;
}

function runConvex(func, args) {
  const argStr = JSON.stringify(args);
  const escaped = argStr.replace(/"/g, '\\"');
  const cmd = `npx convex run ${func} "${escaped}" --prod`;
  console.log(`Executing: ${func}`);
  const res = spawnSync(cmd, { shell: true, encoding: "utf8" });
  if (res.status !== 0) {
    console.error("Error stdout:", res.stdout);
    console.error("Error stderr:", res.stderr);
    throw new Error(`Failed to execute ${func}`);
  }
  return JSON.parse(res.stdout.trim().slice(res.stdout.indexOf("{")));
}

async function createAccount(email, password, name, phone, role) {
  console.log(`\n========================================`);
  console.log(`Creating ${role.toUpperCase()}: ${email}...`);
  console.log(`========================================`);

  // Step 1: Sign up through Convex Auth
  try {
    const signUpResult = runConvex("auth:signIn", {
      provider: "password",
      params: {
        flow: "signUp",
        email,
        password,
        name,
        phone,
      },
    });
    console.log(`✅ [${email}] Account registered successfully with tokens.`);
  } catch (err) {
    console.log(`Note on signup: Account may already exist, proceeding to role grant...`);
  }

  // Step 2: Grant role in user_roles table
  const grantResult = runConvex("users:grantStaff", {
    email,
    role,
  });
  console.log(`✅ [${email}] Role granted:`, grantResult);

  // Step 3: Test Sign In verification
  const signInResult = runConvex("auth:signIn", {
    provider: "password",
    params: {
      flow: "signIn",
      email,
      password,
    },
  });
  console.log(`✅ [${email}] Sign in test succeeded! Token generated.`);
}

async function main() {
  // Resolve every required secret up-front so the script never half-provisions.
  const managerPassword = requiredEnv("MB_MANAGER_PASSWORD");
  const adminPassword = requiredEnv("MB_ADMIN_PASSWORD");
  const attendantPassword = requiredEnv("MB_ATTENDANT_PASSWORD");
  const staffPassword = requiredEnv("MB_STAFF_PASSWORD");

  await createAccount(
    "manager@mbventuresgh.com",
    managerPassword,
    "Store Manager",
    "0241234567",
    "admin",
  );

  await createAccount(
    "admin@mbventuresgh.com",
    adminPassword,
    "MB Ventures Admin",
    "0240000001",
    "admin",
  );

  await createAccount(
    "attendant@mbventuresgh.com",
    attendantPassword,
    "Shop Attendant",
    "0247654321",
    "staff",
  );

  await createAccount(
    "staff@mbventuresgh.com",
    staffPassword,
    "MB Ventures Staff",
    "0240000002",
    "staff",
  );

  console.log("\n🎉 All four accounts created and verified on production!");
}

main().catch(console.error);
