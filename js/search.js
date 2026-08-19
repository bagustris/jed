// Search: query classification + result ranking (pure, tested in Node) plus
// async orchestration against DataStore (fetches shards/indices on demand,
// browser-only). Works in browser (window.Search) and Node (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data-loader.js'));
  else root.Search = factory(root.DataStore);
})(typeof self !== 'undefined' ? self : this, function (DataStore) {
  'use strict';

  function containsKanji(str) {
    // \p{Script=Han} (with the /u flag, so it operates on whole code points
    // rather than UTF-16 code units) covers 々 and supplementary-plane kanji
    // like 𠮟 (U+20B9F, the headword of the common word 𠮟る) as well as the
    // BMP CJK Unified Ideographs block -- a plain [一-鿿々] character class
    // matches neither of those, so a paste of 𠮟る would silently fall
    // through to the kana search path and return zero results.
    return /\p{Script=Han}/u.test(str);
  }

  // First full character of `query`, respecting surrogate pairs -- `query[0]`
  // would only grab the high surrogate half of a supplementary-plane kanji
  // like 𠮟 (U+20B9F), producing a different (wrong) bucket than Python's
  // codepoint-based ord() in tools/build_data.py.
  function firstChar(str) {
    return [...str][0];
  }

  function scoreWordMatch(entry, queryKana) {
    const exactReading = entry.r.some((r) => r.t === queryKana);
    const common = entry.r.some((r) => r.c) || entry.k.some((k) => k.c);
    let score = 0;
    if (exactReading) score += 100;
    if (common) score += 10;
    score -= (entry.r[0] ? entry.r[0].t.length : 0) * 0.1;
    return score;
  }

  // shardObj: {seq: entry} as shipped in data/words/<shard>.json
  function rankWordShardResults(shardObj, queryKana, limit) {
    const results = [];
    for (const [seq, entry] of Object.entries(shardObj)) {
      if (entry.r.some((r) => r.t.startsWith(queryKana))) {
        results.push({ seq, entry, score: scoreWordMatch(entry, queryKana) });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit || 50).map(({ seq, entry }) => ({ seq, entry }));
  }

  // bucketObj: {kanjiHeadword: {seq, shard}} as shipped in data/index/kanji/<bucket>.json
  function rankKanjiIndexResults(bucketObj, query, limit) {
    const results = [];
    for (const [headword, ref] of Object.entries(bucketObj)) {
      if (headword.startsWith(query)) results.push({ headword, ...ref, exact: headword === query });
    }
    results.sort((a, b) => (b.exact - a.exact) || a.headword.length - b.headword.length);
    return results.slice(0, limit || 50);
  }

  // bucketObj: {token: [{seq,shard,k,r}]} as shipped in data/index/english/<bucket>.json
  function rankEnglishIndexResults(bucketObj, token, limit) {
    const cap = limit || 50;
    const exact = (bucketObj[token] || []).map((r) => ({ ...r, exact: true }));
    const out = [...exact];
    // `break scan` bounds the *whole* scan at cap*3, not just the current
    // key's inner loop -- an unlabeled `break` here only exited the inner
    // for-of, so the outer loop kept visiting every remaining key in the
    // bucket (still pushing one extra item each) instead of stopping.
    scan: if (out.length < cap) {
      for (const key of Object.keys(bucketObj)) {
        if (key === token || !key.startsWith(token)) continue;
        for (const r of bucketObj[key]) {
          out.push({ ...r, exact: false });
          if (out.length >= cap * 3) break scan; // bound the scan on pathological buckets
        }
      }
    }
    return out.slice(0, cap);
  }

  function groupBy(arr, fn) {
    const m = new Map();
    for (const item of arr) {
      const k = fn(item);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(item);
    }
    return m;
  }

  // --- async orchestration (browser only: needs DataStore's fetch layer) ---

  async function searchJapanese(query, limit) {
    if (!query) return [];
    if (containsKanji(query)) {
      const bucket = DataStore.kanjiIndexBucket(firstChar(query));
      const idx = await DataStore.kanjiIndexData(bucket);
      const matches = rankKanjiIndexResults(idx, query, limit || 50);
      const byShard = groupBy(matches, (m) => m.shard);
      const results = [];
      for (const [shard, refs] of byShard) {
        const shardData = await DataStore.wordShard(shard);
        for (const ref of refs) {
          const entry = shardData[ref.seq];
          if (entry) results.push({ seq: ref.seq, shard, entry });
        }
      }
      return results;
    }
    const bucket = DataStore.kanaBucket(firstChar(query));
    const shardData = await DataStore.wordShard(bucket);
    return rankWordShardResults(shardData, query, limit || 50).map(({ seq, entry }) => ({ seq, shard: bucket, entry }));
  }

  async function searchEnglish(token, limit) {
    const t = token.toLowerCase().trim();
    if (!t) return [];
    const bucket = DataStore.englishBucket(t);
    const idx = await DataStore.englishIndexData(bucket);
    return rankEnglishIndexResults(idx, t, limit || 50);
  }

  async function loadEntry(seq, shard) {
    const shardData = await DataStore.wordShard(shard);
    return shardData[seq] || null;
  }

  return {
    containsKanji, scoreWordMatch, rankWordShardResults, rankKanjiIndexResults, rankEnglishIndexResults,
    searchJapanese, searchEnglish, loadEntry,
  };
});
