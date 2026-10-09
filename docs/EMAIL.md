# Email

The store sends mail through Resend, but it is built to work — and be testable —
**before any Resend account exists**. Until `RESEND_API_KEY` and `EMAIL_FROM` are
both set, every message is rendered, stored and shown in the admin console, and
nothing leaves the server. Adding those two variables is the only step needed to
go live; there is no code to change.

---

## 1. Modes

|                                 | Dry-run (today)                  | Live                                                       |
| ------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| `RESEND_API_KEY` + `EMAIL_FROM` | at least one missing             | both set                                                   |
| Network request                 | never made                       | POST to `https://api.resend.com/emails`                    |
| `emailLogs.mode`                | `dry-run`                        | `live`                                                     |
| Stored copy of the message      | `html` + `text` kept for preview | dropped — only the provider id survives                    |
| `emailLogs.status`              | `skipped_dry_run`                | `queued` → `sent` → `delivered` / `bounced` / `complained` |
| Shown on `/admin/emails`        | amber banner                     | green banner                                               |

Mode is decided in exactly one place, `getEmailConfig()` in
`convex/emails/config.ts`. Nothing else in the backend is allowed to guess.

## 2. Environment variables

Read at runtime by Convex (set them with `npx convex env set NAME value`, or
through the dashboard). See `.env.example` for the template.

| Name                      | Required    | Default               | Purpose                                                                                                                                            |
| ------------------------- | ----------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`          | for live    | –                     | Resend secret key. Dropped from the config entirely while dry-run, so it cannot leak.                                                              |
| `EMAIL_FROM`              | for live    | –                     | Sender, e.g. `MB Ventures GH <info@mbventures.test>`. The local part stays `info@mbventures` — do not pair it with a domain you have not paid for. |
| `EMAIL_REPLY_TO`          | no          | store contact address | `reply_to` on every message                                                                                                                        |
| `ADMIN_ALERT_EMAIL`       | no          | store contact address | Where staff alerts and the contact-form alert go                                                                                                   |
| `EMAIL_DAILY_LIMIT`       | no          | `100`                 | Messages per calendar day, per deployment. Unusable values fall back to the default; the ceiling is 5000.                                          |
| `RESEND_WEBHOOK_SECRET`   | no          | –                     | Svix signing secret for `POST /resend/webhook`. Empty disables the route (404).                                                                    |
| `EMAIL_DRY_RUN_LOG_CODES` | no          | `false`               | Store one-time auth codes in `emailLogs` for local debugging.                                                                                      |
| `SITE_URL`                | recommended | `CONVEX_SITE_URL`     | Origin every link is built from. Also gates the preview gallery and the startup assertion below.                                                   |

**Startup assertion.** If `EMAIL_DRY_RUN_LOG_CODES` is `true` while `SITE_URL` is
neither localhost nor a Convex dev host, `convex/emails/config.ts` throws at
import time. One-time password codes must never sit in production logs.

## 3. What gets sent

Twelve templates live in `convex/emails/templates/`, each exporting
`render(data, ctx)`. They all flow through `templates/base.ts`, which turns one
list of typed blocks into **both** a 600px, table-based, inline-CSS HTML body and
a plain-text alternative — a message can never ship without its text twin.

| Group    | Template                  | Trigger                               |
| -------- | ------------------------- | ------------------------------------- |
| customer | `order-received`          | `orders.place`                        |
| customer | `payment-confirmed`       | staff confirms payment                |
| customer | `order-ready-pickup`      | pickup order → `ready`                |
| customer | `order-out-for-delivery`  | delivery order → `dispatched`         |
| customer | `order-completed`         | order → `completed`                   |
| customer | `order-cancelled`         | order → `cancelled`                   |
| customer | `contact-received`        | contact form acknowledgement          |
| admin    | `admin-new-order`         | `orders.place`                        |
| admin    | `admin-payment-confirmed` | staff confirms payment                |
| admin    | `admin-contact-message`   | contact form alert                    |
| auth     | `auth-reset-password`     | "Forgot your password?" on `/account` |
| auth     | `auth-verify-email`       | reserved for email verification       |

House rules for copy: no emojis, no exclamation marks, no em dashes, sentence
case, user-supplied values escaped, money in the order's currency
(`GH₵ 1,234.00`), every link built from `SITE_URL`, guest/reset links carry
their one-time token.

Triggers are one-liners inside `orders.place` and `orders.staffUpdate` (see
`convex/emails/orderTriggers.ts`). They run _after_ the database work, never
throw, and always schedule with `ctx.scheduler.runAfter(0, internal.emails.send,
…)` — an email problem can never roll an order back.

## 4. The pipeline

```
caller ──► scheduleEmail() ──► emailLogs row (queued) ──► scheduler
              │                                            │
              ├─ suppression check                     internal.emails.send
              ├─ rate limit / daily quota                  │
              ├─ 60s dedupe (template + order)             ├─ dry-run → skipped_dry_run
              └─ recipient validation                      └─ live → fetch, retry once
