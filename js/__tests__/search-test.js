const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  containsKanji, rankWordShardResults, rankKanjiIndexResults, rankEnglishIndexResults,
  isExactReadingMatch, mergeResults, rankMergedResults,
  levenshtein, fuzzyPrefixDistance, rankWordShardResultsFuzzy,
} = require('../search.js');
const { buildTable, toHiragana } = require('../kana-convert.js');

const ROOT = path.join(__dirname, '../..');
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

let pass = 0, fail = 0;
function ok(desc, cond) {
  if (cond) pass++;
  else { fail++; console.error(`FAIL: ${desc}`); }
}

ok('containsKanji true for 食べる', containsKanji('食べる'));
ok('containsKanji false for たべる', !containsKanji('たべる'));
ok('containsKanji true for 々 iteration mark', containsKanji('人々'));
ok('containsKanji true for supplementary-plane kanji 𠮟る', containsKanji('𠮟る'));

// 𠮟る (U+20B9F, a real jouyo-revision-2010 headword in data/words/し.json)
// must resolve to the same kanji-index bucket Python computes from the full
// codepoint -- a UTF-16-code-unit-based first-character extraction (e.g.
// plain `str[0]`) would grab only the lone high surrogate and land in the
// wrong bucket, making this word unfindable by kanji search.
{
  const { kanjiIndexBucket } = require('../data-loader.js');
  const astralKanji = [...'𠮟る'][0];
  ok('first char of 𠮟る is the full astral codepoint, not a lone surrogate', astralKanji.length === 2);
  const bucket = kanjiIndexBucket(astralKanji);
  ok('𠮟 kanji-index bucket is 1f (matches tools/build_data.py)', bucket === '1f');
  const idx = readJSON(`data/index/kanji/${bucket}.json`);
  ok('𠮟る is present in its predicted bucket', Object.prototype.hasOwnProperty.call(idx, '𠮟る'));
}

// word shard ranking: たべる shard should surface 食べる as a top (common) exact-prefix match
{
  const shard = readJSON('data/words/た.json');
  const results = rankWordShardResults(shard, 'たべる', 10);
  ok('finds at least one result for たべる', results.length > 0);
  const top = results[0].entry;
  ok('top result is common', top.r.some((r) => r.c) || top.k.some((k) => k.c));
  ok('たべもの/たべる family present somewhere in results', results.some((r) => r.entry.r.some((rd) => rd.t.startsWith('たべ'))));
}

// kanji index ranking: bucket for 食, exact match should rank first
{
  const bucket = require('../data-loader.js').kanjiIndexBucket('食');
  const idx = readJSON(`data/index/kanji/${bucket}.json`);
  const results = rankKanjiIndexResults(idx, '食', 20);
  ok('finds matches for 食 prefix', results.length > 0);
  ok('exact single-char 食 headword ranks first if present', !idx['食'] || results[0].headword === '食');
}

// english index ranking: exact "eat" should rank before longer prefix matches like "eating"
{
  const idx = readJSON('data/index/english/e.json');
  const results = rankEnglishIndexResults(idx, 'eat', 30);
  ok('finds results for eat', results.length > 0);
  ok('exact matches come first', results[0].exact === true);
  const firstNonExactIdx = results.findIndex((r) => !r.exact);
  if (firstNonExactIdx >= 0) {
    ok('no exact match appears after a non-exact one', results.slice(firstNonExactIdx).every((r) => !r.exact));
  }
}

// isExactReadingMatch: exact conversion (e.g. romaji "taberu" -> たべる)
// should short-circuit the English fallback; a bare prefix should not.
{
  const shard = readJSON('data/words/た.json');
  const exactHits = rankWordShardResults(shard, 'たべる', 10).map((r) => ({ ...r, shard: 'た' }));
  ok('exact query たべる is recognized as an exact reading match', isExactReadingMatch(exactHits, 'たべる'));
  const prefixHits = rankWordShardResults(shard, 'たべ', 10).map((r) => ({ ...r, shard: 'た' }));
  ok('prefix-only query たべ is not an exact reading match', !isExactReadingMatch(prefixHits, 'たべ'));
  ok('empty hit list is never an exact match', !isExactReadingMatch([], 'たべる'));
}

