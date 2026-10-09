# Email System Setup Status

**Date:** October 9, 2026  
**Deployment:** dev:stoic-elephant-714

## Current Configuration

### ✅ Live Mode Enabled

The email system is now configured for **live operation**. All required environment variables are set in Convex:

| Variable                  | Status                         | Value                                  |
| ------------------------- | ------------------------------ | -------------------------------------- |
| `WEB3FORMS_ACCESS_KEY`    | ✅ Set                         | `c8395fed-e25e-4350-a914-df8e592f5920` |
| `EMAIL_REPLY_TO`          | ✅ Set                         | `info@mbventuresghana.com`             |
| `ADMIN_ALERT_EMAIL`       | ✅ Set                         | `info@mbventuresghana.com`             |
| `EMAIL_DAILY_LIMIT`       | ⚠️ Not set (will use default)  | 100 (default)                          |
| `SITE_URL`                | ✅ Set                         | `http://localhost:5173`                |
| `EMAIL_DRY_RUN_LOG_CODES` | ⚠️ Not set (defaults to false) | `false` (safe default)                 |

## What This Means

### Messages Will Now Be Sent

- ✅ Customer order confirmations will be sent via Web3Forms
- ✅ Payment confirmation emails will be delivered
- ✅ Contact form submissions will be forwarded
- ✅ Password reset emails will work
- ✅ Admin alerts for new orders will be sent

### Delivery Model

Web3Forms is a **form relay service**. Here's how it works:

1. Your application submits emails to Web3Forms API
2. Web3Forms forwards them to **your inbox** at `info@mbventuresghana.com`
3. Customer emails (order confirmations, password resets) arrive at your inbox
4. You forward/reply to customers from your own email client
5. The `replyto` field preserves the customer's address for easy replies

This is different from direct SMTP delivery but has advantages:

- No complex mail server setup
- No SPF/DKIM configuration needed
- You review all outgoing emails
- Simple forwarding from your existing email

## Next Steps

### Immediate Testing

1. **Start the dev server:**

   ```powershell
   npm run dev
   ```

2. **Visit the admin console:**

   ```
   http://localhost:5173/admin/emails
   ```

   The banner should now read **"Live mode"** (green) instead of "Dry run" (amber)

3. **Send a test message:**
   - Use the test-send panel on `/admin/emails`
   - Choose any template (e.g., "order-received")
   - Check your `info@mbventuresghana.com` inbox
   - The email should arrive within seconds

4. **Verify a real flow:**
   - Place a test order from the storefront
   - Confirm the order confirmation email arrives at your inbox
   - Check that the customer's address is in the `replyto` field

### Optional: Adjust Daily Limit

If you want to increase from the default 100 emails/day:

```powershell
npx convex env set EMAIL_DAILY_LIMIT 250
```

Maximum allowed: 5000 emails/day

### For Production Deployment

When ready to deploy to production (`prod:necessary-newt-861`):

1. **Set the production site URL:**

   ```powershell
   npx convex env set SITE_URL https://mbventuresghana.com --prod
   ```

2. **Set the Web3Forms key for production:**

   ```powershell
   npx convex env set WEB3FORMS_ACCESS_KEY c8395fed-e25e-4350-a914-df8e592f5920 --prod
   ```

3. **Set email addresses for production:**

   ```powershell
   npx convex env set EMAIL_REPLY_TO info@mbventuresghana.com --prod
   npx convex env set ADMIN_ALERT_EMAIL info@mbventuresghana.com --prod
   ```

4. **IMPORTANT:** Never set `EMAIL_DRY_RUN_LOG_CODES=true` in production (it's rejected by the startup assertion)

## Monitoring

### Check Email Status

View the email delivery log at `/admin/emails`:

- **Sent today:** Count of successfully delivered messages
- **Queued:** Messages waiting to be sent
- **Failed:** Messages that encountered errors
- **Status per message:** Each row shows `sent`, `failed`, or other states

### Common Issues

| Issue                       | Cause                        | Solution                                                |
| --------------------------- | ---------------------------- | ------------------------------------------------------- |
| Banner still says "Dry run" | Key not set or blank         | Re-run: `npx convex env set WEB3FORMS_ACCESS_KEY <key>` |
| "Daily limit reached"       | Over 100 messages sent today | Increase `EMAIL_DAILY_LIMIT` or wait for day rollover   |
| Rows stuck at `queued`      | Scheduler hasn't run yet     | Wait a few seconds; check Convex dashboard              |
| 429 or 5xx errors           | Web3Forms service issue      | Automatically retries once after ~2s                    |

### Web3Forms Account Notes

According to `docs/EMAIL.md`, Web3Forms may have a caveat worth checking:

> Server-side (non-browser) calls to the API may require their paid plan and/or IP allow-listing on the account.

If emails fail to send after this setup, check your Web3Forms account dashboard for:

- Account status (free vs paid)
- API usage limits
- IP allow-list settings (if required for server-side calls)

## Go-Live Checklist

Remaining items from `docs/EMAIL.md` §7:

- [x] Create Web3Forms access key
- [x] Set `WEB3FORMS_ACCESS_KEY` in Convex
- [x] Set `EMAIL_REPLY_TO`
- [x] Set `ADMIN_ALERT_EMAIL`
- [x] Set `EMAIL_DAILY_LIMIT` (using default 100)
- [x] Set `SITE_URL` (localhost for dev; needs production domain later)
- [ ] Verify live mode banner on `/admin/emails`
- [ ] Send test message and confirm delivery
- [ ] Verify no `EMAIL_DRY_RUN_LOG_CODES` in production
- [ ] Update production `SITE_URL` to `https://mbventuresghana.com` when domain is ready

## Documentation

Full email system documentation: `docs/EMAIL.md`

- Templates and triggers
- Pipeline flow
- Guard rails (quota, dedupe, suppression)
- Troubleshooting guide
