const test = require('node:test');
const assert = require('node:assert/strict');
const Library = require('../js/library.js');

test('the two built-ins have stable ids, covers and rules', () => {
  const games = Library.defaults();
  assert.deepEqual(games.map((g) => g.id), ['solo', 'uno']);
  assert.deepEqual(games.map((g) => g.name), ['SOLO', 'UNO']);
  assert.equal(games[0].emoji, '🃏');
  assert.equal(games[0].colour, '#f0b429');
  assert.equal(games[0].pattern, 'pips');
  assert.deepEqual(games[0].rules, { winner: 'lowest', end: { type: 'manual' } });
  assert.equal(games[1].emoji, '🎴');
  assert.equal(games[1].colour, '#ef7f6b');
  assert.equal(games[1].pattern, 'arcs');
  assert.deepEqual(games[1].rules, { winner: 'highest', end: { type: 'limit', limit: 500 } });
  assert.equal(games[0].builtin, true);
  assert.equal(games[0].archived, false);
});

test('seed returns fresh built-ins, not the same objects twice', () => {
  const first = Library.seed();
  first[0].name = 'Changed';
  assert.equal(Library.seed()[0].name, 'SOLO');
  assert.notEqual(Library.seed()[0], Library.seed()[0]);
});

test('find returns a library entry by id or null', () => {
  const library = Library.seed();
  assert.equal(Library.find(library, 'uno').name, 'UNO');
  assert.equal(Library.find(library, 'nope'), null);
  assert.equal(Library.find(null, 'solo'), null);
});

test('validateName trims and collapses spacing', () => {
  assert.equal(Library.validateName('  Maya   Night  ', []), 'Maya Night');
});

test('validateName refuses blank and names over 24 characters', () => {
  assert.throws(() => Library.validateName('   ', []), /1-24 characters/);
  assert.throws(() => Library.validateName('x'.repeat(25), []), /1-24 characters/);
});

test('validateName refuses duplicates ignoring case and spacing, including archived games', () => {
  const library = Library.seed();
  library.push({ id: 't1', name: 'Maya Night', archived: true });
  assert.throws(() => Library.validateName('maya night', library), /already in the library/);
  assert.throws(() => Library.validateName(' MAYA   NIGHT ', library), /already in the library/);
});

test('validateName allows the same game when its own id is ignored', () => {
  const library = Library.seed();
  assert.equal(Library.validateName('solo', library, 'solo'), 'solo');
});

test('validateRules accepts lowest/manual and highest/limit', () => {
  assert.deepEqual(Library.validateRules({ winner: 'lowest', end: { type: 'manual' } }),
    { winner: 'lowest', end: { type: 'manual' } });
  assert.deepEqual(Library.validateRules({ winner: 'highest', end: { type: 'limit', limit: '500' } }),
    { winner: 'highest', end: { type: 'limit', limit: 500 } });
});

test('validateRules refuses an unknown winner or end type', () => {
  assert.throws(() => Library.validateRules({ winner: 'middle', end: { type: 'manual' } }), /lowest or highest/);
  assert.throws(() => Library.validateRules({ winner: 'lowest', end: { type: 'rounds' } }), /manual or a score limit/);
});

test('validateRules keeps the limit between 1 and 1,000,000 and whole', () => {
  assert.throws(() => Library.validateRules({ winner: 'lowest', end: { type: 'limit', limit: 0 } }), /1 to 1,000,000/);
  assert.throws(() => Library.validateRules({ winner: 'lowest', end: { type: 'limit', limit: 1000001 } }), /1 to 1,000,000/);
  assert.throws(() => Library.validateRules({ winner: 'lowest', end: { type: 'limit', limit: 1.5 } }), /1 to 1,000,000/);
});

test('presets are the two manual directions only', () => {
  assert.deepEqual(Library.PRESETS.map((p) => p.id), ['lowest', 'highest']);
  assert.deepEqual(Library.PRESETS[0].rules, { winner: 'lowest', end: { type: 'manual' } });
  assert.deepEqual(Library.PRESETS[1].rules, { winner: 'highest', end: { type: 'manual' } });
});

test('normalizeType fills safe cover fallbacks and keeps built-ins unarchived', () => {
  const type = Library.normalizeType({
    id: 'uno', name: 'UNO', builtin: true, archived: true,
    colour: '#bad', pattern: 'nope', rules: { winner: 'highest', end: { type: 'limit', limit: 500 } }
  });
  assert.equal(type.archived, false);
  assert.equal(type.colour, Library.PALETTE[0]);
  assert.equal(type.pattern, 'pips');
  assert.deepEqual(type.rules, { winner: 'highest', end: { type: 'limit', limit: 500 } });
});

test('normalizeType returns null for a missing id or name', () => {
  assert.equal(Library.normalizeType(null), null);
  assert.equal(Library.normalizeType({ name: 'No id' }), null);
  assert.equal(Library.normalizeType({ id: 't1', name: '   ' }), null);
});

test('makeType creates a custom game with an id, timestamps and defaults', () => {
  const type = Library.makeType({
    name: '  Rummy  ', emoji: '🃏', colour: '#5bc8af', pattern: 'stripes',
    rules: { winner: 'lowest', end: { type: 'limit', limit: 100 } }
  }, { now: () => 123, uid: (prefix) => prefix + '9', library: [] });
  assert.equal(type.id, 't9');
  assert.equal(type.name, 'Rummy');
  assert.equal(type.builtin, false);
  assert.equal(type.archived, false);
  assert.equal(type.createdAt, 123);
  assert.equal(type.updatedAt, 123);
});

test('makeType validates its name and rules', () => {
  assert.throws(() => Library.makeType({ name: 'SOLO', emoji: '🃏', rules: { winner: 'lowest', end: { type: 'manual' } } },
    { library: Library.seed(), uid: () => 't1' }), /already in the library/);
  assert.throws(() => Library.makeType({ name: 'New', emoji: '🃏', rules: { winner: 'nope', end: { type: 'manual' } } },
    { uid: () => 't1' }), /lowest or highest/);
});
