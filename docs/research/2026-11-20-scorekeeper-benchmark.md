# SCORELOCK market benchmark — scorekeeping / board-game companion apps

Date: 2026-11-20. Method: public product sites and 2026 comparison articles; feature
claims are the vendors' own. This is a **feature/UX teardown**, not code decompilation.

## 1. Market map

| Category | Apps | Core promise |
|---|---|---|
| At-the-table live scoring | Tableside, Board Game Scorecard, Scorecard.gg, ScoreTracker.app, KeepTheScore (sports) | Pick game → add players → tap scores → share result. No signup. |
| Play log + deep personal stats | BG Stats, Board Game Shelf, Meeplay | Log every play, collection management, BGG sync, charts. |
| Group history / social stats | NemeStats, Skorio, Board Game Now, GameScore | One shared history for your regular group, rivalries, achievements. |
| Privacy-first offline | Score Door, Playtally, GameScore | Everything on device, no account, no server. |

## 2. Feature matrix (SCORELOCK vs the field)

Legend: ✅ present · ◐ partial · — absent

| Capability | SCORELOCK | BG Stats | NemeStats | Score Door | Skorio | GameScore | Board Game Now | ScoreTracker | Board Game Scorecard |
|---|---|---|---|---|---|---|---|---|---|
| Live round-by-round table (local) | ✅ | — | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Live table shared by code/link, multi-device | ✅ code | — | — | — | ✅ | — | ✅ | ✅ link | ✅ QR |
| Custom games / own rules | ✅ | ◐ | ◐ | ◐ | ◐ | ◐ | ✅ | ✅ templates | ◐ |
| Per-game scoring templates (race/rounds/ELO/co-op) | — (lowest/highest + limit only) | ✅ sheets | — | ✅ 6 methods, 45+ games | ✅ game knows its scoring | ✅ ~50 templates | ✅ 300+ + calculators | ✅ templates | ✅ dedicated pages |
| Shared group history, no account | ✅ | ◐ cloud paid | — account | — offline only | ◐ guests | ✅ | ✅ | ✅ guests | ✅ |
| Win-rate leaderboard | ✅ games-based | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Head-to-head / Nemesis / Minion | — | ◐ | ✅ | ✅ | ✅ | ✅ | ◐ comparisons | — | — |
| Win streaks / longest streak | — | ✅ | ✅ | ✅ | ✅ Pro | ✅ | ✅ | ◐ | — |
| Achievements / badges / XP levels | — | ✅ challenges | ✅ badges | — | ✅ 90+, rarity, secret | — | ✅ 14 | — | — |
| Shareable result image | — | ✅ 3×3 / stats-o-graphic | — | — | — | ✅ Victory Cards | ✅ scorecard image | ✅ feed | — |
| ELO / weighted rating | — | — | ✅ NemePoints | ✅ | — | — | — | — | — |
| Randomizers (first player, game, roles) | — | ✅ | — | — | — | — | ✅ dice tools | — | — |
| "What should we play?" filter | — | ✅ custom filter | — | — | — | — | — | — | — |
| Export / import / API | — | ✅ BGG + files | ✅ REST API + export | ✅ JSON backup | — | ◐ BGG | ◐ cloud | — | — |
| Offline play | ✅ local | ✅ | — | ✅ | ◐ | ✅ PWA | ✅ | ✅ cache | ✅ |
| Monetization | free | $5.99 + IAP/sync | free | free | free + Pro | free + €4.99 one-time | free | free | free |

## 3. How they do it — mechanics worth reverse-engineering

1. **Game knows its own scoring.** Score Door maps 45+ games onto six scoring methods
   (race, rounds, win/loss, final score, ELO, co-op). Skorio: "each game knows how
   it's scored". Board Game Now has end-game score calculators for complex games.
   *Lesson:* rules belong to the game type, not to a generic lowest/highest switch.
2. **Win-rate is table stakes; rivalries are the hook.** NemeStats made win/loss %,
   average players per game, longest streak, and "Nemesis / Minion" its identity.
   Score Door shows head-to-head (Sarah 8–5 Mike) on the dashboard.
   *Lesson:* a single player-ratio number is necessary but not emotionally sticky.
