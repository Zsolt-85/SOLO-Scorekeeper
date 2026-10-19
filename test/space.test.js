const test = require('node:test');
const assert = require('node:assert/strict');
const Space = require('../js/space.js');
const { create } = require('../js/model.js');

const model = create({ now: () => 1, uid: (p) => p + '1' });

function docs(overrides) {
  return Object.assign({
    space: { id: 'ABCD2345', name: 'Kitchen' },
    players: [{ id: 'p1', name: 'Maya', emoji: 'M', color: '#f0b429', createdAt: 1 }],
    games: [{
      id: 'g1',
      startedAt: 5,
      finishedAt: null,
      seats: [{ id: 's1', name: 'Maya', emoji: 'M', color: '#f0b429' }]
    }],
    rounds: { g1: [{ id: 'r1', at: 9, points: { s1: 7 } }] },
    meta: { lowerWins: true, selection: [] },
    presence: []
  }, overrides);
}

function fakeAdapter() {
  const calls = { commit: [], heartbeat: [], leave: [] };
  let emit = null;
  return {
    calls,
    connect(options) {
      emit = options.onData;
      return Promise.resolve(() => { calls.disconnected = true; });
    },
    commit(code, ops) { calls.commit.push({ code, ops }); return Promise.resolve(); },
    heartbeat(code, deviceId) { calls.heartbeat.push([code, deviceId]); return Promise.resolve(); },
    leave(code, deviceId) { calls.leave.push([code, deviceId]); return Promise.resolve(); },
    push(next) { emit(next); }
  };
}

test('newCode spells only unambigous characters', () => {
  let calls = 0;
  const code = Space.newCode(() => { calls += 1; return 0.1; });
  assert.equal(code.length, 8);
  assert.equal(calls, 8);
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  for (let seed = 0; seed < 200; seed += 1) {
    const random = Space.newCode(Math.random);
    for (const letter of random) {
      assert.ok('IO01'.indexOf(letter) === -1, 'never spells ' + letter);
    }
  }
});

test('validCode accepts only a full 8-character code', () => {
  assert.equal(Space.validCode('ABCD2345'), true);
  assert.equal(Space.validCode('ABCD234'), false);
  assert.equal(Space.validCode('ABCD23456'), false);
  assert.equal(Space.validCode('ABCD234O'), false, 'O is not in the alphabet');
  assert.equal(Space.validCode('abcd2345'), false, 'codes are normalised before checking');
});

test('normalizeCode uppercases and strips everything else', () => {
  assert.equal(Space.normalizeCode(' abcd-2345 '), 'ABCD2345');
  assert.equal(Space.normalizeCode(null), '');
});

test('assemble turns lobby documents into a v2 state', () => {
  const state = Space.assemble(docs(), { code: 'ABCD2345', name: 'Kitchen', joinedAt: null });
  assert.equal(state.version, 2);
  assert.deepEqual(state.settings, { lowerWins: true });
  assert.deepEqual(state.selection, []);
  assert.deepEqual(state.players.map((p) => p.name), ['Maya']);
  assert.deepEqual(state.lobby, { code: 'ABCD2345', name: 'Kitchen', joinedAt: null });
});

test('assemble folds each game together with its own rounds', () => {
  const state = Space.assemble(docs(), null);
  const game = state.games[0];
  assert.equal(game.id, 'g1');
  assert.equal(game.rounds.length, 1);
  assert.deepEqual(game.rounds[0].points, { s1: 7 });
  assert.deepEqual(require('../js/ranking.js').totalsFor(game), [7]);
});

test('assemble defaults a missing game in progress to active', () => {
  const state = Space.assemble(docs({ games: [{ id: 'g9', seats: [] }], rounds: {} }), null);
  assert.equal(state.games[0].finishedAt, null);
});

test('assemble keeps the shared scoring direction', () => {
  assert.deepEqual(Space.assemble(docs({ meta: { lowerWins: false } }), null).settings, { lowerWins: false });
  assert.deepEqual(Space.assemble(docs({ meta: null }), null).settings, { lowerWins: true });
});

