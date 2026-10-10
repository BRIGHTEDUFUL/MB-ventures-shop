/**
 * Mobile layout audit — measures the things a phone user actually trips over.
 *
 * Deliberately not a Lighthouse run: this reports concrete, addressable defects
 * (overflow, tiny tap targets, iOS input zoom, text below a readable size) with
 * enough of a selector to go and fix them.
 *
 *   node scripts/mobile-audit.mjs [baseUrl] [--email=.. --password=..]
 *
 * With credentials it signs in first, so the staff hub and account pages are
 * audited too. Widths are the common phone sizes, 320 included because that is
 * the width the e2e overflow checks hold the storefront to.
 */
import { chromium } from "playwright";

const args = process.argv.slice(2);
const baseURL = args.find((a) => !a.startsWith("--")) || "http://localhost:5173";
const opt = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const WIDTHS = [320, 375, 414];

/** Public pages first; the signed-in ones are only reachable with credentials. */
const ROUTES = [
  "/",
  "/catalogue",
  "/product/monitor-light-bar",
  "/cart",
  "/checkout",
  "/track",
  "/contact",
  "/about",
  "/faq",
  "/account",
];

const SIGNED_IN_ROUTES = ["/staff", "/staff/orders", "/staff/inventory", "/account"];

/**
 * Runs inside the page. Returns one record per defect so the report can point
 * at the element instead of saying "something is wide".
 */
const COLLECT = () => {
  const vw = window.innerWidth;
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls =
      typeof el.className === "string" && el.className.trim()
        ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
        : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  const out = { overflowX: 0, wide: [], tinyTargets: [], inputZoom: [], smallText: [] };

  out.overflowX = document.documentElement.scrollWidth;

  const all = [...document.querySelectorAll("body *")];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);

    // 1. Sticking out past the right edge (or off the left).
    if ((r.right > vw + 1 || r.left < -1) && cs.position !== "fixed") {
      // Inside a deliberate horizontal scroller a card is allowed to peek.
      let scroller = el.parentElement,
        allowed = false;
      while (scroller && scroller !== document.body) {
        const ox = getComputedStyle(scroller).overflowX;
        if (ox === "auto" || ox === "scroll") {
          allowed = true;
          break;
        }
        scroller = scroller.parentElement;
      }
      if (!allowed && out.wide.length < 12) {
        out.wide.push({ sel: describe(el), right: Math.round(r.right), vw });
      }
    }

    // 2. Text too small to read comfortably.
    if (el.children.length === 0 && el.textContent.trim()) {
      const size = parseFloat(cs.fontSize);
      if (size > 0 && size < 12 && out.smallText.length < 12) {
        out.smallText.push({ sel: describe(el), size });
      }
    }

    // 3. iOS zooms into any focused field under 16px — the classic phone bug.
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
      const size = parseFloat(cs.fontSize);
      if (size < 16 && out.inputZoom.length < 12) {
        out.inputZoom.push({ sel: describe(el), size });
      }
    }

    // 4. Real controls that are too small to hit reliably.
    const isControl =
      /^(BUTTON|SELECT)$/.test(el.tagName) ||
      el.getAttribute("role") === "button" ||
      el.getAttribute("role") === "tab" ||
      (el.tagName === "A" && cs.display !== "inline" && el.getAttribute("href"));
    if (isControl && (r.height < 40 || r.width < 40) && out.tinyTargets.length < 15) {
      const label = (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 32);
      out.tinyTargets.push({
        sel: describe(el),
        label,
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
  }
  return out;
};

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
// Vite's dev server serves CSS through a <link>, and its ETag does not always
// move when the file changes underneath an already-running watcher. A stale
// stylesheet would make the audit report fixes that are not actually applied,
// so bypass the HTTP cache entirely and always measure the live CSS.
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

const findings = [];

async function signIn() {
  const email = opt("email"),
    password = opt("password");
  if (!email || !password) return false;
  await page.goto(`${baseURL}/account`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(900);
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/account", { timeout: 15000 });
  return true;
}

async function audit(route, width) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`${baseURL}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  // Let the stream finish and the Convex queries land, or every page measures
  // its skeleton.
  await page.waitForTimeout(900);
  const r = await page.evaluate(COLLECT);
  const name = `${route} @ ${width}px`;
  if (r.overflowX > width) {
    findings.push({
      route: name,
      kind: "horizontal scroll",
      detail: `scrollWidth ${r.overflowX} > ${width}`,
    });
  }
  for (const w of r.wide)
    findings.push({ route: name, kind: "off-screen", detail: `${w.sel} ends at ${w.right}px` });
  for (const t of r.tinyTargets)
    findings.push({
      route: name,
      kind: "tap target",
      detail: `${t.sel} ${t.w}×${t.h} — "${t.label}"`,
    });
  for (const i of r.inputZoom)
    findings.push({
      route: name,
      kind: "iOS zoom",
      detail: `${i.sel} font-size ${i.size}px (<16)`,
    });
  for (const s of r.smallText)
    findings.push({ route: name, kind: "tiny text", detail: `${s.sel} font-size ${s.size}px` });
}

const signedIn = await signIn();
if (signedIn) ROUTES.push(...SIGNED_IN_ROUTES);

for (const route of ROUTES) {
  for (const width of WIDTHS) {
    await audit(route, width);
  }
}

await browser.close();

if (findings.length === 0) {
  console.log(
    `\nCLEAN — no mobile defects found across ${ROUTES.length} routes × ${WIDTHS.length} widths.`,
  );
} else {
  const byKind = {};
  for (const f of findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  console.log(
    `\n${findings.length} findings across ${ROUTES.length} routes × ${WIDTHS.length} widths:\n`,
  );
  console.log(
    Object.entries(byKind)
      .map(([k, v]) => `${k}: ${v}`)
      .join("  |  "),
  );
  console.log("");
  let last = "";
  for (const f of findings) {
    if (f.route !== last) {
      console.log(`\n${f.route}`);
      last = f.route;
    }
    console.log(`   [${f.kind}] ${f.detail}`);
  }
}
