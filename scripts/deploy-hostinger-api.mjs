#!/usr/bin/env node
/**
 * Deploy the storefront to Hostinger Node.js hosting via the public API.
 *
 * This is the supported deploy path that does NOT depend on the Hostinger MCP
 * server or SSH credentials. It reproduces the documented 6-step flow:
 *
 *   1. Resolve the hosting username for the domain.
 *   2. POST /files/upload-urls -> { url, auth_key, rest_auth_key }.
 *   3. TUS 1.0.0 upload of deploy.zip into public_html (POST create + PATCH body).
 *   4. GET  .../nodejs/builds/settings/from-archive  (auto-detect nitro settings).
 *   5. POST .../nodejs/builds  (source_type: archive, node 20).
 *   6. Poll GET .../nodejs/builds/{uuid} until completed/failed; fetch logs
 *      on failure, then smoke-check the live site.
 *
 * The deploy archive must be packed FIRST (pack-deploy.mjs uses `git archive
 * HEAD`, so commit before packing). Usage:
 *
 *   node scripts/pack-deploy.mjs
 *   node scripts/deploy-hostinger-api.mjs [--domain=mbventuresgh.com] [--node=20]
 *
 * The API token is read from $HOSTINGER_API_TOKEN or the opencode config file
 * (~/.config/opencode/opencode.jsonc). It is NEVER logged.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};

const DOMAIN = flag("domain", "mbventuresgh.com");
const ARCHIVE = flag("archive", "deploy.zip");
const NODE_VERSION = Number(flag("node", "20"));
const API = "https://developers.hostinger.com/api/hosting/v1";
const POLL_MS = 15_000;
const BUILD_TIMEOUT_MS = 20 * 60 * 1000;

function loadToken() {
  if (process.env.HOSTINGER_API_TOKEN) return process.env.HOSTINGER_API_TOKEN;
  const cfg = path.join(homedir(), ".config", "opencode", "opencode.jsonc");
  if (existsSync(cfg)) {
    const m = readFileSync(cfg, "utf8").match(/"HOSTINGER_API_TOKEN"\s*:\s*"([^"]+)"/);
    if (m) return m[1];
  }
  throw new Error("HOSTINGER_API_TOKEN not set and not found in ~/.config/opencode/opencode.jsonc");
}

const headers = { Authorization: `Bearer ${loadToken()}`, Accept: "application/json" };

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(
      `${method} ${new URL(url).pathname} -> HTTP ${res.status}: ${text.slice(0, 400)}`,
    );
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const unwrap = (r) => (r && typeof r === "object" && "data" in r ? r.data : r);
const log = (...m) => console.log(`[hostinger]`, ...m);

if (!existsSync(ARCHIVE)) {
  throw new Error(
    `${ARCHIVE} not found — run \`node scripts/pack-deploy.mjs\` first (it packs git HEAD).`,
  );
}
const archiveSize = statSync(ARCHIVE).size;
if (archiveSize > 50 * 1024 * 1024)
  throw new Error(
    `${ARCHIVE} is ${(archiveSize / 1e6).toFixed(1)} MB — Hostinger caps archives at 50 MB.`,
  );
log(`archive ${ARCHIVE} (${(archiveSize / 1e6).toFixed(2)} MB) -> ${DOMAIN}`);

// 1. Resolve hosting username for the domain.
const sites = unwrap(await api("GET", `${API}/websites?domain=${encodeURIComponent(DOMAIN)}`));
const site =
  (Array.isArray(sites) ? sites : []).find((s) => s.domain === DOMAIN) ??
  (Array.isArray(sites) ? sites[0] : sites);
if (!site?.username)
  throw new Error(`No website record for ${DOMAIN}: ${JSON.stringify(sites).slice(0, 300)}`);
const username = site.username;
log(`account username=${username} type=${site.website_type ?? "?"}`);

// 2. Generate upload credentials.
const up = unwrap(await api("POST", `${API}/files/upload-urls`, { username, domain: DOMAIN }));
if (!up?.url || !up?.auth_key || !up?.rest_auth_key)
  throw new Error("upload-urls response missing url/auth_key/rest_auth_key");

// 3. TUS 1.0.0 upload into public_html.
const dest = `${up.url}/${ARCHIVE}?override=true`;
const tus = { "X-Auth": up.auth_key, "X-Auth-Rest": up.rest_auth_key, "Tus-Resumable": "1.0.0" };
const created = await fetch(dest, {
  method: "POST",
  headers: { ...tus, "Upload-Length": String(archiveSize), "Upload-Offset": "0" },
});
if (created.status !== 201)
  throw new Error(
    `TUS create failed: HTTP ${created.status} ${(await created.text()).slice(0, 300)}`,
  );
const patched = await fetch(dest, {
  method: "PATCH",
  headers: { ...tus, "Content-Type": "application/offset+octet-stream", "Upload-Offset": "0" },
  body: readFileSync(ARCHIVE),
});
if (patched.status !== 204)
  throw new Error(
    `TUS upload failed: HTTP ${patched.status} ${(await patched.text()).slice(0, 300)}`,
  );
log(`uploaded ${ARCHIVE} (upload-offset=${patched.headers.get("upload-offset")})`);

// 4. Build settings — sent explicitly on every build.
//
// Two ways this has gone wrong in production:
//  - `…/settings/from-archive` can answer with nothing, and the platform then
//    runs in "publish" mode with `build_script: none`, publishing the raw
//    source and syncing public_html — which wipes `/assets/*` and leaves the
//    site serving unstyled HTML.
//  - a saved `output_directory` of `.output/public` hides `.output/server`
//    from the publisher, which then fails with "Entry file not found".
//
// So the values below are the ones that work for this Nitro app (verified from
// a green build log). Override with env vars only if the app layout changes.
const BUILD_SETTINGS = {
  app_type: process.env.HOSTINGER_APP_TYPE ?? "nitro",
  output_directory: process.env.HOSTINGER_OUTPUT_DIR ?? ".output",
  build_script: process.env.HOSTINGER_BUILD_SCRIPT ?? "build",
  entry_file: process.env.HOSTINGER_ENTRY_FILE ?? "server/index.mjs",
  package_manager: process.env.HOSTINGER_PACKAGE_MANAGER ?? "npm",
};
const detected = BUILD_SETTINGS;

const saved = unwrap(
  await api("GET", `${API}/accounts/${username}/websites/${DOMAIN}/nodejs/builds/settings`).catch(
    () => null,
  ),
);
const drift = Object.entries(BUILD_SETTINGS).filter(
  ([k, v]) => saved?.[k] != null && saved[k] !== v,
);
if (drift.length > 0) {
  log(
    `note: panel settings differ (${drift.map(([k, v]) => `${k}=${JSON.stringify(saved[k])} → ${JSON.stringify(v)}`).join(", ")}); sending the values below.`,
  );
}
log(`build settings: ${JSON.stringify(detected)}`);

// 5. Start the build from the uploaded archive.
const build = unwrap(
  await api("POST", `${API}/accounts/${username}/websites/${DOMAIN}/nodejs/builds`, {
    ...detected,
    username,
    domain: DOMAIN,
    node_version: NODE_VERSION,
    source_type: "archive",
    source_options: { archive_path: ARCHIVE },
  }),
);
const uuid = build?.uuid ?? build?.id;
if (!uuid) throw new Error(`start-build returned no uuid: ${JSON.stringify(build).slice(0, 300)}`);
log(`build started uuid=${uuid}`);

// 6. Poll until finished.
const base = `${API}/accounts/${username}/websites/${DOMAIN}/nodejs/builds/${uuid}`;
const deadline = Date.now() + BUILD_TIMEOUT_MS;
let last = "";
for (;;) {
  const b = unwrap(await api("GET", base));
  const state = b?.state ?? b?.status ?? "unknown";
  if (state !== last) {
    log(`build state: ${state}`);
    last = state;
  }
  if (state === "completed") break;
  if (state === "failed") {
    const logs = await api("GET", `${base}/logs`).catch(() => null);
    const text = typeof logs === "string" ? logs : JSON.stringify(logs ?? {});
    console.error("=== BUILD FAILED — last log lines ===");
    console.error(
      text
        .split(/\r?\n/)
        .slice(-80)
        .map((l) => l.slice(0, 400))
        .join("\n"),
    );
    process.exit(1);
  }
  if (Date.now() > deadline)
    throw new Error(`build timed out after ${BUILD_TIMEOUT_MS / 60000} minutes in state ${state}`);
  await new Promise((r) => setTimeout(r, POLL_MS));
}

// Smoke-check the live site: HTML plus the CSS/JS it actually references.
// A published-but-unbuilt deployment still answers 200 on `/`, so the asset
// check is the one that proves the build shipped.
let failed = false;
for (const pathName of ["/", "/catalogue"]) {
  try {
    const res = await fetch(`https://${DOMAIN}${pathName}`, { redirect: "follow" });
    log(`live https://${DOMAIN}${pathName} -> HTTP ${res.status}`);
    if (res.status !== 200) failed = true;
  } catch (e) {
    log(`live check ${pathName} failed: ${e.message}`);
    failed = true;
  }
}

try {
  const html = await (await fetch(`https://${DOMAIN}/`)).text();
  const assets = [
    ...new Set([...html.matchAll(/(?:href|src)="([^"]+\.(?:css|js))"/g)].map((m) => m[1])),
  ];
  const bad = [];
  for (const asset of assets.slice(0, 6)) {
    const res = await fetch(new URL(asset, `https://${DOMAIN}/`), { method: "HEAD" });
    if (res.status !== 200) bad.push(`${asset} -> ${res.status}`);
  }
  log(`asset check: ${assets.length} referenced, ${bad.length} broken`);
  if (bad.length > 0) {
    bad.forEach((line) => console.error(`[hostinger] BROKEN ASSET ${line}`));
    failed = true;
  }
} catch (e) {
  log(`asset check failed: ${e.message}`);
  failed = true;
}

if (failed) {
  console.error(
    "[hostinger] deploy finished but the live site is not healthy — check the build logs " +
      `(node .tmp-build-logs.mjs, or hPanel → Node.js → build history).`,
  );
  process.exit(1);
}
log("deploy complete");
