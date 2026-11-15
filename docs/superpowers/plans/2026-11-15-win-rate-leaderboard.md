# Win-rate leaderboard (losses removed) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank the leaderboard strictly by win ratio (wins ÷ games played, highest first) and remove "losses" as a displayed/tracked concept everywhere outside an active game.

**Architecture:** Pure data change in `js/leaderboard.js` (drop the `losses` field from rows in `aggregate`/`allPlayers`; `winPercent` = wins/games already exists and `rankRows` already sorts by rate) plus wording changes in three display strings in `js/ui.js`. No stored result, write path, or sync code changes — yesterday's registered scores are untouched.

**Tech Stack:** Vanilla JS (browser globals + node:test), existing 250-test suite.

**Spec:** `docs/superpowers/specs/2026-11-15-win-rate-design.md`

## Global Constraints

- Never modify `resultFor`, stored results, or any sync/write path (user's scores in Firestore must remain).
- In-game displays untouched: round standings and the `Loser` badge (`entry.isLoser`, ui.js ~line 1668/1677) stay exactly as they are.
- `js/ranking.js` `record()` keeps returning `{wins, losses}` (pure, tested); only display wording changes.
- `js/ui_old.js` is a deliberate legacy backup — do not touch.
- `node --check` every touched `.js`; full `npm test` must be green before commit.

## Review Focus

- Tie at best score → both players get a win and one game each. Test: Task 1 Step 1 (new tie aggregation test).
- Single win wording → "1 win" (not "1 wins"). Pinned in Task 2 exact strings; verified visually in Task 3.
- Zero games → "No games yet" unchanged. Existing aggregate tests + Task 3 visual check.
- Order → ranked rows sorted by win ratio top-to-bottom, MIN_GAMES = 3 gate unchanged. Existing `rankRows` tests keep passing (Task 1 Step 4).
- Result immutability → suite green with zero changes to firebase/sync/space write tests (Task 3 Step 1).

---

### Task 1: Remove `losses` from leaderboard rows (pure half)

**Files:**
- Modify: `js/leaderboard.js` (lines ~184, ~207, ~231 in `aggregate`; ~252, ~276, ~301, ~322 in `allPlayers`)
- Test: `test/leaderboard.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `aggregate(pool, results, gameId)` and `allPlayers(pool, results)` rows shaped `{key, name, emoji, color, games, wins, ...}` — **no `losses` property**. `winPercent(row)`, `rankRows(rows)`, `mergePlayers(...)` signatures unchanged.

- [ ] **Step 1: Update the tests first (RED)**

In `test/leaderboard.test.js`:
- Rename test at line 110 to `'aggregate merges profiles and results into games and wins'`; delete its three `assert.equal(<x>.losses, ...)` lines (125, 131, 150).
- Delete the `losses` assertions at lines 279 and 326.
- Add one new test after the aggregate tests (exact assertions, tie = user decision):

```js
test('aggregate counts every best-score player a win in a tie', () => {
  const results = [tieResult()]; // two players, equal best total, both marked win:true
  const rows = Leaderboard.aggregate([], results, 'solo');
  const byName = {};
  rows.forEach((row) => { byName[row.name] = row; });
  assert.equal(byName.maya.games, 1);
  assert.equal(byName.maya.wins, 1);
  assert.equal(byName.sam.games, 1);
  assert.equal(byName.sam.wins, 1);
});
```

Build `tieResult()` from the existing fixtures pattern in this file (a result with `players: [{key:'p_maya', name:'Maya', total:10, win:true}, {key:'p_sam', name:'Sam', total:10, win:true}]`, `id`/`at`/`game:'solo'` like neighbouring tests). Reuse an existing fixture if the file already has a tie-shaped result builder.

- [ ] **Step 2: Run the leaderboard tests, verify RED**

Run: `npx node --test test/leaderboard.test.js`
Expected: FAIL — `losses` property still exists in rows, so deletion assertions don't apply; specifically the new-shape tests fail on the extra property/no-losses expectations.

- [ ] **Step 3: Remove `losses` from `js/leaderboard.js`**

Delete the six `losses: 0,` initialisers (two per row shape in `aggregate`, two in `allPlayers`), the two `else row.losses += 1;` lines, and the `losses: row.losses,` mapping in `allPlayers`' returned object. Nothing else changes.

- [ ] **Step 4: Run tests, verify GREEN**

Run: `npx node --test test/leaderboard.test.js`
Expected: PASS (all, including the new tie test and the untouched `rankRows` ordering tests).

- [ ] **Step 5: Commit**

```bash
git add js/leaderboard.js test/leaderboard.test.js
git commit -m "Drop losses from leaderboard rows; ties stay shared wins"
```

---

### Task 2: Reword the three display strings (ui.js)

**Files:**
- Modify: `js/ui.js` — `recordHtml` (~line 553), `playersRowHtml` (~line 1097), `boardRowHtml` (~lines 1435-1438)

**Interfaces:**
- Consumes: Task 1 rows (`games`, `wins`); `Ranking.record()` unchanged shape `{wins, losses}`.
- Produces: display only; no signatures.

- [ ] **Step 1: Reword `recordHtml` (game-setup player card)**

Replace the return (keep the line-552 empty check as is):

```js
return '<span class="rec">Won ' + record.wins + ' of ' + (record.wins + record.losses) + '</span>';
```

and update the comment above the function to describe "Won 2 of 3".

- [ ] **Step 2: Reword `playersRowHtml` (Players page)**

Replace the `record` ternary's truthy branch:

```js
? row.games + ' game' + (row.games === 1 ? '' : 's') + ' &middot; '
  + row.wins + ' win' + (row.wins === 1 ? '' : 's')
```

(The `pct` span and "No games yet" branch stay.)

- [ ] **Step 3: Reword `boardRowHtml` (leaderboard rows)**

Replace the `record` ternary's truthy branch:

```js
? row.games + ' game' + (row.games === 1 ? '' : 's') + ' &middot; '
  + row.wins + ' win' + (row.wins === 1 ? '' : 's')
```

(The highlighted `pct` from `Leaderboard.winPercent(row)` stays; "No games yet" stays.)

- [ ] **Step 4: Syntax check**

Run: `node --check js\ui.js`
Expected: no output (clean).

---

### Task 3: Verify, ship, deploy

**Files:**
- Modify: none (verification + publication only)

**Interfaces:**
- Consumes: Tasks 1–2 complete; established publish workflow (commit → push → `firebase deploy --only hosting --project solo-scorekeeper`).

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: `tests 250+1 (new tie test) · pass all · fail 0`. Zero failures; firebase/sync/space tests untouched and green (proves stored results untouched).

- [ ] **Step 2: Visual spot-check in the user's Chrome (browse is connected)**

Serve locally (`node <temp>/serve.js C:\Projects\counter 8099` in background), open `http://127.0.0.1:8099/#/leaderboard` and `#/players` via the browse session; confirm rows read "N games · N wins" with the % highlighted, no "L"/"Lose" anywhere outside an active game, and order is highest ratio first. Close the server after.

- [ ] **Step 3: Commit, push, deploy**

```bash
git add js/ui.js docs/
git commit -m "Leaderboard wording: games and wins, no losses"
git push origin main
firebase deploy --only hosting --project solo-scorekeeper
```

- [ ] **Step 4: Verify live**

Fetch `https://solo-scorekeeper.web.app/js/ui.js` and `js/leaderboard.js`; confirm `'Lose '` absent from recordHtml string, `'win' + (row.wins === 1` present, and `losses` absent from leaderboard.js. Report the live URL to the user.
