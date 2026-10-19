(function (global) {
  'use strict';

  const VERSION = 2;
  const PALETTE = ['#f0b429', '#5bc8af', '#ef7f6b', '#9d8df1', '#6ec1ff', '#7bc950', '#f28ab2', '#c9a227'];
  const MAX_NAME = 20;

  function cleanName(name) {
    return String(name === null || name === undefined ? '' : name).trim();
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
    return { code: code, name: String(lobby.name || '').trim(), joinedAt: lobby.joinedAt || null };
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
    return { id: seat.id, name: seat.name, emoji: seat.emoji, color: seat.color };
  }

  function convertGame(game) {
    const seats = (Array.isArray(game.seats) ? game.seats : []).map(convertSeat);
    const rounds = (Array.isArray(game.rounds) ? game.rounds : []).map(function (round) {
      return {
        id: round.id,
        at: round.at === undefined ? null : round.at,
        points: convertPoints(round.points, seats)
      };
    });
    return {
      id: game.id,
      startedAt: game.startedAt === undefined ? null : game.startedAt,
      finishedAt: game.finishedAt === undefined ? null : game.finishedAt,
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

  function normalizeGames(games) {
    const out = [];
    for (let i = 0; i < games.length; i += 1) {
      if (!games[i] || typeof games[i] !== 'object') return null;
      out.push(convertGame(games[i]));
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
        selection: [],
        players: [],
        games: [],
        settings: { lowerWins: true },
        lobby: null
      };
    }

    function normalizeV2(doc) {
      if (!Array.isArray(doc.players) || !Array.isArray(doc.games)) return null;
      const games = normalizeGames(doc.games);
      if (!games) return null;
      const state = empty();
      state.selection = Array.isArray(doc.selection) ? doc.selection.slice() : [];
      state.settings = normalizeSettings(doc.settings);
      state.players = normalizePlayers(doc.players);
      state.games = games;
      state.lobby = normalizeLobby(doc.lobby);
      return state;
    }

    function migrateV1(doc) {
      if (!Array.isArray(doc.players) || !Array.isArray(doc.games)) return null;
      if (doc.currentGame !== null && doc.currentGame !== undefined
        && (!Array.isArray(doc.currentGame.seats) || !Array.isArray(doc.currentGame.rounds))) {
        return null;
      }
      const state = normalizeV2({
        players: doc.players,
        games: doc.games,
        selection: doc.selection,
        settings: doc.settings
      });
      if (!state) return null;
      if (doc.currentGame) state.games.push(convertGame(doc.currentGame));
      return state;
    }

    function fromDocument(doc) {
      if (!doc || typeof doc !== 'object') return null;
      if (doc.version === VERSION) return normalizeV2(doc);
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
      return { id: uid('s'), name: source.name, emoji: source.emoji, color: source.color };
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

    function addPlayer(state, name, emoji) {
      const clean = cleanName(name);
      if (!clean || clean.length > MAX_NAME) throw new Error('Name must be 1-20 characters.');
      const face = String(emoji || '').trim() || '🙂';
      const duplicate = state.players.some(function (player) {
        return player.name.toLowerCase() === clean.toLowerCase() && player.emoji === face;
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
        return other.id !== id
          && other.name.toLowerCase() === clean.toLowerCase()
          && other.emoji === face;
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

    function setLowerWins(state, flag) {
      state.settings.lowerWins = !!flag;
      return state.settings.lowerWins;
    }

    function startGame(state, seats) {
      const chosen = seats || state.selection
        .map(function (id) { return findPlayer(state, id); })
        .filter(Boolean)
        .map(makeSeat);
      if (chosen.length === 0) throw new Error('Pick at least one player first.');
      const game = {
        id: uid('g'),
        startedAt: now(),
        finishedAt: null,
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
      return game;
    }

    function playAgain(state, gameId) {
      const source = gameId ? requireGame(state, gameId) : requireActive(state, null);
      return startGame(state, source.seats.map(makeSeat));
    }

    function deleteGame(state, gameId) {
      const game = requireGame(state, gameId);
      state.games = state.games.filter(function (other) { return other.id !== game.id; });
      return game;
    }

    function setLobby(state, lobby) {
      state.lobby = normalizeLobby(lobby);
      return state.lobby;
    }

    return {
      VERSION: VERSION,
      PALETTE: PALETTE,
      MAX_NAME: MAX_NAME,
      empty: empty,
      fromDocument: fromDocument,
      parsePoints: parsePoints,
      activeGames: activeGames,
      finishedGames: finishedGames,
      findPlayer: findPlayer,
      findGame: findGame,
      addPlayer: addPlayer,
      updatePlayer: updatePlayer,
      removePlayer: removePlayer,
      toggleSeat: toggleSeat,
      clearSeats: clearSeats,
      setLowerWins: setLowerWins,
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
