// Deterministic, dependency-free SVG game art. Each game gets a scene drawn from
// its own colour and a stable theme — no external images, no webfonts, no uploads.
// Everything is inline and id-free so dozens of covers can share one page.

(function (global) {
  'use strict';

  const THEMES = ['cards', 'wild', 'dice', 'tokens', 'tiles', 'board'];

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[&<>"']/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
      });
  }

  function safeColour(value) {
    const text = String(value === null || value === undefined ? '' : value);
    return /^#[0-9a-f]{6}$/i.test(text) ? text : '#f0b429';
  }

  function themeFor(type) {
    const game = type || {};
    const id = String(game.id || '').toLowerCase();
    if (id === 'solo') return 'cards';
    if (id === 'uno') return 'wild';
    const source = id + '|' + String(game.emoji || '');
    let hash = 0;
    for (let i = 0; i < source.length; i += 1) {
      hash = ((hash * 31) + source.charCodeAt(i)) >>> 0;
    }
    return THEMES[hash % THEMES.length];
  }

  function scene(theme, c) {
    if (theme === 'cards') {
      return '<g transform="translate(100 112)">'
        + '<rect x="-52" y="-58" width="76" height="112" rx="10" fill="#f1e7d0" transform="rotate(-20)"/>'
        + '<rect x="-40" y="-64" width="76" height="112" rx="10" fill="#fbf5e6" stroke="#d6c49d" transform="rotate(0)"/>'
        + '<rect x="-28" y="-58" width="76" height="112" rx="10" fill="#f1e7d0" transform="rotate(19)"/>'
        + '<circle cx="-2" cy="-8" r="20" fill="' + c + '"/>'
        + '<circle cx="-9" cy="-15" r="3.5" fill="#111428"/>'
        + '<circle cx="6" cy="0" r="3.5" fill="#111428"/></g>'
        + '<circle cx="46" cy="208" r="13" fill="#5bc8af" opacity=".9"/>'
        + '<circle cx="76" cy="220" r="13" fill="#ef7f6b" opacity=".9"/>'
        + '<circle cx="156" cy="208" r="13" fill="#9d8df1" opacity=".9"/>';
    }
    if (theme === 'wild') {
      return '<g transform="translate(100 116)">'
        + '<rect x="-48" y="-62" width="64" height="116" rx="10" fill="#ef7f6b" transform="rotate(-24)"/>'
        + '<rect x="-32" y="-68" width="64" height="116" rx="10" fill="#f0b429" transform="rotate(-4)"/>'
        + '<rect x="-16" y="-62" width="64" height="116" rx="10" fill="#5bc8af" transform="rotate(17)"/>'
        + '<path d="M6 -30 l7 14 15 2 -11 11 3 15 -14 -8 -14 8 3 -15 -11 -11 15 -2z" fill="#f1e7d0"/>'
        + '</g><circle cx="150" cy="212" r="16" fill="' + c + '" opacity=".85"/>';
    }
    if (theme === 'dice') {
      return '<g transform="translate(74 118) rotate(-12)">'
        + '<rect x="-42" y="-42" width="84" height="84" rx="16" fill="' + c + '"/>'
        + '<circle cx="-20" cy="-20" r="7" fill="#111428"/><circle cx="20" cy="20" r="7" fill="#111428"/>'
        + '<circle cx="20" cy="-20" r="7" fill="#111428"/><circle cx="-20" cy="20" r="7" fill="#111428"/>'
        + '</g><g transform="translate(136 174) rotate(15)">'
        + '<rect x="-36" y="-36" width="72" height="72" rx="14" fill="#f1e7d0"/>'
        + '<circle cx="-14" cy="-14" r="6" fill="#241a02"/><circle cx="14" cy="14" r="6" fill="#241a02"/>'
        + '</g><circle cx="52" cy="218" r="12" fill="#5bc8af" opacity=".8"/>';
    }
    if (theme === 'tokens') {
      return '<g transform="translate(100 130)">'
        + '<ellipse cx="0" cy="52" rx="58" ry="16" fill="#111428" opacity=".4"/>'
        + '<ellipse cx="-36" cy="36" rx="34" ry="13" fill="' + c + '"/><ellipse cx="-36" cy="26" rx="34" ry="13" fill="' + c + '" opacity=".8"/>'
        + '<ellipse cx="34" cy="42" rx="34" ry="13" fill="#9d8df1"/><ellipse cx="34" cy="30" rx="34" ry="13" fill="#9d8df1" opacity=".8"/>'
        + '<ellipse cx="0" cy="8" rx="42" ry="16" fill="#f1e7d0"/><ellipse cx="0" cy="-2" rx="42" ry="16" fill="#fbf5e6"/>'
        + '<circle cx="0" cy="-2" r="9" fill="' + c + '"/></g>'
        + '<circle cx="158" cy="212" r="11" fill="#ef7f6b" opacity=".85"/>';
    }
    if (theme === 'tiles') {
      let tiles = '';
      const colours = [c, '#5bc8af', '#f1e7d0', '#ef7f6b', '#9d8df1', c, '#f1e7d0', '#5bc8af', c];
      for (let i = 0; i < 9; i += 1) {
        const x = 28 + (i % 3) * 56;
        const y = 48 + Math.floor(i / 3) * 56;
        tiles += '<rect x="' + x + '" y="' + y + '" width="48" height="48" rx="10" fill="'
          + colours[i] + '" opacity=".92"/><circle cx="' + (x + 24) + '" cy="' + (y + 24)
          + '" r="7" fill="#111428" opacity=".35"/>';
      }
      return tiles;
    }
    // board: a simple route grid with a glowing path
    let grid = '';
    for (let i = 1; i < 5; i += 1) {
      grid += '<path d="M' + (i * 40) + ' 40 L' + (i * 40) + ' 220" stroke="#f2f3ff" stroke-opacity=".10"/>'
        + '<path d="M24 ' + (40 + i * 36) + ' L176 ' + (40 + i * 36) + '" stroke="#f2f3ff" stroke-opacity=".10"/>';
    }
    return grid
      + '<path d="M44 196 L88 196 L88 148 L132 148 L132 96 L168 96" fill="none" stroke="'
      + c + '" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>'
      + '<circle cx="44" cy="196" r="12" fill="#f1e7d0"/><circle cx="168" cy="96" r="14" fill="' + c + '"/>';
  }

  function svg(type) {
    const game = type || {};
    const c = safeColour(game.colour);
    const theme = themeFor(game);
    const name = escapeHtml(game.name || 'Game');
    return '<svg class="cover-art" viewBox="0 0 200 260"'
      + ' xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"'
      + ' role="img" aria-label="' + name + ' artwork">'
      + '<rect width="200" height="260" fill="#111428"/>'
      + '<circle cx="100" cy="104" r="98" fill="' + c + '" opacity=".14"/>'
      + '<circle cx="158" cy="228" r="64" fill="' + c + '" opacity=".10"/>'
      + scene(theme, c)
      + '</svg>';
  }

  const CoverArt = { themeFor: themeFor, svg: svg, themes: THEMES };

  global.CoverArt = CoverArt;
  if (typeof module !== 'undefined' && module.exports) module.exports = CoverArt;
})(typeof window !== 'undefined' ? window : globalThis);
