# Inventory — decisions

A running log of choices made while building the inventory system, so a later
reader can see _why_ the code is shaped this way rather than guessing. Anything
with a real trade-off lands here; anything obvious stays in the code comment
next to it.

Format: **Context** → **Decision** → **Alternative rejected** → **Consequence**.

---

## D1 — `products.stock` means _available_, not _on hand_

**Context.** The audit (defect C3) showed five call sites writing `stock`
directly, with `orders.place` decrementing it and `orders.staffUpdate` adding it
back only on cancellation. Absolute writes from the product editor therefore
raced reservations: open an editor before an order lands, save afterwards, and
the order's units reappear on the shelf.

**Decision.** Keep `products.stock` as the number of units an order may take
_right now_, and add an optional `products.reserved` for units an open order is
holding. **On hand = `stock + reserved`.**

- `reserve` (order placed): `stock −q`, `reserved +q` → on hand unchanged.
- `commit` (dispatched/completed): `reserved −q` → the shelf loses the units.
- `release` (cancelled before dispatch): `stock +q`, `reserved −q` → the hold
  is handed back.
- `restock` (cancelled _after_ dispatch): `stock +q` → goods received back.
- `adjust` / `set_on_hand`: the editor and stocktake count the **shelf**, so
  `set_on_hand` computes `available = counted − reserved` and refuses to go
  negative instead of quietly stripping an order.

**Alternative rejected.** Rename `stock` → `on_hand` and derive available. It
reads better in isolation but changes the meaning of every existing row, the
storefront, `stats.low_stock` and every test assertion at once — a large,
hard-to-reverse rename with no behavioural gain.

**Consequence.** All new fields are optional, so existing rows validate with no
backfill. Storefront still reads `stock`, which is exactly what a shopper needs
("4 available"). Staff screens must say **on hand** = `stock + reserved`, and
the reserved split shows separately.

## D2 — one choke point, enforced by a test rather than by review

**Context.** Defect C1: five hand-rolled `read → patch → recordStockChange`
sequences, each with its own reason string, and nothing preventing a sixth.

**Decision.** `applyStockChange(ctx, change)` in `convex/lib/stock.ts` owns every
write to `products.stock` / `products.reserved` _and_ every insert into
`inventory_history`. `src/test/stock-single-writer.test.ts` scans the `convex/`
sources and fails if any other file patches those fields, inserts a product row
with a non-zero opening count, or writes a ledger row directly.

**Alternative rejected.** Rely on convention + code review. Rejected because the
failure mode is invisible until the numbers stop reconciling, which is exactly
when it becomes expensive.

**Consequence.** A movement row exists _if and only if_ a count moved, so the
movement log can never disagree with the product screen. Opening stock for a
new product is written as `insert(…, stock: 0)` followed by a `set_on_hand`
movement — the first count is auditable like any other.

## D3 — typed errors, additive to what the UI already reads

**Context.** Inventory failures were plain `ConvexError({ message })`, so the
browser could only string-match. The spec asks for branchable codes (conflict,
insufficient stock, duplicate SKU).

**Decision.** `fail(code, message, details?)` in `convex/lib/errors.ts` throws
`ConvexError({ code, message, details })`. `errorMessage()` in
`src/lib/store.ts` keeps reading `data.message`, so nothing changes visually.

Codes: `VALIDATION_FAILED | PERMISSION_DENIED | NOT_FOUND | STOCK_INSUFFICIENT |
VERSION_CONFLICT | DUPLICATE_SKU | APPROVAL_REQUIRED | STATE_CONFLICT`.

**Alternative rejected.** A new error class or a separate `details` envelope —
would break every existing `expectConvexError(..., /regex/)` assertion.

**Consequence.** Asserted message strings stay byte-identical (e.g.
`` `Stock cannot go below zero — only ${n} on hand.` ``), tests keep passing,
and new screens can branch on `code` instead of matching prose.

## D4 — payment rejection does **not** release reserved stock

**Context.** When a MoMo payment is rejected or expires, the units are still
held by the order, which stays open awaiting another payment attempt.

**Decision.** `rejected` does **not** auto-release. Release happens only when a
staff member cancels the order (`staffUpdate` → `cancelled`). This deviates
from the "release on failure" instinct on purpose: auto-releasing on a payment
hiccup puts the units back on the shelf while the customer can still re-confirm,
and the next order can then oversell the same shelf.

**Alternative rejected.** Release on `rejected`, re-reserve on re-confirm.
Rejected because re-reservation can fail once another customer has taken the
units — the customer gets a "sold out" _after_ paying attention, and the order
ends up in an unrepresentable state.

**Consequence.** Reserved counts can outlive a rejected payment until staff
act. That is visible and correct: the shop still intends to fill the order.

