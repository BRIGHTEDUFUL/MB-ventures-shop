# Hostinger Production Deployment Guide

**Project:** MB Ventures GH - Circle Shop Express  
**Domain:** mbventuresghana.com  
**Target:** Hostinger VPS/Cloud Hosting  
**Date:** October 9, 2026

---

## 📋 Pre-Deployment Checklist

Before deploying to Hostinger:

- [x] GitHub repository up to date
- [x] Email system configured (Web3Forms)
- [x] Production domain configured
- [x] All tests passing (179/179)
- [x] Build succeeds locally
- [x] Environment variables documented

---

## 🌐 Hostinger Setup

### Step 1: Choose Hosting Plan

**Recommended for this project:**

- **VPS Hosting** (for Node.js support) or
- **Cloud Hosting** (easier Node.js setup)
- **Minimum:** 2GB RAM, 2 CPU cores
- **Storage:** 50GB SSD minimum

### Step 2: Domain Configuration

1. **Add domain to Hostinger:**
   - Go to Hostinger control panel
   - Domains → Add Domain
   - Enter: `mbventuresghana.com`

2. **DNS Configuration:**

   ```
   Type: A Record
   Name: @ (or mbventuresghana.com)
   Points to: [Your VPS IP]
   TTL: 3600

   Type: A Record
   Name: www
   Points to: [Your VPS IP]
   TTL: 3600
   ```

3. **SSL Certificate:**
   - Hostinger auto-provisions Let's Encrypt SSL
   - Enable "Force HTTPS"
   - Certificate should activate within 10 minutes

---

## 🔧 Server Setup (VPS/Cloud)

### Step 1: Connect to Server

```bash
# SSH into your Hostinger VPS
ssh root@your-vps-ip
# Or use Hostinger's web terminal
```

### Step 2: Install Node.js

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show v10.x.x

# Install PM2 (process manager)
npm install -g pm2
```

### Step 3: Install Git

```bash
apt install -y git
git --version
```

### Step 4: Setup Application Directory

```bash
# Create application directory
mkdir -p /var/www/mbventuresghana
cd /var/www/mbventuresghana

# Clone repository
git clone https://github.com/BRIGHTEDUFUL/MB-ventures-shop.git .

# Install dependencies
npm install
```

---

## 📝 Environment Configuration

### Create Production .env Files

```bash
# Navigate to project directory
cd /var/www/mbventuresghana

# Create .env.local for production
nano .env.local
```

**Content for `.env.local`:**

```env
# Production Convex Deployment
CONVEX_DEPLOYMENT=prod:necessary-newt-861
VITE_CONVEX_URL=https://necessary-newt-861.convex.cloud
VITE_CONVEX_SITE_URL=https://necessary-newt-861.convex.site

# Domain (must match actual domain)
VITE_SITE_URL=https://mbventuresghana.com
```

Save and exit (Ctrl+X, Y, Enter)

---

## 🏗️ Build Application

```bash
cd /var/www/mbventuresghana

# Install dependencies (if not done)
npm install

# Build for production
npm run build

# This creates .output/ directory with:
# - .output/server/ (Node.js server)
# - .output/public/ (static assets)
```

---

## 🚀 Deploy with PM2

### Create PM2 Ecosystem File

```bash
nano ecosystem.config.js
```

**Content:**

```javascript
module.exports = {
  apps: [
    {
      name: "mbventuresghana",
      script: ".output/server/index.mjs",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOST: "0.0.0.0",
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      time: true,
      max_memory_restart: "500M",
    },
  ],
};
```

### Start Application

```bash
# Create logs directory
mkdir -p logs

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command PM2 suggests

# Check status
pm2 status
pm2 logs mbventuresghana

# View application
curl http://localhost:3000
```

---

## 🔒 Nginx Setup (Reverse Proxy)

### Install Nginx

```bash
apt install -y nginx
```

### Configure Nginx

```bash
nano /etc/nginx/sites-available/mbventuresghana
```

**Content:**

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name mbventuresghana.com www.mbventuresghana.com;

    return 301 https://mbventuresghana.com$request_uri;
}

# HTTPS Configuration
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name mbventuresghana.com www.mbventuresghana.com;

    # SSL Configuration (Let's Encrypt - Hostinger auto-manages)
    ssl_certificate /etc/letsencrypt/live/mbventuresghana.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mbventuresghana.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript
               application/x-javascript application/xml+rss
               application/json application/javascript;

    # Client max body size (for image uploads)
    client_max_body_size 10M;

    # Proxy to Node.js application
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Logs
    access_log /var/log/nginx/mbventuresghana-access.log;
    error_log /var/log/nginx/mbventuresghana-error.log;
}
```

