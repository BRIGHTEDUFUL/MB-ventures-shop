# Test accounts

Sign-in credentials for the staff/admin accounts used to exercise `/staff` and
`/admin`. Nothing seeds a user: `convex/seed.ts` writes store settings, products
and the contact address only, so **every account comes from signing up in the
app** and gaining privileges from a `user_roles` row afterwards. A user with no
role row is a plain customer.

Verified against both deployments on **2026-10-09**.

---

## 1. Development — `dev:stoic-elephant-714`

Storefront: `http://localhost:5173` (`npm run dev`).

| Email                                 | Role     | Password        | Notes                                   |
| ------------------------------------- | -------- | --------------- | --------------------------------------- |
| `e2e.staff@example.com`               | `admin`  | `E2eStaff!2026` | The live-e2e account. Sign-in verified. |
| `e2e.shopper.<timestamp>@example.com` | customer | `Shopper!2026`  | One per `test:e2e:live` run (4 exist).  |
| `smoke-test@example.com`              | `admin`  | unknown         | Ad-hoc test signup; see §5 to recover.  |
| `hub-tester@example.com`              | `admin`  | unknown         | Ad-hoc test signup.                     |
| `qa.staff@example.com`                | `admin`  | unknown         | Ad-hoc test signup.                     |
| `ama+e2e@example.com`                 | `admin`  | unknown         | Ad-hoc test signup.                     |
| `staff.qa@example.com`                | `admin`  | unknown         | Ad-hoc test signup.                     |
| `smoke-test2@example.com`             | customer | unknown         |                                         |

The two known passwords are the ones recorded in `e2e/purchase.spec.ts`
(`STAFF_PASSWORD` / the shopper sign-up fill). `E2E_STAFF_PASSWORD` overrides the
staff default when set — no `.env*` file sets it today, so the default stands.

## 2. Production — `prod:necessary-newt-861`

Storefront: `https://mbventuresghana.com`.

| Email                           | Role    | Password                         | Notes                                        |
| ------------------------------- | ------- | -------------------------------- | -------------------------------------------- |
| `manager@mbventuresghana.com`   | `admin` | `MBVentures2025!Manager#Admin`   | New Store Manager (Full admin rights)        |
| `attendant@mbventuresghana.com` | `staff` | `MBVentures2025!Attendant#Staff` | New Shop Attendant (Orders & inventory)      |
| `admin@mbventuresghana.com`     | `admin` | `MBVentures2025!Admin#Secure`    | Full store admin (MoMo settings, team, fees) |
| `staff@mbventuresghana.com`     | `staff` | `MBVentures2025!Staff#Secure`    | Store staff (orders, products, inventory)    |
| `e2e.staff@example.com`         | `admin` | `E2eStaff!2026`                  | E2E test admin account                       |
| `smoke-prod@example.com`        | `admin` | unknown                          |                                              |

Sign in at `/account` (or `/login`, `/auth/signin`). When signed in with staff or admin privileges, the account page shows a direct **Store staff hub** button linking to `/staff` (and `/admin` automatically redirects to `/staff`).

To provision additional staff/admin accounts:

1. Sign up normally at `/account` (or `/signup`) — name, phone, email, password.
2. Grant staff or admin:

   ```powershell
   npx convex run users:grantStaff '{\"email\":\"you@example.com\",\"role\":\"admin\"}' --prod
   ```

   Omit `role` for default `admin`, or specify `\"role\":\"staff\"` for standard staff permissions. Omit `--prod` for development.

## 3. Verifying a password

`auth:signIn` is the same public action the browser calls, so it is the
definitive check — it either returns session tokens or throws
"Invalid email or password":

```powershell
npx convex run auth:signIn '{\"provider\":\"password\",\"params\":{\"flow\":\"signIn\",\"email\":\"admin@mbventuresghana.com\",\"password\":\"MBVentures2025!Admin#Secure\"}}' --prod
```

The returned tokens are short-lived and session-scoped: never paste them into a ticket, doc or log.

## 4. Listing who exists

Roles and addresses only — never dump the `users` table raw, it carries password
hashes:

```powershell
npx convex run --inline-query 'await (async () => { const users = await ctx.db.query(\"users\").collect(); const roles = await ctx.db.query(\"user_roles\").collect(); const byId = new Map(roles.map((r) => [r.user_id, r.role])); return users.map((u) => ({ email: u.email, name: u.name, role: byId.get(u._id) ?? \"customer\" })); })()' --prod
```

## 5. Recovering an unknown password

Hashes only are stored, so a password not written down here is gone. Two ways
back:

- **Reset it.** Use "forgot password" in the app for the address in question.
  The mail really sends (Web3Forms is live), and because the relay forwards
  every submission to the single inbox bound to the access key, the reset link
  arrives in **`info@mbventuresghana.com`** regardless of the `to` address.
  Auth mail is limited to 5 per recipient per hour; duplicate requests inside
  60 seconds are deduped.
- **Make a new one.** Sign up a fresh address, then `users:grantStaff` it (§2).

## 6. Role Details

- **`users:grantStaff`** defaults to `admin`, but accepts an optional `role: "admin" | "staff"`. It creates or updates the user's role in `user_roles`.
- Privileges can also be managed and fine-tuned from `/staff` → **Team**.
- Grant roles only after the account exists: `grantStaff` looks the user up by
  email and fails if they have never signed up.

> These are throwaway test credentials for a demo shop, which is the only reason
> they are written down in a tracked file. The owner's real account must use a
> unique password that appears nowhere in this repository — and `E2eStaff!2026`
> / `Shopper!2026` must never be reused outside testing.
