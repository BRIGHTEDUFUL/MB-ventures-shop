# Inventory audit

**Date:** 2026-10-09 · **Scope:** everything that reads or writes products, stock,
prices, images, categories, orders and the staff screens around them.
**Gates at audit time:** `tsc --noEmit` 0 errors · `lint` 0 errors / 7 pre-existing
warnings · `vitest` 175 passed · `build` ✓.

Defect severities: **critical** = loses or corrupts money/stock, **high** = wrong
behaviour a user will hit, **medium** = degraded or fragile, **low** = polish.

---

## 1. Architecture summary

### Stack

| Layer    | What it is                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| Backend  | Convex (`convex/`). Queries for reads, mutations for writes, one `internalMutation` seed, crons for retention.     |
| Auth     | Convex Auth, email + password only. `user_roles` table, `role ∈ {admin, staff}`, read through `lib/auth.ts`.       |
| Frontend | React + TanStack Start file routes. Staff hub under `src/routes/staff/*`, shared shell in `src/components/staff/`. |
| Money    | GH₵ as JS numbers, `round2` in `lib/rules.ts`.                                                                     |
| Images   | Convex storage (staff uploads) + bundled keys in `src/lib/store-images.ts`.                                        |

### Tables that carry inventory data

| Table                               | Fields                                                                                                                                            | Indexes                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `products`                          | `slug` (identity), `name`, `brand`, `category`, `price`, `original_price?`, `stock`, `description`, `specs`, `image_key`, `gallery[]`, `verified` | `by_slug`                 |
| `categories`                        | `slug`, `name`, `short_name`, `image_key`, `sort_order`, `visible`                                                                                | `by_slug`                 |
| `inventory_history`                 | `product_slug`, `product_name`, `previous_stock`, `new_stock`, `reason`, `actor_id?`                                                              | `by_product`              |
| `orders` + `order_items` (embedded) | snapshot of `id`, `name`, `price`, `quantity`, `image_key` per line                                                                               | `by_reference`, `by_user` |
| `activity_log`                      | `actor_id?`, `actor_name`, `action`, `summary`                                                                                                    | none                      |
| `store_settings`                    | fees, MoMo recipient, `ordering_enabled`, `featured_ids[]`                                                                                        | `by_key`                  |
| `user_roles`                        | `user_id`, `role`                                                                                                                                 | `by_user`                 |

### Every function that touches inventory

| Function                                          | File                       | Guard                | Stock write?                 |
| ------------------------------------------------- | -------------------------- | -------------------- | ---------------------------- |
| `orders.place`                                    | `orders.ts:70`             | `requireUser`        | **yes — decrement** (`:113`) |
| `orders.staffUpdate`                              | `orders.ts:286`            | `requireStaff`       | **yes — restock** (`:314`)   |
| `orders.staffNote` / `staffFixContact`            | `orders.ts:351`, `:379`    | `requireStaff`       | no                           |
| `orders.staffList` / `staffGet`                   | `orders.ts:215`, `:251`    | `requireStaff`       | no                           |
| `orders.track` (public) / `orders.mine`           | `orders.ts:172`, `:193`    | none / `requireUser` | no                           |
| `inventory.adjust`                                | `inventory.ts:36`          | `requireStaff`       | **yes — delta** (`:58`)      |
| `inventory.history`                               | `inventory.ts:89`          | `requireStaff`       | no                           |
| `catalogue.saveProduct`                           | `catalogue.ts:11`          | `requireStaff`       | **yes — set** (`:79`, `:92`) |
| `catalogue.deleteProduct`                         | `catalogue.ts:118`         | `requireStaff`       | deletes row                  |
| `catalogue.bulkUpdate`                            | `catalogue.ts:145`         | `requireStaff`       | **yes — set** (`:220`)       |
| `catalogue.saveSettings` / `saveDeliverySettings` | `catalogue.ts:266`, `:418` | `requireStaff`       | no (fees)                    |
| `catalogue.saveMomoSettings`                      | `catalogue.ts:468`         | `requireAdmin`       | no                           |
| `categories.save` / `remove`                      | `categories.ts:15`, `:72`  | `requireStaff`       | no                           |
| `stats.overview`                                  | `stats.ts:35`              | `requireStaff`       | no                           |
| `uploads.generateUploadUrl` / `savePhoto`         | `uploads.ts:9`, `:17`      | `requireStaff`       | no                           |
| `store.get` (public bundle)                       | `store.ts:11`              | none                 | no                           |
| `seed.seed` (internal)                            | `seed.ts:218`              | internal             | inserts `stock: 0`           |
| `health.report` (new, this pass)                  | `health.ts`                | `requireStaff`       | read-only                    |

