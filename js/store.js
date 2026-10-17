(function (global) {
  'use strict';

  const KEY = 'noting-more.v1';
  const PALETTE = ['#f0b429', '#5bc8af', '#ef7f6b', '#9d8df1', '#6ec1ff', '#7bc950', '#f28ab2', '#c9a227'];
  const MAX_NAME = 20;

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function emptyState() {
    return {
      version: 1,
      selection: [],
      players: [],
      currentGame: null,
      games: [],
      settings: { lowerWins: true }
    };
  }

  function normalizeSettings(settings) {
    const lowerWins = settings && typeof settings.lowerWins === 'boolean' ? settings.lowerWins : true;
    return { lowerWins: lowerWins };
  }

  function isValidState(value) {
    if (!value || value.version !== 1) return false;
    if (!Array.isArray(value.players) || !Array.isArray(value.games)) return false;
    const game = value.currentGame;
    if (game === null || game === undefined) return true;
    return Array.isArray(game.seats) && Array.isArray(game.rounds);
  }

  function cleanName(name) {
    return String(name === null || name === undefined ? '' : name).trim();
  }

  function parsePoints(value) {
    if (value === '' || value === null || value === undefined) return 0;
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.trunc(n);
  }

  function createStore(storage) {
    let degradedReason = null;
    let state = load();

    function load() {
      let raw;
      try {
        raw = storage.getItem(KEY);
      } catch (error) {
        degradedReason = 'blocked';
        return emptyState();
      }
      if (!raw) return emptyState();
      try {
        const parsed = JSON.parse(raw);
        if (!isValidState(parsed)) {
          degradedReason = 'corrupt';
          return emptyState();
        }
        parsed.selection = Array.isArray(parsed.selection) ? parsed.selection : [];
        parsed.settings = normalizeSettings(parsed.settings);
        return parsed;
      } catch (error) {
        degradedReason = 'corrupt';
        return emptyState();
      }
    }

    function persist() {
      try {
        storage.setItem(KEY, JSON.stringify(state));
      } catch (error) {
        if (!degradedReason) degradedReason = 'full';
      }
    }

    function findPlayer(id) {
      return state.players.find(function (player) { return player.id === id; }) || null;
    }

    function nextColour() {
      const used = state.players.map(function (player) { return player.color; });
      const free = PALETTE.filter(function (colour) { return used.indexOf(colour) === -1; });
      return free[0] || PALETTE[state.players.length % PALETTE.length];
    }

    function createPlayer(name, emoji) {
      const clean = cleanName(name);
      if (!clean || clean.length > MAX_NAME) throw new Error('Name must be 1-20 characters.');
      const face = String(emoji || '').trim() || '🙂';
      const duplicate = state.players.some(function (player) {
        return player.name.toLowerCase() === clean.toLowerCase() && player.emoji === face;
      });
      if (duplicate) throw new Error('That player is already on your roster.');
      const player = { id: uid('p'), name: clean, emoji: face, color: nextColour(), createdAt: Date.now() };
      state.players.push(player);
      return player;
    }

    function requireGame() {
      if (!state.currentGame) throw new Error('No game in progress.');
      return state.currentGame;
    }

    function makeSeat(source) {
      return { id: uid('s'), name: source.name, emoji: source.emoji, color: source.color };
    }

    function startNewGame(seats) {
      state.currentGame = {
        id: uid('g'),
        startedAt: Date.now(),
        finishedAt: null,
        seats: seats,
        rounds: []
      };
      return state.currentGame;
    }

    const api = {
      PALETTE: PALETTE,

      getState: function () { return state; },

      isDegraded: function () { return degradedReason !== null; },

      degradedReason: function () { return degradedReason; },

      getSettings: function () { return { lowerWins: state.settings.lowerWins }; },

      setLowerWins: function (flag) {
        state.settings.lowerWins = !!flag;
        persist();
        return state.settings.lowerWins;
      },

      addPlayer: function (name, emoji) {
        const player = createPlayer(name, emoji);
        persist();
        return player;
      },

      renamePlayer: function (id, name) {
        const clean = cleanName(name);
        if (!clean || clean.length > MAX_NAME) throw new Error('Name must be 1-20 characters.');
        const player = findPlayer(id);
        if (!player) throw new Error('That player is not on your roster.');
        player.name = clean;
        persist();
        return player;
      },

      updatePlayer: function (id, name, emoji) {
        const clean = cleanName(name);
        if (!clean || clean.length > MAX_NAME) throw new Error('Name must be 1-20 characters.');
        const player = findPlayer(id);
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
        persist();
        return player;
      },

      toggleSeat: function (id) {
        const at = state.selection.indexOf(id);
        if (at === -1) state.selection.push(id);
        else state.selection.splice(at, 1);
        persist();
        return state.selection.slice();
      },

      clearSeats: function () {
        state.selection = [];
        persist();
      },

      startGame: function () {
        const chosen = state.selection.map(findPlayer).filter(Boolean);
        if (chosen.length === 0) throw new Error('Pick at least one player first.');
        const seats = chosen.map(makeSeat);
        state.selection = [];
        const game = startNewGame(seats);
        persist();
        return game;
      },

      recordRound: function (values) {
        const game = requireGame();
        const points = (values || []).map(parsePoints);
        if (points.length !== game.seats.length) throw new Error('Point count must match the number of players.');
        game.rounds.push({ id: uid('r'), points: points });
        persist();
        return game;
      },

      undoRound: function () {
        const game = requireGame();
        if (game.rounds.length === 0) throw new Error('No round to undo.');
        game.rounds.pop();
        persist();
        return game;
      },

      addPlayerToCurrentGame: function (name, emoji) {
        const game = requireGame();
        const player = createPlayer(name, emoji);
        game.seats.push(makeSeat(player));
        game.rounds.forEach(function (round) { round.points.push(0); });
        persist();
        return player;
      },

      finishGame: function () {
        const game = requireGame();
        if (game.rounds.length === 0) throw new Error('Play at least one round before ending the game.');
        game.finishedAt = Date.now();
        state.games.unshift(game);
        state.currentGame = null;
        persist();
        return game;
      },

      playAgain: function (gameId) {
        const source = gameId ? api.getGame(gameId) : state.currentGame;
        if (!source) throw new Error('That game is no longer available.');
        if (state.currentGame && state.currentGame.id !== gameId) {
          throw new Error('Finish or leave the game in progress first.');
        }
        const seats = source.seats.map(makeSeat);
        const game = startNewGame(seats);
        persist();
        return game;
      },

      getGame: function (id) {
        if (state.currentGame && state.currentGame.id === id) return state.currentGame;
        return state.games.find(function (game) { return game.id === id; }) || null;
      }
    };

    return api;
  }

  const Store = { createStore: createStore };
  global.Store = Store;
  if (typeof module !== 'undefined' && module.exports) module.exports = Store;
})(typeof window !== 'undefined' ? window : globalThis);