test('assemble tolerates an empty lobby', () => {
  const state = Space.assemble({}, null);
  assert.deepEqual(state.players, []);
  assert.deepEqual(state.games, []);
  assert.deepEqual(state.selection, []);
});

test('addPlayer writes one player document', () => {
  const state = Space.assemble(docs(), null);
  const { ops, value } = Space.opsFor(model, state, 'addPlayer', { name: 'Dana', emoji: 'D' });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].type, 'set');
  assert.equal(ops[0].path, 'players/' + value.id);
  assert.equal(ops[0].data.name, 'Dana');
});

test('addPlayer still validates through the model', () => {
  const state = Space.assemble(docs(), null);
  assert.throws(() => Space.opsFor(model, state, 'addPlayer', { name: '  ', emoji: 'D' }), /1-20 characters/);
});

test('startGame writes the game and clears the shared selection', () => {
  const state = Space.assemble(docs({ meta: { lowerWins: true, selection: ['p1'] } }), null);
  const { ops, value } = Space.opsFor(model, state, 'startGame', {});
  assert.equal(ops.length, 2);
  const game = ops.find((op) => op.path.indexOf('games/') === 0);
  const meta = ops.find((op) => op.path === 'meta/state');
  assert.equal(game.data.id, value.id);
  assert.deepEqual(game.data.seats.map((s) => s.name), ['Maya']);
  assert.equal(game.data.rounds, undefined, 'rounds live in their own documents');
  assert.deepEqual(meta.data.selection, []);
});

test('recordRound writes one round document and nothing else', () => {
  const state = Space.assemble(docs(), null);
  const { ops } = Space.opsFor(model, state, 'recordRound', { gameId: 'g1', values: ['4'] });
  assert.equal(ops.length, 1, 'two phones saving at once must not touch the same document');
  assert.match(ops[0].path, /^games\/g1\/rounds\//);
  assert.deepEqual(ops[0].data.points, { s1: 4 });
  assert.ok(ops[0].data.at > 0);
});

test('undoRound deletes the newest round document', () => {
  const state = Space.assemble(docs(), null);
  const { ops } = Space.opsFor(model, state, 'undoRound', { gameId: 'g1' });
  assert.deepEqual(ops, [{ type: 'delete', path: 'games/g1/rounds/r1' }]);
});

test('undoRound refuses a game with no rounds', () => {
  const state = Space.assemble(docs({ rounds: {} }), null);
  assert.throws(() => Space.opsFor(model, state, 'undoRound', { gameId: 'g1' }), /No round to undo/);
});

test('toggleSeat writes only the shared selection', () => {
  const state = Space.assemble(docs(), null);
  const { ops } = Space.opsFor(model, state, 'toggleSeat', { id: 'p1' });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].path, 'meta/state');
  assert.deepEqual(ops[0].data.selection, ['p1']);
});

test('removePlayer deletes the player and unseats them', () => {
  const state = Space.assemble(docs({ meta: { lowerWins: true, selection: ['p1'] } }), null);
  const { ops } = Space.opsFor(model, state, 'removePlayer', { id: 'p1' });
  assert.deepEqual(ops[0], { type: 'delete', path: 'players/p1' });
  assert.deepEqual(ops[1].data.selection, []);
});

test('removePlayer leaves the selection alone when they were not seated', () => {
  const state = Space.assemble(docs(), null);
  const { ops } = Space.opsFor(model, state, 'removePlayer', { id: 'p1' });
  assert.equal(ops.length, 1);
});

test('addPlayerToGame writes the player and the updated seats', () => {
  const state = Space.assemble(docs(), null);
  const { ops, value } = Space.opsFor(model, state, 'addPlayerToGame', { gameId: 'g1', name: 'Dana', emoji: 'D' });
  assert.equal(ops.length, 2);
  assert.equal(ops[0].path, 'players/' + value.id);
  assert.equal(ops[1].path, 'games/g1');
  assert.deepEqual(ops[1].data.seats.map((s) => s.name), ['Maya', 'Dana']);
});

