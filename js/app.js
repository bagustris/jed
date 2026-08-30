// Main orchestrator: router, view rendering, and event wiring. Depends on
// every other js/ module being loaded first (see index.html script order).
(function () {
  'use strict';

  const notepad = Notepad.create();
  const viewHistory = ViewHistory.create();
  const settings = SettingsManager.create();

  let kanjiDataCache = null;
  async function getKanjiData() {
    if (!kanjiDataCache) kanjiDataCache = await DataStore.kanjiData();
    return kanjiDataCache;
  }

  const POS_LABELS = {
    n: 'noun', 'n-suf': 'suffix noun', 'n-pref': 'prefix noun', pn: 'pronoun',
    vt: 'transitive', vi: 'intransitive', vs: 'suru verb', 'vs-i': 'suru verb', 'vs-s': 'suru verb',
    v1: 'ichidan verb', 'v1-s': 'ichidan verb', vk: 'kuru verb',
    v5b: 'godan verb', v5g: 'godan verb', v5k: 'godan verb', 'v5k-s': 'godan verb', v5m: 'godan verb',
    v5n: 'godan verb', v5r: 'godan verb', 'v5r-i': 'godan verb', v5s: 'godan verb', v5t: 'godan verb',
    v5u: 'godan verb', 'v5u-s': 'godan verb', v5aru: 'godan verb',
    'adj-i': 'i-adjective', 'adj-ix': 'i-adjective (ii/yoi)', 'adj-na': 'na-adjective',
    'adj-no': 'no-adjective', 'adj-pn': 'pre-noun adjectival', 'adj-t': 'taru-adjective', 'adj-f': 'prenominal',
    adv: 'adverb', 'adv-to': 'adverb (to)', conj: 'conjunction', ctr: 'counter', exp: 'expression',
    int: 'interjection', pref: 'prefix', suf: 'suffix', prt: 'particle', num: 'numeric', cop: 'copula',
    'aux-v': 'auxiliary verb', 'aux-adj': 'auxiliary adjective', aux: 'auxiliary', unc: 'unclassified',
  };
  function posLabel(code) { return POS_LABELS[code] || code; }

  // --- toast ---
  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 1800);
  }

  function copyText(text, label) {
    navigator.clipboard.writeText(text)
      .then(() => toast(`${label}をコピーしました`))
      .catch(() => toast('コピーできませんでした'));
  }

  // Sentence playback is an explicit, best-effort aid. It is deliberately
  // separate from search and dictionary data, so the app still works fully
  // when a browser does not provide speech synthesis.
  function canSpeakJapanese() {
    return typeof window !== 'undefined' && !!window.speechSynthesis;
  }
  function speakJapanese(text) {
    if (!text || !canSpeakJapanese()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    window.speechSynthesis.speak(utterance);
  }

  // --- theme ---
  function applyTheme() {
    const { theme } = settings.get();
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('#setting-theme .segmented-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.value === theme);
    });
  }

  // --- router ---
  const views = ['search', 'entry', 'kanji', 'radicals', 'notepad', 'history'];
  let pendingRadicalChar = null;

  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const parts = h.split('/').filter(Boolean);
    if (parts.length === 0) return { view: 'search' };
    if (parts[0] === 'entry' && parts.length === 3) return { view: 'entry', shard: decodeURIComponent(parts[1]), seq: decodeURIComponent(parts[2]) };
    if (parts[0] === 'kanji' && parts.length === 2) return { view: 'kanji', char: decodeURIComponent(parts[1]) };
    if (views.includes(parts[0])) return { view: parts[0] };
    return { view: 'search' };
  }

  function navigateEntry(shard, seq) { location.hash = `#/entry/${encodeURIComponent(shard)}/${encodeURIComponent(seq)}`; }
  function navigateKanji(char) { location.hash = `#/kanji/${encodeURIComponent(char)}`; }

  async function route() {
    const r = parseHash();
    for (const v of views) {
      document.getElementById(`view-${v}`).classList.toggle('hidden', v !== r.view);
    }
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === r.view));

    if (r.view === 'entry') await renderEntryView(r.shard, r.seq);
    else if (r.view === 'kanji') await renderKanjiView(r.char);
    else if (r.view === 'radicals') await renderRadicalsView();
    else if (r.view === 'notepad') renderNotepadView();
    else if (r.view === 'history') renderHistoryView();
  }

  window.addEventListener('hashchange', route);

  // ============================= Search view =============================

  const searchInput = document.getElementById('search-input');
  const searchPreview = document.getElementById('search-preview');
  const searchResults = document.getElementById('search-results');
  const searchStatus = document.getElementById('search-status');

  function wordEntryPreview(entry) {
    const kanji = entry.k[0] ? entry.k[0].t : null;
    const reading = entry.r[0] ? entry.r[0].t : '';
    const gloss = entry.s[0] ? entry.s[0].gloss.join('; ') : '';
    const common = entry.k.some((k) => k.c) || entry.r.some((r) => r.c);
    return { kanji, reading, gloss, common, pos: entry.s[0] ? entry.s[0].pos : [] };
  }

  // Furigana over the kanji portion of a word only -- strips the longest
  // common trailing run between the kanji form and its reading (the
  // okurigana, e.g. べる in 食べる/たべる) since that portion is already
  // kana and needs no annotation, then wraps whatever kanji remains in a
  // single <ruby> with the remaining reading as its <rt>. Words with no
  // shared trailing kana (pure-kanji compounds like 給食) just get the
  // whole word ruby'd as one block.
  function wordFurigana(kanji, reading) {
    let suffixLen = 0;
    while (
      suffixLen < kanji.length && suffixLen < reading.length &&
      kanji[kanji.length - 1 - suffixLen] === reading[reading.length - 1 - suffixLen]
    ) suffixLen++;
    const kanjiHead = suffixLen ? kanji.slice(0, -suffixLen) : kanji;
    const readingHead = suffixLen ? reading.slice(0, -suffixLen) : reading;
    const tail = suffixLen ? kanji.slice(-suffixLen) : '';
    if (!kanjiHead) return escapeHtml(kanji); // fully kana already (shouldn't normally reach here)
    return `<ruby>${escapeHtml(kanjiHead)}<rt>${escapeHtml(readingHead)}</rt></ruby>${escapeHtml(tail)}`;
  }

  function renderResultCard({ seq, shard, kanji, reading, gloss, common, pos, sources }, onClick, opts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'result-card';
    const posStr = pos && pos.length ? `<span class="result-pos">${posLabel(pos[0])}</span>` : '';
    // Only flag results that surfaced *purely* via the English gloss index --
    // if a result also matched on the Japanese reading there's nothing
    // surprising about it showing up, so no badge is needed.
    const sourceBadge = (sources && sources.length === 1 && sources[0] === 'en')
      ? '<span class="result-source-badge">EN</span>' : '';
    const headword = (opts && opts.furigana && kanji)
      ? `<span class="kanji-form furigana-headword">${wordFurigana(kanji, reading)}</span>`
      : (kanji
        ? `<span class="kanji-form">${escapeHtml(kanji)}</span><span class="reading-form">${escapeHtml(reading)}</span>`
        : `<span class="kanji-form">${escapeHtml(reading)}</span>`);
    btn.innerHTML = `
      <div class="result-headword">
        ${common ? '<span class="result-common-star">&#9733;</span>' : ''}
        ${headword}
        ${sourceBadge}
      </div>
      <div class="result-gloss">${posStr}${escapeHtml(gloss)}</div>
    `;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let searchSeq = 0;
  let searchTimer = null;

  function runSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(doSearch, 150);
  }

  async function doSearch() {
    const raw = searchInput.value.trim();
    searchPreview.textContent = '';
    searchResults.innerHTML = '';
    searchStatus.textContent = '';
    if (!raw) return;

    const mySeq = ++searchSeq;
    const settingsNow = settings.get();
    // Latin-letter input is ambiguous between romaji and an English word;
    // kana/kanji input is unambiguously Japanese, so only the Latin case
    // needs to search both directions.
    const looksLatin = /^[a-zA-Z']+$/.test(raw);

    let jaQuery = raw;
    let jaHits, enHits = [];
    try {
      if (looksLatin && settingsNow.romajiInput) {
        const table = await KanaConvert.load();
        if (mySeq !== searchSeq) return;
        jaQuery = KanaConvert.toHiragana(raw, table);
      }
      searchPreview.textContent = jaQuery !== raw ? jaQuery : '';
      searchStatus.textContent = '検索中... Searching...';

      jaHits = await Search.searchJapanese(jaQuery, 40);
      if (mySeq !== searchSeq) return;

      // jaHits came back via the fuzzy typo-tolerance fallback (exact/prefix
      // search found nothing) -- surface the closest matched reading so the
      // correction isn't silent.
      if (jaHits.length && jaHits[0].fuzzy) {
        searchPreview.textContent = `${jaQuery} → ${jaHits[0].entry.r[0].t}?`;
      }

      // Skip the English lookup entirely once Japanese already found what
      // the user was almost certainly after (e.g. "taberu" exact-matching
      // 食べる/たべる) -- saves a fetch/render pass for the common case.
      if (looksLatin && settingsNow.searchBoth && !Search.isExactReadingMatch(jaHits, jaQuery)) {
        enHits = await Search.searchEnglish(raw, 40);
        if (mySeq !== searchSeq) return;
      }
    } catch (e) {
      // A stale request that lost the race (a newer doSearch() already ran
      // and updated the UI) must not clobber it with an error message.
      if (mySeq !== searchSeq) return;
      searchStatus.textContent = '検索エラー Search failed';
      return;
    }

    // Merge both hit lists, deduping by shard+seq while tracking which
    // path(s) surfaced each entry (for the "EN" source badge). Japanese
    // hits already carry a full entry; English hits carry only a preview,
    // so those still need a fetch to get a gloss.
    const merged = Search.mergeResults(jaHits, enHits);

    let resolved;
    try {
      resolved = await Promise.all(merged.map(async (r) => {
        const entry = r.entry || await Search.loadEntry(r.seq, r.shard);
        return entry ? { ...r, entry } : null;
      }));
    } catch (e) {
      if (mySeq !== searchSeq) return;
      searchStatus.textContent = '検索エラー Search failed';
      return;
    }
    if (mySeq !== searchSeq) return;
    resolved = resolved.filter(Boolean);

    const ranked = Search.rankMergedResults(resolved, jaQuery);
    const results = ranked.map((r) => ({ seq: r.seq, shard: r.shard, sources: r.sources, ...wordEntryPreview(r.entry) }));

    searchStatus.textContent = results.length ? `${results.length}件 results` : '';
    if (!results.length) {
      searchResults.innerHTML = '<div class="empty-state">見つかりませんでした<span>No matches found</span></div>';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const r of results) {
      frag.appendChild(renderResultCard(r, () => navigateEntry(r.shard, r.seq)));
    }
    searchResults.innerHTML = '';
    searchResults.appendChild(frag);
  }

  searchInput.addEventListener('input', runSearch);

  // ============================= Entry detail =============================

  async function renderEntryView(shard, seq) {
    const container = document.getElementById('entry-detail');
    container.innerHTML = '<p class="empty-state">読み込み中... Loading...</p>';
    let entry;
    try {
      entry = await Search.loadEntry(seq, shard);
    } catch (e) {
      container.innerHTML = '<p class="empty-state">読み込みに失敗しました<span>Couldn\'t load this entry &mdash; check your connection and try again</span></p>';
      return;
    }
    if (!entry) {
      container.innerHTML = '<p class="empty-state">見つかりませんでした<span>Entry not found</span></p>';
      return;
    }

    const primaryKanji = entry.k[0] ? entry.k[0].t : null;
    const primaryReading = entry.r[0] ? entry.r[0].t : '';
    viewHistory.record({
      kind: 'word', seq, shard,
      kanji: primaryKanji, reading: primaryReading,
      gloss: entry.s[0] ? entry.s[0].gloss.join('; ') : '',
    });

    const kanjiHtml = entry.k.length
      ? entry.k.map((k, i) => `<span class="kanji-form" data-char-group="${i === 0 ? 'primary' : 'alt'}">${[...k.t].map((c) => isKanjiChar(c) ? `<span class="k-char" data-char="${escapeHtml(c)}" role="button" tabindex="0" aria-label="${escapeHtml(c)} kanji detail">${escapeHtml(c)}</span>` : escapeHtml(c)).join('')}</span>`).join('<span class="entry-alt-forms">, </span>')
      : '';
    const readingsHtml = entry.r.map((r) => escapeHtml(r.t)).join('、');

    const sensesHtml = entry.s.map((s) => `
      <li class="sense-item">
        ${s.pos.map((p) => `<span class="sense-tags">${posLabel(p)}</span>`).join('')}
        ${s.misc.map((m) => `<span class="sense-tags">${escapeHtml(m)}</span>`).join('')}
        <span class="sense-gloss">${escapeHtml(s.gloss.join('; '))}</span>
      </li>
    `).join('');

    const saved = notepad.isSaved(seq, shard);
    const gloss = entry.s[0] ? entry.s[0].gloss.join('; ') : '';

    container.innerHTML = `
      <div class="entry-header">
        <div>
          <div class="entry-headwords">${kanjiHtml || `<span class="kanji-form">${escapeHtml(primaryReading)}</span>`}</div>
          ${entry.k.length ? `<div class="entry-readings">${readingsHtml}</div>` : ''}
        </div>
        <div class="entry-actions">
          <button type="button" id="btn-star" class="${saved ? 'active' : ''}" aria-label="Save to notepad">${saved ? '&#9733;' : '&#9734;'}</button>
        </div>
      </div>
      <div class="copy-row">
        ${primaryKanji ? `<button type="button" data-copy="kanji">漢字コピー Copy kanji</button>` : ''}
        <button type="button" data-copy="reading">読みコピー Copy reading</button>
        <button type="button" data-copy="meaning">意味コピー Copy meaning</button>
      </div>
      <ul class="sense-list">${sensesHtml}</ul>
      <div id="tag-editor" class="tag-row"></div>
      <div id="conj-container"></div>
      <div id="entry-sentences-container"></div>
    `;

    container.querySelectorAll('.k-char').forEach((el) => {
      el.addEventListener('click', () => navigateKanji(el.dataset.char));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateKanji(el.dataset.char); }
      });
    });
    container.querySelector('[data-copy="kanji"]')?.addEventListener('click', () => copyText(primaryKanji, '漢字'));
    container.querySelector('[data-copy="reading"]').addEventListener('click', () => copyText(primaryReading, '読み'));
    container.querySelector('[data-copy="meaning"]').addEventListener('click', () => copyText(gloss, '意味'));

    const starBtn = container.querySelector('#btn-star');
    starBtn.addEventListener('click', () => {
      if (notepad.isSaved(seq, shard)) {
        notepad.remove(seq, shard);
        starBtn.classList.remove('active');
        starBtn.innerHTML = '&#9734;';
        toast('ノートから削除しました');
      } else {
        notepad.save({ seq, shard, kanji: primaryKanji, reading: primaryReading, gloss }, []);
        starBtn.classList.add('active');
        starBtn.innerHTML = '&#9733;';
        toast('ノートに保存しました');
      }
      renderTagEditor(seq, shard);
    });

    renderTagEditor(seq, shard);
    renderConjugation(entry, primaryReading, primaryKanji);
    renderEntrySentences(seq, primaryKanji);
  }

  function isKanjiChar(c) {
    // \p{Script=Han} (matching js/search.js's containsKanji) so that
    // supplementary-plane kanji like 𠮟 (U+20B9F, the headword of 𠮟る) are
    // still recognized as clickable/kanji-detail-eligible characters.
    return /\p{Script=Han}/u.test(c);
  }

  // True if `word` occurs in `jp` with a kanji "word boundary" on both
  // sides -- not embedded inside a longer kanji run (e.g. 牡丹 "peony"
  // inside a sentence about 牡丹餅 "botamochi", a different word). Mirrors
  // tools/build_word_sentences.py's has_boundary_match(), used there for
  // the same reason.
  function hasWordBoundaryMatch(word, jp) {
    let start = 0;
    for (;;) {
      const idx = jp.indexOf(word, start);
      if (idx === -1) return false;
      const beforeOk = idx === 0 || !isKanjiChar(jp[idx - 1]);
      const afterIdx = idx + word.length;
      const afterOk = afterIdx >= jp.length || !isKanjiChar(jp[afterIdx]);
      if (beforeOk && afterOk) return true;
      start = idx + 1;
    }
  }

  function renderTagEditor(seq, shard) {
    const el = document.getElementById('tag-editor');
    if (!el) return;
    if (!notepad.isSaved(seq, shard)) { el.innerHTML = ''; return; }
    const record = notepad.list().find((e) => e.seq === seq && e.shard === shard);
    const chips = (record.tags || []).map((t) => `<span class="tag-chip" data-tag="${escapeHtml(t)}">${escapeHtml(t)}<button type="button" data-remove-tag="${escapeHtml(t)}">&times;</button></span>`).join('');
    el.innerHTML = `${chips}<input type="text" class="tag-input" placeholder="+ タグ tag" id="new-tag-input">`;
    el.querySelectorAll('[data-remove-tag]').forEach((b) => {
      b.addEventListener('click', () => { notepad.removeTag(seq, shard, b.dataset.removeTag); renderTagEditor(seq, shard); });
    });
    const input = el.querySelector('#new-tag-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        notepad.addTag(seq, shard, input.value.trim());
        renderTagEditor(seq, shard);
      }
    });
  }

  function renderConjugation(entry, reading, kanji) {
    const el = document.getElementById('conj-container');
    const allPos = [...new Set(entry.s.flatMap((s) => s.pos))];
    const forms = Conjugator.conjugate(reading, kanji, allPos);
    if (!forms) { el.innerHTML = ''; return; }
    const rows = forms.filter((f) => f.id !== 'dict').map((f) => `
      <tr><td class="conj-label">${f.ja}<br>${f.en}</td><td>${escapeHtml(f.kanji || f.kana)}</td></tr>
    `).join('');
    const openAttr = settings.get().showConjugationByDefault ? ' open' : '';
    el.innerHTML = `
      <details class="conj-section"${openAttr}>
        <summary>活用形を見る Show conjugations</summary>
        <table class="conj-table"><tbody>${rows}</tbody></table>
      </details>
    `;
  }

  // ============================= Kanji detail =============================

  async function renderKanjiView(char) {
    const container = document.getElementById('kanji-detail');
    container.innerHTML = '<p class="empty-state">読み込み中... Loading...</p>';
    let kanjiData;
    try {
      kanjiData = await getKanjiData();
    } catch (e) {
      container.innerHTML = '<p class="empty-state">読み込みに失敗しました<span>Couldn\'t load kanji data &mdash; check your connection and try again</span></p>';
      return;
    }
    const info = kanjiData[char];
    viewHistory.record({ kind: 'kanji', char });

    if (!info) {
      container.innerHTML = `<div class="kanji-header"><span class="kanji-glyph">${escapeHtml(char)}</span></div><p class="empty-state">この文字のデータはありません<span>No KANJIDIC2 data for this character</span></p>`;
      return;
    }

    const stats = [];
    if (info.strokes) stats.push(`${info.strokes}画 strokes`);
    if (info.grade) stats.push(`grade ${info.grade}`);
    if (info.jlpt_old) stats.push(`JLPT N${info.jlpt_old} (old)`);
    if (info.freq) stats.push(`freq #${info.freq}`);
    stats.push(info.jouyo ? '常用 jōyō' : '非常用 non-jōyō');

    const radicalsHtml = (info.radicals || []).map((r) => `<button type="button" class="radical-chip" data-radical="${escapeHtml(r)}">${escapeHtml(r)}</button>`).join('');

    container.innerHTML = `
      <div class="kanji-header">
        <span class="kanji-glyph">${escapeHtml(char)}</span>
        <div class="kanji-meta">
          <div class="kanji-meanings">${escapeHtml((info.meanings || []).join(', '))}</div>
          <div class="kanji-stats">${stats.map((s) => `<span>${escapeHtml(s)}</span>`).join('')}</div>
        </div>
      </div>
      <div class="reading-block">
        <div class="reading-block-label">音読み On'yomi</div>
        <div class="reading-block-value">${escapeHtml((info.readings_on || []).join('、')) || '&mdash;'}</div>
      </div>
      <div class="reading-block">
        <div class="reading-block-label">訓読み Kun'yomi</div>
        <div class="reading-block-value">${escapeHtml((info.readings_kun || []).join('、')) || '&mdash;'}</div>
      </div>
      ${radicalsHtml ? `<div class="reading-block"><div class="reading-block-label">部首 Radicals</div><div class="radical-of">${radicalsHtml}</div></div>` : ''}
      <div id="stroke-order-container"></div>
      <div id="kanji-words-container"></div>
    `;

    container.querySelectorAll('[data-radical]').forEach((b) => {
      b.addEventListener('click', () => { pendingRadicalChar = b.dataset.radical; location.hash = '#/radicals'; });
    });

    renderStrokeOrder(char, info.jouyo);
    renderKanjiWords(char);
  }

  function renderSentenceJp(sentence) {
    if (!Array.isArray(sentence.furigana)) return escapeHtml(sentence.jp);
    return sentence.furigana.map((seg) => (
      seg.r ? `<ruby>${escapeHtml(seg.t)}<rt>${escapeHtml(seg.r)}</rt></ruby>` : escapeHtml(seg.t)
    )).join('');
  }

  // "Words containing this kanji" -- the useful thing to show on a kanji
  // reference page (build vocabulary around the character), as opposed to
  // full sentences, which belong on the word entry page where they show a
  // specific word in context (see renderEntrySentences).
  async function renderKanjiWords(char) {
    const el = document.getElementById('kanji-words-container');
    let allWords;
    try {
      allWords = await DataStore.kanjiWords();
    } catch (e) {
      el.innerHTML = ''; // supplementary section -- fail quietly, don't block the rest of the page
      return;
    }
    const words = allWords[char];
    if (!words || !words.length) { el.innerHTML = ''; return; }

    const frag = document.createDocumentFragment();
    const wrap = document.createElement('div');
    wrap.className = 'reading-block';
    wrap.innerHTML = '<div class="reading-block-label">用例 Example words</div>';
    const list = document.createElement('div');
    list.className = 'results-list';
    for (const w of words) {
      list.appendChild(renderResultCard(
        { kanji: w.k, reading: w.r, gloss: w.g, common: false, pos: [] },
        () => navigateEntry(w.shard, w.seq),
        { furigana: true },
      ));
    }
    wrap.appendChild(list);
    frag.appendChild(wrap);
    el.innerHTML = '';
    el.appendChild(frag);
  }

  // Example sentences for a word entry, shown directly below the
  // conjugation table. Prefer data/word-sentences.json, which is keyed by
  // entry seq and holds sentences tied to this specific word -- either
  // JMdict's own curated example, or (for compound words) a literal
  // whole-word match against Tatoeba's full sentence corpus -- built by
  // tools/build_word_sentences.py, which covers ~16% of multi-kanji
  // compound words. For the rest, fall back to data/kanji-sentences.json,
  // which is keyed by kanji CHARACTER instead of by word (broadcast to
  // every kanji a sentence contains, for the kanji detail page) and
  // filtered here (hasWordBoundaryMatch) to sentences that contain the
  // whole word without it being embedded in a longer one -- without that
  // filter, the 履歴書 "resume" page would show sentences about 履く "to
  // wear" just because both contain 履. That word-boundary filter only
  // works for multi-kanji compounds with no okurigana (nouns like 履歴書,
  // 腕時計); words with a kana tail
  // (conjugating verbs/adjectives) can't be matched this way, since the
  // sentence may use a different inflected form, so the section is simply
  // omitted for those when there's no word-level example.
  async function renderEntrySentences(seq, primaryKanji) {
    const el = document.getElementById('entry-sentences-container');
    if (!el) return;

    let sentences;
    try {
      const allWordSentences = await DataStore.wordSentences();
      sentences = allWordSentences[seq] || [];
      if (!sentences.length && primaryKanji && primaryKanji.length > 1
          && [...primaryKanji].every(isKanjiChar)) {
        const firstKanjiChar = [...primaryKanji][0];
        const allKanjiSentences = await DataStore.kanjiSentences();
        const candidates = allKanjiSentences[firstKanjiChar] || [];
        sentences = candidates.filter((s) => hasWordBoundaryMatch(primaryKanji, s.jp));
      }
    } catch (e) {
      el.innerHTML = ''; // supplementary section -- fail quietly, don't block the rest of the page
      return;
    }
    if (!sentences.length) { el.innerHTML = ''; return; }

    const furiganaOff = !settings.get().furiganaEnabled;
    const cards = sentences.map((s) => `
      <div class="sentence-card">
        <button type="button" class="sentence-jp${furiganaOff ? ' furigana-off' : ''}" aria-label="例文を読み上げる Play example sentence">${renderSentenceJp(s)}</button>
        <div class="sentence-en">${escapeHtml(s.en)}</div>
      </div>
    `).join('');
    el.innerHTML = `
      <div class="reading-block">
        <div class="reading-block-label">例文 Example sentences</div>
        <div class="sentence-list">${cards}</div>
      </div>
    `;
    if (canSpeakJapanese()) {
      el.querySelectorAll('.sentence-jp').forEach((sentence, index) => {
        sentence.classList.add('is-playable');
        sentence.addEventListener('click', () => speakJapanese(sentences[index]?.jp));
      });
    }
  }

  async function renderStrokeOrder(char, jouyo) {
    const el = document.getElementById('stroke-order-container');
    if (!jouyo) {
      el.innerHTML = '<p class="conj-note">筆順は常用漢字のみ利用できます。<span>Stroke order is available for jōyō kanji only.</span></p>';
      return;
    }
    const svgText = await DataStore.kanjivgSvg(char);
    if (!svgText) {
      el.innerHTML = '<p class="conj-note">筆順データが見つかりませんでした。<span>Stroke order data not found.</span></p>';
      return;
    }
    // The fetched file is a full XML document (XML declaration, a licence
    // comment, and an internal DOCTYPE subset defining the kvg: attributes)
    // ahead of the <svg> element itself. innerHTML only understands HTML
    // syntax, not that XML prolog -- inserting it whole leaves stray
    // fragments (e.g. a bare "]>" closing the DOCTYPE's internal subset)
    // as visible text nodes. Keep only the <svg>...</svg> element.
    const svgMatch = svgText.match(/<svg[\s\S]*<\/svg>/);
    const svgOnly = svgMatch ? svgMatch[0] : svgText;
    el.innerHTML = `
      <div class="stroke-order-box show-numbers-off">
        ${svgOnly.replace(/stroke:#000000/g, 'stroke:currentColor')}
        <div class="stroke-order-controls">
          <button type="button" id="btn-replay-stroke">&#8635; もう一度 Replay</button>
          <button type="button" id="btn-toggle-numbers">画数 Numbers</button>
        </div>
      </div>
    `;
    const svg = el.querySelector('svg');
    svg.style.color = 'var(--accent)';
    svg.style.cursor = 'pointer';
    animateStrokeOrder(svg);
    document.getElementById('btn-replay-stroke').addEventListener('click', () => animateStrokeOrder(svg));
    svg.addEventListener('click', () => animateStrokeOrder(svg));
    document.getElementById('btn-toggle-numbers').addEventListener('click', () => {
      el.querySelector('.stroke-order-box').classList.toggle('show-numbers-off');
    });
  }

  function animateStrokeOrder(svg) {
    const paths = svg.querySelectorAll('[id^="kvg:StrokePaths"] path');
    paths.forEach((path, i) => {
      const len = path.getTotalLength();
      path.style.transition = 'none';
      path.style.strokeDasharray = String(len);
      path.style.strokeDashoffset = String(len);
      // force reflow so the transition below animates from this state
      void path.getBoundingClientRect();
      path.style.transition = 'stroke-dashoffset 0.7s ease-in-out';
      path.style.transitionDelay = `${i * 0.6}s`;
      requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; });
    });
  }

  // ============================= Radicals view =============================

  let selectedRadicals = [];

  async function renderRadicalsView() {
    const radicals = await DataStore.radicalsData();
    const picker = document.getElementById('radical-picker');
    const groups = RadicalPicker.groupByStroke(radicals);

    if (pendingRadicalChar) {
      if (!selectedRadicals.includes(pendingRadicalChar)) selectedRadicals.push(pendingRadicalChar);
      pendingRadicalChar = null;
    }

    const frag = document.createDocumentFragment();
    for (const [stroke, group] of groups) {
      const section = document.createElement('div');
      section.className = 'radical-stroke-group';
      section.innerHTML = `<h4>${stroke}画</h4>`;
      const row = document.createElement('div');
      row.className = 'radical-row';
      for (const r of group) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'radical-btn' + (selectedRadicals.includes(r.char) ? ' selected' : '');
        btn.textContent = r.char;
        btn.title = `${r.name} (${(r.readings || []).join(', ')})`;
        btn.addEventListener('click', () => toggleRadical(r.char, radicals));
        row.appendChild(btn);
      }
      section.appendChild(row);
      frag.appendChild(section);
    }
    picker.innerHTML = '';
    picker.appendChild(frag);
    renderSelectedRadicals(radicals);
    updateRadicalResults(radicals);
  }

  function toggleRadical(char, radicals) {
    const i = selectedRadicals.indexOf(char);
    if (i >= 0) selectedRadicals.splice(i, 1);
    else selectedRadicals.push(char);
    document.querySelectorAll('#radical-picker .radical-btn').forEach((b) => {
      b.classList.toggle('selected', selectedRadicals.includes(b.textContent));
    });
    renderSelectedRadicals(radicals);
    updateRadicalResults(radicals);
  }

  function renderSelectedRadicals(radicals) {
    const el = document.getElementById('radical-selected');
    if (!selectedRadicals.length) { el.innerHTML = '<span class="conj-note">部首が選択されていません Select radicals below</span>'; return; }
    el.innerHTML = selectedRadicals.map((c) => `<button type="button" class="radical-btn selected" data-remove="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('');
    el.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => toggleRadical(b.dataset.remove, radicals)));
  }

  function updateRadicalResults(radicals) {
    const heading = document.getElementById('radical-results-heading');
    const results = document.getElementById('radical-results');
    const matches = RadicalPicker.intersectKanji(radicals, selectedRadicals);
    heading.classList.toggle('hidden', matches.length === 0);
    results.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const k of matches.slice(0, 300)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = k;
      btn.addEventListener('click', () => navigateKanji(k));
      frag.appendChild(btn);
    }
    results.appendChild(frag);
  }

  // ============================= Notepad view =============================

  let activeTagFilter = null;

  function renderNotepadView() {
    const tags = notepad.allTags();
    const tagEl = document.getElementById('notepad-tags');
    tagEl.innerHTML = tags.map((t) => `<button type="button" class="${t === activeTagFilter ? 'active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');
    tagEl.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      activeTagFilter = activeTagFilter === b.dataset.tag ? null : b.dataset.tag;
      renderNotepadView();
    }));

    const list = document.getElementById('notepad-list');
    const entries = activeTagFilter ? notepad.byTag(activeTagFilter) : notepad.list();
    if (!entries.length) {
      list.innerHTML = '<div class="empty-state">保存された単語はありません<span>No saved words yet &mdash; tap the star on any entry</span></div>';
      return;
    }
    list.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const e of entries) {
      frag.appendChild(renderResultCard(
        { kanji: e.kanji, reading: e.reading, gloss: e.gloss, common: false, pos: [] },
        () => navigateEntry(e.shard, e.seq),
      ));
    }
    list.appendChild(frag);
  }

  // Plain-text export -- the spiritual equivalent of JED's own "export tag
  // to anki file" feature (changelog v0.2), simplified to a format that
  // needs no target app: one word per line, kanji/reading/gloss/tags.
  function exportNotepadText() {
    const entries = notepad.list();
    const lines = [
      `JED Notepad -- ${entries.length} word${entries.length === 1 ? '' : 's'}`,
      '',
      ...entries.map((e) => {
        const head = e.kanji ? `${e.kanji} (${e.reading})` : e.reading;
        const tagStr = e.tags && e.tags.length ? `  [${e.tags.join(', ')}]` : '';
        return `${head} - ${e.gloss}${tagStr}`;
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jed-notepad.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  document.getElementById('btn-export-notepad').addEventListener('click', () => {
    if (!notepad.list().length) { toast('ノートは空です'); return; }
    exportNotepadText();
  });

  // ============================= History view =============================

  function renderHistoryView() {
    const list = document.getElementById('history-list');
    const entries = viewHistory.list();
    if (!entries.length) {
      list.innerHTML = '<div class="empty-state">履歴はありません<span>Nothing viewed yet</span></div>';
      return;
    }
    list.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const e of entries) {
      if (e.kind === 'kanji') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'result-card';
        btn.innerHTML = `<div class="result-headword"><span class="kanji-form">${escapeHtml(e.char)}</span></div>`;
        btn.addEventListener('click', () => navigateKanji(e.char));
        frag.appendChild(btn);
      } else {
        frag.appendChild(renderResultCard(
          { kanji: e.kanji, reading: e.reading, gloss: e.gloss, common: false, pos: [] },
          () => navigateEntry(e.shard, e.seq),
        ));
      }
    }
    list.appendChild(frag);
  }

  document.getElementById('btn-clear-history').addEventListener('click', () => {
    viewHistory.clear();
    renderHistoryView();
  });

  // ============================= Settings =============================

  const settingsOverlay = document.getElementById('settings-overlay');
  document.getElementById('btn-settings').addEventListener('click', () => {
    const s = settings.get();
    document.getElementById('setting-romaji-input').checked = s.romajiInput;
    document.getElementById('setting-search-both').checked = s.searchBoth;
    document.getElementById('setting-show-conjugation').checked = s.showConjugationByDefault;
    document.getElementById('setting-furigana').checked = s.furiganaEnabled;
    settingsOverlay.classList.remove('hidden');
  });
  document.getElementById('btn-settings-close').addEventListener('click', () => settingsOverlay.classList.add('hidden'));
  document.getElementById('btn-home-title').addEventListener('click', () => { location.hash = '#/search'; });
  settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden'); });

  document.getElementById('setting-romaji-input').addEventListener('change', (e) => {
    settings.set({ romajiInput: e.target.checked });
  });
  document.getElementById('setting-search-both').addEventListener('change', (e) => {
    settings.set({ searchBoth: e.target.checked });
    runSearch();
  });
  document.getElementById('setting-show-conjugation').addEventListener('change', (e) => {
    settings.set({ showConjugationByDefault: e.target.checked });
  });
  document.getElementById('setting-furigana').addEventListener('change', (e) => {
    settings.set({ furiganaEnabled: e.target.checked });
    document.querySelectorAll('.sentence-jp').forEach((el) => el.classList.toggle('furigana-off', !e.target.checked));
  });

  document.querySelectorAll('#setting-theme .segmented-btn').forEach((b) => {
    b.addEventListener('click', () => { settings.set({ theme: b.dataset.value }); applyTheme(); });
  });

  // --- nav wiring ---
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.addEventListener('click', () => { location.hash = `#/${b.dataset.view}`; });
  });

  // --- back button wiring (static elements in index.html, not re-rendered
  // per view, so a single listener at init covers both #view-entry and
  // #view-kanji's back buttons for the app's lifetime) ---
  document.querySelectorAll('[data-back]').forEach((b) => {
    b.addEventListener('click', () => { history.back(); });
  });

  // --- install prompt ---
  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById('btn-install');
    btn.classList.remove('hidden');
    btn.addEventListener('click', async () => {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      btn.classList.add('hidden');
    }, { once: true });
  });

  // --- service worker ---
  // `updateViaCache: 'none'` stops the browser from ever satisfying sw.js
  // (or anything it imports) from its plain HTTP cache -- without it, a
  // dev server like `python3 -m http.server` sends no explicit Cache-Control
  // header, so the browser's heuristic caching can serve a stale sw.js on
  // reload and never notice CACHE_VERSION changed, even after several
  // reloads. The explicit reg.update() call forces an immediate byte-level
  // check on every load rather than waiting on the browser's own timer.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
        reg.update().catch(() => {});
      } catch (e) { /* ignore */ }
    });
  }

  // --- init ---
  applyTheme();
  KanaConvert.load().catch(() => {});
  route();
})();
