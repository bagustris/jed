#!/usr/bin/env python3
"""Convert downloaded upstream sources (see download_sources.py) into the
sharded JSON the app fetches at runtime, plus jouyo-only KanjiVG SVGs.

Usage:
  python3 download_sources.py /tmp/jed-build
  python3 build_data.py /tmp/jed-build

Regenerate after a jmdict-simplified/KanjiVG update by re-running both.
"""
import glob
import json
import os
import re
import sys

SCRATCH = sys.argv[1] if len(sys.argv) > 1 else "/tmp/jed-build"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

APK_KANA = "/tmp/jed/extracted/com/umibouzu/japanese/kana"
APK_RADICALS = "/tmp/jed/extracted/com/umibouzu/japanese/radicals/radicals.dat"


def find_one(pattern):
    matches = glob.glob(os.path.join(SCRATCH, pattern))
    if not matches:
        raise SystemExit(f"missing {pattern} in {SCRATCH} -- run download_sources.py first")
    return matches[0]


# ---------------------------------------------------------------- buckets --

KATA_TO_HIRA = {chr(cp): chr(cp - 0x60) for cp in range(0x30A1, 0x30FA)}
SMALL_TO_BASE = {
    "ぁ": "あ", "ぃ": "い", "ぅ": "う", "ぇ": "え", "ぉ": "お",
    "っ": "つ", "ゃ": "や", "ゅ": "ゆ", "ょ": "よ", "ゎ": "わ",
}


def kana_bucket(ch):
    """Same rule the frontend must replicate: katakana->hiragana, small->base,
    anything outside the hiragana block (incl. the lone prolonged-sound mark
    and archaic wi/we) falls into a shared catch-all shard."""
    if ch in KATA_TO_HIRA:
        ch = KATA_TO_HIRA[ch]
    if ch in SMALL_TO_BASE:
        ch = SMALL_TO_BASE[ch]
    if "ぁ" <= ch <= "ん":
        return ch
    return "_other"


def kanji_index_bucket(ch):
    """charCodeAt(0) % 64 -- the frontend computes the identical bucket id
    from the typed character, no lookup table needed."""
    return format(ord(ch) % 64, "02x")


def english_bucket(token):
    c = token[0]
    return c if "a" <= c <= "z" else "_other"


TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z'-]*")


def gloss_tokens(text):
    # strip parenthetical asides ("(hon.)" etc.) before tokenizing
    text = re.sub(r"\([^)]*\)", " ", text)
    return {m.group(0).lower() for m in TOKEN_RE.finditer(text) if len(m.group(0)) > 1}


# ------------------------------------------------------------- word data --

