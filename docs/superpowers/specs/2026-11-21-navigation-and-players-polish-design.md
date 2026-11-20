# Navigation crossfade and calmer Players rows (design)

Date: 2026-11-21 · Status: user picked option A from mockups · Size: small change

## Intent and why

The current navigation animates only the incoming view after an instant swap, which
reads as a flash. The Players rows show three wide text buttons under every player,
which looks like a form. The user approved the mockups: a real crossfade and a single
`⋯` action button opening a labelled sheet.

## Decisions

- Use the browser's **View Transitions API** on `hashchange` (where supported) so the
  old main content fades/slides out as the new content fades/slides in (~260 ms).
  Animate only `#app` (`view-transition-name: app-view`) so the sidebar stays put.
  Keep the existing `route-enter` class as the fallback for browsers without the API.
- Players rows become one clean line: avatar, name + record, win %, and one 44px
  `⋯` button. Tapping it opens a bottom sheet with **Head-to-head records**, **Edit
  player**, **Remove player** — the existing actions, unchanged. Escape/Close return
  focus to the triggering button.
- Fold in the motion reviewer's Important finding: reduced-motion skips the startup
  `revalidateShell()` entirely (not just the 720ms wait); the splash sweep animation
  is disabled for reduced motion; primary buttons get a working `:active` response.

## Non-goals

- No route, data, result, pool or scoring changes; no new dependencies.
- No icon-only destructive button; all actions remain labelled inside the sheet.

## Verification

- `npm test` green, `node --check`; browser: navigate between screens and confirm
  crossfade (no blank flash), open the `⋯` sheet and run each action, Escape/Close
  work, reduced-motion still instant, no horizontal scroll at 320/390px.
- Commit, push, deploy.
