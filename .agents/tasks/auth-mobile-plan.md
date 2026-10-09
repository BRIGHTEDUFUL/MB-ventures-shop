# Implementation Plan: Auth Page Mobile Responsiveness

## Context

The project already has comprehensive mobile support with automated e2e tests (`npm run test:e2e`) checking 320/360/390/414px viewports across all routes. The tests verify:

- No horizontal overflow (✅ passing for all routes)
- 16px input font-size to prevent iOS zoom (✅ passing)
- 44px tap targets for product cards and cart steppers (✅ passing)
- Safe area insets for bottom nav (✅ passing)

However, the auth pages (`/account`, `/track`) and the `AuthFrame` component need additional mobile-responsive refinements that aren't currently covered by automated tests.

## Known Issues to Address

From code inspection:

1. **Font-size enforcement**: The 767px breakpoint forces `input, select, textarea { font-size: 16px }` globally, which is good, but `label` inherits `font-size: 14px` and labels wrap inputs. This could cause iOS zoom if the label's font-size cascades.

2. **Auth-switch tap targets**: `.auth-switch` contains `Button variant="link"` elements that may render below 44px height on mobile since they're text-only links without explicit height constraints.

3. **Auth-address-form button**: At 480px the form stacks and button gets `width: 100%`, but there's no explicit `min-height: 44px` enforcement for buttons inside `.auth-address-form`.

4. **Auth-panel padding at 320px**: At 480px the panel goes to `padding: 28px 20px 32px`. At 320px (40px narrower than 360px), the 20px horizontal padding may be excessive, leaving only 280px for content.

5. **Auth-lockup at 320px**: The lockup image (48×44px at 480px) + text sits in an 18px-padded brand band. At 320px this leaves ~284px for the flex row, which should fit but needs verification.

6. **Track page inputs**: The `/track` route uses plain `label > input` with no additional mobile sizing or structure, so it inherits the global styles but should be verified.

7. **Glass card border-radius**: The `.auth-card` has `border-radius: var(--panel-radius)` (24px). At 320px this may clip content if inner padding isn't sufficient.

8. **Auth-page safe area**: `.auth-page` has `padding-bottom: 80px` desktop, `48px` at 480px. The bottom nav uses `env(safe-area-inset-bottom)` but `.auth-page` doesn't, so on a notched phone the auth form footer may sit too close to the bottom nav.

## Implementation Steps

- [ ] 1. **Audit and fix input font-size inheritance chain**
      Problem: `label` is `14px`, labels wrap inputs, and `font-size` can inherit from parent to child.
      Fix: In the 767px breakpoint, explicitly set `label { font-size: 14px }` and ensure `label input, label select, label textarea { font-size: 16px }` to break any cascade.
      Files: `src/styles.css` (add to existing `@media (max-width: 767px)` block at line 1576)
      Verify: Run `npm run test:e2e` and confirm "form fields never trigger the iOS focus zoom" still passes.

- [ ] 2. **Enforce 44px minimum height for auth link buttons**
      Problem: `.auth-switch Button variant="link"` and other text-only buttons in auth forms may render below 44px.
      Fix: Add `.auth-switch button { min-height: 44px; }` inside the 767px breakpoint.
      Files: `src/styles.css` (add to `@media (max-width: 767px)` block)
      Verify: Visual inspection at 375px in DevTools: sign-in/sign-up toggle, "Forgot your password?", "Back to sign in" links all ≥44px tall.

- [ ] 3. **Enforce 44px minimum for auth-address-form button**
      Problem: The stacked address form button at 480px has no explicit height constraint.
      Fix: Inside the existing `@media (max-width: 480px)` block (line 2030), add `.auth-address-form button { min-height: 44px; }`.
      Files: `src/styles.css`
      Verify: Load `/account` signed-in, scroll to "Saved addresses", check "Save" button ≥44px at 375px.

- [ ] 4. **Add safe-area-inset-bottom to auth-page**
      Problem: `.auth-page` uses fixed `padding-bottom` but the bottom nav accounts for safe area; on a notched phone the form footer may sit too close to the nav.
      Fix: In the 480px breakpoint, change `.auth-page { padding-bottom: 48px; }` to `.auth-page { padding-bottom: calc(48px + env(safe-area-inset-bottom)); }`.
      Files: `src/styles.css` (line ~2032)
      Verify: Visual inspection in DevTools with iPhone 14 Pro viewport (notch simulation) - confirm breathing room between form footer and bottom nav.

- [ ] 5. **Add 320px sub-breakpoint for tighter horizontal padding**
      Problem: At 320px, 20px horizontal padding in `.auth-panel` and `.auth-brand` may leave insufficient content width.
      Fix: Add a new `@media (max-width: 360px)` block after the 480px block with:
      `css
.auth-panel {
padding: 24px 16px 28px;
}
.auth-brand {
padding: 14px 16px;
}
.auth-lockup img {
width: 42px;
height: 38px;
}
.auth-title {
font-size: 28px;
}
`
      Rationale: 16px padding at 320px leaves 288px content width (vs 280px with 20px padding), and scaling down the lockup/title prevents overflow.
      Files: `src/styles.css` (new block after line 2060)
      Verify: Load `/account` at 320px in DevTools, confirm no horizontal scroll, title doesn't wrap awkwardly, lockup fits.

