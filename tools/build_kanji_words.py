#!/usr/bin/env python3
"""Build data/kanji-words.json: for each kanji character, a short list of
common words containing that character (any position, not just as the
first character -- unlike data/index/kanji/*.json, which is a lookup index
keyed by exact headword and only useful for locating a word you already
know, not for "what vocabulary uses this kanji").

Pure local computation over the already-built data/words/*.json shards --
no network access, no upstream download.

Usage:
  python3 build_kanji_words.py
"""
import glob
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

KANJI_RE_START, KANJI_RE_END = 0x4E00, 0x9FFF  # CJK Unified Ideographs; 々 handled separately
ITERATION_MARK = "々"


def is_kanji(ch):
    return KANJI_RE_START <= ord(ch) <= KANJI_RE_END or ch == ITERATION_MARK


def main():
    by_kanji = {}  # char -> list of candidate dicts
    seen_per_kanji = {}  # char -> set of kanji-text already added (dedupe)

    shard_files = sorted(glob.glob(os.path.join(DATA, "words", "*.json")))
    total_entries = 0
    for path in shard_files:
        shard = os.path.splitext(os.path.basename(path))[0]
        with open(path, encoding="utf-8") as f:
            entries = json.load(f)
        for seq, entry in entries.items():
            total_entries += 1
            kanji_forms = entry.get("k") or []
            if not kanji_forms:
                continue
            primary = kanji_forms[0]
            text = primary["t"]
            common = primary.get("c", False) or any(r.get("c") for r in entry.get("r", []))
            reading = entry["r"][0]["t"] if entry.get("r") else ""
            gloss = entry["s"][0]["gloss"][0] if entry.get("s") and entry["s"][0].get("gloss") else ""

            chars_here = {c for c in text if is_kanji(c)}
            for ch in chars_here:
                seen = seen_per_kanji.setdefault(ch, set())
                if text in seen:
                    continue
                seen.add(text)
                by_kanji.setdefault(ch, []).append({
                    "k": text, "r": reading, "g": gloss, "seq": seq, "shard": shard,
                    "c": common, "len": len(text),
                })

    out = {}
    for ch, candidates in by_kanji.items():
        candidates.sort(key=lambda c: (not c["c"], c["len"]))
        top = [{"k": c["k"], "r": c["r"], "g": c["g"], "seq": c["seq"], "shard": c["shard"]} for c in candidates[:8]]
        out[ch] = top

    out_path = os.path.join(DATA, "kanji-words.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    size_mb = os.path.getsize(out_path) / 1e6
    with_full = sum(1 for v in out.values() if len(v) >= 8)
    print(f"kanji-words.json: {len(out)} kanji covered, {size_mb:.2f} MB, "
          f"{with_full} kanji have the full 8 words, from {total_entries} word entries scanned")

    kanji_data_path = os.path.join(DATA, "kanji.json")
    if os.path.exists(kanji_data_path):
        with open(kanji_data_path, encoding="utf-8") as f:
            all_kanji = json.load(f)
        jouyo = [ch for ch, info in all_kanji.items() if info.get("jouyo")]
        jouyo_covered = sum(1 for ch in jouyo if ch in out)
        print(f"jouyo coverage: {jouyo_covered}/{len(jouyo)} ({100 * jouyo_covered / len(jouyo):.1f}%)")


if __name__ == "__main__":
    main()
