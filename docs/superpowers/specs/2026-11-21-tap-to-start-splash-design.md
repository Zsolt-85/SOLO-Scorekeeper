# Tap-to-start parchment splash (design)

Date: 2026-11-21 · Status: user requested reference-style splash, confirmed "every start or reload" · Size: small change

## Intent and why

The current splash is a 720ms navy auto-dismiss. The user supplied a reference image
of a warm parchment "table mat" splash with a lock-and-cards mark, the line "Your
Universal Card Game Scorekeeper.", a small game list, and a **Tap to Start** button,
and asked for that style with an explicit entry button. Image generation has no
credits on this account, so the artwork is drawn with inline SVG/CSS.

## Decisions

- Splash shows on **every page load/reload** and stays until the user taps
  **Tap to Start** (no timed auto-dismiss). A 20s inline safety removal remains in
  case a script fails, so the app can never be permanently trapped.
- Visuals: cream parchment gradient, faint card-suit watermarks, small cards+padlock
  SVG mark, editorial serif title, anchored "Your Universal Card Game Scorekeeper."
  line, a short game list with real emojis, dark pill CTA, subtle spinner below.
  The splash is intentionally parchment regardless of the selected app skin.
- The game list is built from the user's **actual library** (first few visible games
  plus a "Custom Games" line when present), not hardcoded.
- On tap: the update check (already started in the background at boot) is awaited
  with a 900ms cap, then the splash fades out and focus moves into the app.
- Reduced motion: no spinner animation, no fade wait, no update-check wait.

## Non-goals

- No image service, external images, webfonts, new dependencies.
- No result/data/route changes; no first-run-only persistence.

## Verification

- `npm test`, `node --check`; browser: splash appears on reload, lists real games,
  tap enters app, keyboard Enter works, reduced-motion path instant, no overflow at
  320/390, no console errors/crash overlay.
- Commit, push, deploy.
