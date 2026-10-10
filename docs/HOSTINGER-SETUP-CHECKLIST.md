# Hostinger Production Setup Checklist

**Date:** 2025-01-10  
**Project:** MB Ventures GH  
**Domain:** mbventuresghana.com  
**Backend:** Convex Cloud (necessary-newt-861.convex.cloud)

---

## Pre-Deployment (Completed ✅)

- [x] GitHub repository connected to Hostinger
- [x] All code pushed to GitHub (commit: dad4353)
- [x] Backend deployed to Convex production
- [x] Environment variables documented
- [x] Production credentials prepared
- [x] Deployment scripts created

---

## Phase 1: Server Setup

### 1.1 Connect to Hostinger VPS

```bash
# SSH into your VPS
ssh root@[your-server-ip]
```

**Status:** ⏸️ Waiting for completion

---

### 1.2 Install Dependencies

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verify installation
node --version  # Should be v20.x or higher
npm --version

# Install PM2 globally
npm install -g pm2

# Install build tools (if needed)
apt install -y build-essential
```

**Status:** ⏸️ Waiting for completion

---

### 1.3 Clone Repository

```bash
# Create web directory
mkdir -p /var/www
cd /var/www

# Clone from GitHub (if not auto-deployed by Hostinger)
git clone https://github.com/BRIGHTEDUFUL/MB-ventures-shop.git mbventuresghana
cd mbventuresghana

# Verify files
ls -la
```

**Status:** ⏸️ Waiting for completion

---

## Phase 2: Environment Configuration

### 2.1 Set Up Environment Variables

```bash
cd /var/www/mbventuresghana

# Run the environment setup script
chmod +x scripts/setup-production-env.sh
bash scripts/setup-production-env.sh

# Verify .env.local was created
cat .env.local
```

**Expected variables in .env.local:**

- ✓ `VITE_CONVEX_URL=https://necessary-newt-861.convex.cloud`
- ✓ `VITE_SITE_URL=https://mbventuresghana.com`
- ✓ `NODE_ENV=production`
- ✓ `WEB3FORMS_ACCESS_KEY=c8395fed-e25e-4350-a914-df8e592f5920`
- ✓ `EMAIL_REPLY_TO=info@mbventuresghana.com`
- ✓ `ADMIN_ALERT_EMAIL=info@mbventuresghana.com`
- ✓ `EMAIL_DAILY_LIMIT=250`

**Status:** ⏸️ Waiting for completion

---

### 2.2 Verify Convex Environment (From Local Machine)

```powershell
# Check production Convex env vars
npx convex env list --prod
```

**Must show:**

- ✓ WEB3FORMS_ACCESS_KEY
- ✓ EMAIL_REPLY_TO
- ✓ ADMIN_ALERT_EMAIL
- ✓ EMAIL_DAILY_LIMIT
- ✓ SITE_URL
- ✓ JWT_PRIVATE_KEY
- ✓ JWKS

**Status:** ⏸️ Waiting for verification

---

## Phase 3: Build and Deploy Application

### 3.1 Install Dependencies

```bash
cd /var/www/mbventuresghana
npm install
```

**Status:** ⏸️ Waiting for completion

---

### 3.2 Build Application

```bash
# Build for production
npm run build

# Verify .output directory
ls -la .output/
ls -la .output/server/
ls -la .output/public/
```

**Status:** ⏸️ Waiting for completion

---

### 3.3 Start with PM2

```bash
# Start the application
pm2 start ecosystem.config.js

# Verify it's running
pm2 status
pm2 logs mb-ventures-gh --lines 50

# Save PM2 configuration
pm2 save

# Enable PM2 startup on boot
pm2 startup
# Follow the command it provides
```

**Status:** ⏸️ Waiting for completion

---

## Phase 4: Nginx Configuration

### 4.1 Install Nginx

```bash
# Install Nginx
apt install -y nginx

# Verify installation
nginx -v
```

**Status:** ⏸️ Waiting for completion

---

### 4.2 Configure Reverse Proxy

```bash
# Create Nginx config
nano /etc/nginx/sites-available/mbventuresghana.com
```

**Paste this configuration:**

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name mbventuresghana.com www.mbventuresghana.com;

    # Redirect to HTTPS (after SSL setup)
    # return 301 https://$server_name$request_uri;

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

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static files (optional optimization)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Client body size
    client_max_body_size 10M;
}
```

**Enable the site:**

```bash
# Create symbolic link
ln -s /etc/nginx/sites-available/mbventuresghana.com /etc/nginx/sites-enabled/

# Test configuration
nginx -t

# Reload Nginx
systemctl reload nginx

