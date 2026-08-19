# JED — 辞書

A full Japanese-English dictionary lookup app: search by kanji, kana,
romaji, or English, with kanji detail pages (readings, stroke order,
radical composition), a radical picker, verb/adjective conjugation, and a
notepad with tags. Plain HTML/CSS/JS, no framework, no build step — runs
as-is on GitHub Pages.

This is an independent recreation of **JED**, an Android dictionary app by
umibouzu (2010-2011). The original APK shipped no dictionary data of its own
(it downloaded a database from a server that's been offline for years); this
app is built fresh from openly-licensed dictionary sources — see
[CREDITS.md](CREDITS.md) for the full attribution.

## Features

- **Search** — kana, kanji, or English, switchable via a mode toggle. In
  Japanese mode, romaji is converted to hiragana as you type (`taberu` →
  `たべる`), using conversion tables ported from JED's own bundled data.
- **Entry detail** — all kanji/reading forms, every sense with its
  part-of-speech, copy-to-clipboard buttons (kanji/reading/meaning, a
  feature JED's own changelog specifically added), and a **notepad star with
  free-text tags**.
- **Conjugation** — for any verb or i-/na-adjective entry, an expandable
  table of ます, ない, た, て, potential, passive, causative, volitional,
  conditional, and imperative forms, generated from the word's actual
  part-of-speech class (not guessed from its ending — see
  [CLAUDE.md](CLAUDE.md) for why that distinction matters).
- **Kanji detail** — stroke count, grade, frequency, JLPT level, on'yomi/
  kun'yomi, radical composition, and an **animated stroke-order diagram**
  (jōyō kanji only) drawn stroke-by-stroke from KanjiVG data.
- **Radical picker** — select multiple radicals to find kanji containing all
  of them.
- **Notepad & history** — saved entries with tags, and a recently-viewed
  list — both `localStorage`-based, matching JED's own "Notepad" and
  "history" features.
- Installable PWA, offline-capable, light/dark theme.

## Run locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Data is loaded via `fetch()`, which `file://` blocks — serve over HTTP.

## Tests

No build tooling; tests use Node built-ins only, and run against the real
generated `data/` (not fixtures):

```bash
for f in js/__tests__/*-test.js; do node "$f"; done
```

## Data

Everything under `data/` is generated from JMdict, KANJIDIC2, KRADFILE,
RADKFILE, and KanjiVG by the scripts in `tools/` — see `tools/README.md` for
regeneration commands and `CREDITS.md` for licensing. Two small tables
(`data/radicals.json`'s metadata, `data/kana-romaji.json`) were ported from
the original JED Android APK's own bundled lookup tables.

## Scope

Conjugation covers modern verb/adjective classes (ichidan, all godan rows,
suru/kuru irregulars, i-/na-adjectives); archaic classical forms (nidan,
yodan) are recognized in the data but not conjugated. Stroke-order diagrams
are jōyō kanji only (2,136 characters), not KanjiVG's full ~11,000-character
set.