// mergeResults: dedup by shard+seq, tracking which path(s) found each entry
{
  const jaHits = [
    { seq: '1', shard: 'あ', entry: { k: [], r: [{ t: 'あい' }] } },
    { seq: '2', shard: 'あ', entry: { k: [], r: [{ t: 'あお' }] } },
  ];
  const enHits = [
    { seq: '2', shard: 'あ', k: 'あお', r: 'あお', exact: true }, // overlaps a JA hit
    { seq: '3', shard: 'か', k: 'かく', r: 'かく', exact: false }, // EN-only
  ];
  const merged = mergeResults(jaHits, enHits);
  ok('merge produces 3 distinct entries (2 JA + 1 EN-only, 1 overlap collapsed)', merged.length === 3);
  const overlap = merged.find((r) => r.seq === '2' && r.shard === 'あ');
  ok('overlapping entry keeps the JA entry payload', overlap.entry.r[0].t === 'あお');
  ok('overlapping entry records both sources', overlap.sources.includes('ja') && overlap.sources.includes('en'));
  const jaOnly = merged.find((r) => r.seq === '1');
  ok('JA-only entry has sources: [ja]', jaOnly.sources.length === 1 && jaOnly.sources[0] === 'ja');
  const enOnly = merged.find((r) => r.seq === '3');
  ok('EN-only entry has sources: [en] and no entry yet', enOnly.sources.length === 1 && enOnly.sources[0] === 'en' && enOnly.entry === null);
}

// rankMergedResults: a common exact-reading match should outrank a rare
// non-exact one regardless of which path(s) found them
{
  const results = [
    { seq: '1', shard: 'あ', sources: ['en'], exact: false, entry: { r: [{ t: 'zzzzz', c: false }], k: [] } },
    { seq: '2', shard: 'あ', sources: ['ja'], exact: false, entry: { r: [{ t: 'あい', c: true }], k: [] } },
  ];
  const ranked = rankMergedResults(results, 'あい');
  ok('exact common JA match ranks above an unrelated rare EN-only hit', ranked[0].seq === '2');
}

// levenshtein / fuzzyPrefixDistance: basic sanity
{
  ok('levenshtein identical strings is 0', levenshtein('abc', 'abc', 2) === 0);
  ok('levenshtein one substitution is 1', levenshtein('abc', 'abd', 2) === 1);
  ok('levenshtein one insertion is 1', levenshtein('ab', 'abc', 2) === 1);
  ok('levenshtein beyond maxDist reports something greater than maxDist', levenshtein('abc', 'xyz', 1) > 1);
  ok('fuzzyPrefixDistance matches an exact prefix at distance 0', fuzzyPrefixDistance('がくせ', 'がくせい', 2) === 0);
  ok('fuzzyPrefixDistance finds a single dropped-mora typo at distance 1', fuzzyPrefixDistance('がkせい', 'がくせい', 2) === 1);
}

// rankWordShardResultsFuzzy: typo-tolerant fallback against real shard data,
// using the actual romaji->kana table so the query matches what doSearch()
// would actually produce.
{
  const table = buildTable(readJSON('data/kana-romaji.json'));

  // "gaksei" (missing the "u" in "gakusei") should still find 学生 (がくせい).
  const q1 = toHiragana('gaksei', table);
  const shard1 = readJSON(`data/words/${[...q1][0]}.json`);
  ok('exact search for the broken conversion finds nothing', rankWordShardResults(shard1, q1, 10).length === 0);
  const fuzzy1 = rankWordShardResultsFuzzy(shard1, q1, 10);
  ok('fuzzy fallback for "gaksei" finds a がくせい reading', fuzzy1.some((r) => r.entry.r.some((rd) => rd.t.startsWith('がくせい'))));

  // "shogakko" (missing both long-vowel "u"s in "shougakkou") should still
  // find 小学校 (しょうがっこう).
  const q2 = toHiragana('shogakko', table);
  const shard2 = readJSON(`data/words/${[...q2][0]}.json`);
  ok('exact search for the broken conversion finds nothing', rankWordShardResults(shard2, q2, 10).length === 0);
  const fuzzy2 = rankWordShardResultsFuzzy(shard2, q2, 10);
  ok('fuzzy fallback for "shogakko" finds a しょうがっこう reading', fuzzy2.some((r) => r.entry.r.some((rd) => rd.t.startsWith('しょうがっこう'))));
}

// searchJapanese (kanji-index branch): a word with multiple kanji forms
// that all match the query prefix (食べるラー油 / 食べる辣油, seq 2847337,
// both start with 食べる) must surface once, not once per matching
// headword -- the kanji index has one row per headword, so without a
// dedup guard the same entry is pushed twice.
async function testKanjiSearchDedup() {
  global.fetch = async (url) => {
    const p = path.join(ROOT, url);
    if (!fs.existsSync(p)) return { ok: false, status: 404 };
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
  };
  const { searchJapanese } = require('../search.js');
  const hits = await searchJapanese('食べる', 40);
  const seqs = hits.map((h) => h.seq);
  ok('searchJapanese never returns the same seq twice for a multi-kanji-form word', new Set(seqs).size === seqs.length);
  ok('食べるラー油 (seq 2847337) is still found despite dedup', seqs.includes('2847337'));
}

testKanjiSearchDedup().then(() => {
  console.log(`search: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
