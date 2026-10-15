# Domain migration — mbventuresghana.com → mbventuresgh.com

**Status:** 🟢 **CUTOVER COMPLETE (verified 15 Oct 2026)** — production serves
`https://mbventuresgh.com` from the new Hostinger account (client `1023530876`,
hosting user `u963034723`, Node.js site). Verified: hPanel domain portfolio
shows `mbventuresgh.com` as the only domain; `hosting_websites_list` returns
the site (`is_enabled: true`); build history shows `completed` builds on
15 Oct 2026 (latest 15:37 UTC, `deploy.zip`, nitro, Node 20, `.output`);
`https://mbventuresgh.com` returns 200 with the correct title and
`mbventuresgh.com` canonical/og URLs. **GitHub Actions still has no secrets**
(`gh secret list` empty), so CI deploys remain skipped — frontend deploys run
via Hostinger MCP (`hosting_deploy-js-application`); the MCP token for the new
account is configured in `~/.config/opencode/opencode.jsonc` (never commit it).
**Target:** `https://mbventuresgh.com` on a **new Hostinger account** — ACHIEVED
**Backend:** unchanged — Convex `prod:necessary-newt-861` / `dev:stoic-elephant-714`

This runbook is the single source of truth for the domain move. The repository
targets the new domain end-to-end and the four `@mbventuresgh.com` staff/admin
accounts are live on the backend (§6). On 13 Oct 2026 `main` was pushed to
`origin` (user-directed): CI passed but deployed nothing — the repository has
zero GitHub Actions secrets (`gh secret list` empty), so the Convex backend
step and the VPS SSH step both skipped. The cutover itself was then completed
out-of-band (15 Oct 2026) via Hostinger managed Node.js hosting on the new
account — details in the status header. §6's `SITE_URL` flip was also executed
(verified: `npx convex env get SITE_URL` → `https://mbventuresgh.com`).

---

## 1. Decisions (confirmed 12 Oct 2026)

| Item                              | Decision                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Site URL                          | → `https://mbventuresgh.com` everywhere (canonical, og:url, sitemap, robots, docs, CI, scripts)                     |
| Staff/admin **login** emails      | → `@mbventuresgh.com` (`manager@`, `admin@`, `attendant@`, `staff@`)                                                |
| Contact / reply-to / alert emails | **Unchanged** — `info@mbventuresghana.com` (Web3Forms still forwards to the inbox bound to its access key)          |
| Convex deployments                | **Unchanged** — same prod/dev deployments, same `CONVEX_DEPLOY_KEY`, same auth (JWT issuer stays `CONVEX_SITE_URL`) |
| Passwords                         | **Not rotated** — §9 documents the optional rotation procedure                                                      |
| Deployment                        | **None** — no push to `main`, no `convex deploy`, no Hostinger API calls                                            |

## 2. What changed in the repository

Automated, rule-based swap across 40 tracked files (43 files in migration
commit `3292504` including hand-edits and this runbook):

1. `https://mbventuresghana.com` → `https://mbventuresgh.com` — every site URL.
2. Staff/admin login addresses `admin@`, `staff@`, `manager@`, `attendant@`,
   `owner@` `…mbventuresghana.com` → `…mbventuresgh.com`.
3. Bare domain references (nginx `server_name`, DNS rows, certbot args, curl
   checks) → `mbventuresgh.com`.
4. Server paths / process names: `/var/www/mbventuresghana` →
   `/var/www/mbventuresgh`; PM2 app name in `ecosystem.config.js`,
   `scripts/*.sh` and both GitHub workflows → `mbventuresgh`.

Deliberately **excluded** from the swap:

- `info@mbventuresghana.com` (and `alerts@`, `deploy@`) — contact/reply-to
  addresses stay on the old domain per §1. This includes the UI fallbacks in
  `src/components/store-shell.tsx` and `src/routes/$page.tsx`, the seed in
  `convex/seed.ts`, the email-log sample in `convex/emails/queries.ts`, and the
  reply-to fixtures in `src/test/email-*.test.ts`.
- `docs/PROGRESS.md` — chronological log; history stays accurate. The migration
  is recorded as a new entry at the end.
