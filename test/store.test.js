const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../js/store.js');
const Ranking = require('../js/ranking.js');

function fakeStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); }
  };
}

function seatThree(store) {
  const a = store.addPlayer('Maya', '🐱');
  const b = store.addPlayer('Dana', '🦊');
  const c = store.addPlayer('Tobi', '🐻');
  [a, b, c].forEach((p) => store.toggleSeat(p.id));
  return [a, b, c];
}

function playedGame(store, points) {
  seatThree(store);
  const game = store.startGame();
  store.recordRound(game.id, points || [1, 2, 3]);
  return game;
}

test('a new store is empty and healthy', () => {
  const store = createStore(fakeStorage());
  assert.deepEqual(store.getState(), {
    version: 2,
    selection: [],
    players: [],
    games: [],
    settings: { lowerWins: true },
    lobby: null
  });
  assert.equal(store.isDegraded(), false);
});

test('a new store has no active or finished games', () => {
  const store = createStore(fakeStorage());
  assert.equal(store.getActiveGame(), null);
  assert.deepEqual(store.activeGames(), []);
  assert.deepEqual(store.finishedGames(), []);
});

test('a new store defaults to lowest-wins scoring', () => {
  const store = createStore(fakeStorage());
  assert.deepEqual(store.getSettings(), { lowerWins: true });
});

test('setLowerWins flips the direction and persists it', () => {
  const storage = fakeStorage();
  const store = createStore(storage);
  store.setLowerWins(false);
  assert.deepEqual(store.getSettings(), { lowerWins: false });
  assert.deepEqual(createStore(storage).getSettings(), { lowerWins: false });
});

test('a stored v2 document with no settings loads with the default', () => {
  const storage = fakeStorage();
  storage.setItem('noting-more.v2', JSON.stringify({
    version: 2, selection: [], players: [], games: []
  }));
  const store = createStore(storage);
  assert.deepEqual(store.getSettings(), { lowerWins: true });
  assert.equal(store.isDegraded(), false);
});

test('addPlayer stores name, emoji, colour and createdAt', () => {
  const store = createStore(fakeStorage());
  const player = store.addPlayer('  Maya  ', '🐱');
  assert.equal(player.name, 'Maya');
  assert.equal(player.emoji, '🐱');
  assert.equal(player.color, '#f0b429');
  assert.ok(player.createdAt > 0);
});

test('addPlayer rejects a blank name', () => {
  const store = createStore(fakeStorage());
  assert.throws(() => store.addPlayer('   ', '🐱'), /1-20 characters/);
});

test('addPlayer rejects a name longer than 20 characters', () => {
  const store = createStore(fakeStorage());
  assert.throws(() => store.addPlayer('x'.repeat(21), '🐱'), /1-20 characters/);
});

test('addPlayer rejects the same name with the same emoji twice', () => {
  const store = createStore(fakeStorage());
  store.addPlayer('Maya', '🐱');
  assert.throws(() => store.addPlayer('maya', '🐱'), /already on your roster/);
});

test('addPlayer allows the same name with a different emoji', () => {
  const store = createStore(fakeStorage());
  store.addPlayer('Maya', '🐱');
  store.addPlayer('Maya', '🦊');
  assert.equal(store.getState().players.length, 2);
});

test('addPlayer gives each player a distinct palette colour', () => {
  const store = createStore(fakeStorage());
  const colors = ['🐱', '🦊', '🐻'].map((e) => store.addPlayer('P' + e, e).color);
  assert.deepEqual(colors, ['#f0b429', '#5bc8af', '#ef7f6b']);
});

test('selection survives a reload', () => {
  const storage = fakeStorage();
  const first = createStore(storage);
  const maya = first.addPlayer('Maya', '🐱');
  first.toggleSeat(maya.id);
  const second = createStore(storage);
  assert.deepEqual(second.getState().selection, [maya.id]);
});

test('toggleSeat adds then removes a player', () => {
  const store = createStore(fakeStorage());
  const maya = store.addPlayer('Maya', '🐱');
  assert.deepEqual(store.toggleSeat(maya.id), [maya.id]);
  assert.deepEqual(store.toggleSeat(maya.id), []);
});

test('subscribe is told whenever a command changes state', () => {
  const store = createStore(fakeStorage());
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  store.addPlayer('Maya', '🐱');
  store.setLowerWins(false);
  assert.equal(calls, 2);
});

