# MB Ventures GH

- [x] Store design system, logo and real photography
- [x] Home, catalogue, product gallery, search, navigation and cart
- [x] Persistent checkout, receipt and secure tracking — **one real order placed end to end**
      (9 Oct, `npm run test:e2e:live`): signup → cart → 2-step checkout (details → review,
      no payment input) → `MB-…` receipt → guest tracking by reference + phone, no session
- [x] Staff sign-in, payment recording, order timeline and store editing — the same run signs in
      a granted staff account, records the cash payment, advances `received → processing`, cancels
      the order (restock proven on the storefront), and the shopper reads the closed order back
      from `/track`
- [x] Customer accounts and information pages
- [x] End-to-end checks and mobile layout checks — `npm run test:e2e` runs 32 checks: canonical,
      Open Graph/Twitter card, `noindex` on the consoles, sitemap/robots, heading outline, then the
      **320/360/390/414 overflow matrix over every route**, 44px tap targets, 16px form fields and
      the safe-area wiring. Device-only checks (soft keyboard, real focus zoom, landscape) still
      need a phone — `MOBILE_TASKS.md` §3.
- [x] Live inventory and payment model — ready for production. Email system live, domain
      configured (`mbventuresghana.com`). No in-app payment: pickup pays at the shop counter,
      delivery pays cash on arrival. `ordering_enabled` toggles via `/staff` customization

## Verification run — 9 October 2026

| Gate                     | Result                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`       | 0 errors                                                                                                    |
| `npm run lint`           | 0 errors, 7 warnings (all `react-refresh/only-export-components` inside the shadcn/ui kit)                  |
| `npm test`               | 179/179 passing across 13 files (incl. `orders.place`/`track`/`staffUpdate`, inventory and settings guards) |
| `npm run build`          | ✓ built in 5.7s                                                                                             |
| `npx prettier --check .` | All matched files use Prettier code style                                                                   |
| `npm run test:e2e`       | 32/32 passing — head, outline and the four-width mobile matrix                                              |
| `npm run test:e2e:live`  | 4/4 passing — a real order placed, paid, advanced, cancelled and restocked in dev                           |

### Closed by this pass (they were the open findings of the 8 October desktop audit)

- Canonical URL, `og:url`, `og:image`/`twitter:image` on every public page; `noindex, nofollow`
  on `/staff`, `/admin` and `/dev`; `/sitemap.xml` and `/robots.txt` served as real routes with
  the origin taken from the request (see `src/routes/sitemap[.]xml.tsx`).
- Every image carries intrinsic `width`/`height` (`imageSize()` in `src/lib/store-images.ts`), so
  rails no longer shift as photos land.
- Home heading order runs `H1 → H2 → H3`; the footer and catalogue filter headings were also
  level-skipping and are now flat, which the heading-outline tests hold in place.
- Product-card add button is a 44×44 target below 767px.
- Formatting: the tree is Prettier-clean (`convex/_generated` and Playwright artifacts are
  ignored).

## Completed Setup (9 October 2026)

- ✅ **Email**: Web3Forms access key configured (`c8395fed-e25e-4350-a914-df8e592f5920`)
  - Development: Live mode enabled at `dev:stoic-elephant-714`
  - Production: Fully configured at `prod:necessary-newt-861`
  - Reply-to: `info@mbventuresghana.com`
  - Admin alerts: `info@mbventuresghana.com`
  - Daily limit: 250 emails/day (production)
  - See `docs/EMAIL-SETUP-STATUS.md` and `docs/PRODUCTION-CONFIG.md`
- ✅ **Production domain**: `https://mbventuresghana.com` configured
  - `VITE_SITE_URL` set in `.env.production`
  - `SITE_URL` set in Convex production environment
  - All email links, canonical URLs, Open Graph tags use correct domain
  - Sitemap and robots.txt configured
- ✅ **Payment model**: No in-app payment — pickup pays at the shop counter, delivery pays
  cash on arrival. Legacy MoMo recipient settings retired (fields kept so old orders validate)

## Still requires physical device testing

- **Real devices**: `MOBILE_TASKS.md` §3 — soft keyboard, focus zoom on a physical iPhone,
  landscape orientation testing.
