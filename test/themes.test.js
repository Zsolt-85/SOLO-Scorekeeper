const test = require('node:test');
const assert = require('node:assert/strict');
const Themes = require('../js/themes.js');

function fakeStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); }
  };
}

test('normaliseSkin only accepts known skins', () => {
  assert.equal(Themes.normaliseSkin('neon'), 'neon');
  assert.equal(Themes.normaliseSkin('felt'), 'felt');
  assert.equal(Themes.normaliseSkin('nonsense'), 'midnight');
  assert.equal(Themes.normaliseSkin(null), 'midnight');
  assert.deepEqual(Themes.SKINS.map(function (s) { return s.id; }),
    ['midnight', 'felt', 'paper', 'neon']);
});

test('loadTheme defaults, round-trips and survives corrupt storage', () => {
  const storage = fakeStorage();
  assert.deepEqual(Themes.loadTheme(storage), { skin: 'midnight', glow: true });
  Themes.saveTheme(storage, { skin: 'paper', glow: false });
  assert.deepEqual(Themes.loadTheme(storage), { skin: 'paper', glow: false });
  storage.setItem('noting-more.theme.v1', '{broken json');
  assert.deepEqual(Themes.loadTheme(storage), { skin: 'midnight', glow: true });
});

test('applyTheme sets the skin attribute and glow class', () => {
  const calls = { dataset: {}, cls: null };
  const doc = {
    documentElement: {
      dataset: calls.dataset,
      classList: { toggle: function (name, on) { calls.cls = [name, on]; } }
    }
  };
  Themes.applyTheme(doc, { skin: 'neon', glow: false });
  assert.equal(calls.dataset.skin, 'neon');
  assert.deepEqual(calls.cls, ['no-glow', true]);
  Themes.applyTheme(doc, { skin: 'unknown', glow: true });
  assert.equal(calls.dataset.skin, 'midnight');
  assert.deepEqual(calls.cls, ['no-glow', false]);
});
