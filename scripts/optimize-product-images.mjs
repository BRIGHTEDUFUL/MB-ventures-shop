#!/usr/bin/env node
/**
 * Optimize oversized Convex-storage product photos in place.
 *
 * Live catalogue images are ~2 MB each (measured 215 MB / 109 images on
 * 20 Oct 2026). This script downloads each storage-backed image, re-encodes
 * it with sharp (max width 1600px, WebP), uploads the result through the SAME
 * staff upload path the UI uses (uploads.generateUploadUrl -> savePhoto), and
 * repoints the row with `photos:retargetImage`. Originals are only deleted by
 * a separate `--delete-old` sweep, and only when no row still references them.
 *
 * Usage:
 *   node scripts/optimize-product-images.mjs                  # dry run (report only)
 *   node scripts/optimize-product-images.mjs --apply          # upload + repoint
 *   node scripts/optimize-product-images.mjs --apply --only k-desk --limit 3
 *   node scripts/optimize-product-images.mjs --apply --concurrency 8
 *   node scripts/optimize-product-images.mjs --delete-old     # sweep replaced originals
 *
 * Env:
 *   MB_MANAGER_EMAIL / MB_MANAGER_PASSWORD  manager account (from the local
 *     credentials file, never committed); needs catalogue.edit + catalogue.delete.
 *   CONVEX_URL   defaults to VITE_CONVEX_URL from .env (production).
 *
 * Idempotent: images already below the size threshold are skipped, so re-running
 * --apply only picks up whatever is still heavy.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { ConvexHttpClient } from "convex/browser";

const MAX_KB_BEFORE = 350; // originals at/below this are already light
const MAX_WIDTH = 1600; // 2x the widest gallery render
const WEBP_QUALITY = 78;
const MIN_SAVING = 0.1; // skip unless at least 10% smaller
const MANIFEST = ".tmp-optimize-manifest.json";

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const opt = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : dflt;
};
const APPLY = has("--apply");
const DELETE_OLD = has("--delete-old");
const ONLY = opt("--only", null);
const LIMIT = Number(opt("--limit", "0")) || 0;
const CONCURRENCY = Number(opt("--concurrency", "6")) || 6;

const kb = (bytes) => Math.round(bytes / 1024);
const STORAGE_RE = /^https:\/\/[^/]+\/api\/storage\/[A-Za-z0-9-]+$/;

/** Replacements recorded by earlier runs (empty when there is no manifest yet). */
function readManifest() {
  try {
    const parsed = JSON.parse(readFileSync(MANIFEST, "utf8"));
    return Array.isArray(parsed.replaced) ? parsed.replaced : [];
  } catch {
    return [];
  }
}

function convexUrl() {
  if (process.env.CONVEX_URL) return process.env.CONVEX_URL;
  const envText = readFileSync(".env", "utf8");
  const m = envText.match(/^VITE_CONVEX_URL=(.+)$/m);
  if (!m) throw new Error("Set CONVEX_URL or define VITE_CONVEX_URL in .env");
  return m[1].trim();
}

/** Current catalogue via the Convex CLI (deploy key, read-only). */
function storeGet() {
  const res = spawnSync(
    "node",
    [
      "node_modules/convex/bin/main.js",
      "run",
      "store:get",
      "{}",
      "--env-file",
      opt("--env-file", ".env.prod.local"),
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (res.status !== 0) {
    throw new Error(`store:get failed: ${(res.stderr || res.stdout || "").slice(0, 300)}`);
  }
  return JSON.parse(res.stdout);
}

/** Every storage-backed image reference in the live catalogue. */
function collectTargets(store) {
  const targets = [];
  const add = (slug, field, url, extra) => {
    if (typeof url === "string" && url.includes("/api/storage/")) {
      targets.push({ slug, field, url, ...extra });
    }
  };
  for (const p of store.products ?? []) {
    // The store DTO names the slug `id` (see productDTO in convex/lib/dto.ts).
    add(p.id, "image_key", p.image_key);
    (p.gallery ?? []).forEach((url, i) => add(p.id, "gallery", url, { gallery_index: i }));
    for (const v of p.variants ?? []) {
      add(p.id, "variant_image", v.image_key, { variant_key: v.key });
    }
  }
  for (const c of store.categories ?? []) {
    add(c.id, "category_image", c.image_key);
  }
  return targets;
}

async function headKb(url) {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return Number(r.headers.get("content-length") ?? 0);
  } catch {
    return 0;
  }
}

async function signIn(client) {
  const email = process.env.MB_MANAGER_EMAIL ?? "manager@mbventuresgh.com";
  const password = process.env.MB_MANAGER_PASSWORD;
  if (!password) {
    throw new Error(
      "MB_MANAGER_PASSWORD is not set (source it from the local credentials file — never committed).",
    );
  }
  // `auth:signIn` is an action (it may talk to the auth provider), not a mutation.
  const raw = await client.action("auth:signIn", {
    provider: "password",
    params: { flow: "signIn", email, password },
  });
  // Convex Auth answers `{ tokens: { token, refreshToken } }`.
  const token = raw?.tokens?.token ?? raw?.token;
  if (!token) {
    throw new Error("Sign-in returned no session token — check the manager credentials.");
  }
  client.setAuth(token);
  console.log(`signed in as ${email}\n`);
}

async function uploadWebp(client, buffer) {
  const uploadUrl = await client.mutation("uploads:generateUploadUrl", {});
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "image/webp" },
    body: buffer,
  });
  if (!res.ok) throw new Error(`storage upload failed: HTTP ${res.status}`);
  const { storageId } = await res.json();
  return await client.mutation("uploads:savePhoto", { storageId });
}

