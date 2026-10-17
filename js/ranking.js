(function (global) {
  'use strict';

  function totalsFor(game) {
    const seats = (game && game.seats) || [];
    const rounds = (game && game.rounds) || [];
    const totals = seats.map(function () { return 0; });
    rounds.forEach(function (round) {
      (round.points || []).forEach(function (points, i) {
        if (i < totals.length && Number.isFinite(points)) totals[i] += points;
      });
    });
    return totals;
  }

  function rank(game, lowerWins) {
    const fewestWins = lowerWins === undefined ? true : !!lowerWins;
    const totals = totalsFor(game);
    const seats = (game && game.seats) || [];
    const ranked = seats
      .map(function (seat, index) {
        return { seat: seat, index: index, total: totals[index] };
      })
      .sort(function (a, b) { return a.total - b.total; });
    if (ranked.length === 0) return [];
    const lowest = ranked[0].total;
    const highest = ranked[ranked.length - 1].total;
    const best = fewestWins ? lowest : highest;
    const worst = fewestWins ? highest : lowest;
    return ranked.map(function (entry) {
      return {
        seat: entry.seat,
        index: entry.index,
        total: entry.total,
        isWinner: entry.total === best,
        isLoser: entry.total === worst
      };
    });
  }

  const Ranking = { totalsFor: totalsFor, rank: rank };
  global.Ranking = Ranking;
  if (typeof module !== 'undefined' && module.exports) module.exports = Ranking;
})(typeof window !== 'undefined' ? window : globalThis);
