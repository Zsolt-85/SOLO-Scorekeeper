const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../js/model.js');
const Library = require('../js/library.js');

function fresh() {
  let n = 0;
  return create({
    now: () => 1000,
    uid: (prefix) => prefix + (++n)
  });
}

function seated(model, state) {
  const maya = model.addPlayer(state, 'Maya', 'ðŸ±');
  const dana = model.addPlayer(state, 'Dana', 'ðŸ¦Š');
  [maya, dana].forEach((p) => model.toggleSeat(state, p.id));
  return [maya, dana];
}

test('a v3 empty state has the built-in library and SOLO active', () => {
  const state = fresh().empty();
  assert.equal(state.version, 3);
  assert.equal(state.activeType, 'solo');
  assert.deepEqual(state.library.map((g) => g.id), ['solo', 'uno']);
  assert.deepEqual(state.library[0].rules, { winner: 'lowest', end: { type: 'manual' } });
  assert.deepEqual(state.library[1].rules, { winner: 'highest', end: { type: 'limit', limit: 500 } });
  assert.deepEqual(state.selection, []);
  assert.deepEqual(state.players, []);
  assert.deepEqual(state.games, []);
  assert.equal(state.lobby, null);
  assert.equal(Object.prototype.hasOwnProperty.call(state, 'settings'), false);
});

test('a v2 document migrates to v3 with per-direction game types', () => {
  const model = fresh();
  const state = model.fromDocument({
    version: 2,
    settings: { lowerWins: false },
    selection: ['p1'],
    players: [{ id: 'p1', name: 'Maya', emoji: 'ðŸ±', color: '#f0b429', createdAt: 1 }],
    games: [
      {
        id: 'finished-low', startedAt: 1, finishedAt: 2, lowerWins: true,
        seats: [{ id: 's1', playerId: 'p1', name: 'Maya', emoji: 'ðŸ±', color: '#f0b429' }],
        rounds: []
      },
      {
        id: 'active-high', startedAt: 3, finishedAt: null,
        seats: [{ id: 's1', playerId: 'p1', name: 'Maya', emoji: 'ðŸ±', color: '#f0b429' }],
        rounds: []
      }
    ],
    lobby: { code: 'ABCD2345', name: 'Kitchen', joinedAt: 1 }
  });
  assert.equal(state.version, 3);
  assert.equal(state.activeType, 'uno');
  assert.equal(state.library.length, 2);
  const finished = state.games[0];
  assert.equal(finished.typeId, 'solo');
  assert.equal(finished.typeName, 'SOLO');
  assert.deepEqual(finished.rules, { winner: 'lowest', end: { type: 'manual' } });
  assert.equal(finished.lowerWins, true);
  const active = state.games[1];
  assert.equal(active.typeId, 'uno');
  assert.equal(active.typeName, 'UNO');
  assert.deepEqual(active.rules, { winner: 'highest', end: { type: 'manual' } });
  assert.equal(active.lowerWins, false);
  assert.equal(state.lobby.typeId, null);
  assert.equal(Object.prototype.hasOwnProperty.call(state, 'settings'), false);
});

test('a v2 document without settings migrates as lowest-wins', () => {
  const state = fresh().fromDocument({
    version: 2,
    players: [],
    games: [],
    selection: []
  });
  assert.equal(state.activeType, 'solo');
  assert.equal(state.library[1].rules.end.limit, 500);
});

test('a v1 document still migrates through the v2 path', () => {
  const state = fresh().fromDocument({
    version: 1,
    players: [{ id: 'p1', name: 'Maya', emoji: 'ðŸ±', color: '#f0b429', createdAt: 1 }],
    games: [],
    currentGame: {
      id: 'g1', startedAt: 5,
      seats: [{ id: 's1', playerId: 'p1', name: 'Maya', emoji: 'ðŸ±', color: '#f0b429' }],
      rounds: []
    },
    settings: { lowerWins: false }
  });
  assert.equal(state.version, 3);
  assert.equal(state.activeType, 'uno');
  assert.equal(state.games[0].typeId, 'uno');
  assert.deepEqual(state.games[0].rules, { winner: 'highest', end: { type: 'manual' } });
});

test('starting a match snapshots the active type name and rules', () => {
  const model = fresh();
  const state = model.empty();
  seated(model, state);
  const type = model.updateType(state, 'uno', {
    name: 'UNO Night', rules: { winner: 'highest', end: { type: 'limit', limit: 300 } }
  });
  model.setActiveType(state, 'uno');
  const game = model.startGame(state);
  assert.equal(type.name, 'UNO Night');
  assert.equal(game.typeId, 'uno');
  assert.equal(game.typeName, 'UNO Night');
  assert.deepEqual(game.rules, { winner: 'highest', end: { type: 'limit', limit: 300 } });
  assert.equal(game.lowerWins, false);
});

test('editing a type afterwards does not rewrite a started match', () => {
  const model = fresh();
  const state = model.empty();
  seated(model, state);
  const game = model.startGame(state);
  model.updateType(state, 'solo', {
    name: 'Rummy', rules: { winner: 'highest', end: { type: 'limit', limit: 100 } }
  });
  assert.equal(game.typeName, 'SOLO');
  assert.deepEqual(game.rules, { winner: 'lowest', end: { type: 'manual' } });
});

test('playAgain uses the game type current rules, not the old snapshot', () => {
  const model = fresh();
  const state = model.empty();
  seated(model, state);
  const old = model.startGame(state);
  model.updateType(state, 'solo', {
    rules: { winner: 'highest', end: { type: 'limit', limit: 200 } }
  });
  const again = model.playAgain(state, old.id);
  assert.deepEqual(again.rules, { winner: 'highest', end: { type: 'limit', limit: 200 } });
  assert.equal(again.typeId, 'solo');
  assert.equal(again.lowerWins, false);
});