### Storefront surfaces that show availability, price or images

`src/components/store-ui.tsx` (card badge + add button), `src/components/store-shell.tsx:310`
(home rail), `src/routes/product.$slug.tsx` (`:126` availability line, `:143`/`:152`
add-to-cart, `:280` hero image), `src/routes/catalogue.tsx` (listing + "In stock
only" filter `:45`), `src/routes/checkout.tsx:81` (line validity), `src/routes/index.tsx`
(featured), JSON-LD offers on the product route.

**No email template renders stock or price deltas** — `convex/emails/templates/*`
render order lines from the order snapshot, which is correct (a price edit must not
rewrite a sent receipt).

### Tests today

`src/test/convex-mutations.test.ts` (order placement, oversell, rollback),
`convex-staff-mutations.test.ts` (adjust, bulk, roles, fees), `order-rules.test.ts`,
`delivery-and-contact-rules.test.ts`, `home-content-settings.test.ts`, five email
suites, `app-routing.test.tsx`.

**No test asserts that stock cannot be written outside one function.**

---

## 2. Defects

### Critical

| #   | Defect                                                                                                                                                                                                                                                                            | Where                                                            | Reproduce                                                                                                                                                     | Fix                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **Stock is patched directly in five places.** Each hand-rolls the read → arithmetic → `db.patch` → `recordStockChange` sequence with its own reason string. Nothing enforces that a stock write leaves a ledger row, and nothing stops a sixth call site appearing.               | `inventory.ts:58`, `catalogue.ts:79/92/220`, `orders.ts:113/314` | Grep `db.patch(.*stock` — six hits, five call sites                                                                                                           | One `applyStockChange(ctx, …)` in `convex/lib/stock.ts`; every call site goes through it; a test fails if any other file writes `stock`. |
| C2  | **No `reserved` model.** Stock is decremented at _placement_, so `products.stock` silently means "available", not "on hand". Nothing records how many units are held by open orders, so the dashboard, the product form and the inventory page all show a number that is neither. | `orders.ts:113`                                                  | Set stock to 3, place an order for 1 → product form shows 2 with no explanation of the third unit                                                             | Add `reserved`; derive `on_hand = stock + reserved`; backfill from open orders (M6).                                                     |
| C3  | **Absolute stock writes ignore open reservations.** The product form and `bulkUpdate` write an absolute `stock` read from a possibly stale screen, overwriting units that orders already took.                                                                                    | `catalogue.ts:92`, `:220`                                        | Stock 3 → place order (2 left) → open a product form loaded before the order → Save → stock reads 3 again; the order now holds a unit that was never deducted | Product editor edits **on hand**; `applyStockChange` computes `available = on_hand − reserved` and refuses a negative result.            |
| C4  | **No permission model.** `requireStaff` is binary. Any attendant can delete every product, change every price, verify listings and read the full staff roster.                                                                                                                    | `lib/auth.ts:42`, `catalogue.ts:118/145`, `users.ts:59`          | Sign in as a plain staff account → `/staff/products` → "Remove product" succeeds                                                                              | `requirePermission(ctx, "products.delete")` + a permission table behind it (M2/M3).                                                      |

### High

| #   | Defect                                                                                                                                                                                                          | Where                             | Reproduce                                                                                                          | Fix                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| H1  | **Double submit on stock adjust.** The Apply button has no busy/disabled state, so a second tap fires a second mutation.                                                                                        | `staff/inventory.tsx:153`         | Tap "Apply" twice quickly → two identical movements                                                                | Disable while in flight + an `operation_key` on the mutation so a retry is a no-op.                                                 |
| H2  | **Double submit on bulk actions.** Same pattern; worse because a bulk price change hits up to 200 products.                                                                                                     | `staff/products/index.tsx:254`    | Tap "Apply" twice                                                                                                  | Disable + idempotency key + a confirmation/preview before applying.                                                                 |
| H3  | **No optimistic concurrency.** Two staff editing the same product → last write wins, silently.                                                                                                                  | `catalogue.ts:92`                 | Two tabs edit the same product, both save                                                                          | `version` on `products`; stale write returns `VERSION_CONFLICT` and the UI offers reload/merge.                                     |
| H4  | **Price is never rounded on save.** `saveProduct` stores `args.price` raw; only `bulkUpdate` rounds. A price of `0.1 + 0.2` style noise persists, and `> 0` is the only bound (no upper limit, no 2-dp check).  | `catalogue.ts:32/64`              | Save price `10.999` → stored as-is                                                                                 | Validate + `round2` at every money write boundary.                                                                                  |
| H5  | **Payment rejection never releases stock.** Restock fires only on a `status` transition to `cancelled`; rejecting payment on a `received` order leaves the units held. There is also **no expiry path at all**. | `orders.ts:307`                   | Place order → set payment `rejected`, keep status `received` → stock stays deducted                                | Release the reservation when payment is rejected or the order is cancelled; surface stale orders instead of silently holding stock. |
| H6  | **Rejected/closed orders can still change payment status.** `validateStatusChange` only blocks _status_ changes on closed orders.                                                                               | `lib/rules.ts:225`                | Open a cancelled order → flip payment to `confirmed`                                                               | Block any transition on a closed order.                                                                                             |
| H7  | **`deleteProduct` protects nothing.** No check for open orders, no storage cleanup, no removal from `featured_ids`. A product in an open order can be deleted, after which its restock is silently skipped.     | `catalogue.ts:118`                | Delete a product that an open order holds → cancel that order → nothing is restocked and no ledger row explains it | Block deletion while an order is open (or archive), clean storage, scrub `featured_ids`.                                            |
| H8  | **Image uploads are validated only in the browser.** No server-side type or size check; any staff member can POST arbitrary bytes to the upload URL. Replaced/deleted photos are never removed from storage.    | `uploads.ts:9`                    | Call `uploads.generateUploadUrl` then upload a 300 MB ZIP                                                          | Validate type + size in `savePhoto`, and delete superseded blobs on replace/delete.                                                 |
| H9  | **Staff order search only scans the newest 300 orders.** `.take(300)` then filters in memory — older orders are unreachable by search.                                                                          | `orders.ts:226`                   | Place 301 orders, search for the first by reference                                                                | Indexed filter + bounded pagination.                                                                                                |
| H10 | **Low-stock threshold disagrees with itself.** Dashboard uses `stock <= 5`, the storefront badge uses `stock < 5`. A product with 5 units is "low" for staff and "In stock" for shoppers.                       | `stats.ts:9` vs `store-ui.tsx:17` | Set stock to 5 → compare dashboard and product card                                                                | One shared constant, one test.                                                                                                      |
| H11 | **No archive state.** `verified` is the only switch: a product is either a public sample or live. There is no draft/archived state, so hiding a product means deleting it.                                      | `schema.ts:81`                    | Try to hide a product temporarily                                                                                  | `status ∈ {draft, active, archived}` (+ visibility), keeping `verified` as the storefront trust flag.                               |
| H12 | **No idempotency or conflict handling in the UI.** Product form has no unsaved-changes warning and no version; the inventory page resets nothing on failure beyond a toast.                                     | `product-form.tsx`                | Edit, navigate away by accident                                                                                    | Dirty-state guard + conflict banner.                                                                                                |

### Medium

| #   | Defect                                                                                                                                                                                           | Where                              | Fix                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------- |
| M1  | No SKU or barcode field anywhere, so duplicate detection is impossible and label printing/scan-to-find cannot exist.                                                                             | `schema.ts:81`                     | Add `sku`, `barcode`, unique indexes, validation (C2).                                |
| M2  | Duplicate slugs are only checked on create; there is no unique index, so two concurrent creates can race past the `.first()` check.                                                              | `catalogue.ts:55`                  | Unique index + `DUPLICATE_SKU` typed error.                                           |
| M3  | `specs`, `gallery`, `name`, `description`, `brand` have no length/size caps; `gallery` is unbounded.                                                                                             | `catalogue.ts:11`                  | Caps on every arg (C12).                                                              |
| M4  | `categories.remove` counts usage with a full `products.collect()`.                                                                                                                               | `categories.ts:82`                 | Index on `products.category` + `order("desc").take` counter.                          |
| M5  | `store.get` collects every product (all fields incl. full description) on every page load. Fine at 10 products, fatal at 20 000.                                                                 | `store.ts:24`                      | Pagination + a slim storefront projection (C13).                                      |
| M6  | `stats.overview` collects all products, all categories and 500 orders per call.                                                                                                                  | `stats.ts:40`                      | Pre-aggregated counters / bounded reads.                                              |
| M7  | `activity_log` has no index, no timestamp field, and no export; the feed is capped at 50 rows of free text with no before/after.                                                                 | `schema.ts:218`                    | Structured audit rows with `before`/`after`, filterable + exportable (C9).            |
| M8  | `inventory_history` stores `previous_stock`/`new_stock` pairs, not a delta with movement type, source, reference or operation key — and denormalises `product_name`, which goes stale on rename. | `schema.ts:207`                    | Real ledger: type, delta, before/after, actor, source, reference, operation key (C4). |
| M9  | The `images` proxy silently substitutes the desk photo for an unknown key, so a broken image renders as the _wrong_ image rather than failing.                                                   | `store-images.ts:16`               | Warn in Data health; fall back to an explicit placeholder.                            |
| M10 | Bulk price change applies immediately with no preview and no confirmation.                                                                                                                       | `staff/products/index.tsx:73`      | Preview table + confirm.                                                              |
| M11 | Products list and inventory list filter the whole bundle client-side; no server search, no pagination, no saved views, no column chooser.                                                        | `staff/products/index.tsx:43`      | Server-side search + filters + pagination (C9).                                       |
| M12 | Inventory page uses `document.getElementById` reads instead of controlled inputs, and has no search-first/scan-first layout for phone use.                                                       | `staff/inventory.tsx:55`           | Controlled form, search-first workspace (C8).                                         |
| M13 | `users.team` returns every role row (emails + phones) to any staff member, unbounded.                                                                                                            | `users.ts:63`                      | Gate behind `staff.manage`; paginate.                                                 |
| M14 | Replacing a main photo or removing a gallery entry leaks the old storage blob; `deleteProduct` leaks the main one too.                                                                           | `product-form.tsx`, `catalogue.ts` | Storage cleanup on replace/delete (H8).                                               |
| M15 | `reason` on `inventory.adjust` is free text with no length cap and no reason-code list, so the log is unsearchable.                                                                              | `inventory.ts:42`                  | Admin-managed reason codes with `note_required` / `approval_required` (C4).           |
| M16 | Product form's stock field is labelled "Stock on hand" but writes available — the label lies once reservations exist.                                                                            | `product-form.tsx:238`             | Follows from C2/C3.                                                                   |
| M17 | No in-app error taxonomy: everything is a `ConvexError({ message })` string, so the UI cannot offer "Reload latest version" or "Reduce quantity to 3".                                           | everywhere                         | Typed codes + a frontend mapper (C12).                                                |
| M18 | `staffFixContact` has no status gate (already logged in `docs/PROGRESS.md`).                                                                                                                     | `orders.ts:379`                    | Block on closed orders.                                                               |
| M19 | `transaction_reference` has no uniqueness guard (already logged in `docs/PROGRESS.md`).                                                                                                          | `orders.ts:70`                     | Unique index or explicit check.                                                       |

### Low

| #   | Defect                                                                                         | Where                        |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------- |
| L1  | `grantStaff` grants `admin` despite its name (logged in `docs/PROGRESS.md`).                   | `users.ts:188`               |
| L2  | Staff nav labels and page titles mix "Inventory", "Stock" and "Products" for related concepts. | `components/staff/shell.tsx` |
| L3  | 7 pre-existing lint warnings (react-refresh) unrelated to inventory.                           | `src/components/ui/*`        |
| L4  | No keyboard shortcuts, no in-app help links on non-obvious settings.                           | staff hub                    |

---

## 3. Missing features against the target specification

| Ref | Feature                                                                                                                   | Status      | Note                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Roles & permissions (granular, matrix, custom roles, overrides, invites, approvals)                                       | **Partial** | Two roles with default permission sets + per-person overrides shipped (M3, `lib/permissions.ts`); no custom roles, invites or approvals by design (D9). |
| C2  | Product master data (SKU, barcode, status, cost, supplier, custom fields, price history, reorder)                         | **Partial** | Name/brand/category/price/sale price/stock/description/specs/photos exist. Everything else absent.                                                      |
| C3  | Variants                                                                                                                  | **Missing** | Single flat product.                                                                                                                                    |
| C4  | Stock ledger + operations (types, reason codes, receive, write-off, transfer, idempotency, concurrency, valuation)        | **Partial** | Types, operation keys, idempotency and concurrency shipped (M2, `lib/stock.ts`); receive/write-off/transfer UI, reversals and valuation still open.     |
| C5  | Suppliers & purchase orders                                                                                               | **Missing** | —                                                                                                                                                       |
| C6  | Stocktake                                                                                                                 | **Missing** | "Set stock to…" bulk action is the nearest thing.                                                                                                       |
| C7  | Barcodes & labels                                                                                                         | **Missing** | Depends on M1.                                                                                                                                          |
| C8  | Attendant workspace (mobile-first, search-first)                                                                          | **Partial** | Inventory page works on a phone but is not search-first and has no quick actions.                                                                       |
| C9  | Admin inventory area (dashboard, product list, editor tabs, price mgmt, import/export, reports, notifications, audit log) | **Partial** | Dashboard + products list + one product form + activity feed exist. No tabs, reports, import/export, or structured audit log.                           |
| C10 | Data health & error correction                                                                                            | **Partial** | Scanner shipped this pass (`convex/health.ts`); no page, no one-click fixes, no reversal tools yet.                                                     |
| C11 | Storefront consistency                                                                                                    | **Partial** | Availability/price/snapshot rules agree today; H10 threshold and missing scheduled sales/variants/backorder are the gaps.                               |
| C12 | Typed error handling                                                                                                      | **Done**    | `fail(code, message, details)` in `lib/errors.ts`, thrown from the stock choke point (M2); `data.message` unchanged for the UI.                         |
| C13 | Performance & scale (20k products / 200k movements)                                                                       | **Missing** | Unbounded reads in `store.get`, `stats.overview`, `categories.remove`, `users.team`.                                                                    |
| C14 | UI quality (dense tables, shortcuts, 360 px, a11y, help)                                                                  | **Partial** | Existing admin design is solid and responsive; no shortcuts, no help links, list layouts are card-based rather than tabular.                            |

---

## 4. Risks

1. **Data migration risk is real but small.** Adding optional fields (`reserved`,
   `sku`, `status`, `version`) is backward compatible; Convex fills missing fields
   as `undefined`. Nothing existing is renamed or removed in the foundation work.
2. **Checkout is the blast radius.** `orders.place` and `orders.staffUpdate` are
   covered by tests today; every change there must keep them green.
3. **Six existing dev orders** carry old-shaped data. The reserved-stock backfill
   must run with a dry-run first and be idempotent.
4. **No CI.** Gates are run by hand, so each milestone runs them locally.
5. **The `verified` flag doubles as "reviewed" and "published".** Adding `status`
   must not break the AGENTS.md rule that unverified samples block checkout.

---

## 5. Prioritized milestone plan

| #   | Milestone                                                                                                                                                                         | Defects closed                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| M1  | **Audit** — this document + the reusable data-health scanner (`convex/health.ts`).                                                                                                | —                                      |
| M2  | **Critical fixes** ✅ — `applyStockChange` choke point + the test that enforces it; typed errors; validation caps; money rounding; `version` conflicts.                           | C1(partial), H1–H4, H12, M2, M3, C12   |
| M3  | **Permissions foundation** ✅ — permission catalogue, `requirePermission`, role defaults, per-user overrides, applied to every guarded function.                                  | C1(role defaults + overrides), H7, M13 |
| M4  | **Stock ledger data** ✅ — backfill `reserved` / `stock_state` for existing rows (dry-run, verification report, rollback note).                                                   | C3 data                                |
| M5  | **Product master data** — SKU/barcode/status/cost/supplier/custom fields, product editor tabs, archive instead of delete.                                                         | H11, M1, M16                           |
| M6  | **Stock ledger ops** — receive/write-off/transfer operations, reason codes, reversal. **Reversal done** (`inventory.reverse`); receive/write-off already exist as movement types. | C4, H5, M8, M15                        |
| M7  | **Data health page** ✅ — `/staff/health`: severity counts, findings with explanations and next steps, re-scan; Undo on the movement log.                                         | M9, M10                                |
| M8  | **Attendant workspace** — search-first mobile screens, quick adjust/receive/count, pending-state recovery.                                                                        | H1, H2, M12                            |
| M9  | **Admin inventory area** — dashboard totals, server-side product list, bulk preview, price history, audit log, reports.                                                           | H9, M5, M6, M7, M11                    |
| M10 | **Health scan (kept)** — reusable internal function, wired to the daily cron.                                                                                                     | (M1, retained)                         |
| M11 | **Storefront consistency** — one low-stock constant, availability labels, scheduled sale price.                                                                                   | H10, H5, C11                           |
| M12 | **Docs & report** — `docs/INVENTORY.md`, decision log, final report.                                                                                                              | —                                      |

Suppliers/purchase orders (C5), stocktake (C6), labels/barcodes (C7) and variants
(C3) come after M9, once the foundation is stable; they are recorded as **Not done**
in the final report if they do not land, rather than half-landed.
