# SOLO Scorekeeper

A tiny, private score keeper for the card game **SOLO** (and **UNO**). Add players, type each round's points, and watch an animated podium crown the winner. Runs entirely offline in the browser — no server, no accounts, no dependencies. Optionally, a group can share one scorekeeper between phones.

**Scoring.** By default the **fewest points wins** (our house rules). Switch to **most points wins** on the home screen for standard UNO/SOLO scoring. The rules for both games are built into the app under **Rules**.

## Run it

Open `index.html` in any modern browser. There is no build step and nothing to install.

- **Home** — add players (emoji + name) with the *Add player* card, tap a card to pick who is playing, then start a game. *Edit players* opens manage mode, where each card gets edit and delete controls. Games still in play are listed under **Playing now**. A card also shows that player's record in this scorekeeper (`Win 3 · Lose 1`) as soon as they have finished a game.
- **Game** — one points box per player each round, running totals, undo, and the option to add a late player.
- **Podium** — animated reveal. Lowest total wins by default (gold bar + crown); flip the scoring mode for UNO.
- **History** — every finished game, newest first; tap one to reopen its podium. Each row keeps the crown the game was actually played for, so flipping the scoring mode later never rewrites an old result.
- **Rules** — how SOLO and UNO scoring works, card by card.
- **Refresh** — the circular-arrow button in the top bar fetches the newest build and reloads. It waits for any lobby write to reach the server first, and warns before throwing away points that are typed but not saved, so no score is lost.

Scores live in the browser's `localStorage` (key `noting-more.v2`) and never leave the device. A `noting-more.v1` document from an older version is upgraded automatically on first load.

## Playing together

One phone can keep score for the whole table. On **Home**, *Create a lobby* is a single tap: an 8-character code (letters and numbers, no look-alikes) appears in the header straight away, and tapping it copies it. Everyone else taps *Enter a code* and types it. From then on every phone sees the same players, the same rounds and the same live game, and a `● Live` line shows how many phones are connected. The name is optional — it stays *Shared lobby* until someone uses *Rename*.

- Anyone with the code can see **and edit** everything in that lobby while the game is still running. There are no accounts and no per-person identity — it is one shared scorekeeper.
- Finished games are shared too: every phone sees the same history and the same winners, and each player card carries the win/loss record from that history.
- Solo scores stay on the device. A lobby is a separate space, so leaving one (or joining another) never touches your own roster.
- While in a lobby the players, games and scores live on Google's servers under that code. Without a lobby, nothing leaves the browser.

Lobby mode needs a real origin (`https://` or `localhost`) because it loads the Firebase SDK; opening `index.html` from disk still works, in solo mode.

### Setting it up (one-time)

The app is wired to a Firebase project. `js/firebase.js` loads the SDK from the CDN only when a lobby is opened, and `js/firebase-config.js` holds the web config. In the Firebase console:

1. **Authentication → Sign-in method** — enable **Anonymous**.
2. **Firestore Database** — create a database, then paste `firestore.rules` into **Firestore → Rules** and publish.

The rules allow any signed-in device to read and write one lobby if it knows the code; listing all lobbies is forbidden, so codes cannot be discovered. A new lobby can only be created on a code that is still free, so one phone cannot overwrite another's.

## Tests

```sh
node --test
```

139 tests covering the scoring/ranking maths (including the per-player win/loss record), the model (including the v1 → v2 migration), the storage layer and the shared-lobby logic. Needs Node 18+.

## Deploy

It is a static site — `index.html`, `styles.css`, `js/`, `test/`. Any static host works (GitHub Pages, Cloudflare Pages, Netlify). This repo is served with GitHub Pages at:

<https://zsolt-85.github.io/SOLO-Scorekeeper/>

## Layout

```
index.html              the shell: five views + the storage banner
styles.css              dark theme
js/ranking.js           pure scoring / ranking maths
js/model.js             pure state commands (no DOM, no storage)
js/store.js             model + localStorage (no DOM)
js/space.js             model + Firestore documents (no DOM)
js/firebase.js          the only file that touches the Firebase SDK
js/firebase-config.js   the Firebase web app config
js/reveal.js            count-up + podium animation
js/ui.js                rendering, routing, event wiring
firestore.rules         security rules for shared lobbies
test/                   node:test specs
```

## Rules source

Card values are summarised from Board Game Arena's SOLO guide and Mattel's published UNO rules. If your deck disagrees, follow your deck.
