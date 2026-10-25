const test = require('node:test');
const assert = require('node:assert/strict');
const Sync = require('../js/sync.js');

function fakeStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); }
  };
}

function opError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function fakeAdapter() {
  const calls = [];
  const state = { online: true, pool: [], results: [] };
  return {
    calls,
    state,
    configured() { return true; },
    online() { return state.online; },
    putPoolPlayer(key, profile) {
      calls.push(['pool', key, profile]);
      if (!state.online) return Promise.reject(opError('unavailable', 'Offline'));
      return Promise.resolve({ ref: 'pool/' + key });
    },
    putResult(id, result) {
      calls.push(['result', id, result]);
      if (!state.online) return Promise.reject(opError('unavailable', 'Offline'));
      return Promise.resolve({ ref: 'results/' + id });
    },
    listPool() {
      calls.push(['listPool']);
      if (!state.online) return Promise.reject(opError('unavailable', 'Offline'));
      return Promise.resolve(state.pool);
    },
    listResults() {
      calls.push(['listResults']);
      if (!state.online) return Promise.reject(opError('unavailable', 'Offline'));
      return Promise.resolve(state.results);
    },
    deletePoolPlayer(key) {
      calls.push(['delete', key]);
      if (!state.online) return Promise.reject(opError('unavailable', 'Offline'));
      return Promise.resolve();
    }
  };
}

function result(id) {
  return {
    id: id,
    at: 1,
    mode: 'solo',
    lowerWins: true,
    players: [{ key: 'p_maya', name: 'Maya', emoji: 'cat', total: 0, win: true }]
  };
}

function count(calls, name) {
  return calls.filter((call) => call[0] === name).length;
}

test('register writes a new profile once and remembers the key', async () => {
  const adapter = fakeAdapter();
  const sync = Sync.create({ adapter: adapter, storage: fakeStorage() });
  await sync.register('Maya', 'cat');
  await sync.register('maya', 'fox');
  assert.equal(count(adapter.calls, 'pool'), 1);
  assert.deepEqual(adapter.calls[0][2], { name: 'Maya', emoji: 'cat' });
  assert.deepEqual(await sync.register('Maya', 'cat'), { key: 'p_maya', created: false });
});

test('register adopts a name that already exists in the pool', async () => {
  const adapter = fakeAdapter();
  adapter.putPoolPlayer = function (key) {
    adapter.calls.push(['pool', key]);
    return Promise.reject(opError('already-exists', 'That name is already registered.'));
  };
  const sync = Sync.create({ adapter: adapter, storage: fakeStorage() });
  assert.deepEqual(await sync.register('Maya', 'cat'), { key: 'p_maya', created: false });
  await sync.register('Maya', 'cat');
  assert.equal(count(adapter.calls, 'pool'), 1);
});

test('register queues while offline and flush sends it when the connection returns', async () => {
  const adapter = fakeAdapter();
  const sync = Sync.create({ adapter: adapter, storage: fakeStorage() });
  adapter.state.online = false;
  await sync.register('Maya', 'cat');
  assert.equal(count(adapter.calls, 'pool'), 0);
  assert.equal(sync.pending(), 1);
  adapter.state.online = true;
  await sync.flush();
  assert.equal(sync.pending(), 0);
  assert.equal(count(adapter.calls, 'pool'), 1);
  assert.deepEqual(adapter.calls[0][2], { name: 'Maya', emoji: 'cat' });
});

test('register with queue false refuses while offline', async () => {
  const adapter = fakeAdapter();
  adapter.state.online = false;
  const sync = Sync.create({ adapter: adapter, storage: fakeStorage() });
  await assert.rejects(
    () => sync.register('Maya', 'cat', { queue: false }),
    (error) => error.code === 'offline'
  );
  assert.equal(count(adapter.calls, 'pool'), 0);
});

test('register with queue false reports a name that already exists', async () => {
  const adapter = fakeAdapter();
  adapter.putPoolPlayer = function (key) {
    adapter.calls.push(['pool', key]);
    return Promise.reject(opError('already-exists', 'That name is already registered.'));
  };
  const sync = Sync.create({ adapter: adapter, storage: fakeStorage() });
  await assert.rejects(
    () => sync.register('Maya', 'cat', { queue: false }),
    (error) => error.code === 'already-exists'
  );
});

test('publish sends each result once, even across calls', async () => {
  const adapter = fakeAdapter();
  const sync = Sync.create({ adapter: adapter, storage: fakeStorage() });
  await sync.publish(result('r1'));
  await sync.publish(result('r1'));
  await sync.publish(result('r2'));
  assert.deepEqual(
    adapter.calls.filter((call) => call[0] === 'result').map((call) => call[1]),
    ['r1', 'r2']
  );
});