test('startGame snapshots the seated players and clears the selection', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  const game = store.startGame();
  assert.equal(game.seats.length, 3);
  assert.deepEqual(game.seats.map((s) => s.name), ['Maya', 'Dana', 'Tobi']);
  assert.deepEqual(game.rounds, []);
  assert.equal(game.finishedAt, null);
  assert.deepEqual(store.getState().selection, []);
  assert.equal(store.getActiveGame().id, game.id);
});

test('startGame refuses to start with nobody seated', () => {
  const store = createStore(fakeStorage());
  assert.throws(() => store.startGame(), /at least one player/);
});

test('recordRound keys points by seat and undoRound removes the last round', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  const game = store.startGame();
  store.recordRound(game.id, [1, 2, 3]);
  store.recordRound(game.id, [4, 5, 6]);
  const ids = store.getGame(game.id).seats.map((s) => s.id);
  assert.deepEqual(store.getGame(game.id).rounds.length, 2);
  assert.deepEqual(store.getGame(game.id).rounds[0].points, { [ids[0]]: 1, [ids[1]]: 2, [ids[2]]: 3 });
  store.undoRound(game.id);
  assert.equal(store.getGame(game.id).rounds.length, 1);
  assert.deepEqual(Ranking.totalsFor(store.getGame(game.id)), [1, 2, 3]);
});

test('recordRound stamps the round with a time', () => {
  const store = createStore(fakeStorage());
  const game = playedGame(store);
  assert.ok(store.getGame(game.id).rounds[0].at > 0);
});

test('recordRound treats blanks and garbage as zero', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  const game = store.startGame();
  store.recordRound(game.id, ['', '  ', 'abc']);
  assert.deepEqual(Ranking.totalsFor(store.getGame(game.id)), [0, 0, 0]);
});

test('recordRound truncates a non-integer and keeps negative points', () => {
  const store = createStore(fakeStorage());
  const game = playedGame(store, ['3.7', '-2', '4']);
  assert.deepEqual(Ranking.totalsFor(store.getGame(game.id)), [3, -2, 4]);
});

test('recordRound rejects a point count that does not match the seats', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  const game = store.startGame();
  assert.throws(() => store.recordRound(game.id, [1, 2]), /must match the number of players/);
});

test('recordRound and undoRound refuse when no game is in progress', () => {
  const store = createStore(fakeStorage());
  assert.throws(() => store.recordRound(null, [1]), /No game in progress/);
  assert.throws(() => store.undoRound(null), /No game in progress/);
});

test('undoRound refuses when no round has been played', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  const game = store.startGame();
  assert.throws(() => store.undoRound(game.id), /No round to undo/);
});

test('a player added mid-game joins the roster and counts as zero for old rounds', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  const game = store.startGame();
  store.recordRound(game.id, [1, 2, 3]);
  store.recordRound(game.id, [4, 5, 6]);
  const guest = store.addPlayerToGame(game.id, 'Eli', '🐸');
  const saved = store.getGame(game.id);
  assert.equal(saved.seats.length, 4);
  assert.equal(saved.seats[3].name, 'Eli');
  assert.deepEqual(Ranking.totalsFor(saved), [5, 7, 9, 0]);
  assert.equal(saved.rounds[0].points[saved.seats[3].id], undefined);
  assert.ok(store.getState().players.some((p) => p.id === guest.id));
});

test('addPlayerToGame validates the name', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  const game = store.startGame();
  assert.throws(() => store.addPlayerToGame(game.id, '', '🐸'), /1-20 characters/);
});

test('finishGame stamps a finish time and moves the game out of play', () => {
  const store = createStore(fakeStorage());
  const game = playedGame(store);
  const finished = store.finishGame(game.id);
  assert.ok(finished.finishedAt > 0);
  assert.deepEqual(store.activeGames(), []);
  assert.deepEqual(store.finishedGames().map((g) => g.id), [game.id]);
});

test('finishGame refuses before a round has been played', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  const game = store.startGame();
  assert.throws(() => store.finishGame(game.id), /at least one round/);
});

test('getGame finds a finished game by id', () => {
  const store = createStore(fakeStorage());
  const game = playedGame(store);
  store.finishGame(game.id);
  assert.equal(store.getGame(game.id).id, game.id);
});

test('playAgain re-seats the same players with no rounds', () => {
  const store = createStore(fakeStorage());
  const game = playedGame(store);
  store.finishGame(game.id);
  const next = store.playAgain(game.id);
  assert.deepEqual(next.seats.map((s) => s.name), ['Maya', 'Dana', 'Tobi']);
  assert.deepEqual(next.rounds, []);
  assert.notEqual(next.id, game.id);
  assert.equal(store.finishedGames().length, 1, 'history is not modified');
});

