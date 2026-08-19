// Saved-entry notepad with free-text tags (JED's own "Notepad" + tag-export
// feature, changelog v0.2). Pure localStorage CRUD, no DOM -- app.js renders.
// Works in browser (window.Notepad) and Node (require, for tests -- pass an
// explicit storage object instead of relying on global localStorage).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Notepad = factory(window.localStorage);
})(typeof self !== 'undefined' ? self : this, function (defaultStorage) {
  'use strict';

  const KEY = 'jed-notepad';

  function create(storage) {
    storage = storage || defaultStorage;

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

    function key(seq, shard) {
      return `${shard}:${seq}`;
    }

    function list() {
      return readAll();
    }

    function isSaved(seq, shard) {
      return readAll().some((e) => key(e.seq, e.shard) === key(seq, shard));
    }

    // entry: {seq, shard, kanji, reading, gloss}. tags: string[] (may be empty).
    function save(entry, tags) {
      const entries = readAll();
      const k = key(entry.seq, entry.shard);
      const existing = entries.findIndex((e) => key(e.seq, e.shard) === k);
      const record = { ...entry, tags: tags || [], savedAt: Date.now() };
      if (existing >= 0) entries[existing] = { ...entries[existing], ...record };
      else entries.unshift(record);
      writeAll(entries);
      return record;
    }

    function remove(seq, shard) {
      writeAll(readAll().filter((e) => key(e.seq, e.shard) !== key(seq, shard)));
    }

    function addTag(seq, shard, tag) {
      const entries = readAll();
      const e = entries.find((x) => key(x.seq, x.shard) === key(seq, shard));
      if (!e) return;
      if (!e.tags) e.tags = [];
      if (e.tags.includes(tag)) return;
      e.tags.push(tag);
      writeAll(entries);
    }

    function removeTag(seq, shard, tag) {
      const entries = readAll();
      const e = entries.find((x) => key(x.seq, x.shard) === key(seq, shard));
      if (!e) return;
      e.tags = (e.tags || []).filter((t) => t !== tag);
      writeAll(entries);
    }

    function allTags() {
      const tags = new Set();
      for (const e of readAll()) for (const t of (e.tags || [])) tags.add(t);
      return [...tags].sort();
    }

    function byTag(tag) {
      return readAll().filter((e) => (e.tags || []).includes(tag));
    }

    return { list, isSaved, save, remove, addTag, removeTag, allTags, byTag };
  }

  return { create };
});
