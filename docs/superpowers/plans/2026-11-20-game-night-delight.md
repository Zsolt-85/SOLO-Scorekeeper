# Game-night delight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add last-round points on score tiles, a "Who goes first" picker, a Rivals panel on Players rows, and an optional shareable Victory Card after finishing — without changing stored results or requiring accounts.

**Architecture:** Four pure helpers in `js/ranking.js` and `js/leaderboard.js` (TDD with node:test), wired into the existing IIFE UI in `js/ui.js` with modal/sheet markup and a Canvas 2D card renderer. CSS-only styling in `styles.css` appended as a final MOBILE DELIGHT section. No storage, sync, result-writing or markup-structure changes beyond the new controls.

**Tech Stack:** Vanilla JS (browser globals + node:test), Canvas 2D, Web Share API with PNG download fallback, existing 261-test suite.

**Spec:** `docs/superpowers/specs/2026-11-20-game-night-delight-design.md`

## Global Constraints

- Never change result creation/finish logic, Firestore writes, or stored result shape.
- Losses remain absent from leaderboard rows; a head-to-head record is "my wins – their wins" (ties award both).
- Phone-first: 320/360/390px, no horizontal scroll, >=44px tap targets, visible focus, Escape closes overlays, reduced motion respected.
- No webfonts, external images, new dependencies or autoplay motion.
- `node --check` each touched `.js`; full `npm test` green; browser smoke with a disposable local game that is **never finished** (no published result); clear localStorage afterwards.

## Review Focus

- Round 1 and mid-game seats → `lastRoundDelta` returns null, UI shows "—", no crash. Test: Task 1 Step 1.
- Tie game and lowest-wins game → card headline "share the win" / positive margin, hero number is winner total. Test: Task 2 Step 1.
- Rival counts ignore games where only one of the pair played; ties count a win for both. Test: Task 2 Step 1.
- Card overlay close/Esc returns to podium, focus restored; opening an old game from Log does not auto-open. Check: Task 3 Step 5.
- Share unsupported (desktop) → PNG download still works; no forced step. Check: Task 3 Step 5.

---

### Task 1: Ranking helpers (pure, TDD)

**Files:** Modify `js/ranking.js`; Test `test/ranking.test.js`

**Interfaces:**
- Produces: `Ranking.lastRoundDelta(game, seatId)` → finite number (points in the last saved round for that seat) or `null`; `Ranking.pickFirst(seats, random)` → the chosen seat object or `null`, with injectable `random()` returning [0,1).

- [ ] **Step 1: Write the failing tests**

```js
test('lastRoundDelta returns the last round\'s points and null without them', ...);
// rounds [{points:{s1:2,s2:10}}, {points:{s1:5,s2:3}}] -> 5 and 3; empty rounds -> null;
// seat added mid-game (absent from last round) -> null.

test('pickFirst picks a seat deterministically from injected randomness', ...);
// 3 seats, random ()=>0 -> first; ()=>0.999 -> last; [] -> null.
```

- [ ] **Step 2: Run RED** — `npx node --test test/ranking.test.js`; expect 2 failures (`... is not a function`).

- [ ] **Step 3: Implement**

`lastRoundDelta`: take `game.rounds[game.rounds.length - 1].points[seatId]`; return it only when `Number.isFinite`. `pickFirst`: `seats[Math.floor(random() * seats.length)]` with a `null` guard and a clamped index. Export both on the `Ranking` object.

- [ ] **Step 4: Run GREEN** — expect all ranking tests pass.

- [ ] **Step 5: Commit** — `git commit -m "Add last-round points and first-player helpers"`.

---

### Task 2: Leaderboard helpers (pure, TDD)

**Files:** Modify `js/leaderboard.js`; Test `test/leaderboard.test.js`

**Interfaces:**
- Produces: `Leaderboard.rivalries(results, key)` → `[{key, name, games, wins, theirWins}]` sorted by games desc, wins desc, name; `Leaderboard.cardData(game, result)` → `{gameName, dateLabel, winners:[name], winnerTotal, margin, standings:[{name, emoji, total, isWinner}]}`.

- [ ] **Step 1: Write the failing tests**

```js
test('rivalries counts shared games, ties and ignores solo appearances', ...);
// results with Maya+Sam 3x (Maya wins 2, one tie) and Maya+Zsolt 1x (Zsolt wins):
// rivalries(..., 'p_maya') -> Sam {games:3, wins:3, theirWins:1}; Zsolt {games:1, wins:0, theirWins:1}.
// a result listing only Zsolt must not create a rival.

test('cardData handles a clear win, a tie and a lowest-wins game', ...);
// clear: winnerTotal 128, margin 13, winners ['Maya']; tie: two winners, margin 0;
// lowest-wins: winner total 128, next 141, margin 13 (positive).
```

