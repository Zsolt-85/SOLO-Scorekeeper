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
  function gameOf(result) {
    if (result && typeof result.game === 'string' && result.game) return result.game;
    return result && result.lowerWins === false ? 'uno' : 'solo';
  }

  function gameNameOf(result) {
    if (result && typeof result.gameName === 'string' && result.gameName) return result.gameName;
    return gameOf(result) === 'uno' ? 'UNO' : 'SOLO';
  }

  function resultFor(match, options) {
    const opts = options || {};
    if (!match || !match.id || !Array.isArray(match.seats) || match.seats.length === 0) return null;
    if (!Array.isArray(match.rounds) || match.rounds.length === 0) return null;
    const at = finishTime(match);
    if (at === null) return null;
    const mode = opts.mode === 'lobby' ? 'lobby' : 'solo';
    const id = resultId(mode, opts.origin, match.id);
    if (!id) return null;
    const direction = Ranking.directionFor(
      match,
      typeof opts.lowerWins === 'boolean' ? opts.lowerWins : true
    );
    const totals = {};
    Ranking.rank(match, direction).forEach(function (entry) {
      totals[entry.seat.id] = { total: entry.total, win: !!entry.isWinner };
    });
    const players = match.seats.map(function (seat) {
      const total = totals[seat.id] || { total: 0, win: false };
      return {
        key: keyFor(seat.name),
        name: String(seat.name === null || seat.name === undefined ? '' : seat.name).trim(),
        emoji: String(seat.emoji || ''),
        total: total.total,
        win: total.win
      };
    });
    const game = typeof match.typeId === 'string' && match.typeId
      ? match.typeId
      : (typeof opts.game === 'string' && opts.game
        ? opts.game
        : (direction ? 'solo' : 'uno'));
    const gameName = typeof match.typeName === 'string' && match.typeName
      ? match.typeName
      : (typeof opts.gameName === 'string' && opts.gameName
        ? opts.gameName
        : (game === 'uno' ? 'UNO' : 'SOLO'));
    return { id: id, at: at, mode: mode, game: game, gameName: gameName, lowerWins: direction, players: players };
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
  function aggregate(pool, results, gameId) {
    const wanted = gameId || 'solo';
    const rows = {};
    const filtered = (Array.isArray(results) ? results : []).filter(function (result) {
      return result && gameOf(result) === wanted;
    });
    const resultKeys = {};
    filtered.forEach(function (result) {
      (Array.isArray(result.players) ? result.players : []).forEach(function (entry) {
        if (entry && entry.key) resultKeys[entry.key] = true;
      });
    });

    (Array.isArray(pool) ? pool : []).forEach(function (profile) {
      if (!profile || !profile.id || !profile.name) return;
      const profileGame = typeof profile.game === 'string' && profile.game ? profile.game : 'solo';
      if (profileGame !== wanted && !resultKeys[profile.id]) return;
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
    filtered.forEach(function (result) {
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

  // One row per player across every game: the roster, not a ranking. Pool
  // profiles win the name/emoji/colour contest; anyone only seen in results
  // still gets a row. `favourite` is the game the player has appeared in most.
  function allPlayers(pool, results) {
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
        counts: {},
        gamesByName: {},
        fromPool: true
      };
    });
    const seen = {};
    (Array.isArray(results) ? results : []).forEach(function (result) {
      if (!result || !result.id || seen[result.id]) return;
      seen[result.id] = true;
      const at = typeof result.at === 'number' && isFinite(result.at) ? result.at : 0;
      const game = gameOf(result);
      const gameName = gameNameOf(result) || game;
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
          counts: {},
          gamesByName: {},
          lastAt: 0,
          fromPool: false
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
        row.counts[game] = (row.counts[game] || 0) + 1;
        row.gamesByName[game] = gameName;
      });
    });
    const list = Object.keys(rows).map(function (key) {
      const row = rows[key];
      const ids = Object.keys(row.counts);
      ids.sort(function (a, b) {
        return (row.counts[b] - row.counts[a]) || a.localeCompare(b);
      });
      const favourite = ids.length
        ? { game: ids[0], name: row.gamesByName[ids[0]] || ids[0], played: row.counts[ids[0]] }
        : null;
      return {
        key: row.key,
        name: row.name,
        emoji: row.emoji,
        color: row.color,
        games: row.games,
        wins: row.wins,
        losses: row.losses,
        favourite: favourite
      };
    });
    return list.sort(function (a, b) {
      if (b.games !== a.games) return b.games - a.games;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }

  // The selectable universe for one table: the local roster plus everyone the
  // Players page already knows, name-matched ("a name is the player"), minus
  // tombstoned names. Locals win; pool/result-only rows are padded and flagged.
  function mergePlayers(localPlayers, pool, results, removed) {
    const tomb = {};
    (Array.isArray(removed) ? removed : []).forEach(function (name) {
      const keyish = normalise(name);
      if (keyish) tomb[keyish] = true;
    });
    const locals = [];
    (Array.isArray(localPlayers) ? localPlayers : []).forEach(function (player) {
      if (!player || !player.id || !player.name) return;
      locals.push({
        id: player.id,
        name: String(player.name),
        emoji: String(player.emoji || ''),
        color: player.color || colourFor(player.id),
        pooled: false
      });
    });
    const taken = {};
    locals.forEach(function (player) { taken[normalise(player.name)] = true; });
    const extras = allPlayers(pool, results)
      .filter(function (row) { return !tomb[normalise(row.name)]; })
      .filter(function (row) { return !taken[normalise(row.name)]; })
      .map(function (row) {
        return { id: row.key, name: row.name, emoji: row.emoji, color: row.color, pooled: true };
      });
    extras.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    return locals.concat(extras);
  }

  const Leaderboard = {
    MIN_GAMES: MIN_GAMES,
    normalise: normalise,
    keyFor: keyFor,
    colourFor: colourFor,
    resultId: resultId,
    resultFor: resultFor,
    gameOf: gameOf,
    gameNameOf: gameNameOf,
    winPercent: winPercent,
    rankRows: rankRows,
    allPlayers: allPlayers,
    aggregate: aggregate,
    mergePlayers: mergePlayers
  };

  global.Leaderboard = Leaderboard;
  if (typeof module !== 'undefined' && module.exports) module.exports = Leaderboard;
})(typeof window !== 'undefined' ? window : globalThis);
