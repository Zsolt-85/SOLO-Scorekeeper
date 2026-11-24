# Tabletop material depth (design)

Date: 2026-11-22 · Status: user picked option 2 from phone-sized mockups · Size: small change

## Intent and why

The user wants a phone-first 3D *look* — volume visible in a still screenshot, no
hover dependency. Mockups A/B/C were shown, then three static-depth styles; the user
picked **2 · Tabletop material**: cards look like thick cardboard/paper resting on a
table, with a lit top face and a dark 6–7px edge beneath.

## Decisions

- Add material tokens per skin: `--face-top`, `--face-bottom`, `--edge`, `--rim`,
  `--contact`. Each skin gets its own paper/felt/navy material; the parchment splash
  stays fixed and untouched.
- Apply to large surfaces (`.panel`, `.continue-strip`, `.history-card`, `.box-card`,
  `.skin-card`, `.victory-sheet`, `.rivals-sheet`): top-to-bottom face gradient, bright
  inset top rim, a solid `--edge` thickness shadow and a soft contact shadow.
- Rows and tiles (`.board-row`, `.pr-row`, `.tile`) get a thinner 3px edge so lists
  stay calm. Cover art gets the thick cardboard edge.
- Buttons get a small extruded edge; the gold primary keeps its own brass edge.
- Hover/press remain desktop/touch bonuses only — the resting look carries the 3D.
- No JS, no images, no result/data changes. Reduced motion unaffected (static look).

## Non-goals

- No pointer-tracking tilt, no whole-screen rotation, no new dependencies.
- No contrast regressions: text colours stay as approved in the last audit.

## Verification

- `npm test`, `node --check`; browser screenshots of Library, Players, History and a
  game box across all four skins at 390px; confirm depth is visible without hover,
  text remains readable, no horizontal scroll.
- Commit, push, deploy.
