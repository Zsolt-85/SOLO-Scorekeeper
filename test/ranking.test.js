const test = require('node:test');
const assert = require('node:assert/strict');
const Ranking = require('../js/ranking.js');

function game(roundPoints) {
  const seats = roundPoints[0].map((_, i) => ({
    id: 's' + i, name: 'Player ' + i, emoji: '🙂', color: '#f0b429'
  }));
  return { seats, rounds: roundPoints.map((points, r) => ({ id: 'r' + r, points })) };
}

function seatedGame(totals) {
  const seats = totals.map((_, i) => ({
    id: 's' + i, name: 'Player ' + i, emoji: '🙂', color: '#f0b429'
  }));
  return { seats, rounds: [{ id: 'r0', points: totals.slice() }] };
}

test('totalsFor sums every round per seat', () => {
  assert.deepEqual(Ranking.totalsFor(game([[1, 2], [3, 4], [5, 6]])), [9, 12]);
});

test('totalsFor returns zero for a game with no rounds', () => {
  assert.deepEqual(Ranking.totalsFor({ seats: [{ id: 'a' }, { id: 'b' }], rounds: [] }), [0, 0]);
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
