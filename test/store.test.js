const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../js/store.js');

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

test('a new store is empty and healthy', () => {
  const store = createStore(fakeStorage());
  assert.deepEqual(store.getState(), {
    version: 1,
    selection: [],
    players: [],
    currentGame: null,
    games: [],
    settings: { lowerWins: true }
  });
  assert.equal(store.isDegraded(), false);
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

test('a stored document with no settings loads with the default', () => {
  const storage = fakeStorage();
  storage.setItem('noting-more.v1', JSON.stringify({
    version: 1, selection: [], players: [], currentGame: null, games: []
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

test('startGame snapshots the seated players and clears the selection', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  const game = store.startGame();
  assert.equal(game.seats.length, 3);
  assert.deepEqual(game.seats.map((s) => s.name), ['Maya', 'Dana', 'Tobi']);
  assert.deepEqual(game.rounds, []);
  assert.equal(game.finishedAt, null);
  assert.deepEqual(store.getState().selection, []);
});

test('startGame refuses to start with nobody seated', () => {
  const store = createStore(fakeStorage());
  assert.throws(() => store.startGame(), /at least one player/);
});

test('recordRound stores one integer per seat and undoRound removes the last round', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  store.startGame();
  store.recordRound([1, 2, 3]);
  store.recordRound([4, 5, 6]);
  assert.deepEqual(store.getState().currentGame.rounds.length, 2);
  store.undoRound();
  assert.deepEqual(store.getState().currentGame.rounds.map((r) => r.points), [[1, 2, 3]]);
});

test('recordRound treats blanks and garbage as zero', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  store.startGame();
  store.recordRound(['', '  ', 'abc']);
  assert.deepEqual(store.getState().currentGame.rounds[0].points, [0, 0, 0]);
});

test('recordRound truncates a non-integer and keeps negative points', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  store.startGame();
  store.recordRound(['3.7', '-2', '4']);
  assert.deepEqual(store.getState().currentGame.rounds[0].points, [3, -2, 4]);
});

test('recordRound rejects a point count that does not match the seats', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  store.startGame();
  assert.throws(() => store.recordRound([1, 2]), /must match the number of players/);
});

test('recordRound and undoRound refuse when no game is in progress', () => {
  const store = createStore(fakeStorage());
  assert.throws(() => store.recordRound([1]), /No game in progress/);
  assert.throws(() => store.undoRound(), /No game in progress/);
});

test('undoRound refuses when no round has been played', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  store.startGame();
  assert.throws(() => store.undoRound(), /No round to undo/);
});

test('a player added mid-game joins the roster and is back-filled with zeros', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  store.startGame();
  store.recordRound([1, 2, 3]);
  store.recordRound([4, 5, 6]);
  const guest = store.addPlayerToCurrentGame('Eli', '🐸');
  const game = store.getState().currentGame;
  assert.equal(game.seats.length, 4);
  assert.equal(game.seats[3].name, 'Eli');
  assert.deepEqual(game.rounds.map((r) => r.points), [[1, 2, 3, 0], [4, 5, 6, 0]]);
  assert.ok(store.getState().players.some((p) => p.id === guest.id));
});

test('addPlayerToCurrentGame validates the name', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  store.startGame();
  assert.throws(() => store.addPlayerToCurrentGame('', '🐸'), /1-20 characters/);
});

test('finishGame moves the game to history newest-first with a finish time', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  store.startGame();
  store.recordRound([1, 2, 3]);
  const finished = store.finishGame();
  assert.ok(finished.finishedAt > 0);
  assert.equal(store.getState().currentGame, null);
  assert.equal(store.getState().games.length, 1);
  assert.equal(store.getState().games[0].id, finished.id);
});

test('finishGame refuses before a round has been played', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  store.startGame();
  assert.throws(() => store.finishGame(), /at least one round/);
});

test('getGame finds a finished game by id', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  store.startGame();
  store.recordRound([1, 2, 3]);
  const finished = store.finishGame();
  assert.equal(store.getGame(finished.id).id, finished.id);
});

test('playAgain re-seats the same players with no rounds', () => {
  const store = createStore(fakeStorage());
  seatThree(store);
  store.startGame();
  store.recordRound([1, 2, 3]);
  const finished = store.finishGame();
  const next = store.playAgain(finished.id);
  assert.deepEqual(next.seats.map((s) => s.name), ['Maya', 'Dana', 'Tobi']);
  assert.deepEqual(next.rounds, []);
  assert.notEqual(next.id, finished.id);
  assert.equal(store.getState().games.length, 1, 'history is not modified');
});

test('playAgain refuses to overwrite a different game that is in progress', () => {
  const store = createStore(fakeStorage());
  const players = seatThree(store);
  store.startGame();
  store.recordRound([1, 2, 3]);
  const finished = store.finishGame();
  players.forEach((p) => store.toggleSeat(p.id));
  const live = store.startGame();
  store.recordRound([4, 5, 6]);
  assert.throws(() => store.playAgain(finished.id), /Finish or leave the game in progress first\./);
  assert.equal(store.getState().currentGame.id, live.id);
  assert.deepEqual(store.getState().currentGame.rounds.map((r) => r.points), [[4, 5, 6]]);
});

test('renaming a player does not rewrite a finished game', () => {
  const store = createStore(fakeStorage());
  const [maya] = seatThree(store);
  store.startGame();
  store.recordRound([1, 2, 3]);
  const finished = store.finishGame();
  store.renamePlayer(maya.id, 'May');
  assert.equal(store.getState().games[0].seats[0].name, 'Maya');
  assert.equal(store.getState().players[0].name, 'May');
});

test('a corrupt stored document degrades to an empty state instead of throwing', () => {
  const storage = fakeStorage();
  storage.setItem('noting-more.v1', '{not json');
  const store = createStore(storage);
  assert.deepEqual(store.getState().players, []);
  assert.equal(store.isDegraded(), true);
});

test('a stored document of the wrong shape degrades to an empty state', () => {
  const storage = fakeStorage();
  storage.setItem('noting-more.v1', JSON.stringify({ version: 99, players: 'nope' }));
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
  store.startGame();
  store.recordRound([1, 2, 3]);
  store.finishGame();
  store.updatePlayer(maya.id, 'May', '🦊');
  assert.equal(store.getState().games[0].seats[0].emoji, '🐱');
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
  store.startGame();
  store.recordRound([1, 2, 3]);
  store.finishGame();
  store.removePlayer(maya.id);
  assert.deepEqual(store.getState().games[0].seats.map((s) => s.name), ['Maya', 'Dana', 'Tobi']);
  assert.deepEqual(store.getState().players.map((p) => p.name), ['Dana', 'Tobi']);
});

test('a removed player stays removed after a reload', () => {
  const storage = fakeStorage();
  const first = createStore(storage);
  const maya = first.addPlayer('Maya', '🐱');
  first.removePlayer(maya.id);
  assert.deepEqual(createStore(storage).getState().players, []);
});