```

`convex/emails/enqueue.ts` owns every "should this go out?" decision and never
throws; a refusal comes back as `{ logId, skipped }` or as a `failed` row with
the reason attached.

`convex/emails/transport.ts` owns the wire: plain `fetch`, an
`Idempotency-Key` built from the `emailLogs` row id, one retry after ~2s for
network errors / 429 / 5xx (never for 4xx, and `Retry-After` wins, clamped to
15s). Convex actions have no guaranteed timer, so the transport returns
`retryInMs` and the action reschedules itself instead of sleeping. The API key
and message bodies are never written to a log.

### Statuses

`queued`, `sent`, `failed`, `skipped_dry_run`, `delivered`, `bounced`,
`complained`.

### Retention

`internal.emails.cleanup` runs every 24 hours: dry-run rows older than 14 days
and live rows older than 90 days are deleted, along with webhook receipts older
than 90 days. HTML/text survive only while a row does, so a live row never keeps
a copy of a message.

## 5. Guard rails

- **Daily quota** — counted from today's `queued`/`sent`/`delivered`/
  `bounced`/`complained`/`skipped_dry_run` rows. Over the limit the row is
  written as `failed` with `Daily email limit reached (N)` and the order still
  succeeds.
- **Dedupe** — the same template for the same order inside 60 seconds resolves
  to the existing row instead of sending twice.
- **Auth rate limit** — five messages per recipient per hour across the auth
  templates; a sixth raises `ConvexError("Too many reset requests…")`.
- **Contact throttle** — five messages per sender address per hour.
- **Suppression** — `suppressedEmails`. A complaint from Resend adds the address
  automatically; an admin can add or remove entries on `/admin/emails`. Nothing
  is ever transmitted to a suppressed address.
- **Access** — `/admin/emails` and every console query/mutation require the
  `admin` role (`lib/auth.requireAdmin`), and the interesting ones write to the
  activity log.

## 6. Webhook

`POST /resend/webhook` in `convex/http.ts`.

- 404 when `RESEND_WEBHOOK_SECRET` is unset.
- Svix scheme: HMAC-SHA256 over `${id}.${timestamp}.${rawBody}` with the
  base64-decoded secret (`whsec_` prefix stripped), compared in constant time,
  rejected outside a ±5-minute window.
- Idempotent by svix id (`webhook_events`).
- `email.bounced` → `emailLogs.status = bounced`, the order gains
  `needs_attention: "Customer email bounced"` and a timeline note; staff dismiss
  it from the order page (or `emails.clearAttention`).
- `email.complained` → `bounced`/`complained` plus an automatic suppression.
- Anything else is acknowledged and ignored.

## 7. Working with it

### `/admin/emails`

Mode banner, four counters (sent today / queued / dry-run / failed), a test-send
panel that pushes a chosen template through the real delivery path, the filterable
delivery log, and the suppression list. Every row opens a **Preview** dialog:
HTML renders in a sandboxed iframe (`sandbox=""`, `srcDoc`) with an HTML/Text
toggle, so nothing executes in the page's origin.

### `/dev/email-preview`

Local-only gallery of all twelve templates rendered from sample data, with the
same HTML/Text toggle. `emails.previewDev` answers `allowed: false` unless
`SITE_URL` is localhost or a dev-shaped host, so production sees a dead end
rather than a catalogue of templates.

### Tests

```bash
npm test
```

| File                               | Covers                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/test/email-config.test.ts`    | mode detection, daily-limit parsing, localhost/dev detection, the startup assertion                                            |
| `src/test/email-transport.test.ts` | dry-run never fetches, live payload shape, retry rules, `Retry-After`, no key/body in errors or logs                           |
| `src/test/email-templates.test.ts` | all 12 templates render, reference/totals, delivery vs pickup, `<script>` escaping, text twin, copy rules                      |
| `src/test/email-webhook.test.ts`   | Svix signature accept/reject, timestamp window, event parsing                                                                  |
| `src/test/email-pipeline.test.ts`  | convex-test end to end: dry-run, quota, dedupe, suppression, invalid addresses, auth limit, order triggers, webhook, live mode |