# Verify status
systemctl status nginx
```

**Status:** ⏸️ Waiting for completion

---

## Phase 5: DNS Configuration

### 5.1 Configure DNS A Records

**In Hostinger DNS Panel:**

```
Type    Name    Value               TTL
A       @       [your-server-ip]    3600
A       www     [your-server-ip]    3600
```

**Status:** ⏸️ Waiting for completion

---

### 5.2 Verify DNS Propagation

```bash
# Check DNS resolution
nslookup mbventuresghana.com
nslookup www.mbventuresghana.com

# Or use dig
dig mbventuresghana.com +short
dig www.mbventuresghana.com +short
```

**Status:** ⏸️ Waiting for verification

---

## Phase 6: SSL Certificate (Let's Encrypt)

### 6.1 Install Certbot

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx

# Obtain certificate
certbot --nginx -d mbventuresghana.com -d www.mbventuresghana.com

# Follow prompts:
# - Enter email for renewal notifications
# - Agree to Terms of Service
# - Choose redirect HTTP to HTTPS (option 2)

# Verify certificate
certbot certificates

# Test auto-renewal
certbot renew --dry-run
```

**Status:** ⏸️ Waiting for completion

---

### 6.2 Verify HTTPS

```bash
# Test the site
curl -I https://mbventuresghana.com
```

**Expected:** HTTP 200 OK response with SSL

**Status:** ⏸️ Waiting for verification

---

## Phase 7: Create Production Accounts

### 7.1 Register Admin Account

**Action:** Open https://mbventuresghana.com/auth/signup in browser

**Enter:**

- Name: `MB Ventures Admin`
- Email: `admin@mbventuresghana.com`
- Phone: `+233 24 000 0001`
- Password: `MBVentures2025!Admin#Secure`

**Status:** ⏸️ Waiting for registration

---

### 7.2 Register Staff Account

**Action:** Open https://mbventuresghana.com/auth/signup in browser

**Enter:**

- Name: `MB Ventures Staff`
- Email: `staff@mbventuresghana.com`
- Phone: `+233 24 000 0002`
- Password: `MBVentures2025!Staff#Secure`

**Status:** ⏸️ Waiting for registration

---

### 7.3 Grant Staff Privileges (From Local Machine)

```powershell
# Grant admin role
npx convex run users:grantStaff '{\"email\":\"admin@mbventuresghana.com\"}' --prod

# Grant staff role
npx convex run users:grantStaff '{\"email\":\"staff@mbventuresghana.com\"}' --prod
```

**Status:** ⏸️ Waiting for completion

---

## Phase 8: Production Configuration

### 8.1 Sign In as Admin

1. Go to https://mbventuresghana.com/auth/signin
2. Sign in with admin@mbventuresghana.com
3. Navigate to /staff

**Status:** ⏸️ Waiting for verification

---

### 8.2 Configure Store Settings

**Navigation:** /staff → Settings → Store

**Set:**

- [x] Store name: MB Ventures GH
- [x] Contact email: info@mbventuresghana.com
- [x] Contact phone: +233 XX XXX XXXX
- [x] Store description
- [x] Announcement bar (optional)
- [x] Featured products (select 3-5)

**Status:** ⏸️ Waiting for configuration

---

### 8.3 Configure Delivery Settings

**Navigation:** /staff → Settings → Delivery

**Verify:**

- [x] Central Accra zone fee
- [x] Greater Accra zone fee
- [x] Nationwide zone fee
- [x] Minimum order amounts
- [x] Free delivery thresholds (if any)

**Status:** ⏸️ Waiting for verification

---

### 8.4 Payments — collected offline

**No configuration step.** There is no in-app payment form: pickup orders pay
at the Abelenkpe shop counter, delivery orders pay cash to the courier, and
staff record receipt in `/staff` → Orders.

**Status:** ✅ No setup required

---

### 8.5 Enable Ordering

**Navigation:** /staff → Settings → Store

- [x] Toggle "Enable Ordering" to ON

**Status:** ⏸️ Waiting for activation

---

## Phase 9: Testing

### 9.1 Test Admin Account

- [x] Sign in as admin@mbventuresghana.com
- [x] Access /staff dashboard
- [x] View all menu items
- [x] Create/edit a product
- [x] Adjust inventory
- [x] View order list

**Status:** ⏸️ Waiting for testing

---

### 9.2 Test Staff Account

- [x] Sign in as staff@mbventuresghana.com
- [x] Access /staff dashboard
- [x] View orders
- [x] Update order status
- [x] Adjust inventory
- [x] Edit products
- [x] Verify no payment-details form anywhere in checkout

