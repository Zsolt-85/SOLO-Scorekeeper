// A shared lobby: the same state machine as the local store, but the documents live
// in Firestore and every paired phone sees the same ones.
//
// Two things keep it honest:
//   * round-by-round scoring is stored as one document per round, so two phones
//     saving at the same moment create two rounds instead of overwriting each other;
//   * state is rebuilt from live snapshots rather than merged locally, so nobody has
//     to guess what the other phone did.
//
// The commands themselves are still the plain model: they run against a throwaway
// copy of the current state, purely to validate the input and mint ids, and the
// resulting change is what gets written.

(function (global) {
  'use strict';

  const Model = global.Model
    || (typeof module !== 'undefined' && module.exports ? require('./model.js') : null);

  const CODE_LENGTH = 8;
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const ONLINE_MS = 120000;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeCode(input) {
    return String(input === null || input === undefined ? '' : input)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  function newCode(random) {
    const pick = random || Math.random;
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += ALPHABET[Math.floor(pick() * ALPHABET.length)];
    }
    return code;
  }

  function validCode(code) {
    if (code.length !== CODE_LENGTH) return false;
    for (let i = 0; i < code.length; i += 1) {
      if (ALPHABET.indexOf(code[i]) === -1) return false;
    }
    return true;
  }

  function assembleGame(game, roundSets) {
    const seats = (game.seats || []).map(function (seat) {
      const out = { id: seat.id, name: seat.name, emoji: seat.emoji, color: seat.color };
      if (seat.playerId) out.playerId = seat.playerId;
      return out;
    });
    const out = {
      id: game.id,
      startedAt: game.startedAt === undefined ? null : game.startedAt,
      finishedAt: game.finishedAt === undefined ? null : game.finishedAt,
      seats: seats,
      rounds: (roundSets[game.id] || []).map(function (round) {
        return { id: round.id, at: round.at === undefined ? null : round.at, points: round.points || {} };
      })
    };
    // Only a finished game carries the scoring direction it was played in.
    if (typeof game.lowerWins === 'boolean') out.lowerWins = game.lowerWins;
    return out;
  }

  function assemble(docs, lobby) {
    const roundSets = docs.rounds || {};
    return {
      version: Model.VERSION,
      selection: docs.meta && Array.isArray(docs.meta.selection) ? docs.meta.selection.slice() : [],
      players: (docs.players || []).map(function (player) {
        return {
          id: player.id,
          name: player.name,
          emoji: player.emoji,
          color: player.color,
          createdAt: player.createdAt
        };
      }),
      games: (docs.games || []).map(function (game) {
        return assembleGame(game, roundSets);
      }),
      settings: { lowerWins: !(docs.meta && docs.meta.lowerWins === false) },
      lobby: lobby || null
    };
  }

  function put(path, data) {
    return { type: 'set', path: path, data: data };
  }

  function drop(path) {
    return { type: 'delete', path: path };
  }

  function gameDoc(game) {
    const out = {
      id: game.id,
      startedAt: game.startedAt,
      finishedAt: game.finishedAt,
      seats: game.seats
    };
    if (typeof game.lowerWins === 'boolean') out.lowerWins = game.lowerWins;
    return out;
  }

  function metaDoc(state) {
    return {
      lowerWins: state.settings.lowerWins,
      selection: state.selection.slice(),
      updatedAt: Date.now()
    };
  }

  // Compare two documents by what they hold, not by the order their keys happen to
  // be in: a phone writes a seat as {id, playerId, name}, while the next phone
  // rebuilds it from Firestore as {id, name, ..., playerId}. Raw JSON would call
  // those different, and the write would be replayed on top of every snapshot.
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).sort().forEach(function (key) {
        out[key] = canonical(value[key]);
      });
      return out;
    }
    return value;
  }

  function sameDoc(a, b) {
    return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  }

  // Has a snapshot caught up with the change we already showed the player?
  // Snapshots arrive slice by slice, so a snapshot that lags behind one of our
  // own writes must not be allowed to wipe it off the board.
  function reflectsOp(model, state, op) {
    const parts = op.path.split('/');
    if (parts[0] === 'players') {
      const player = model.findPlayer(state, parts[1]);
      if (op.type === 'delete') return !player;
      return !!player && sameDoc(player, op.data);
    }
    if (parts[0] === 'games') {
      const game = model.findGame(state, parts[1]);
      if (op.type === 'delete') return !game;
      if (!game) return false;
      if (parts.length === 2) {
        return game.startedAt === op.data.startedAt
          && game.finishedAt === op.data.finishedAt
          && game.lowerWins === op.data.lowerWins
          && sameDoc(game.seats, op.data.seats);
      }
      if (parts.length === 4 && parts[2] === 'rounds') {
        const round = game.rounds.filter(function (one) { return one.id === parts[3]; })[0];
        return !!round && sameDoc(round.points, op.data.points);
      }
      return false;
    }
    if (op.path === 'meta/state') {
      return state.settings.lowerWins === op.data.lowerWins && sameDoc(state.selection, op.data.selection);
    }
    return true;
  }

  function applyOp(model, state, op) {
    const parts = op.path.split('/');
    if (parts[0] === 'players') {
      if (op.type === 'delete') {
        state.players = state.players.filter(function (player) { return player.id !== parts[1]; });
        state.selection = state.selection.filter(function (id) { return id !== parts[1]; });
        return;
      }
      const at = state.players.map(function (player) { return player.id; }).indexOf(op.data.id);
      if (at === -1) state.players.push(op.data);
      else state.players[at] = op.data;
      return;
    }
    if (parts[0] === 'games' && parts.length === 2) {
      if (op.type === 'delete') {
        state.games = state.games.filter(function (game) { return game.id !== parts[1]; });
        return;
      }
      const at = state.games.map(function (game) { return game.id; }).indexOf(op.data.id);
      if (at === -1) {
        const created = {
          id: op.data.id,
          startedAt: op.data.startedAt,
          finishedAt: op.data.finishedAt,
          seats: op.data.seats,
          rounds: []
        };
        if (typeof op.data.lowerWins === 'boolean') created.lowerWins = op.data.lowerWins;
        state.games.push(created);
      } else {
        state.games[at].startedAt = op.data.startedAt;
        state.games[at].finishedAt = op.data.finishedAt;
        state.games[at].seats = op.data.seats;
        if (typeof op.data.lowerWins === 'boolean') state.games[at].lowerWins = op.data.lowerWins;
      }
      return;
    }
    if (parts[0] === 'games' && parts[2] === 'rounds') {
      const game = model.findGame(state, parts[1]);
      if (!game) return;
      if (op.type === 'delete') {
        game.rounds = game.rounds.filter(function (round) { return round.id !== parts[3]; });
        return;
      }
      const round = { id: op.data.id, at: op.data.at, points: op.data.points };
      const at = game.rounds.map(function (one) { return one.id; }).indexOf(round.id);
      if (at === -1) game.rounds.push(round);
      else game.rounds[at] = round;
      game.rounds.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
      return;
    }
    if (op.path === 'meta/state') {
      state.settings.lowerWins = op.data.lowerWins;
      state.selection = op.data.selection.slice();
    }
  }

  function opsFor(model, state, name, args) {
    const draft = clone(state);
    const plan = planFor(model, draft, state, name, args);
    plan.next = draft;
    return plan;
  }

  function planFor(model, draft, before, name, args) {
    const input = args || {};
    switch (name) {
      case 'addPlayer': {
        const player = model.addPlayer(draft, input.name, input.emoji);
        return { ops: [put('players/' + player.id, player)], value: player };
      }
      case 'updatePlayer': {
        const player = model.updatePlayer(draft, input.id, input.name, input.emoji);
        return { ops: [put('players/' + player.id, player)], value: player };
      }
      case 'removePlayer': {
        const player = model.removePlayer(draft, input.id);
        const ops = [drop('players/' + player.id)];
        if (before.selection.indexOf(player.id) !== -1) ops.push(put('meta/state', metaDoc(draft)));
        return { ops: ops, value: player };
      }
      case 'toggleSeat': {
        const selection = model.toggleSeat(draft, input.id);
        return { ops: [put('meta/state', metaDoc(draft))], value: selection };
      }
      case 'clearSeats': {
        model.clearSeats(draft);
        return { ops: [put('meta/state', metaDoc(draft))], value: [] };
      }
      case 'setLowerWins': {
        const flag = model.setLowerWins(draft, input.lowerWins);
        return { ops: [put('meta/state', metaDoc(draft))], value: flag };
      }
      case 'startGame': {
        const game = model.startGame(draft);
        return { ops: [put('games/' + game.id, gameDoc(game)), put('meta/state', metaDoc(draft))], value: game };
      }
      case 'addPlayerToGame': {
        const player = model.addPlayerToGame(draft, input.gameId, input.name, input.emoji);
        const game = model.findGame(draft, input.gameId);
        return { ops: [put('players/' + player.id, player), put('games/' + game.id, gameDoc(game))], value: player };
      }
      case 'recordRound': {
        const game = model.recordRound(draft, input.gameId, input.values);
        const round = game.rounds[game.rounds.length - 1];
        return {
          ops: [put('games/' + game.id + '/rounds/' + round.id, { id: round.id, at: round.at, points: round.points })],
          value: game
        };
      }
      case 'undoRound': {
        const previous = model.findGame(before, input.gameId);
        const newest = previous && previous.rounds[previous.rounds.length - 1];
        const game = model.undoRound(draft, input.gameId);
        return { ops: [drop('games/' + game.id + '/rounds/' + newest.id)], value: game };
      }
      case 'finishGame': {
        const game = model.finishGame(draft, input.gameId);
        return { ops: [put('games/' + game.id, gameDoc(game))], value: game };
      }
      case 'playAgain': {
        const game = model.playAgain(draft, input.gameId);
        return { ops: [put('games/' + game.id, gameDoc(game)), put('meta/state', metaDoc(draft))], value: game };
      }
      case 'deleteGame': {
        const game = model.deleteGame(draft, input.gameId);
        return { ops: [drop('games/' + game.id)], value: game };
      }
      default:
        throw new Error('Unknown lobby command: ' + name);
    }
  }

  function create(options) {
    const adapter = options.adapter;
    const model = Model.create({ now: options.now, uid: options.uid });
    const clock = options.now || function () { return Date.now(); };
    const code = normalizeCode(options.code);
    const deviceId = options.deviceId;
    const title = options.name || '';
    const heartbeatMs = options.heartbeatMs === undefined ? 60000 : options.heartbeatMs;
    const listeners = [];
    const ready = [];

    let docs = { space: null, players: [], games: [], rounds: {}, meta: null, presence: [] };
    let state = assemble(docs, { code: code, name: title, joinedAt: null });
    let pending = [];
    let connected = false;
    let closed = false;
    let disconnect = null;
    let ticker = null;
    let failure = null;

    function notify() {
      listeners.forEach(function (listener) {
        try { listener(state); } catch (error) { /* one bad listener must not stop the rest */ }
      });
    }

    function settle() {
      while (ready.length) ready.shift()(state);
    }

    function online() {
      const cut = clock() - ONLINE_MS;
      return docs.presence.filter(function (note) { return note.seen && note.seen >= cut; }).length;
    }

    // Rebuild the board from the last snapshot, then paint our own writes back on
    // top for as long as the snapshot has not caught up with them yet.
    function rebuild() {
      state = assemble(docs, { code: code, name: (docs.space && docs.space.name) || title, joinedAt: null });
      pending = pending.filter(function (plan) {
        return !plan.ops.every(function (op) { return reflectsOp(model, state, op); });
      });
      pending.forEach(function (plan) {
        plan.ops.forEach(function (op) { applyOp(model, state, op); });
      });
    }

    // Writes are optimistic: the change lands locally at once (so the board never
    // lags a tap) and is written in the background. Validation errors still throw
    // here and now; a failed write is rolled back and surfaced.
    function run(name, args) {
      const plan = opsFor(model, state, name, args);
      state = plan.next;
      pending.push(plan);
      notify();
      Promise.resolve(adapter.commit(code, plan.ops)).then(function () {
        if (!failure) return;
        failure = null;
        rebuild();
        notify();
      }, function (error) {
        const at = pending.indexOf(plan);
        if (at !== -1) pending.splice(at, 1);
        failure = (error && error.message) || 'That change could not be saved.';
        rebuild();
        notify();
      });
      return plan.value;
    }

    function leave() {
      if (closed) return Promise.resolve();
      closed = true;
      if (ticker) { clearInterval(ticker); ticker = null; }
      if (disconnect) disconnect();
      disconnect = null;
      listeners.length = 0;
      ready.length = 0;
      return Promise.resolve(adapter.leave(code, deviceId)).catch(function () { /* leaving is best effort */ });
    }

    const api = {
      CODE_LENGTH: CODE_LENGTH,

      getState: function () { return state; },

      subscribe: function (listener) {
        listeners.push(listener);
        return function () {
          const at = listeners.indexOf(listener);
          if (at !== -1) listeners.splice(at, 1);
        };
      },

      whenReady: function (callback) {
        if (connected) { callback(state); return; }
        ready.push(callback);
      },

      isDegraded: function () { return false; },

      degradedReason: function () { return null; },

      status: function () {
        return {
          code: code,
          name: (docs.space && docs.space.name) || title,
          online: online(),
          connected: connected,
          closed: closed,
          problem: failure
        };
      },

      getSettings: function () { return { lowerWins: state.settings.lowerWins }; },

      getActiveGame: function () { return model.activeGames(state)[0] || null; },

      activeGames: function () { return model.activeGames(state); },

      finishedGames: function () { return model.finishedGames(state); },

      getGame: function (id) { return model.findGame(state, id); },

      // The same surface as the local store, so the view layer never has to care
      // which one it is talking to.
      setLowerWins: function (flag) {
        return run('setLowerWins', { lowerWins: flag });
      },

      addPlayer: function (name, emoji) {
        return run('addPlayer', { name: name, emoji: emoji });
      },

      updatePlayer: function (id, name, emoji) {
        return run('updatePlayer', { id: id, name: name, emoji: emoji });
      },

      renamePlayer: function (id, name) {
        const current = model.findPlayer(state, id);
        if (!current) throw new Error('That player is not on your roster.');
        return api.updatePlayer(id, name, current.emoji);
      },

      removePlayer: function (id) {
        return run('removePlayer', { id: id });
      },

      toggleSeat: function (id) {
        return run('toggleSeat', { id: id });
      },

      clearSeats: function () {
        return run('clearSeats', {});
      },

      startGame: function () {
        return run('startGame', {});
      },

      addPlayerToGame: function (gameId, name, emoji) {
        return run('addPlayerToGame', { gameId: gameId, name: name, emoji: emoji });
      },

      recordRound: function (gameId, values) {
        return run('recordRound', { gameId: gameId, values: values });
      },

      undoRound: function (gameId) {
        return run('undoRound', { gameId: gameId });
      },

      finishGame: function (gameId) {
        return run('finishGame', { gameId: gameId });
      },

      playAgain: function (gameId) {
        return run('playAgain', { gameId: gameId });
      },

      deleteGame: function (gameId) {
        return run('deleteGame', { gameId: gameId });
      },

      run: run,
      leave: leave
    };

    adapter.connect({
      code: code,
      deviceId: deviceId,
      onData: function (next) {
        if (closed) return;
        docs = next;
        rebuild();
        connected = true;
        notify();
        settle();
      },
      onError: function (error) {
        failure = (error && error.message) || 'The lobby could not be reached.';
        notify();
        settle();
      }
    }).then(function (stop) {
      if (closed) { stop(); return; }
      disconnect = stop;
      if (heartbeatMs > 0) {
        adapter.heartbeat(code, deviceId).catch(function () {});
        ticker = setInterval(function () {
          adapter.heartbeat(code, deviceId).catch(function () {});
        }, heartbeatMs);
      }
      settle();
    }).catch(function (error) {
      failure = (error && error.message) || 'The lobby could not be reached.';
      settle();
    });

    return api;
  }

  const Space = {
    create: create,
    assemble: assemble,
    opsFor: opsFor,
    newCode: newCode,
    validCode: validCode,
    normalizeCode: normalizeCode,
    ONLINE_MS: ONLINE_MS,
    CODE_LENGTH: CODE_LENGTH,
    ALPHABET: ALPHABET
  };

  global.Space = Space;
  if (typeof module !== 'undefined' && module.exports) module.exports = Space;
})(typeof window !== 'undefined' ? window : globalThis);
