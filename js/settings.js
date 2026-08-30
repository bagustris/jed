// User preferences (search mode default, theme). Small localStorage wrapper
// with in-memory fallback if storage is unavailable (private browsing, etc).
// Works in browser (window.SettingsManager) and Node (require, for tests).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SettingsManager = factory(window.localStorage);
})(typeof self !== 'undefined' ? self : this, function (defaultStorage) {
  'use strict';

  const KEY = 'jed-settings';
  const DEFAULTS = {
    searchBoth: true, // for Latin/ambiguous input, also search English glosses (not just romaji->kana)
    theme: 'system', // 'system' | 'light' | 'dark'
    romajiInput: true, // auto-convert romaji to kana as you type
    showConjugationByDefault: true, // expand the conjugation table on entry-view load, vs. collapsed
    furiganaEnabled: true, // show reading annotations above kanji in example sentences
  };

  function create(storage) {
    storage = storage || defaultStorage;

    function get() {
      try {
        const raw = storage.getItem(KEY);
        return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
      } catch (e) {
        return { ...DEFAULTS };
      }
    }

    function set(patch) {
      const next = { ...get(), ...patch };
      storage.setItem(KEY, JSON.stringify(next));
      return next;
    }

    return { get, set, DEFAULTS };
  }

  return { create, DEFAULTS };
});
