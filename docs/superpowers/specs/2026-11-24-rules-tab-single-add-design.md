# Rules tab and a single Add-game entry (design)

Date: 2026-11-24 · Status: user picked option A from the mockup · Size: small change

## Intent and why

Two inconsistencies found by the user:
1. The game page's **House rules** button opens `#/box/<id>/rules`, but the tab bar
   only has Table / Hall of Fame / Log — no tab is highlighted, so the page feels
   stranded and doesn't match the other three surfaces.
2. **Add a game** appears three times: sidebar link, Library header button, and the
   Library shelf "+" tile. The user wants one.

## Decisions

- Add a **Rules** tab to the game page tab bar (Table / Hall of Fame / Log / Rules),
  so `#/box/<id>/rules` highlights it and renders the existing `houseRulesHtml`
  inside the same material panel language as the other tabs.
- Keep **one** Add-game entry: the shelf "+" tile on the Library, where games live.
  Remove the sidebar "Add a game" link and the Library header "Add a game" button.
- Correct the global "How to play" copy that claims the scoring switch is on the
  home screen — it lives in each game's House rules.
- Tighten tab padding at phone widths so four tabs fit without horizontal scroll.

## Non-goals

- No changes to the House rules form logic, scoring, results, pool or sync.
- No removal of the `open-new-game` action — the shelf tile still uses it.

## Verification

- `npm test`, `node --check`; browser: Rules tab highlights and form renders;
  exactly one Add-game control; add flow still opens; four tabs fit at 320/390px
  with no overflow; global How to play copy correct.
- Commit, push, deploy.
