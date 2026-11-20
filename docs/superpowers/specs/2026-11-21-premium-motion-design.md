# Premium motion: splash and screen transitions (design)

Date: 2026-11-21 · Status: approved by user ("do as recommended") · Size: small change

## Intent and why

The app feels functional but flat. Add one orchestrated premium moment — a short
splash on startup — plus subtle, route-only view transitions and tactile button
feedback, without touching scores, data or the phone layouts.

## Decisions

- Splash is shown **inline in index.html** (painted before any JS), with the brand
  mark, wordmark, a thin progress line and "Preparing your table…". It stays for a
  minimum of ~700 ms while `revalidateShell()` refreshes cached shell files in the
  background, then fades out. **No forced reload** — the next load is simply fresh.
- An inline fallback removes the splash after 3 s even if a script fails, so the app
  can never be trapped behind it.
- View transitions fire **only when the route key changes** (reusing `ui.lastRouteKey`
  logic), not on score/board re-renders: a 200 ms fade + 8 px slide.
- Button/card feedback is restrained (`:active` scale 0.98), no per-card stagger or
  looping motion. `prefers-reduced-motion` already zeroes animations globally; the
  splash JS also skips the minimum delay in that case.
- The splash uses theme tokens, so it opens in the user's chosen skin.

## Non-goals

- No version marker / auto-reload loop (user chose the simpler revalidation path).
- No service worker, external images, webfonts, or new dependencies.
- No changes to results, sync, routes or layout metrics.

## Verification

- `npm test`, `node --check`; browser check: splash appears then disappears, routes
  animate only on navigation, no animation on same-route updates, reduced-motion
  skips the wait, no horizontal scroll, no console errors.
- Commit, push, deploy.