test('several games can be in play at once and each keeps its own rounds', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  const first = store.startGame();
  store.recordRound(first.id, [1, 2, 3]);
  const players = store.getState().players;
  players.forEach((p) => store.toggleSeat(p.id));
  const second = store.startGame();
  store.recordRound(second.id, [4, 5, 6]);
  assert.equal(store.activeGames().length, 2);
  assert.deepEqual(Ranking.totalsFor(store.getGame(first.id)), [1, 2, 3]);
  assert.deepEqual(Ranking.totalsFor(store.getGame(second.id)), [4, 5, 6]);
  assert.equal(store.getActiveGame().id, second.id, 'the newest game is the default');
});

test('recordRound refuses a finished game', () => {
  const store = createStore(fakeStorage());
  const game = playedGame(store);
  store.finishGame(game.id);
  assert.throws(() => store.recordRound(game.id, [1, 2, 3]), /already finished/);
});

test('recordRound refuses an unknown game', () => {
  const store = createStore(fakeStorage());
  assert.throws(() => store.recordRound('nope', [1]), /no longer available/);
});

test('an active game survives a reload', () => {
  const storage = fakeStorage();
  const first = createStore(storage);
  const game = playedGame(first);
  const second = createStore(storage);
  assert.equal(second.getActiveGame().id, game.id);
  assert.deepEqual(Ranking.totalsFor(second.getActiveGame()), [1, 2, 3]);
});

test('renaming a player does not rewrite a finished game', () => {
  const store = createStore(fakeStorage());
  const [maya] = seatThree(store);
  const game = store.startGame();
  store.recordRound(game.id, [1, 2, 3]);
  store.finishGame(game.id);
  store.renamePlayer(maya.id, 'May');
  assert.equal(store.getGame(game.id).seats[0].name, 'Maya');
  assert.equal(store.getState().players[0].name, 'May');
});

test('a corrupt stored document degrades to an empty state instead of throwing', () => {
  const storage = fakeStorage();
  storage.setItem('noting-more.v2', '{not json');
  const store = createStore(storage);
  assert.deepEqual(store.getState().players, []);
  assert.equal(store.isDegraded(), true);
});

test('a stored document of the wrong shape degrades to an empty state', () => {
  const storage = fakeStorage();
  storage.setItem('noting-more.v2', JSON.stringify({ version: 99, players: 'nope' }));
  const store = createStore(storage);
  assert.equal(store.isDegraded(), true);
  assert.deepEqual(store.getState().games, []);
});

test('a storage that throws on read degrades but stays usable', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() {} };
  const store = createStore(storage);
  assert.equal(store.isDegraded(), true);
  assert.equal(store.addPlayer('Maya', '🐱').name, 'Maya');
});

test('a storage that throws on write degrades but keeps working in memory', () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error('QuotaExceededError'); }
  };
  const store = createStore(storage);
  store.addPlayer('Maya', '🐱');
  assert.equal(store.isDegraded(), true);
  assert.equal(store.getState().players.length, 1);
});

test('updatePlayer changes both the name and the emoji', () => {
  const store = createStore(fakeStorage());
  const maya = store.addPlayer('Maya', '🐱');
  const updated = store.updatePlayer(maya.id, 'Maya B', '🦊');
  assert.equal(updated.name, 'Maya B');
  assert.equal(updated.emoji, '🦊');
  assert.equal(store.getState().players[0].emoji, '🦊');
});

test('updatePlayer rejects a blank name', () => {
  const store = createStore(fakeStorage());
  const maya = store.addPlayer('Maya', '🐱');
  assert.throws(() => store.updatePlayer(maya.id, '   ', '🐱'), /1-20 characters/);
});

test('updatePlayer rejects a name and emoji already on the roster', () => {
  const store = createStore(fakeStorage());
  store.addPlayer('Maya', '🐱');
  const dana = store.addPlayer('Dana', '🦊');
  assert.throws(() => store.updatePlayer(dana.id, 'Maya', '🐱'), /already on your roster/);
});

test('updatePlayer allows keeping the same name and emoji', () => {
  const store = createStore(fakeStorage());
  const maya = store.addPlayer('Maya', '🐱');
  assert.equal(store.updatePlayer(maya.id, 'Maya', '🐱').name, 'Maya');
});

test('updatePlayer rejects an unknown player', () => {
  const store = createStore(fakeStorage());
  assert.throws(() => store.updatePlayer('nobody', 'Maya', '🐱'), /not on your roster/);
});

