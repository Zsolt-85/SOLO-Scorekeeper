# Win-rate leaderboard — losses removed (design)

Date: 2026-11-15 · Status: approved pending user sign-off · Size: small change

## Intent and why

The leaderboard should rank players by **wins ÷ games played** and stop treating
"loser" as a tracked stat. During a game the loser still shows at the table
(round standings, "Loser" badge) — that is untouched. But on any leaderboard,
Players page or record card, a player is measured by how often they **win**
against how many games they **played**, never by a loss column. In a 4-player
game, three people didn't win — that must not read as three "losses" against
them.

## Data safety (the user's key requirement)

Yesterday's real scores are registered results in Firestore. Results store, per
player: key, name, emoji, total and a `win` boolean. **Losses were never stored
in results** — they were computed on the fly when building leaderboard rows.
This change does not touch `resultFor`, stored results, or any sync/write path,
so all registered scores remain exactly as they are.

## Approaches considered

1. **Clean removal (chosen)** — delete `losses` from leaderboard rows and every
   display string; reword records to "wins out of games played". The concept
   ceases to exist on the board.
2. Hide-but-keep — change strings only, keep computing losses internally.
   Rejected: the user explicitly wants the track eliminated.
3. Removal + card redesign — same as 1 plus make the % the hero of each card.
   Rejected for now (user picked 1); the % is already displayed prominently.

## Decided details

- **Ties:** every player at the best score counts a win (already the behaviour,
  `entry.total === best` in ranking.js; covered by an explicit test).
- **Order (user-emphasised):** the leaderboard must be sorted **highest win
  ratio first, top to bottom**. `rankRows` already does this (exact
  cross-multiplied rate comparison, games played as tiebreak); this change
  keeps it and the tests must keep proving it.
- **`js/leaderboard.js`:** remove the `losses` field from rows in `aggregate`
  and `allPlayers` (both pool-seeded and result-only rows). `winPercent`
  (`wins/games`), `rankRows` (rate ranking, MIN_GAMES = 3) and `mergePlayers`
  are unchanged.
- **`js/ui.js` display strings:**
  - Leaderboard row (`boardRowHtml`): `10 games · 3 W · 7 L` →
    `10 games · 3 wins`, with the existing highlighted `30%` next to it.
  - Players page row (`playersRowHtml`): `10 games · 3 W` → `10 games · 3 wins`
    (singular/plural handled), `%` stays.
  - Game-setup player card (`recordHtml`, uses `Ranking.record`):
    `Win 2 · Lose 1` → `Won 2 of 3`. `Ranking.record` itself keeps returning
    `{wins, losses}` (it is pure and tested); only the wording changes — the
    "3" is games played.
- **In-game displays untouched:** round standings and the `Loser` badge
  (`entry.isLoser`) stay exactly as they are.
- **Tests:** update the six `losses` assertions in `test/leaderboard.test.js`
  to the new row shape (games/wins only); keep/add a tie test asserting both
  best-score players get a win and one game each.

## Left to the builder

- Grep the whole repo for any other `losses` consumer before editing.
- `node --check` touched files; full `npm test` green; visual spot-check of the
  leaderboard and Players page (desktop width is enough; mobile sweep is a
  separate known-open item).
- Commit, push and Firebase-hosting deploy per the established workflow.
