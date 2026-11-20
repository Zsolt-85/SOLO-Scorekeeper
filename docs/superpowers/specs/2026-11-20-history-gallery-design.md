# History gallery (design)

Date: 2026-11-20 · Status: awaiting user sign-off · Size: project (new screen)

## Intent and why

Finished games are already stored as immutable results. The user wants a **read-only
visual history** — not a stats dashboard, not an editor. Mockups A (timeline), B
(card gallery) and C (stats) were shown; the user picked **B**: every game as a mini
Victory Card, opening the full shareable card on tap.

## Decisions

- New **History** screen at `#/history`, linked from the sidebar between Leaderboard
  and Players. Games are shown newest first.
- Each tile is a **mini match card** (CSS, not canvas): game + date, winner headline,
  hero total, and a small podium bar strip with every player's emoji. Tap opens the
  full Victory Card overlay with **Share card** and **Close (Esc)** — the same card
  and behaviour used after finishing a game.
- Data comes from the **stored results** the app already fetches (`boardData()`:
  Firestore board when available, local finished games as fallback). **No new writes,
  no editing, no deletions** from this screen.
- Colour for result-only players uses `Leaderboard.colourFor(key)`, since stored
  result entries carry name/emoji/total/win but no colour.

## Parts

1. Pure `Leaderboard.resultCardData(result)` in `js/leaderboard.js`: derives the same
   card shape as `cardData` (`gameName`, `dateLabel`, `winners`, `winnerTotal`,
   `margin`, `standings` with `name/emoji/color/total/isWinner`) from a stored result.
   Winners come from each entry's `win` flag; ties give several winners; margin is the
   absolute gap to the next distinct total. TDD tests for clear win, tie and
   lowest/highest-wins results.
2. `js/ui.js`: `renderHistory()` builds the gallery from results (newest first), with
   a small empty state. Add the route, the sidebar link and a `views.history` section.
   Add `open-history-result` / `close-history-result` actions; the detail overlay
   reuses `drawVictoryCard` with the derived data (allow it to accept an optional data
   object instead of loading the current game) and the existing focus trap/Escape.
3. `styles.css`: responsive gallery grid (1 column <=520px, 2 columns above, max 3),
   mini-card styles, and reuse of `.victory-overlay` for the detail view.

## Non-goals / anti-goals

- No game editing, score changes, deletes or new result writes.
- No stats/trends dashboard (mockup C) in this pass.
- No webfonts, external images or new dependencies.

## Verification

- `npm test` green, `node --check`.
- Browser check at 320/390/768px with the app's real two results: both cards render,
  avatars/bars/scores visible, tapping opens the full card, Escape/Close return to
  History, no horizontal scroll.
- Commit, push, deploy, fresh reviewer per the established workflow.
