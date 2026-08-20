# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