- `AGENTS.md` — edited by hand (concurrent agent activity), including a
  cutover-pending banner and the new docs-map row.

Targeted hand-edits on top of the swap:

- `AGENTS.md` — cutover banner (§1), Hostinger-secrets warning (§5), new-domain
  accounts table + provisioning note (§8), env table, password-verify example,
  mobile-audit URL, docs map row for this file.
- `docs/TEST-ACCOUNTS.md`, `docs/PRODUCTION-CREDENTIALS.md` — account-status
  banners explaining old vs. new logins (the latter is gitignored on purpose:
  it holds plaintext passwords and stays local-only).
- `.github/workflows/deploy-hostinger.yml` — comment above `VITE_SITE_URL`
  warning that `HOSTINGER_*` secrets must be created for the new VPS before
  this workflow publishes anything (none exist yet, §5.4).

## 3. What did NOT change (and why)

| Thing                                   | Why it stays                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `SITE_URL` / `EMAIL_REPLY_TO` on Convex | Runtime env of the live backend — set at cutover (§6), never committed                                  |
| `info@mbventuresghana.com`              | Web3Forms forwards every submission to the one inbox bound to its access key                            |
| `WEB3FORMS_ACCESS_KEY`                  | Tied to that inbox, not to the hosting account                                                          |
| `VITE_CONVEX_URL` / `.env` Convex URLs  | Backend deployment is unrelated to the frontend domain                                                  |
| `convex/auth.config.ts` domain          | Must stay `CONVEX_SITE_URL` — the auth JWT issuer; changing it to the storefront domain breaks sessions |
| GitHub `CONVEX_DEPLOY_KEY` secret       | Same backend; only the `HOSTINGER_*` secrets move to the new account                                    |

## 4. Current state vs. target state

- **Repo (this working tree):** fully targets `mbventuresgh.com`. A production
  build served locally emits `https://mbventuresgh.com/...` canonical/og URLs.
- **Live production (verified 15 Oct 2026):** `mbventuresgh.com` serves from the
  new Hostinger account — managed Node.js hosting (client `1023530876`, user
  `u963034723`), not the manual VPS layout §5 originally planned. The same
  Convex backend (`prod:necessary-newt-861`) serves it. The `@mbventuresgh.com`
  staff logins are the primary accounts; legacy `@mbventuresghana.com` accounts
  remain on the backend but are obsolete.
- **Risk window:** closed — repo strings and live domain now match.

## 5. Cutover runbook (deploy-time — EXECUTED via managed Node.js hosting)

> **Note:** the actual cutover used Hostinger's managed Node.js hosting
> (`hosting_deploy-js-application` builds from `deploy.zip`) instead of the
> manual VPS + nginx + PM2 steps below. The steps are kept for reference; only
> §5.4 (GitHub secrets) remains unexecuted — CI still has no secrets and
> deploys are done via the Hostinger MCP.

### 5.1 New Hostinger account

1. Provision the VPS (same shape as before: Ubuntu, Node 20, PM2, git).
2. Create the deploy user/directory: `mkdir -p /var/www/mbventuresgh && chown …`.
3. Add the domain `mbventuresgh.com` (+ `www`) in hPanel and point it at the
   new VPS. SSL: hPanel AutoSSL **or** certbot (§5.3).

### 5.2 DNS

| Type | Name  | Value          |
| ---- | ----- | -------------- |
| A    | `@`   | `<new-VPS-IP>` |
| A    | `www` | `<new-VPS-IP>` |

Old domain keeps its existing records until the redirect step (§7.1).

### 5.3 nginx + SSL (new server)

`/etc/nginx/sites-available/mbventuresgh.com`:

```nginx
server {
    listen 80;
    server_name mbventuresgh.com www.mbventuresgh.com;
    return 301 https://mbventuresgh.com$request_uri;
}
server {
    listen 443 ssl http2;
    server_name mbventuresgh.com www.mbventuresgh.com;

    ssl_certificate     /etc/letsencrypt/live/mbventuresgh.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mbventuresgh.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```sh
