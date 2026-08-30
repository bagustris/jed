# Changelog

All notable changes to this project will be documented in this file.

Perviously it adheres semver, but now calver (since version 2026.08.24

## [2026.08.24] 

### Changed  
- English searchBoth default to True as fallback to Japanese  

### Added 
- Fuzzy typo tolerance with mechanism below.
- levenshtein(a, b, maxDist) — bounded edit distance.
  - fuzzyPrefixDistance(query, text, maxDist) — edit distance from query to the closest-length prefix of text, so a
    partially-typed word isn't penalized for what hasn't been typed yet.
  - fuzzyTolerance(len) — scales tolerance with query length (0 for ≤2 chars, 1 for 3–4, 2 for 5+) to avoid false
    positives on very short queries.
  - rankWordShardResultsFuzzy(shardObj, queryKana, limit) — scans the shard for readings within tolerance, scored by
    distance/commonness.
  - searchJapanese() now falls back to the fuzzy scan only when the exact/prefix search returns nothing, so normal
    searches pay zero extra cost.

## [1.1.2] - 2026-08-24

### Removed
- Japanese and English buttons in the header were removed. The search is now automatically detected from the typed fonts (hiragana or romaji), and the user can override it in Settings. 

### Fixed
- Duplicate results in kanji search (js/search.js, searchJapanese)  
- Misleading placeholder text (index.html)  

## [1.1.1] - 2026-08-21

### Fixed
- Word entry example sentences no longer show sentences about an unrelated
  word that merely shares a kanji character (e.g. 履歴書 "resume" showing a
  sentence about 履く "to wear," or 腕時計 "wristwatch" showing one about 腕
  "arm"). Sentences JMdict itself attaches to a word's own sense are now
  used first (`data/word-sentences.json`, built by the new
  `tools/build_word_sentences.py`), then a literal whole-word search over
  Tatoeba's full sentence corpus (CC BY 2.0 FR, single collective credit —
  see `CREDITS.md`) for compound words JMdict didn't already cover, raising
  coverage of multi-kanji compound words from ~12% to ~16%; the
  kanji-character-level list is used only as a last-resort fallback, and
  only for sentences that literally contain the whole word.
- fetch_tatoeba_file() (and the pre-existing sibling
  fetch_examples_utf() in build_furigana.py) wrote the decompressed cache file
  directly at its final path. An interrupted download (network blip, disk full,
  Ctrl-C) would leave a truncated file there, and the next run would silently
  trust it forever since it only checked os.path.exists(). Fixed both to write
  to a .tmp path and os.replace() into place atomically — a partial file can
  never be mistaken for a complete one now. 
- Hardened the Tatoeba TSV parsing with bounded maxsplit so a stray tab inside
  sentence text can't crash the build with an unpacking error (cheap, no added
  complexity).

### Removed 
- Removed a redundant word in jp substring scan in add_source_b() —
  has_boundary_match() already does its own scan and returns False when the word
  isn't present, so the extra check was pure wasted work on every candidate.
- Extracted the find_one() helper (byte-identical across build_data.py, 
  build_sentences.py, build_word_sentences.py) into a new shared
  tools/_common.py, removing three copies of the same 5-line function.


## [1.1.0] - 2026-08-20

### Added
- Common example sentences per kanji (from EDRDG's JMdict examples data,
  ultimately the Tanaka Corpus), shown on the word entry page directly below
  the conjugation table, with real word-level furigana sourced from the
  corpus's own human-indexed readings (not guessed) — toggleable in Settings.
- Example words containing each kanji in any position (not just as the
  first character, e.g. 給食/外食 as well as 食べる), shown on the kanji
  detail page with furigana rendered above the kanji.
- Setting to show the conjugation table expanded by default, instead of
  collapsed behind "Show conjugations".
- Notepad export as plain text (the spiritual equivalent of original JED's
  Anki-export feature, simplified to need no target app).
- Keyboard accessibility for kanji characters within a word entry — they're
  now focusable and Enter/Space-activatable, not mouse/touch-only.
- Friendly error states on the entry and kanji detail pages when data fails
  to load, instead of hanging on "Loading..." indefinitely.

### Changed
- Conjugation table no longer shows a redundant reading line under each
  conjugated form.

### Fixed
- The "← Back" button on entry/kanji detail views was never wired to
  anything and did nothing.
- The service worker intercepted requests for its own script file, serving
  back a stale cached copy of `sw.js` and defeating its own update
  detection — edits to the app could go unnoticed across reloads.
- Searching a word containing a supplementary-plane kanji (e.g. 𠮟る, a
  real jōyō-2010 word) silently returned zero results: `containsKanji()`
  and shard/index bucket lookups operated on UTF-16 code units instead of
  full Unicode code points.
- A slow, superseded search request could overwrite newer, correct results
  with an error message (missing staleness guard in the search error path).
- The service worker's background cache revalidation could be cut short
  before finishing, and requests for uncached resources while offline threw
  instead of failing gracefully.
- The Notepad view could crash entirely on a saved record missing a `tags`
  field.
- An English-search result cap could be exceeded due to a mis-scoped loop
  `break` that only exited the inner loop instead of the whole scan.
- Removed dead code (an unreachable ternary) and unused markup.

## [1.0.0] - 2026-08-19

### Added
- Initial release: full Japanese-English dictionary search (kana, kanji,
  romaji with live conversion, and English), built from a fresh JMdict/
  KANJIDIC2/KRADFILE/RADKFILE/KanjiVG data pipeline (`tools/`).
- Entry detail view with copy-to-clipboard, notepad star + free-text tags.
- Verb/i-adjective/na-adjective conjugation, derived from JMdict
  part-of-speech tags rather than guessed from the dictionary form's ending.
- Kanji detail view: stroke count, grade, frequency, JLPT level, readings,
  radical composition, and an animated stroke-order diagram (jōyō kanji).
- Multi-select radical picker with kanji-set intersection.
- Notepad (saved entries with tags) and history (recently viewed), both
  `localStorage`-based.
- Romaji-to-kana input conversion and radical reference table, ported from
  the original JED Android APK's bundled lookup tables.
- Installable PWA, offline-capable via service worker, light/dark theme.
