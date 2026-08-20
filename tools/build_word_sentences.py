#!/usr/bin/env python3
"""Build data/word-sentences.json: example sentences for a specific WORD,
keyed by entry id -- the same id used as the key in data/words/*.json
shards.

This is the per-word counterpart to kanji-sentences.json. That file
broadcasts each sentence to every kanji CHARACTER it contains, which is the
right call for a kanji detail page (build vocabulary around the character)
but wrong for a word entry page: a sentence about 履く "to wear" doesn't
belong on the 履歴書 "resume" page just because both happen to contain 履.
This script instead ties each example sentence to a specific word, so
js/app.js's renderEntrySentences() can show sentences that actually
illustrate the word in question, falling back to the kanji-level list
(filtered to sentences containing the whole word) only for the residual few
words neither source below covers -- see that function's comment.

Two sources, tried in order:

  A. jmdict-examples-eng-*.json's own per-sense `examples` -- sentences
     JMdict itself curated as *the* illustration for a specific word/sense.
     Best quality, applies to any word (conjugating or not), but sparse:
     only ~13% of entries have one. Source: same jmdict-simplified release
     used by build_sentences.py (see that script and ../CREDITS.md).

  B. A literal whole-word search over Tatoeba's full sentence corpus
     (downloaded directly from downloads.tatoeba.org, CC-BY 2.0 FR --
     single collective attribution is sufficient per Tatoeba's own FAQ,
     https://en.wiki.tatoeba.org/articles/show/faq, "For the textual
     data... you just need to write somewhere that some/all of your
     sentences are from Tatoeba"). This corpus is a superset of the
     EDRDG-distributed Tanaka Corpus already used elsewhere in this repo
     (verified: 147,671 of its 147,836 sentences are contained here) plus
     roughly 85,000 more from other Tatoeba contributors, so one download
     covers both. Only applied to words JMdict didn't already cover, and
     only for multi-kanji compounds with no okurigana (nouns like 履歴書,
     腕時計) -- see build_sentences.py's KANJI_RE note on why conjugating
     words can't be matched this way (a sentence may use a different
     inflected form of the same dictionary headword).

Usage:
  python3 download_sources.py /tmp/jed-build   # if not already run
  python3 build_word_sentences.py /tmp/jed-build
"""
import bz2
import glob
import json
import os
import re
import sys
import urllib.request

from _common import find_one

SCRATCH = sys.argv[1] if len(sys.argv) > 1 else "/tmp/jed-build"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

TARGET_PER_WORD = 5
TATOEBA_BASE = "https://downloads.tatoeba.org/exports/per_language"
# BMP CJK Unified Ideographs + 々, same deliberately-narrow set as
# build_furigana.py's KANJI_RE (see that file's comment) -- fine here too,
# since supplementary-plane kanji are a vanishingly small share of
# multi-kanji compound headwords.
KANJI_RE = re.compile(r"[一-鿿々]")


def is_kanji_compound(word):
    return len(word) > 1 and all(KANJI_RE.match(c) for c in word)


def has_boundary_match(word, jp):
    """True if `word` occurs in `jp` with a kanji "word boundary" on both
    sides -- i.e. not embedded inside a longer kanji run. Plain substring
    matching would credit 牡丹 "peony" with a sentence about 牡丹餅
    "botamochi (a rice cake)", or 望遠 (a bound morpheme, "far-seeing") with
    one about 望遠鏡 "telescope" -- the same kind of mismatch the whole-word
    filter in this file exists to prevent, one level up. Checked against
    every occurrence, not just the first, since a word can appear both
    embedded and standalone in the same sentence."""
    start, n = 0, len(word)
    while True:
        idx = jp.find(word, start)
        if idx == -1:
            return False
        before_ok = idx == 0 or not KANJI_RE.match(jp[idx - 1])
        after_i = idx + n
        after_ok = after_i >= len(jp) or not KANJI_RE.match(jp[after_i])
        if before_ok and after_ok:
            return True
        start = idx + 1


def fetch_tatoeba_file(name, lang_dir, cache_dir):
    """Downloads+decompresses into cache_dir, caching the .tsv for re-runs.
    Writes to a .tmp path and os.replace()s it into place only once fully
    written, so an interrupted download (network blip, disk full, Ctrl-C)
    can never leave a truncated file sitting at the cached path for a later
    run to silently pick up as if it were complete."""
    tsv_path = os.path.join(cache_dir, name)
    if os.path.exists(tsv_path):
        return tsv_path
    bz2_path = tsv_path + ".bz2"
    url = f"{TATOEBA_BASE}/{lang_dir}/{name}.bz2"
    print(f"downloading {url} ...", file=sys.stderr)
    urllib.request.urlretrieve(url, bz2_path)
    tmp_path = tsv_path + ".tmp"
    with bz2.open(bz2_path, "rt", encoding="utf-8") as fin, open(tmp_path, "w", encoding="utf-8") as fout:
        fout.write(fin.read())
    os.replace(tmp_path, tsv_path)
    return tsv_path


