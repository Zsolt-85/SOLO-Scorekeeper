// The global leaderboard's pure half: names become keys, finished games become
// immutable results, and pool profiles plus results become ranked rows.
//
// Nothing here reads storage, the network or the DOM, so every rule below is
// exercised by plain node:test.

(function (global) {
  'use strict';

  const Ranking = global.Ranking
    || (typeof module !== 'undefined' && module.exports ? require('./ranking.js') : null);

  // The same family as the player palette in model.js, so a result-only row still
  // looks like it belongs on the board.
  const PALETTE = ['#f0b429', '#5bc8af', '#ef7f6b', '#9d8df1', '#6ec1ff', '#7bc950', '#f28ab2', '#c9a227'];
  const MIN_GAMES = 3;

  function normalise(name) {
    return String(name === null || name === undefined ? '' : name)
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function keyFor(name) {
    const key = normalise(name);
    return key ? 'p_' + encodeURIComponent(key) : null;
  }

  function colourFor(key) {
    const text = String(key || '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash * 31) + text.charCodeAt(i)) >>> 0;
    }
    return PALETTE[hash % PALETTE.length];
  }

  function sanitize(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[^A-Za-z0-9_-]/g, '');
  }

  function resultId(mode, origin, gameId) {
    const game = sanitize(gameId);
    if (!game) return null;
    const scope = sanitize(origin);
    return sanitize(mode) + (scope ? '_' + scope : '') + '_' + game;
  }

  function finishTime(game) {
    return game
      && typeof game.finishedAt === 'number'
      && isFinite(game.finishedAt)
      && game.finishedAt > 0
      ? game.finishedAt
      : null;
  }

  // A result is the game's public fingerprint: who played, their totals, and who
  // won. It is written once and never updated. `at` must be the real finish time;
  // a missing one means the game cannot be ranked, so it is not published.
  function resultFor(game, options) {
    const opts = options || {};
    if (!game || !game.id || !Array.isArray(game.seats) || game.seats.length === 0) return null;
    if (!Array.isArray(game.rounds) || game.rounds.length === 0) return null;
    const at = finishTime(game);
    if (at === null) return null;
    const mode = opts.mode === 'lobby' ? 'lobby' : 'solo';
    const id = resultId(mode, opts.origin, game.id);
    if (!id) return null;
    const direction = Ranking.directionFor(
      game,
      typeof opts.lowerWins === 'boolean' ? opts.lowerWins : true
    );
    const totals = {};
    Ranking.rank(game, direction).forEach(function (entry) {
      totals[entry.seat.id] = { total: entry.total, win: !!entry.isWinner };
    });
    const players = game.seats.map(function (seat) {
      const total = totals[seat.id] || { total: 0, win: false };
      return {
        key: keyFor(seat.name),
        name: String(seat.name === null || seat.name === undefined ? '' : seat.name).trim(),
        emoji: String(seat.emoji || ''),
        total: total.total,
        win: total.win
      };
    });
    return { id: id, at: at, mode: mode, lowerWins: direction, players: players };
  }

  function winPercent(row) {
    return row && row.games ? Math.round((row.wins / row.games) * 100) : null;
  }

  // Ranked players are ordered by win rate. Cross-multiplication compares the rates
  // exactly (games can be zero, so no division), and games played breaks a tie in
  // rate. Places are shared only when both the rate and the number of games match.
  // Everyone with fewer than three games is grouped after the ranked players, and
  // players with no games come last.
  function rankRows(rows) {
    const sorted = (rows || []).slice().sort(function (a, b) {
      const aRanked = a.games >= MIN_GAMES;
      const bRanked = b.games >= MIN_GAMES;
      if (aRanked !== bRanked) return aRanked ? -1 : 1;
      if (aRanked) {
        const byRate = (b.wins * a.games) - (a.wins * b.games);
        if (byRate !== 0) return byRate;
        if (b.games !== a.games) return b.games - a.games;
      }
      if (b.games !== a.games) return b.games - a.games;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    let place = null;
    let previous = null;
    sorted.forEach(function (row, index) {
      row.ranked = row.games >= MIN_GAMES;
      if (!row.ranked) {
        row.place = null;
        place = null;
        previous = null;
        return;
      }
      const tied = previous
        && previous.games === row.games
        && previous.wins * row.games === row.wins * previous.games;
      if (!tied) place = index + 1;
      row.place = place;
      previous = row;
    });
    return sorted;
  }

  // One row per leaderboard player. Pool profiles (who may have no games yet) win
  // the name/emoji/colour contest; a name that only appears in results still gets a
  // row, using the newest result's name. A result is counted once per player, even
  // if a legacy result lists the same key twice.
  function aggregate(pool, results) {
    const rows = {};

    (Array.isArray(pool) ? pool : []).forEach(function (profile) {
      if (!profile || !profile.id || !profile.name) return;
      rows[profile.id] = {
        key: profile.id,
        name: String(profile.name),
        emoji: String(profile.emoji || ''),
        color: profile.color || colourFor(profile.id),
        games: 0,
        wins: 0,
        losses: 0,
        fromPool: true,
        lastAt: 0
      };
    });

    const seen = {};
    (Array.isArray(results) ? results : []).forEach(function (result) {
      if (!result || !result.id || seen[result.id]) return;
      seen[result.id] = true;
      const at = typeof result.at === 'number' && isFinite(result.at) ? result.at : 0;
      const perGame = {};

      (Array.isArray(result.players) ? result.players : []).forEach(function (entry) {
        if (!entry || !entry.key || !entry.name) return;
        const key = entry.key;
        const row = rows[key] || (rows[key] = {
          key: key,
          name: String(entry.name),
          emoji: String(entry.emoji || ''),
          color: colourFor(key),
          games: 0,
          wins: 0,
          losses: 0,
          fromPool: false,
          lastAt: 0
        });
        const known = perGame[key];
        perGame[key] = {
          win: (known ? known.win : false) || !!entry.win,
          total: entry.total !== undefined ? entry.total : (known ? known.total : 0),
          name: at >= row.lastAt ? entry.name : (known ? known.name : entry.name),
          emoji: at >= row.lastAt ? entry.emoji : (known ? known.emoji : entry.emoji)
        };
        if (at >= row.lastAt) {
          row.lastAt = at;
          if (!row.fromPool) {
            row.name = String(entry.name);
            row.emoji = String(entry.emoji || '');
          }
        }
      });

      Object.keys(perGame).forEach(function (key) {
        const row = rows[key];
        row.games += 1;
        if (perGame[key].win) row.wins += 1;
        else row.losses += 1;
      });
    });

    return rankRows(Object.keys(rows).map(function (key) { return rows[key]; }));
  }

  const Leaderboard = {
    MIN_GAMES: MIN_GAMES,
    normalise: normalise,
    keyFor: keyFor,
    colourFor: colourFor,
    resultId: resultId,
    resultFor: resultFor,
    winPercent: winPercent,
    rankRows: rankRows,
    aggregate: aggregate
  };

  global.Leaderboard = Leaderboard;
  if (typeof module !== 'undefined' && module.exports) module.exports = Leaderboard;
})(typeof window !== 'undefined' ? window : globalThis);