The Convex suites run under `// @vitest-environment edge-runtime` and mock
`fetch`, so nothing reaches the network in either mode.

## 8. Going live

1. Verify a domain you actually control in Resend (SPF/DKIM/DMARC as Resend
   asks). Do not reuse a domain you have not paid for.
2. `npx convex env set RESEND_API_KEY <key>` (dev first: `npx convex env set
--dev RESEND_API_KEY <key>`).
3. `npx convex env set EMAIL_FROM "MB Ventures GH <info@yourdomain.com>"`.
4. Set `EMAIL_REPLY_TO`, `ADMIN_ALERT_EMAIL` and `EMAIL_DAILY_LIMIT`.
5. Open `/admin/emails` — the banner must now read **Live mode**. If it still
   says dry-run, one of the two variables is missing or blank.
6. Send a test message from the console and confirm the row reaches `sent`
   with a provider id, and that no `html`/`text` was kept.
7. Add the webhook: endpoint `<CONVEX_SITE_URL>/resend/webhook`, copy the
   signing secret to `npx convex env set RESEND_WEBHOOK_SECRET <secret>`, and
   confirm `webhookEnabled` is on in the banner.
8. Trigger one bounce (Resend's test address) and check the order timeline and
   the `needs_attention` flag.
9. Leave `EMAIL_DRY_RUN_LOG_CODES` unset in production.

## 9. Troubleshooting

| Symptom                                     | Likely cause                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| Banner says dry-run after setting variables | One of `RESEND_API_KEY` / `EMAIL_FROM` is blank — both are required.       |
| Preview gallery refuses to open             | `SITE_URL` is not localhost or a dev host (expected in production).        |
| Rows stuck at `queued`                      | The scheduler has not run, or a retry was scheduled for `retryInMs` later. |
| `Daily email limit reached (N)`             | Raise `EMAIL_DAILY_LIMIT`, or wait for the calendar day to roll over.      |
| `Recipient is suppressed`                   | Remove the address on `/admin/emails`.                                     |
| Webhook returns 404                         | `RESEND_WEBHOOK_SECRET` is unset on the deployment.                        |
| Webhook returns 401                         | Secret mismatch, or a clock more than five minutes out.                    |
| Reset link lands on the sign-in form        | `shouldHandleCode` was removed from `ConvexAuthProvider` — Convex Auth     |
|                                             | reserves `?code=` for OAuth and strips it before React renders, so the     |
|                                             | one-time code never reaches `/account`.                                    |
| New password rejected after a successful    | The code expired (60 minutes) or was already used — ask for a fresh link.  |
| reset                                       |                                                                            |
