// Table Skins: pure definitions and per-device persistence for the app's look.
// Nothing here touches results, scoring or the network.

(function (global) {
  'use strict';

  const KEY = 'noting-more.theme.v1';
  const SKINS = [
    { id: 'vault', name: 'VAULT', desc: 'Walnut + engraved gold', swatch: '#e7c47a' },
    { id: 'midnight', name: 'Midnight', desc: 'Navy + gold', swatch: '#f0b429' },
    { id: 'felt', name: 'Felt & Brass', desc: 'Green felt, warm brass', swatch: '#c9a227' },
    { id: 'paper', name: 'Paper Club', desc: 'Cream scorecard, ink', swatch: '#98733d' },
    { id: 'neon', name: 'Neon Hall', desc: 'Arcade glow, cyan + pink', swatch: '#4de3ff' }
  ];

  function normaliseSkin(value) {
    for (let i = 0; i < SKINS.length; i += 1) {
      if (SKINS[i].id === value) return value;
    }
    return 'vault';
  }

  function defaults() {
    return { skin: 'vault', glow: true };
  }

  function loadTheme(storage) {
    try {
      const raw = storage && storage.getItem(KEY);
      if (!raw) return defaults();
      const parsed = JSON.parse(raw);
      return {
        skin: normaliseSkin(parsed && parsed.skin),
        glow: !(parsed && parsed.glow === false)
      };
    } catch (error) {
      return defaults();
    }
  }

  function saveTheme(storage, theme) {
    const value = {
      skin: normaliseSkin(theme && theme.skin),
      glow: !(theme && theme.glow === false)
    };
    try {
      if (storage) storage.setItem(KEY, JSON.stringify(value));
    } catch (error) {
      /* storage may be blocked — the app still works with in-memory state */
    }
    return value;
  }

  function applyTheme(doc, theme) {
    const root = doc && doc.documentElement;
    if (!root) return;
    const value = {
      skin: normaliseSkin(theme && theme.skin),
      glow: !(theme && theme.glow === false)
    };
    if (root.dataset) root.dataset.skin = value.skin;
    if (root.classList && typeof root.classList.toggle === 'function') {
      root.classList.toggle('no-glow', !value.glow);
    }
  }

  const Themes = {
    KEY: KEY, SKINS: SKINS,
    normaliseSkin: normaliseSkin, loadTheme: loadTheme,
    saveTheme: saveTheme, applyTheme: applyTheme
  };

  global.Themes = Themes;
  if (typeof module !== 'undefined' && module.exports) module.exports = Themes;
})(typeof window !== 'undefined' ? window : globalThis);