3. **Weighted skill rating solves the multi-player problem differently.** NemePoints
   awards points by finishing rank, number of players, game difficulty and duration;
   Score Door offers ELO. Our win ratio deliberately ignores field size (user's call),
   but a *secondary* "strength" stat could use these inputs without touching the ratio.
4. **Achievements with rarity and surprise.** Skorio: 90+ badges in 8 categories,
   rarity tiers (Common→Legendary), levels with progress bars, secret badges, points
   and a friends leaderboard, notification the moment you unlock — even when a friend
   logs the game that earned it. Board Game Now: XP + levels + 14 achievements.
5. **The result must be shareable.** GameScore's "Victory Card" (styled poster with
   winner, score, margin, player list, themes), BG Stats' 3×3 grid and stats-o-graphic,
   Board Game Now's exported scorecard image. This is the emotional payoff that turns
   a logged game into bragging rights.
6. **Zero-friction onboarding.** "First score in under 30 seconds" (GameScore),
   "setup in 60 seconds" (KeepTheScore), "add first player" (Board Game Scorecard).
   No account, no install, guest join by link, QR to share the table.
7. **Live sync is a feature, not a backend.** ScoreTracker advertises <1s score sync,
   spectators joining read-only, host rewind/add rounds mid-match; KeepTheScore uses
   separate controller and viewer links, multiple controllers, and even Stream Deck.
   Our code-based lobby already covers the core; viewer-only link and rewind are gaps.
8. **Data portability as a trust signal.** BG Stats exports play files and has a REST
   API (NemeStats); Score Door exports JSON; GameScore/BG Stats warn that history in
   a subscription is "rented". A one-click JSON export would fit our no-account model.
9. **Table utility tools.** Board Game Now bundles dice, coin flip, spinner, who-goes-
   first, team generator, round tracker, notepad, chess clock. BG Stats has random
   game/start-player/board/role pickers. These cost little and get used every session.
10. **Monetization patterns.** One-time purchase (BG Stats $5.99), cheap lifetime Pro
    (GameScore €4.99, Skorio Pro), free + optional ad removal, and paid *history depth*
    (GameScore keeps 10 matches free). All converge on: the scoring is free, the
    long-term story costs money. SCORELOCK is free and unlimited — a real advantage.

## 4. SCORELOCK gap analysis

**Protect:** no install/signup, Steam-style library, local *and* online live tables in
one app, name-is-the-player shared pool, unlimited free results, mobile-first design,
win ratio = wins ÷ games played (deliberate user decision).

**Gaps, by user value:**

- High: head-to-head rivalries, streaks, shareable result image, "who goes first".
- Medium: per-game scoring rules beyond lowest/highest + score limit; "what should we
  play?" filter (player count / time / last played); export JSON; guest viewer link;
  round rewind mid-game.
- Low/optional: achievements with rarity, ELO/weighted secondary rating, date-range
  filters, team/co-op scoring, BGG import, photos/voice notes, translations.

## 5. Prioritized proposal

| Priority | Feature | Why | Fit with our code |
|---|---|---|---|
| P0 | "Who goes first" randomizer on the game page | 10 lines, used every single game | pure helper + button; no data change |
| P0 | Head-to-head card on Players page (X–Y vs each rival) | turns stats into stories | pure `headToHead(results, a, b)` in leaderboard.js + node tests |
| P0 | Shareable Victory Card after finishing | the market's strongest emotional payoff | canvas render from result fingerprint; no backend |
| P1 | Streaks + longest streak on player rows | cheap, sticky metric | pure pass over immutable results |
| P1 | "What should we play?" shelf filter | solves host's real question | uses library types + last-played date |
| P1 | JSON export of results/pool | trust + portability | generated from cached board/local state |
| P1 | Per-game scoring templates | match competitors' depth | extend `type.rules` with scoring modes |
| P2 | Achievements/badges, ELO, date filters, teams, BGG import | nice but large | separate projects |

## 6. Sources

- Skorio, "Best Board Game Stats Apps in 2026": https://www.skorio.app/en/blog/best-board-game-stats-apps-2026.html
- Skorio features: https://www.skorio.app/en/features.html
- All Things AI, "5 best board game tracker apps (Oct 2026)": https://allthingsn.com/best/best-board-game-tracker-apps/
- BG Stats (site + explanations): https://www.bgstatsapp.com/ · https://www.bgstatsapp.com/explanations/
- NemeStats: https://nemestats.com/
- Score Door: https://www.scoredoor.app/
- GameScore: https://gamescore.cards/
- Board Game Now: https://boardgamenow.app/
- ScoreTracker: https://scorestracker.app/
- Board Game Scorecard: https://boardgamescorecard.com/games/generic
- KeepTheScore: https://keepthescore.co/
- Meeplay, "Best board game apps in 2026": https://www.meeplay.io/en/blog/best-board-game-apps-2026
