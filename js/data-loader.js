// Fetch-and-cache access to data/. Bucket-key functions here MUST stay in
// sync with tools/build_data.py's kana_bucket()/kanji_index_bucket()/
// english_bucket() -- see tools/README.md's "Frontend/build contract".
// Works in browser (window.DataStore) and Node (require, for tests -- the
// pure bucket-key functions only; fetchJSON/etc. need a browser `fetch`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DataStore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KATA_START = 0x30a1, KATA_END = 0x30f9, KATA_HIRA_OFFSET = 0x60;
  const SMALL_TO_BASE = {
    'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
    'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ',
  };

  function kanaBucket(ch) {
    let c = ch;
    const code = c.codePointAt(0);
    if (code >= KATA_START && code <= KATA_END) c = String.fromCodePoint(code - KATA_HIRA_OFFSET);
    if (SMALL_TO_BASE[c]) c = SMALL_TO_BASE[c];
    return (c >= 'ぁ' && c <= 'ん') ? c : '_other';
  }

  function kanjiIndexBucket(ch) {
    return (ch.codePointAt(0) % 64).toString(16).padStart(2, '0');
  }

  function englishBucket(token) {
    const c = token[0];
    return (c >= 'a' && c <= 'z') ? c : '_other';
  }

  function kanjivgFilename(char) {
    return char.codePointAt(0).toString(16).padStart(5, '0') + '.svg';
  }

  // --- browser fetch layer (no-ops meaningfully only where `fetch` exists) ---
  const cache = new Map();

  function fetchJSON(path) {
    if (!cache.has(path)) {
      const p = fetch(path)
        .then((r) => {
          if (!r.ok) throw new Error(`fetch failed: ${path} (${r.status})`);
          return r.json();
        })
        .catch((err) => { cache.delete(path); throw err; });
      cache.set(path, p);
    }
    return cache.get(path);
  }

  const wordShard = (shardKey) => fetchJSON(`data/words/${shardKey}.json`);
  const kanjiIndexData = (bucket) => fetchJSON(`data/index/kanji/${bucket}.json`);
  const englishIndexData = (bucket) => fetchJSON(`data/index/english/${bucket}.json`);
  const kanjiData = () => fetchJSON('data/kanji.json');
  const radicalsData = () => fetchJSON('data/radicals.json');
  const kanjiSentences = () => fetchJSON('data/kanji-sentences.json');
  const wordSentences = () => fetchJSON('data/word-sentences.json');
  const kanjiWords = () => fetchJSON('data/kanji-words.json');

  function kanjivgSvg(char) {
    const path = `data/kanjivg/${kanjivgFilename(char)}`;
    if (!cache.has(path)) {
      const p = fetch(path).then((r) => (r.ok ? r.text() : null)).catch(() => null);
      cache.set(path, p);
    }
    return cache.get(path);
  }

  return {
    kanaBucket, kanjiIndexBucket, englishBucket, kanjivgFilename,
    fetchJSON, wordShard, kanjiIndexData, englishIndexData, kanjiData, radicalsData, kanjivgSvg, kanjiSentences, wordSentences, kanjiWords,
  };
});
