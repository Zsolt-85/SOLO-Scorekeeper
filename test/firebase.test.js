const test = require('node:test');
const assert = require('node:assert/strict');
const Firebase = require('../js/firebase.js');

function fakeSdk(options) {
  const opts = options || {};
  const writes = [];
  const deletes = [];
  const storeApi = {
    doc(db, path) { return { path: path }; },
    collection(db, path) { return { path: path }; },
    runTransaction(db, update) {
      const transaction = {
        get() {
          return Promise.resolve({ exists() { return opts.exists === true; } });
        },
        set(ref, data) { writes.push([ref.path, data]); }
      };
      return Promise.resolve().then(function () { return update(transaction); });
    },
    getDocs() {
      return Promise.resolve({
        docs: (opts.docs || []).map(function (doc) {
          return { id: doc.id, data() { return doc.data; } };
        })
      });
    },
    deleteDoc(ref) {
      deletes.push(ref.path);
      return Promise.resolve();
    }
  };
  return { sdk: { storeApi: storeApi, db: {} }, writes: writes, deletes: deletes };
}

function configured() {
  return { apiKey: 'key', projectId: 'project', appId: 'app' };
}

test('a missing config refuses the new pool operations', async () => {
  const fake = fakeSdk();
  const adapter = Firebase.create({ config: {}, sdk: fake.sdk });
  assert.equal(adapter.configured(), false);
  await assert.rejects(
    () => adapter.putPoolPlayer('p_maya', { name: 'Maya', emoji: 'cat' }),
    (error) => error.code === 'failed-precondition'
  );
});

test('putPoolPlayer creates a missing profile', async () => {
  const fake = fakeSdk({ exists: false });
  const adapter = Firebase.create({ config: configured(), sdk: fake.sdk });
  await adapter.putPoolPlayer('p_maya', { name: 'Maya', emoji: 'cat' });
  assert.equal(fake.writes.length, 1);
  assert.equal(fake.writes[0][0], 'pool/p_maya');
  assert.equal(fake.writes[0][1].name, 'Maya');
  assert.equal(fake.writes[0][1].emoji, 'cat');
  assert.equal(typeof fake.writes[0][1].createdAt, 'number');
});

test('putPoolPlayer rejects an existing profile without writing', async () => {
  const fake = fakeSdk({ exists: true });
  const adapter = Firebase.create({ config: configured(), sdk: fake.sdk });
  await assert.rejects(
    () => adapter.putPoolPlayer('p_maya', { name: 'Maya', emoji: 'cat' }),
    (error) => error.code === 'already-exists'
  );
  assert.deepEqual(fake.writes, []);
});

test('putResult writes the frozen result to its derived id', async () => {
  const fake = fakeSdk({ exists: false });
  const adapter = Firebase.create({ config: configured(), sdk: fake.sdk });
  const result = {
    id: 'solo_g1', at: 20, mode: 'solo', lowerWins: true,
    players: [{ key: 'p_maya', name: 'Maya', emoji: 'cat', total: 5, win: true }]
  };
  await adapter.putResult(result.id, result);
  assert.deepEqual(fake.writes, [['results/solo_g1', result]]);
});

test('listPool and listResults map document ids to objects', async () => {
  const fake = fakeSdk({
    docs: [
      { id: 'p_maya', data: { name: 'Maya', emoji: 'cat' } },
      { id: 'p_sam', data: { name: 'Sam', emoji: 'fox' } }
    ]
  });
  const adapter = Firebase.create({ config: configured(), sdk: fake.sdk });
  assert.deepEqual(await adapter.listPool(), [
    { id: 'p_maya', name: 'Maya', emoji: 'cat' },
    { id: 'p_sam', name: 'Sam', emoji: 'fox' }
  ]);
  assert.deepEqual(await adapter.listResults(), [
    { id: 'p_maya', name: 'Maya', emoji: 'cat' },
    { id: 'p_sam', name: 'Sam', emoji: 'fox' }
  ]);
});

test('deletePoolPlayer deletes one document', async () => {
  const fake = fakeSdk();
  const adapter = Firebase.create({ config: configured(), sdk: fake.sdk });
  await adapter.deletePoolPlayer('p_maya');
  assert.deepEqual(fake.deletes, ['pool/p_maya']);
});