sudo ln -s /etc/nginx/sites-available/mbventuresgh.com /etc/nginx/sites-enabled/
sudo certbot --nginx -d mbventuresgh.com -d www.mbventuresgh.com
```

### 5.4 GitHub secrets — create for the new account

**Observed 13 Oct 2026: the repository has NO Actions secrets at all**
(`gh secret list` is empty) — every recent Deploy run, including the 13 Oct
push, skipped the VPS step for that reason. Add these six fresh for the new
VPS (GitHub UI → Settings → Secrets and variables → Actions, or
`gh secret set NAME --body "…"`):

| Secret               | New value                                     |
| -------------------- | --------------------------------------------- |
| `HOSTINGER_HOST`     | new VPS IP                                    |
| `HOSTINGER_USERNAME` | e.g. `root`                                   |
| `HOSTINGER_PASSWORD` | new VPS password (or use `HOSTINGER_SSH_KEY`) |
| `HOSTINGER_SSH_KEY`  | new deploy key (`ssh-keygen -t ed25519 …`)    |
| `HOSTINGER_PORT`     | `22` (default)                                |
| `HOSTINGER_PATH`     | `/var/www/mbventuresgh`                       |

Optional: `CONVEX_DEPLOY_KEY` — if set, CI's "Deploy Convex Backend" step
deploys the backend on every push; without it (current state), backend
deploys stay manual: `npx convex deploy --env-file .env.prod.local`
(AGENTS.md §5).

### 5.5 First deploy

```sh
# on the new VPS
git clone <repo> /var/www/mbventuresgh && cd /var/www/mbventuresgh
npm ci
bash scripts/setup-production-env.sh   # writes .env.production values incl. VITE_SITE_URL
npm run build
pm2 start ecosystem.config.js          # app name: mbventuresgh
pm2 save && pm2 startup
```

Then push to `main` (or `workflow_dispatch` the Deploy workflow) so GitHub
Actions takes over. Verify with §8.

## 6. Convex-side cutover (same backend)

### ✅ DONE — staff accounts provisioned (13 Oct 2026)

The four `@mbventuresgh.com` logins are **live on production**:

| Email                        | Role    | Verified                                    |
| ---------------------------- | ------- | ------------------------------------------- |
| `manager@mbventuresgh.com`   | `admin` | signup → `users:grantStaff` → `auth:signIn` |
| `admin@mbventuresgh.com`     | `admin` | signup → `users:grantStaff` → `auth:signIn` |
| `attendant@mbventuresgh.com` | `staff` | signup → `users:grantStaff` → `auth:signIn` |
| `staff@mbventuresgh.com`     | `staff` | signup → `users:grantStaff` → `auth:signIn` |

Provisioned with `node scripts/create-new-accounts.mjs` (safe to re-run). The
legacy `@mbventuresghana.com` accounts still work — revoke their `user_roles`
rows from `/staff` → Team once the new logins are confirmed on the new domain.

### ✅ DONE at cutover — email/link origin (verified 15 Oct 2026)

```powershell
npx convex env set SITE_URL https://mbventuresgh.com --env-file .env.prod.local
```

**Executed.** Verified: `npx convex env get SITE_URL` returns
`https://mbventuresgh.com`. Live emails now build links against the new
domain.

Everything else on the backend is already correct and needs no change:
`EMAIL_REPLY_TO` / `ADMIN_ALERT_EMAIL` stay `info@mbventuresghana.com`,
`EMAIL_DAILY_LIMIT=250`, `WEB3FORMS_ACCESS_KEY` set, `JWT_PRIVATE_KEY`/`JWKS`
present. Auth keeps using `CONVEX_SITE_URL` as its JWT issuer — never changed.

## 7. Old-domain sunset

1. **301 redirect** on the old server: every `mbventuresghana.com` URL →
   matching `mbventuresgh.com` URL (nginx `return 301 https://mbventuresgh.com$request_uri;`).
2. **Search Console / Google Business Profile:** add the new property,
   submit `https://mbventuresgh.com/sitemap.xml`, set the canonical domain.
3. **Backlinks / print material:** the phone number and shop details are
   unchanged; only the URL moved.
