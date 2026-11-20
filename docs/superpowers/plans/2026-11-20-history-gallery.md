# History gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only History screen that shows stored finished games as mini Victory Cards and opens the full shareable card on tap.

**Architecture:** Pure `Leaderboard.resultCardData(result)` derives card data from immutable results; `js/ui.js` adds a `history` route/view, gallery renderer and detail overlay reusing the existing canvas card; `styles.css` adds the responsive grid. No writes, no new storage.

**Tech Stack:** Vanilla JS, node:test, CSS grid.

**Spec:** `docs/superpowers/specs/2026-11-20-history-gallery-design.md`

## Global Constraints

- Read-only: no result creation, edits, deletes, sync or Firestore writes.
- `views` map key must be exactly `history` (route name) — the historical "black screen" bug came from a mismatched key.
- No webfonts, external images or new dependencies; 44px targets, Escape/Close, focus restore, no horizontal scroll at 320/390/768px.
- Full suite green, `node --check`, commit → push → deploy → fresh reviewer.

## Review Focus

- Result with a tie → multiple winners and margin 0 in `resultCardData`. Test: Task 1 Step 1.
- Result with no players/malformed entries → no throw, empty standings. Test: Task 1 Step 1.
- Gallery at 320px with 2 real results → cards readable, avatars/bars visible, no overflow. Check: Task 2 Step 5.
- Detail overlay reuses the canvas card; Escape/Close return to History with focus on the tapped card. Check: Task 2 Step 5.

---

### Task 1: Pure result-to-card data (TDD)

**Files:** Modify `js/leaderboard.js`, `test/leaderboard.test.js`

**Interfaces:** produces `Leaderboard.resultCardData(result)` → `{gameName, dateLabel, winners, winnerTotal, margin, standings:[{name, emoji, color, total, isWinner}]}`, same shape as `cardData`.

- [ ] **Step 1: Failing tests** — clear win (one winner, true margin), tie (two winners, margin 0), and malformed result (no players → empty standings, no throw). Use `colourFor(entry.key)` for standings colours.
- [ ] **Step 2: RED** — `npx node --test test/leaderboard.test.js`, expect failures.
- [ ] **Step 3: Implement** — derive from `result.players` (`win`, `total`, `name`, `emoji`, `key`), `result.at`, `gameNameOf(result)`, `result.lowerWins`; order by finish using lowerWins; absolute margin to next distinct total; export on `Leaderboard`.
- [ ] **Step 4: GREEN** — all leaderboard tests pass.
- [ ] **Step 5: Commit** — `git commit -m "Add resultCardData for read-only history cards"`.

### Task 2: History screen and UI

**Files:** Modify `index.html`, `js/ui.js`, `styles.css`

- [ ] **Step 1: Shell wiring** — add sidebar link `<a class="sidebar-link" href="#/history">History</a>` after Leaderboard, `<section id="view-history" class="view" hidden></section>` after the leaderboard view, `history: document.getElementById('view-history')` in the `views` map, and include `history` in the board-load condition (~ui.js:525) and board-update re-render (~ui.js:1471).
- [ ] **Step 2: Renderer** — `renderHistory()`: gather results from `boardData()`, sort by `at` descending, render a header ("History · your game nights"), and a grid of mini cards. Each mini card uses `resultCardData` to show game/date, winner headline, hero total and a CSS bar strip with each player's emoji (bar height by finishing place). Empty state: "No finished games yet — play one and it will appear here." Each card is a button with `data-action="open-history-result"` and `data-id` (the result id).
- [ ] **Step 3: Detail overlay** — allow `drawVictoryCard(dataOverride)` to use supplied card data; on `open-history-result`, find the result by id, set `ui.historyResultId`, render, and append the same `.victory-overlay` markup from the podium (canvas + Share card + Close). Share uses the existing `shareVictoryCard`; `close-history-result` clears the id, re-renders History and refocuses the tapped card. Escape already handled: extend it to close the history overlay. Keep the existing Tab trap working for this overlay.
- [ ] **Step 4: CSS** — `/* HISTORY GALLERY */` section: `.history-grid` 1 column <=520px, 2 columns above, max 3; `.history-card` with gold winner accent, mini bars, emoji strip; reuse `.victory-overlay` for detail.
- [ ] **Step 5: Visual smoke** — at 320/390/768px with the app's two real results: both cards render, tap opens full canvas card, Escape/Close return with focus, no horizontal scroll, no console errors; no fixture writing needed (results already exist).
- [ ] **Step 6: Commit** — `git commit -m "History gallery: stored games as shareable mini result cards"`.

### Task 3: Verify, ship, review

- [ ] Full suite, `node --check`; commit design doc (`git add -f`), push, deploy, live-file check, fresh reviewer over the plan range.
