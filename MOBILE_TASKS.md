# Mobile responsiveness — task list

The store is mobile-first by design (`README`), and the stylesheet already ships real mobile
support: a bottom navigation bar with `env(safe-area-inset-bottom)`, a `viewport` meta tag, and
collapse rules at **1023px** and **767px** for the hero, grids, `.two-column`, `.setup-section` and
`.spec-table` region.

What is missing is *verification*. Nothing below has been confirmed on a real small viewport — the
desktop audit on 8 October could not resize the viewport. Work top to bottom; each task has its own
acceptance check.

## 0. Baseline

- [ ] **0.1 Pick the test matrix.** Chrome DevTools device emulation is enough for layout; a real
      Android + iPhone is required for the input-zoom and safe-area checks in §3.
      Minimum widths: **320** (SE), **360** (Android), **390** (iPhone 14), **414** (Plus), plus
      **767** and **1023** to sit exactly on the existing breakpoints.
- [ ] **0.2 Add a horizontal-overflow probe.** On every route, assert
      `document.documentElement.scrollWidth <= window.innerWidth`. This one line catches most mobile
      breakage. Record which routes fail before changing any CSS.

## 1. Route sweep (find the damage first)

- [ ] **1.1** Run the overflow probe (0.2) across all 21 routes at 320/360/390/414. Log failures.
- [ ] **1.2** Home — hero copy, the `IN THIS SETUP` floating card and the hotspot `+` buttons. The
      card overlays the photo at desktop (`src/routes/index.tsx`); confirm it reflows instead of
      covering the headline below 768px.
- [ ] **1.3** Catalogue — category chips, search field and the 2-up product grid
      (`src/routes/catalogue.tsx`, `.section` rails use `overflow-x: auto`).
- [ ] **1.4** Product (`src/routes/product.$slug.tsx`) — image gallery + thumbnails, the
      delivery calculator, the WhatsApp enquiry button, and `.spec-table`.
- [ ] **1.5** Cart drawer, search overlay and the ⌘K trigger — all are dialogs; confirm they fit,
      scroll internally, and close without trapping focus.
- [ ] **1.6** Checkout (`src/routes/checkout.tsx`) — the 3-step flow, zone picker and MoMo
      instructions. This is the money path; test it at 320px with a filled cart.
- [ ] **1.7** Account sign-in/sign-up and Track — plain forms, but verify keyboard behaviour.
- [ ] **1.8** Staff hub — `.admin-table` already has a 767px rule; confirm it is scrollable rather
      than clipped, and that the sidebar/nav collapses.

## 2. Likely fixes (from the desktop audit + code reading)

- [ ] **2.1 `.spec-table` horizontal overflow.** It is `width: 100%` with a `40%` header column and
      **no overflow guard** (`src/styles.css:912`). Long spec values will push the page wide at
      320px. Wrap in `overflow-x: auto` or stack the pairs below 767px.
- [ ] **2.2 Image dimensions / CLS.** Every product image ships without `width`/`height`; on a slow
      mobile connection the rails shift as photos land. Add intrinsic dimensions (or an
      `aspect-ratio` box) to `ProductCard`, the hero rail and the gallery.
- [ ] **2.3 Tap targets.** Verify every interactive element is ≥44×44px — product-card actions,
      quantity steppers, gallery thumbnails, the mobile-nav items and the dialog close buttons.
      Only 4 rules in `styles.css` currently reference `min-height: 40px+` / `touch-action`.
- [ ] **2.4 iOS input zoom.** Any focused input under `16px` zooms iOS Safari. Inputs resolve to
      `16px` today (`styles.css:168`, `:299`) — re-check after every form change and check the
      search overlay and staff forms too.
- [ ] **2.5 Hero headline.** `.hero h1` is `68px` (`styles.css:369`); confirm the 767px rule scales
      it far enough down that "Made for your workspace." does not overflow at 320px.

## 3. Device-only checks (cannot be done in emulation)

- [ ] **3.1 Safe area / home indicator.** `.mobile-nav` already uses
      `env(safe-area-inset-bottom)` (`styles.css:1262`) — confirm on a notched iPhone that the last
      cart/checkout control is not hidden behind the home indicator, and add `viewport-fit=cover`
      if it is not applied.
- [ ] **3.2 Soft-keyboard behaviour.** Focusing email/password/address fields must keep the active
      input visible while the keyboard is up (checkout, account, track).
- [ ] **3.3 Viewport zoom on forms** — see 2.4, must be tested on a real iPhone.
- [ ] **3.4 Landscape.** Short viewports clip the hero and the fixed bottom nav; decide whether to
      support landscape or lock the store to portrait.

## 4. Acceptance

- [ ] **4.1** Overflow probe passes on all 21 routes at 320/360/390/414.
- [ ] **4.2** One complete purchase journey on a real phone: browse → add to cart → checkout →
      MoMo reference submitted. (`ordering_enabled` is still off pending real MoMo details — flip
      it in the dev deployment for this test, then flip it back.)
- [ ] **4.3** Full checkout reachable with the on-screen keyboard open, no pinch-zoom needed.
- [ ] **4.4** Re-run the desktop route crawl (`npm test`, `npm run lint`) so the mobile fixes did
      not regress the desktop layout.
- [ ] **4.5** Tick "End-to-end checks and mobile layout checks" in `roadmap.md`.
