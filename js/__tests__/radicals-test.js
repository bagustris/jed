const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { groupByStroke, intersectKanji } = require('../radicals.js');

const radicals = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/radicals.json'), 'utf8'));

let pass = 0, fail = 0;
function ok(desc, cond) {
  if (cond) pass++;
  else { fail++; console.error(`FAIL: ${desc}`); }
}

const groups = groupByStroke(radicals);
ok('groups sorted ascending by stroke count', [...groups.keys()].every((k, i, arr) => i === 0 || arr[i - 1] < k));
ok('1-stroke group contains 一', (groups.get(1) || []).some((r) => r.char === '一'));

ok('single radical returns its full kanji list', intersectKanji(radicals, ['水']).length > 0);
ok('empty selection returns []', intersectKanji(radicals, []).length === 0);
ok('unknown radical char returns []', intersectKanji(radicals, ['€']).length === 0);

// 語 (word/language) should contain both 言 (speech) and 五 (five) radicals
const withGon = intersectKanji(radicals, ['言']);
ok('言 radical set contains 語', withGon.includes('語'));
const both = intersectKanji(radicals, ['言', '五']);
ok('intersection of 言+五 is a subset of 言 alone', both.every((k) => withGon.includes(k)));
ok('intersection of 言+五 contains 語', both.includes('語'));

console.log(`radicals: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
