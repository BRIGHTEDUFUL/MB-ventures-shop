# GitHub Auto-Deploy to Hostinger

**Automatic deployment on every push to main branch**

---

## 🎯 Setup Instructions

### Step 1: Get Hostinger SSH Credentials

1. Login to **hPanel** (https://hpanel.hostinger.com)
2. Go to your **VPS/Hosting Service**
3. Navigate to **Advanced** → **SSH Access**
4. Note down:
   - **Host/IP**: Your server IP (e.g., `123.456.78.90`)
   - **Username**: Usually `root` or `u123456789`
   - **Password**: Your SSH password (or use SSH key)
   - **Port**: Usually `22`
   - **Path**: Where your project lives (e.g., `/var/www/mbventuresghana`)

---

### Step 2: Add Secrets to GitHub

1. Go to your GitHub repository: https://github.com/BRIGHTEDUFUL/MB-ventures-shop
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** for each:

**Required Secrets:**

| Secret Name          | Value          | Example                  |
| -------------------- | -------------- | ------------------------ |
| `HOSTINGER_HOST`     | Your server IP | `123.456.78.90`          |
| `HOSTINGER_USERNAME` | SSH username   | `root` or `u123456789`   |
| `HOSTINGER_PASSWORD` | SSH password   | `YourSecurePassword123!` |

**Optional Secrets:**

| Secret Name      | Value        | Default                    | Notes             |
| ---------------- | ------------ | -------------------------- | ----------------- |
| `HOSTINGER_PORT` | SSH port     | `22`                       | Only if different |
| `HOSTINGER_PATH` | Project path | `/var/www/mbventuresghana` | Only if different |

**How to add each secret:**

1. Click **"New repository secret"**
2. Enter **Name** (e.g., `HOSTINGER_HOST`)
3. Enter **Value** (e.g., `123.456.78.90`)
4. Click **"Add secret"**
5. Repeat for all secrets

---

### Step 3: First-Time Server Setup

**Connect to Hostinger via SSH:**

```bash
# Via hPanel Web Terminal (easiest)
# OR via SSH client:
ssh root@YOUR_SERVER_IP
```

**Run initial setup:**

```bash
# Create project directory
sudo mkdir -p /var/www/mbventuresghana
cd /var/www/mbventuresghana

# Clone repository
git clone https://github.com/BRIGHTEDUFUL/MB-ventures-shop.git .

# Set up environment
bash scripts/setup-production-env.sh

# Install dependencies
npm install

# Build
npm run build

# Start PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 🚀 How It Works

### Automatic Deployment (On Every Push)

**Workflow:** `.github/workflows/deploy-hostinger.yml`

**Triggers:** Automatically on every push to `main` branch

**What it does:**

1. ✅ Pulls latest code from GitHub
2. ✅ Installs dependencies
3. ✅ Sets up environment
4. ✅ Builds application
5. ✅ Restarts PM2
6. ✅ Shows deployment status

**How to use:**

```bash
# Just push to main branch
git add .
git commit -m "Your changes"
git push origin main

# GitHub Actions will automatically deploy!
```

---

### Manual Clean Deployment

**Workflow:** `.github/workflows/clean-deploy.yml`

**Triggers:** Manually via GitHub Actions UI

**What it does:**

1. 🛑 Stops PM2
2. 🗑️ Removes old files (node_modules, build cache)
3. 🔄 Fresh git pull
4. 📦 Clean npm install
5. 🏗️ Fresh build
6. 🚀 Starts PM2

**How to use:**

1. Go to: https://github.com/BRIGHTEDUFUL/MB-ventures-shop/actions
2. Click **"Clean Deployment to Hostinger"**
3. Click **"Run workflow"**
4. Type **`CLEAN_DEPLOY`** in the confirmation field
5. Click **"Run workflow"** button

**When to use clean deployment:**

- After major dependency updates
- When build cache causes issues
- For completely fresh start
- When something seems broken

---

## 📊 Monitoring Deployments

### View Deployment Status

1. Go to: https://github.com/BRIGHTEDUFUL/MB-ventures-shop/actions
2. See all deployment runs
3. Click on any run to see detailed logs

### Check Server Status

**Via hPanel Web Terminal:**

```bash
cd /var/www/mbventuresghana
pm2 status
pm2 logs mb-ventures-gh --lines 50
```

**Check if site is live:**

```bash
curl http://localhost:3000
# Or visit: https://mbventuresghana.com
```

---

## 🔧 Troubleshooting

### Deployment Failed

**Check GitHub Actions logs:**

1. Go to Actions tab
2. Click on failed workflow
3. Read error messages

**Common issues:**

**1. SSH Connection Failed**

- ✅ Verify `HOSTINGER_HOST` is correct
- ✅ Check `HOSTINGER_USERNAME` and `HOSTINGER_PASSWORD`
- ✅ Ensure SSH is enabled in hPanel

**2. Git Pull Failed**

- ✅ Repository must be public OR
- ✅ Add deploy key to GitHub (Advanced)

**3. Build Failed**

- ✅ Check Node.js version on server: `node --version`
- ✅ Should be 20.x or higher
- ✅ Run clean deployment

**4. PM2 Not Found**

- ✅ Install PM2: `npm install -g pm2`

**5. Permission Denied**

- ✅ Use `sudo` if needed
- ✅ Check directory ownership: `ls -la /var/www/`
- ✅ Fix permissions: `sudo chown -R $USER:$USER /var/www/mbventuresghana`

---

## 🎬 Quick Start Workflow

### First Time Setup:

1. ✅ Add GitHub secrets (Step 2 above)
2. ✅ Run first-time server setup (Step 3 above)
3. ✅ Test automatic deployment:
   ```bash
   git commit --allow-empty -m "Test deployment"
   git push origin main
   ```
4. ✅ Watch Actions tab for deployment status

### Daily Workflow:

1. Make code changes
2. Commit and push to main
3. GitHub automatically deploys!
4. Check site: https://mbventuresghana.com

### When Issues Occur:

1. Run **Clean Deployment** from Actions
2. Check PM2 logs on server
3. Verify environment variables

---

## 🔐 Security Notes

**GitHub Secrets:**

- ✅ Never commit passwords to code
- ✅ GitHub secrets are encrypted
- ✅ Only visible to you and Actions
- ✅ Can be updated anytime

**SSH Security:**

- ✅ Use strong password
- ✅ Consider SSH key authentication (advanced)
- ✅ Restrict SSH access in Hostinger firewall

**Server Security:**

- ✅ Keep Node.js updated
- ✅ Set up UFW firewall
- ✅ Enable Fail2ban (optional)
- ✅ Regular security updates

---

## 📝 Advanced: Using SSH Keys (Optional)

**Instead of password, use SSH key:**

1. **Generate key locally:**

   ```bash
   ssh-keygen -t rsa -b 4096 -C "deploy@mbventuresghana.com"
   ```

2. **Add public key to Hostinger:**
   - Copy content of `~/.ssh/id_rsa.pub`
   - Add to server: `~/.ssh/authorized_keys`

3. **Add private key to GitHub:**
   - Secret name: `HOSTINGER_SSH_KEY`
   - Value: Content of `~/.ssh/id_rsa`

4. **Update workflow:**
   ```yaml
   - name: Deploy to Hostinger via SSH
     uses: appleboy/ssh-action@v1.0.3
     with:
       host: ${{ secrets.HOSTINGER_HOST }}
       username: ${{ secrets.HOSTINGER_USERNAME }}
       key: ${{ secrets.HOSTINGER_SSH_KEY }}
       # Remove password line
   ```

---

## ✅ Verification Checklist

After setup, verify:

- [ ] GitHub secrets added correctly
- [ ] Can SSH into Hostinger server
- [ ] Project cloned to `/var/www/mbventuresghana`
- [ ] `.env.local` created with production values
- [ ] PM2 running: `pm2 status` shows `online`
- [ ] Site loads: `curl http://localhost:3000` returns HTML
- [ ] Nginx configured (if using)
- [ ] SSL enabled
- [ ] Push to main triggers deployment
- [ ] Can run clean deployment manually

---

## 🆘 Support

**If deployment fails:**

1. Check GitHub Actions logs
2. SSH into server and check:
   ```bash
   cd /var/www/mbventuresghana
   git status
   pm2 logs mb-ventures-gh --err
   ```
3. Run clean deployment
4. Check docs: `HOSTINGER-DEPLOYMENT.md`

---

**Last Updated:** 2025-01-10  
**Status:** Ready for auto-deployment 🚀