- [ ] 6. **Verify track page inherits correct mobile styles**
      No changes needed - `/track` uses plain `label > input` which inherits the global 16px rule from step 1.
      Files: None
      Verify: Load `/track` at 375px, use DevTools inspector to confirm both inputs render at 16px font-size.

- [ ] 7. **Audit auth-card border-radius clipping at 320px**
      Problem: 24px border-radius may clip content at very narrow widths.
      Fix: In the new 360px breakpoint from step 5, add `.auth-card { border-radius: 18px; }`.
      Rationale: Slightly smaller radius at narrow widths reduces clipping risk without losing the glass aesthetic.
      Files: `src/styles.css` (same 360px block as step 5)
      Verify: Load `/account` at 320px, confirm card corners don't clip form inputs or text.

- [ ] 8. **Consolidate and document the breakpoint scheme**
      No code changes - document in plan output.
      Final breakpoint hierarchy: 1100px (auth-card columns), 900px (auth brand collapses to band), 767px (mobile touch rules + storefront collapse), 480px (auth fine-tuning), 360px (extreme narrow).
      Files: None (documentation only)
      Verify: Read the CSS and confirm no conflicting rules across breakpoints.

## Exact CSS Changes

All changes preserve the existing glass aesthetic, oklch color system, and breakpoint structure.

### In `@media (max-width: 767px)` block (line ~1576)

Add after the existing `input, select, textarea { font-size: 16px; }` rule:

```css
/* Ensure label font-size doesn't cascade to inputs and break the 16px rule */
label {
  font-size: 14px;
}
label input,
label select,
label textarea {
  font-size: 16px;
}

/* Auth link buttons (sign-in toggle, forgot password, etc) */
.auth-switch button {
  min-height: 44px;
}
```

### In `@media (max-width: 480px)` block (line ~2030)

Change:

```css
.auth-page {
  padding-bottom: 48px;
}
```

To:

```css
.auth-page {
  padding-bottom: calc(48px + env(safe-area-inset-bottom));
}
```

Add at the end of the 480px block (after `.auth-section-heading`):

```css
.auth-address-form button {
  min-height: 44px;
}
```

### New block after 480px (insert at line ~2060, before final closing brace)

```css
@media (max-width: 360px) {
  .auth-panel {
    padding: 24px 16px 28px;
  }
  .auth-brand {
    padding: 14px 16px;
  }
  .auth-lockup img {
    width: 42px;
    height: 38px;
  }
  .auth-title {
    font-size: 28px;
  }
  .auth-card {
    border-radius: 18px;
  }
}
```

## TSX Changes

None required. All fixes are pure CSS.

## Quality Gates

Run in order:

1. `npx tsc --noEmit` - TypeScript check (should pass, no TS changes)
2. `npm run lint` - ESLint check (should pass, no JS/TS changes)
3. `npm test` - Vitest unit tests (should pass, no logic changes)
4. `npx prettier --check .` - Code formatting (should pass if CSS is formatted)
5. `npm run build` - Production build (must succeed)
6. `npm run test:e2e` - Playwright mobile checks (32 checks, must all pass)

Manual verification at these viewports in Chrome DevTools:

- 320×568 (iPhone SE)
- 375×812 (iPhone 12/13 Pro)
- 414×896 (iPhone 14 Plus)

Routes to check:

- `/account` (sign-in form, sign-up form, signed-in view with orders/addresses)
- `/account?code=test` (reset password form - will show form even without real code)
- `/track` (guest tracking form)

For each route/viewport combo, verify:

- No horizontal scroll (`document.documentElement.scrollWidth <= window.innerWidth`)
- All tap targets (buttons, links) ≥44×44px (measure with DevTools inspector)
- All visible inputs font-size ≥16px (measure with DevTools inspector)
- Content doesn't overflow card borders
- Safe area breathing room at bottom (simulate with iPhone 14 Pro notch)

## Dependencies

None. All changes use existing CSS custom properties and utilities.

## Risks

Low risk - pure CSS changes in isolated auth styles, no breaking changes to Convex schema, no routing changes, no shared component modifications beyond scoped `.auth-*` classes.

Edge case: if a user has a very long email address or name, the auth forms may wrap text awkwardly at 320px, but the 288px content width should accommodate typical lengths (tested with `testtesttesttesttest@example.com` = 36 chars ≈ 180px at 16px sans-serif).

## Rationale

These changes target the specific auth pages which were created recently (`src/components/auth-frame.tsx` is untracked, indicating it's new work) and extend the project's existing mobile-first design to the narrowest supported viewport (320px) while maintaining the established glass aesthetic and touch-target accessibility standards already proven by the passing e2e suite.
