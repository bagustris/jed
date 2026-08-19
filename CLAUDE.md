# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

JED is a full Japanese-English dictionary lookup app: plain HTML/CSS/JS, no
framework, no build step, no `package.json`. It's a PWA (installable,
offline-capable via `sw.js`) deployed as a static site to GitHub Pages.

It's an independent recreation of the Android app **JED** (umibouzu,
2010-2011) — see `CREDITS.md` for what that means concretely. The original
APK shipped no dictionary data (it downloaded a SQLite DB from a now-dead
server); this app is built fresh from JMdict, KANJIDIC2, KRADFILE/RADKFILE,
and jōyō-only KanjiVG, with two small tables (radical metadata, romaji↔kana
conversion) ported from the APK's own bundled `.dat` files.

Unlike its sibling apps ([kanji-drill](https://github.com/bagustris/kanji-drill),
[jlpt](https://github.com/bagustris/jlpt), [kotoba](https://github.com/bagustris/kotoba),
[wanikanji](https://github.com/bagustris/wanikanji)), which are all
quiz/SRS trainers, JED is a **lookup dictionary** — search, don't drill.

## Running locally

Data is loaded via `fetch()`, so opening `index.html` directly (`file://`)
will fail to load dictionary data — always serve it:

```bash
python3 -m http.server 8000
```

There is no build, lint, or type-check command. There is a Node-based test
suite for every pure-logic module (no DOM, no build tooling required):

```bash
for f in js/__tests__/*-test.js; do node "$f"; done
```

These test the romaji↔kana converter, the bucket-key functions (against the
*real* generated `data/`, not fixtures), the conjugation engine, notepad/
history localStorage CRUD, the radical intersection logic, and search
ranking. There is deliberately no test for `js/app.js` itself (DOM wiring/
rendering) — verify UI changes by loading the app in a browser.

**Service worker caching**: `sw.js`'s `CORE_ASSETS` list is the app shell
plus two small always-needed data files (`kana-romaji.json`,
`radicals.json`) only. Everything else under `data/` — word shards, search
indices, `kanji.json`, `kanjivg/*.svg` — is fetched on demand and cached
opportunistically by the generic stale-while-revalidate `fetch` handler, not
precached at install time. **Do not add word/index/kanjivg paths to
`CORE_ASSETS`** — that would turn every install into a 130MB+ download. If
you add a new *shell* file (a new `js/*.js` module, say), add it to
`CORE_ASSETS` too, or it won't be available offline.

## Architecture

### Script loading order matters

No module bundler — every file in `index.html` is a plain `<script>` tag
defining an IIFE-scoped global. Each module also supports `require()` in
Node (UMD-style wrapper: `module.exports` in Node, `window.X` in browser),
specifically so the Node test suite can exercise real logic against real
data without a DOM. Load order in `index.html` encodes the dependency graph:

1. `js/kana-convert.js` (`KanaConvert`) — no dependencies.
2. `js/data-loader.js` (`DataStore`) — no dependencies. Owns every `fetch()`
   against `data/`, an in-memory response cache, and the three bucket-key
   functions (`kanaBucket`/`kanjiIndexBucket`/`englishBucket`) that **must
   stay in sync with `tools/build_data.py`** — see that file's own
   "Frontend/build contract" note in `tools/README.md`.
3. `js/conjugation.js` (`Conjugator`) — no dependencies.
4. `js/search.js` (`Search`) — depends on `DataStore`.
5. `js/radicals.js` (`RadicalPicker`) — no dependencies (pure functions over
   an already-loaded `data/radicals.json`).
6. `js/notepad.js` (`Notepad`), `js/history.js` (`ViewHistory`),
   `js/settings.js` (`SettingsManager`) — each a `localStorage` CRUD module
   with its own key (`jed-notepad`, `jed-history`, `jed-settings`),
   deliberately separate so clearing one never touches another.
7. `js/app.js` — the only file with no exported global. Router, view
   rendering, and all DOM event wiring; depends on everything above.

### Data pipeline: JMdict/KANJIDIC2/KRADFILE/RADKFILE/KanjiVG → sharded JSON

`tools/download_sources.py` + `tools/build_data.py` regenerate everything
under `data/` from upstream sources — see `tools/README.md` for the exact
commands and the frontend/build sharding contract, and `CREDITS.md` for what
each source is and its license. In short: word entries are sharded by first
reading-kana into `data/words/<kana>.json`; `data/index/kanji/*.json` and
`data/index/english/*.json` are lookup indices into those shards (needed
because a word's storage key is its *reading*, not its kanji form or its
English gloss); `data/kanji.json` is KANJIDIC2 merged with KRADFILE radical
decomposition; `data/radicals.json` is the APK's radical table merged with
RADKFILE's radical→kanji grouping; `data/kanjivg/*.svg` is jōyō-only stroke
order data.

### Search: three lookup paths converge on the same word-shard storage

`js/search.js`'s `searchJapanese()`/`searchEnglish()` are the entry points.
A query written in kanji goes through the kanji index to find which shard(s)
hold matching entries; a query in kana goes straight to its shard (the shard
key *is* the first reading character); an English query goes through the
English gloss index. All three ultimately resolve to entries inside
`data/words/*.json` — `Search.loadEntry(seq, shard)` is the single place
that fetches a full entry once you know where it lives. Romaji typed into
the Japanese-mode search box is converted to hiragana client-side by
`KanaConvert` (`js/app.js`'s `doSearch()`) before it ever reaches `Search`.

### Conjugation is POS-driven, not suffix-guessed

`js/conjugation.js`'s `conjugate(reading, kanji, posArray)` dispatches on
JMdict's actual part-of-speech tags (`v1`, `v5k`, `adj-i`, `vs`, ...), not by
inspecting the dictionary form's ending — this was a deliberate requirement
(the original JED's changelog cites getting this wrong, and fixing it, as a
real historical bug: "generates conjugation based on edict info, not verb
ending"). Unsupported classes (archaic `v2*`/`v4*` nidan/yodan, `adj-shiku`,
etc.) return `null` rather than a guessed-wrong conjugation — `js/app.js`
just omits the conjugation section in that case. Kanji-form conjugations are
derived by dropping the same number of trailing characters from the kanji
form as from the reading and appending the same suffix — this works because
okurigana always spans whole conjugating morae identically between a word's
kanji and kana forms (see the comment above `buildForms` for the one
exception, `vk`/来る, where the kanji stem instead drops only 1 character
because 来 itself stands for the varying こ/き/く sound).

### Stroke order animation

`js/app.js`'s `animateStrokeOrder()` operates on the real KanjiVG SVG
structure fetched from `data/kanjivg/`: every stroke is a `<path>` inside
`<g id="kvg:StrokePaths_...">`, in stroke order, regardless of nesting depth
for complex characters — so `svg.querySelectorAll('[id^="kvg:StrokePaths"]
path')` always returns strokes in the right order. Each path's
`stroke-dasharray`/`stroke-dashoffset` are set to its `getTotalLength()` and
animated to 0 with a per-stroke `transition-delay`, giving a draw-in-order
effect with no external animation library.
