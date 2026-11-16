const test = require('node:test');
const assert = require('node:assert/strict');
const PoolEdit = require('../js/pool-edit.js');

function harness(options) {
  const opts = options || {};
  const calls = [];
  const adapter = {
    putPoolPlayer(key, profile) {
      calls.push(['put', key, profile]);
      if (opts.putFails) return Promise.reject(new Error('write failed'));
      return Promise.resolve();
    }
  };
  const sync = {
    remove(key) {
      calls.push(['remove', key]);
      return Promise.resolve();
    },
    register(name, emoji, registerOptions) {
      calls.push(['register', name, emoji, registerOptions]);
      if (opts.registerFails) {
        const error = new Error('taken');
        error.code = 'already-exists';
        return Promise.reject(error);
      }
      return Promise.resolve({ key: 'p_' + name, created: true });
    }
  };
  const players = opts.players || [];
  const local = {
    getState() { return { players: players }; },
    updatePlayer(id, name, emoji) {
      calls.push(['update', id, name, emoji]);
      return { id: id, name: name, emoji: emoji };
    }
  };
  const edit = PoolEdit.create({
    sync: sync,
    adapter: adapter,
    local: local,
    activeGameId: function () { return 'solo'; }
  });
  return { edit: edit, calls: calls };
}

function row(options) {
  return Object.assign({
    key: 'p_maya', name: 'Maya', emoji: '🐱', games: 0, fromPool: true
  }, options || {});
}

test('emoji edit on a pool row with games keeps the key and stats', async () => {
  const h = harness();
  const out = await h.edit.editPlayer(row({ games: 8 }), 'Maya', '🦊');
  assert.equal(out.changed.length, 1);
  assert.equal(out.changed[0], 'emoji');
  assert.equal(out.key, 'p_maya');
  assert.deepEqual(h.calls, [
    ['remove', 'p_maya'],
    ['put', 'p_maya', { name: 'Maya', emoji: '🦊', game: 'solo' }]
  ]);
});

test('emoji edit on a result-only row creates a pool doc without deleting', async () => {
  const h = harness();
  await h.edit.editPlayer(row({ fromPool: false, games: 2 }), 'Maya', '🦊');
  assert.deepEqual(h.calls, [
    ['put', 'p_maya', { name: 'Maya', emoji: '🦊', game: 'solo' }]
  ]);
});

test('create failure after delete restores the old profile before rejecting', async () => {
  const h = harness({ putFails: true });
  await assert.rejects(h.edit.editPlayer(row({ games: 4 }), 'Maya', '🦊'), /write failed/);
  assert.deepEqual(h.calls, [
    ['remove', 'p_maya'],
    ['put', 'p_maya', { name: 'Maya', emoji: '🦊', game: 'solo' }],
    ['put', 'p_maya', { name: 'Maya', emoji: '🐱', game: 'solo' }]
  ]);
});

test('rename with games is refused before any write', async () => {
  const h = harness();
  await assert.rejects(h.edit.editPlayer(row({ games: 3 }), 'Maya B', '🦊'), /keep their name/i);
  assert.deepEqual(h.calls, []);
});

test('rename with no games claims the new name and mirrors the local roster', async () => {
  const h = harness({ players: [{ id: 'm1', name: 'Maya', emoji: '🐱' }] });
  const out = await h.edit.editPlayer(row(), 'Maya B', '🦊');
  assert.deepEqual(out.changed, ['name']);
  assert.deepEqual(h.calls, [
    ['remove', 'p_maya'],
    ['register', 'Maya B', '🦊', { queue: false, game: 'solo' }],
    ['update', 'm1', 'Maya B', '🦊']
  ]);
});

test('rename to a taken name restores the old profile and leaves the local roster alone', async () => {
  const h = harness({ registerFails: true, players: [{ id: 'm1', name: 'Maya', emoji: '🐱' }] });
  await assert.rejects(
    h.edit.editPlayer(row(), 'Maya B', '🦊'),
    /That name is already registered\./
  );
  assert.deepEqual(h.calls, [
    ['remove', 'p_maya'],
    ['register', 'Maya B', '🦊', { queue: false, game: 'solo' }],
    ['put', 'p_maya', { name: 'Maya', emoji: '🐱', game: 'solo' }]
  ]);
});

test('rename to a name already on the local roster is refused before pool writes', async () => {
  const h = harness({ players: [{ id: 'm1', name: 'Maya', emoji: '🐱' }, { id: 'm2', name: 'Maya B', emoji: '🐻' }] });
  await assert.rejects(h.edit.editPlayer(row(), 'Maya B', '🦊'), /already on your roster/);
  assert.deepEqual(h.calls, []);
});

test('no-op edit changes nothing and writes nothing', async () => {
  const h = harness();
  const out = await h.edit.editPlayer(row(), '  maya  ', '🐱');
  assert.deepEqual(out.changed, []);
  assert.deepEqual(h.calls, []);
});