4. Keep the old server alive for ≥30 days, then decommission.

## 8. Post-cutover verification checklist

```sh
curl -I https://mbventuresgh.com                      # 200
curl -I https://www.mbventuresgh.com                  # 301 → apex
curl -I http://mbventuresgh.com                       # 301 → https
curl https://mbventuresgh.com/robots.txt              # Sitemap: https://mbventuresgh.com/sitemap.xml
curl https://mbventuresgh.com/sitemap.xml             # product URLs on the new host
```

- [ ] Canonical + `og:url` on any page source show `https://mbventuresgh.com`
- [ ] Sign-in works for all four `@mbventuresgh.com` accounts (`/staff` loads)
- [ ] `npx convex run auth:signIn …` succeeds for `admin@mbventuresgh.com`
- [ ] Order placement e2e: `npm run test:e2e:live`
- [ ] Mobile audit: `node scripts/mobile-audit.mjs https://mbventuresgh.com --email=… --password=…`
- [ ] Contact-form mail still arrives at `info@mbventuresghana.com` (reply-to included)
- [ ] Password-reset mail arrives (auth mail limit: 5/recipient/hour)

## 9. Optional — rotating the recorded passwords

Passwords were **not** changed by this migration. To rotate later: use the app's
"forgot password" flow per account (mail forwards to the `info@` inbox), set a
new password, then update `docs/TEST-ACCOUNTS.md` and
`docs/PRODUCTION-CREDENTIALS.md` in the same commit. The owner's real account
must use a password that appears nowhere in this repository.

## 10. Local verification performed (12–13 Oct 2026)

All quality gates from AGENTS.md §6, run on this working tree:

