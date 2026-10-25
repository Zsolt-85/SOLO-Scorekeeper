(function (global) {
  'use strict';

  const PALETTE = [
    '#f0b429', '#5bc8af', '#ef7f6b', '#9d8df1',
    '#6ec1ff', '#7bc950', '#f28ab2', '#c9a227'
  ];
  const MAX_NAME = 24;
  const MIN_LIMIT = 1;
  const MAX_LIMIT = 1000000;
  const PATTERNS = ['pips', 'stripes', 'arcs', 'grid', 'diamonds'];
  const PRESETS = [
    {
      id: 'lowest',
      label: 'Lowest wins',
      rules: { winner: 'lowest', end: { type: 'manual' } }
    },
    {
      id: 'highest',
      label: 'Highest wins',
      rules: { winner: 'highest', end: { type: 'manual' } }
    }
  ];

  function cleanName(name) {
    return String(name === null || name === undefined ? '' : name)
      .replace(/\s+/g, ' ')
      .trim();
  }

  function nameKey(name) {
    return cleanName(name).toLowerCase().replace(/\s+/g, '');
  }

  function validateName(name, library, ignoreId) {
    const clean = cleanName(name);
    if (!clean || clean.length > MAX_NAME) {
      throw new Error('Game name must be 1-24 characters.');
    }
    const key = nameKey(clean);
    const taken = (Array.isArray(library) ? library : []).some(function (type) {
      return type && type.id !== ignoreId && nameKey(type.name) === key;
    });
    if (taken) throw new Error('That game name is already in the library.');
    return clean;
  }

  function validateRules(rules) {
    const input = rules || {};
    if (input.winner !== 'lowest' && input.winner !== 'highest') {
      throw new Error('Winner must be lowest or highest.');
    }
    const end = input.end || { type: 'manual' };
    if (end.type !== 'manual' && end.type !== 'limit') {
      throw new Error('End must be manual or a score limit.');
    }
    if (end.type === 'manual') {
      return { winner: input.winner, end: { type: 'manual' } };
    }
    const limit = Number(end.limit);
    if (!Number.isInteger(limit) || limit < MIN_LIMIT || limit > MAX_LIMIT) {
      throw new Error('Limit must be a whole number from 1 to 1,000,000.');
    }
    return { winner: input.winner, end: { type: 'limit', limit: limit } };
  }

  function normalizeRules(rules, lowerWins) {
    try {
      return validateRules(rules);
    } catch (error) {
      return {
        winner: lowerWins === false ? 'highest' : 'lowest',
        end: { type: 'manual' }
      };
    }
  }

  function type(id, name, emoji, colour, pattern, rules) {
    return {
      id: id,
      name: name,
      emoji: emoji,
      colour: colour,
      pattern: pattern,
      builtin: true,
      archived: false,
      rules: rules,
      createdAt: 0,
      updatedAt: 0
    };
  }

  function defaults() {
    return [
      type('solo', 'SOLO', '🃏', '#f0b429', 'pips',
        { winner: 'lowest', end: { type: 'manual' } }),
      type('uno', 'UNO', '🎴', '#ef7f6b', 'arcs',
        { winner: 'highest', end: { type: 'limit', limit: 500 } })
    ];
  }

  function seed() {
    return defaults();
  }

  function find(library, id) {
    return (Array.isArray(library) ? library : []).filter(function (type) {
      return type && type.id === id;
    })[0] || null;
  }

  function normalizeType(input) {
    if (!input || typeof input !== 'object') return null;
    const id = String(input.id || '').trim();
    const name = cleanName(input.name);
    if (!id || !name || name.length > MAX_NAME) return null;
    const builtin = !!input.builtin;
    return {
      id: id,
      name: name,
      emoji: String(input.emoji || '🃏') || '🃏',
      colour: PALETTE.indexOf(input.colour) === -1 ? PALETTE[0] : input.colour,
      pattern: PATTERNS.indexOf(input.pattern) === -1 ? 'pips' : input.pattern,
      builtin: builtin,
      archived: builtin ? false : !!input.archived,
      rules: normalizeRules(input.rules, input.lowerWins),
      createdAt: typeof input.createdAt === 'number' ? input.createdAt : 0,
      updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : 0
    };
  }

  function makeType(input, options) {
    const opts = options || {};
    const data = input || {};
    const now = typeof opts.now === 'function' ? opts.now() : Date.now();
    const id = String(data.id || '').trim()
      || (typeof opts.uid === 'function' ? opts.uid('t') : 't' + now.toString(36));
    const name = validateName(data.name, opts.library, id);
    const emoji = String(data.emoji || '').trim();
    if (!emoji) throw new Error('Pick an emoji for the game.');
    const builtin = !!data.builtin;
    return {
      id: id,
      name: name,
      emoji: emoji,
      colour: PALETTE.indexOf(data.colour) === -1 ? PALETTE[0] : data.colour,
      pattern: PATTERNS.indexOf(data.pattern) === -1 ? 'pips' : data.pattern,
      builtin: builtin,
      archived: builtin ? false : !!data.archived,
      rules: validateRules(data.rules),
      createdAt: typeof data.createdAt === 'number' ? data.createdAt : now,
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : now
    };
  }

  const Library = {
    PALETTE: PALETTE,
    MAX_NAME: MAX_NAME,
    MIN_LIMIT: MIN_LIMIT,
    MAX_LIMIT: MAX_LIMIT,
    PATTERNS: PATTERNS,
    PRESETS: PRESETS,
    cleanName: cleanName,
    nameKey: nameKey,
    validateName: validateName,
    validateRules: validateRules,
    normalizeType: normalizeType,
    defaults: defaults,
    seed: seed,
    find: find,
    makeType: makeType
  };

  global.Library = Library;
  if (typeof module !== 'undefined' && module.exports) module.exports = Library;
})(typeof window !== 'undefined' ? window : globalThis);
