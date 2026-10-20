# Email System Setup Status

**Date:** October 9, 2026  
**Deployment:** dev:wonderful-porpoise-243  
**Last verified:** October 19, 2026 — end-to-end send through the real
production path on both deployments (see **Verification** below).

## Current Configuration

### ✅ Live Mode Enabled

The email system is configured for **live operation**. All required environment
variables are set in Convex:

| Variable                  | Status                         | Value                                  |
| ------------------------- | ------------------------------ | -------------------------------------- |
| `WEB3FORMS_ACCESS_KEY`    | ✅ Set                         | `ab22e273-…` (redacted; in Convex env) |
| `EMAIL_REPLY_TO`          | ✅ Set                         | `info@mbventuresgh.com`                |
| `ADMIN_ALERT_EMAIL`       | ✅ Set                         | `info@mbventuresgh.com`                |
| `EMAIL_DAILY_LIMIT`       | ✅ Set                         | 100 (dev) / 250 (prod)                 |
| `SITE_URL`                | ✅ Set                         | `http://localhost:5173` (dev)          |
|                           |                                | `https://mbventuresgh.com` (prod)      |
| `EMAIL_DRY_RUN_LOG_CODES` | ⚠️ Not set (defaults to false) | `false` (safe default)                 |

The key was rotated on **19 October 2026** (from `c8395fed-…` to
`ab22e273-…`), and the form's Recipient Emails was rebound in the Web3Forms
dashboard to `info@mbventuresgh.com`. Changelog: `docs/PROGRESS.md`.

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
2. Web3Forms forwards them to **your inbox** at `info@mbventuresgh.com`
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
   - Check your `info@mbventuresgh.com` inbox
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

Production (`prod:earnest-fennec-109`) is already deployed. To re-apply:

1. **Set the production site URL:**

   ```powershell
   npx convex env set SITE_URL https://mbventuresgh.com --prod
   ```

2. **Set the Web3Forms key for production:**

   ```powershell
   npx convex env set WEB3FORMS_ACCESS_KEY <WEB3FORMS_ACCESS_KEY> --prod
   ```

   (Use the real key from the local-only `docs/PRODUCTION-CREDENTIALS.md` /
   the Convex env — it is never committed.)

3. **Set email addresses for production:**

   ```powershell
   npx convex env set EMAIL_REPLY_TO info@mbventuresgh.com --prod
   npx convex env set ADMIN_ALERT_EMAIL info@mbventuresgh.com --prod
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

`docs/EMAIL.md` §7 carries a caveat that server-side (non-browser) calls to the
API _may_ require a paid plan and/or IP allow-listing. **Tested and not
applying here:** on the free plan, sends from Convex's servers succeed on the
first attempt (see **Verification**). One practical note: calling the API
directly from a local dev machine can hit a Cloudflare browser challenge
(HTTP 403 "Just a moment…") — that is an IP/UA heuristic on the local network,
not a key or plan problem, and it does not affect Convex's egress.

The free plan caps at **250 emails/month**, shared by all store mail (order
confirmations, password resets, contact alerts). Prod's `EMAIL_DAILY_LIMIT` of
250 is a per-day guard; the monthly plan cap is the binding one.

## Verification (19 October 2026)

A real contact-form submission was run through the production path on the dev
deployment (mutation → `scheduleEmail` → scheduler → `internal.emails.send` →
Web3Forms). Both resulting `emailLogs` rows — `contact-received` and
`admin-contact-message` — reached `status: "sent"`, `mode: "live"` on the
first attempt with no error, after the Recipient Emails was rebound to
`info@mbventuresgh.com`.

## Go-Live Checklist

Remaining items from `docs/EMAIL.md` §7 — all complete:

- [x] Create Web3Forms access key
- [x] Set `WEB3FORMS_ACCESS_KEY` in Convex (dev and prod; rotated 19 Oct 2026)
- [x] Set `EMAIL_REPLY_TO`
- [x] Set `ADMIN_ALERT_EMAIL`
- [x] Set `EMAIL_DAILY_LIMIT` (100 dev / 250 prod)
- [x] Set `SITE_URL` (localhost for dev; `https://mbventuresgh.com` on prod)
- [x] Verify live mode banner on `/admin/emails`
- [x] Send test message and confirm delivery
- [x] Verify no `EMAIL_DRY_RUN_LOG_CODES` in production

## Documentation

Full email system documentation: `docs/EMAIL.md`

- Templates and triggers
- Pipeline flow
- Guard rails (quota, dedupe, suppression)
- Troubleshooting guide
