#!/usr/bin/env python3
"""Add a `furigana` field to every sentence in data/kanji-sentences.json,
mapping the corpus's own human-tagged word readings to each sentence rather
than guessing from data/kanji.json's on'yomi/kun'yomi tables (unreliable for
compounds and jukujikun).

Source: EDRDG's raw indexed Tanaka Corpus file (examples.utf, same underlying
corpus as jmdict-examples-eng but in its original alternating-line format,
which -- unlike the JSON conversion -- preserves the per-word reading
breakdown). Two-line records:

    A: <japanese sentence>\t<english translation>#ID=...
    B: <space-separated tagged tokens>

Each B: token is shaped roughly `surface(reading)[senseNum]{actualForm}~`,
every part but `surface` optional:
  - `(reading)` is only a real reading if its content is kana; `(#123456)`-
    style parenthesized content is a cross-reference/sense ID, not a reading.
  - `[NN]` is a sense number, discarded.
  - `{actualForm}` is the literal inflected surface text as it appears in the
    sentence (e.g. 会う[01]{会えない} appears as 会えない) -- overrides
    `surface` for alignment when present.
  - a trailing `~` is a suffix/compound marker, stripped.

Usage:
  python3 build_sentences.py /tmp/jed-build   # must run first
  python3 build_furigana.py                   # downloads examples.utf itself

Matches data/kanji-sentences.json's `jp` field against the corpus's `A:`
text by exact string equality (same corpus, same sentences -- verified at
100% match rate against the shipped dataset), then aligns each B: token
against the `jp` string left to right, character-by-character, to build
per-segment reading annotations. Sentences whose alignment can't complete
(rare -- ~0.2% -- usually complex names/punctuation the simple tokenizer
doesn't expect) are left without a `furigana` field; the frontend already
falls back to plain text for those.
"""
import gzip
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
EXAMPLES_URL = "http://ftp.edrdg.org/pub/Nihongo/examples.utf.gz"
MAX_SKIP = 8  # max untokenized chars (punctuation, quote marks) to skip between tokens

TOKEN_RE = re.compile(r"^([^(){}\[\]~]+)((?:\([^)]*\)|\[[^\]]*\]|\{[^}]*\})*)~?$")
PART_RE = re.compile(r"\(([^)]*)\)|\[([^\]]*)\]|\{([^}]*)\}")
KANA_RE = re.compile(r"^[぀-ヿ]+$")
KANJI_RE = re.compile(r"[一-鿿々]")  # BMP CJK Unified Ideographs + 々, deliberately
# narrower than js/app.js's isKanjiChar()/js/search.js's containsKanji(), which also
# match supplementary-plane kanji (e.g. 𠮟, U+20B9F) via \p{Script=Han}. Widening this
# to match would change which characters get credited with example sentences here and
# requires re-running the full data/ build -- out of scope for a comment-only fix.


def fetch_examples_utf(cache_path):
    if os.path.exists(cache_path) and os.path.getsize(cache_path) > 10_000_000:
        return cache_path
    print(f"downloading {EXAMPLES_URL} ...", file=sys.stderr)
    gz_path = cache_path + ".gz"
    urllib.request.urlretrieve(EXAMPLES_URL, gz_path)
    with gzip.open(gz_path, "rt", encoding="utf-8") as fin, open(cache_path, "w", encoding="utf-8") as fout:
        fout.write(fin.read())
    return cache_path


def parse_token(tok):
    tok = tok.strip()
    if not tok:
        return None
    m = TOKEN_RE.match(tok)
    if not m:
        return {"surface": tok, "reading": None, "actual": None}
    base, rest = m.group(1), (m.group(2) or "")
    reading = actual = None
    for paren, _brack, brace in PART_RE.findall(rest):
        if paren and not paren.startswith("#") and KANA_RE.match(paren):
            reading = paren
        elif brace:
            actual = brace
    return {"surface": base, "reading": reading, "actual": actual}


def align(jp_text, tokens):
    """Return an ordered list of {"t": text, "r": reading-or-None} segments
    covering jp_text, or None if a token can't be located (alignment failed)."""
    segments, pos = [], 0
    for tok in tokens:
        search = tok["actual"] or tok["surface"]
        if not search:
            continue
        idx = jp_text.find(search, pos)
        if idx == -1 or (idx - pos) > MAX_SKIP:
            return None
        if idx > pos:
            segments.append({"t": jp_text[pos:idx], "r": None})
        # A word's {actualForm} override can itself be pure kana (e.g. a
        # conjugated 為る{しよう}) even though its dictionary surface has
        # kanji and thus a reading -- furigana over already-kana text is
        # nonsensical, so only keep the reading when what's actually
        # rendered contains a kanji character.
        reading = tok["reading"] if tok["reading"] and KANJI_RE.search(search) else None
        segments.append({"t": search, "r": reading})
        pos = idx + len(search)
    if pos < len(jp_text):
        segments.append({"t": jp_text[pos:], "r": None})
    # merge adjacent no-reading segments for cleaner output
    merged = []
    for seg in segments:
        if merged and merged[-1]["r"] is None and seg["r"] is None:
            merged[-1]["t"] += seg["t"]
        else:
            merged.append(dict(seg))
    return merged


def load_corpus(path):
    corpus = {}
    a_text = None
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if line.startswith("A: "):
                a_text = line[3:].split("\t", 1)[0]
            elif line.startswith("B: ") and a_text is not None:
                corpus[a_text] = line[3:].split(" ")
                a_text = None
    return corpus


def main():
    sentences_path = os.path.join(DATA, "kanji-sentences.json")
    with open(sentences_path, encoding="utf-8") as f:
        kanji_sentences = json.load(f)

    unique_jp = {s["jp"] for sents in kanji_sentences.values() for s in sents}
    print(f"unique jp sentences needing furigana: {len(unique_jp)}", file=sys.stderr)

    examples_path = fetch_examples_utf(os.path.join("/tmp", "examples.utf"))
    corpus = load_corpus(examples_path)
    print(f"corpus A/B pairs loaded: {len(corpus)}", file=sys.stderr)

    furigana_by_jp = {}
    matched = aligned = with_reading = 0
    for jp in unique_jp:
        raw_tokens = corpus.get(jp)
        if raw_tokens is None:
            continue
        matched += 1
        tokens = [t for t in (parse_token(tok) for tok in raw_tokens if tok.strip()) if t]
        segments = align(jp, tokens)
        if segments is None:
            continue
        aligned += 1
        if any(s["r"] for s in segments):
            with_reading += 1
        furigana_by_jp[jp] = segments

    print(f"matched in corpus (exact jp text): {matched}/{len(unique_jp)}", file=sys.stderr)
    print(f"aligned successfully: {aligned}/{matched}", file=sys.stderr)
    print(f"aligned sentences with >=1 real reading: {with_reading}/{aligned}", file=sys.stderr)

    applied = 0
    for sents in kanji_sentences.values():
        for s in sents:
            fg = furigana_by_jp.get(s["jp"])
            if fg is not None:
                s["furigana"] = fg
                applied += 1

    with open(sentences_path, "w", encoding="utf-8") as f:
        json.dump(kanji_sentences, f, ensure_ascii=False, separators=(",", ":"))

    size_mb = os.path.getsize(sentences_path) / 1e6
    print(f"applied furigana to {applied} sentence objects; {sentences_path} now {size_mb:.2f} MB", file=sys.stderr)


if __name__ == "__main__":
    main()
