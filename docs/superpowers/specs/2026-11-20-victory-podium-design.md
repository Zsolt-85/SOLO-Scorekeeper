# Victory Card podium bars (design)

Date: 2026-11-20 · Status: awaiting user sign-off · Size: small change

## Intent and why

The Victory Card is live and shareable, but the standings are a flat text list. The
user wants the reward screen to look like a podium: bars, scores, names and each
player's animal avatar visible. Mockups A (score bars) and B (classic 1‑2‑3 steps)
were shown; the user picked **A**.

## Decisions

- Keep the match-ticket frame, winner headline, hero total, margin, Share and Close
  behaviour exactly as shipped — this is a change to the standings area only.
- Draw a **bar row per player** on the canvas, in finishing order with the winner
  first. Bar height encodes **finishing place** (tallest = winner), not points; the
  true score is printed above each bar, with a caption "tallest bar = winner · scores
  on top". This keeps lowest-wins games intuitive (Maya's 128 is the tallest bar even
  though other scores are higher).
- Each bar carries the player's **coloured disc + animal emoji + name**. Emoji uses a
  font stack of system emoji fonts; the coloured disc and name remain if a glyph is
  missing.
- B (decorative 1‑2‑3 steps with a text tail) was rejected — loses 4th/5th place and
  bar heights stop meaning anything.

## Parts

1. `Leaderboard.cardData`: add `color` to each standing entry (from `seat.color`),
   keeping the rest of the shape. Extend the existing cardData test.
2. `drawVictoryCard` in `js/ui.js`: replace the text standings loop with bars sized
   by rank (descending), coloured discs with emoji, names below and scores above.
   Scale bar width/emoji size for 5–10 players; keep dynamic canvas height.
3. `styles.css`: no change needed — the canvas scales via existing `#victory-canvas`.

## Non-goals / anti-goals

- No new result data, no new share mechanism, no webfonts, no external images.
- No change to tie/lowest-wins rules in cardData; only presentation changes.

## Verification

- 265+ tests green; `node --check`.
- Visual browser check with a local-only finished fixture (never publish): 5-player
  card shows all five bars, avatars, names and scores, no clipping at 320/390px;
  Share/Close still work.
- Commit, push, deploy, fresh reviewer per the established workflow.
