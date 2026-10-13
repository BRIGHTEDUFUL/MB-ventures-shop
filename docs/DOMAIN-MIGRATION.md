# Domain migration — mbventuresghana.com → mbventuresgh.com

**Status:** 🔶 Prepared locally — **NOT deployed** (12 Oct 2026)
**Target:** `https://mbventuresgh.com` on a **new Hostinger account**
**Backend:** unchanged — Convex `prod:necessary-newt-861` / `dev:stoic-elephant-714`

This runbook is the single source of truth for the domain move. The repository
now targets the new domain end-to-end; everything that has to happen **on real
infrastructure** is listed in §5–§9 and has deliberately not been executed.

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

Automated, rule-based swap across 41 tracked files (see `git diff --stat`):

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
- `docs/TEST-ACCOUNTS.md`, `docs/PRODUCTION-CREDENTIALS.md` — pending-cutover
  banners explaining old vs. new logins.
- `.github/workflows/deploy-hostinger.yml` — comment above `VITE_SITE_URL`
  warning that `HOSTINGER_*` secrets must be repointed before first deploy.

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
- **Live production (until cutover):** still `mbventuresghana.com` on the old
  Hostinger VPS, still served by the same Convex backend, still using the
  `@mbventuresghana.com` staff logins. Everything keeps working — the repo
  change is inert until a deploy happens.
- **Risk window:** pushing to `main` today would deploy the _new domain
  strings_ to the _old_ server (wrong canonicals on the old site). Either
  complete §5–§6 first, or accept a short-lived inconsistency.

## 5. Cutover runbook (deploy-time — NOT executed)

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

### 5.4 GitHub secrets — repoint to the new account

| Secret               | New value                                     |
| -------------------- | --------------------------------------------- |
| `HOSTINGER_HOST`     | new VPS IP                                    |
| `HOSTINGER_USERNAME` | e.g. `root`                                   |
| `HOSTINGER_PASSWORD` | new VPS password (or use `HOSTINGER_SSH_KEY`) |
| `HOSTINGER_SSH_KEY`  | new deploy key (`ssh-keygen -t ed25519 …`)    |
| `HOSTINGER_PORT`     | `22` (default)                                |
| `HOSTINGER_PATH`     | `/var/www/mbventuresgh`                       |

`CONVEX_DEPLOY_KEY` stays as-is (same backend).

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

## 6. Convex-side cutover (same backend — two commands)

```powershell
# 1. Email/link origin follows the new domain (auth keeps using CONVEX_SITE_URL)
npx convex env set SITE_URL https://mbventuresgh.com --env-file .env.prod.local

# 2. Register the four new-domain logins (each signs up at /account FIRST),
#    then grant roles:
npx convex run users:grantStaff '{\"email\":\"manager@mbventuresgh.com\",\"role\":\"admin\"}' --env-file .env.prod.local
npx convex run users:grantStaff '{\"email\":\"admin@mbventuresgh.com\",\"role\":\"admin\"}' --env-file .env.prod.local
npx convex run users:grantStaff '{\"email\":\"attendant@mbventuresgh.com\",\"role\":\"staff\"}' --env-file .env.prod.local
npx convex run users:grantStaff '{\"email\":\"staff@mbventuresgh.com\",\"role\":\"staff\"}' --env-file .env.prod.local
```

Verify each with `auth:signIn` (AGENTS.md §10), then — once the new logins are
confirmed — revoke the old-domain role rows from `/staff` → Team (or delete the
`user_roles` rows). `WEB3FORMS_ACCESS_KEY`, `EMAIL_REPLY_TO`,
`ADMIN_ALERT_EMAIL` are **not** touched: mail still lands in the
`info@mbventuresghana.com` inbox.

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

| Gate                     | Result                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`       | 0 errors                                                                                                                                       |
| `npm run lint`           | 0 errors (7 pre-existing react-refresh warnings)                                                                                               |
| `npm test`               | 216/216 passed                                                                                                                                 |
| `npx prettier --check .` | clean                                                                                                                                          |
| `npm run build`          | succeeds                                                                                                                                       |
| `npm run test:e2e`       | 32/32 (one `/track` head check initially hit a Playwright artifact-write ENOENT from a concurrent audit run; the spec passes 24/24 on its own) |

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

- **Branch state:** `main` (this worktree). A second worktree
  (`Temp/opencode/mbv-deploy`, branch `fix/auth-and-ui`, commit `2b49c7a`) is
  in flight — likely the deploy-side work. It predates this migration, so a
  merge will conflict on `AGENTS.md`, `docs/*` and the env files: re-run the
  swap rules (§2) on any conflicted file rather than taking either side blind.
- **Do not push to `main`** until §5–§6 are done or a deploy to the old server
  is intended — pushes auto-deploy.
- **Do not** "fix" `info@mbventuresghana.com` back to the new domain: it is the
  live Web3Forms inbox and deliberately stays.
- **Do not** change `convex/auth.config.ts` to the new domain — the JWT issuer
  must remain `CONVEX_SITE_URL`.
- Untracked scratch files (`_overflow-probe.mjs`, `test-results/`) belong to
  other in-flight work and were left untouched.
