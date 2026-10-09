# Plan — Staff customization controls + small-screen layout

Two workstreams. `MOBILE_TASKS.md` stays the QA checklist; this doc is the build plan.

## Status — Phases 1–8 shipped

| Phase | What landed                                                                                                                                                       | State                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1     | Correctness fixes in `convex/lib/rules.ts` + consumers                                                                                                            | ✅ `npm test` green        |
| 2     | 9 optional `home_*` fields, `settingsDTO` defaults, `HOME_CONTENT_DEFAULTS`, `saveSettings` extended, `saveDeliverySettings` (staff) / `saveMomoSettings` (admin) | ✅ additive, no backfill   |
| 3     | Customization hub rebuilt as an 8-pane tabbed form with previews, fee calculator, reorderable featured picker, sticky save                                        | ✅                         |
| 4     | `index.tsx` reads all section copy from settings; hero hotspots derive from `featured_ids`                                                                        | ✅ no hardcoded slugs left |
| 5     | `StaffMobileNav` bottom bar + More sheet; `MobileNavigation` returns `null` on `/staff` and `/admin`                                                              | ✅ single bottom bar       |
| 6     | 16px form controls, stacked toolbars, sticky `.form-actions`, targeted 44px targets                                                                               | ✅                         |
| 7     | `.spec-table` overflow guard, `.section-heading` / `.brand-strip` wrap for authored copy                                                                          | ✅                         |
| 8     | `npm test` 136/136, `tsc --noEmit` 0, `npm run build` ✓, lint clean on every touched file                                                                         | ✅                         |

**Deliberate deviations from the original plan**

- `<Field>` / `<SectionTabs>` were not added to `bits.tsx` — the existing `<label>` pattern plus a
  dedicated `.settings-tabs` row covers it with less indirection. `<FormActions>` _was_ added.
- The global `button { min-height: 44px }` rule was rejected: it inflates every icon button
  (24px chevrons become 44×24 pills). Targets are applied per-surface instead
  (`.toolbar button`, `.form-actions button`, `.hero-product button`, `td button`, `li > button`).
- The trust icon registry lives in `src/lib/home-content.ts` rather than `rules.ts`, and its key
  type is derived from the generated `Doc` type, so it cannot drift from the `trustIcon` validator.
- Phase 7's image `width`/`height` CLS work was left out — it is independent of this plan.

**Mobile overflow sweep (Phase 6/7 verification, 8 October)**

The horizontal-overflow probe from `MOBILE_TASKS.md` §0.2 was run at 375px over 14 routes. It found
two real defects, both fixed:

1. **Bare `grid` tracks size to max-content.** `.staff-shell`'s content column and the dashboard's
   own `mt-8 grid gap-6` had no base column definition, so a single long order row dragged the page
   to 666px wide. Both now use `grid-cols-1` (`minmax(0, 1fr)`), which clamps the track to the
   screen. The same one-word fix went into the editor, categories and checkout grids.
2. **`sr-only` file inputs were full-width.** This project's unlayered `input { width: 100% }`
   outranks anything in `@layer utilities`, so Tailwind's `sr-only` could not shrink them — a hidden
   photo field alone widened `/staff/customization` by 207px. An explicit `input.sr-only` rule
   restores the 1px clip. (The same cascade quirk is why `pl-9` on the picker search had to become
   the plain `.picker-search input` rule.)

After those, every route tested reports `scrollWidth <= innerWidth`, the storefront and staff each
render exactly one bottom bar, and the More sheet lists all six secondary items including **Emails**.

**QA account:** verification used a real sign-up in the _dev_ deployment —
`staff.qa@example.com` (role `admin`, granted via `users:grantStaff`). It exists only in
`dev:stoic-elephant-714`; delete it from the `users` / `user_roles` tables if it should not stay.
Delivery fees were written to GH₵ 35 and back to GH₵ 30 to prove `saveDeliverySettings` round-trips;
they read 30 as before.

---

## Decisions (agreed)

1. **Permissions** — delivery fees + free threshold become **staff**-editable; the **Mobile Money recipient stays admin-only**. Update `AGENTS.md` accordingly.
2. **Homepage depth** — editable section copy (new bounded settings fields) + smart featured picker. Not a block CMS.
3. **Staff mobile nav** — bottom tab bar (4 tabs) + "More" bottom sheet. Desktop sidebar unchanged.

---

## Current state (grounding)

| Area               | State                                                                                                                                                                 | Gap              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Settings           | `store_settings` singleton already holds `hero_*`, `announcement`, `whatsapp`, `featured_ids`, fees. Edited at `/staff/customization`.                                | Fees admin-only  |
| WhatsApp           | Saved but **never read by the storefront** — `product.$slug.tsx` uses `settings.phone`.                                                                               | Dead control     |
| Announcement       | Rendered with `?? "default"` — `""` never falls through, so "empty hides it" is false.                                                                                | Broken control   |
| Fees               | Live in `lib/rules.ts`, but `\|\| 30 / 50 / 100 / 5000` duplicated in `$page.tsx` + `store-ui.tsx`.                                                                   | Drift risk       |
| Homepage copy      | Hero + photos + featured are settings-driven; trust strip, section headings, setup block, brand strip, closing CTA are hardcoded JSX. Hero hotspots hardcode 3 slugs. | Not customizable |
| Staff nav (mobile) | 8-item horizontal scroll strip. Storefront `MobileNavigation` also renders on `/staff` → two competing bottom bars.                                                   | Poor touch UX    |
| Forms              | `.toolbar select { font-size: 12px }` → iOS auto-zoom. Save buttons not sticky.                                                                                       | Touch blockers   |

---

## Workstream A — Customization

