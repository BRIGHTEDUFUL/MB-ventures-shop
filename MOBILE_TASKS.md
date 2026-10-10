# Mobile responsiveness — task list

The store is mobile-first by design (`README`), and the stylesheet already ships real mobile
support: a bottom navigation bar with `env(safe-area-inset-bottom)`, a `viewport` meta tag, and
collapse rules at **1023px** and **767px** for the hero, grids, `.two-column`, `.setup-section` and
`.spec-table` region.

What was missing is _verification_. It now exists in code: `npm run test:e2e` drives a real
Chromium viewport over every route at **320/360/390/414** and asserts the checks in §1 and §2
automatically. Work top to bottom; each task has its own acceptance check. Only §3 still needs a
physical device.

## Status — automated matrix live 9 October 2026

`e2e/mobile.spec.ts` loads each route (the ten static pages plus every product from the sitemap)
at 320, 360, 390 and 414 CSS pixels and asserts
`document.documentElement.scrollWidth <= window.innerWidth`, then checks the tap targets, field
sizes and safe-area wiring below. **32/32 checks pass.**

The first manual sweep (8 October, 375px iframes) found and fixed:

| Route                                                                                                                            | 375px horizontal overflow                                        |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `/`, `/catalogue`, `/product/standing-desk`, `/account`, `/track`, `/delivery`, `/checkout`                                      | ✅ none                                                          |
| `/staff`, `/staff/orders`, `/staff/products`, `/staff/customization`, `/staff/inventory`, `/staff/categories`, `/staff/activity` | ✅ none (was 291px on `/staff`, 207px on `/staff/customization`) |

Fixed in that sweep: `.staff-shell`'s content column and the dashboard's own inner grids were bare
`grid` (an implicit `auto` track sizes to **max-content**, so one long order row widened the whole
page); both now use `grid-cols-1` = `minmax(0, 1fr)`. `.spec-table` gained `overflow-x: auto`, and
hidden file inputs were claiming `width: 100%` because this file's unlayered `input` rule outranks
Tailwind's `sr-only` utility in `@layer utilities`.

**Still open:** §3 — soft-keyboard behaviour, focus zoom on a physical iPhone, landscape.

## 0. Baseline

