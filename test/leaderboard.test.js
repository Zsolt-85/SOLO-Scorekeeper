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


test('resultFor freezes the match game id and name', () => {
  const game = {
    id: 'g1', finishedAt: 10,
    typeId: 'uno', typeName: 'UNO Night',
    rules: { winner: 'highest', end: { type: 'limit', limit: 500 } },
    seats: [{ id: 's1', name: 'Maya', emoji: 'M' }],
    rounds: [{ id: 'r0', points: { s1: 5 } }]
  };
  const result = Leaderboard.resultFor(game, { mode: 'solo' });
  assert.equal(result.game, 'uno');
  assert.equal(result.gameName, 'UNO Night');
  assert.equal(result.lowerWins, false);
});

test('resultFor derives a game for an old match', () => {
  const game = {
    id: 'g1', finishedAt: 10, lowerWins: false,
    seats: [{ id: 's1', name: 'Maya', emoji: 'M' }],
    rounds: [{ id: 'r0', points: { s1: 5 } }]
  };
  const result = Leaderboard.resultFor(game, { mode: 'solo' });
  assert.equal(result.game, 'uno');
  assert.equal(result.gameName, 'UNO');
});

test('legacy results map by lowerWins', () => {
  assert.equal(Leaderboard.gameOf({ lowerWins: false }), 'uno');
  assert.equal(Leaderboard.gameOf({ lowerWins: true }), 'solo');
  assert.equal(Leaderboard.gameOf({}), 'solo');
  assert.equal(Leaderboard.gameNameOf({ lowerWins: false }), 'UNO');
  assert.equal(Leaderboard.gameNameOf({}), 'SOLO');
});

test('aggregate counts only the requested game', () => {
  const pool = [
    { id: 'p_maya', name: 'Maya', game: 'solo' },
    { id: 'p_dana', name: 'Dana', game: 'uno' }
  ];
  const results = [
    { id: 's1', at: 1, game: 'solo', lowerWins: true, players: [p('maya', 'Maya', true)] },
    { id: 'u1', at: 2, game: 'uno', lowerWins: false, players: [p('dana', 'Dana', true)] },
    { id: 'u2', at: 3, lowerWins: false, players: [p('maya', 'Maya', true)] }
  ];
  const solo = Leaderboard.aggregate(pool, results, 'solo');
  assert.deepEqual(solo.map((row) => row.key), ['p_maya']);
  assert.equal(solo[0].games, 1);
  const uno = Leaderboard.aggregate(pool, results, 'uno');
  assert.deepEqual(uno.map((row) => row.key).sort(), ['p_dana', 'p_maya']);
  assert.equal(uno.find((row) => row.key === 'p_maya').games, 1);
});

test('a profile registered for one game does not add a zero row to another', () => {
  const pool = [
    { id: 'p_maya', name: 'Maya', game: 'solo' },
    { id: 'p_dana', name: 'Dana', game: 'uno' }
  ];
  const uno = Leaderboard.aggregate(pool, [], 'uno');
  assert.deepEqual(uno.map((row) => row.key), ['p_dana']);
});

test('a profile from another game still labels its result row', () => {
  const pool = [{ id: 'p_maya', name: 'Maya', emoji: 'cat', color: '#111111', game: 'solo' }];
  const results = [
    { id: 'u1', at: 2, game: 'uno', lowerWins: false, players: [p('maya', 'Maya', true)] }
  ];
  const uno = Leaderboard.aggregate(pool, results, 'uno');
  assert.equal(uno[0].name, 'Maya');
  assert.equal(uno[0].emoji, 'cat');
  assert.equal(uno[0].color, '#111111');
});

test('allPlayers merges pool profiles and result participants, deduped by key', () => {
  const pool = [{ id: 'p_maya', name: 'Maya Prime', emoji: 'cat', color: '#f0b429', game: 'uno' },
    { id: 'p_idle', name: 'Idle', emoji: '', game: 'solo' }];
  const results = [
    { id: 's1', at: 10, game: 'solo', gameName: 'SOLO', lowerWins: true,
      players: [p('maya', 'Maya', true), p('otto', 'Otto', false)] },
    { id: 's2', at: 20, game: 'solo', gameName: 'SOLO', lowerWins: true,
      players: [p('maya', 'Maya', false), p('otto', 'Otto', true)] },
    { id: 'u1', at: 30, game: 'uno', gameName: 'MATCHUP', lowerWins: true,
      players: [p('maya', 'Maya', true), p('sam', 'Sam', false)] }
  ];
  const rows = Leaderboard.allPlayers(pool, results);
  assert.deepEqual(rows.map((row) => row.key), ['p_maya', 'p_otto', 'p_sam', 'p_idle']);
  const maya = rows[0];
  assert.equal(maya.name, 'Maya Prime'); // pool profile wins name/emoji/colour
  assert.equal(maya.emoji, 'cat');
  assert.equal(maya.color, '#f0b429');
  assert.equal(maya.games, 3);
  assert.equal(maya.wins, 2);
  assert.equal(maya.losses, 1);
  assert.deepEqual(maya.favourite, { game: 'solo', name: 'SOLO', played: 2 });
  const otto = rows[1];
  assert.equal(otto.games, 2);
  assert.equal(otto.wins, 1);
  assert.equal(otto.color, Leaderboard.colourFor('p_otto'));
  assert.deepEqual(otto.favourite, { game: 'solo', name: 'SOLO', played: 2 });
  const idle = rows[3];
  assert.equal(idle.name, 'Idle');
  assert.equal(idle.games, 0);
  assert.equal(idle.favourite, null);
});