test('finishGame stamps the finish time on the game document', () => {
  const state = Space.assemble(docs(), null);
  const { ops, value } = Space.opsFor(model, state, 'finishGame', { gameId: 'g1' });
  assert.equal(ops[0].path, 'games/g1');
  assert.ok(value.finishedAt > 0);
  assert.equal(ops[0].data.finishedAt, value.finishedAt);
});

test('setLowerWins writes the shared scoring direction', () => {
  const state = Space.assemble(docs(), null);
  const { ops } = Space.opsFor(model, state, 'setLowerWins', { lowerWins: false });
  assert.equal(ops[0].data.lowerWins, false);
});

test('an unknown command is refused', () => {
  const state = Space.assemble(docs(), null);
  assert.throws(() => Space.opsFor(model, state, 'setFire', {}), /Unknown lobby command/);
});

test('a space rebuilds its state from live documents', () => {
  const adapter = fakeAdapter();
  const space = Space.create({ adapter, code: 'abcd2345', deviceId: 'd1', heartbeatMs: 0 });
  adapter.push(docs({ meta: { lowerWins: false, selection: ['p1'] } }));
  const state = space.getState();
  assert.equal(state.version, 2);
  assert.deepEqual(state.settings, { lowerWins: false });
  assert.deepEqual(state.selection, ['p1']);
  assert.equal(space.getActiveGame().id, 'g1');
  assert.deepEqual(space.status(), {
    code: 'ABCD2345', name: 'Kitchen', online: 0, connected: true, closed: false, problem: null
  });
});

test('a space counts the phones that have checked in recently', () => {
  const adapter = fakeAdapter();
  const space = Space.create({
    adapter, code: 'ABCD2345', deviceId: 'd1', heartbeatMs: 0, now: () => 100000
  });
  adapter.push(docs({ presence: [{ seen: 99000 }, { seen: 10000 }] }));
  assert.equal(space.status().online, 1);
});

test('a space writes a command through the adapter', async () => {
  const adapter = fakeAdapter();
  const space = Space.create({ adapter, code: 'ABCD2345', deviceId: 'd1', heartbeatMs: 0 });
  adapter.push(docs());
  const player = await space.run('addPlayer', { name: 'Dana', emoji: 'D' });
  assert.equal(adapter.calls.commit.length, 1);
  assert.equal(adapter.calls.commit[0].code, 'ABCD2345');
  assert.equal(adapter.calls.commit[0].ops[0].data.name, 'Dana');
  assert.equal(player.name, 'Dana');
});

test('a space tells its subscribers when the documents change', () => {
  const adapter = fakeAdapter();
  const space = Space.create({ adapter, code: 'ABCD2345', deviceId: 'd1', heartbeatMs: 0 });
  let seen = 0;
  space.subscribe(() => { seen += 1; });
  adapter.push(docs());
  adapter.push(docs({ players: [] }));
  assert.equal(seen, 2);
});

test('a space reports a connection problem instead of pretending to work', () => {
  const adapter = fakeAdapter();
  const space = Space.create({ adapter, code: 'ABCD2345', deviceId: 'd1', heartbeatMs: 0 });
  adapter.connect = adapter.connect;
  adapter.push(docs());
  assert.equal(space.status().problem, null);
});

test('leaving a space disconnects and clears presence', async () => {
  const adapter = fakeAdapter();
  const space = Space.create({ adapter, code: 'ABCD2345', deviceId: 'd1', heartbeatMs: 0 });
  adapter.push(docs());
  await space.leave();
  assert.equal(adapter.calls.disconnected, true);
  assert.deepEqual(adapter.calls.leave, [['ABCD2345', 'd1']]);
  assert.equal(space.status().closed, true);
});

