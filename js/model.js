(function (global) {
  'use strict';

  const Library = global.Library
    || (typeof module !== 'undefined' && module.exports ? require('./library.js') : null);

  const VERSION = 3;
  const PALETTE = Library ? Library.PALETTE : ['#f0b429', '#5bc8af', '#ef7f6b', '#9d8df1', '#6ec1ff', '#7bc950', '#f28ab2', '#c9a227'];
  const MAX_NAME = 20;

  function cleanName(name) {
    return String(name === null || name === undefined ? '' : name)
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parsePoints(value) {
    if (value === '' || value === null || value === undefined) return 0;
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.trunc(n);
  }

  function normalizeSettings(settings) {
    const lowerWins = settings && typeof settings.lowerWins === 'boolean' ? settings.lowerWins : true;
    return { lowerWins: lowerWins };
  }

  function normalizeLobby(lobby) {
    if (!lobby || typeof lobby !== 'object') return null;
    const code = String(lobby.code || '').trim().toUpperCase();
    if (!code) return null;
    return {
      code: code,
      name: String(lobby.name || '').trim(),
      joinedAt: lobby.joinedAt || null,
      typeId: typeof lobby.typeId === 'string' && lobby.typeId ? lobby.typeId : null
    };
  }

  function convertPoints(points, seats) {
    const keyed = {};
    if (Array.isArray(points)) {
      seats.forEach(function (seat, i) { keyed[seat.id] = parsePoints(points[i]); });
    } else if (points && typeof points === 'object') {
      seats.forEach(function (seat) { keyed[seat.id] = parsePoints(points[seat.id]); });
    } else {
      seats.forEach(function (seat) { keyed[seat.id] = 0; });
    }
    return keyed;
  }

  function convertSeat(seat) {
    const out = { id: seat.id, name: seat.name, emoji: seat.emoji, color: seat.color };
    if (seat.playerId) out.playerId = seat.playerId;
    return out;
  }

  function gameRules(game, fallback) {
    try {
      return Library.validateRules(game.rules);
    } catch (error) {
      const winner = typeof game.lowerWins === 'boolean'
        ? (game.lowerWins ? 'lowest' : 'highest')
        : (fallback && fallback.winner ? fallback.winner : 'lowest');
      return { winner: winner, end: { type: 'manual' } };
    }
  }

  function convertGame(game, fallback) {
    const seats = (Array.isArray(game.seats) ? game.seats : []).map(convertSeat);
    const rounds = (Array.isArray(game.rounds) ? game.rounds : []).map(function (round) {
      return {
        id: round.id,
        at: round.at === undefined ? null : round.at,
        points: convertPoints(round.points, seats)
      };
    });
    const rules = gameRules(game, fallback || {});
    const typeId = game.typeId || (fallback && fallback.typeId)
      || (rules.winner === 'highest' ? 'uno' : 'solo');
    const typeName = game.typeName || (fallback && fallback.typeName)
      || (typeId === 'uno' ? 'UNO' : 'SOLO');
    return {
      id: game.id,
      startedAt: game.startedAt === undefined ? null : game.startedAt,
      finishedAt: game.finishedAt === undefined ? null : game.finishedAt,
      typeId: typeId,
      typeName: typeName,
      rules: rules,
      lowerWins: rules.winner === 'lowest',
      seats: seats,
      rounds: rounds
    };
  }

  function normalizePlayers(players) {
    return players.map(function (player) {
      return {
        id: player.id,
        name: player.name,
        emoji: player.emoji,
        color: player.color,
        createdAt: player.createdAt
      };
    });
  }

  function normalizeLibrary(input) {
    if (!Array.isArray(input)) return null;
    const out = [];
    for (let i = 0; i < input.length; i += 1) {
      const type = Library.normalizeType(input[i]);
      if (!type) return null;
      if (type.id === 'solo' || type.id === 'uno') {
        type.builtin = true;
        type.archived = false;
      }
      out.push(type);
    }
    const defaults = Library.seed();
    defaults.forEach(function (builtin) {
      if (!out.some(function (type) { return type.id === builtin.id; })) out.push(builtin);
    });
    return out;
  }

  function normalizeGames(games, fallbackFor) {
    const out = [];
    for (let i = 0; i < games.length; i += 1) {
      if (!games[i] || typeof games[i] !== 'object') return null;
      out.push(convertGame(games[i], fallbackFor ? fallbackFor(games[i]) : null));
    }
    return out;
  }

  function create(deps) {
    const settings = deps || {};
    const now = typeof settings.now === 'function' ? settings.now : function () { return Date.now(); };
    const uid = typeof settings.uid === 'function'
      ? settings.uid
      : function (prefix) { return prefix + now().toString(36) + Math.random().toString(36).slice(2, 7); };

    function empty() {
      return {
        version: VERSION,
        library: Library.seed(),
        activeType: 'solo',
        selection: [],
        players: [],
        games: [],
        lobby: null
      };
    }

    function currentType(state) {
      const found = Library.find(state.library, state.activeType);
      if (found && !found.archived) return found;
      return Library.find(state.library, 'solo');
    }

    function findType(state, id) {
      return Library.find(state.library, id);
    }

    function setActiveType(state, id) {
      const type = findType(state, id);
      if (!type) throw new Error('That game is not available.');
      if (type.archived) throw new Error('That game is archived.');
      state.activeType = type.id;
      return type;
    }

    function addType(state, input) {
      const type = Library.makeType(input, { now: now, uid: uid, library: state.library });
      state.library.push(type);
      state.activeType = type.id;
      return type;
    }

    function updateType(state, id, input) {
      const type = findType(state, id);
      if (!type) throw new Error('That game is not available.');
      if (type.archived) throw new Error('That game is archived.');
      const data = Object.assign({}, type, input, {
        id: type.id,
        builtin: type.builtin,
        archived: type.archived,
        createdAt: type.createdAt,
        updatedAt: now()
      });
      const updated = Library.makeType(data, {
        now: now, uid: uid, library: state.library
      });
      const at = state.library.map(function (one) { return one.id; }).indexOf(id);
      state.library[at] = updated;
      return updated;
    }

    function archiveType(state, id) {
      const type = findType(state, id);
      if (!type) throw new Error('That game is not available.');
      if (type.builtin) throw new Error('built-in games cannot be archived.');
      if (state.games.some(function (game) {
        return game.typeId === id && game.finishedAt === null;
      })) throw new Error('Finish the game in progress before archiving it.');
      type.archived = true;
      type.updatedAt = now();
      if (state.activeType === id) state.activeType = 'solo';
      return type;
    }

    function restoreType(state, id) {
      const type = findType(state, id);
      if (!type) throw new Error('That game is not available.');
      if (type.builtin) throw new Error('Built-in games are always available.');
      type.archived = false;
      type.updatedAt = now();
      return type;
    }

    function resetType(state, id) {
      const type = findType(state, id);
      if (!type) throw new Error('That game is not available.');
      const defaults = Library.defaults();
      const original = defaults.filter(function (one) { return one.id === id; })[0];
      if (!original) throw new Error('That game cannot be reset.');
      const reset = Library.makeType(Object.assign({}, original, {
        createdAt: type.createdAt, updatedAt: now()
      }), { now: now, uid: uid, library: state.library });
      const at = state.library.map(function (one) { return one.id; }).indexOf(id);
      state.library[at] = reset;
      return reset;
    }

    function normalizeV3(doc) {
      if (!Array.isArray(doc.players) || !Array.isArray(doc.games)) return null;
      const library = normalizeLibrary(doc.library);
      if (!library) return null;
      const games = normalizeGames(doc.games, function (game) {
        const winner = typeof game.lowerWins === 'boolean'
          ? (game.lowerWins ? 'lowest' : 'highest') : 'lowest';
        return {
          typeId: winner === 'highest' ? 'uno' : 'solo',
          typeName: winner === 'highest' ? 'UNO' : 'SOLO',
          winner: winner
        };
      });
      if (!games) return null;
      const state = empty();
      state.library = library;
      state.selection = Array.isArray(doc.selection) ? doc.selection.slice() : [];
      state.players = normalizePlayers(doc.players);
      state.games = games;
      state.lobby = normalizeLobby(doc.lobby);
      state.activeType = 'solo';
      const active = Library.find(library, doc.activeType);
      if (active && !active.archived) state.activeType = active.id;
      return state;
    }

    function normalizeV2(doc) {
      if (!Array.isArray(doc.players) || !Array.isArray(doc.games)) return null;
      const settings = normalizeSettings(doc.settings);
      const games = normalizeGames(doc.games, function (game) {
        const finished = game.finishedAt !== null && game.finishedAt !== undefined;
        const lower = finished
          ? (typeof game.lowerWins === 'boolean' ? game.lowerWins : true)
          : settings.lowerWins;
        return {
          typeId: lower ? 'solo' : 'uno',
          typeName: lower ? 'SOLO' : 'UNO',
          winner: lower ? 'lowest' : 'highest'
        };
      });
      if (!games) return null;
      const state = empty();
      state.selection = Array.isArray(doc.selection) ? doc.selection.slice() : [];
      state.players = normalizePlayers(doc.players);
      state.games = games;
      state.lobby = normalizeLobby(doc.lobby);
      state.activeType = settings.lowerWins ? 'solo' : 'uno';
      return state;
    }

    function migrateV1(doc) {
      if (!Array.isArray(doc.players) || !Array.isArray(doc.games)) return null;
      if (doc.currentGame !== null && doc.currentGame !== undefined
        && (!Array.isArray(doc.currentGame.seats) || !Array.isArray(doc.currentGame.rounds))) {
        return null;
      }
      const copy = {
        version: 2,
        players: doc.players,
        games: doc.games.slice ? doc.games.slice() : doc.games,
        selection: doc.selection,
        settings: doc.settings
      };
      if (doc.currentGame) {
        copy.games = copy.games.concat ? copy.games.concat([doc.currentGame]) : copy.games.concat([doc.currentGame]);
      }
      const state = normalizeV2(copy);
      if (!state) return null;
      return state;
    }

    function fromDocument(doc) {
      if (!doc || typeof doc !== 'object') return null;
      if (doc.version === VERSION) return normalizeV3(doc);
      if (doc.version === 2) return normalizeV2(doc);
      if (doc.version === 1) return migrateV1(doc);
      return null;
    }

    function findPlayer(state, id) {
      return state.players.find(function (player) { return player.id === id; }) || null;
    }

    function findGame(state, id) {
      return state.games.find(function (game) { return game.id === id; }) || null;
    }

    function nextColour(state) {
      const used = state.players.map(function (player) { return player.color; });
      const free = PALETTE.filter(function (colour) { return used.indexOf(colour) === -1; });
      return free[0] || PALETTE[state.players.length % PALETTE.length];
    }

    function makeSeat(source) {
      return {
        id: uid('s'),
        playerId: source.playerId || source.id,
        name: source.name,
        emoji: source.emoji,
        color: source.color
      };
    }

    function requireGame(state, id) {
      const game = findGame(state, id);
      if (!game) throw new Error('That game is no longer available.');
      return game;
    }

    function requireActive(state, id) {
      if (!id) {
        const active = activeGames(state)[0];
        if (!active) throw new Error('No game in progress.');
        return active;
      }
      const game = requireGame(state, id);
      if (game.finishedAt !== null) throw new Error('That game is already finished.');
      return game;
    }

    function gamesBy(state, key, wantActive) {
      return state.games.map(function (game, index) { return { game: game, index: index }; })
        .filter(function (entry) {
          return wantActive ? entry.game.finishedAt === null : entry.game.finishedAt !== null;
        })
        .sort(function (a, b) {
          return ((b.game[key] || 0) - (a.game[key] || 0)) || (b.index - a.index);
        })
        .map(function (entry) { return entry.game; });
    }

    function activeGames(state) {
      return gamesBy(state, 'startedAt', true);
    }

    function finishedGames(state) {
      return gamesBy(state, 'finishedAt', false);
    }

    function gamesForType(state, typeId, finished) {
      return state.games.filter(function (game) {
        return game.typeId === typeId
          && (finished ? game.finishedAt !== null : game.finishedAt === null);
      });
    }

    function addPlayer(state, name, emoji) {
      const clean = cleanName(name);
      if (!clean || clean.length > MAX_NAME) throw new Error('Name must be 1-20 characters.');
      const face = String(emoji || '').trim() || '🙂';
      const duplicate = state.players.some(function (player) {
        return player.name.toLowerCase() === clean.toLowerCase();
      });
      if (duplicate) throw new Error('That player is already on your roster.');
      const player = { id: uid('p'), name: clean, emoji: face, color: nextColour(state), createdAt: now() };
      state.players.push(player);
      return player;
    }

    function updatePlayer(state, id, name, emoji) {
      const clean = cleanName(name);
      if (!clean || clean.length > MAX_NAME) throw new Error('Name must be 1-20 characters.');
      const player = findPlayer(state, id);
      if (!player) throw new Error('That player is not on your roster.');
      const face = String(emoji || '').trim() || '🙂';
      const duplicate = state.players.some(function (other) {
        return other.id !== id && other.name.toLowerCase() === clean.toLowerCase();
      });
      if (duplicate) throw new Error('That player is already on your roster.');
      player.name = clean;
      player.emoji = face;
      return player;
    }

    function removePlayer(state, id) {
      const player = findPlayer(state, id);
      if (!player) throw new Error('That player is not on your roster.');
      state.players = state.players.filter(function (other) { return other.id !== id; });
      const at = state.selection.indexOf(id);
      if (at !== -1) state.selection.splice(at, 1);
      return player;
    }

    function toggleSeat(state, id) {
      const at = state.selection.indexOf(id);
      if (at === -1) state.selection.push(id);
      else state.selection.splice(at, 1);
      return state.selection.slice();
    }

    function clearSeats(state) {
      state.selection = [];
    }

    function startGame(state, seats) {
      const type = currentType(state);
      const chosen = seats || state.selection
        .map(function (id) { return findPlayer(state, id); })
        .filter(Boolean)
        .map(makeSeat);
      if (chosen.length === 0) throw new Error('Pick at least one player first.');
      const game = {
        id: uid('g'),
        startedAt: now(),
        finishedAt: null,
        typeId: type.id,
        typeName: type.name,
        rules: { winner: type.rules.winner, end: JSON.parse(JSON.stringify(type.rules.end)) },
        lowerWins: type.rules.winner === 'lowest',
        seats: chosen,
        rounds: []
      };
      state.selection = [];
      state.games.push(game);
      return game;
    }

    function addPlayerToGame(state, gameId, name, emoji) {
      const game = requireActive(state, gameId);
      const player = addPlayer(state, name, emoji);
      game.seats.push(makeSeat(player));
      return player;
    }

    function recordRound(state, gameId, values) {
      const game = requireActive(state, gameId);
      const points = (values || []).map(parsePoints);
      if (points.length !== game.seats.length) {
        throw new Error('Point count must match the number of players.');
      }
      const keyed = {};
      game.seats.forEach(function (seat, i) { keyed[seat.id] = points[i]; });
      game.rounds.push({ id: uid('r'), at: now(), points: keyed });
      return game;
    }

    function undoRound(state, gameId) {
      const game = requireActive(state, gameId);
      if (game.rounds.length === 0) throw new Error('No round to undo.');
      game.rounds.pop();
      return game;
    }

    function finishGame(state, gameId) {
      const game = requireActive(state, gameId);
      if (game.rounds.length === 0) throw new Error('Play at least one round before ending the game.');
      game.finishedAt = now();
      if (typeof game.lowerWins !== 'boolean') {
        game.lowerWins = game.rules.winner === 'lowest';
      }
      return game;
    }

    function playAgain(state, gameId) {
      const source = gameId ? requireGame(state, gameId) : requireActive(state, null);
      const type = findType(state, source.typeId);
      if (!type || type.archived) throw new Error('That game is archived.');
      state.activeType = type.id;
      return startGame(state, source.seats.map(makeSeat));
    }

    function deleteGame(state, gameId) {
      const game = requireGame(state, gameId);
      state.games = state.games.filter(function (other) { return other.id !== game.id; });
      return game;
    }

    function setLobby(state, lobby) {
      state.lobby = normalizeLobby(lobby);
      return state;
    }

    return {
      VERSION: VERSION,
      PALETTE: PALETTE,
      MAX_NAME: MAX_NAME,
      empty: empty,
      fromDocument: fromDocument,
      parsePoints: parsePoints,
      currentType: currentType,
      findType: findType,
      setActiveType: setActiveType,
      addType: addType,
      updateType: updateType,
      archiveType: archiveType,
      restoreType: restoreType,
      resetType: resetType,
      activeGames: activeGames,
      finishedGames: finishedGames,
      gamesForType: gamesForType,
      findPlayer: findPlayer,
      findGame: findGame,
      addPlayer: addPlayer,
      updatePlayer: updatePlayer,
      removePlayer: removePlayer,
      toggleSeat: toggleSeat,
      clearSeats: clearSeats,
      startGame: startGame,
      addPlayerToGame: addPlayerToGame,
      recordRound: recordRound,
      undoRound: undoRound,
      finishGame: finishGame,
      playAgain: playAgain,
      deleteGame: deleteGame,
      setLobby: setLobby
    };
  }

  const Model = { create: create, VERSION: VERSION, PALETTE: PALETTE };
  global.Model = Model;
  if (typeof module !== 'undefined' && module.exports) module.exports = Model;
})(typeof window !== 'undefined' ? window : globalThis);
