# Library / main screen redraw with illustrated game art (design)

Date: 2026-11-21 · Status: awaiting user sign-off · Size: project (visual + layout + one pure module)

## Intent and why

The Library currently shows large CSS-gradient tiles with one emoji, and the main
screen leads with an oversized hero plaque. The user asked to rethink and redraw both:
smaller tiles and real "pictures about the game itself". Mockups A (compact continue
strip + art shelf) and B (cinematic banner + small rows) were shown; the user picked
**A**. AI image generation was unavailable (account credits), so the artwork will be
original **inline SVG scenes** — sharper, offline, and on-brand.

## Decisions

- **Layout A:** compact "continue/live" strip (small 42×56 thumbnail + text + Resume),
  then a **2-column shelf on phones** of pocket-sized art cards (portrait 3:4 art,
  name on a soft gradient at the bottom). "Add a game" stays as a small dashed tile.
- **Art:** a new pure module `js/cover-art.js` renders deterministic SVG scenes:
  fanned cards + die + tokens, wild cards + star, dice, tokens, tiles and board-grid
  themes. Each uses the game's own colour and stays crisp at any size. No external
  images, no webfonts, no image generation service.
- **Custom games:** art theme is chosen **automatically** from a hash of the game's
  id/emoji — no new fields, no picker in the Add-game form (user approved this call).
- Built-in SOLO gets the cards/die scene; UNO-style games get the wild-cards scene;
  other games distribute deterministically across the themes.
- Where covers already appear (box hero, leaderboard card heads), the same art is
  used so the app looks consistent; sizes come from the existing CSS.

## Non-goals / anti-goals

- No result, sync, storage or rule changes; no image uploads; no new dependencies.
- No horizontal scrolling or oversized hero; desktop sidebar/tablet layout preserved.
- Keep keyboard focus, reduced motion, and accessible names on all game buttons.

## Parts

1. `js/cover-art.js` + tests: `CoverArt.svg(type)` → safe SVG string; theme selection
   deterministic, colour sanitised to `#rrggbb`, emoji/text escaped, no `<script>`.
   Export as global + CommonJS like the other pure modules; add script tag in index.html.
2. `js/ui.js`: `coverHtml()` delegates to `CoverArt.svg(type)`; `renderLibrary()` gets
   the compact continue strip and new shelf markup; heading "Your games".
3. `styles.css`: replace oversized `.hero` rules on the Library route only with a
   `.continue-strip`; `.shelf` 2 columns on phones, art card overlay label, smaller
   chips, dashed add tile. Keep box/leaderboard cover sizing intact.
4. Visual verification at 320/390/768/1280; full suite; push/deploy/reviewer.

## Verification

- `npm test` green (new pure-module tests), `node --check`.
- Screenshots of Library at 320/390 and desktop; assert no horizontal scroll and
  that cards are visibly smaller than the old hero.
- Commit, push, Firebase deploy, fresh reviewer.
