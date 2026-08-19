const assert = require('assert');
const { conjugate } = require('../conjugation.js');

let pass = 0, fail = 0;
function get(forms, id) {
  return forms.find((f) => f.id === id);
}
function eq(desc, got, expected) {
  try { assert.strictEqual(got, expected); pass++; }
  catch (e) { fail++; console.error(`FAIL: ${desc} => ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`); }
}

// v1 ichidan: 食べる/たべる
{
  const f = conjugate('たべる', '食べる', ['v1', 'vt']);
  eq('v1 nai kana', get(f, 'nai').kana, 'たべない');
  eq('v1 nai kanji', get(f, 'nai').kanji, '食べない');
  eq('v1 masu', get(f, 'masu').kana, 'たべます');
  eq('v1 ta', get(f, 'ta').kana, 'たべた');
  eq('v1 te', get(f, 'te').kana, 'たべて');
  eq('v1 potential', get(f, 'potential').kana, 'たべられる');
  eq('v1 volitional', get(f, 'volitional').kana, 'たべよう');
  eq('v1 imperative kanji', get(f, 'imperative').kanji, '食べろ');
}

// v5k godan: 書く/かく
{
  const f = conjugate('かく', '書く', ['v5k', 'vt']);
  eq('v5k nai', get(f, 'nai').kana, 'かかない');
  eq('v5k masu', get(f, 'masu').kana, 'かきます');
  eq('v5k ta (い-onbin)', get(f, 'ta').kana, 'かいた');
  eq('v5k te', get(f, 'te').kana, 'かいて');
  eq('v5k potential', get(f, 'potential').kana, 'かける');
  eq('v5k ba', get(f, 'ba').kana, 'かけば');
  eq('v5k kanji ta', get(f, 'ta').kanji, '書いた');
}

// v5k-s irregular: 行く/いく (sokuon った/って, not い-onbin)
{
  const f = conjugate('いく', '行く', ['v5k-s', 'vi']);
  eq('v5k-s ta (sokuon, not い-onbin)', get(f, 'ta').kana, 'いった');
  eq('v5k-s te', get(f, 'te').kana, 'いって');
  eq('v5k-s nai (regular)', get(f, 'nai').kana, 'いかない');
}

// v5g voiced row: 泳ぐ/およぐ
{
  const f = conjugate('およぐ', '泳ぐ', ['v5g', 'vi']);
  eq('v5g ta (voiced だ)', get(f, 'ta').kana, 'およいだ');
  eq('v5g te (voiced で)', get(f, 'te').kana, 'およいで');
}

// v5s: 話す/はなす (し-stem, no sokuon)
{
  const f = conjugate('はなす', '話す', ['v5s', 'vt']);
  eq('v5s masu', get(f, 'masu').kana, 'はなします');
  eq('v5s ta', get(f, 'ta').kana, 'はなした');
  eq('v5s te', get(f, 'te').kana, 'はなして');
}

// v5r godan-ru (distinct from ichidan even though also ends in る): 分かる/わかる
{
  const f = conjugate('わかる', '分かる', ['v5r', 'vi']);
  eq('v5r nai (godan, not ichidan)', get(f, 'nai').kana, 'わからない');
  eq('v5r ta', get(f, 'ta').kana, 'わかった');
  eq('v5r masu', get(f, 'masu').kana, 'わかります');
}

// v5r-i irregular honorific: くださる (masu-stem/imperative use い not り)
{
  const f = conjugate('くださる', 'くださる', ['v5r-i', 'vt']);
  eq('v5r-i masu (irregular い)', get(f, 'masu').kana, 'くださいます');
  eq('v5r-i imperative (irregular い)', get(f, 'imperative').kana, 'ください');
  eq('v5r-i ta (regular godan-ru)', get(f, 'ta').kana, 'くださった');
}

// vk kuru: 来る/くる
{
  const f = conjugate('くる', '来る', ['vk', 'vi']);
  eq('vk nai (こない)', get(f, 'nai').kana, 'こない');
  eq('vk masu (きます)', get(f, 'masu').kana, 'きます');
  eq('vk te (きて)', get(f, 'te').kana, 'きて');
  eq('vk imperative (こい)', get(f, 'imperative').kana, 'こい');
  eq('vk kanji nai', get(f, 'nai').kanji, '来ない');
}

// vs suru (plain): する/する
{
  const f = conjugate('する', 'する', ['vs-i']);
  eq('vs nai', get(f, 'nai').kana, 'しない');
  eq('vs potential (irregular できる)', get(f, 'potential').kana, 'できる');
  eq('vs passive (される)', get(f, 'passive').kana, 'される');
}

// vs noun+suru compound: 勉強する/べんきょうする
{
  const f = conjugate('べんきょうする', '勉強する', ['vs']);
  eq('vs compound nai', get(f, 'nai').kana, 'べんきょうしない');
  eq('vs compound kanji nai', get(f, 'nai').kanji, '勉強しない');
  eq('vs compound potential', get(f, 'potential').kana, 'べんきょうできる');
}

// adj-i: 高い/たかい
{
  const f = conjugate('たかい', '高い', ['adj-i']);
  eq('adj-i negative', get(f, 'kunai').kana, 'たかくない');
  eq('adj-i past', get(f, 'katta').kana, 'たかかった');
  eq('adj-i te', get(f, 'kute').kana, 'たかくて');
  eq('adj-i kanji negative', get(f, 'kunai').kanji, '高くない');
}

// adj-ix irregular: いい (conjugates off よい)
{
  const f = conjugate('いい', '良い', ['adj-ix']);
  eq('adj-ix dict stays いい', get(f, 'dict').kana, 'いい');
  eq('adj-ix negative uses よ-stem', get(f, 'kunai').kana, 'よくない');
  eq('adj-ix past uses よ-stem', get(f, 'katta').kana, 'よかった');
}

// adj-na: 静か/しずか
{
  const f = conjugate('しずか', '静か', ['adj-na']);
  eq('adj-na plain', get(f, 'da').kana, 'しずかだ');
  eq('adj-na negative', get(f, 'janai').kana, 'しずかじゃない');
  eq('adj-na past', get(f, 'datta').kana, 'しずかだった');
}

// unsupported classes return null, not a guess
{
  eq('archaic v2 returns null', conjugate('おぼゆ', null, ['v2y-s']), null);
  eq('noun returns null', conjugate('ほん', '本', ['n']), null);
}

console.log(`conjugation: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
