# Production Configuration - mbventuresghana.com

**Date:** October 9, 2026  
**Domain:** `https://mbventuresghana.com`  
**Email:** `info@mbventuresghana.com`  
**Deployment:** `prod:necessary-newt-861`

---

## ✅ Configuration Complete

All production environment variables have been set and verified.

### Convex Production Environment Variables

| Variable               | Value                         | Purpose                                                     |
| ---------------------- | ----------------------------- | ----------------------------------------------------------- |
| `SITE_URL`             | `https://mbventuresghana.com` | Origin for all email links, canonical URLs, Open Graph tags |
| `WEB3FORMS_ACCESS_KEY` | `c8395fed-...` (set)          | Web3Forms API access key for email delivery                 |
| `EMAIL_REPLY_TO`       | `info@mbventuresghana.com`    | Reply-to address on all outgoing emails                     |
| `ADMIN_ALERT_EMAIL`    | `info@mbventuresghana.com`    | Where admin alerts and contact form messages go             |
| `EMAIL_DAILY_LIMIT`    | `250`                         | Maximum emails per day (increased from default 100)         |

### Frontend Environment Variables (.env.production)

| Variable               | Value                                     | Purpose                          |
| ---------------------- | ----------------------------------------- | -------------------------------- |
| `VITE_CONVEX_URL`      | `https://necessary-newt-861.convex.cloud` | Production Convex API endpoint   |
| `VITE_CONVEX_SITE_URL` | `https://necessary-newt-861.convex.site`  | Convex site URL                  |
| `VITE_SITE_URL`        | `https://mbventuresghana.com`             | Public storefront origin for SEO |

---

## Email System Configuration

### How It Works

1. **Outgoing Emails** → Web3Forms API → **info@mbventuresghana.com** inbox
2. All customer emails (order confirmations, password resets) arrive at your inbox
3. Reply to customers directly from your email client
4. The customer's address is preserved in the `replyto` field

### Email Templates

All 12 email templates are configured to use:

- **From domain:** Web3Forms (forwarded to your inbox)
- **Reply-to:** `info@mbventuresghana.com`
- **Links:** All point to `https://mbventuresghana.com`
- **Branding:** MB Ventures GH

**Customer emails:**

- `order-received` - Order confirmation
- `payment-confirmed` - Payment verified
- `order-ready-pickup` - Ready for collection
- `order-out-for-delivery` - Dispatched
- `order-completed` - Delivered
- `order-cancelled` - Order cancelled
- `contact-received` - Contact form acknowledgment

**Admin alerts:**

- `admin-new-order` - New order notification
- `admin-payment-confirmed` - Payment verified notification
- `admin-contact-message` - Contact form submission

**Auth emails:**

- `auth-reset-password` - Password reset link
- `auth-verify-email` - Reserved for email verification

### Daily Limits

- **Production:** 250 emails/day
- **Development:** 100 emails/day

---

## Domain Integration Points

The domain `mbventuresghana.com` is integrated throughout the application:

### 1. SEO & Metadata

**File:** All routes via `src/lib/store.ts`

```typescript
// Canonical URLs
<link rel="canonical" href="https://mbventuresghana.com/product/standing-desk" />

// Open Graph
<meta property="og:url" content="https://mbventuresghana.com/product/standing-desk" />
<meta property="og:image" content="https://mbventuresghana.com/images/standing-desk.jpg" />

// Twitter Card
<meta name="twitter:url" content="https://mbventuresghana.com/product/standing-desk" />
```

### 2. Sitemap & Robots

**Files:** `src/routes/sitemap[.]xml.tsx`, `src/routes/robots[.]txt.tsx`

```xml
<!-- Sitemap -->
<url>
  <loc>https://mbventuresghana.com/</loc>
  <lastmod>2026-10-09</lastmod>
  <priority>1.0</priority>
</url>

<!-- Robots.txt -->
Sitemap: https://mbventuresghana.com/sitemap.xml
```