test('allPlayers keeps a player counted once per result even if listed twice', () => {
  const results = [
    { id: 'd1', at: 5, game: 'solo', gameName: 'SOLO', lowerWins: true,
      players: [p('kip', 'Kip', true), p('kip', 'Kip', false)] }
  ];
  const rows = Leaderboard.allPlayers([], results);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].games, 1);
});

test('allPlayers keeps the newest name and emoji for a result-only player', () => {
  const results = [
    { id: 'a', at: 10, game: 'solo', lowerWins: true,
      players: [{ key: 'p_renamed', name: 'Old Name', emoji: 'cat', total: 1, win: true }] },
    { id: 'b', at: 20, game: 'solo', lowerWins: true,
      players: [{ key: 'p_renamed', name: 'New Name', emoji: 'fox', total: 2, win: false }] }
  ];
  const rows = Leaderboard.allPlayers([], results);
  assert.equal(rows[0].name, 'New Name');
  assert.equal(rows[0].emoji, 'fox');
});

test('allPlayers merges a duplicated key in one result like aggregate does', () => {
  const results = [
    { id: 'd1', at: 5, game: 'solo', lowerWins: true,
      players: [
        { key: 'p_kip', name: 'Kip', emoji: '', total: 3, win: false },
        { key: 'p_kip', name: 'Kip', emoji: '', total: 9, win: true }
      ] }
  ];
  const rows = Leaderboard.allPlayers([], results);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].games, 1);
  assert.equal(rows[0].wins, 1);
  assert.equal(rows[0].losses, 0);
});

test('allPlayers sorts empty input into empty output', () => {
  assert.deepEqual(Leaderboard.allPlayers(null, null), []);
});

// The selectable universe for one table: locals first, then everyone the
// Players page already knows, name-matched, minus tombstoned names.
test('mergePlayers returns local entries first, unpadded', () => {
  const out = Leaderboard.mergePlayers(
    [{ id: 'a1', name: 'Maya', emoji: '🐱', color: '#f0b429' }], [], [], []);
  assert.deepEqual(out, [
    { id: 'a1', name: 'Maya', emoji: '🐱', color: '#f0b429', pooled: false }
  ]);
});

test('mergePlayers appends pool-only profiles', () => {
  const pool = [{ id: Leaderboard.keyFor('Obi'), name: 'Obi', emoji: '🦊', color: '#5bc8af', game: 'solo' }];
  const out = Leaderboard.mergePlayers([], pool, [], []);
  assert.deepEqual(out, [
    { id: pool[0].id, name: 'Obi', emoji: '🦊', color: '#5bc8af', pooled: true }
  ]);
});

test('mergePlayers appends names known only from results', () => {
  const results = [{ id: 'r1', at: 5, game: 'solo', gameName: 'SOLO',
    players: [{ key: Leaderboard.keyFor('Kim'), name: 'Kim', emoji: '🐼', total: 3, win: true }] }];
  const out = Leaderboard.mergePlayers([], [], results, []);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'Kim');
  assert.equal(out[0].pooled, true);
});

test('mergePlayers dedupes by normalised name, local wins', () => {
  const pool = [{ id: Leaderboard.keyFor('MAYA'), name: 'MAYA', emoji: '🦊', color: '#5bc8af', game: 'solo' }];
  const out = Leaderboard.mergePlayers(
    [{ id: 'a1', name: 'Maya', emoji: '🐱', color: '#f0b429' }], pool, [], []);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { id: 'a1', name: 'Maya', emoji: '🐱', color: '#f0b429', pooled: false });
});

test('mergePlayers skips removed names from any source', () => {
  const key = Leaderboard.keyFor('Zed');
  const results = [{ id: 'r1', at: 5, game: 'solo', players:
    [{ key: key, name: 'Zed', emoji: '🦖', total: 1, win: false }] }];
  const pool = [{ id: key, name: 'Zed', emoji: '🦖', color: '#5bc8af', game: 'solo' }];
  const out = Leaderboard.mergePlayers([], pool, results, ['ZED ']);
  assert.deepEqual(out, []);
});

test('mergePlayers sorts pooled entries and handles empties', () => {
  const pool = [{ id: 'p_b', name: 'Bo', game: 'solo' }, { id: 'p_a', name: 'Al', game: 'solo' }];
  const out = Leaderboard.mergePlayers([], pool, [], []);
  assert.deepEqual(out.map(function (r) { return r.name; }), ['Al', 'Bo']);
  assert.deepEqual(Leaderboard.mergePlayers(null, null, null, null), []);
});
