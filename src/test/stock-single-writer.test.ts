import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source-level guard for defect **C1** ("stock is patched directly in five
 * places").
 *
 * `convex/lib/stock.ts` is the only file allowed to write `products.stock` or
 * `products.reserved`, and — for the same reason — the only file allowed to
 * insert into `inventory_history`. Those two rules are what make the ledger an
 * honest explanation of every number on screen: a movement row exists *iff* a
 * count moved, reservations are always respected, and no regression can quietly
 * reintroduce a sixth hand-rolled read → patch → log sequence.
 *
 * This is deliberately a source scan rather than a runtime test: the failure it
 * is guarding against is a new line of code, and this fails the moment that
 * line is written instead of months later when the numbers stop adding up.
 */

const CONVEX_DIR = join(process.cwd(), "convex");
const CHOKE_POINT = join(CONVEX_DIR, "lib", "stock.ts");

/** Directory entries that are generated or vendored, not hand-written logic. */
const SKIP_DIRS = new Set(["_generated", "node_modules", "dist"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(path, out);
    } else if (entry.endsWith(".ts")) {
      out.push(path);
    }
  }
  return out;
}

const sources = walk(CONVEX_DIR);

/**
 * The argument object of a call such as `ctx.db.patch(id, { … })` or
 * `ctx.db.insert("products", { … })`, taken as the balanced-brace slice that
 * starts at the first `{` after the call. Brace-balanced rather than
 * line-based so a multi-line patch (the normal case) is read correctly.
 */
function callArgument(source: string, match: RegExpExecArray): string | null {
  const open = source.indexOf("{", match.index + match[0].length);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

/** Every `ctx.db.patch(...)` / `ctx.db.replace(...)` payload, with position. */
function writes(source: string, pattern: RegExp): { arg: string; at: number }[] {
  const out: { arg: string; at: number }[] = [];
  const re = new RegExp(pattern.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const arg = callArgument(source, match);
    if (arg !== null) out.push({ arg, at: match.index });
  }
  return out;
}

/** Files whose stock writes are legitimate, and why. */
const allowedFiles = new Map<string, string>([
  [CHOKE_POINT, "the choke point itself"],
  [
    join(CONVEX_DIR, "migrations.ts"),
    "the one-time reservation backfill: it sets products.reserved from what open " +
      "orders already hold, which is the state the choke point assumes already " +
      "exists. Deliberately the only other name on this list.",
  ],
]);

const describePath = (path: string) => relative(CONVEX_DIR, path).replaceAll("\\", "/");

describe("stock has exactly one writer", () => {
  it("found the Convex sources it is meant to police", () => {
    expect(sources.length).toBeGreaterThan(10);
    expect(sources).toContain(CHOKE_POINT);
  });

  it("no file outside convex/lib/stock.ts patches products.stock or products.reserved", () => {
    const offenders: string[] = [];

    for (const path of sources) {
      if (allowedFiles.has(path)) continue;
      const source = readFileSync(path, "utf8");

      // `ctx.db.patch(id, { … })` / `ctx.db.replace(id, { … })` on a product.
      for (const pattern of [/\.patch\s*\(/g, /\.replace\s*\(/g]) {
        for (const { arg, at } of writes(source, pattern)) {
          if (/\bstock\s*:/.test(arg) || /\breserved\s*:/.test(arg)) {
            const line = source.slice(0, at).split("\n").length;
            offenders.push(`${describePath(path)}:${line} writes stock/reserved in a patch`);
          }
        }
      }

      // `ctx.db.insert("products", { … })` — a brand-new row may only start at
      // zero; opening stock must be a real movement through the choke point so
      // it lands in the ledger like any other count. (Matched to the value's
      // terminator rather than with a lookahead, which a `\s*` before it would
      // happily backtrack past.)
      for (const { arg, at } of writes(source, /\.insert\s*\(\s*["']products["']/g)) {
        const field = /\b(stock|reserved)\s*:\s*([^,}\n]*)/g;
        let match: RegExpExecArray | null;
        while ((match = field.exec(arg)) !== null) {
          const field_name = match[1];
          const value = (match[2] ?? "").trim();
          if (field_name !== undefined && value !== "0") {
            const line = source.slice(0, at).split("\n").length;
            offenders.push(
              `${describePath(path)}:${line} inserts a product with ${field_name} set directly`,
            );
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("no file outside convex/lib/stock.ts inserts an inventory_history row", () => {
    const offenders: string[] = [];

    for (const path of sources) {
      if (allowedFiles.has(path)) continue;
      const source = readFileSync(path, "utf8");
      const re = /\.insert\s*\(\s*["']inventory_history["']/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(source)) !== null) {
        const line = source.slice(0, match.index).split("\n").length;
        offenders.push(`${describePath(path)}:${line} writes the stock ledger directly`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("the choke point still exists and exports applyStockChange", () => {
    const source = readFileSync(CHOKE_POINT, "utf8");
    expect(source).toContain("export async function applyStockChange");
    // Every path through it leaves exactly one ledger row per moved count.
    expect(source).toContain('ctx.db.insert("inventory_history"');
    expect(source).not.toContain("ctx.db.patch(product._id, { stock");
  });
});
