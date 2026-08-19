// Node-builtin test runner for kana-convert.js, exercised against the real
// ported data/kana-romaji.json (not a hand-written duplicate table).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildTable, toHiragana } = require('../kana-convert.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/kana-romaji.json'), 'utf8'));
const table = buildTable(data);

let pass = 0, fail = 0;
function eq(input, expected) {
  const got = toHiragana(input, table);
  try { assert.strictEqual(got, expected); pass++; }
  catch (e) { fail++; console.error(`FAIL: toHiragana(${JSON.stringify(input)}) => ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`); }
}

// basic gojuon
eq('a', 'あ'); eq('ka', 'か'); eq('shi', 'し'); eq('chi', 'ち'); eq('tsu', 'つ');
eq('konnichiwa', 'こんにちわ');
eq('sushi', 'すし');
// youon
eq('kyo', 'きょ'); eq('sha', 'しゃ'); eq('ryuu', 'りゅう'); eq('ja', 'じゃ');
// sokuon (double consonant)
eq('kitte', 'きって'); eq('gakkou', 'がっこう'); eq('itta', 'いった');
// n handling
eq('n', 'ん'); eq('hon', 'ほん'); eq('kanji', 'かんじ');
eq('onna', 'おんな');
eq("kon'ya", 'こんや'); // apostrophe forces ん before や, not にゃ
eq('konnya', 'こんにゃ'); // plain double-n is just ん + にゃ (cf. konnyaku), not special-cased
eq('sensei', 'せんせい'); eq('shinbun', 'しんぶん');
eq('kanpai', 'かんぱい'); // n before non-y consonant
// dakuten/handakuten mora present directly (not composed)
eq('ga', 'が'); eq('pa', 'ぱ'); eq('da', 'だ'); eq('ji', 'じ'); eq('zu', 'ず');
// alternate romaji spellings ported from translation.dat
eq('dza', 'じゃ'); eq('wo', 'お');
// mixed / passthrough (already kana, or a character with no romaji mapping)
eq('ひと', 'ひと'); eq('あka', 'あか');
// full word examples
eq('tabemasu', 'たべます'); eq('nihongo', 'にほんご'); eq('arigatou', 'ありがとう');

console.log(`kana-convert: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