def load_tatoeba_pairs(cache_dir):
    jp_path = fetch_tatoeba_file("jpn_sentences.tsv", "jpn", cache_dir)
    en_path = fetch_tatoeba_file("eng_sentences.tsv", "eng", cache_dir)
    links_path = fetch_tatoeba_file("jpn-eng_links.tsv", "jpn", cache_dir)

    # maxsplit bounds the split to the expected field count so a stray
    # literal tab inside a sentence's text (id/lang are never user text, but
    # the sentence text itself is) gets absorbed into the last field instead
    # of raising a ValueError on unpacking.
    jp_text, en_text = {}, {}
    with open(jp_path, encoding="utf-8") as f:
        for line in f:
            sid, _lang, text = line.rstrip("\n").split("\t", 2)
            jp_text[sid] = text
    with open(en_path, encoding="utf-8") as f:
        for line in f:
            sid, _lang, text = line.rstrip("\n").split("\t", 2)
            en_text[sid] = text

    pairs = []
    with open(links_path, encoding="utf-8") as f:
        for line in f:
            a, b = line.rstrip("\n").split("\t", 1)
            if a in jp_text and b in en_text:
                pairs.append((jp_text[a], en_text[b]))
            elif b in jp_text and a in en_text:
                pairs.append((jp_text[b], en_text[a]))
    return pairs


def build_source_a(examples_path):
    with open(examples_path, encoding="utf-8") as f:
        words = json.load(f)["words"]

    out = {}
    for w in words:
        seen = set()
        cands = []
        for s in w.get("sense", []):
            for ex in s.get("examples", []):
                sentences = {sent["lang"]: sent["text"] for sent in ex.get("sentences", [])}
                jp, en = sentences.get("jpn"), sentences.get("eng")
                if not jp or not en or jp in seen:
                    continue
                seen.add(jp)
                cands.append((jp, en, len(jp)))
        if not cands:
            continue
        cands.sort(key=lambda t: t[2])  # shorter first
        out[w["id"]] = [{"jp": jp, "en": en} for jp, en, _ in cands[:TARGET_PER_WORD]]
    return out


def add_source_b(out, tatoeba_pairs):
    # Which compound words does source A not already cover?
    seqs_by_word = {}
    for path in glob.glob(os.path.join(DATA, "words", "*.json")):
        with open(path, encoding="utf-8") as f:
            shard = json.load(f)
        for seq, e in shard.items():
            if seq in out:
                continue
            k = e.get("k")
            word = k[0]["t"] if k else None
            if word and is_kanji_compound(word):
                seqs_by_word.setdefault(word, []).append(seq)

    char_index = {}
    for i, (jp, _en) in enumerate(tatoeba_pairs):
        for c in set(jp):
            if KANJI_RE.match(c):
                char_index.setdefault(c, []).append(i)

    matched_words = 0
    for word, seqs in seqs_by_word.items():
        seen_jp = set()
        found = []
        for i in char_index.get(word[0], []):
            jp, en = tatoeba_pairs[i]
            if jp not in seen_jp and has_boundary_match(word, jp):
                seen_jp.add(jp)
                found.append((jp, en, len(jp)))
        if not found:
            continue
        found.sort(key=lambda t: t[2])  # shorter first
        sents = [{"jp": jp, "en": en} for jp, en, _ in found[:TARGET_PER_WORD]]
        for seq in seqs:
            out[seq] = sents
        matched_words += 1

    return len(seqs_by_word), matched_words


def main():
    if not glob.glob(os.path.join(DATA, "words", "*.json")):
        raise SystemExit(f"missing {DATA}/words/*.json -- run build_data.py first")

    out = build_source_a(find_one(SCRATCH, "jmdict-examples-eng-*.json"))
    print(f"source A (JMdict-curated examples): {len(out)} words", file=sys.stderr)

    tatoeba_pairs = load_tatoeba_pairs(SCRATCH)
    print(f"tatoeba jpn-eng pairs loaded: {len(tatoeba_pairs)}", file=sys.stderr)

    needed, matched = add_source_b(out, tatoeba_pairs)
    print(f"source B (full Tatoeba corpus, literal whole-word match): "
          f"{matched}/{needed} remaining compound words matched", file=sys.stderr)

    out_path = os.path.join(DATA, "word-sentences.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    total_pairs = sum(len(v) for v in out.values())
    size = os.path.getsize(out_path)
    print(f"word-sentences.json: {len(out)} words, {total_pairs} sentence pairs, {size/1e6:.2f} MB")


if __name__ == "__main__":
    main()
