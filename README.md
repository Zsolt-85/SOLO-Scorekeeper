# SOLO Scorekeeper

A tiny, private score keeper for the card game **SOLO** (and **UNO**). Add players, type each round's points, and watch an animated podium crown the winner. Runs entirely offline in the browser — no server, no accounts, no dependencies.

**Scoring.** By default the **fewest points wins** (our house rules). Switch to **most points wins** on the home screen for standard UNO/SOLO scoring. The rules for both games are built into the app under **Rules**.

## Run it

Open `index.html` in any modern browser. There is no build step and nothing to install.

- **Home** — add players (emoji + name), tap who is playing, start a game. Each player has a ✎ button to change their name or picture.
- **Game** — one points box per player each round, running totals, undo, and the option to add a late player.
- **Podium** — animated reveal. Lowest total wins by default (gold bar + crown); flip the scoring mode for UNO.
- **History** — every finished game, newest first; tap one to reopen its podium.
- **Rules** — how SOLO and UNO scoring works, card by card.

Scores live in the browser's `localStorage` (key `noting-more.v1`) and never leave the device.

## Tests

```sh
node --test
```

52 tests covering the scoring/ranking maths and the storage layer. Needs Node 18+.

## Deploy

It is a static site — `index.html`, `styles.css`, `js/`, `test/`. Any static host works (GitHub Pages, Cloudflare Pages, Netlify). This repo is served with GitHub Pages at:

<https://zsolt-85.github.io/SOLO-Scorekeeper/>

## Layout

```
index.html      the shell: four views + the storage banner
styles.css      dark theme
js/ranking.js   pure scoring / ranking maths
js/store.js     state + localStorage (no DOM)
js/reveal.js    count-up + podium animation
js/ui.js        rendering, routing, event wiring
test/           node:test specs
```

## Rules source

Card values are summarised from Board Game Arena's SOLO guide and Mattel's published UNO rules. If your deck disagrees, follow your deck.
