const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { containsKanji, rankWordShardResults, rankKanjiIndexResults, rankEnglishIndexResults } = require('../search.js');

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

console.log(`search: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
