const test = require('node:test');
const assert = require('node:assert/strict');
const Leaderboard = require('../js/leaderboard.js');

test('normalise trims, collapses spacing and ignores case', () => {
  assert.equal(Leaderboard.normalise('  Maya   B  '), 'maya b');
  assert.equal(Leaderboard.normalise(null), '');
  assert.equal(Leaderboard.normalise(undefined), '');
});

test('keyFor is the pool document id and is stable across spacing and case', () => {
  assert.equal(Leaderboard.keyFor('Maya'), Leaderboard.keyFor('  maya '));
  assert.equal(Leaderboard.keyFor('Maya B'), Leaderboard.keyFor('maya   b'));
  assert.match(Leaderboard.keyFor('Maya'), /^p_[a-z0-9%._-]+$/);
  assert.equal(Leaderboard.keyFor('   '), null);
});

test('colourFor always returns a palette colour and is stable', () => {
  assert.match(Leaderboard.colourFor('p_maya'), /^#[0-9a-f]{6}$/i);
  assert.equal(Leaderboard.colourFor('p_maya'), Leaderboard.colourFor('p_maya'));
});

test('resultId is readable, stable and unique per mode and lobby', () => {
  assert.equal(Leaderboard.resultId('solo', '', 'g1'), 'solo_g1');
  assert.equal(Leaderboard.resultId('lobby', 'ABCD1234', 'g1'), 'lobby_ABCD1234_g1');
  assert.equal(Leaderboard.resultId('lobby', 'ABCD 1234', 'g 1'), 'lobby_ABCD1234_g1');
  assert.equal(Leaderboard.resultId('solo', '', ''), null);
});

test('winPercent rounds to a whole number and is null with no games', () => {
  assert.equal(Leaderboard.winPercent({ games: 10, wins: 6 }), 60);
  assert.equal(Leaderboard.winPercent({ games: 3, wins: 2 }), 67);
  assert.equal(Leaderboard.winPercent({ games: 0, wins: 0 }), null);
});

function game(options) {
  return Object.assign({
    id: 'g1',
    startedAt: 10,
    finishedAt: 20,
    seats: [
      { id: 's1', name: 'Maya', emoji: 'cat' },
      { id: 's2', name: 'Sam', emoji: 'fox' }
    ],
    rounds: [{ id: 'r1', at: 15, points: { s1: 5, s2: 9 } }]
  }, options || {});
}

test('resultFor freezes the players and the winner of a lower-wins game', () => {
  const result = Leaderboard.resultFor(game(), { mode: 'lobby', origin: 'ABCD1234' });
  assert.equal(result.id, 'lobby_ABCD1234_g1');
  assert.equal(result.at, 20);
  assert.equal(result.mode, 'lobby');
  assert.equal(result.lowerWins, true);
  assert.deepEqual(result.players, [
    { key: 'p_maya', name: 'Maya', emoji: 'cat', total: 5, win: true },
    { key: 'p_sam', name: 'Sam', emoji: 'fox', total: 9, win: false }
  ]);
});

test('resultFor honours most-points-wins', () => {
  const result = Leaderboard.resultFor(game({ lowerWins: false }), { mode: 'solo' });
  assert.equal(result.id, 'solo_g1');
  assert.equal(result.lowerWins, false);
  assert.deepEqual(result.players.map((one) => one.win), [false, true]);
});

test('resultFor marks every best total a win in a tie', () => {
  const result = Leaderboard.resultFor(game({
    rounds: [{ id: 'r1', at: 15, points: { s1: 7, s2: 7 } }]
  }), { mode: 'solo' });
  assert.deepEqual(result.players.map((one) => one.win), [true, true]);
  assert.deepEqual(result.players.map((one) => one.total), [7, 7]);
});

test('resultFor refuses unfinished games, empty games and missing input', () => {
  assert.equal(Leaderboard.resultFor(game({ finishedAt: null }), { mode: 'solo' }), null);
  assert.equal(Leaderboard.resultFor(game({ rounds: [] }), { mode: 'solo' }), null);
  assert.equal(Leaderboard.resultFor(null, { mode: 'solo' }), null);
});

function result(id, at, players) {
  return { id: id, at: at, mode: 'lobby', lowerWins: true, players: players };
}

function p(key, name, win) {
  return { key: 'p_' + key, name: name, emoji: '?', total: 0, win: !!win };
}

test('aggregate starts from every pool profile, even with no games', () => {
  const rows = Leaderboard.aggregate(
    [
      { id: 'p_maya', name: 'Maya', emoji: 'cat', color: '#111111' },
      { id: 'p_dana', name: 'Dana', emoji: 'bear' }
    ],
    []
  );
  assert.equal(rows.length, 2);
  const maya = rows.find((row) => row.key === 'p_maya');
  const dana = rows.find((row) => row.key === 'p_dana');
  assert.equal(maya.games, 0);
  assert.equal(maya.color, '#111111');
  assert.equal(maya.fromPool, true);
  assert.equal(dana.games, 0);
  assert.match(dana.color, /^#[0-9a-f]{6}$/i);
  assert.equal(maya.ranked, false);
  assert.equal(maya.place, null);
});

test('aggregate merges profiles and results into games, wins and losses', () => {
  const pool = [
    { id: 'p_maya', name: 'Maya', emoji: 'cat', color: '#111111' },
    { id: 'p_dana', name: 'Dana', emoji: 'bear' }
  ];
  const results = [
    result('r1', 10, [p('maya', 'Maya', true), p('sam', 'Sam', false)]),
    result('r2', 20, [p('maya', 'Maya', true), p('sam', 'Sam', true)]),
    result('r3', 30, [p('maya', 'MAYA', false), p('ana', 'Ana', true)])
  ];
  const rows = Leaderboard.aggregate(pool, results);
  const maya = rows.find((row) => row.key === 'p_maya');
  assert.equal(maya.name, 'Maya');
  assert.equal(maya.games, 3);
  assert.equal(maya.wins, 2);
  assert.equal(maya.losses, 1);
  assert.equal(maya.ranked, true);
  assert.equal(maya.place, 1);
  const sam = rows.find((row) => row.key === 'p_sam');
  assert.equal(sam.games, 2);
  assert.equal(sam.wins, 1);
  assert.equal(sam.losses, 1);
  assert.equal(sam.ranked, false);
  assert.equal(sam.place, null);
  const ana = rows.find((row) => row.key === 'p_ana');
  assert.equal(ana.games, 1);
  assert.equal(ana.wins, 1);
  assert.equal(ana.color.length, 7);
  const dana = rows.find((row) => row.key === 'p_dana');
  assert.equal(dana.games, 0);
  assert.deepEqual(rows.map((row) => row.key), ['p_maya', 'p_sam', 'p_ana', 'p_dana']);
});

test('aggregate counts a repeated key inside one result once', () => {
  const rows = Leaderboard.aggregate([], [
    result('r1', 10, [p('maya', 'Maya', true), p('maya', 'MAYA', false)])
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].games, 1);
  assert.equal(rows[0].wins, 1);
  assert.equal(rows[0].losses, 0);
});

test('aggregate ignores duplicate result ids and malformed entries', () => {
  const duplicate = Leaderboard.aggregate([], [
    result('r1', 10, [p('maya', 'Maya', true)]),
    result('r1', 10, [p('maya', 'Maya', true)])
  ]);
  assert.equal(duplicate[0].games, 1);
  const malformed = Leaderboard.aggregate([], [
    { id: 'r1', at: 1, players: [{ name: 'No key' }, null, { key: 'p_x', name: '' }] }
  ]);
  assert.deepEqual(malformed, []);
});

test('aggregate uses the newest result for a name with no pool profile', () => {
  const rows = Leaderboard.aggregate([], [
    result('r1', 10, [p('sam', 'Sam', false)]),
    result('r2', 20, [p('sam', 'Samantha', true)])
  ]);
  assert.equal(rows[0].name, 'Samantha');
  assert.equal(rows[0].emoji, '?');
});

test('rankRows puts ranked rows first and shares a place only on equal games and rate', () => {
  const rows = Leaderboard.rankRows([
    { key: 'p_a', name: 'A', games: 10, wins: 6 },
    { key: 'p_b', name: 'B', games: 10, wins: 6 },
    { key: 'p_c', name: 'C', games: 5, wins: 3 },
    { key: 'p_d', name: 'D', games: 3, wins: 0 },
    { key: 'p_e', name: 'E', games: 2, wins: 2 },
    { key: 'p_f', name: 'F', games: 0, wins: 0 }
  ]);
  assert.deepEqual(rows.map((row) => row.key), ['p_a', 'p_b', 'p_c', 'p_d', 'p_e', 'p_f']);
  assert.deepEqual(rows.map((row) => row.place), [1, 1, 3, 4, null, null]);
  assert.deepEqual(rows.map((row) => row.ranked), [true, true, true, true, false, false]);
});