### Phase 1 — Correctness fixes

- `src/lib/store.ts`: `whatsappHref()`, `announcementText()`, `normalizeWhatsApp()`, `DEFAULT_FEES`.
- Consume in `product.$slug.tsx`, `$page.tsx`, `store-shell.tsx`, `store-ui.tsx`.
- Conditionally render the facts bar (empty announcement hides it).
- Tests in `src/test/delivery-and-contact-rules.test.ts`.

### Phase 2 — Backend

`convex/schema.ts` — additive **optional** fields on the singleton (no backfill, prod-safe):

```
home_category_heading, home_featured_heading, home_setup_eyebrow,
home_setup_heading, home_setup_body, home_cta_heading, home_cta_body  : v.optional(v.string())
home_brands   : v.optional(v.array(v.string()))                       // ≤6, ≤30 chars
home_trust    : v.optional(v.array(v.object({                          // ≤4
                    icon: v.union(v.literal("map-pin"), v.literal("truck"),
                                  v.literal("shield-check"), v.literal("wallet")),
                    title: v.string(), text: v.string() })))
```

- `convex/lib/dto.ts` — `settingsDTO` normalizes optional fields to today's exact hardcoded
  strings, so the public `Settings` type stays non-optional and existing rows render identically.
- `convex/seed.ts` — seed the new defaults.
- `convex/catalogue.ts` — three mutations:

| Mutation                     | Guard          | Args                                                            |
| ---------------------------- | -------------- | --------------------------------------------------------------- |
| `saveSettings` (extended)    | `requireStaff` | existing + the 9 `home_*` fields; length/allowlist validation   |
| `saveDeliverySettings` (new) | `requireStaff` | 4 fee fields, non-negative, logs `settings.delivery`            |
| `saveMomoSettings`           | `requireAdmin` | `momo_number`, `momo_name` + "can't clear while ordering is on" |

Split the admin UI into **two panels, each with its own Save**, so a failed admin call can't
leave a half-applied save.

### Phase 3 — Staff UI (`src/routes/staff/customization.tsx`)

Tabs: **Homepage · Trust strip · Announcement · Contact & WhatsApp · Delivery fees · Mobile Money
(admin) · Ordering**.

- Trust strip: repeatable rows, icon select from the 4 allowed, add/remove capped at 4, ≥44px rows.
- Announcement: live preview of the actual facts bar + explicit hide state.
- WhatsApp: digit normalization + live `wa.me` test link.
- Delivery fees: 4 fields + **live calculator** reusing `delivery()` from `src/lib/store.ts`
  (zone chips + sample subtotal → fee or "Free") + a 3-zone preview of `/delivery`.
- Featured picker: search, filter chips (All/Verified/In stock), thumbnails, **↑/↓ reorder**
  (not drag), `N of 12`, note that the first three drive hero hotspots, full-height on mobile.
- Shared scaffolding → `src/components/staff/bits.tsx`: `<Field>`, `<FormActions>`, `<SectionTabs>`.

### Phase 4 — Storefront consumes it

- `src/routes/index.tsx`: settings-driven section copy, trust strip, brand strip.
- Hero hotspots derive from `featured_ids.slice(0, 3)` — remove the hardcoded slugs; render only
  hotspots that resolve to a real product.
- Seed `featured_ids` so the first three match today's slugs (no visual surprise).

---

## Workstream B — Small screens

### Phase 5 — Staff responsive shell

- `src/components/staff/shell.tsx`: keep desktop sidebar; add `StaffMobileNav` (<768px) with
  Dashboard · Orders · Products · **More** (bottom sheet with the rest, View storefront, Account).
- `src/components/store-shell.tsx`: `MobileNavigation` returns `null` on `/staff` — fixes the
  double bottom bar.
- `src/styles.css`: `.staff-shell` bottom padding for the fixed bar.

### Phase 6 — Touch forms & lists

- Under 767px force `font-size: 16px` on inputs/selects (iOS zoom); override `.toolbar select`.
- Global `min-height: 44px` touch targets: steppers, gallery thumbs, dialog close, card add
  buttons, filter checkboxes.
- `.toolbar` stacks: full-width search + 2-column selects.
- Sticky `.form-actions` above the staff tab bar.
- 320px overflow audit of staff list rows.

### Phase 7 — Storefront polish

- `.spec-table` overflow guard.
- Hero card + hotspots reflow below copy <768px (highest visual risk).
- Facts bar truncation; "Track your order" icon-only <480px.
- Image `width`/`height` (or `aspect-ratio`) in `ProductCard`, hero rail, gallery → CLS.
- Checkout verified at 320px.

### Phase 8 — Verify & document

`npm test`, `npm run lint`, `npm run build`; overflow probe at 320/360/390/414 across all routes
(recorded in `MOBILE_TASKS.md`); desktop regression ≥1024px; `npx convex deploy` (schema change is
additive — no backfill, no seed re-run).

Update `AGENTS.md` (permissions + new fields) and tick `MOBILE_TASKS.md`.

## Sequencing

```
1. Correctness fixes + tests   → shippable alone
2. Backend schema/mutations/DTO → additive, prod-safe
3. Staff customization UI
4. Storefront consumes home content
5. Staff mobile nav + nav-conflict fix
6. Touch forms / storefront polish
7. Verify + docs
```

## Risks

- Hero hotspots change appearance once derived from `featured_ids` — seed order to match today.
- Two bottom bars during phase 5 — fix `MobileNavigation` in the same commit as `StaffMobileNav`.
- Trust icon allowlist lives in both `schema.ts` literals and the client icon registry — export one
  shared const.
- `ordering_enabled` gating and the sample/unverified checkout block are untouched.
