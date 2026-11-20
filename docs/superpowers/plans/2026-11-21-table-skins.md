# Table Skins and cleaner chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move secondary actions into the hamburger, add a Settings screen with four instantly-applied "Table Skin" themes, and keep all scores/layouts untouched.

**Architecture:** Pure `js/themes.js` owns theme definitions and localStorage persistence; `js/ui.js` renders Settings and wires the menu; `styles.css` theme blocks override CSS custom properties and surface textures. No backend.

**Tech Stack:** Vanilla JS, node:test, CSS variables.

**Spec:** `docs/superpowers/specs/2026-11-21-table-skins-design.md`

## Global Constraints

- No result/pool/sync/scoring changes; no webfonts, external images or dependencies.
- Themes change looks only — phone layouts and tap targets stay as they are.
- Skin/glow persist per device; unknown values fall back to Midnight.
- Full suite green, `node --check`, browser sweep, push/deploy/reviewer.

## Review Focus

- Unknown/corrupt stored skin cannot break boot. Test: Task 1 Step 1.
- Skin + glow survive reload; all four skins visibly differ. Check: Task 3 Step 4.
- Menu contains How to play, Join, Sync & refresh, Settings with working actions. Check: Task 2/3.
- Removing refresh buttons from headers doesn't break refreshApp() (menu item keeps the action). Check: Task 3 Step 4.

---

### Task 1: Pure theme module (TDD)

**Files:** Create `js/themes.js`, `test/themes.test.js`; Modify `index.html`

- [ ] **Step 1: Failing tests** — `normaliseSkin('neon') === 'neon'`, unknown/`null` → `'midnight'`; `loadTheme` with empty storage → `{skin:'midnight', glow:true}`; save then load round-trips skin+glow; corrupt JSON falls back; theme list has four entries with ids midnight/felt/paper/neon.
- [ ] **Step 2: RED** — `npx node --test test/themes.test.js` fails (module missing).
- [ ] **Step 3: Implement** — IIFE (global + CommonJS): `SKINS` array, `normaliseSkin`, `loadTheme(storage)`, `saveTheme(storage, theme)`, `applyTheme(document, theme)` sets `document.documentElement.dataset.skin` and toggles `no-glow` class; storage key `noting-more.theme.v1`; guard all JSON parse/localStorage exceptions.
- [ ] **Step 4: GREEN** — all theme tests pass.
- [ ] **Step 5: Commit + script** — add `<script src="js/themes.js"></script>` before cover-art.js; commit.

### Task 2: Menu and Settings route

**Files:** Modify `index.html`, `js/ui.js`

- [ ] **Step 1: Sidebar + view** — append menu links: How to play (`#/rules`), Join (`data-action="open-join"`), Sync & refresh (`data-action="refresh-app"`), Settings (`#/settings`); add `<section id="view-settings" class="view" hidden>`; add `settings` to `views` map and `render()` dispatch.
- [ ] **Step 2: Remove header clutter** — delete all five `refreshBtn()` call sites, the library header's How to play and Join buttons, and the now-unused `refreshBtn()` function. Keep in-page contextual Join on the box page. Ensure `refreshApp()` still finds the menu's `refresh-app` button.
- [ ] **Step 3: Settings renderer** — `renderSettings()` shows four skin preview cards (CSS mini-previews), current selection marked, and a "Surface glow" on/off toggle; actions `set-skin` (data-skin) and `toggle-glow` save via Themes and re-render; call `Themes.applyTheme` at boot with stored values.
- [ ] **Step 4: CSS** — Settings cards/menu styles plus `[data-skin="felt"]`, `[data-skin="paper"]`, `[data-skin="neon"]` blocks overriding tokens (midnight stays `:root`), body/#app background textures, and major surface rules; `.no-glow` disables glow layers; respect reduced motion.

### Task 3: Verify, ship, review

- [ ] Full suite, `node --check`, browser sweep (320/390/768) for menu actions, four skins, glow toggle, persistence across reload, no overflow; commit design/plan docs, push, deploy, live check, fresh reviewer.
