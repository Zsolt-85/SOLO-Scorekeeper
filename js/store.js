(function (global) {
  'use strict';

  const Model = global.Model
    || (typeof module !== 'undefined' && module.exports ? require('./model.js') : null);

  const KEY = 'noting-more.v2';
  const LEGACY_KEY = 'noting-more.v1';

  function createStore(storage, deps) {
    const model = Model.create(deps || {});
    const listeners = [];
    let degradedReason = null;
    let state = load();

    function write(doc) {
      try {
        storage.setItem(KEY, JSON.stringify(doc));
        return true;
      } catch (error) {
        if (!degradedReason) degradedReason = 'full';
        return false;
      }
    }

    function load() {
      let raw = null;
      try {
        raw = storage.getItem(KEY);
      } catch (error) {
        degradedReason = 'blocked';
        return model.empty();
      }

      if (raw) {
        try {
          const stored = model.fromDocument(JSON.parse(raw));
          if (stored) return stored;
          degradedReason = 'corrupt';
          return model.empty();
        } catch (error) {
          degradedReason = 'corrupt';
          return model.empty();
        }
      }

      let legacy = null;
      try {
        legacy = storage.getItem(LEGACY_KEY);
      } catch (error) {
        legacy = null;
      }
      if (legacy) {
        let migrated = null;
        try {
          migrated = model.fromDocument(JSON.parse(legacy));
        } catch (error) {
          migrated = null;
        }
        if (migrated) {
          write(migrated);
          return migrated;
        }
        degradedReason = 'corrupt';
      }
      return model.empty();
    }

    function persist() {
      write(state);
    }

    function notify() {
      listeners.forEach(function (listener) {
        try { listener(state); } catch (error) { /* a bad listener must not break saving */ }
      });
    }

    function apply(change) {
      const draft = JSON.parse(JSON.stringify(state));
      const result = change(draft);
      state = draft;
      persist();
      notify();
      return result;
    }

    function player(id) {
      return model.findPlayer(state, id);
    }

    const api = {
      PALETTE: Model.PALETTE,

      getState: function () { return state; },

      subscribe: function (listener) {
        listeners.push(listener);
        return function () {
          const at = listeners.indexOf(listener);
          if (at !== -1) listeners.splice(at, 1);
        };
      },

      isDegraded: function () { return degradedReason !== null; },

      degradedReason: function () { return degradedReason; },

      getSettings: function () { return { lowerWins: state.settings.lowerWins }; },

      setLowerWins: function (flag) {
        return apply(function (draft) { return model.setLowerWins(draft, flag); });
      },

      addPlayer: function (name, emoji) {
        return apply(function (draft) { return model.addPlayer(draft, name, emoji); });
      },

      updatePlayer: function (id, name, emoji) {
        return apply(function (draft) { return model.updatePlayer(draft, id, name, emoji); });
      },

      renamePlayer: function (id, name) {
        const current = player(id);
        if (!current) throw new Error('That player is not on your roster.');
        return api.updatePlayer(id, name, current.emoji);
      },

      removePlayer: function (id) {
        return apply(function (draft) { return model.removePlayer(draft, id); });
      },

      toggleSeat: function (id) {
        return apply(function (draft) { return model.toggleSeat(draft, id); });
      },

      clearSeats: function () {
        return apply(function (draft) { return model.clearSeats(draft); });
      },

      startGame: function () {
        return apply(function (draft) { return model.startGame(draft); });
      },

      addPlayerToGame: function (gameId, name, emoji) {
        return apply(function (draft) { return model.addPlayerToGame(draft, gameId, name, emoji); });
      },

      recordRound: function (gameId, values) {
        return apply(function (draft) { return model.recordRound(draft, gameId, values); });
      },

      undoRound: function (gameId) {
        return apply(function (draft) { return model.undoRound(draft, gameId); });
      },

      finishGame: function (gameId) {
        return apply(function (draft) { return model.finishGame(draft, gameId); });
      },

      playAgain: function (gameId) {
        return apply(function (draft) { return model.playAgain(draft, gameId); });
      },

      deleteGame: function (gameId) {
        return apply(function (draft) { return model.deleteGame(draft, gameId); });
      },

      setLobby: function (lobby) {
        return apply(function (draft) { return model.setLobby(draft, lobby); });
      },

      getActiveGame: function () { return model.activeGames(state)[0] || null; },

      activeGames: function () { return model.activeGames(state); },

      finishedGames: function () { return model.finishedGames(state); },

      getGame: function (id) { return model.findGame(state, id); }
    };

    return api;
  }

  const Store = { createStore: createStore, KEY: KEY, LEGACY_KEY: LEGACY_KEY };
  global.Store = Store;
  if (typeof module !== 'undefined' && module.exports) module.exports = Store;
})(typeof window !== 'undefined' ? window : globalThis);