test('flush drops an invalid result and continues', async () => {
  const adapter = fakeAdapter();
  adapter.putResult = function (id, data) {
    adapter.calls.push(['result', id, data]);
    if (id === 'bad') return Promise.reject(opError('invalid-argument', 'Bad result'));
    return Promise.resolve();
  };
  const sync = Sync.create({ adapter: adapter, storage: fakeStorage() });
  adapter.state.online = false;
  await sync.publish(result('bad'));
  await sync.publish(result('good'));
  adapter.state.online = true;
  await sync.flush();
  assert.equal(sync.pending(), 0);
  assert.equal(count(adapter.calls, 'result'), 2);
  await sync.publish(result('bad'));
  assert.equal(count(adapter.calls, 'result'), 2);
});

test('flush keeps the queue and stops when the network is unavailable', async () => {
  const adapter = fakeAdapter();
  const sync = Sync.create({ adapter: adapter, storage: fakeStorage() });
  adapter.state.online = false;
  await sync.publish(result('r1'));
  await sync.publish(result('r2'));
  await sync.flush();
  assert.equal(sync.pending(), 2);
  assert.equal(count(adapter.calls, 'result'), 0);
});

test('the outbox survives a reload', async () => {
  const storage = fakeStorage();
  const adapter = fakeAdapter();
  adapter.state.online = false;
  const first = Sync.create({ adapter: adapter, storage: storage });
  await first.publish(result('r1'));
  const second = Sync.create({ adapter: adapter, storage: storage });
  assert.equal(second.pending(), 1);
  adapter.state.online = true;
  await second.flush();
  assert.equal(second.pending(), 0);
});

test('pending counts queued profiles and results', async () => {
  const adapter = fakeAdapter();
  const sync = Sync.create({ adapter: adapter, storage: fakeStorage() });
  adapter.state.online = false;
  await sync.register('Maya', 'cat');
  await sync.publish(result('r1'));
  assert.equal(sync.pending(), 2);
});

test('fetchBoard returns both collections and caches them', async () => {
  const adapter = fakeAdapter();
  adapter.state.pool = [{ id: 'p_maya', name: 'Maya' }];
  adapter.state.results = [result('r1')];
  const storage = fakeStorage();
  const sync = Sync.create({ adapter: adapter, storage: storage });
  const board = await sync.fetchBoard();
  assert.deepEqual(board.pool, adapter.state.pool);
  assert.deepEqual(board.results, adapter.state.results);
  assert.equal(board.stale, false);
  assert.equal(typeof board.fetchedAt, 'number');
  assert.deepEqual(sync.cachedBoard().pool, adapter.state.pool);
  assert.deepEqual(JSON.parse(storage.getItem('noting-more.board.v1')).results, adapter.state.results);
});

test('fetchBoard falls back to the last saved board when the network fails', async () => {
  const adapter = fakeAdapter();
  adapter.state.pool = [{ id: 'p_maya', name: 'Maya' }];
  const sync = Sync.create({ adapter: adapter, storage: fakeStorage() });
  await sync.fetchBoard();
  adapter.state.online = false;
  const board = await sync.fetchBoard();
  assert.equal(board.stale, true);
  assert.deepEqual(board.pool, [{ id: 'p_maya', name: 'Maya' }]);
});

test('fetchBoard reports an empty board when offline with no cache', async () => {
  const adapter = fakeAdapter();
  adapter.state.online = false;
  const sync = Sync.create({ adapter: adapter, storage: fakeStorage() });
  const board = await sync.fetchBoard();
  assert.deepEqual(board.pool, []);
  assert.deepEqual(board.results, []);
  assert.equal(board.stale, false);
  assert.equal(board.fetchedAt, null);
});

test('remove deletes a profile and clears it from the cache', async () => {
  const adapter = fakeAdapter();
  adapter.state.pool = [{ id: 'p_maya', name: 'Maya' }, { id: 'p_sam', name: 'Sam' }];
  const sync = Sync.create({ adapter: adapter, storage: fakeStorage() });
  await sync.fetchBoard();
  await sync.remove('p_maya');
  assert.deepEqual(
    adapter.calls.filter((call) => call[0] === 'delete'),
    [['delete', 'p_maya']]
  );
  assert.deepEqual(sync.cachedBoard().pool, [{ id: 'p_sam', name: 'Sam' }]);
});

test('remove refuses while offline', async () => {
  const adapter = fakeAdapter();
  adapter.state.online = false;
  const sync = Sync.create({ adapter: adapter, storage: fakeStorage() });
  await assert.rejects(() => sync.remove('p_maya'), (error) => error.code === 'offline');
});
