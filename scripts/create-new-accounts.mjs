import { spawnSync } from "child_process";

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
  await createAccount(
    "manager@mbventuresghana.com",
    "MBVentures2025!Manager#Admin",
    "Store Manager",
    "0241234567",
    "admin",
  );

  await createAccount(
    "attendant@mbventuresghana.com",
    "MBVentures2025!Attendant#Staff",
    "Shop Attendant",
    "0247654321",
    "staff",
  );

  console.log("\n🎉 Both accounts successfully created and verified on production!");
}

main().catch(console.error);