- [ ] **Step 2: Run RED** — `npx node --test test/leaderboard.test.js`; expect failures.

- [ ] **Step 3: Implement**

`rivalries`: iterate unique result ids, find the player's entry, count each other key once per result, increment wins from each `entry.win` flag. `cardData`: use `Ranking.rank(game, game.rules && game.rules.winner === 'lowest')` for totals/winners; margin = absolute difference between the winner total and the next **distinct** total, 0 for a shared win; date label from `game.startedAt` or `result.at`; game name from `game.typeName` or `gameNameOf(result)`.

- [ ] **Step 4: Run GREEN** — expect all leaderboard tests pass.

- [ ] **Step 5: Commit** — `git commit -m "Add rivalries and card data helpers"`.

---

### Task 3: UI and CSS wiring

**Files:** Modify `js/ui.js`, `styles.css`, `index.html` if a modal script tag is needed (prefer none)

**Interfaces:**
- Consumes: both tasks' helpers; existing `boardData()`, `playersRows()`, `renderGame`, `renderPodium`, `end-game` handler (~ui.js:1876).
- Produces: `ui.firstPick`, `ui.rivalsKey`, `ui.victoryGameId` state; new actions `who-goes-first`, `open-rivals`, `close-rivals`, `open-victory`, `close-victory`, `share-victory`.

- [ ] **Step 1: Score tiles and who-goes-first**

In `renderGame`, render `.tile-delta` under each total using `Ranking.lastRoundDelta(game, seat.id)` (`—` when null). Add a "Who goes first" button to `.score-rules`; click handler calls `Ranking.pickFirst(game.seats, Math.random)` and sets `ui.firstPick` (seat name/emoji), rendered as a status chip. Picking again re-rolls.

- [ ] **Step 2: Rivals panel**

Add a "Rivals ›" button in `playersRowHtml` (`data-action="open-rivals"`, `data-key`). Click sets `ui.rivalsKey` and renders a fixed bottom-sheet dialog listing `Leaderboard.rivalries(boardData().results, key)` with each rival's record; Close button + Escape key; focus moves into the sheet and returns to the trigger button on close. Empty state: "Play a game with someone to see your records."

- [ ] **Step 3: Victory Card overlay**

In the `end-game` handler set `ui.victoryGameId = game.id` before navigating to the podium. `renderPodium` appends the overlay when `ui.victoryGameId === gameId`, with a `<canvas>` drawn by `drawVictoryCard(canvas, Leaderboard.cardData(target, result))` (900×1200 match-ticket design from the mockup: gold top rule, game + card number, winner headline, big total, margin, standings below a dashed line, brand footer). Buttons: **Share card** (`navigator.share({files:[File]})` when available, else PNG download with a short hint) and **Close (Esc)**. Also add a small "Victory card" button on the podium for older finished games. Keep Close/Esc returning to the podium and restore focus.

- [ ] **Step 4: CSS**

Append a `/* MOBILE DELIGHT */` section: `.tile-delta` (small tabular numerals, green/gold for positive, muted otherwise), `.first-pick` chip, `.rivals-sheet` (full-width bottom sheet <=620px, max-width 520px desktop, safe-area padding, 44px rows), `.victory-overlay` (fixed, dimmed behind, centered canvas scaled with `max-width:100%; max-height:80vh`, no horizontal scroll), focus-visible rings, reduced-motion respect.

- [ ] **Step 5: Visual smoke (disposable game only)**

Serve locally, set 320/390px viewport, start a local game with 3 players, save 2 rounds (note "—" in round 1, then +N deltas), roll who-goes-first, open the Rivals sheet from Players, and verify the card canvas via the podium route **without finishing the game** (inject `ui.victoryGameId` state through the podium's "Victory card" button on a previously finished game from the Log if needed — never create a new published result). Assert no scroll overflow, no console errors, Escape/Close work. Clear localStorage; close the browser.

- [ ] **Step 6: Commit** — `git commit -m "Game-night delight UI: last-round points, rivals sheet, Victory Card, first-player picker"`.

---

### Task 4: Verify, ship, review

**Files:** none (verification + publication)

- [ ] **Step 1:** `npm test` — expect 265 pass / 0 fail (261 + 2 ranking + 2 leaderboard); `node --check` on touched files.
- [ ] **Step 2:** `git push origin main`, `firebase deploy --only hosting --project solo-scorekeeper`; verify live JS contains the four helpers and new actions.
- [ ] **Step 3:** dispatch fresh reviewer over the plan range with spec + plan + Review Focus; grade and fix Critical/Important, ledger minors.
