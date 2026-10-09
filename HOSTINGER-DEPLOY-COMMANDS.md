# Hostinger Deployment Commands

**Copy and paste these commands into Hostinger web terminal or SSH session**

---

## Step 1: Navigate to Project Directory

```bash
cd /var/www/mbventuresghana
```

**If directory doesn't exist, create it:**
```bash
sudo mkdir -p /var/www
cd /var/www
sudo git clone https://github.com/BRIGHTEDUFUL/MB-ventures-shop.git mbventuresghana
cd mbventuresghana
```

---

## Step 2: Pull Latest Changes (if already exists)

```bash
git pull origin main
```

---

## Step 3: Set Up Environment Variables

```bash
chmod +x scripts/setup-production-env.sh
bash scripts/setup-production-env.sh
```

**Verify environment file was created:**
```bash
cat .env.local
```

**Should show:**
- VITE_CONVEX_URL=https://necessary-newt-861.convex.cloud
- VITE_SITE_URL=https://mbventuresghana.com
- WEB3FORMS_ACCESS_KEY=c8395fed...
- And other production variables

---

## Step 4: Install Dependencies

```bash
npm install
```

**This may take 2-3 minutes...**

---

## Step 5: Build Application

```bash
npm run build
```

**This may take 1-2 minutes...**

**Verify build succeeded:**
```bash
ls -la .output/
```

Should see `server/` and `public/` directories.

---

## Step 6: Install PM2 (if not installed)

```bash
npm install -g pm2
```

---

## Step 7: Start Application

**First time:**
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

**If already running:**
```bash
pm2 restart mb-ventures-gh
```

---

## Step 8: Check Status

```bash
pm2 status
pm2 logs mb-ventures-gh --lines 50
```

**Should see:**
- Status: `online`
- Logs showing server started on port 3000

---

## Step 9: Test Locally

```bash
curl http://localhost:3000
```

Should return HTML content.

---

## Quick Commands Reference

```bash
# View logs
pm2 logs mb-ventures-gh

# Restart app
pm2 restart mb-ventures-gh

# Stop app
pm2 stop mb-ventures-gh

# View all processes
pm2 list

# Monitor resources
pm2 monit
```

---

## Troubleshooting

**App not starting?**
```bash
pm2 logs mb-ventures-gh --err --lines 100
```

**Port 3000 already in use?**
```bash
sudo lsof -i :3000
# Kill the process if needed
sudo kill -9 [PID]
```

**Build errors?**
```bash
rm -rf node_modules .output
npm install
npm run build
```

**Environment variables not set?**
```bash
cat .env.local
# If empty or wrong, run setup again:
bash scripts/setup-production-env.sh
```

---

## After Deployment

### Configure Nginx (if needed)

Create `/etc/nginx/sites-available/mbventuresghana.com`:

```nginx
server {
    listen 80;
    server_name mbventuresghana.com www.mbventuresghana.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/mbventuresghana.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Set Up SSL

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d mbventuresghana.com -d www.mbventuresghana.com
```

---

## Create Production Accounts

### On Production Site

1. Go to: https://mbventuresghana.com/auth/signup
2. Register admin: admin@mbventuresghana.com
3. Register staff: staff@mbventuresghana.com

### Grant Privileges (from your local machine)

```powershell
# Windows PowerShell
npx convex run users:grantStaff '{\"email\":\"admin@mbventuresghana.com\"}' --prod
npx convex run users:grantStaff '{\"email\":\"staff@mbventuresghana.com\"}' --prod
```

```bash
# Mac/Linux
npx convex run users:grantStaff '{"email":"admin@mbventuresghana.com"}' --prod
npx convex run users:grantStaff '{"email":"staff@mbventuresghana.com"}' --prod
```

---

## Final Verification

1. ✅ Site loads at https://mbventuresghana.com
2. ✅ Can sign up for customer account
3. ✅ Can sign in with admin account
4. ✅ Admin can access /staff
5. ✅ Products display correctly
6. ✅ Cart works
7. ✅ Checkout completes
8. ✅ Emails send

---

**Deployment Complete!** 🚀
