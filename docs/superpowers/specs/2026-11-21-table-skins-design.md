# Table Skins, cleaner chrome and Settings (design)

Date: 2026-11-21 · Status: approved by user via mockup ("looks good, implement") · Size: project

## Intent and why

The Library art is modern now, but the surrounding chrome (four loose header buttons,
one fixed navy palette) still feels oldschool. The user approved the "Table Skins"
concept from a browser mockup: themes should change the **surface the app sits on**,
not just a button colour, and the hamburger should own secondary actions.

## Decisions

- **Hamburger menu (sidebar)** becomes the single home for secondary actions:
  - Play: Library, Leaderboard, History, Players
  - Table: Add a game, Join a live table, How to play
  - App: **Sync & refresh** (renamed from "Refresh app"), **Settings**
- Page headers lose the scattered buttons: remove the 5 `refreshBtn()` call sites,
  the library header's "How to play" and "Join" buttons. Keep contextual in-page
  actions (e.g. "Join a live table" on the game box page).
- **Settings** screen at `#/settings` with four skins:
  - Midnight (default, today's navy+gold), Felt & Brass (green felt + brass),
    Paper Club (cream scorecard + ink), Neon Hall (dark arcade cyan + pink).
  - Each skin changes CSS custom properties (`--bg`, `--panel`, `--panel-2`,
    `--line`, `--text`, `--muted`, `--gold`) plus a subtle background texture on
    `body`/`#app` and a few surface rules. Card artwork stays constant.
  - "Surface glow" toggle (subtle on/off) persisted with the skin.
  - Applied instantly with a small preview thumbnail; selection stored per device in
    localStorage; no accounts, no image downloads, no webfonts.
- Motion stays static/subtle and respects `prefers-reduced-motion`.

## Parts

1. `js/themes.js` (pure): theme definitions, `normaliseSkin(value)`, `loadTheme(storage)`,
   `saveTheme(storage, {skin, glow})`, `applyTheme(theme)` applying a `data-skin`
   attribute to `<html>` and a glow class. TDD with fake storage. Load before ui.js.
2. `index.html`: sidebar gains How to play / Join / Sync & refresh / Settings entries;
   add `view-settings` section; load themes.js.
3. `js/ui.js`: add `settings` route/view/renderer (`renderSettings()` with skin preview
   cards and glow toggle); add `set-skin` / `toggle-glow` actions; remove header
   buttons; init theme from storage at boot.
4. `styles.css`: theme blocks for `[data-skin="…"]` with token overrides and surface
   textures; settings styles; no change to game-result logic.

## Non-goals / anti-goals

- No accounts, uploads, external images, image-generation service or new dependencies.
- No changes to results, pool, sync, scoring, or route behaviour beyond the additions.
- No layout-density changes — the phone layouts fixed earlier must stay intact.

## Verification

- `npm test` green, `node --check`, browser sweep at 320/390/768: menu opens with the
  new items, each skin applies and persists across reload, glow toggle persists, old
  routes still render, no horizontal scroll.
- Commit, push, deploy, fresh reviewer.
