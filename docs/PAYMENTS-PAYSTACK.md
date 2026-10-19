# Paystack online payments — design & operations

**Status: LIVE on production (19 October 2026).** Checkout can take money
online through [Paystack](https://paystack.com) while the pay-on-delivery /
pay-at-shop options stay available. The go-live record (secret key on the
production deployment, staff switch on, dashboard callback + webhook URLs,
live smoke test) is in §4.

---

## 1. Shape of the feature

- **Paystack sits alongside offline payment**, it does not replace it.
  Checkout step 2 offers "Pay online now" only when the store settings switch
  (`store_settings.paystack_enabled`) is on; the default is off, so every
  existing flow, test and email behaves exactly as before.
- **Outside Accra, delivery is prepay-only.** A checkout with
  `zone: "nationwide"` + `fulfillment: "delivery"` refuses
  `payment: "offline"` — in the UI (the cash option is withdrawn and the
  choice moves to "Pay online now") and authoritatively in `orders.place`
  via `offlinePaymentProblem` (`convex/lib/rules.ts`). Accra
  (`central`/`greater`) delivery and shop pickup keep cash-on-delivery and
  pay-at-shop. Counter orders (`orders.staffCreate`) are exempt: the sale
  is already happening in person.
- **The gateway is configured entirely by environment.** While
  `PAYSTACK_SECRET_KEY` is unset the backend refuses to start a payment with a
  clear message — same dry-run philosophy as Web3Forms email. No code changes
  are needed to go live.
- **Money maths never leaves the server.** `orders.place` recomputes prices,
  fees and the total; the amount handed to Paystack is derived from that total
  (in pesewas), and `charge.success` is only accepted when the verified amount
  equals the amount we asked Paystack for.

## 2. Payment flow (order-first, stock-safe)

```
checkout ──► orders.place(payment:"online")     creates order, reserves stock,
            │                                   payment_method:"paystack",
            │                                   payment_status:"pending",
            │                                   payment_amount_pesewas locked
            ▼
      payments.initialize (action)              POST /transaction/initialize
            │                                   stores access_code + authorization_url
            ▼
      browser → Paystack hosted page            card / MoMo / bank / USSD
            │
            ├── returns to /paystack/return?reference=MB-…
            ▼
      payments.verify (action)                  GET /transaction/verify/:ref
            │                                   amount + currency + status checked
            ▼
      internal.payments.markPaid                payment_status:"confirmed",
                                                provider, channel, paid_at,
                                                payment-confirmed emails

      Paystack webhook POST /webhooks/paystack  (authoritative fallback when the
                                                browser never comes back)
```

Why order-first: stock is held the instant the shopper commits, exactly like a
cash order, so a slow card/MoMo authorisation cannot oversell. If starting the
payment fails, `payments.abandon` cancels the order and returns the stock in
the same breath.

Safety nets:

- **Abandoned payments**: a cron (`internal.payments.expireStale`, every 15 min)
  cancels `paystack` orders still pending after `PAYSTACK_PENDING_MINUTES`
  (default 60) and releases their stock. Payment still pending at that point
  always means "never completed" — a completed charge is confirmed by the
  return page or the webhook within seconds.
- **Back button / double submit**: `orders.place` supersedes the shopper's own
  older unpaid `paystack` order (cancels it, stock returned, no email) before
  creating a new one, so retries cannot pile up duplicate holds.
- **Idempotency**: `markPaid` refuses anything but `pending → confirmed` once;
  stock operations carry `operation_key`s, so webhook + return-page racing can
  confirm the order exactly once and never double-move stock.

## 3. What each piece does

| Piece                                                                 | Role                                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `convex/lib/paystack.ts`                                              | Pure helpers: pesewas conversion, Web-Crypto HMAC-SHA512 webhook signature check, defensive parsing of Paystack responses, amount/currency/reference matching. No Convex imports — unit-testable.                              |
| `convex/lib/orderCancel.ts`                                           | The one way an unpaid order is auto-cancelled: guard (`pending` + `received` only), stock release, history note, optional email. Used by supersede, expiry and init-failure rollback.                                          |
| `convex/payments.ts`                                                  | `initialize` (action), `verify` (action), `status` (public query by reference), `orderForPayment` (auth-guarded query), `markPaid` / `recordInit` / `abandon` / `expireStale` (internal), `paystackWebhook` (httpAction).      |
| `convex/http.ts`                                                      | Registers `POST /webhooks/paystack`.                                                                                                                                                                                           |
| `convex/crons.ts`                                                     | Registers the 15-minute expiry sweep.                                                                                                                                                                                          |
| `convex/orders.ts`                                                    | `place` gains optional `payment: "online" \| "offline"` (default offline). Online requires the settings switch, sets `payment_method:"paystack"`, locks `payment_amount_pesewas`, supersedes the shopper's stale unpaid order. |
| `src/routes/checkout.tsx`                                             | Step 2 payment choice (online vs offline) when enabled; online redirects to Paystack after placing the order. Cart clears only after verified payment.                                                                         |
| `src/routes/paystack/return.tsx`                                      | Landing page after Paystack: runs `payments.verify`, stores the receipt, clears the cart, jumps to `/confirmation`. Polls a few times while the charge settles.                                                                |
| `src/components/staff/home-editor.tsx`                                | "Accept online payments (Paystack)" switch in Ordering pane.                                                                                                                                                                   |
| `src/routes/staff/orders/$id.tsx`, `src/components/order-receipt.tsx` | Paystack-aware labels (method, channel, paid-at).                                                                                                                                                                              |
| `convex/emails/templates/*`                                           | `paystack` label + wording that stops telling Paystack customers to "pay the courier in cash".                                                                                                                                 |

New order fields (all optional, so every existing row keeps validating):
`payment_method` may now be `"paystack"`; `orders` gained
`paystack_access_code`, `paystack_authorization_url`, `payment_amount_pesewas`,
`paid_at`, `payment_channel`, `paystack_transaction_id`.

## 4. Configuration — done, live 19 October 2026

**Production go-live record (19 Oct 2026):**

1. Secret on the production deployment (set via CLI only — never written to a
   repo file):
   `npx convex env set PAYSTACK_SECRET_KEY sk_live_… --env-file .env.prod.local`
2. Staff switch on: `/staff → Customization → Ordering` → **Accept online
   payments (Paystack)** ticked → saved (verified server-side:
   `store:get` → `paystack_enabled: true`).
3. Paystack dashboard (Developers → API configuration, Live mode):
   - **Live callback URL** → `https://mbventuresgh.com/paystack/return`
   - **Live webhook URL** → `https://necessary-newt-861.convex.site/webhooks/paystack`
4. Smoke test: a live `POST /transaction/initialize` (GH₵1, GHS, the callback
   URL above) returned an authorization URL — key, currency and callback all
   accepted. The webhook route answers **401** to unsigned bodies (it answered
   503 only while the key was unset).

The same procedure with a `sk_test_…` key (no `--env-file`) sets up the dev
deployment. When `SITE_URL` is an https origin the backend also passes
`callback_url` on every initialisation; localhost is left to the dashboard
default because Paystack does not accept http callbacks.

The webhook endpoint is the Convex HTTP route
`<CONVEX_SITE_URL>/webhooks/paystack` (production:
`https://necessary-newt-861.convex.site/webhooks/paystack`) — registered in
the Paystack dashboard so payments confirm even when a shopper's browser never
returns. It verifies `x-paystack-signature` before believing anything.

Environment variables (documented in `.env.example`):

| Variable                   | Meaning                                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `PAYSTACK_SECRET_KEY`      | Server-only secret (`sk_test_…` / `sk_live_…`). Never logged, never sent to the browser. Absent → online payment refuses to start. |
| `PAYSTACK_PENDING_MINUTES` | Minutes an unpaid online order is held before the cron cancels it and returns stock. Default 60.                                   |

## 5. Invariants (do not break)

1. **Amount lock.** The pesewas amount stored on the order at placement is the
   only amount a charge can be confirmed against. A verified charge whose
   amount, currency (`GHS`) or reference does not match is refused.
2. **Webhook authenticity.** `x-paystack-signature` must be a valid
   HMAC-SHA512 of the raw body with the secret; unsigned or badly signed
   bodies get 401 and no mutation.
3. **Only `pending → confirmed`.** Staff can still confirm a payment by hand
   (missed webhook), and a cancelled order can never be resurrected by a late
   `charge.success` — `markPaid` refuses it, so stock stays honest.
4. **Stock still has one door.** Every hold/return in this feature goes through
   `applyStockChange` with operation keys.
5. **The secret never leaves the server.** No Paystack call is made from the
   browser; the client only receives an `authorization_url` to redirect to.
6. **Nationwide delivery never ships unpaid.** `orders.place` refuses
   `payment: "offline"` for `zone: "nationwide"` + delivery
   (`offlinePaymentProblem`) and checkout withdraws the cash choice — a
   long-haul courier order is always prepaid. Counter orders are exempt.

## 6. Testing locally (before any deploy)

- Unit/flow tests: `npm test` → `src/test/paystack.test.ts` (signatures,
  parsing, amount matching) and `src/test/payments-flow.test.ts` (order
  creation, supersede, markPaid idempotency + refusals, expiry).
- Manual: set a **test** key on the dev deployment, flip the staff switch, buy
  with Paystack's test instruments (card `4084 0840 8408 4081`, any future
  expiry, CVV `408`, PIN `0000`, OTP `123456`; mobile money is simulated).
- No key yet? The return page can be driven directly:
  `/paystack/return?reference=MB-…` will verify an existing pending order and
  report honestly.
