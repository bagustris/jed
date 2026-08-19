#!/usr/bin/env python3
"""Build data/kanji-sentences.json: a handful of common example sentences
per kanji, for the kanji detail page.

Source: jmdict-simplified's jmdict-examples-eng release, which is the same
JMdict word list as jmdict-eng but with each applicable sense carrying an
`examples` array (Japanese/English sentence pairs, originally the Tanaka
Corpus / tatoeba.org, distributed by EDRDG as JMdict_e_examp.xml -- see
../CREDITS.md). Requires data/kanji.json to already exist (run build_data.py
first) -- this script only adds the sentences file, it doesn't touch the
rest of data/.

Usage:
  python3 download_sources.py /tmp/jed-build   # if not already run
  python3 build_data.py /tmp/jed-build          # if not already run
  python3 build_sentences.py /tmp/jed-build

Approach: for every (Japanese, English) example sentence pair in the
source, credit it to every kanji CHARACTER that literally appears in the
Japanese sentence text (not just the one kanji headword the example happens
to be attached to in JMdict) -- this gives meaningfully better coverage,
since a sentence illustrating a common word often also contains other kanji
worth showing an example for. Candidates per kanji are deduplicated by exact
sentence text, then ranked (linked word flagged `common` in JMdict first,
then shorter sentences first -- better for a dictionary UI than a corpus
dump) and truncated to TARGET_PER_KANJI.
"""
import collections
import glob
import json
import os
import sys

SCRATCH = sys.argv[1] if len(sys.argv) > 1 else "/tmp/jed-build"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

TARGET_PER_KANJI = 5


def find_one(pattern):
    matches = glob.glob(os.path.join(SCRATCH, pattern))
    if not matches:
        raise SystemExit(f"missing {pattern} in {SCRATCH} -- run download_sources.py first")
    return matches[0]


def main():
    examples_path = find_one("jmdict-examples-eng-*.json")
    with open(examples_path, encoding="utf-8") as f:
        words = json.load(f)["words"]

    kanji_path = os.path.join(DATA, "kanji.json")
    if not os.path.exists(kanji_path):
        raise SystemExit(f"missing {kanji_path} -- run build_data.py first")
    with open(kanji_path, encoding="utf-8") as f:
        kanji_data = json.load(f)
    kanji_chars = set(kanji_data.keys())
    jouyo_chars = {c for c, v in kanji_data.items() if v.get("jouyo")}

    candidates = collections.defaultdict(list)  # char -> [(jp, en, len, common)]
    seen_per_char = collections.defaultdict(set)  # char -> {jp texts already added}

    total_pairs = 0
    for w in words:
        common = any(k.get("common") for k in w.get("kanji", [])) or any(k.get("common") for k in w.get("kana", []))
        for s in w.get("sense", []):
            for ex in s.get("examples", []):
                sentences = {sent["lang"]: sent["text"] for sent in ex.get("sentences", [])}
                jp, en = sentences.get("jpn"), sentences.get("eng")
                if not jp or not en:
                    continue
                total_pairs += 1
                for c in {ch for ch in jp if ch in kanji_chars}:
                    if jp in seen_per_char[c]:
                        continue
                    seen_per_char[c].add(jp)
                    candidates[c].append((jp, en, len(jp), common))

    out = {}
    for c, cands in candidates.items():
        cands.sort(key=lambda t: (not t[3], t[2]))  # common-linked first, then shorter first
        out[c] = [{"jp": jp, "en": en} for jp, en, _, _ in cands[:TARGET_PER_KANJI]]

    out_path = os.path.join(DATA, "kanji-sentences.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    size = os.path.getsize(out_path)
    jouyo_covered = sum(1 for c in jouyo_chars if c in out)
    jouyo_full = sum(1 for c in jouyo_chars if len(out.get(c, [])) >= TARGET_PER_KANJI)
    all_full = sum(1 for v in out.values() if len(v) >= TARGET_PER_KANJI)
    print(f"scanned {total_pairs} (jp,en) example pairs")
    print(f"kanji-sentences.json: {len(out)} kanji, {size/1e6:.2f} MB")
    print(f"jouyo: {jouyo_covered}/{len(jouyo_chars)} have >=1 sentence, "
          f"{jouyo_full}/{len(jouyo_chars)} have the full {TARGET_PER_KANJI}")
    print(f"all kanji: {len(out)}/{len(kanji_chars)} have >=1 sentence, "
          f"{all_full}/{len(kanji_chars)} have the full {TARGET_PER_KANJI}")


if __name__ == "__main__":
    main()
