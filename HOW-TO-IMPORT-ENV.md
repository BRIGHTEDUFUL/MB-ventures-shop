# How to Import .env File to Hostinger

**3 Easy Methods to Upload the Environment File**

---

## 📁 File Location

**File to upload:** `.env.hostinger`  
**From:** Your local repository  
**To:** `/var/www/mbventuresgh/.env.local` on Hostinger

---

## Method 1: hPanel File Manager (Easiest) ✅

### Step-by-Step:

1. **Login to hPanel**: https://hpanel.hostinger.com
2. Click your **VPS/Hosting service**
3. Go to **Files** → **File Manager**
4. Navigate to `/var/www/mbventuresgh`
5. Click **Upload** button (top right)
6. Select `.env.hostinger` from your computer
7. After upload, **right-click** → **Rename** → Change to `.env.local`
8. Done! ✅

---

## Method 2: FTP/SFTP Upload

### Using FileZilla or Any FTP Client:

1. **Get SFTP credentials from hPanel:**
   - Host: Your server IP
   - Port: 22
   - Username: Your SSH username
   - Password: Your SSH password

2. **Connect via SFTP**

3. **Navigate to:** `/var/www/mbventuresgh`

4. **Upload** `.env.hostinger` from your local folder

5. **Rename** to `.env.local`

6. Done! ✅

---

## Method 3: Terminal/SSH (Tech-Savvy)

### Option A: Create from content

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
```

> Replace `<WEB3FORMS_ACCESS_KEY>` with the real value from a local, untracked
> source (`docs/PRODUCTION-CREDENTIALS.md`, gitignored, or the Convex env:
> `npx convex env get WEB3FORMS_ACCESS_KEY`) — secrets are never committed.

### Option B: Download from GitHub

```bash
cd /var/www/mbventuresgh

# Download the file
wget https://raw.githubusercontent.com/BRIGHTEDUFUL/MB-ventures-shop/main/.env.hostinger

# Rename to .env.local
mv .env.hostinger .env.local
```

### Option C: Use git (if cloned)

```bash
cd /var/www/mbventuresgh

# Pull latest (includes .env.hostinger)
git pull origin main

# Copy and rename
cp .env.hostinger .env.local
```

---

## ✅ Verify the File

**After upload, verify it exists:**

```bash
cd /var/www/mbventuresgh
cat .env.local
```

**Should show:**

```
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

(`WEB3FORMS_ACCESS_KEY` will show the real key only after you substituted it
from `docs/PRODUCTION-CREDENTIALS.md` / the Convex env before upload.)

---

## 🚀 After Importing

**Now deploy your app:**

```bash
cd /var/www/mbventuresgh

# Install dependencies
npm install

# Build
npm run build

# Start PM2
pm2 start ecosystem.config.js
pm2 save

# Check status
pm2 status
```

---

## 📊 File Details

**File name:** `.env.hostinger` (in repo) → `.env.local` (on server)  
**Size:** ~340 bytes  
**Format:** Plain text, UTF-8  
**Line endings:** LF (Unix) or CRLF (Windows) - both work

---

## 🔍 Troubleshooting

**File not found after upload?**

- Check you're in correct directory: `/var/www/mbventuresgh`
- File might be hidden (starts with dot)
- In File Manager, enable "Show hidden files"

**Variables not loading?**

- Ensure file is named exactly `.env.local` (with the dot)
- Check file has no extra extensions (not `.env.local.txt`)
- Verify file permissions: `chmod 600 .env.local`

**Build fails?**

- Make sure `.env.local` exists before running `npm run build`
- Check file content is correct: `cat .env.local`

---

## 🎯 Quick Reference

| Method              | Difficulty      | Best For           |
| ------------------- | --------------- | ------------------ |
| hPanel File Manager | ⭐ Easy         | First-time users   |
| FTP/SFTP            | ⭐⭐ Medium     | Familiar with FTP  |
| Terminal/SSH        | ⭐⭐⭐ Advanced | Command-line users |

---

**Choose the method you're most comfortable with!** 🚀