test('editing a player does not rewrite a finished game', () => {
  const store = createStore(fakeStorage());
  const [maya] = seatThree(store);
  const game = store.startGame();
  store.recordRound(game.id, [1, 2, 3]);
  store.finishGame(game.id);
  store.updatePlayer(maya.id, 'May', '🦊');
  assert.equal(store.getGame(game.id).seats[0].emoji, '🐱');
  assert.equal(store.getState().players[0].emoji, '🦊');
});

test('removePlayer drops the player from the roster', () => {
  const store = createStore(fakeStorage());
  const maya = store.addPlayer('Maya', '🐱');
  store.addPlayer('Dana', '🦊');
  store.removePlayer(maya.id);
  assert.deepEqual(store.getState().players.map((p) => p.name), ['Dana']);
});

test('removePlayer also drops the player from the selection', () => {
  const store = createStore(fakeStorage());
  const maya = store.addPlayer('Maya', '🐱');
  const dana = store.addPlayer('Dana', '🦊');
  store.toggleSeat(maya.id);
  store.toggleSeat(dana.id);
  store.removePlayer(maya.id);
  assert.deepEqual(store.getState().selection, [dana.id]);
});

test('removePlayer rejects an unknown player', () => {
  const store = createStore(fakeStorage());
  assert.throws(() => store.removePlayer('nobody'), /not on your roster/);
});

test('removing a player does not rewrite a finished game', () => {
  const store = createStore(fakeStorage());
  const [maya] = seatThree(store);
  const game = store.startGame();
  store.recordRound(game.id, [1, 2, 3]);
  store.finishGame(game.id);
  store.removePlayer(maya.id);
  assert.deepEqual(store.getGame(game.id).seats.map((s) => s.name), ['Maya', 'Dana', 'Tobi']);
  assert.deepEqual(store.getState().players.map((p) => p.name), ['Dana', 'Tobi']);
});

test('a removed player stays removed after a reload', () => {
  const storage = fakeStorage();
  const first = createStore(storage);
  const maya = first.addPlayer('Maya', '🐱');
  first.removePlayer(maya.id);
  assert.deepEqual(createStore(storage).getState().players, []);
});

test('deleteGame removes a finished game', () => {
  const store = createStore(fakeStorage());
  const game = playedGame(store);
  store.finishGame(game.id);
  store.deleteGame(game.id);
  assert.deepEqual(store.finishedGames(), []);
});

const LEGACY = {
  version: 1,
  selection: ['p1'],
  players: [{ id: 'p1', name: 'Maya', emoji: '🐱', color: '#f0b429', createdAt: 1 }],
  currentGame: {
    id: 'g1',
    startedAt: 5,
    finishedAt: null,
    seats: [
      { id: 's1', name: 'Maya', emoji: '🐱', color: '#f0b429' },
      { id: 's2', name: 'Dana', emoji: '🦊', color: '#5bc8af' }
    ],
    rounds: [{ id: 'r1', points: [7, 4] }]
  },
  games: [{
    id: 'g0',
    startedAt: 1,
    finishedAt: 2,
    seats: [{ id: 's0', name: 'Dana', emoji: '🦊', color: '#5bc8af' }],
    rounds: [{ id: 'r0', points: [3] }]
  }],
  settings: { lowerWins: false }
};

test('a v1 document is migrated to v2 on load', () => {
  const storage = fakeStorage();
  storage.setItem('noting-more.v1', JSON.stringify(LEGACY));
  const store = createStore(storage);
  assert.equal(store.isDegraded(), false);
  assert.equal(store.getState().version, 2);
  assert.deepEqual(store.getSettings(), { lowerWins: false });
  assert.deepEqual(store.getState().selection, ['p1']);
});

test('migration turns the v1 game in progress into an active v2 game', () => {
  const storage = fakeStorage();
  storage.setItem('noting-more.v1', JSON.stringify(LEGACY));
  const store = createStore(storage);
  const active = store.getActiveGame();
  assert.equal(active.id, 'g1');
  assert.equal(active.startedAt, 5);
  assert.deepEqual(Ranking.totalsFor(active), [7, 4]);
  assert.deepEqual(active.rounds[0].points, { s1: 7, s2: 4 });
});

test('migration keeps finished games in history', () => {
  const storage = fakeStorage();
  storage.setItem('noting-more.v1', JSON.stringify(LEGACY));
  const store = createStore(storage);
  assert.deepEqual(store.finishedGames().map((g) => g.id), ['g0']);
  assert.deepEqual(Ranking.totalsFor(store.finishedGames()[0]), [3]);
});

