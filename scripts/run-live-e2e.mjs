/**
 * Cross-platform runner for the live journeys (purchase + product options).
 *
 * `E2E_LIVE=1` has no portable spelling in an npm script (PowerShell, cmd and
 * bash each disagree), and Playwright reads that flag in its worker process,
 * where CLI filters are no longer visible. So the opt-in lives here: this
 * runner forwards every argument to Playwright with the flag already set.
 *
 *   npm run test:e2e:live
 *   npm run test:e2e:live -- --headed
 *
 * PREFLIGHT: these specs write real orders, so the dev server they talk to
 * must point at the dev Convex deployment. `.env` pins the production
 * `VITE_CONVEX_URL`, and a fresh clone has no `.env.local` — vite dev would
 * then happily talk to production and the suite would place real orders
 * there. Resolve the URL exactly the way Vite does for dev mode (first file
 * that defines `VITE_CONVEX_URL` wins, highest-priority file first) and
 * refuse to start unless it is the dev deployment.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Hostname fragment of the dev Convex deployment (`dev:wonderful-porpoise-243`). */
const DEV_CONVEX_HOST = "wonderful-porpoise-243";

/**
 * Vite's dev-mode `.env` load order, highest priority first: later files
 * override earlier ones, so the first file in this list that defines the
 * variable is the one dev actually uses. Missing files are skipped.
 */
const ENV_FILES_IN_PRIORITY_ORDER = [
  ".env.development.local",
  ".env.local",
  ".env.development",
  ".env",
];

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

/** `process.env` is not part of Vite's `import.meta.env`, so only files count. */
function resolveViteConvexUrl() {
  for (const file of ENV_FILES_IN_PRIORITY_ORDER) {
    const path = resolve(projectRoot, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line === "" || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      if (line.slice(0, eq).trim() !== "VITE_CONVEX_URL") continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
        (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
      ) {
        value = value.slice(1, -1);
      }
      return { file, value };
    }
  }
  return null;
}

/** Hostname only — never echo the full URL or anything else from the env files. */
function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "(not a URL)";
  }
}

function preflight() {
  const override = (process.env.E2E_ALLOW_CONVEX_URL ?? "").trim();
  const resolved = resolveViteConvexUrl();
  const url = resolved?.value ?? "";
  const host = url === "" ? "(unset)" : hostOf(url);

  if (override !== "") {
    console.log(
      `[e2e] E2E_ALLOW_CONVEX_URL is set — running against ${host} without the dev check.`,
    );
    return;
  }

  if (url !== "" && url.includes(DEV_CONVEX_HOST)) {
    console.log(`[e2e] VITE_CONVEX_URL → ${host} (dev deployment) — live suite allowed.`);
    return;
  }

  const source = resolved === null ? "no env file defines it" : `read from ${resolved.file}`;
  console.error(
    [
      "",
      "[e2e] REFUSING to run the live suite: VITE_CONVEX_URL does not point at the dev deployment.",
      `[e2e]   resolved: ${host} (${source})`,
      `[e2e]   expected: a URL containing "${DEV_CONVEX_HOST}" (dev:wonderful-porpoise-243)`,
      "",
      "These specs WRITE real orders. `.env` pins the production Convex URL, and without a",
      "`.env.local` vite dev would talk to production.",
      "",
      "Fix one of:",
      "  - create .env.local with VITE_CONVEX_URL=<your dev deployment URL>, or",
      "  - set E2E_ALLOW_CONVEX_URL=1 to take responsibility for the target URL yourself.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

preflight();

// Playwright's own CLI, run under this Node binary so the child is portable
// (no shell, no `.cmd` shim resolution on Windows). The package's `exports`
// map does not expose `./cli.js`, so point at the installed file directly.
const playwrightCli = fileURLToPath(
  new URL("../node_modules/@playwright/test/cli.js", import.meta.url),
);

const child = spawn(
  process.execPath,
  [playwrightCli, "test", "e2e/purchase.spec.ts", "e2e/variants.spec.ts", ...process.argv.slice(2)],
  { stdio: "inherit", env: { ...process.env, E2E_LIVE: "1" } },
);

child.on("exit", (code, signal) => process.exit(code ?? (signal === null ? 0 : 1)));
