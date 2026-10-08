# MB Ventures GH

- [x] Store design system, logo and real photography
- [x] Home, catalogue, product gallery, search, navigation and cart
- [ ] Persistent checkout, receipt and secure tracking — structure verified (cart persists, checkout redirects signed-out shoppers to `/account?next=/checkout`, receipt and ref+phone tracker render); still needs one real order placed end to end
- [ ] Staff sign-in, payment verification, order timeline and store editing — access gate verified and every transition is unit-tested; the dashboard itself still needs a staff account to exercise
- [x] Customer accounts and information pages
- [ ] End-to-end checks and mobile layout checks — desktop pass complete (21 pages crawled, 26 internal links, 0 console errors); the mobile work is queued as a task list in `MOBILE_TASKS.md`
- [ ] Live inventory and MoMo recipient details (awaiting store-supplied information) — `ordering_enabled` stays off until MoMo recipient details are saved

## Verification run — 8 October 2026

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | 0 errors |
| `npm run lint` | 0 errors, 7 warnings (all `react-refresh/only-export-components` inside the shadcn/ui kit) |
| `npm test` | 29/29 passing across 3 files |
| `npm run build` | ✓ built in 9.5s |
| Route crawl | 21 pages + all 10 products + all 5 categories + search/edge cases — 0 × 404, 0 console errors |
| Images | 0 broken; store logo resolves on every page |
| Cart → checkout | Adds to cart, persists to `mb-cart`, totals and free-delivery hint correct, auth gate redirects as designed |

Open findings from the desktop audit, none blocking:

- No `<link rel="canonical">` on any page.
- Most product images ship without `width`/`height`, so there is no reserved box against layout shift.
- Home heading order runs `H1 → H3 → H2`.
- Screen-reader passes (labels, landmarks, accessible names, `alt`) were clean on every page checked.