### Enable Site and Restart Nginx

```bash
# Create symbolic link
ln -s /etc/nginx/sites-available/mbventuresghana /etc/nginx/sites-enabled/

# Remove default site
rm /etc/nginx/sites-enabled/default

# Test configuration
nginx -t

# Restart Nginx
systemctl restart nginx
systemctl enable nginx

# Check status
systemctl status nginx
```

---

## 🔥 Firewall Configuration

```bash
# Install UFW if not present
apt install -y ufw

# Allow SSH (important - don't lock yourself out!)
ufw allow 22/tcp

# Allow HTTP and HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Enable firewall
ufw enable

# Check status
ufw status
```

---

## 🔐 SSL Certificate (Let's Encrypt)

If Hostinger doesn't auto-provision SSL:

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx

# Get certificate
certbot --nginx -d mbventuresghana.com -d www.mbventuresghana.com

# Follow prompts:
# - Enter email: info@mbventuresghana.com
# - Agree to terms: Yes
# - Redirect HTTP to HTTPS: Yes

# Auto-renewal is configured automatically
# Test renewal
certbot renew --dry-run
```

---

## 🗄️ Convex Backend Deployment

The backend is already hosted by Convex, but verify production deployment:

```bash
# From your local machine (not server):
cd /path/to/project

# Deploy Convex functions to production
npx convex deploy --prod

# Verify deployment
npx convex env list --prod
```

Should show:

```
WEB3FORMS_ACCESS_KEY: c8395fed-...
SITE_URL: https://mbventuresghana.com
EMAIL_REPLY_TO: info@mbventuresghana.com
ADMIN_ALERT_EMAIL: info@mbventuresghana.com
EMAIL_DAILY_LIMIT: 250
```

---

## ✅ Verification Steps

### 1. Check Application is Running

```bash
# On server:
pm2 status
pm2 logs mbventuresghana --lines 50

# Should show:
# ● mbventuresghana | online | pid 1234 | 0 restarts
```

### 2. Test Local Access

```bash
curl http://localhost:3000
# Should return HTML
```

### 3. Test Domain Access

```bash
# From your local machine:
curl https://mbventuresghana.com
# Should return HTML with SSL

# Check SSL
curl -I https://mbventuresghana.com
# Should show: HTTP/2 200
```

### 4. Browser Test

Open in browser:

- ✅ https://mbventuresghana.com
- ✅ https://www.mbventuresghana.com (redirects to non-www)
- ✅ http://mbventuresghana.com (redirects to HTTPS)

### 5. Verify Email System

1. Navigate to: https://mbventuresghana.com/admin/emails
2. Sign in as admin
3. Check banner shows "Live mode" (green)
4. Send test email
5. Verify arrival at info@mbventuresghana.com

### 6. Verify Functionality

- [ ] Homepage loads with images
- [ ] Product pages display correctly
- [ ] Search works
- [ ] Cart functionality
- [ ] Checkout process
- [ ] Staff sign-in at /staff
- [ ] Admin panel at /admin
- [ ] Email notifications sending
- [ ] Mobile responsive (test on phone)

---

## 🔄 Deployment Updates (CI/CD)

### Manual Update Process

```bash
# SSH into server
ssh root@your-vps-ip

# Navigate to project
cd /var/www/mbventuresghana

# Pull latest changes
git pull origin main

# Install any new dependencies
npm install

# Rebuild application
npm run build

# Restart PM2
pm2 restart mbventuresghana

# Check logs
pm2 logs mbventuresghana --lines 50
```

### Automated Deployment Script

Create `deploy.sh`:

```bash
#!/bin/bash
set -e

echo "🚀 Starting deployment..."

# Navigate to project directory
cd /var/www/mbventuresghana

# Pull latest code
echo "📥 Pulling latest changes..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build application
echo "🏗️  Building application..."
npm run build

# Restart PM2
echo "🔄 Restarting application..."
pm2 restart mbventuresghana

# Wait for startup
sleep 5

# Check status
echo "✅ Deployment complete!"
pm2 status
pm2 logs mbventuresghana --lines 20
```

Make executable and use:

```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 📊 Monitoring & Maintenance

### PM2 Monitoring

```bash
# View logs
pm2 logs mbventuresghana

# Monitor in real-time
pm2 monit

# View metrics
pm2 show mbventuresghana

# Restart if needed
pm2 restart mbventuresghana

# Reload (zero-downtime)
pm2 reload mbventuresghana
```

### Server Monitoring

```bash
# Check disk space
df -h

# Check memory usage
free -h

# Check CPU load
htop

# Check Nginx logs
tail -f /var/log/nginx/mbventuresghana-access.log
tail -f /var/log/nginx/mbventuresghana-error.log
```

