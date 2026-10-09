/**
 * Cross-platform runner for the live purchase journey.
 *
 * `E2E_LIVE=1` has no portable spelling in an npm script (PowerShell, cmd and
 * bash each disagree), and Playwright reads that flag in its worker process,
 * where CLI filters are no longer visible. So the opt-in lives here: this
 * runner forwards every argument to Playwright with the flag already set.
 *
 *   npm run test:e2e:live
 *   npm run test:e2e:live -- --headed
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cli = require.resolve("@playwright/test/cli");

const child = spawn(
  process.execPath,
  [cli, "test", "e2e/purchase.spec.ts", ...process.argv.slice(2)],
  { stdio: "inherit", env: { ...process.env, E2E_LIVE: "1" } },
);

child.on("exit", (code, signal) => process.exit(code ?? (signal === null ? 0 : 1)));