async function main() {
  const store = storeGet();
  const targets = collectTargets(store).filter((t) => !ONLY || t.slug === ONLY);
  console.log(
    `catalogue: ${store.products?.length ?? 0} products | ${targets.length} storage images`,
  );

  if (DELETE_OLD) {
    const client = new ConvexHttpClient(convexUrl(), { logger: false });
    await signIn(client);
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
    } catch {
      throw new Error(`No ${MANIFEST} found — run an --apply pass first.`);
    }
    let deleted = 0;
    let kept = 0;
    const problems = [];
    for (const item of manifest.replaced ?? []) {
      const r = await client.mutation("photos:deleteStorageIfUnreferenced", {
        url: item.old_url,
      });
      if (r?.deleted) {
        deleted += 1;
        console.log(`  deleted ${kb(item.old_kb)} KB original of ${item.slug} (${item.field})`);
      } else if (r?.error) {
        problems.push({ item, error: r.error });
        console.log(`  PROBLEM ${item.slug} (${item.field}) — ${r.error}`);
      } else if (r?.missing) {
        kept += 1;
        console.log(`  kept ${item.slug} (${item.field}) — file already gone`);
      } else {
        kept += 1;
        console.log(`  kept ${item.slug} (${item.field}) — still referenced (${r?.refs ?? "?"})`);
      }
    }
    console.log(
      `\nsweep done: ${deleted} originals deleted, ${kept} kept, ${problems.length} problems`,
    );
    if (problems.length > 0) process.exitCode = 1;
    return;
  }

  // Measure everything first so the report is complete even in dry-run mode.
  const plan = [];
  for (const t of targets) {
    const oldKb = await headKb(t.url);
    if (oldKb > MAX_KB_BEFORE * 1024) plan.push({ ...t, old_bytes: oldKb });
  }
  const skipped = targets.length - plan.length;
  const heavy = plan.slice(0, LIMIT || plan.length);
  const totalMb = (heavy.reduce((sum, t) => sum + t.old_bytes, 0) / 1024 / 1024).toFixed(1);
  console.log(
    `heavy images (>${MAX_KB_BEFORE} KB): ${plan.length} | light/skipped: ${skipped} | in scope: ${heavy.length} (${totalMb} MB)\n`,
  );

  if (!APPLY) {
    for (const t of heavy) {
      console.log(`  DRY  ${String(kb(t.old_bytes)).padStart(5)} KB  ${t.slug} (${t.field})`);
    }
    console.log("\ndry run — re-run with --apply to upload + repoint.");
    return;
  }

  const client = new ConvexHttpClient(convexUrl(), { logger: false });
  await signIn(client);

  const replaced = [];
  let savedBytes = 0;

  const saveManifest = () =>
    writeFileSync(
      MANIFEST,
      `${JSON.stringify(
        {
          run_at: new Date().toISOString(),
          // Merge with any earlier run so a later `--delete-old` sweep still
          // knows about every original this script replaced.
          replaced: [
            ...readManifest().filter((item) => !replaced.some((r) => r.old_url === item.old_url)),
            ...replaced,
          ],
        },
        null,
        2,
      )}\n`,
    );

  /** One image: download → re-encode → upload → repoint. Errors stay local. */
  async function optimizeOne(t) {
    try {
      const original = Buffer.from(await (await fetch(t.url)).arrayBuffer());
      const out = await sharp(original)
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      if (out.length >= original.length * (1 - MIN_SAVING)) {
        console.log(
          `  skip ${t.slug} (${t.field}) — no gain (${kb(original.length)} -> ${kb(out.length)} KB)`,
        );
        return;
      }
      const newUrl = await uploadWebp(client, out);
      const patchArgs = { field: t.field, slug: t.slug, new_url: newUrl };
      if (t.field === "gallery") patchArgs.gallery_index = t.gallery_index;
      if (t.field === "variant_image") patchArgs.variant_key = t.variant_key;
      const result = await client.mutation("photos:retargetImage", patchArgs);
      if (!result?.changed) {
        console.log(`  skip ${t.slug} (${t.field}) — retarget reported no change`);
        return;
      }
      savedBytes += original.length - out.length;
      replaced.push({
        slug: t.slug,
        field: t.field,
        gallery_index: t.gallery_index,
        variant_key: t.variant_key,
        old_url: t.url,
        new_url: newUrl,
        old_kb: original.length,
        new_kb: out.length,
      });
      saveManifest();
      console.log(
        `  OK   ${String(kb(original.length)).padStart(5)} -> ${String(kb(out.length)).padStart(4)} KB  ${t.slug} (${t.field})`,
      );
    } catch (err) {
      const message = err?.message ?? String(err);
      console.log(`  FAIL ${t.slug} (${t.field}) — ${message.slice(0, 160)}`);
      if (message.includes("photos:retargetImage")) {
        console.log("        hint: push convex functions (npx convex deploy) before --apply.");
      }
    }
  }

  // Downloads dominate (a ~2 MB original takes seconds on a shop connection),
  // so a small pool keeps the pipe full without hammering the deployment.
  const queue = [...heavy];
  const workers = Math.max(1, Math.min(CONCURRENCY, queue.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const target = queue.shift();
        if (target === undefined) return;
        await optimizeOne(target);
      }
    }),
  );

  console.log(
    `\nreplaced ${replaced.length}/${heavy.length} images — saved ${(savedBytes / 1024 / 1024).toFixed(1)} MB`,
  );
  console.log(`next: re-run with no flags to verify sizes, then --delete-old to sweep originals.`);
}

main().catch((err) => {
  console.error(`FAILED: ${err?.message ?? err}`);
  process.exit(1);
});