### 3. Email Links

**Files:** `convex/emails/templates/*.ts`

All email templates build links from `SITE_URL`:

- Order tracking: `https://mbventuresghana.com/track?ref=MB-...`
- Password reset: `https://mbventuresghana.com/account?code=...`
- Product links: `https://mbventuresghana.com/product/...`
- Homepage: `https://mbventuresghana.com`

### 4. Contact Information

**Files:** `convex/seed.ts`, `src/routes/$page.tsx`, `src/components/store-shell.tsx`

```typescript
// Store settings
{
  email: "info@mbventuresghana.com",
  phone: "+233 24 000 0000",
  address: "Abelenkpe taxi rank, Accra, Ghana",
}
```

Displayed in:

- Footer contact section
- Contact page (`/$page?page=contact`)
- Email templates

### 5. Schema.org Structured Data

**File:** `src/routes/product.$slug.tsx`

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "offers": {
    "@type": "Offer",
    "url": "https://mbventuresghana.com/product/standing-desk",
    "availability": "https://schema.org/InStock"
  }
}
```

---

## Deployment Checklist

### Production Deployment Steps

1. **Build the frontend:**

   ```powershell
   npm run build
   ```

2. **Deploy Convex functions:**

   ```powershell
   npx convex deploy --prod
   ```

3. **Verify environment variables:**

   ```powershell
   npx convex env list --prod
   ```

4. **Seed store data (if needed):**

   ```powershell
   npx convex run seed:seed --prod
   ```

5. **Grant staff access (first time only):**

   ```powershell
   npx convex run users:grantStaff '{"email":"owner@example.com"}' --prod
   ```

   **Windows PowerShell syntax:**

   ```powershell
   npx convex run users:grantStaff '{\"email\":\"owner@example.com\"}' --prod
   ```

6. **Test email system:**
   - Sign in as admin at `https://mbventuresghana.com/admin/emails`
   - Verify banner shows "Live mode" (green)
   - Send a test email
   - Check `info@mbventuresghana.com` inbox

7. **Enable ordering:**
   - Navigate to `/staff` → Customization → Ordering
   - Toggle `ordering_enabled` to ON (no payment details are needed — orders are
     paid at the shop counter or cash on delivery)

### Pre-Launch Verification

- [ ] Domain DNS points to hosting/CDN
- [ ] SSL certificate active
- [ ] `https://mbventuresghana.com` loads the storefront
- [ ] Email system in live mode (not dry-run)
- [ ] Test order end-to-end (paid at pickup or cash on delivery)
- [ ] Staff can access `/staff` and `/admin`
- [ ] Contact form sends to `info@mbventuresghana.com`
- [ ] Password reset emails deliver correctly
- [ ] All product images load
- [ ] Sitemap accessible at `/sitemap.xml`
- [ ] Robots.txt accessible at `/robots.txt`
- [ ] Mobile responsiveness verified on real devices

---

## Email Testing

### Development Testing

Currently configured for `dev:stoic-elephant-714`:

```powershell
# Check dev email mode
npx convex env get WEB3FORMS_ACCESS_KEY
npx convex env get SITE_URL

# Should show:
# - Key: c8395fed-...
# - URL: http://localhost:5173 (dev) OR https://mbventuresghana.com (if set for testing)
```

### Production Testing

```powershell
# Verify production config
npx convex env get WEB3FORMS_ACCESS_KEY --prod
npx convex env get SITE_URL --prod
npx convex env get EMAIL_REPLY_TO --prod

# Should show:
# - Key: c8395fed-...
# - URL: https://mbventuresghana.com
# - Reply: info@mbventuresghana.com
```

### Test Flows

1. **Customer Order Confirmation:**
   - Place order on storefront
   - Check `info@mbventuresghana.com` for forwarded confirmation
   - Verify links point to `mbventuresghana.com`
   - Reply-to should be customer's email