### Automated Backups

Create backup script:

```bash
nano /root/backup-mbventuresghana.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/root/backups"
DATE=$(date +%Y-%m-%d-%H%M)

mkdir -p $BACKUP_DIR

# Backup application
tar -czf $BACKUP_DIR/app-$DATE.tar.gz /var/www/mbventuresghana

# Keep only last 7 days
find $BACKUP_DIR -name "app-*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/app-$DATE.tar.gz"
```

```bash
chmod +x /root/backup-mbventuresghana.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /root/backup-mbventuresghana.sh
```

### Convex Database Backups

```bash
# From local machine, export data regularly
npx convex export --path backups/prod-$(date +%Y-%m-%d).zip --prod

# Keep backups in safe location
```

---

## 🆘 Troubleshooting

### Application Won't Start

```bash
# Check PM2 logs
pm2 logs mbventuresghana --lines 100

# Check Node.js version
node --version  # Must be 20.x or higher

# Rebuild
cd /var/www/mbventuresghana
npm run build
pm2 restart mbventuresghana
```

### 502 Bad Gateway

```bash
# Check if app is running
pm2 status

# Check Nginx configuration
nginx -t

# Check Nginx logs
tail -f /var/log/nginx/mbventuresghana-error.log

# Restart services
pm2 restart mbventuresghana
systemctl restart nginx
```

### SSL Certificate Issues

```bash
# Renew certificate
certbot renew

# Force renewal
certbot renew --force-renewal

# Check certificate expiry
certbot certificates
```

### High Memory Usage

```bash
# Check memory
free -h

# Restart application
pm2 restart mbventuresghana

# Reduce PM2 instances if needed
# Edit ecosystem.config.js: instances: 2
pm2 restart mbventuresghana
```

### Slow Performance

```bash
# Check server load
htop

# Optimize PM2 (enable cluster mode with fewer instances)
# Check Nginx gzip is enabled
# Check database queries (Convex dashboard)
# Consider upgrading VPS plan
```

---

## 🔐 Security Hardening

### 1. Secure SSH

```bash
# Edit SSH config
nano /etc/ssh/sshd_config

# Change settings:
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes

# Restart SSH
systemctl restart sshd
```

### 2. Install Fail2Ban

```bash
apt install -y fail2ban

# Configure
cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
nano /etc/fail2ban/jail.local

# Enable and start
systemctl enable fail2ban
systemctl start fail2ban
```

### 3. Keep System Updated

```bash
# Update regularly
apt update && apt upgrade -y

# Enable automatic security updates
apt install -y unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades
```

---

## 📞 Support Contacts

**Domain & Hosting:**

- Hostinger Support: https://www.hostinger.com/contact
- Login: https://hpanel.hostinger.com

**Email Service:**

- Web3Forms: https://web3forms.com
- Dashboard: https://web3forms.com/dashboard

**Backend (Convex):**

- Dashboard: https://dashboard.convex.dev
- Deployment: prod:necessary-newt-861

**Repository:**

- GitHub: https://github.com/BRIGHTEDUFUL/MB-ventures-shop

---

## ✅ Deployment Checklist

- [ ] VPS/Cloud hosting provisioned
- [ ] Domain DNS configured
- [ ] SSH access working
- [ ] Node.js 20.x installed
- [ ] Git installed
- [ ] PM2 installed globally
- [ ] Repository cloned
- [ ] Dependencies installed (`npm install`)
- [ ] `.env.local` created with production values
- [ ] Application built (`npm run build`)
- [ ] PM2 started and saved
- [ ] PM2 startup configured
- [ ] Nginx installed and configured
- [ ] SSL certificate active
- [ ] Firewall configured
- [ ] Domain resolves to server IP
- [ ] HTTPS works
- [ ] Application loads in browser
- [ ] Email system verified (live mode)
- [ ] Staff login works
- [ ] Admin panel accessible
- [ ] Test order completes
- [ ] Mobile responsive verified
- [ ] Monitoring setup (PM2, logs)
- [ ] Backups configured
- [ ] Security hardening applied

---

## 🎉 Production Go-Live

Once checklist complete:

1. **Announce to team** - System is live
2. **Enable ordering** - Ordering is toggled ON in /staff (payment is collected offline, no wallet setup needed)
3. **Monitor closely** - First 24-48 hours
4. **Customer announcement** - Share domain and contact info
5. **Social media** - Update with new website

**Your storefront is now live at:** https://mbventuresghana.com 🚀

---

**Last Updated:** October 9, 2026  
**Status:** Production deployment guide complete  
**Next:** Execute deployment steps