| Gate                     | Result                                                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`       | 0 errors                                                                                                                                                                          |
| `npm run lint`           | 0 errors (7 pre-existing react-refresh warnings)                                                                                                                                  |
| `npm test`               | 216/216 passed                                                                                                                                                                    |
| `npx prettier --check .` | clean                                                                                                                                                                             |
| `npm run build`          | succeeds                                                                                                                                                                          |
| `npm run test:e2e`       | 32/32 (one `/track` head check initially hit a Playwright artifact-write ENOENT from a concurrent audit run; the spec passes 24/24 on its own — a later full run was clean 32/32) |

Gates were re-run after every subsequent commit (the other agent's `b9d2cc2`
and the account-provisioning commit `b1c2867`): `tsc` 0 errors, `lint` 0
errors, 216/216 vitest, prettier clean, build succeeds, e2e 32/32 on the
combined tree.

Repo-wide audits performed alongside the gates:

- **Domain-reference audit** — every remaining `mbventuresghana` occurrence is
  an intended category (`info@`/`alerts@`/`deploy@` addresses, cutover-banner
  narrative, `docs/PROGRESS.md` history); zero unintended leftovers.
- **Typo scan** — no `mbventuresgh.com.com` doubles; every bare `mbventuresgh`
  is a server path, PM2 name or narrative mention; no `/var/www/mbventuresghana`
  stragglers.
- **Encoding check** — byte-level verification that the swap introduced no
  BOMs and no line-ending churn.
- **Script syntax** — `node --check` passes on `ecosystem.config.js` and every
  `scripts/*.mjs`.

Runtime check on the production build (`node .output/server/index.mjs`,
served locally):

- `link[rel="canonical"]` and `og:url` on `/` emit `https://mbventuresgh.com/`
- the social-card image resolves on the new origin
- the **only** old-domain strings in the HTML are the intended
  `info@mbventuresghana.com` contact links
- `/robots.txt` and `/sitemap.xml` build their absolute URLs from the request
  origin, so they follow the domain automatically once DNS points at the new
  server (no configuration involved)

## 11. Coordination notes for other agents

- **Consolidated (13 Oct 2026): `main` is the single source of truth.** Both
  lines of work live here — the domain migration (`3292504`, `dddbe46`) and the
  other agent's fixes (`9f4185f` staff hub, `ae9c9a1` phone/mobile, `2b49c7a`
  hero hotspot, `b9d2cc2` 320px overflow fix). Every quality gate passes on the
  combined tree (§10).
- The second worktree (`Temp/opencode/mbv-deploy`, branch `fix/auth-and-ui` at
  `2b49c7a`) was audited and holds **no unique work**: its branch is a strict
  ancestor of `main`, and its uncommitted files are a stale 10-Oct snapshot of
  `main` (pre-variants `stock.ts`/`orders.ts`, the old placeholder phone, the
  179/186 test counts, old-domain text). Nothing needed porting. It was left
  untouched; it can be removed safely with
  `git worktree remove --force <path>` and `git branch -D fix/auth-and-ui`
  (the remote branch `origin/fix/auth-and-ui` is likewise fully merged).
- **Do not push to `main`** until §5–§6 are done or a deploy to the old server
  is intended — pushes auto-deploy.
- **Do not** "fix" `info@mbventuresghana.com` back to the new domain: it is the
  live Web3Forms inbox and deliberately stays.
- **Do not** change `convex/auth.config.ts` to the new domain — the JWT issuer
  must remain `CONVEX_SITE_URL`.

## 12. Session record (12–13 October 2026)

Everything done during the migration effort, in order. Local until 13 Oct 2026;
on that date the user directed the push to `origin/main` described under
_Infrastructure actions_ below.

### Commits (pushed to `origin/main` on 13 Oct 2026)

| Commit    | What                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------- |
| `3b4faf1` | Product options (colour/size/type) with per-option stock and pricing — pre-existing head of `main`        |
| `3292504` | Domain swap (43 files) — site URL, staff logins, server paths, PM2 names; this runbook added              |
| `dddbe46` | Doc fix — stale vitest count 189 → 216 in `AGENTS.md` / `README.md`                                       |
| `b9d2cc2` | (other agent) 320px option-picker overflow fix — landed during the session                                |
| `024d9de` | Consolidation audit recorded — `main` is single source of truth                                           |
| `b1c2867` | Four `@mbventuresgh.com` accounts provisioned on prod; provisioning script extended to four; docs updated |
| `5cffd37` | Documentation refresh — final file counts, definitive gate results, this session record                   |

### Infrastructure actions

- **GitHub — `main` pushed to `origin` (13 Oct 2026, user-directed after an
  explicit risk acknowledgement), 8 commits `3b4faf1` → `131c577`.** Actual
  outcome, read back from the Actions runs (`38334286875` CI,
  `38334286892` Deploy — both `success`): CI & Quality Gates **passed** on
  the pushed code (tsc, lint, 216 tests, build); the Deploy workflow's
  Convex step and VPS SSH step both **skipped** — the repository has **zero**
  Actions secrets (`gh secret list` empty), annotated "HOSTINGER_HOST secret
  is not configured - skipping the VPS deploy step". Net effect: **nothing
  was deployed anywhere** — the old live site and the prod backend are
  untouched. Once §5.4 creates the `HOSTINGER_*` secrets, one
  `workflow_dispatch` of the Deploy workflow publishes the current `main`
  (no new commit needed); subsequent pushes to `main` deploy automatically.
- **Production backend (`prod:necessary-newt-861`)** — direct writes: four
  account signups + four `users:grantStaff` role grants, executed by
  `node scripts/create-new-accounts.mjs`, each verified with a real
  `auth:signIn`. No other direct mutation; no env var was changed on prod
  (`SITE_URL` deliberately untouched, §6). Note that CI's `convex deploy`
  step (above) pushes the current `convex/` code as part of the workflow.
- **Read-only inspections** — prod account listing and `convex env list`
  (note: `env list` prints secret values to the terminal, including
  `JWT_PRIVATE_KEY`; nothing was written to disk or the repo).
- **Hostinger** — no API calls, no SSH, no DNS changes (the connected
  Hostinger API belongs to the old account; the new account is set up per §5).

### Audits

- Quality gates run after every commit (§10) — final state all green.
- Domain-reference, typo, BOM and script-syntax audits (§10).
- Other-agent worktree (`Temp/opencode/mbv-deploy`) audited file-by-file:
  no unique work, superseded snapshot, left untouched (§11).
