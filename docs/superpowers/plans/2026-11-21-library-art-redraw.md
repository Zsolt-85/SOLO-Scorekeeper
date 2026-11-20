# Library art redraw Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized emoji tiles on the main/Library screen with a compact continue strip and a 2-column shelf of small cards filled with original SVG game art.

**Architecture:** New pure `js/cover-art.js` produces deterministic SVG scenes; `js/ui.js` uses it for all covers and simplifies `renderLibrary()`; `styles.css` adds a final override section. No data, result or storage changes.

**Tech Stack:** Vanilla JS, inline SVG, node:test, CSS grid.

**Spec:** `docs/superpowers/specs/2026-11-21-library-art-redraw-design.md`

## Global Constraints

- No result/sync/storage changes; no webfonts, external images, image service or new dependencies.
- Colour must be sanitised to `#rrggbb`; all type-derived text escaped; deterministic theme per game.
- Phone 320/390: 2-column shelf, no horizontal scroll; desktop/tablet sidebar and layout preserved.
- Keyboard focus/aria labels, reduced motion and existing cover sizes in box/leaderboard preserved.
- Full suite green, `node --check`, commit → push → deploy → fresh reviewer.

## Review Focus

- Malicious type name/colour cannot inject markup or CSS into SVG. Test: Task 1 Step 1.
- Same game always gets the same art theme; different games distribute across themes. Test: Task 1 Step 1.
- Library at 320/390: cards visibly smaller than old hero, art and names readable, no overflow. Check: Task 2 Step 4.
- Box hero and leaderboard covers still render at their existing sizes with the new art. Check: Task 2 Step 4.

---

### Task 1: Pure SVG art module (TDD)

**Files:** Create `js/cover-art.js`, `test/cover-art.test.js`; Modify `index.html`

**Interfaces:** produces `CoverArt.svg(type)` → SVG markup string; `CoverArt.themeFor(type)` → one of `cards|wild|dice|tokens|tiles|board`.

- [ ] **Step 1: Failing tests** — themeFor is stable for the same id/emoji and varies across sample ids; built-in `solo` → `cards`, `uno` → `wild`; svg contains a `<svg` root, the sanitised colour and no `<script>`/raw injected name; malicious name `<img onerror=...>` is escaped; invalid colour falls back to `#f0b429`.
- [ ] **Step 2: RED** — `npx node --test test/cover-art.test.js`, expect failures (module missing).
- [ ] **Step 3: Implement** — IIFE module (global + CommonJS). Deterministic hash of `type.id`/`emoji`; six small scene builders using rects/circles/paths with layered opacity and the game's colour; no gradients with ids (avoid collisions across inline SVGs). Escape `name`, sanitise colour.
- [ ] **Step 4: GREEN** — all cover-art tests pass.
- [ ] **Step 5: Commit + script tag** — add `<script src="js/cover-art.js"></script>` before `js/ui.js`; `git commit -m "Add deterministic SVG game cover art"`.

### Task 2: Library layout and UI wiring

**Files:** Modify `js/ui.js`, `styles.css`

- [ ] **Step 1: Covers** — `coverHtml(type, extraClass)` delegates to `CoverArt.svg(type)` when available, keeping the existing `.cover`/extra class wrapper and a visually hidden accessible label. Keep the no-type fallback.
- [ ] **Step 2: Library** — replace the oversized `.hero` branches in `renderLibrary()` with one compact `.continue-strip` (small thumbnail from `coverHtml`, "Continue"/"Live table" label, game/round/players text, Resume button) and a quieter empty state when nothing is active. Heading "Your games"; keep shelf, archived games and Add-game button.
- [ ] **Step 3: CSS** — final `/* LIBRARY ART REDRAW */` section: `.continue-strip` compact row; `.shelf` 2 columns at all phone widths with 3:4 art cards; `.cover-label` becomes a soft bottom gradient with white text; smaller rule chips; dashed add tile; keep `.hero` rules for other routes untouched.
- [ ] **Step 4: Visual smoke** — at 320/390/768/1280 on local dev: Library shows compact strip + 2-col art cards with names readable, no overflow; open a game box and the leaderboard to confirm covers still render; screenshot; no console errors.
- [ ] **Step 5: Commit** — `git commit -m "Library redraw: compact strip and illustrated game shelf"`.

### Task 3: Verify, ship, review

- [ ] Full suite, `node --check`; commit design doc (`git add -f`), push, deploy, live-file check, fresh reviewer over the plan range.