test('migration writes a v2 document and leaves the v1 document alone', () => {
  const storage = fakeStorage();
  storage.setItem('noting-more.v1', JSON.stringify(LEGACY));
  createStore(storage);
  assert.ok(storage.getItem('noting-more.v2'));
  assert.ok(storage.getItem('noting-more.v1'));
});

test('a migrated store reloads from the v2 document without migrating again', () => {
  const storage = fakeStorage();
  storage.setItem('noting-more.v1', JSON.stringify(LEGACY));
  createStore(storage);
  storage.setItem('noting-more.v1', '{broken');
  const store = createStore(storage);
  assert.equal(store.isDegraded(), false);
  assert.equal(store.getActiveGame().id, 'g1');
});

test('a v1 document with no settings migrates with the default', () => {
  const storage = fakeStorage();
  storage.setItem('noting-more.v1', JSON.stringify({
    version: 1, selection: [], players: [], currentGame: null, games: []
  }));
  const store = createStore(storage);
  assert.deepEqual(store.getSettings(), { lowerWins: true });
  assert.equal(store.isDegraded(), false);
});

test('a v1 document of the wrong shape degrades to an empty state', () => {
  const storage = fakeStorage();
  storage.setItem('noting-more.v1', JSON.stringify({ version: 1, players: 'nope' }));
  const store = createStore(storage);
  assert.equal(store.isDegraded(), true);
  assert.deepEqual(store.getState().games, []);
});

test('the remembered lobby survives a reload', () => {
  const storage = fakeStorage();
  const first = createStore(storage);
  first.setLobby({ code: 'abcd2345', name: 'Kitchen', joinedAt: 9 });
  const second = createStore(storage);
  assert.deepEqual(second.getState().lobby, { code: 'ABCD2345', name: 'Kitchen', joinedAt: 9 });
});

test('startGame stamps each seat with the roster player id', () => {
  const store = createStore(fakeStorage());
  const players = seatThree(store);
  const game = store.startGame();
  assert.deepEqual(game.seats.map((s) => s.playerId), players.map((p) => p.id));
});

test('a player added mid-game gets their roster id on the new seat', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  const game = store.startGame();
  const late = store.addPlayerToGame(game.id, 'Sam', '🐸');
  assert.equal(store.getGame(game.id).seats[3].playerId, late.id);
});

test('playAgain seats still point at the same roster players', () => {
  const store = createStore(fakeStorage());
  const players = seatThree(store);
  const game = store.startGame();
  store.recordRound(game.id, [1, 2, 3]);
  store.finishGame(game.id);
  const next = store.playAgain(game.id);
  assert.deepEqual(next.seats.map((s) => s.playerId), players.map((p) => p.id));
});

test('seat player ids survive a reload', () => {
  const storage = fakeStorage();
  const first = createStore(storage);
  const players = seatThree(first);
  const game = first.startGame();
  const second = createStore(storage);
  assert.deepEqual(second.getGame(game.id).seats.map((s) => s.playerId), players.map((p) => p.id));
});

test('finishGame freezes the scoring direction on the game', () => {
  const store = createStore(fakeStorage());
  store.setLowerWins(false);
  const game = playedGame(store);
  store.finishGame(game.id);
  assert.equal(store.getGame(game.id).lowerWins, false);
});

test('an in-progress game has no frozen scoring direction', () => {
  const store = createStore(fakeStorage());
  const game = playedGame(store);
  assert.equal(store.getGame(game.id).lowerWins, undefined);
});

test('a frozen scoring direction survives a reload and a settings flip', () => {
  const storage = fakeStorage();
  const first = createStore(storage);
  first.setLowerWins(false);
  const game = playedGame(first);
  first.finishGame(game.id);
  first.setLowerWins(true);
  assert.equal(createStore(storage).getGame(game.id).lowerWins, false);
});

test('a finished game feeds the winner a win and the others a loss', () => {
  const store = createStore(fakeStorage());
  const players = seatThree(store);
  const game = store.startGame();
  store.recordRound(game.id, [1, 5, 9]);
  store.finishGame(game.id);
  const games = store.finishedGames();
  assert.deepEqual(Ranking.record(games, players[0], store.getSettings().lowerWins), { wins: 1, losses: 0 });
  assert.deepEqual(Ranking.record(games, players[1], store.getSettings().lowerWins), { wins: 0, losses: 1 });
  assert.deepEqual(Ranking.record(games, players[2], store.getSettings().lowerWins), { wins: 0, losses: 1 });
});
