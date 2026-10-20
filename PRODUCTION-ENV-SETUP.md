# Production Environment Setup - Copy & Paste Ready

**Secrets are placeholders — never committed.** Real values (Web3Forms key,
account passwords) live in the local-only `docs/PRODUCTION-CREDENTIALS.md`
(gitignored) and the Convex env.

---

## 📋 FOR HOSTINGER SERVER (.env.local)

**Copy this entire block and save as `.env.local` on the server:**

```env
# MB Ventures GH - Production Environment
VITE_CONVEX_URL=https://earnest-fennec-109.convex.cloud
VITE_CONVEX_SITE_URL=https://earnest-fennec-109.convex.site
VITE_SITE_URL=https://mbventuresgh.com
NODE_ENV=production
WEB3FORMS_ACCESS_KEY=<WEB3FORMS_ACCESS_KEY>
EMAIL_REPLY_TO=info@mbventuresgh.com
ADMIN_ALERT_EMAIL=info@mbventuresgh.com
EMAIL_DAILY_LIMIT=250
SITE_URL=https://mbventuresgh.com
```

> Replace `<WEB3FORMS_ACCESS_KEY>` from a local, untracked source:
> `docs/PRODUCTION-CREDENTIALS.md` or `npx convex env get WEB3FORMS_ACCESS_KEY`.

---

## 🔧 FOR CONVEX PRODUCTION (Already Set)

**These are already configured in Convex dashboard. To verify:**

```bash
npx convex env list --prod
```

**Should show:**

```
ADMIN_ALERT_EMAIL=info@mbventuresgh.com
EMAIL_DAILY_LIMIT=250
EMAIL_REPLY_TO=info@mbventuresgh.com
JWKS=<redacted — JWKS is set on the Convex deployment; never committed to git>
JWT_PRIVATE_KEY=<redacted — set on the Convex deployment; never committed to git>
SITE_URL=https://mbventuresgh.com
WEB3FORMS_ACCESS_KEY=ab22e273-… (redacted; in Convex env)
```

---

## 🔑 FOR GITHUB ACTIONS SECRETS

**Add these secrets to GitHub repository:**

**Location:** https://github.com/BRIGHTEDUFUL/MB-ventures-shop/settings/secrets/actions

**Click "New repository secret" for each:**

### Required Secrets:

| Secret Name          | Value                   |
| -------------------- | ----------------------- |
| `HOSTINGER_HOST`     | [YOUR_SERVER_IP]        |
| `HOSTINGER_USERNAME` | [YOUR_SSH_USERNAME]     |
| `HOSTINGER_PASSWORD` | [YOUR_SSH_PASSWORD]     |
| `HOSTINGER_PATH`     | `/var/www/mbventuresgh` |
| `HOSTINGER_PORT`     | `22`                    |

---

## 🎯 QUICK DEPLOYMENT COMMANDS

**On Hostinger server (via hPanel terminal or SSH):**

### Option 1: Create .env.local manually

```bash
cd /var/www/mbventuresgh

cat > .env.local << 'EOF'
VITE_CONVEX_URL=https://earnest-fennec-109.convex.cloud
VITE_CONVEX_SITE_URL=https://earnest-fennec-109.convex.site
VITE_SITE_URL=https://mbventuresgh.com
NODE_ENV=production
WEB3FORMS_ACCESS_KEY=<WEB3FORMS_ACCESS_KEY>
EMAIL_REPLY_TO=info@mbventuresgh.com
ADMIN_ALERT_EMAIL=info@mbventuresgh.com
EMAIL_DAILY_LIMIT=250
SITE_URL=https://mbventuresgh.com
EOF

# Verify it was created
cat .env.local
```

### Option 2: Use setup script (automatic)

```bash
cd /var/www/mbventuresgh
bash scripts/setup-production-env.sh
```

---

## 🚀 COMPLETE FRESH DEPLOYMENT

**Run these commands in order:**

```bash
# 1. Navigate to project
cd /var/www/mbventuresgh

# 2. Pull latest code
git pull origin main

# 3. Stop old processes
pm2 stop all
pm2 delete all

# 4. Clean old files
rm -rf node_modules .output .vinxi .tanstack

# 5. Create environment file
# (replace <WEB3FORMS_ACCESS_KEY> from docs/PRODUCTION-CREDENTIALS.md / Convex env)
cat > .env.local << 'EOF'
VITE_CONVEX_URL=https://earnest-fennec-109.convex.cloud
VITE_CONVEX_SITE_URL=https://earnest-fennec-109.convex.site
VITE_SITE_URL=https://mbventuresgh.com
NODE_ENV=production
WEB3FORMS_ACCESS_KEY=<WEB3FORMS_ACCESS_KEY>
EMAIL_REPLY_TO=info@mbventuresgh.com
ADMIN_ALERT_EMAIL=info@mbventuresgh.com
EMAIL_DAILY_LIMIT=250
SITE_URL=https://mbventuresgh.com
EOF

# 6. Install dependencies
npm install

# 7. Build application
npm run build

# 8. Start PM2
pm2 start ecosystem.config.js
pm2 save

# 9. Check status
pm2 status
pm2 logs mb-ventures-gh --lines 30
```

---

## 🔍 VERIFY DEPLOYMENT

```bash
# Check PM2 status
pm2 status
# Should show: mb-ventures-gh | online

# Check logs
pm2 logs mb-ventures-gh --lines 50

# Test locally
curl http://localhost:3000
# Should return HTML

# Check environment
cat .env.local
# Should show all variables

# Test production site
curl https://mbventuresgh.com
# Should return HTML
```

---

## 📊 ALL CREDENTIALS SUMMARY

### Production URLs:

- **Site**: https://mbventuresgh.com
- **Convex Backend**: https://earnest-fennec-109.convex.cloud
- **Convex Dashboard**: https://dashboard.convex.dev

### Email:

- **Provider**: Web3Forms
- **Access Key**: `ab22e273-…` (redacted — lives in the Convex env / local `docs/PRODUCTION-CREDENTIALS.md`)
- **Reply To**: info@mbventuresgh.com
- **Admin Alerts**: info@mbventuresgh.com
- **Daily Limit**: 250 emails

### Admin Account (Register First):

- **Email**: admin@mbventuresgh.com
- **Password**: see local `docs/PRODUCTION-CREDENTIALS.md` (not in git)

### Staff Account (Register First):

- **Email**: staff@mbventuresgh.com
- **Password**: see local `docs/PRODUCTION-CREDENTIALS.md` (not in git)

### After Registration, Grant Privileges:

```powershell
# Windows PowerShell
npx convex run users:grantStaff '{\"email\":\"admin@mbventuresgh.com\"}' --prod
npx convex run users:grantStaff '{\"email\":\"staff@mbventuresgh.com\"}' --prod
```

```bash
# Mac/Linux/Git Bash
npx convex run users:grantStaff '{"email":"admin@mbventuresgh.com"}' --prod
npx convex run users:grantStaff '{"email":"staff@mbventuresgh.com"}' --prod
```

---

## ✅ POST-DEPLOYMENT CHECKLIST

- [ ] Environment variables set correctly (`.env.local` exists)
- [ ] PM2 running (`pm2 status` shows online)
- [ ] Site loads at https://mbventuresgh.com
- [ ] Admin account registered
- [ ] Staff account registered
- [ ] Privileges granted (can access /staff)
- [ ] Ordering enabled
- [ ] Test order placed successfully

---

**Last Updated:** October 10, 2026  
**All credentials verified and ready for production** ✅
