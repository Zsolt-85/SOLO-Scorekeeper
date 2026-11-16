// Players-page edits of the shared player pool. Pool documents are immutable
// (create-if-free / delete / no update), and result identity is the player's
// name, so an edit is always delete + recreate. Emoji edits keep the same key
// (stats stay attached); a name edit is only allowed while there are no games
// to leave behind. Every failure restores the previous profile before it
// reaches the user. Nothing here touches the DOM, storage or the network
// directly — all of that is injected, so the rules are plain node:test tests.

(function (global) {
  'use strict';

  const Leaderboard = global.Leaderboard
    || (typeof module !== 'undefined' && module.exports ? require('./leaderboard.js') : null);

  function create(deps) {
    const d = deps || {};
    const sync = d.sync;
    const adapter = d.adapter;
    const local = d.local;
    const activeGameId = typeof d.activeGameId === 'function'
      ? d.activeGameId
      : function () { return 'solo'; };

    function roster() {
      return (local && local.getState() && local.getState().players) || [];
    }

    function profile(name, emoji) {
      return { name: name, emoji: emoji, game: activeGameId() };
    }

    // Best effort: the delete may have failed too, but if it succeeded the old
    // profile must not vanish because the follow-up create rejected.
    function restore(key, name, emoji) {
      if (!adapter) return Promise.resolve();
      try {
        return Promise.resolve(adapter.putPoolPlayer(key, profile(name, emoji)))
          .catch(function () {});
      } catch (error) {
        return Promise.resolve();
      }
    }

    function mirrorLocal(oldName, name, emoji) {
      const match = roster().filter(function (player) {
        return player && Leaderboard.normalise(player.name) === Leaderboard.normalise(oldName);
      })[0];
      if (!match || !local || typeof local.updatePlayer !== 'function') return null;
      try {
        local.updatePlayer(match.id, name, emoji);
        return null;
      } catch (error) {
        return 'roster';
      }
    }

    function editPlayer(row, name, emoji) {
      const display = String(name === null || name === undefined ? '' : name)
        .replace(/\s+/g, ' ').trim();
      if (!display || display.length > 20) {
        return Promise.reject(new Error('A name is 1-20 characters.'));
      }
      const original = row || {};
      const nameChanged = Leaderboard.normalise(display) !== Leaderboard.normalise(original.name);
      const emojiChanged = emoji !== original.emoji;
      if (!nameChanged && !emojiChanged) {
        return Promise.resolve({ changed: [], key: original.key, name: display, emoji: emoji });
      }
      if (nameChanged && (original.games || 0) > 0) {
        return Promise.reject(new Error(
          'Players with games keep their name — old results cannot move to a new one.'
        ));
      }
      if (nameChanged && roster().some(function (player) {
        return player && Leaderboard.normalise(player.name) === Leaderboard.normalise(display);
      })) {
        return Promise.reject(new Error('That name is already on your roster.'));
      }

      const deleteFirst = function () {
        return original.fromPool && sync ? sync.remove(original.key) : null;
      };
      const finish = function (changed) {
        return function () {
          const warning = mirrorLocal(original.name, display, emoji);
          const result = {
            changed: changed, key: original.key, name: display, emoji: emoji
          };
          if (warning) result.warning = warning;
          return result;
        };
      };

      if (nameChanged) {
        return Promise.resolve()
          .then(deleteFirst)
          .then(function () {
            return sync.register(display, emoji, { queue: false, game: activeGameId() });
          })
          .catch(function (error) {
            return restore(original.key, original.name, original.emoji).then(function () {
              throw (error && error.code === 'already-exists'
                ? new Error('That name is already registered.')
                : error);
            });
          })
          .then(finish(['name']));
      }

      return Promise.resolve()
        .then(deleteFirst)
        .then(function () { return adapter.putPoolPlayer(original.key, profile(original.name, emoji)); })
        .catch(function (error) {
          return restore(original.key, original.name, original.emoji).then(function () {
            throw error;
          });
        })
        .then(finish(['emoji']));
    }

    return { editPlayer: editPlayer };
  }

  const PoolEdit = { create: create };

  global.PoolEdit = PoolEdit;
  if (typeof module !== 'undefined' && module.exports) module.exports = PoolEdit;
})(typeof window !== 'undefined' ? window : globalThis);
