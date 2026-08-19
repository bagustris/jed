# Credits

This project is an independent recreation of **JED** (Japanese-English
Dictionary) by umibouzu (2010-2011) as a static web app. Nothing here reuses
JED's code — that Android app shipped no dictionary data of its own; it
downloaded a SQLite database from `umibouzu.com` on first install, and that
server has been offline for years. What survives, and what this project
actually credits, are the **open dictionary data sources** JED's own
`about/ack.html` named, obtained fresh from their current maintainers:

## Data sources

**JMdict** (word entries, readings, glosses, part-of-speech tags) —
Electronic Dictionary Research and Development Group (EDRDG),
<http://www.edrdg.org/>. Used under EDRDG's licence, which requires this
attribution and a link back to the project.

**KANJIDIC2** (kanji stroke counts, grade, frequency, on'yomi/kun'yomi,
meanings, JLPT level) — EDRDG, <http://www.edrdg.org/wiki/index.php/KANJIDIC_Project>.

**KRADFILE / RADKFILE** (kanji-to-radical decomposition and the inverse
radical-to-kanji grouping used by the radical picker) — EDRDG, originally
compiled by Jim Rose at Kanji Cafe (`KRADFILE2`), now maintained by EDRDG.

**JMdict with examples / Tanaka Corpus** (`data/kanji-sentences.json`,
common example sentences shown on the kanji detail page) — built from
`JMdict_e_examp.xml`, an EDRDG file combining JMdict with example sentence
pairs originally from the Tanaka Corpus maintained at
<https://tatoeba.org/>. Like JMdict itself, this file is EDRDG's property
and distributed under EDRDG's licence. Each kanji's sentences are picked by
scanning every example sentence for the literal character, deduplicating,
and keeping up to 5 (preferring sentences linked to a JMdict entry flagged
"common", then shorter sentences) — see `tools/build_sentences.py`.
Coverage is necessarily partial (a curated ~32k-sentence corpus, not
exhaustive): about 96% of jōyō kanji have at least one example, versus
about a quarter of all ~10,400 kanji in `data/kanji.json`.

Each sentence's toggleable furigana (reading annotations) comes from the
same corpus in its original indexed form — EDRDG's `examples.utf`, which
tags each sentence's words with their reading — rather than the JSON
conversion above, which doesn't carry that per-word breakdown. See
`tools/build_furigana.py`.

**KanjiVG** (jōyō-kanji stroke-order diagrams, `data/kanjivg/`) — copyright
(c) Ulrich Apel, <http://kanjivg.tagaini.net/>, released under the
[Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
license. Only the 2,136 jōyō kanji are included here (fetched on demand),
not KanjiVG's full ~11,000-character set.

**[jmdict-simplified](https://github.com/scriptin/jmdict-simplified)** —
used as the conversion tool that turns the above EDRDG XML sources into
JSON; `tools/build_data.py`/`tools/build_sentences.py` reshape its output
into this app's sharded format. Not a data source itself, but saved
re-implementing an XML parser.

## Recovered from the original JED APK

Two small hand-built tables from JED 0.5.5 (`com.umibouzu.jed`, 2011) were
extracted from the APK and ported into `data/radicals.json` and
`data/kana-romaji.json`:

- `com/umibouzu/japanese/radicals/radicals.dat` — the 214-radical picker
  table (English name + Japanese reading per radical), merged with RADKFILE
  for which kanji contain each radical.
- `com/umibouzu/japanese/kana/{strict_kana,dakuten,handakuten,translation}.dat`
  — the romaji-to-kana conversion tables that powered JED's search box.

These are plain data tables (kana/romaji pairs, radical names), not code,
and are credited here as the origin of that data even though the mapping
itself (romaji romanization, radical stroke order) is standard reference
material rather than an EDRDG-licensed work.

## License note

JMdict, KANJIDIC2, KRADFILE, RADKFILE, and the JMdict-with-examples/Tanaka
Corpus file are all distributed under EDRDG's licence (share-alike,
attribution required) — see <http://www.edrdg.org/edrdg/licence.html>.
KanjiVG is CC BY-SA 3.0. Any redistribution of this project's `data/`
directory should carry this file along with it.
