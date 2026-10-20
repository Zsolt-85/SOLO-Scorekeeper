const test = require('node:test');
const assert = require('node:assert/strict');
const Ranking = require('../js/ranking.js');

function keyed(seats, values) {
  const points = {};
  seats.forEach((seat, i) => { points[seat.id] = values[i]; });
  return points;
}

function game(roundPoints) {
  const seats = roundPoints[0].map((_, i) => ({
    id: 's' + i, name: 'Player ' + i, emoji: '🙂', color: '#f0b429'
  }));
  return {
    seats,
    rounds: roundPoints.map((points, r) => ({ id: 'r' + r, points: keyed(seats, points) }))
  };
}

function seatedGame(totals) {
  const seats = totals.map((_, i) => ({
    id: 's' + i, name: 'Player ' + i, emoji: '🙂', color: '#f0b429'
  }));
  return { seats, rounds: [{ id: 'r0', points: keyed(seats, totals) }] };
}

test('totalsFor sums every round per seat', () => {
  assert.deepEqual(Ranking.totalsFor(game([[1, 2], [3, 4], [5, 6]])), [9, 12]);
});

test('totalsFor returns zero for a game with no rounds', () => {
  assert.deepEqual(Ranking.totalsFor({ seats: [{ id: 'a' }, { id: 'b' }], rounds: [] }), [0, 0]);
});

test('totalsFor counts a seat that has no entry in an older round as zero', () => {
  const game = {
    seats: [{ id: 'a' }, { id: 'b' }],
    rounds: [{ id: 'r0', points: { a: 5 } }]
  };
  assert.deepEqual(Ranking.totalsFor(game), [5, 0]);
});

test('totalsFor adds negative points', () => {
  assert.deepEqual(Ranking.totalsFor(game([[5, -2], [1, 0]])), [6, -2]);
});

test('rank orders ascending so the lowest total comes first', () => {
  const ranked = Ranking.rank(seatedGame([3, 1, 2]));
  assert.deepEqual(ranked.map((r) => r.total), [1, 2, 3]);
});

test('rank flags the lowest total as winner and the highest as loser', () => {
  const ranked = Ranking.rank(seatedGame([3, 1, 2]));
  assert.deepEqual(ranked.map((r) => r.isWinner), [true, false, false]);
  assert.deepEqual(ranked.map((r) => r.isLoser), [false, false, true]);
});

test('rank keeps each entry tied with its own seat and seat index', () => {
  const ranked = Ranking.rank(seatedGame([3, 1, 2]));
  assert.deepEqual(ranked.map((r) => r.index), [1, 2, 0]);
  assert.equal(ranked[0].seat.id, 's1');
});

test('rank shares the winner between tied lowest totals', () => {
  const ranked = Ranking.rank(seatedGame([4, 2, 2]));
  assert.deepEqual(ranked.map((r) => r.isWinner), [true, true, false]);
});

test('rank shares the loser between tied highest totals', () => {
  const ranked = Ranking.rank(seatedGame([4, 2, 4]));
  assert.deepEqual(ranked.map((r) => r.isLoser), [false, true, true]);
});

test('rank marks a single player as both winner and loser', () => {
  const ranked = Ranking.rank(game([[7]]));
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].isWinner, true);
  assert.equal(ranked[0].isLoser, true);
});

test('rank returns an empty list when there are no seats', () => {
  assert.deepEqual(Ranking.rank({ seats: [], rounds: [] }), []);
});

test('rank defaults to lowest-wins when no direction is given', () => {
  const ranked = Ranking.rank(seatedGame([3, 1, 2]));
  assert.deepEqual(ranked.map((r) => r.isWinner), [true, false, false]);
});

test('directionFor prefers the direction frozen on the game', () => {
  assert.equal(Ranking.directionFor({ lowerWins: false }, true), false);
  assert.equal(Ranking.directionFor({ lowerWins: true }, false), true);
});

test('directionFor falls back to the current direction for an unfrozen game', () => {
  assert.equal(Ranking.directionFor({ finishedAt: 5 }, false), false);
  assert.equal(Ranking.directionFor(null, true), true);
});

test('rank crowns the highest total when lowerWins is false', () => {
  const ranked = Ranking.rank(seatedGame([3, 1, 2]), false);
  assert.deepEqual(ranked.map((r) => r.isWinner), [false, false, true]);
  assert.deepEqual(ranked.map((r) => r.isLoser), [true, false, false]);
});

test('rank still orders ascending when lowerWins is false', () => {
  const ranked = Ranking.rank(seatedGame([3, 1, 2]), false);
  assert.deepEqual(ranked.map((r) => r.total), [1, 2, 3]);
});

