// Pure startup helpers: version parsing/comparison and a parallel task runner.
// No DOM, no storage, no network — everything is passed in by the caller.

(function (global) {
  'use strict';

  function attr(tag, key) {
    const re = new RegExp('\\b' + key + '\\s*=\\s*(["\'])(.*?)\\1', 'i');
    const match = tag.match(re);
    return match ? match[2] : null;
  }

  function parseVersion(html) {
    if (typeof html !== 'string') return null;
    const metas = html.match(/<meta\b[^>]*>/gi) || [];
    for (let i = 0; i < metas.length; i += 1) {
      const name = attr(metas[i], 'name');
      if (name && name.toLowerCase() === 'scorelock-version') {
        const content = attr(metas[i], 'content');
        return content === null ? null : content.trim();
      }
    }
    return null;
  }

  function parts(value) {
    return String(value === null || value === undefined ? '' : value)
      .split('.')
      .map(function (part) {
        const number = Number(part);
        return isFinite(number) ? number : 0;
      });
  }

  function compare(a, b) {
    const left = parts(a);
    const right = parts(b);
    const length = Math.max(left.length, right.length);
    while (left.length < length) left.push(0);
    while (right.length < length) right.push(0);
    for (let i = 0; i < length; i += 1) {
      if (left[i] > right[i]) return 1;
      if (left[i] < right[i]) return -1;
    }
    return 0;
  }

  function create(tasks) {
    const list = Array.isArray(tasks) ? tasks : [];
    return {
      start: function (onProgress) {
        const total = list.length;
        const results = new Array(total);
        const failed = [];
        let settled = 0;
        const report = typeof onProgress === 'function' ? onProgress : function () {};
        report(0, total);
        const all = list.map(function (task, index) {
          return Promise.resolve()
            .then(function () { return task.run(); })
            .then(function (value) { results[index] = value; },
              function (error) { failed.push({ name: task.name, error: error }); })
            .then(function () {
              settled += 1;
              report(settled, total);
            });
        });
        return Promise.all(all).then(function () {
          return { ok: failed.length === 0, failed: failed, results: results };
        });
      }
    };
  }

  const Startup = { parseVersion: parseVersion, compare: compare, create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = Startup;
  else global.Startup = Startup;
})(typeof globalThis !== 'undefined' ? globalThis : this);