2. **Password Reset:**
   - Click "Forgot password" on `/account`
   - Enter any email (e.g., `test@example.com`)
   - Check `info@mbventuresghana.com` for forwarded reset email
   - Verify reset link: `https://mbventuresghana.com/account?code=...`

3. **Contact Form:**
   - Submit contact form on `/contact`
   - Check `info@mbventuresghana.com` for alert
   - Customer gets acknowledgment at their email

4. **Admin Alerts:**
   - New order triggers admin alert to `info@mbventuresghana.com`
   - Payment confirmation triggers second alert

---

## Troubleshooting

### Email Issues

| Issue                          | Solution                                                     |
| ------------------------------ | ------------------------------------------------------------ |
| Emails not delivering          | Verify `WEB3FORMS_ACCESS_KEY` is set for correct deployment  |
| Links point to localhost       | Update `SITE_URL` to `https://mbventuresghana.com`           |
| Wrong reply-to address         | Update `EMAIL_REPLY_TO` in Convex env                        |
| Admin alerts go to wrong inbox | Update `ADMIN_ALERT_EMAIL` in Convex env                     |
| Daily limit reached            | Increase `EMAIL_DAILY_LIMIT` (max 5000)                      |
| Web3Forms rejection            | Check account status and IP allow-list for server-side calls |

### Domain Issues

| Issue                  | Solution                                    |
| ---------------------- | ------------------------------------------- |
| Canonical URLs missing | Verify `VITE_SITE_URL` in `.env.production` |
| Sitemap 404            | Deploy latest frontend build                |
| Social cards broken    | Check image URLs include full domain        |
| Mixed content warnings | Ensure all assets use `https://`            |

### Build Issues

```powershell
# Clear and rebuild
Remove-Item .output -Recurse -Force
npm run build

# Verify environment
Get-Content .env.production

# Test build locally
npm start
# Visit http://localhost:3000
```

---

## Security Notes

### Environment Variables

- **Never commit** `.env.local` or `.env.prod.local`
- **Never commit** `WEB3FORMS_ACCESS_KEY` or `JWT_PRIVATE_KEY`
- Rotate keys if they leak
- Use `--prod` flag carefully to avoid mixing dev/prod

### Email Security

- Web3Forms access key is server-side only (never exposed to browser)
- One-time codes (`EMAIL_DRY_RUN_LOG_CODES`) should **never** be enabled in production
- Password reset links expire in 60 minutes
- Auth is rate-limited to 5 requests per recipient per hour

---

## Contact Information

**Store Email:** info@mbventuresghana.com  
**Store Phone:** +233 24 000 0000  
**Store Address:** Abelenkpe taxi rank, Accra, Ghana  
**Store Hours:** Monday to Saturday, 8:00 AM to 6:00 PM

**Domain:** mbventuresghana.com  
**Production Deployment:** prod:necessary-newt-861  
**Development Deployment:** dev:stoic-elephant-714

---

## Related Documentation

- **Email System:** `docs/EMAIL.md` - Complete email pipeline documentation
- **Email Setup:** `docs/EMAIL-SETUP-STATUS.md` - Current configuration status
- **Test Accounts:** `docs/TEST-ACCOUNTS.md` - Staff and admin test credentials
- **Progress Log:** `docs/PROGRESS.md` - Recent work and changes
- **Roadmap:** `roadmap.md` - Feature completion tracking
- **Architecture:** `AGENTS.md` - System invariants and rules

---

## Status: Ready for Production ✅

All email and domain configuration is complete. The system is ready to:

- ✅ Send real emails via Web3Forms
- ✅ Use correct domain in all links and metadata
- ✅ Handle 250 emails per day in production
- ✅ Forward all emails to info@mbventuresghana.com
- ✅ Support password resets, order confirmations, contact forms

**Next step:** Deploy to production hosting with DNS pointing to `mbventuresghana.com`