**Status:** ⏸️ Waiting for testing

---

### 9.3 Test Customer Flow

**As Guest:**

1. [x] Browse products at https://mbventuresghana.com
2. [x] Add items to cart
3. [x] Create customer account
4. [x] Complete checkout
5. [x] Receive order confirmation email
6. [x] Track order with reference + phone

**As Staff/Admin:** 7. [x] See order in staff panel 8. [x] Update payment status to "Confirmed" 9. [x] Update order status to "Processing" 10. [x] Update to "Dispatched" 11. [x] Customer receives status update email 12. [x] Complete order 13. [x] Verify inventory updated correctly

**Status:** ⏸️ Waiting for testing

---

### 9.4 Test Email System

- [x] Contact form submission (guest)
- [x] Order confirmation email (customer)
- [x] Admin alert email (shop)
- [x] Order status update emails
- [x] Verify emails arrive at info@mbventuresghana.com

**Status:** ⏸️ Waiting for testing

---

## Phase 10: Monitoring & Maintenance

### 10.1 Set Up Monitoring

```bash
# PM2 monitoring
pm2 monit

# View logs
pm2 logs mb-ventures-gh --lines 100

# Server resources
htop
df -h
free -m
```

**Status:** ⏸️ Waiting for setup

---

### 10.2 Configure Backups

```bash
# Database backups (Convex handles this)
# Static assets backup
tar -czf /root/backups/public-$(date +%Y%m%d).tar.gz /var/www/mbventuresghana/public

# Nginx config backup
cp /etc/nginx/sites-available/mbventuresghana.com /root/backups/nginx-$(date +%Y%m%d).conf
```

**Status:** ⏸️ Waiting for setup

---

### 10.3 Set Up Log Rotation

```bash
# PM2 handles log rotation automatically
pm2 install pm2-logrotate

# Configure (optional)
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

**Status:** ⏸️ Waiting for setup

---

## Phase 11: Security Hardening

### 11.1 Firewall Configuration

```bash
# Install UFW
apt install -y ufw

# Allow SSH, HTTP, HTTPS
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp

# Enable firewall
ufw enable

# Check status
ufw status
```

**Status:** ⏸️ Waiting for completion

---

### 11.2 Fail2Ban (Optional)

```bash
# Install Fail2Ban
apt install -y fail2ban

# Configure
cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
systemctl enable fail2ban
systemctl start fail2ban
```

**Status:** ⏸️ Optional

---

## Final Verification

### Production Site Checklist

- [ ] Site loads at https://mbventuresghana.com
- [ ] SSL certificate valid (green padlock)
- [ ] Products visible on homepage
- [ ] Cart functionality works
- [ ] Checkout completes successfully
- [ ] Order confirmation email received
- [ ] Admin can sign in at /staff
- [ ] Staff can sign in at /staff
- [ ] Checkout asks for no payment details (pay-later flow)
- [ ] Order status updates work
- [ ] Inventory adjustments work
- [ ] Email notifications arrive
- [ ] Guest order tracking works
- [ ] Mobile responsive (test on phone)
- [ ] Page load speed acceptable (< 3 seconds)

---

## Support & Documentation

**Deployment Docs:**

- HOSTINGER-DEPLOYMENT.md
- docs/PRODUCTION-CONFIG.md
- docs/BACKEND-STATUS.md

**Credentials:**

- docs/PRODUCTION-CREDENTIALS.md (local only, gitignored)

**Convex Dashboard:**

- https://dashboard.convex.dev/t/synthxos/shop/necessary-newt-861

**GitHub Repository:**

- https://github.com/BRIGHTEDUFUL/MB-ventures-shop

**Email System:**

- Web3Forms dashboard (if available)
- Admin emails: info@mbventuresghana.com

---

## Troubleshooting

### Site Not Loading

```bash
# Check PM2 status
pm2 status
pm2 logs mb-ventures-gh --err --lines 50

# Check Nginx
systemctl status nginx
nginx -t

# Check port 3000
netstat -tuln | grep 3000
curl http://localhost:3000
```

### SSL Issues

```bash
# Renew certificate
certbot renew
systemctl reload nginx
```

### Build Errors

```bash
cd /var/www/mbventuresghana
rm -rf node_modules .output
npm install
npm run build
pm2 restart mb-ventures-gh
```

### Email Not Sending

- Check Convex env vars: `npx convex env list --prod`
- Verify WEB3FORMS_ACCESS_KEY is set
- Check email logs in Convex dashboard: Data → emailLogs table

---

**Last Updated:** October 10, 2026  
**Status:** Live in production
