# Game-night delight — last-round points, rivals panel and Victory Card (design)

Date: 2026-11-20 · Status: approved pending user sign-off · Size: project (four small features)

## Intent and why

The 2026-11-20 benchmark (`docs/research/2026-11-20-scorekeeper-benchmark.md`) showed
SCORELOCK is strong on live scoring + shared history but flat at the two moments
players actually feel: **during** a game and **right after** it. Competitors win those
moments with per-round feedback, rivalries and shareable result cards. Add those
moments without accounts, installs or changing the immutable result model.

## Decisions made with the user (visual mockups, 2026-11-20)

- **Score tile:** keep the big accumulated total and add a **small last-round delta**
  (`+12` in gold/green for the round winner, muted `+4` for others, `—` in round 1).
  User picked this version explicitly.
- **Victory Card:** an **optional overlay** shown after finishing — one hero number,
  standings, **Share card** and **Close (Esc)**. Nothing is shared unless the user
  taps Share; closing just returns to the game. User asked for a stronger design than
  the first mockup; the refined "match ticket" mockup is the direction.
- **Head-to-head:** option **C** — a "Rivals ›" tap on each Players row opens a
  rivals panel with all head-to-head records. No cramped inline rival text.
- **Who goes first:** included as the fourth P0 from the benchmark — a one-tap random
  seat picker on the game page.

## Builder-check calls (settled by the designer)

- **Card timing:** auto-open **once**, right when a game is finished, on the podium
  route (`end-game` sets `ui.victoryGameId` before navigating). Close/Esc returns to
  that podium, not the game or library. Opening an old finished game from the Log
  does **not** auto-open, but the podium gets a small "Victory card" button to reopen.
- **Last-round number:** `Ranking.totalsFor` sums every round's points, so this is the
  **points contributed by the last round** (`rounds[last].points[seatId]`), not a
  difference between cumulative totals. `null` when there is no round or no numeric
  entry for that seat (e.g. added mid-game), rendered as "—".
- **Card headline/margin:** all co-leaders are winners (existing tie rule). One winner
  → "Maya wins"; shared → "Maya & Tobi share the win". Margin is the **absolute** gap
  to the next distinct total (positive even in lowest-wins games); a shared win shows
  no "won by" line. The hero number is always the winner's total.

## Goals

- More feedback during play (last round) and a rewarding, optional finish (card).
- Turn the shared results we already store into stories (rivalries, streaks later).
- Keep every feature phone-first, keyboard-accessible, and offline-safe.

## Non-goals / anti-goals

- No accounts, backend, new storage, or changes to results/finish logic. Results stay
  immutable and keyed by name; losses remain absent from leaderboard rows (the user's
  earlier decision) — a head-to-head record is "my wins – their wins", not losses.
- No forced share step, no webfonts, no external images, no new dependencies.
- No achievements/ELO/BGG/tournaments yet (P2 from the benchmark).

## Architecture and parts

1. **Last-round delta** — pure `Ranking.lastRoundDelta(game, seatId)` in
   `js/ranking.js`: returns `null` in round 1 or for unfinished rounds without points,
   otherwise the signed points difference between the last saved round and the one
   before. `renderGame` renders it in the existing `.tile` under the total with a new
   `.tile-delta` style. No storage change.
2. **Rivals panel** — pure `Leaderboard.rivalries(results, key)` in
   `js/leaderboard.js`: for each other player appearing in the same results, count
   shared games and wins for each side (ties give both a win, matching `resultFor`).
   Returns sorted `[{key, name, games, wins, theirWins}]`. Players row gets a
   "Rivals ›" button; clicking opens a dialog/sheet listing that player's rivals with
   records, with a Close button and Escape-to-close. Focus moves into the panel and
   returns to the triggering button on close.
3. **Victory Card** — pure `Leaderboard.cardData(game, result)` (or `Ranking`
   equivalent): `{gameName, date, winnerName, winnerTotal, margin, standings}` from
   the finished game. `js/ui.js` draws it with the Canvas 2D API (900×1200, system
   fonts, gold/navy match-ticket layout from the mockup) into an off-screen canvas,
   shows the PNG in a `<dialog>`-style overlay with **Share card** / **Close (Esc)**.
   Share uses `navigator.share({files})` when available; otherwise a PNG download
   with a short hint ("Saved — send it from your photos"). Canvas rendering is visual,
   not unit-testable; the data builder is.
4. **Who goes first** — pure `Ranking.pickFirst(seats, random)` taking an injectable
   `random()` so tests are deterministic; `renderGame` gets a small button that picks
   a seat and shows the picked name in a status chip for that round.

## Approaches considered

- Show rival records inline on each row (mockup A/B) — rejected by user: cramped on phones.
- Full rivals detail sheet (C) — chosen: one extra tap, all the detail.
- Forced share step after a game — rejected: sharing is optional by user request.
- Draw the card in SVG/DOM — rejected: PNG via canvas is directly shareable; system
  font rendering and emoji are acceptable on all supported browsers.

## Acceptable tradeoffs / left to the builder

- Head-to-head wins can exceed shared-game count when ties award both players; the
  panel labels the two numbers as wins, not games.
- Canvas emoji glyphs differ slightly by platform; no external icon set by constraint.
- Web Share with files is unsupported on desktop; download fallback must still work.
- TDD in Node for all pure helpers; `node --check`; full suite green; visual browser
  checks at 320/390px with a disposable local game (never finish it, no results
  published); commit → push → deploy → fresh reviewer per the established workflow.
