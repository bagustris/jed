# Data regeneration

```bash
python3 download_sources.py /tmp/jed-build   # fetch JMdict/KANJIDIC2/KRADFILE/RADKFILE/JMdict-examples/KanjiVG
python3 build_data.py /tmp/jed-build          # shard + convert into ../data/
python3 build_sentences.py /tmp/jed-build     # build ../data/kanji-sentences.json (needs build_data.py's data/kanji.json first)
python3 build_furigana.py                     # add a `furigana` field to every sentence in kanji-sentences.json
```

`download_sources.py` always pulls the *latest* `jmdict-simplified` and
`KanjiVG` GitHub releases — re-run all three scripts periodically to pick up
upstream JMdict updates. Nothing under `/tmp/jed-build` is committed; it's
scratch space, safe to delete after the build scripts finish.

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

`build_furigana.py` fills in each sentence's `furigana` field (reading
annotations for the app's toggleable ruby-text display) from a *different*
form of the same corpus: EDRDG's raw indexed Tanaka Corpus file
(`examples.utf`, fetched directly — not through jmdict-simplified), which
preserves a human-tagged per-word reading breakdown that the JSON
conversion used by `build_sentences.py` doesn't carry. It downloads that
file itself (~9MB gzipped, cached at `/tmp/examples.utf`) and matches
sentences by exact Japanese text (100% match rate against the shipped
corpus — same underlying sentences). Alignment succeeds for ~99.8% of
sentences; a sentence is left without a `furigana` field only when the
tokenizer can't locate one of the corpus's tagged words in the sentence
text (rare parsing edge cases — complex names, unusual punctuation). Not
every word in an aligned sentence gets a reading — the corpus itself only
tags words it judged non-obvious, so plain/common words routinely appear
with no `r` annotation; that's a property of the source data, not a bug.
