(function (global) {
  'use strict';

  function totalsFor(game) {
    const seats = (game && game.seats) || [];
    const rounds = (game && game.rounds) || [];
    const totals = seats.map(function () { return 0; });
    rounds.forEach(function (round) {
      const points = round.points || {};
      seats.forEach(function (seat, i) {
        const value = points[seat.id];
        if (Number.isFinite(value)) totals[i] += value;
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

  // A finished game remembers the roster player behind each seat by id, so a
  // rename does not lose the games already played. Older games have no player id
  // on their seats, and fall back to the name-and-emoji pair that identifies a
  // player everywhere else in the app.
  function seatForPlayer(game, player) {
    if (!player) return null;
    const seats = (game && game.seats) || [];
    const byId = seats.filter(function (seat) { return seat.playerId && seat.playerId === player.id; })[0];
    if (byId) return byId;
    return seats.filter(function (seat) {
      return seat.name === player.name && seat.emoji === player.emoji;
    })[0] || null;
  }

  // A finished game carries the direction it was played in; anything older (or
  // still in progress) follows whatever the app is set to now.
  function directionFor(game, lowerWins) {
    if (game && typeof game.lowerWins === 'boolean') return game.lowerWins;
    return lowerWins === undefined ? true : !!lowerWins;
  }

  // The running win/loss record for one player: the best total in a finished
  // game is a win and everyone it beat takes a loss, so a tie for best is a win
  // for each of them and a loss for nobody.
  function record(games, player, lowerWins) {
    let wins = 0;
    let losses = 0;
    (games || []).forEach(function (game) {
      if (!game || game.finishedAt === null || game.finishedAt === undefined) return;
      if (!((game.rounds || []).length)) return;
      const seat = seatForPlayer(game, player);
      if (!seat) return;
      const entry = rank(game, directionFor(game, lowerWins)).filter(function (one) {
        return one.seat.id === seat.id;
      })[0];
      if (!entry) return;
      if (entry.isWinner) wins += 1;
      else losses += 1;
    });
    return { wins: wins, losses: losses };
  }

  const Ranking = {
    totalsFor: totalsFor,
    rank: rank,
    record: record,
    directionFor: directionFor,
    seatForPlayer: seatForPlayer
  };
  global.Ranking = Ranking;
  if (typeof module !== 'undefined' && module.exports) module.exports = Ranking;
})(typeof window !== 'undefined' ? window : globalThis);