## D5 — an order records what already happened to its units

**Context.** Cancelling an order must give stock back exactly once. Legacy rows
predating the reservation model have no such marker, and an order can be moved
through several statuses.

**Decision.** `orders.stock_state` ∈ `reserved | committed | released |
restocked`, written in the _same transaction_ as the stock movement. Missing
field (legacy) is inferred from status with the rule the migration backfills:
cancelled → `released`, dispatched/completed → `committed`, otherwise
`reserved`. Transitioning out of a terminal state never moves stock again.

**Consequence.** Double-cancel, cancel-after-dispatch, and status flips are all
idempotent with respect to stock; no path can return the same units twice.

## D6 — idempotency where it matters, not everywhere

**Context.** Double-submit (audit H1/H2): a double tap on _Adjust_ applies a
delta twice.

**Decision.** `inventory.adjust` accepts a client `operation_key`; a repeat
returns the current numbers without a second movement. Absolute sets
(`set_on_hand`) are idempotent by construction and take **no** key — deriving a
key from the content would wrongly skip a legitimate later run after sales
moved the number. `orders.place` and `orders.staffUpdate` key on
`reference` + `slug`, which is naturally one-per-intent.

**Alternative rejected.** A global key for every write — the content-derived
trap described above.

## D7 — new products start at zero, then move

**Context.** The guard test (D2) refuses a product insert carrying a non-zero
opening count.

**Decision.** `saveProduct(isNew)` inserts `stock: 0, reserved: 0, version: 0`
and then calls `applyStockChange` with `movement_type: "opening"`.

**Consequence.** Opening stock appears in the movement log with a reason and an
actor, so "where did these 24 units come from" is answerable. Same for new
**categories** — creation is just an insert with no stock semantics, and the
health scan iterates whatever categories exist at scan time rather than a fixed
list.

## D8 — back up before every migration

**Context.** The brief forbids losing or corrupting data.

**Decision.** Before any schema change or data migration:

```powershell
npx convex export --path backups/<label>.zip
```

`backups/` is gitignored (it is data, not source). Migrations are idempotent,
batched internal functions with a `dry_run` mode and a verification report; the
rollback note for each is "restore the export taken immediately before it".

**Consequence.** `backups/pre-inventory-20261009-1245.zip` exists for the
inventory work and is the rollback target for migrations in this project.

## D9 — two roles, per-person overrides, no role editor

**Context.** Spec C1 asks for a granular permission matrix, custom roles,
invites and approvals. The shop has one owner and a handful of attendants.

**Decision.** A closed catalogue of 21 permissions (`PERMISSION_KEYS` in
`convex/schema.ts`), two role defaults (`admin` = everything, `staff` = every
permission whose floor is `staff`), and a per-user `overrides` record on
`user_roles` that flips individual bits. Every guarded function now calls
`requirePermission(ctx, key)`.

**Alternative rejected.** Custom role definitions with a role editor. Rejected:
no current user needs it, it adds a screen plus a migration for every future
permission, and an override achieves the same result in one call.

**Consequence.** Denial messages keep the exact wording tests assert
("Staff access required…", "Admin access required…") because the _floor_ of the
requested permission decides which one a stranger sees. An override that
revokes a permission yields a typed `PERMISSION_DENIED` naming the permission —
a configuration decision, not "you are not staff".

---

## D10 — a correction is a new row, never an edit

**Context.** The shop needs an error-correction tool: staff mis-type counts and
must be able to undo them, but a ledger that lets someone rewrite yesterday's
rows explains nothing about where today's number came from.

**Decision.** `inventory.reverse` writes a _second_ movement (`movement_type:
"reversal"`, `reverses: <original id>`) whose delta restores what the original
did, and stamps the original row with `reversed_by`. The original's numbers are
never rewritten, so both rows stay readable. Reversing is keyed
`reverse:<movement id>`, so a double tap cannot undo it twice, and a row that is
already stamped refuses with its own message.

**Alternative rejected.** Patching the original row back to `previous_stock`.
Rejected: the log would show a change that "did not happen" and hide the mistake
entirely — the opposite of an audit trail.

**Consequence.** Only shelf movements can be reversed. `reserve` / `release` /
`commit` are owned by an order and refuse with "cancel or amend the order
instead", because reversing one would hand out units that are still promised.
A reversal goes through the choke point like any other write, so it cannot drive
available below zero — it fails with the usual "only _n_ on hand" instead.

---

**Status:** D1–D3, D6, D7 implemented (milestone M2). D4, D5 implemented in the
order path; D9 implemented (M3). D10 implemented (M6, part 1). The backfill of
`reserved` / `stock_state` ran on dev (M4): dry-run → real → verify
(`verified: true`), re-run a no-op, health scan 0 findings.
