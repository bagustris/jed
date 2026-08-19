// Romaji -> Hiragana converter, driven by data/kana-romaji.json (ported from
// JED's own translation.dat/strict_kana.dat/dakuten.dat/handakuten.dat).
// Works in browser (window.KanaConvert) and Node (require, for tests).
//
// Design: buildTable()/toHiragana() are pure functions of an explicit table
// argument -- no fetch, no module state -- so tests can build a table from
// the real ported JSON via fs.readFileSync and exercise the exact matching
// logic the app uses. `load()`/`convert()` are a thin stateful convenience
// wrapper for the browser (fetches once, caches the built table).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KanaConvert = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function isConsonant(ch) {
    return /[bcdfghjklmpqrstvwxyz]/.test(ch);
  }

  // Build a { map: Map<romaji,hiragana>, sortedKeys: string[] (longest first) }
  // from the parsed data/kana-romaji.json object.
  function buildTable(data) {
    const map = new Map();
    for (const { romaji, hiragana } of data.romajiToKana) {
      map.set(romaji, hiragana);
    }
    if (!map.has('n')) map.set('n', 'ん'); // safety net; present in the ported data anyway
    for (const [alt, canonical] of Object.entries(data.alternateRomaji || {})) {
      const kana = map.get(canonical);
      if (kana) map.set(alt, kana);
    }
    const sortedKeys = [...map.keys()].sort((a, b) => b.length - a.length);
    return { map, sortedKeys };
  }

  // Greedy longest-match tokenizer over `table`. Plain doubled "n" before a
  // na-row vowel or "y" is NOT a special case -- it's just two adjacent
  // syllables that both happen to start with n (konnichiwa = ko+n+nichi+wa;
  // konnyaku = ko+n+nya+ku), and greedy matching handles it correctly on its
  // own. The one real special case is an explicit apostrophe, which forces a
  // syllable-final ん before a vowel/y that would otherwise combine into the
  // next mora (kon'ya -> こんや, not こんにゃ). A doubled consonant other
  // than n inserts っ (kitte -> きって).
  function toHiragana(input, table) {
    const { map, sortedKeys } = table;
    const s = input.toLowerCase();
    let out = '';
    let i = 0;
    while (i < s.length) {
      const ch = s[i];

      if (ch === 'n' && s[i + 1] === "'") {
        out += 'ん';
        i += 2;
        continue;
      }

      if (isConsonant(ch) && ch !== 'n' && s[i + 1] === ch) {
        out += 'っ';
        i += 1;
        continue;
      }

      let matched = false;
      for (const key of sortedKeys) {
        if (key.length <= s.length - i && s.startsWith(key, i)) {
          out += map.get(key);
          i += key.length;
          matched = true;
          break;
        }
      }
      if (!matched) {
        out += s[i]; // mid-typed consonant awaiting its vowel, or already-kana/kanji text
        i += 1;
      }
    }
    return out;
  }

  function toKatakana(hiragana) {
    return hiragana.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  }

  // --- stateful browser convenience wrapper ---
  let cachedTable = null;

  async function load() {
    if (cachedTable) return cachedTable;
    const res = await fetch('data/kana-romaji.json');
    const data = await res.json();
    cachedTable = buildTable(data);
    return cachedTable;
  }

  function convert(input) {
    if (!cachedTable) return input; // not loaded yet -- caller should await load() first
    return toHiragana(input, cachedTable);
  }

  return { buildTable, toHiragana, toKatakana, load, convert };
});
