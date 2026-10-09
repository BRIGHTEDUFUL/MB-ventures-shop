import { expect, test, type Page } from "@playwright/test";

/** Every public page the shop ships, plus the two private consoles. */
export const STATIC_ROUTES = [
  "/",
  "/catalogue",
  "/cart",
  "/checkout",
  "/account",
  "/track",
  "/about",
  "/delivery",
  "/warranty",
  "/faq",
  "/contact",
  "/terms",
  "/privacy",
  "/staff",
  "/admin/emails",
];

/** Product pages come from the sitemap so this list can never go stale. */
export async function productRoutes(page: Page): Promise<string[]> {
  const res = await page.request.get("/sitemap.xml");
  if (!res.ok()) return [];
  const xml = await res.text();
  return [...xml.matchAll(/<loc>[^<]*?(\/product\/[^<]+)<\/loc>/g)].map((m) => m[1]);
}

export function collectPageProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console: ${msg.text()}`);
  });
  return problems;
}

/**
 * Wait for React to finish hydrating a server-rendered page.
 *
 * TanStack Start ships `window.$_TSR` with `h()`/`e()` handlers and deletes the
 * object once hydration and the stream are both done, so its absence is an
 * exact hydration signal. Typing into a controlled input before that point is
 * lost: React reconciles the field back to its server value.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => !("$_TSR" in window), undefined, { timeout: 30_000 });
}