test('rank shares the winner between tied highest totals when lowerWins is false', () => {
  const ranked = Ranking.rank(seatedGame([4, 2, 4]), false);
  assert.deepEqual(ranked.map((r) => r.total), [2, 4, 4]);
  assert.deepEqual(ranked.map((r) => r.isWinner), [false, true, true]);
});

function seat(id, name, emoji, playerId) {
  return { id: id, playerId: playerId, name: name, emoji: emoji, color: '#f0b429' };
}

function finished(seats, totals, extra) {
  const rounds = totals ? [{ id: 'r0', points: keyed(seats, totals) }] : [];
  return Object.assign({
    id: 'g1', startedAt: 1, finishedAt: 2, seats: seats, rounds: rounds
  }, extra || {});
}

const MAYA = { id: 'p1', name: 'Maya', emoji: '🐱' };
const SAM = { id: 'p2', name: 'Sam', emoji: '🦊' };

function pair(extra) {
  return finished([seat('s1', 'Maya', '🐱', 'p1'), seat('s2', 'Sam', '🦊', 'p2')], [3, 9], extra);
}

test('record counts a win for the best total', () => {
  assert.deepEqual(Ranking.record([pair()], MAYA), { wins: 1, losses: 0 });
});

test('record counts a loss for everyone the winner beat', () => {
  assert.deepEqual(Ranking.record([pair()], SAM), { wins: 0, losses: 1 });
});

test('record ignores a game that is still in progress', () => {
  const game = pair({ finishedAt: null });
  assert.deepEqual(Ranking.record([game], MAYA), { wins: 0, losses: 0 });
});

test('record ignores a game the player was not seated in', () => {
  const dana = { id: 'p3', name: 'Dana', emoji: '🐻' };
  assert.deepEqual(Ranking.record([pair()], dana), { wins: 0, losses: 0 });
});

test('record gives every player in a three-player game a win or a loss', () => {
  const seats = [seat('s1', 'Maya', '🐱', 'p1'), seat('s2', 'Sam', '🦊', 'p2'), seat('s3', 'Dana', '🐻', 'p3')];
  const game = finished(seats, [4, 9, 12]);
  assert.deepEqual(Ranking.record([game], MAYA), { wins: 1, losses: 0 });
  assert.deepEqual(Ranking.record([game], SAM), { wins: 0, losses: 1 });
  assert.deepEqual(Ranking.record([game], { id: 'p3', name: 'Dana', emoji: '🐻' }), { wins: 0, losses: 1 });
});

test('record counts a tie for best as a win for both and a loss for nobody', () => {
  const seats = [seat('s1', 'Maya', '🐱', 'p1'), seat('s2', 'Sam', '🦊', 'p2'), seat('s3', 'Dana', '🐻', 'p3')];
  const game = finished(seats, [2, 2, 7]);
  assert.deepEqual(Ranking.record([game], MAYA), { wins: 1, losses: 0 });
  assert.deepEqual(Ranking.record([game], SAM), { wins: 1, losses: 0 });
});

test('record adds up across several finished games', () => {
  const first = pair();
  const second = finished(pair().seats, [8, 1], { id: 'g2' });
  assert.deepEqual(Ranking.record([first, second], MAYA), { wins: 1, losses: 1 });
});

test('record follows the direction frozen on each finished game', () => {
  const game = pair({ lowerWins: false });
  assert.deepEqual(Ranking.record([game], SAM, true), { wins: 1, losses: 0 });
});

test('record falls back to the current direction for a game that never stored one', () => {
  assert.deepEqual(Ranking.record([pair()], SAM, false), { wins: 1, losses: 0 });
});

test('record matches a seat by name and emoji when it carries no player id', () => {
  const game = finished([seat('s1', 'Maya', '🐱'), seat('s2', 'Sam', '🦊')], [3, 9]);
  assert.deepEqual(Ranking.record([game], MAYA), { wins: 1, losses: 0 });
});

test('record does not match a seat on the name alone', () => {
  const game = finished([seat('s1', 'Maya', '🦄'), seat('s2', 'Sam', '🦊')], [3, 9]);
  assert.deepEqual(Ranking.record([game], MAYA), { wins: 0, losses: 0 });
});

test('record keeps the games played before a rename', () => {
  const renamed = { id: 'p1', name: 'Maya K.', emoji: '🐱' };
  assert.deepEqual(Ranking.record([pair()], renamed), { wins: 1, losses: 0 });
});

test('record counts a game with no rounds as nothing', () => {
  const game = finished(pair().seats, null);
  assert.deepEqual(Ranking.record([game], MAYA), { wins: 0, losses: 0 });
});
