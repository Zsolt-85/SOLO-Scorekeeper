(function (global) {
  'use strict';

  function reducedMotion() {
    return Boolean(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function countTo(element, from, to, duration) {
    if (!element) return;
    if (reducedMotion() || duration <= 0) {
      element.textContent = String(to);
      return;
    }
    const start = performance.now();
    function step(now) {
      if (!element.isConnected) return;
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = String(Math.round(from + (to - from) * eased));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  let podiumTimers = [];

  function playPodium(root) {
    podiumTimers.forEach(clearTimeout);
    podiumTimers = [];
    if (!root) return;
    const columns = Array.prototype.slice.call(root.querySelectorAll('.bar-col'));
    columns.forEach(function (column, i) {
      const delay = reducedMotion() ? 0 : i * 260;
      const timer = setTimeout(function () {
        if (!column.isConnected) return;
        column.classList.add('grown');
        const target = column.querySelector('.bar-total');
        if (!target) return;
        countTo(target, 0, Number(target.getAttribute('data-total')) || 0, 700);
      }, delay);
      podiumTimers.push(timer);
    });
  }

  const Reveal = { reducedMotion: reducedMotion, countTo: countTo, playPodium: playPodium };
  global.Reveal = Reveal;
  if (typeof module !== 'undefined' && module.exports) module.exports = Reveal;
})(typeof window !== 'undefined' ? window : globalThis);
