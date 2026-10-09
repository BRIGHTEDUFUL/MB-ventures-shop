import { defineConfig } from "@playwright/test";

const PORT = 5173;

/**
 * Browser checks that Vitest cannot do: real layout at phone widths, real
 * document head tags, and the cart → checkout → track journey. Unit tests stay
 * in `src/test` under Vitest; nothing in `e2e/` is picked up by `npm test`.
 */
export default defineConfig({
  testDir: "./e2e",
  // One worker: every spec talks to the same dev deployment and the same cart.
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx vite dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    // A dev server you already have running is reused, so `npm run dev` in one
    // terminal and `npm run test:e2e` in another just work.
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
