# Remove duplicate Friends and Community pages (design)

Date: 2026-11-21 · Status: awaiting user sign-off · Size: small change

## Intent and why

The **Friends** page is a stale duplicate of Players: it reads only local finished
games (not the shared board), keys people by raw name, and offers no actions. The
**Players** page already provides the shared pool, add/remove/edit and the Rivals
head-to-head panel. **Community** is a stale duplicate of the Library shelf with a
"most played" line. Both are early scaffolding with no social backend; a real friend
graph would require accounts, which deliberately do not exist in this app.

User approved removing **both** pages (PM recommendation, 2026-11-21).

## Changes

- `index.html`: remove the two sidebar links and the two `<section id="view-…">` views.
- `js/ui.js`: remove the `friends`/`community` entries from the `views` map, their
  `render()` dispatch branches, and the `renderFriends()` / `renderCommunity()`
  functions.
- Add redirect guards in `render()` so existing bookmarks keep working:
  `#/friends` → `#/players`, `#/community` → `#/library` (same pattern as `#/home`).
- No CSS changes: the only classes unique to those renderers have no stylesheet rules.

## Non-goals / anti-goals

- No accounts, invites, favourites or new social features.
- No result, pool, storage or sync changes; no data deleted.
- Do not break deep links or leave a hidden-view "black screen" for old hashes.

## Verification

- `npm test` green, `node --check`.
- Browser check: sidebar has five items; all remaining routes render; old hashes
  redirect correctly; 320/390px hamburger still opens/closes.
- Commit, push, deploy, fresh reviewer.
