// The leaderboard's offline-first edge.
//
// Writes are best-effort: a finished game and a registered name go out once, and
// anything that cannot reach the server waits in a small outbox instead. The
// remembered sets make repeats free: a result id is written at most once per
// device, and a pool key is never created twice.
//
// This file knows nothing about Firebase. The caller passes an adapter with
// configured/putPoolPlayer/putResult/listPool/listResults/deletePoolPlayer, which
// makes the whole thing testable with a fake. The adapter may also expose
// `online()`; when it does not, "configured" means "can reach the server", and
// navigator.onLine is the only offline signal.

(function (global) {
  'use strict';

  const Leaderboard = global.Leaderboard
    || (typeof module !== 'undefined' && module.exports ? require('./leaderboard.js') : null);

  const PUBLISHED_KEY = 'noting-more.published.v1';
  const REGISTERED_KEY = 'noting-more.registered.v1';
  const CACHE_KEY = 'noting-more.board.v1';
  const OUTBOX_KEY = 'noting-more.outbox.v1';
  const MAX_OUTBOX = 1000;

  function opError(code, message) {
    const error = new Error(message || code);
    error.code = code;
    return error;
  }

  function readJson(storage, key, fallback) {
    try {
      const raw = storage && storage.getItem(key);
      if (!raw) return fallback;
      const value = JSON.parse(raw);
      return value === null || value === undefined ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(storage, key, value) {
    try {
      if (storage) storage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // A full or blocked storage must never break a score.
    }
  }

  function create(options) {
    const opts = options || {};
    const adapter = opts.adapter || null;
    const storage = opts.storage || null;
    const published = readJson(storage, PUBLISHED_KEY, {});
    const registered = readJson(storage, REGISTERED_KEY, {});
    let cached = readJson(storage, CACHE_KEY, null);
    let outbox = readJson(storage, OUTBOX_KEY, []);
    if (!Array.isArray(outbox)) outbox = [];

    function configured() {
      return !!(adapter && adapter.configured && adapter.configured());
    }

    function online() {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
      if (adapter && typeof adapter.online === 'function') return !!adapter.online();
      return configured();
    }

    function savePublished() { writeJson(storage, PUBLISHED_KEY, published); }
    function saveRegistered() { writeJson(storage, REGISTERED_KEY, registered); }
    function saveOutbox() { writeJson(storage, OUTBOX_KEY, outbox); }

    function saveCached(pool, results) {
      cached = { pool: pool, results: results, fetchedAt: Date.now() };
      writeJson(storage, CACHE_KEY, cached);
    }

    function cachedBoard() {
      return cached;
    }

    function settled(op) {
      if (op.kind === 'pool') {
        registered[op.id] = true;
        saveRegistered();
      } else {
        published[op.id] = true;
        savePublished();
      }
    }

    function drop(op) {
      outbox.shift();
      saveOutbox();
    }

    // Drain in order. A permanent rejection (bad data) is dropped so one broken
    // result cannot block the queue forever; a network failure keeps the op and
    // stops until the next flush.
    function flush() {
      if (!online()) return Promise.resolve(false);
      const op = outbox[0];
      if (!op) return Promise.resolve(true);
      const write = op.kind === 'pool' ? adapter.putPoolPlayer : adapter.putResult;
      return write.call(adapter, op.id, op.data).then(function () {
        settled(op);
        drop(op);
        return flush();
      }, function (error) {
        const code = error && error.code;
        if (code === 'already-exists') {
          settled(op);
          drop(op);
          return flush();
        }
        if (code === 'invalid-argument' || code === 'failed-precondition') {
          if (op.kind === 'result') {
            published[op.id] = true;
            savePublished();
          }
          drop(op);
          return flush();
        }
        return false;
      });
    }

    function queue(kind, id, data) {
      const exists = outbox.some(function (op) {
        return op.kind === kind && op.id === id;
      });
      if (!exists) outbox.push({ kind: kind, id: id, data: data });
      while (outbox.length > MAX_OUTBOX) {
        const dropped = outbox.shift();
        settled(dropped);
      }
      if (!exists) saveOutbox();
    }

    // `queue: false` is the explicit board-registration path: it must report a
    // taken name instead of quietly succeeding, so it skips the local shortcut.
    function register(name, emoji, options) {
      const opts = options || {};
      const mayQueue = opts.queue !== false;
      const key = Leaderboard.keyFor(name);
      if (!key) return Promise.reject(new Error('A name is required.'));
      if (mayQueue && registered[key]) return Promise.resolve({ key: key, created: false });
      const profile = {
        name: String(name === null || name === undefined ? '' : name)
          .replace(/\s+/g, ' ')
          .trim(),
        emoji: String(emoji || '')
      };

      function done() {
        registered[key] = true;
        saveRegistered();
        return { key: key, created: true };
      }

      function fail(error) {
        if (error && error.code === 'already-exists') {
          registered[key] = true;
          saveRegistered();
          if (mayQueue) return { key: key, created: false };
          throw error;
        }
        if (mayQueue) {
          queue('pool', key, profile);
          return { key: key, created: true, queued: true };
        }
        throw error;
      }

      if (!online()) {
        if (mayQueue) {
          queue('pool', key, profile);
          return Promise.resolve({ key: key, created: true, queued: true });
        }
        return Promise.reject(opError('offline', 'Connect to register a new player.'));
      }
      return adapter.putPoolPlayer(key, profile).then(done, fail);
    }

    function publish(result) {
      if (!result || !result.id) return Promise.resolve({ id: null, created: false });
      const id = result.id;
      if (published[id]) return Promise.resolve({ id: id, created: false });

      function done() {
        published[id] = true;
        savePublished();
        return { id: id, created: true };
      }

      if (!online()) {
        queue('result', id, result);
        return Promise.resolve({ id: id, created: true, queued: true });
      }
      return adapter.putResult(id, result).then(done, function (error) {
        if (error && error.code === 'already-exists') return done();
        queue('result', id, result);
        return { id: id, created: true, queued: true };
      });
    }

    function fetchBoard() {
      if (!online()) {
        if (cached) {
          return Promise.resolve({
            pool: cached.pool || [],
            results: cached.results || [],
            stale: true,
            fetchedAt: cached.fetchedAt
          });
        }
        return Promise.resolve({ pool: [], results: [], stale: false, fetchedAt: null });
      }
      return Promise.all([adapter.listPool(), adapter.listResults()]).then(function (parts) {
        const pool = Array.isArray(parts[0]) ? parts[0] : [];
        const results = Array.isArray(parts[1]) ? parts[1] : [];
        saveCached(pool, results);
        return { pool: pool, results: results, stale: false, fetchedAt: cached.fetchedAt };
      }, function () {
        if (cached) {
          return {
            pool: cached.pool || [],
            results: cached.results || [],
            stale: true,
            fetchedAt: cached.fetchedAt
          };
        }
        return { pool: [], results: [], stale: false, fetchedAt: null };
      });
    }

    function remove(key) {
      if (!online()) return Promise.reject(opError('offline', 'Connect to remove a player.'));
      return adapter.deletePoolPlayer(key).then(function () {
        if (!cached) return;
        cached.pool = (cached.pool || []).filter(function (profile) {
          return profile.id !== key;
        });
        cached.fetchedAt = Date.now();
        writeJson(storage, CACHE_KEY, cached);
      });
    }

    return {
      register: register,
      publish: publish,
      flush: flush,
      fetchBoard: fetchBoard,
      cachedBoard: cachedBoard,
      remove: remove,
      pending: function () { return outbox.length; }
    };
  }

  const Sync = { create: create };

  global.Sync = Sync;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sync;
})(typeof window !== 'undefined' ? window : globalThis);
