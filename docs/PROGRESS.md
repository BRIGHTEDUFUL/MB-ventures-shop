# Progress

Running record of work on the storefront. Newest sections at the top; anything
still open is listed under **Open**.

---

## Email system (dry-run first)

**Status:** built, typechecked, linted, covered by tests and verified end to end
in the browser under dry-run. Runs with no Resend account, key or domain
required. See `docs/EMAIL.md` for the full guide.

### Done

- **Configuration** — `convex/emails/config.ts` decides live vs dry-run in one
  place (`getEmailConfig()`), parses `EMAIL_DAILY_LIMIT` (default 100, ceiling
  5000), exposes `emailConfigView()` for the console, and throws at import if
  `EMAIL_DRY_RUN_LOG_CODES=true` is combined with a non-local `SITE_URL`.
- **Transport** — `convex/emails/transport.ts` speaks plain `fetch` to Resend,
  attaches an `Idempotency-Key` from the `emailLogs` row id, retries once after
  ~2s for network errors / 429 / 5xx (never 4xx, `Retry-After` honoured and
  clamped to 15s), and never logs the key or a message body. Because Convex
  actions have no guaranteed timer, the delay comes back as `retryInMs` and the
  caller reschedules.
- **Storage** — `emailLogs` (`queued | sent | failed | skipped_dry_run |
delivered | bounced | complained`), `suppressedEmails` and `webhook_events`
  with their indexes. HTML/text are stored only in dry-run; a daily cron
  (`internal.emails.cleanup`) purges dry-run rows after 14 days, live rows and
  webhook receipts after 90.
- **Pipeline** — `convex/emails/enqueue.ts` applies the daily quota, a 60-second
  dedupe on template + order, recipient validation and the suppression list, and
  never throws. `internal.emails.send` executes, records the outcome and
  reschedules itself for a retry. Everything is scheduled with
  `ctx.scheduler.runAfter(0, internal.emails.send, …)`.
- **Templates** — twelve of them in `convex/emails/templates/` (7 customer,
  3 admin, 2 auth), all rendering through `templates/base.ts` into a shared
  600px inline-CSS HTML body **and** a plain-text twin. Escaped user values,
  `GH₵` money formatting, links built from `SITE_URL`, reset links carrying
  their one-time code, and no emoji / exclamation marks / em dashes.
- **Triggers** — one-liners in `orders.place` and `orders.staffUpdate` via
  `convex/emails/orderTriggers.ts`. They run after the database work, never
  throw, and pick `order-out-for-delivery` or `order-ready-pickup` from the
  order's fulfilment.
- **Auth** — password reset wired through `Password({ reset: … })` on
  `convex/auth.ts`; the emailed link lands on `/account?code=…`, and the flow is
  rate-limited to five messages per recipient per hour.
- **Contact form** — `convex/contact.ts` queues an alert to the shop and an
  acknowledgement to the sender, throttled to five per sender per hour.
- **Webhook** — `POST /resend/webhook` in `convex/http.ts` verifies the Svix
  signature (HMAC-SHA256 over `${id}.${timestamp}.${body}`, base64 secret,
  constant time, ±5 minutes), is idempotent by svix id, flags bounced orders
  with `needs_attention` plus a timeline note, and auto-suppresses complaints.
- **Admin console** — `src/routes/admin/emails.tsx` (linked from the staff nav):
  mode banner, four counters, test-send panel, filterable delivery log with a
  sandboxed Preview dialog (HTML/Text toggle), and the suppression list.
- **Local gallery** — `src/routes/dev/email-preview.tsx` renders every template
  from sample data; `emails.previewDev` refuses outside localhost / dev hosts.
- **Storefront UI** — "Forgot your password?" and the new-password form on
  `/account`, the contact form on `/$page`, and a dismissible
  `needs_attention` banner on the staff order page.
- **Reset links survive Convex Auth** — `ConvexAuthProvider` in `src/router.tsx`
  is given `shouldHandleCode={false}`. Convex Auth reserves `?code=` for OAuth:
  it deletes the parameter from the URL and calls its own `signIn` before React
  renders, which silently ate the one-time code and left `/account` on the
  sign-in form. This shop signs in with email and password only, so nothing
  else needs that handler. Found during the browser pass, not by the tests.