test('addType creates a custom game and makes it active', () => {
  const model = fresh();
  const state = model.empty();
  const type = model.addType(state, {
    name: 'Rummy', emoji: 'ðŸƒ', colour: '#5bc8af', pattern: 'stripes',
    rules: { winner: 'lowest', end: { type: 'limit', limit: 100 } }
  });
  assert.equal(type.id, 't1');
  assert.equal(type.builtin, false);
  assert.equal(state.activeType, 't1');
  assert.equal(state.library.length, 3);
});

test('addType refuses a duplicate name including an archived game', () => {
  const model = fresh();
  const state = model.empty();
  const custom = model.addType(state, {
    name: 'Rummy', emoji: 'ðŸƒ', rules: { winner: 'lowest', end: { type: 'manual' } }
  });
  model.archiveType(state, custom.id);
  assert.throws(() => model.addType(state, {
    name: ' rummy ', emoji: 'ðŸƒ', rules: { winner: 'lowest', end: { type: 'manual' } }
  }), /already in the library/);
});

test('updateType edits cover and rules without changing the id', () => {
  const model = fresh();
  const state = model.empty();
  const type = model.updateType(state, 'solo', {
    name: 'Solo Night', emoji: 'ðŸƒ', colour: '#5bc8af', pattern: 'grid',
    rules: { winner: 'highest', end: { type: 'limit', limit: 50 } }
  });
  assert.equal(type.id, 'solo');
  assert.equal(type.builtin, true);
  assert.equal(type.name, 'Solo Night');
  assert.equal(type.pattern, 'grid');
  assert.deepEqual(type.rules, { winner: 'highest', end: { type: 'limit', limit: 50 } });
});

test('archiving the active game falls back to SOLO', () => {
  const model = fresh();
  const state = model.empty();
  const custom = model.addType(state, {
    name: 'Rummy', emoji: 'ðŸƒ', rules: { winner: 'lowest', end: { type: 'manual' } }
  });
  model.archiveType(state, custom.id);
  assert.equal(state.activeType, 'solo');
  assert.equal(model.findType(state, custom.id).archived, true);
});

test('built-ins cannot be archived and an active game cannot be archived', () => {
  const model = fresh();
  const state = model.empty();
  assert.throws(() => model.archiveType(state, 'solo'), /built-in/);
  const custom = model.addType(state, {
    name: 'Rummy', emoji: 'ðŸƒ', rules: { winner: 'lowest', end: { type: 'manual' } }
  });
  seated(model, state);
  model.startGame(state);
  assert.throws(() => model.archiveType(state, custom.id), /game in progress/);
});

test('a custom game can be restored and made active again', () => {
  const model = fresh();
  const state = model.empty();
  const custom = model.addType(state, {
    name: 'Rummy', emoji: 'ðŸƒ', rules: { winner: 'lowest', end: { type: 'manual' } }
  });
  model.archiveType(state, custom.id);
  model.restoreType(state, custom.id);
  model.setActiveType(state, custom.id);
  assert.equal(model.findType(state, custom.id).archived, false);
  assert.equal(state.activeType, custom.id);
});

test('setActiveType refuses unknown and archived games', () => {
  const model = fresh();
  const state = model.empty();
  assert.throws(() => model.setActiveType(state, 'nope'), /not available/);
  const custom = model.addType(state, {
    name: 'Rummy', emoji: 'ðŸƒ', rules: { winner: 'lowest', end: { type: 'manual' } }
  });
  model.archiveType(state, custom.id);
  assert.throws(() => model.setActiveType(state, custom.id), /archived/);
});

test('resetType restores a built-in and keeps its id', () => {
  const model = fresh();
  const state = model.empty();
  model.updateType(state, 'uno', {
    name: 'Cards', rules: { winner: 'lowest', end: { type: 'manual' } }
  });
  const type = model.resetType(state, 'uno');
  assert.equal(type.id, 'uno');
  assert.equal(type.name, 'UNO');
  assert.equal(type.emoji, '🎴');
  assert.deepEqual(type.rules, { winner: 'highest', end: { type: 'limit', limit: 500 } });
  assert.throws(() => model.resetType(state, 'nope'), /not available/);
});

test('finishGame stamps the finish and keeps the frozen direction', () => {
  const model = fresh();
  const state = model.empty();
  seated(model, state);
  const game = model.startGame(state);
  model.recordRound(state, game.id, [5, 9]);
  model.finishGame(state, game.id);
  assert.equal(game.finishedAt, 1000);
  assert.equal(game.lowerWins, true);
  assert.deepEqual(game.rules, { winner: 'lowest', end: { type: 'manual' } });
});

test('normalizeLobby keeps an optional typeId', () => {
  const model = fresh();
  const state = model.setLobby(model.empty(), {
    code: ' abcd2345 ', name: ' Kitchen ', joinedAt: 4, typeId: 'uno'
  });
  assert.deepEqual(state.lobby, {
    code: 'ABCD2345', name: 'Kitchen', joinedAt: 4, typeId: 'uno'
  });
  assert.equal(model.setLobby(state, { code: 'ABCD2345' }).lobby.typeId, null);
});

test('an invalid v3 activeType falls back to SOLO', () => {
  const model = fresh();
  const state = model.fromDocument({
    version: 3,
    library: Library.seed(),
    activeType: 'missing',
    selection: [], players: [], games: [], lobby: null
  });
  assert.equal(state.activeType, 'solo');
});

test('a corrupt v3 library returns null so storage can fall back', () => {
  const model = fresh();
  assert.equal(model.fromDocument({
    version: 3,
    library: 'nope',
    activeType: 'solo', selection: [], players: [], games: [], lobby: null
  }), null);
});
