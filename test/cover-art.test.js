const test = require('node:test');
const assert = require('node:assert/strict');
const CoverArt = require('../js/cover-art.js');

test('themeFor is deterministic and maps built-in games', () => {
  assert.equal(CoverArt.themeFor({ id: 'solo', name: 'SOLO', emoji: '🎴' }), 'cards');
  assert.equal(CoverArt.themeFor({ id: 'uno', name: 'UNO', emoji: '🃏' }), 'wild');
  const custom = { id: 'custom-abc', name: 'Rummy', emoji: '🐱' };
  assert.equal(CoverArt.themeFor(custom), CoverArt.themeFor(Object.assign({}, custom)));
  const themes = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8'].map(function (id) {
    return CoverArt.themeFor({ id: id, name: id, emoji: '🎲' });
  });
  assert.ok(new Set(themes).size >= 3);
});

test('svg uses the game colour and escapes injected names', () => {
  const svg = CoverArt.svg({
    id: 'x1', name: '<img src=x onerror=alert(1)>', emoji: '🐱', colour: '#5bc8af'
  });
  assert.match(svg, /^<svg /);
  assert.ok(svg.indexOf('#5bc8af') !== -1);
  assert.equal(svg.indexOf('<script'), -1);
  assert.equal(svg.indexOf('<img'), -1);
  assert.ok(svg.indexOf('&lt;img') !== -1);
});

test('svg falls back safely for bad colours and missing types', () => {
  const bad = CoverArt.svg({ id: 'x', name: 'X', colour: 'javascript:alert(1)' });
  assert.ok(bad.indexOf('#f0b429') !== -1);
  assert.equal(bad.indexOf('javascript:'), -1);
  assert.match(CoverArt.svg(null), /^<svg /);
});