- [x] **0.1 Pick the test matrix.** Chrome DevTools device emulation is enough for layout; a real
      Android + iPhone is required for the input-zoom and safe-area checks in §3.
      Minimum widths: **320** (SE), **360** (Android), **390** (iPhone 14), **414** (Plus), plus
      **767** and **1023** to sit exactly on the existing breakpoints.
      _(Done: 320/360/390/414 are the widths `e2e/mobile.spec.ts` runs at; 767/1023 remain the
      stylesheet's own breakpoints and are exercised by resizing in DevTools.)_
- [x] **0.2 Add a horizontal-overflow probe.** On every route, assert
      `document.documentElement.scrollWidth <= window.innerWidth`. This one line catches most mobile
      breakage. Record which routes fail before changing any CSS.
      _(Done twice: a 375px manual sweep on 8 Oct — table above — and now
      `e2e/mobile.spec.ts › Horizontal overflow`, which runs the assertion on every static route
      and every product page at all four widths.)_

## 1. Route sweep (find the damage first)

- [x] **1.1** Run the overflow probe (0.2) across all 21 routes at 320/360/390/414. Log failures.
      _(Done: `npm run test:e2e` — every static route and every product page, all four widths,
      0 overflows.)_
- [ ] **1.2** Home — hero copy, the `IN THIS SETUP` floating card and the hotspot `+` buttons. The
      card overlays the photo at desktop (`src/routes/index.tsx`); confirm it reflows instead of
      covering the headline below 768px. _(Overflow is covered by 1.1; the card's own stacking is
      still eyeball-only.)_
- [ ] **1.3** Catalogue — category chips, search field and the 2-up product grid
      (`src/routes/catalogue.tsx`, `.section` rails use `overflow-x: auto`). _(Overflow covered.)_
- [ ] **1.4** Product (`src/routes/product.$slug.tsx`) — image gallery + thumbnails, the
      delivery calculator, the WhatsApp enquiry button, and `.spec-table`. _(Overflow covered.)_
- [ ] **1.5** Cart drawer, search overlay and the ⌘K trigger — all are dialogs; confirm they fit,
      scroll internally, and close without trapping focus. _(Not covered — dialogs are not open by
      the automated sweep.)_
- [ ] **1.6** Checkout (`src/routes/checkout.tsx`) — the 2-step flow, zone picker and pay-later
      copy. This is the money path; test it at 320px with a filled cart.
      _(Overflow covered, and the whole 2-step flow is now driven for real in
      `e2e/purchase.spec.ts` — at desktop width though, not 320px.)_
- [ ] **1.7** Account sign-in/sign-up and Track — plain forms, but verify keyboard behaviour.
      _(Overflow and 16px field sizes covered; keyboard behaviour is §3.2.)_
- [x] **1.8** Staff hub — `.admin-table` already has a 767px rule; confirm it is scrollable rather
      than clipped, and that the sidebar/nav collapses.
      _(At 375px: sidebar `display: none`, the new `.staff-mobile-nav` bottom bar `display: flex`
      with four 77×52px targets, and the storefront `.mobile-nav` is absent — so there is exactly
      one bottom bar on `/staff` and `/admin`.)_

## 2. Likely fixes (from the desktop audit + code reading)

- [x] **2.1 `.spec-table` horizontal overflow.** It is `width: 100%` with a `40%` header column and
      **no overflow guard** (`src/styles.css:912`). Long spec values will push the page wide at
      320px. Wrap in `overflow-x: auto` or stack the pairs below 767px.
      _(Done: below 767px `.spec-table` becomes `display: block; overflow-x: auto`. Confirmed on
      `/delivery` at 375px — the fee table scrolls inside its own box instead of widening the
      document.)_
- [x] **2.2 Image dimensions / CLS.** Every product image ships without `width`/`height`; on a slow
      mobile connection the rails shift as photos land. Add intrinsic dimensions (or an
      `aspect-ratio` box) to `ProductCard`, the hero rail and the gallery.
      _(Done: `imageSize()` in `src/lib/store-images.ts` carries the measured intrinsic size of
      every asset and is applied to `ProductCard`, `CartLines`, the hero photo, the hero product,
      the category tiles, the setup photo and the header logo.)_
- [x] **2.3 Tap targets.** Verify every interactive element is ≥44×44px — product-card actions,
      quantity steppers, gallery thumbnails, the mobile-nav items and the dialog close buttons.
      Only 4 rules in `styles.css` currently reference `min-height: 40px+` / `touch-action`.
      _(Below 767px: bottom tab bar 77×52, More-sheet links 44, `.toolbar` /
      `.form-actions` / `.hero-product` / `.picker-move` / `td` / `li > button` forced to 44, cart
      quantity stepper 44×46, checkboxes 22px inside 44px labels, `.icon-control` dialog close
      already 44 — plus `.product-add`, which is now 44×44. Two of these are asserted automatically
      in `e2e/mobile.spec.ts` (product-card add button, cart steppers); gallery thumbnails and
      anything opened from a dialog are still unaudited.)_
- [x] **2.4 iOS input zoom.** Any focused input under `16px` zooms iOS Safari. Inputs resolve to
      `16px` today (`styles.css:168`, `:299`) — re-check after every form change and check the
      search overlay and staff forms too.
      _(Below 767px every `input`/`select`/`textarea` plus `.toolbar select` (12px) is forced to
      16px, which also stops the `14px` inherited from `label` from triggering the zoom.
      `e2e/mobile.spec.ts › form fields never trigger the iOS focus zoom` now measures every
      visible field on `/checkout`, `/account` and `/track` on each run. Actual zoom behaviour
      still needs §3.3 on a phone.)_
- [x] **2.5 Hero headline.** `.hero h1` is `68px` (`styles.css:369`); confirm the 767px rule scales
      it far enough down that "Made for your workspace." does not overflow at 320px.
      _(Covered: `/` passes the overflow probe at 320px.)_

## 3. Device-only checks (cannot be done in emulation)

- [ ] **3.1 Safe area / home indicator.** `.mobile-nav` already uses
      `env(safe-area-inset-bottom)` (`styles.css:1262`) — confirm on a notched iPhone that the last
      cart/checkout control is not hidden behind the home indicator, and add `viewport-fit=cover`
      if it is not applied.
      _(Code side done: `viewport-fit=cover` is in the viewport meta and
      `e2e/mobile.spec.ts › the bottom navigation clears the home indicator` fails if either it or
      the `env(safe-area-inset-bottom)` rule goes missing. The physical notch still needs a phone.)_
- [ ] **3.2 Soft-keyboard behaviour.** Focusing email/password/address fields must keep the active
      input visible while the keyboard is up (checkout, account, track).
- [ ] **3.3 Viewport zoom on forms** — see 2.4, must be tested on a real iPhone.
- [ ] **3.4 Landscape.** Short viewports clip the hero and the fixed bottom nav; decide whether to
      support landscape or lock the store to portrait.

## 4. Acceptance

- [x] **4.1** Overflow probe passes on all 21 routes at 320/360/390/414.
      _(Done: `npm run test:e2e`, 4 widths × every static route and every product page.)_
- [ ] **4.2** One complete purchase journey on a real phone: browse → add to cart → checkout →
      order placed. (No payment input — `ordering_enabled` is already on in dev and production;
      payment happens at the counter or to the courier.)
      _(The journey itself now runs in CI form — `npm run test:e2e:live` places a real order in
      dev, works it as staff and cancels it. What is left is doing it once on a physical phone.)_
- [ ] **4.3** Full checkout reachable with the on-screen keyboard open, no pinch-zoom needed.
      _(§3.2/§3.3 — device only.)_
- [x] **4.4** Re-run the desktop route crawl (`npm test`, `npm run lint`) so the mobile fixes did
      not regress the desktop layout.
      _(9 Oct: `npm test` 175/175, `npx tsc --noEmit` clean, `npm run lint` 0 errors,
      `npx prettier --check .` clean, `npm run build` ✓, plus 32 Playwright checks and the live
      purchase run. The 8 Oct note about ~190 `prettier/prettier` errors is obsolete — the tree is
      formatted.)_
- [x] **4.5** Tick "End-to-end checks and mobile layout checks" in `roadmap.md`.
      _(Ticked on 9 Oct for the automated half; §3 stays open on purpose.)_
