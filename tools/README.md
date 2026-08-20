# Data regeneration

```bash
python3 download_sources.py /tmp/jed-build   # fetch JMdict/KANJIDIC2/KRADFILE/RADKFILE/JMdict-examples/KanjiVG
python3 build_data.py /tmp/jed-build          # shard + convert into ../data/
python3 build_sentences.py /tmp/jed-build     # build ../data/kanji-sentences.json (needs build_data.py's data/kanji.json first)
python3 build_word_sentences.py /tmp/jed-build # build ../data/word-sentences.json
python3 build_furigana.py                     # add a `furigana` field to every sentence in both sentence files
```

`download_sources.py` always pulls the *latest* `jmdict-simplified` and
`KanjiVG` GitHub releases — re-run all three scripts periodically to pick up
upstream JMdict updates. Nothing under `/tmp/jed-build` is committed; it's
scratch space, safe to delete after the build scripts finish.
`build_word_sentences.py` additionally self-downloads Tatoeba's sentence
export (`jpn_sentences.tsv`, `eng_sentences.tsv`, `jpn-eng_links.tsv`, a few
tens of MB) into the same scratch dir, the same way `build_furigana.py`
self-downloads `examples.utf` — see that script's own note below.

`build_data.py` also reads two small hand-recovered tables outside this
repo, from the original JED APK teardown (see `../CREDITS.md`):

- `/tmp/jed/extracted/com/umibouzu/japanese/radicals/radicals.dat`
- `/tmp/jed/extracted/com/umibouzu/japanese/kana/*.dat`

If those paths don't exist on a future machine, either re-extract the APK
(`unzip com_umibouzu_jed_0.5.5_03_14_2011.apk`) or keep a copy of
`data/radicals.json` / `data/kana-romaji.json` around — once built, neither
input changes, so this half of the pipeline never needs to run again.

`build_sentences.py` builds `data/kanji-sentences.json` (common example
sentences per kanji, shown on the kanji detail page) from
`jmdict-examples-eng-*.json` — the same JMdict word list as `jmdict-eng`,
but with each applicable sense carrying Japanese/English example sentence
pairs (originally the Tanaka Corpus / tatoeba.org, distributed by EDRDG).
It's a separate script rather than folded into `build_data.py` because it
depends on `data/kanji.json` already existing (to know which characters are
real kanji and which are jōyō) — run `build_data.py` first. Coverage is
inherently partial: only ~2,500 of the ~10,400 kanji in `data/kanji.json`
appear in this ~32k-sentence corpus at all (it's curated everyday example
sentences, not exhaustive), though jōyō coverage is much better (~96%
have at least one sentence). The kanji detail page should treat a missing
entry in this file as "no examples available," not an error.

`build_word_sentences.py` builds `data/word-sentences.json` (example
sentences per *word*, shown on the word entry page below the conjugation
table), keyed by entry seq. Unlike `kanji-sentences.json`, which broadcasts
every sentence to each kanji character it contains, this keeps a sentence
tied to a specific word — so the sentences shown for a word are actually
about that word, not just about some kanji it happens to share with
unrelated words (e.g. 履歴書 "resume" showing a sentence about 履く "to
wear" purely because both contain 履, which is what relying on
`kanji-sentences.json` alone did on the word entry page before this file
existed). It tries two sources in order:

1. `jmdict-examples-eng-*.json`'s own per-sense `examples` — sentences
   JMdict itself curated as *the* illustration for a specific word/sense.
   Best quality, applies to any word (conjugating or not), but sparse: only
   ~13% of entries have one.
2. A literal whole-word search over Tatoeba's full sentence corpus
   (downloaded directly from `downloads.tatoeba.org`, CC BY 2.0 FR — see
   `../CREDITS.md`), for compound words the first source missed. Only
   applied to multi-kanji compounds with no okurigana (nouns like 履歴書,
   腕時計) — conjugating words can't be matched this way, since a sentence
   may use a different inflected form of the same dictionary headword. A
   plain substring search isn't enough here either: it would credit 牡丹
   "peony" with a sentence about 牡丹餅 "botamochi (a rice cake)" purely
   because one contains the other, so a match only counts if the word
   appears with a kanji "word boundary" on both sides (`has_boundary_match`)
   — not embedded inside a longer kanji run.

Together these cover ~16% of multi-kanji compound words (up from ~12% using
source 1 alone). `js/app.js`'s `renderEntrySentences()` falls back to a
whole-word-filtered lookup in `kanji-sentences.json` for entries missing
from this file, and shows no sentence section at all when neither source
has one.

`build_furigana.py` fills in each sentence's `furigana` field (reading
annotations for the app's toggleable ruby-text display), for both
`kanji-sentences.json` and `word-sentences.json`, from a *different* form of
the same corpus: EDRDG's raw indexed Tanaka Corpus file (`examples.utf`,
fetched directly — not through jmdict-simplified), which preserves a
human-tagged per-word reading breakdown that the JSON conversion used by
`build_sentences.py`/`build_word_sentences.py` doesn't carry. It downloads
that file itself (~9MB gzipped, cached at `/tmp/examples.utf`) and matches
sentences by exact Japanese text (100% match rate against the shipped
corpus — same underlying sentences). Alignment succeeds for ~99.8% of
sentences; a sentence is left without a `furigana` field only when the
tokenizer can't locate one of the corpus's tagged words in the sentence
text (rare parsing edge cases — complex names, unusual punctuation). Not
every word in an aligned sentence gets a reading — the corpus itself only
tags words it judged non-obvious, so plain/common words routinely appear
with no `r` annotation; that's a property of the source data, not a bug.
