// Verb/i-adjective/na-adjective conjugation, driven entirely by JMdict
// part-of-speech tags (v1, v5k, adj-i, vs, ...) -- not by guessing from the
// dictionary-form ending. This is the feature JED's own changelog cited as
// a bug fix ("generates conjugation based on edict info, not verb ending").
//
// Scope: modern verb/adjective classes only (v1, v5* except archaic v2/v4
// nidan/yodan classicals, vk, vs family, adj-i/adj-ix/adj-na). Anything else
// returns null -- conjugate() callers should treat null as "not applicable"
// rather than guess.
//
// Works in browser (window.Conjugator) and Node (require, for tests).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Conjugator = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Godan row table, keyed by the dictionary-form's final kana.
  // a/i/e/o = the four vowel-row alternations off that consonant; te/ta =
  // the onbin (sound-change) suffix, which is irregular per row.
  const ROW = {
    'う': { a: 'わ', i: 'い', e: 'え', o: 'お', te: 'って', ta: 'った' },
    'く': { a: 'か', i: 'き', e: 'け', o: 'こ', te: 'いて', ta: 'いた' },
    'ぐ': { a: 'が', i: 'ぎ', e: 'げ', o: 'ご', te: 'いで', ta: 'いだ' },
    'す': { a: 'さ', i: 'し', e: 'せ', o: 'そ', te: 'して', ta: 'した' },
    'つ': { a: 'た', i: 'ち', e: 'て', o: 'と', te: 'って', ta: 'った' },
    'ぬ': { a: 'な', i: 'に', e: 'ね', o: 'の', te: 'んで', ta: 'んだ' },
    'ぶ': { a: 'ば', i: 'び', e: 'べ', o: 'ぼ', te: 'んで', ta: 'んだ' },
    'む': { a: 'ま', i: 'み', e: 'め', o: 'も', te: 'んで', ta: 'んだ' },
    'る': { a: 'ら', i: 'り', e: 'れ', o: 'ろ', te: 'って', ta: 'った' },
  };
  const IKU_YUKU_TE_TA = { te: 'って', ta: 'った' }; // v5k-s: 行く/いく class keeps sokuon, not い-onbin

  function dropTail(s, n) {
    return n === 0 ? s : s.slice(0, -n);
  }

  const FORM_LABELS = {
    dict: { ja: '辞書形', en: 'Dictionary form' },
    masu: { ja: 'ます形', en: 'Polite' },
    masen: { ja: 'ません形', en: 'Polite negative' },
    mashita: { ja: 'ました形', en: 'Polite past' },
    masenDeshita: { ja: 'ませんでした形', en: 'Polite past negative' },
    nai: { ja: 'ない形', en: 'Plain negative' },
    ta: { ja: 'た形', en: 'Plain past' },
    nakatta: { ja: 'なかった形', en: 'Plain past negative' },
    te: { ja: 'て形', en: 'Te-form' },
    potential: { ja: '可能形', en: 'Potential' },
    passive: { ja: '受身形', en: 'Passive' },
    causative: { ja: '使役形', en: 'Causative' },
    causativePassive: { ja: '使役受身形', en: 'Causative-passive' },
    volitional: { ja: '意向形', en: 'Volitional ("let\'s")' },
    ba: { ja: 'ば形', en: 'Conditional (ba)' },
    tara: { ja: 'たら形', en: 'Conditional (tara)' },
    imperative: { ja: '命令形', en: 'Imperative' },
    // adjective-specific
    kunai: { ja: 'ない形', en: 'Negative' },
    katta: { ja: '過去形', en: 'Past' },
    kunakatta: { ja: '過去否定形', en: 'Past negative' },
    kute: { ja: 'て形', en: 'Te-form' },
    adverbial: { ja: '副詞形', en: 'Adverbial' },
    keba: { ja: 'ば形', en: 'Conditional (ba)' },
    desu: { ja: 'です形', en: 'Polite (desu)' },
    // na-adjective copula forms
    da: { ja: 'だ形', en: 'Plain (da)' },
    janai: { ja: 'じゃない形', en: 'Negative' },
    datta: { ja: 'だった形', en: 'Past' },
    deshita: { ja: 'でした形', en: 'Polite past' },
    janakatta: { ja: 'じゃなかった形', en: 'Past negative' },
    de: { ja: 'で形', en: 'Te-form (linking)' },
    ni: { ja: 'に形', en: 'Adverbial' },
  };

  function form(id, kana, kanji) {
    return { id, ja: FORM_LABELS[id].ja, en: FORM_LABELS[id].en, kana, kanji: kanji || null };
  }

  // A conjugation class is a fixed drop-length off the dictionary form plus
  // a set of suffixes; `stemmer(reading, kanji)` returns [kanaStem, kanjiStem]
  // (kanjiStem null if there's no kanji form), and each entry in `suffixes`
  // is [formId, suffix] or [formId, kanaSuffix, kanjiSuffix] when they differ
  // (only vk/vs need the latter, since the stem itself changes irregularly).
  function buildForms(reading, kanji, dictForm, kanaStem, kanjiStem, suffixes) {
    const out = [form('dict', dictForm.kana, dictForm.kanji)];
    for (const [id, kanaSuffix, kanjiSuffix] of suffixes) {
      out.push(form(
        id,
        kanaStem + kanaSuffix,
        kanjiStem !== null ? kanjiStem + (kanjiSuffix !== undefined ? kanjiSuffix : kanaSuffix) : null,
      ));
    }
    return out;
  }

  function conjugateGodan(reading, kanji, row, teTaOverride) {
    const r = ROW[row];
    const teTa = teTaOverride || r;
    const kanaStem = dropTail(reading, 1);
    const kanjiStem = kanji ? dropTail(kanji, 1) : null;
    return buildForms(reading, kanji, { kana: reading, kanji }, kanaStem, kanjiStem, [
      ['masu', r.i + 'ます'], ['masen', r.i + 'ません'], ['mashita', r.i + 'ました'],
      ['masenDeshita', r.i + 'ませんでした'], ['nai', r.a + 'ない'], ['ta', teTa.ta],
      ['nakatta', r.a + 'なかった'], ['te', teTa.te], ['potential', r.e + 'る'],
      ['passive', r.a + 'れる'], ['causative', r.a + 'せる'], ['causativePassive', r.a + 'せられる'],
      ['volitional', r.o + 'う'], ['ba', r.e + 'ば'], ['tara', teTa.ta + 'ら'], ['imperative', r.e],
    ]);
  }

  // v5r-i (irregular -aru honorifics: くださる/いらっしゃる/おっしゃる/なさる/ござる):
  // masu-stem and imperative use い instead of り; everything else regular godan る-row.
  function conjugateGodanRI(reading, kanji) {
    const forms = conjugateGodan(reading, kanji, 'る');
    const kanaStem = dropTail(reading, 1);
    const kanjiStem = kanji ? dropTail(kanji, 1) : null;
    const overrides = buildForms(reading, kanji, { kana: reading, kanji }, kanaStem + 'い', kanjiStem !== null ? kanjiStem + 'い' : null, [
      ['masu', 'ます'], ['masen', 'ません'], ['mashita', 'ました'], ['masenDeshita', 'ませんでした'],
    ]);
    const imperative = form('imperative', kanaStem + 'い', kanjiStem !== null ? kanjiStem + 'い' : null);
    const byId = Object.fromEntries([...overrides, imperative].map((f) => [f.id, f]));
    return forms.map((f) => byId[f.id] || f);
  }

  function conjugateIchidan(reading, kanji) {
    const kanaStem = dropTail(reading, 1);
    const kanjiStem = kanji ? dropTail(kanji, 1) : null;
    return buildForms(reading, kanji, { kana: reading, kanji }, kanaStem, kanjiStem, [
      ['masu', 'ます'], ['masen', 'ません'], ['mashita', 'ました'], ['masenDeshita', 'ませんでした'],
      ['nai', 'ない'], ['ta', 'た'], ['nakatta', 'なかった'], ['te', 'て'],
      ['potential', 'られる'], ['passive', 'られる'], ['causative', 'させる'],
      ['causativePassive', 'させられる'], ['volitional', 'よう'], ['ba', 'れば'],
      ['tara', 'たら'], ['imperative', 'ろ'],
    ]);
  }

  // vk: 来る (kuru) and compounds ending in it (持ってくる, etc). Fully
  // irregular -- the stem vowel itself changes per form (来ない=こない,
  // 来ます=きます). The kana stem drops both trailing morae (くる); the kanji
  // stem drops only る, because 来 itself stands for the varying こ/き/く
  // sound -- so every kanji suffix is its kana counterpart with that leading
  // phonetic character stripped (来+ない, not 来+こない).
  function conjugateKuru(reading, kanji) {
    if (!reading.endsWith('くる')) return null;
    const kanaStem = dropTail(reading, 2);
    const hasKanji = kanji && kanji.endsWith('来る');
    const kanjiStem = hasKanji ? dropTail(kanji, 1) : null;
    const strip1 = (s) => s.slice(1);
    return buildForms(reading, kanji, { kana: reading, kanji }, kanaStem, kanjiStem, [
      ['masu', 'きます', strip1('きます')], ['masen', 'きません', strip1('きません')],
      ['mashita', 'きました', strip1('きました')], ['masenDeshita', 'きませんでした', strip1('きませんでした')],
      ['nai', 'こない', strip1('こない')], ['ta', 'きた', strip1('きた')],
      ['nakatta', 'こなかった', strip1('こなかった')], ['te', 'きて', strip1('きて')],
      ['potential', 'こられる', strip1('こられる')], ['passive', 'こられる', strip1('こられる')],
      ['causative', 'こさせる', strip1('こさせる')], ['causativePassive', 'こさせられる', strip1('こさせられる')],
      ['volitional', 'こよう', strip1('こよう')], ['ba', 'くれば', strip1('くれば')],
      ['tara', 'きたら', strip1('きたら')], ['imperative', 'こい', strip1('こい')],
    ]);
  }

  // vs/vs-s/vs-i: する verbs, incl. noun+する compounds (勉強する). Potential
  // of plain する is irregular できる (not される, which is passive).
  function conjugateSuru(reading, kanji) {
    if (!reading.endsWith('する')) return null;
    const kanaStem = dropTail(reading, 2);
    const kanjiStem = kanji ? (kanji.endsWith('する') ? dropTail(kanji, 2) : kanji) : null;
    return buildForms(reading, kanji, { kana: reading, kanji }, kanaStem, kanjiStem, [
      ['masu', 'します'], ['masen', 'しません'], ['mashita', 'しました'], ['masenDeshita', 'しませんでした'],
      ['nai', 'しない'], ['ta', 'した'], ['nakatta', 'しなかった'], ['te', 'して'],
      ['potential', 'できる'], ['passive', 'される'], ['causative', 'させる'],
      ['causativePassive', 'させられる'], ['volitional', 'しよう'], ['ba', 'すれば'],
      ['tara', 'したら'], ['imperative', 'しろ'],
    ]);
  }

  function conjugateAdjI(reading, kanji, isIrregularII) {
    // いい/よい: いい only exists as the dictionary form; every other form
    // conjugates off よい's stem (よくない, not いくない). The kanji form (if
    // any) is almost always 良い either way, so its stem drops the same 1
    // trailing character regardless of which reading variant was typed.
    const kanaStem = isIrregularII ? 'よ' : dropTail(reading, 1);
    const kanjiStem = kanji ? dropTail(kanji, 1) : null;
    const forms = buildForms(reading, kanji, { kana: reading, kanji }, kanaStem, kanjiStem, [
      ['kunai', 'くない'], ['katta', 'かった'], ['kunakatta', 'くなかった'],
      ['kute', 'くて'], ['adverbial', 'く'], ['keba', 'ければ'],
    ]);
    forms.push(form('desu', reading + 'です', kanji ? kanji + 'です' : null));
    return forms;
  }

  function conjugateAdjNa(reading, kanji) {
    return buildForms(reading, kanji, { kana: reading, kanji }, reading, kanji || null, [
      ['da', 'だ'], ['desu', 'です'], ['janai', 'じゃない'], ['datta', 'だった'],
      ['deshita', 'でした'], ['janakatta', 'じゃなかった'], ['de', 'で'], ['ni', 'に'],
    ]);
  }

  // Pick the conjugation class from a JMdict `pos` tag array. Order matters:
  // check the more specific irregular tags before the generic row tags.
  function conjugate(reading, kanji, pos) {
    if (!reading || !Array.isArray(pos)) return null;
    const has = (tag) => pos.includes(tag);

    if (has('vk')) return conjugateKuru(reading, kanji);
    if (has('vs') || has('vs-s') || has('vs-i')) return conjugateSuru(reading, kanji);
    if (has('v1')) return conjugateIchidan(reading, kanji);
    if (has('v5r-i') || has('v5aru')) return conjugateGodanRI(reading, kanji);
    if (has('v5k-s')) return conjugateGodan(reading, kanji, 'く', IKU_YUKU_TE_TA);
    if (has('v5k')) return conjugateGodan(reading, kanji, 'く');
    if (has('v5g')) return conjugateGodan(reading, kanji, 'ぐ');
    if (has('v5s')) return conjugateGodan(reading, kanji, 'す');
    if (has('v5t')) return conjugateGodan(reading, kanji, 'つ');
    if (has('v5n')) return conjugateGodan(reading, kanji, 'ぬ');
    if (has('v5b')) return conjugateGodan(reading, kanji, 'ぶ');
    if (has('v5m')) return conjugateGodan(reading, kanji, 'む');
    if (has('v5r')) return conjugateGodan(reading, kanji, 'る');
    if (has('v5u-s') || has('v5u')) return conjugateGodan(reading, kanji, 'う');

    if (has('adj-ix')) return conjugateAdjI(reading, kanji, true);
    if (has('adj-i')) return conjugateAdjI(reading, kanji, false);
    if (has('adj-na')) return conjugateAdjNa(reading, kanji);

    return null; // archaic (v2*/v4*), vz/vr/vn/v-unspec, adj-shiku/nari/ku/pn/f/no/t: not attempted
  }

  return { conjugate, FORM_LABELS };
});
