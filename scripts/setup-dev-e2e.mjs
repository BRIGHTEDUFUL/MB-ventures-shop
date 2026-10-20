/**
 * Prepare an EMPTY dev deployment for the Playwright suites.
 *
 * Run from the repo root, after functions are pushed and data is seeded:
 *
 *   node node_modules/convex/bin/main.js deploy --env-file .env.dev.local
 *   npx convex run seed:seed --env-file .env.dev.local
 *   npx convex run inventory_import:apply --env-file .env.dev.local
 *   node scripts/setup-dev-e2e.mjs
 *
 * What it does (all idempotent — safe to re-run):
 *   1. Sets a fresh RSA-2048 auth keypair (JWT_PRIVATE_KEY + JWKS) when the
 *      deployment has neither — without a key every sign-in fails with
 *      "Missing environment variable `JWT_PRIVATE_KEY`".
 *   2. Creates e2e.staff@example.com and grants the staff role (the suites
 *      sign in with it to reach the staff console).
 *   3. Writes the prepared `luminous-rgb-mouse-pad` options fixture
 *      (Black/White x Standard/XL, stock 4/4/2/0, XL at GHc 250) that
 *      e2e/variants.spec.ts and the read-only options check expect.
 *
 * Key values are handled in-process and never printed.
 * Requires .env.dev.local with CONVEX_DEPLOY_KEY (gitignored via `*.local`).
 */
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";

const ENV = ["--env-file", ".env.dev.local"];
const BIN = ["node_modules/convex/bin/main.js"];
const STAFF = { email: "e2e.staff@example.com", password: "E2eStaff!2026" };

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

function cli(fn, args) {
  const res = spawnSync("node", [...BIN, "run", fn, JSON.stringify(args), ...ENV], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  try {
    return { ok: true, value: JSON.parse((res.stdout ?? "").trim()) };
  } catch {
    return { ok: false, error: ((res.stdout ?? "") + (res.stderr ?? "")).trim().slice(0, 400) };
  }
}

function envGet(name) {
  const res = spawnSync("node", [...BIN, "env", "get", name, ...ENV], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  return (res.stdout ?? "").trim();
}

function envSet(name, value) {
  // `--` stops option parsing so the PEM (leading dashes) stays positional.
  const res = spawnSync("node", [...BIN, "env", "set", ...ENV, "--", name, value], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  return res.status === 0;
}

// ---- 1. auth keys (only when the deployment has neither) --------------------
const havePriv = envGet("JWT_PRIVATE_KEY").length > 100;
const haveJwks = envGet("JWKS").length > 10;
if (havePriv && haveJwks) {
  check("auth keys already present", true, "left untouched");
} else {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pkcs8 = pair.privateKey
    .export({ format: "pem", type: "pkcs8" })
    .trimEnd()
    .replace(/\n/g, " ");
  const jwks = JSON.stringify({
    keys: [{ use: "sig", ...pair.publicKey.export({ format: "jwk" }) }],
  });
  const k1 = envSet("JWT_PRIVATE_KEY", pkcs8);
  const k2 = envSet("JWKS", jwks);
  const roundTrip = envGet("JWT_PRIVATE_KEY") === pkcs8;
  check("auth keypair set on dev", k1 && k2 && roundTrip);
}

// ---- 2. staff account -------------------------------------------------------
function signIn(flow) {
  return cli("auth:signIn", {
    provider: "password",
    params:
      flow === "signUp"
        ? {
            flow: "signUp",
            email: STAFF.email,
            password: STAFF.password,
            name: "E2E Staff",
            phone: "0240000111",
          }
        : { flow: "signIn", email: STAFF.email, password: STAFF.password },
  });
}

let r = signIn("signUp");
if (!r.ok) r = signIn("signIn");
let token = r.ok ? r.value?.tokens?.token : null;
check("e2e.staff account ready", !!token, r.ok ? "" : r.error);

const grant = cli("users:grantStaff", { email: STAFF.email, role: "staff" });
check("grantStaff role=staff", grant.ok, grant.ok ? "" : grant.error);

r = signIn("signIn");
token = r.ok ? r.value?.tokens?.token : token;
check("e2e.staff signs in", !!r.ok && !!r.value?.tokens?.token);

async function rest(kind, path, args = {}) {
  const res = await fetch(`https://wonderful-porpoise-243.convex.cloud/api/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { status: "error", errorMessage: text.slice(0, 300) };
  }
  if (!res.ok || parsed.status === "error") {
    const msg = parsed.errorMessage ?? parsed.errorData?.message ?? text.slice(0, 300);
    return { ok: false, error: `HTTP ${res.status}: ${msg}` };
  }
  return { ok: true, value: parsed.value };
}

if (token) {
  const perms = await rest("query", "users:myPermissions");
  const list = perms.ok ? perms.value : [];
  check(
    "staff floor covers the suites",
    perms.ok &&
      list.includes("catalogue.edit") &&
      list.includes("orders.update") &&
      list.includes("inventory.adjust"),
    perms.ok ? `${list.length} perms` : perms.error,
  );

  // ---- 3. prepared options fixture ----------------------------------------
  const save = await rest("mutation", "catalogue:saveVariants", {
    slug: "luminous-rgb-mouse-pad",
    variants: [
      {
        key: "black--standard",
        name: "Black / Standard",
        options: { Colour: "Black", Size: "Standard" },
        stock: 4,
        visible: true,
      },
      {
        key: "white--standard",
        name: "White / Standard",
        options: { Colour: "White", Size: "Standard" },
        stock: 4,
        visible: true,
      },
      {
        key: "black--xl",
        name: "Black / XL",
        options: { Colour: "Black", Size: "XL" },
        price: 250,
        stock: 2,
        visible: true,
      },
      {
        key: "white--xl",
        name: "White / XL",
        options: { Colour: "White", Size: "XL" },
        stock: 0,
        visible: true,
      },
    ],
  });
  check("luminous-rgb-mouse-pad fixture saved", save.ok, save.ok ? "" : save.error);

  const store = await rest("query", "store:get");
  const pad = store.ok
    ? (store.value?.products ?? []).find((p) => p.id === "luminous-rgb-mouse-pad")
    : null;
  check(
    "fixture reads back",
    !!pad && pad.stock === 10 && pad.price === 210,
    pad
      ? `stock=${pad.stock} price=${pad.price} variants=${(pad.variants ?? []).length}`
      : store.error,
  );
}

console.log(`\nDEV E2E SETUP: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
