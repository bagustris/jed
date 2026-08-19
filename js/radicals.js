// Radical-picker logic: group data/radicals.json by stroke count for the
// picker grid, and intersect kanji sets across a multi-select for "find the
// kanji containing all of these radicals". Pure functions of the loaded
// radicals array -- no fetch, no DOM -- app.js wires this to DataStore/UI.
// Works in browser (window.RadicalPicker) and Node (require, for tests).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RadicalPicker = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function groupByStroke(radicals) {
    const groups = new Map();
    for (const r of radicals) {
      if (!groups.has(r.strokes)) groups.set(r.strokes, []);
      groups.get(r.strokes).push(r);
    }
    return new Map([...groups.entries()].sort((a, b) => a[0] - b[0]));
  }

  function byChar(radicals) {
    const m = new Map();
    for (const r of radicals) m.set(r.char, r);
    return m;
  }

  // selectedChars: array of radical .char values. Returns sorted kanji
  // present in EVERY selected radical's kanji list (empty selection => []).
  function intersectKanji(radicals, selectedChars) {
    if (!selectedChars || selectedChars.length === 0) return [];
    const lookup = byChar(radicals);
    const sets = selectedChars
      .map((c) => lookup.get(c))
      .filter(Boolean)
      .map((r) => new Set(r.kanji));
    if (sets.length < selectedChars.length) return []; // an unknown radical char was selected
    sets.sort((a, b) => a.size - b.size); // intersect smallest-first for speed
    let result = sets[0];
    for (let i = 1; i < sets.length; i++) {
      result = new Set([...result].filter((k) => sets[i].has(k)));
      if (result.size === 0) break;
    }
    return [...result].sort();
  }

  return { groupByStroke, byChar, intersectKanji };
});