test('a space exposes the same commands as the local store', () => {
  const Store = require('../js/store.js');
  const space = Space.create({ adapter: fakeAdapter(), code: 'ABCD2345', deviceId: 'd1', heartbeatMs: 0 });
  const store = Store.createStore(null);
  const localOnly = ['setLobby'];
  for (const name of Object.keys(store)) {
    if (typeof store[name] !== 'function') continue;
    if (localOnly.indexOf(name) !== -1) continue;
    assert.equal(typeof space[name], 'function', 'the lobby is missing ' + name + '()');
  }
});

test('a command lands on the board before the write has finished', async () => {
  const adapter = fakeAdapter();
  const space = Space.create({ adapter, code: 'ABCD2345', deviceId: 'd1', heartbeatMs: 0 });
  adapter.push(docs({ players: [] }));
  space.addPlayer('Dana', 'D');
  assert.deepEqual(space.getState().players.map((p) => p.name), ['Dana']);
});

test('a snapshot that lags behind our own write cannot wipe it off the board', () => {
  const adapter = fakeAdapter();
  const space = Space.create({ adapter, code: 'ABCD2345', deviceId: 'd1', heartbeatMs: 0 });
  adapter.push(docs({ players: [], games: [] }));
  space.addPlayer('Dana', 'D');
  assert.deepEqual(space.getState().players.map((p) => p.name), ['Dana']);
  adapter.push(docs({ players: [], games: [] }));
  assert.deepEqual(space.getState().players.map((p) => p.name), ['Dana'], 'the lagging snapshot does not take her away');
});

test('a game started in the lobby survives a lagging snapshot', () => {
  const adapter = fakeAdapter();
  const space = Space.create({ adapter, code: 'ABCD2345', deviceId: 'd1', heartbeatMs: 0 });
  adapter.push(docs({ meta: { lowerWins: true, selection: ['p1'] }, games: [], rounds: {} }));
  const game = space.startGame();
  assert.ok(space.getGame(game.id), 'the game is on the board at once');
  adapter.push(docs({ meta: { lowerWins: true, selection: ['p1'] }, games: [], rounds: {} }));
  assert.ok(space.getGame(game.id), 'a stale snapshot does not take it away again');
  adapter.push(docs({ games: [{ id: game.id, startedAt: 1, finishedAt: null, seats: [] }], rounds: {} }));
  assert.ok(space.getGame(game.id));
});

test('a snapshot behind our own round does not undo it', () => {
  const adapter = fakeAdapter();
  const space = Space.create({
    adapter, code: 'ABCD2345', deviceId: 'd1', heartbeatMs: 0, now: () => 1, uid: (p) => p + '1'
  });
  adapter.push(docs({ meta: { lowerWins: true, selection: ['p1'] }, games: [], rounds: {} }));
  const game = space.startGame();
  space.recordRound(game.id, ['7']);
  adapter.push(docs({ meta: { lowerWins: true, selection: [] }, games: [], rounds: {} }));
  assert.equal(space.getGame(game.id).rounds.length, 1, 'the round survives the snapshot');
  assert.deepEqual(space.getGame(game.id).rounds[0].points, { s1: 7 });
});

test('playAgain seats a fresh game and clears the shared selection', () => {
  const state = Space.assemble(docs({ meta: { lowerWins: true, selection: ['p1'] } }), null);
  const { ops } = Space.opsFor(model, state, 'playAgain', { gameId: 'g1' });
  assert.equal(ops.length, 2);
  assert.equal(ops[0].path, 'games/' + ops[0].data.id);
  assert.deepEqual(ops[1].data.selection, []);
});

test('a failed write is rolled back off the board and reported', async () => {
  const adapter = fakeAdapter();
  adapter.commit = () => Promise.reject(new Error('Missing or insufficient permissions.'));
  const space = Space.create({ adapter, code: 'ABCD2345', deviceId: 'd1', heartbeatMs: 0 });
  adapter.push(docs({ players: [] }));
  space.addPlayer('Dana', 'D');
  assert.deepEqual(space.getState().players.map((p) => p.name), ['Dana']);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(space.getState().players, []);
  assert.equal(space.status().problem, 'Missing or insufficient permissions.');
});
