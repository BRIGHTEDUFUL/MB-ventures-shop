# Production Environment Setup - Copy & Paste Ready

**All real production credentials - Ready for fresh deployment**

---

## 📋 FOR HOSTINGER SERVER (.env.local)

**Copy this entire block and save as `.env.local` on the server:**

```env
# MB Ventures GH - Production Environment
VITE_CONVEX_URL=https://necessary-newt-861.convex.cloud
VITE_CONVEX_SITE_URL=https://necessary-newt-861.convex.site
VITE_SITE_URL=https://mbventuresghana.com
NODE_ENV=production
WEB3FORMS_ACCESS_KEY=c8395fed-e25e-4350-a914-df8e592f5920
EMAIL_REPLY_TO=info@mbventuresghana.com
ADMIN_ALERT_EMAIL=info@mbventuresghana.com
EMAIL_DAILY_LIMIT=250
SITE_URL=https://mbventuresghana.com
```

---

## 🔧 FOR CONVEX PRODUCTION (Already Set)

**These are already configured in Convex dashboard. To verify:**

```bash
npx convex env list --prod
```

**Should show:**

```
ADMIN_ALERT_EMAIL=info@mbventuresghana.com
EMAIL_DAILY_LIMIT=250
EMAIL_REPLY_TO=info@mbventuresghana.com
JWKS={"keys":[{"use":"sig","kty":"RSA","n":"7GRdtbc95L3RX0PJDWe4Ggn51duri6PVobRDlcLU_l5nWmD2lro8MVwjQVp7giK9nuRR0selzAj7Rw_dIYIlG9rxDIZEXtKadi7yqwJ-B7T0g4TPRjUt9brUs8xxddogYFIvxnlG4hp26BuDHyYGKvypJ6HCvsVWtIyWZMGmTtjN0aL1jWTcu1EDezyI8OYpq4Y8fee2GviHkZtMvRxiX5HAbYAQz67FtKrSvErt86mns-d2raqB3zHmPNvdGwjoCCnSIvDDB-dfXHqtOQdMe5ioDv9fezQ8NLz7QF8K8KRwwsY3-miwCdrPISd5AGZlu2Zhz1couXY7p5qoNGaS7Q","e":"AQAB"}]}
JWT_PRIVATE_KEY=-----BEGIN PRIVATE KEY----- [REDACTED] -----END PRIVATE KEY-----
SITE_URL=https://mbventuresghana.com
WEB3FORMS_ACCESS_KEY=c8395fed-e25e-4350-a914-df8e592f5920
```

---

## 🔑 FOR GITHUB ACTIONS SECRETS

**Add these secrets to GitHub repository:**

**Location:** https://github.com/BRIGHTEDUFUL/MB-ventures-shop/settings/secrets/actions

**Click "New repository secret" for each:**

### Required Secrets:

| Secret Name | Value |
|-------------|-------|
| `HOSTINGER_HOST` | [YOUR_SERVER_IP] |
| `HOSTINGER_USERNAME` | [YOUR_SSH_USERNAME] |
| `HOSTINGER_PASSWORD` | [YOUR_SSH_PASSWORD] |
| `HOSTINGER_PATH` | `/var/www/mbventuresghana` |
| `HOSTINGER_PORT` | `22` |

---

## 🎯 QUICK DEPLOYMENT COMMANDS

**On Hostinger server (via hPanel terminal or SSH):**

### Option 1: Create .env.local manually

```bash
cd /var/www/mbventuresghana

cat > .env.local << 'EOF'
VITE_CONVEX_URL=https://necessary-newt-861.convex.cloud
VITE_CONVEX_SITE_URL=https://necessary-newt-861.convex.site
VITE_SITE_URL=https://mbventuresghana.com
NODE_ENV=production
WEB3FORMS_ACCESS_KEY=c8395fed-e25e-4350-a914-df8e592f5920
EMAIL_REPLY_TO=info@mbventuresghana.com
ADMIN_ALERT_EMAIL=info@mbventuresghana.com
EMAIL_DAILY_LIMIT=250
SITE_URL=https://mbventuresghana.com
EOF

# Verify it was created
cat .env.local
```

### Option 2: Use setup script (automatic)

```bash
cd /var/www/mbventuresghana
bash scripts/setup-production-env.sh
```

---

## 🚀 COMPLETE FRESH DEPLOYMENT

**Run these commands in order:**

```bash
# 1. Navigate to project
cd /var/www/mbventuresghana

# 2. Pull latest code
git pull origin main

# 3. Stop old processes
pm2 stop all
pm2 delete all

# 4. Clean old files
rm -rf node_modules .output .vinxi .tanstack

# 5. Create environment file
cat > .env.local << 'EOF'
VITE_CONVEX_URL=https://necessary-newt-861.convex.cloud
VITE_CONVEX_SITE_URL=https://necessary-newt-861.convex.site
VITE_SITE_URL=https://mbventuresghana.com
NODE_ENV=production
WEB3FORMS_ACCESS_KEY=c8395fed-e25e-4350-a914-df8e592f5920
EMAIL_REPLY_TO=info@mbventuresghana.com
ADMIN_ALERT_EMAIL=info@mbventuresghana.com
EMAIL_DAILY_LIMIT=250
SITE_URL=https://mbventuresghana.com
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
curl https://mbventuresghana.com
# Should return HTML
```

---

## 📊 ALL CREDENTIALS SUMMARY

### Production URLs:
- **Site**: https://mbventuresghana.com
- **Convex Backend**: https://necessary-newt-861.convex.cloud
- **Convex Dashboard**: https://dashboard.convex.dev/t/synthxos/shop/necessary-newt-861

### Email:
- **Provider**: Web3Forms
- **Access Key**: `c8395fed-e25e-4350-a914-df8e592f5920`
- **Reply To**: info@mbventuresghana.com
- **Admin Alerts**: info@mbventuresghana.com
- **Daily Limit**: 250 emails

### Admin Account (Register First):
- **Email**: admin@mbventuresghana.com
- **Password**: MBVentures2025!Admin#Secure

### Staff Account (Register First):
- **Email**: staff@mbventuresghana.com
- **Password**: MBVentures2025!Staff#Secure

### After Registration, Grant Privileges:
```powershell
# Windows PowerShell
npx convex run users:grantStaff '{\"email\":\"admin@mbventuresghana.com\"}' --prod
npx convex run users:grantStaff '{\"email\":\"staff@mbventuresghana.com\"}' --prod
```

```bash
# Mac/Linux/Git Bash
npx convex run users:grantStaff '{"email":"admin@mbventuresghana.com"}' --prod
npx convex run users:grantStaff '{"email":"staff@mbventuresghana.com"}' --prod
```

---

## ✅ POST-DEPLOYMENT CHECKLIST

- [ ] Environment variables set correctly (`.env.local` exists)
- [ ] PM2 running (`pm2 status` shows online)
- [ ] Site loads at https://mbventuresghana.com
- [ ] Admin account registered
- [ ] Staff account registered  
- [ ] Privileges granted (can access /staff)
- [ ] Mobile Money wallet configured
- [ ] Ordering enabled
- [ ] Test order placed successfully

---

**Last Updated:** 2025-01-10  
**All credentials verified and ready for production** ✅
