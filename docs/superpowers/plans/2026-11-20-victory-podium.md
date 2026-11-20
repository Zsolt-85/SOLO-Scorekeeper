# Victory Card podium bars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Victory Card's text standings with coloured score bars showing each player's animal avatar, name and score, without changing results, sharing or ranking.

**Architecture:** One extra field in the pure `cardData` helper (`color` per standing) plus a canvas redraw in `drawVictoryCard`. HTML/CSS for the overlay is unchanged; the canvas scales through the existing `#victory-canvas` rule.

**Tech Stack:** Vanilla JS, Canvas 2D, node:test.

**Spec:** `docs/superpowers/specs/2026-11-20-victory-podium-design.md`

## Global Constraints

- No changes to results, finish logic, share behaviour, tie/lowest-wins rules or webfonts.
- Bar height = finishing place (winner tallest); score text = real points; caption explains it.
- Emoji via system emoji font stack; coloured disc + name must remain if the glyph is missing.
- Full suite green, `node --check`, local-only fixture for visual check (never publish a result), commit → push → deploy → reviewer.

## Review Focus

- 5-player card at 320/390px → all five bars, avatars, names and scores visible, no clipping. Check: Task 2 Step 3.
- Lowest-wins game → winner's bar tallest though their score is smallest; caption present. Check: Task 2 Step 3 with fixture.
- Tie game → both co-winners keep full-height bars. Check: Task 1 Step 1 (data unchanged by presentation).

---

### Task 1: Card data colour (pure, TDD)

**Files:** Modify `js/leaderboard.js`, `test/leaderboard.test.js`

- [ ] **Step 1: Failing test** — extend the existing cardData test: each `standings[i]` has `color` equal to the seat's colour (`#f0b429` for Maya in the test fixture).
- [ ] **Step 2: RED** — `npx node --test test/leaderboard.test.js`, expect 1 failure.
- [ ] **Step 3: Implement** — in `cardData`'s standings map add `color: String(entry.seat.color || '')`.
- [ ] **Step 4: GREEN** — all leaderboard tests pass.
- [ ] **Step 5: Commit** — `git commit -m "Expose player colours on Victory Card standings"`.

### Task 2: Canvas podium redraw

**Files:** Modify `js/ui.js` only

**Interfaces:** consumes `cardData().standings` (`name`, `emoji`, `color`, `total`, `isWinner`) and `margin`/`winners`.

- [ ] **Step 1: Finish order** — in `drawVictoryCard`, order standings by finish: winner(s) first, then non-winners sorted by total ascending for lowest-wins and descending for highest-wins (use `Ranking.directionFor(target, result.lowerWins)`).
- [ ] **Step 2: Draw bars** — replace the text standings loop with: per player a coloured disc (`color`, muted fallback) containing emoji via font stack `'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',system-ui`; a bar whose height decreases by rank (winner tallest), gold gradient for winners and `#39406e` for others; score above the bar in tabular numerals; name below, ellipsized to fit; small rank numeral on the bar. Scale column width and emoji size for 5–10 players. Add caption "tallest bar = winner · scores on top" and keep the "N players · N rounds" footer.
- [ ] **Step 3: Visual smoke** — local-only finished fixture (5 players), 320/390px: screenshot the card, verify all bars/avatars/names/scores visible, canvas non-blank, no page overflow, Share/Close still work; clear localStorage and close the tab.
- [ ] **Step 4: Commit** — `git commit -m "Victory Card: podium score bars with avatars"`.

### Task 3: Verify, ship, review

- [ ] Full suite (`npm test`), `node --check`.
- [ ] Commit the design doc (`git add -f docs/...`), push, `firebase deploy --only hosting --project solo-scorekeeper`, live-file check.
- [ ] Fresh reviewer over the plan range; fix Critical/Important, ledger minors.