def build_words():
    path = find_one("jmdict-eng-*.json")
    with open(path, encoding="utf-8") as f:
        words = json.load(f)["words"]

    shards = {}          # bucket -> {seq: entry}
    kanji_index = {}      # bucket -> {kanji_text: {seq, shard}}
    english_index = {}    # bucket -> {token: [{seq,shard,k,r}, ...]}

    for w in words:
        seq = w["id"]
        kana_forms = w.get("kana") or []
        kanji_forms = w.get("kanji") or []
        primary_reading = kana_forms[0]["text"]
        shard = kana_bucket(primary_reading[0])

        senses = []
        for s in w.get("sense", []):
            gloss = [g["text"] for g in s.get("gloss", []) if g.get("lang") == "eng"]
            if not gloss:
                continue
            senses.append({
                "pos": s.get("partOfSpeech", []),
                "gloss": gloss,
                "misc": s.get("misc", []),
                "field": s.get("field", []),
            })
        if not senses:
            continue

        entry = {
            "k": [{"t": k["text"], "c": k.get("common", False), "tg": k.get("tags", [])} for k in kanji_forms],
            "r": [{"t": r["text"], "c": r.get("common", False), "tg": r.get("tags", [])} for r in kana_forms],
            "s": senses,
        }
        shards.setdefault(shard, {})[seq] = entry

        preview_k = kanji_forms[0]["text"] if kanji_forms else None
        preview_r = primary_reading

        for k in kanji_forms:
            b = kanji_index_bucket(k["text"][0])
            kanji_index.setdefault(b, {})[k["text"]] = {"seq": seq, "shard": shard}

        seen_tokens = set()
        for s in senses:
            for g in s["gloss"]:
                seen_tokens |= gloss_tokens(g)
        for tok in seen_tokens:
            b = english_bucket(tok)
            bucket_map = english_index.setdefault(b, {})
            bucket_map.setdefault(tok, []).append({
                "seq": seq, "shard": shard, "k": preview_k, "r": preview_r,
            })

    os.makedirs(os.path.join(DATA, "words"), exist_ok=True)
    os.makedirs(os.path.join(DATA, "index", "kanji"), exist_ok=True)
    os.makedirs(os.path.join(DATA, "index", "english"), exist_ok=True)

    sizes = []
    for shard, entries in shards.items():
        p = os.path.join(DATA, "words", f"{shard}.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump(entries, f, ensure_ascii=False, separators=(",", ":"))
        sizes.append((shard, len(entries), os.path.getsize(p)))

    for bucket, m in kanji_index.items():
        p = os.path.join(DATA, "index", "kanji", f"{bucket}.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump(m, f, ensure_ascii=False, separators=(",", ":"))

    eng_sizes = []
    for bucket, m in english_index.items():
        p = os.path.join(DATA, "index", "english", f"{bucket}.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump(m, f, ensure_ascii=False, separators=(",", ":"))
        eng_sizes.append((bucket, len(m), os.path.getsize(p)))

    total_word_bytes = sum(s[2] for s in sizes)
    total_eng_bytes = sum(s[2] for s in eng_sizes)
    print(f"words: {len(shards)} shards, {sum(s[1] for s in sizes)} entries, "
          f"{total_word_bytes/1e6:.1f} MB total, largest shard "
          f"{max(sizes, key=lambda s: s[2])}")
    print(f"kanji-index: {len(kanji_index)} buckets")
    print(f"english-index: {len(english_index)} buckets, "
          f"{sum(s[1] for s in eng_sizes)} tokens, {total_eng_bytes/1e6:.1f} MB total, "
          f"largest bucket {max(eng_sizes, key=lambda s: s[2])}")


# ------------------------------------------------------------ kanji data --

def build_kanji():
    kanjidic_path = find_one("kanjidic2-en-*.json")
    kradfile_path = find_one("kradfile-*.json")

    with open(kanjidic_path, encoding="utf-8") as f:
        chars = json.load(f)["characters"]
    with open(kradfile_path, encoding="utf-8") as f:
        krad = json.load(f)["kanji"]

    out = {}
    jouyo_chars = set()
    grade_counts = {}
    for c in chars:
        misc = c.get("misc", {})
        grade = misc.get("grade")
        grade_counts[grade] = grade_counts.get(grade, 0) + 1
        jouyo = grade in (1, 2, 3, 4, 5, 6, 8)
        if jouyo:
            jouyo_chars.add(c["literal"])

        on, kun = [], []
        for group in c.get("readingMeaning", {}).get("groups", []):
            for r in group.get("readings", []):
                if r["type"] == "ja_on":
                    on.append(r["value"])
                elif r["type"] == "ja_kun":
                    kun.append(r["value"])

        meanings = []
        for group in c.get("readingMeaning", {}).get("groups", []):
            for m in group.get("meanings", []):
                if m.get("lang") == "en":
                    meanings.append(m["value"])

        out[c["literal"]] = {
            "strokes": (misc.get("strokeCounts") or [None])[0],
            "grade": grade,
            "freq": misc.get("frequency"),
            "jlpt_old": misc.get("jlptLevel"),
            "meanings": meanings,
            "readings_on": on,
            "readings_kun": kun,
            "radicals": krad.get(c["literal"], []),
            "jouyo": jouyo,
        }

    p = os.path.join(DATA, "kanji.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"kanji.json: {len(out)} kanji, {os.path.getsize(p)/1e6:.1f} MB, "
          f"{len(jouyo_chars)} jouyo (grade counts: {sorted(grade_counts.items(), key=lambda x: (x[0] is None, x[0]))})")
    return jouyo_chars


# --------------------------------------------------------------- radicals --

def parse_radicals_dat():
    entries = []
    skipped = []
    with open(APK_RADICALS, encoding="utf-8") as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            num, cp, variant_cp, strokes, name, reading = line.split(";")
            try:
                cp_int = int(cp, 16)
                variant_int = int(variant_cp, 16) if variant_cp != cp else None
                if 0xD800 <= cp_int <= 0xDFFF or (variant_int is not None and 0xD800 <= variant_int <= 0xDFFF):
                    raise ValueError("lone surrogate")
                char = chr(cp_int)
                variant = chr(variant_int) if variant_int is not None else None
            except ValueError:
                # source data has one corrupted row (line 76, flagged "[?]"
                # by JED's own author with a lone UTF-16 surrogate half) --
                # not a valid Kangxi radical (number 0), skip it.
                skipped.append(lineno)
                continue
            entries.append({
                "number": int(num),
                "char": char,
                "variant": variant,
                "strokes": int(strokes),
                "name": name,
                "readings": [r.strip() for r in reading.split(",")],
            })
    if skipped:
        print(f"radicals.dat: skipped {len(skipped)} corrupted row(s) at line(s) {skipped}")
    return entries


def build_radicals():
    radkfile_path = find_one("radkfile-*.json")
    with open(radkfile_path, encoding="utf-8") as f:
        radk = json.load(f)["radicals"]

    entries = parse_radicals_dat()
    out = []
    unmatched = 0
    for e in entries:
        radk_entry = radk.get(e["char"])
        if radk_entry is None and e["variant"]:
            radk_entry = radk.get(e["variant"])
        kanji_list = radk_entry["kanji"] if radk_entry else None
        if kanji_list is None:
            unmatched += 1
            kanji_list = []
        out.append({**e, "kanji": kanji_list})

    p = os.path.join(DATA, "radicals.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"radicals.json: {len(out)} entries, {unmatched} unmatched against RADKFILE, "
          f"{os.path.getsize(p)/1e6:.2f} MB")


# ------------------------------------------------------------- kana data --

def parse_dakuten_file(path):
    out = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k] = v
    return out


def parse_strict_kana(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            cells = [c.strip() for c in line.strip("|").split("|")]
            for cell in cells:
                cell = cell.strip()
                if not cell or cell.startswith("#"):
                    continue
                parts = cell.split(";")
                if len(parts) != 3:
                    continue
                hira, kata, romaji = parts
                if not (hira or kata or romaji):
                    continue
                rows.append({"hiragana": hira or None, "katakana": kata or None, "romaji": romaji})
    return rows


def build_kana():
    romaji_to_kana = parse_strict_kana(os.path.join(APK_KANA, "strict_kana.dat"))
    dakuten = parse_dakuten_file(os.path.join(APK_KANA, "dakuten.dat"))
    handakuten = parse_dakuten_file(os.path.join(APK_KANA, "handakuten.dat"))
    alternate_romaji = parse_dakuten_file(os.path.join(APK_KANA, "translation.dat"))

    out = {
        "romajiToKana": romaji_to_kana,
        "dakuten": dakuten,
        "handakuten": handakuten,
        "alternateRomaji": alternate_romaji,
    }
    p = os.path.join(DATA, "kana-romaji.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"kana-romaji.json: {len(romaji_to_kana)} kana rows, {len(dakuten)} dakuten, "
          f"{len(handakuten)} handakuten, {len(alternate_romaji)} alt-romaji, "
          f"{os.path.getsize(p)/1e3:.1f} KB")


# ------------------------------------------------------------- kanjivg --

def build_kanjivg(jouyo_chars):
    src_dir = os.path.join(SCRATCH, "kanjivg", "kanji")
    if not os.path.isdir(src_dir):
        # zip may have extracted one level deeper
        candidates = glob.glob(os.path.join(SCRATCH, "kanjivg", "**", "*.svg"), recursive=True)
        if not candidates:
            raise SystemExit(f"no kanjivg svgs found under {SCRATCH}/kanjivg")
        src_dir = os.path.dirname(candidates[0])

    out_dir = os.path.join(DATA, "kanjivg")
    os.makedirs(out_dir, exist_ok=True)

    found, missing = 0, []
    for ch in jouyo_chars:
        hexname = format(ord(ch), "05x")
        src = os.path.join(src_dir, f"{hexname}.svg")
        if os.path.exists(src):
            with open(src, "rb") as fin, open(os.path.join(out_dir, f"{hexname}.svg"), "wb") as fout:
                fout.write(fin.read())
            found += 1
        else:
            missing.append(ch)

    total_bytes = sum(os.path.getsize(os.path.join(out_dir, f)) for f in os.listdir(out_dir))
    print(f"kanjivg: {found}/{len(jouyo_chars)} jouyo kanji found, {len(missing)} missing, "
          f"{total_bytes/1e6:.1f} MB total")
    if missing:
        print(f"  missing sample: {missing[:20]}")


if __name__ == "__main__":
    os.makedirs(DATA, exist_ok=True)
    build_words()
    jouyo = build_kanji()
    build_radicals()
    build_kana()
    build_kanjivg(jouyo)
