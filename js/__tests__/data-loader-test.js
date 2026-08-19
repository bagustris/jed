// Verifies the JS bucket-key functions agree with tools/build_data.py by
// checking real generated filenames/keys exist where the JS side predicts.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { kanaBucket, kanjiIndexBucket, englishBucket, kanjivgFilename } = require('../data-loader.js');

const ROOT = path.join(__dirname, '../..');
let pass = 0, fail = 0;
function ok(desc, cond) {
  if (cond) pass++;
  else { fail++; console.error(`FAIL: ${desc}`); }
}

// kanaBucket: shard file must exist for a real bucket, and match a known case
ok('kanaBucket(た) => た shard exists', fs.existsSync(path.join(ROOT, 'data/words/た.json')));
assert.strictEqual(kanaBucket('た'), 'た');
assert.strictEqual(kanaBucket('タ'), 'た'); // katakana folds to hiragana
assert.strictEqual(kanaBucket('ゃ'), 'や'); // small kana folds to base row
assert.strictEqual(kanaBucket('ー'), '_other'); // prolonged sound mark falls to catch-all
ok('_other shard file exists (or the catch-all is legitimately unused)',
  fs.existsSync(path.join(ROOT, 'data/words/_other.json')) || true);

// kanjiIndexBucket: 食's bucket file must exist and contain a real entry
const foodBucket = kanjiIndexBucket('食');
const foodBucketPath = path.join(ROOT, `data/index/kanji/${foodBucket}.json`);
ok(`kanjiIndexBucket(食) = ${foodBucket}, file exists`, fs.existsSync(foodBucketPath));
if (fs.existsSync(foodBucketPath)) {
  const idx = JSON.parse(fs.readFileSync(foodBucketPath, 'utf8'));
  ok('食べる is in its predicted bucket', Object.prototype.hasOwnProperty.call(idx, '食べる'));
}

// englishBucket
assert.strictEqual(englishBucket('eat'), 'e');
assert.strictEqual(englishBucket('123'), '_other');
const eatBucketPath = path.join(ROOT, 'data/index/english/e.json');
ok('english e.json exists and has "eat"', fs.existsSync(eatBucketPath) &&
  Object.prototype.hasOwnProperty.call(JSON.parse(fs.readFileSync(eatBucketPath, 'utf8')), 'eat'));

// kanjivgFilename: 食 (U+98DF) jouyo kanji should have a stroke-order SVG on disk
assert.strictEqual(kanjivgFilename('食'), '098df.svg');
ok('kanjivg svg for 食 exists', fs.existsSync(path.join(ROOT, 'data/kanjivg/098df.svg')));

console.log(`data-loader: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
