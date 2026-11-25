const test = require('node:test');
const assert = require('node:assert/strict');
const Startup = require('../js/startup.js');

test('parseVersion reads name-then-content meta tag', () => {
  assert.equal(Startup.parseVersion('<meta name="scorelock-version" content="2.1.0">'), '2.1.0');
});

test('parseVersion reads content-then-name meta tag', () => {
  assert.equal(Startup.parseVersion('<meta content="2.2.0" name="scorelock-version">'), '2.2.0');
});

test('parseVersion accepts single quotes and self-closing tags', () => {
  assert.equal(Startup.parseVersion("<meta name='scorelock-version' content='2.1.1'/>"), '2.1.1');
});

test('parseVersion returns null when no version meta exists', () => {
  assert.equal(Startup.parseVersion('<html><body></body></html>'), null);
});

test('compare orders versions by numeric parts and treats missing parts as zero', () => {
  assert.equal(Startup.compare('2.1.0', '2.1.0'), 0);
  assert.equal(Startup.compare('2.2.0', '2.1.9'), 1);
  assert.equal(Startup.compare('2.1', '2.1.0'), 0);
  assert.equal(Startup.compare('2.0.9', '2.1.0'), -1);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise(function (res, rej) { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('runner reports success only after every task settles', async () => {
  const a = deferred(), b = deferred(), c = deferred();
  const progress = [];
  const runner = Startup.create([
    { name: 'version', run: function () { return a.promise; } },
    { name: 'shell', run: function () { return b.promise; } },
    { name: 'board', run: function () { return c.promise; } }
  ]);
  const pending = runner.start(function (done, total) { progress.push([done, total]); });
  assert.deepEqual(progress[0], [0, 3]);
  c.resolve('c');
  b.resolve('b');
  a.resolve('a');
  const result = await pending;
  assert.equal(result.ok, true);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.results, ['a', 'b', 'c']);
  assert.deepEqual(progress[progress.length - 1], [3, 3]);
});

test('runner names the failing task and leaves no result for it', async () => {
  const progress = [];
  const runner = Startup.create([
    { name: 'version', run: function () { return Promise.resolve('ok'); } },
    { name: 'board', run: function () { return Promise.reject(new Error('offline')); } },
    { name: 'drain', run: function () { return Promise.resolve('done'); } }
  ]);
  const result = await runner.start(function (done, total) { progress.push([done, total]); });
  assert.equal(result.ok, false);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].name, 'board');
  assert.equal(result.failed[0].error.message, 'offline');
  assert.equal(result.results[1], undefined);
  assert.deepEqual(progress[progress.length - 1], [2, 3]);
});

test('runner start resets progress for a retry', async () => {
  let failFirst = true;
  const progress = [];
  const runner = Startup.create([
    { name: 'version', run: function () { return Promise.resolve('v'); } },
    {
      name: 'board',
      run: function () {
        return failFirst ? Promise.reject(new Error('offline')) : Promise.resolve('board');
      }
    }
  ]);
  const first = await runner.start(function (done, total) { progress.push([done, total]); });
  assert.equal(first.ok, false);
  failFirst = false;
  const second = await runner.start(function (done, total) { progress.push([done, total]); });
  assert.equal(second.ok, true);
  assert.equal(progress.filter(function (p) { return p[0] === 0; }).length, 2);
  assert.deepEqual(progress[progress.length - 1], [2, 2]);
});