- **Docs** — `.env.example`, `docs/EMAIL.md`, this file.

### Verified

- `npx convex codegen` — clean.
- `npx tsc --noEmit` — clean for this work. (Errors reported in
  `src/components/staff/home-editor.tsx` and `src/routes/staff/customization.tsx`
  belong to a homepage trust-strip feature being written concurrently in this
  tree, not to the email system.)
- `npx eslint .` — 0 errors in this work (7 pre-existing `react-refresh` warnings
  in shared UI components; the 23 reported errors are all in the concurrently
  added home-editor and customization files).
- `npx vitest run` — 123 tests across 8 files, including 22 convex-test cases
  covering dry-run (no `fetch` at all), quota, dedupe, suppression, invalid
  addresses, the auth and contact rate limits, order triggers, the webhook and
  live mode with a mocked transport.
- `npm run build` — succeeds.
- Dev deployment `dev:stoic-elephant-714` has `SITE_URL=http://localhost:5173`
  and **no** `RESEND_*` / `EMAIL_*` variables — dry-run is the live behaviour
  today.
- `npx convex run seed:syncLocation` — pushed the Abelenkpe strings to dev.

### Browser pass (dev server, dry-run)

Every step below left `skipped_dry_run` rows on `/admin/emails`, with the
banner reading **Dry run** and counters matching:

| Step                                  | Rows created                                                      |
| ------------------------------------- | ----------------------------------------------------------------- |
| Contact form on `/contact`            | `contact-received`, `admin-contact-message`                       |
| Sign-up on `/account`                 | account created, signed in                                        |
| Checkout (delivery, MoMo)             | `order-received`, `admin-new-order`                               |
| Staff confirms payment                | `payment-confirmed`, `admin-payment-confirmed`                    |
| Staff dispatches a delivery order     | `order-out-for-delivery` (pickup would pick `order-ready-pickup`) |
| Forgot password → link → new password | `auth-reset-password`; signed in with the new password afterwards |
| Guest tracking on `/track`            | order shows `Dispatched` / payment `Confirmed`                    |

Also confirmed in the browser: the Preview dialog's sandboxed iframe and
HTML/Text toggle, `/dev/email-preview` rendering all twelve templates, and
the location copy reading "Abelenkpe taxi rank, Accra, Ghana".

### Open

- Resend domain verification and the go-live checklist in `docs/EMAIL.md` §8.
- Commit the working tree (everything below is still uncommitted).

---

## Store location rename

**Status:** done across customer-facing surfaces.

"Circle" → "Abelenkpe taxi rank" in routes, components, `src/lib/store.ts`,
`convex/lib/rules.ts`, tests and the README. `convex/seed.ts` gained an
idempotent `seed:syncLocation` internal mutation
(`npx convex run seed:syncLocation`, add `--prod`) that rewrites the three
location strings on `store_settings` when they still carry the old wording.

Remaining "Circle" hits are the project title, the seed's own migration logic
and lucide icon imports — none are customer-facing copy.

---

## Housekeeping

- Installed `convex-test` and `@edge-runtime/vm` as dev dependencies; the
  Convex suites run under `// @vitest-environment edge-runtime`.
- `src/test/setup.ts` now guards its DOM helpers so the same setup file can
  serve both jsdom and edge-runtime tests.
- Pre-existing work in the tree that this pass left untouched:
  `convex/lib/dto.ts` (`historyDTO`) and `src/test/delivery-and-contact-rules.test.ts`.
- A homepage trust-strip feature (`trustIcon` in `convex/schema.ts`,
  `home_trust` in `convex/catalogue.ts`, `convex/seed.ts`,
  `src/routes/staff/customization.tsx`, `PLAN-customization-mobile.md`) was
  being written into this tree while the email work was finishing. It was left
  exactly as found — its files are the ones `tsc` and `eslint` currently report.
- Near the end of the pass `node_modules` lost `@convex-dev/auth`,
  `@convex-dev/react-query`, `@auth/core` and `@fontsource/*` (nothing in
  `package.json` or `package-lock.json` had changed). `npm install` restored
  the declared tree; tests and the build were re-run afterwards.
