# Mobile-first interface facelift — SCORELOCK (design)

Date: 2026-11-17 · Status: awaiting user approval · Size: project (multi-screen)

## Intent and why

The app is used mainly on a phone. Today it is a desktop layout merely shrunk: on a 390px screen the Players rows collapse names to 35px and wrap "9 games · 7 wins" into four lines; top-bar buttons wrap onto two lines; hero cards and gutters waste the narrow width. Make every screen look deliberate on a phone while keeping the navy-and-gold SCORELOCK identity and every existing behaviour (scores, sync, Edit) untouched.

## Goals

- Phone-first layout: 320/360/390/430px widths, no horizontal scroll, no broken or clipped words, no wrapped button labels.
- One consistent system across Library, game box, game table, podium, Leaderboard, Players, Hall of Fame, log and the add/edit panels.
- Names, records and percentages readable at a glance; Edit/Remove comfortable thumb targets (>=44px).
- Keep brand: `--bg #0d1020`, `--gold #f0b429`, system font stack only (no webfonts).

## Non-goals / anti-goals

- No changes to app logic, data, storage or view markup structure — this is a CSS-led facelift. The only HTML touch is the viewport meta attribute above.
- No new visual language or redesign of the brand (approach 2 was offered and declined).
- No emoji-as-icons system: player emoji are content/avatars, not UI icons.

## Approaches

1. **Mobile-first layout system (chosen):** consolidate the many stacked CSS "makeup passes" into one predictable responsive system: shared top bar, card, stat-row and action-row rules, plus per-screen mobile overrides. Low risk because markup, bindings and state are untouched.
2. New visual language (declined): restructure markup and typography into a bolder design; higher risk and much larger surface to re-verify.
3. Players-only rescue (declined by user): would leave the other screens looking shrunken.

## Design system

- **Colour (unchanged):** bg `#0d1020`, panel `#171a30`, panel-2 `#1f2340`, line `#2b3054`, text `#f2f3ff`, muted `#9aa0c8`, gold `#f0b429`, lose `#ef7f6b`.
- **Type:** system UI stack only; 16px base; page title 1.5rem, card title 1rem, stats 0.85rem with `font-variant-numeric: tabular-nums`; long text uses ellipsis or wraps only between words — never mid-word.
- **Spacing:** 16px page gutter on phones (body padding removed at <=900px so gutters don't stack), 12px gaps inside cards, 24px between sections; safe-area insets respected.
- **Layout concept:** one column, full-width cards, left-aligned content. Shared top bar: title line, then a no-wrap row/2-column grid of actions. Players card: avatar + name + record on the top line(s), big gold % at the right, Edit/Remove in a full-width action row beneath.

## Builder-check calls (settled by the designer)

- Add `viewport-fit=cover` to the existing viewport meta tag in index.html (one
  attribute, no structural markup changes) so safe-area insets actually apply.
- Podium on phones: keep the flex bar chart, but allow wrapping into rows of up
  to three bars with ellipsized names (no horizontal scroll); with 6–10 players
  a single 320px row cannot be legible. Bars across rows are compared less
  directly — accepted tradeoff on a phone.
- Shelf: add only the new <=520px single-column rule; keep the existing 3
  columns at >=760px and 4 at >=1040px, so 768px stays exactly as today.

## Screen rules

- **Top bar (all screens):** buttons `white-space: nowrap`; a two-column grid at <=620px for 3+ actions; no wrapping labels or scattered alignment.
- **Players:** CSS grid areas turn the existing flex row into `disc / name + record / %` on row 1 and two equal 44px buttons on row 2; name ellipsis, record nowrap, favourite game on its own line when space allows.
- **Leaderboard:** compact place/disc columns on small screens; record nowrap with smaller font; % always visible in gold.
- **Library / box hero:** smaller cover on phones, copy and actions underneath; action buttons in a regular grid; shelf stays 1 column at <=520px, 2 at wider.
- **Game table / podium / log / Hall of Fame:** score tiles keep totals on one line; podium bars fit 320px; log rows stack label above value; no clipped chips.
- **Panels/forms:** inputs and buttons full width on phones, emoji grid fits 320px without overflow; visible focus preserved; reduced motion respected.
- **Desktop:** >=901px sidebar/nav and 2-column lists remain as today; this work must not regress desktop.

## Verification

- Screenshot sweep at 320, 360, 390, 430px of every screen above, plus 768/1280px regression checks.
- Assert `documentElement.scrollWidth <= innerWidth` on each route/size; read back computed element widths for Players name/record to prove no collapse.
- `npm test` green; `node --check` touched files (CSS-only change touches no JS, so suite is a regression guard).
- Live URL verification after deploy; report screenshots to the user.

## Left to the builder

- Prefer a single final consolidated CSS section over editing the three historical makeup-pass blocks in place, then remove only rules proven redundant by the visual sweep.
- Keep all selectors tied to existing classes/attributes; no markup changes required.
- Commit, push, Firebase hosting deploy (includes the pending reviewer game-fidelity fix), then fresh reviewer.
