// Recently-viewed entries (JED's own "history" feature, changelog v0.2).
// Move-to-front on revisit, capped length. Pure localStorage CRUD, no DOM.
// Works in browser (window.History -- careful, that name also names the
// native browser History API on `window`, but as a plain top-level const in
// a classic script this binding shadows it locally without clobbering
// window.history) and Node (require, for tests).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ViewHistory = factory(window.localStorage);
})(typeof self !== 'undefined' ? self : this, function (defaultStorage) {
  'use strict';

  const KEY = 'jed-history';
  const MAX_ENTRIES = 100;

  function create(storage, max) {
    storage = storage || defaultStorage;
    max = max || MAX_ENTRIES;

    function readAll() {
      try {
        const raw = storage.getItem(KEY);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    function writeAll(entries) {
      storage.setItem(KEY, JSON.stringify(entries));
    }

    function key(item) {
      return item.kind === 'kanji' ? `kanji:${item.char}` : `word:${item.shard}:${item.seq}`;
    }

    function list() {
      return readAll();
    }

    // item: {kind: 'word', seq, shard, kanji, reading, gloss} or {kind: 'kanji', char}
    function record(item) {
      const entries = readAll().filter((e) => key(e) !== key(item));
      entries.unshift({ ...item, viewedAt: Date.now() });
      writeAll(entries.slice(0, max));
    }

    function clear() {
      writeAll([]);
    }

    return { list, record, clear };
  }

  return { create };
});
