#!/usr/bin/env python3
"""Download upstream dictionary sources into a scratch directory.

Sources (all openly licensed, see ../CREDITS.md):
  - JMdict (English) + KANJIDIC2 (English) + KRADFILE + RADKFILE +
    JMdict-with-examples (English), pre-converted to JSON by
    github.com/scriptin/jmdict-simplified
  - KanjiVG stroke-order SVGs, github.com/KanjiVG/kanjivg

Usage:
  python3 download_sources.py [scratch_dir]

Downloads .tgz/.zip archives and extracts them; does not touch data/.
Run build_data.py afterwards to produce the shipped data/ files.
"""
import json
import os
import sys
import tarfile
import urllib.request
import zipfile

SCRATCH = sys.argv[1] if len(sys.argv) > 1 else "/tmp/jed-build"


def get(url, dest):
    print(f"GET {url}")
    urllib.request.urlretrieve(url, dest)


def latest_release_assets(repo, name_filter):
    with urllib.request.urlopen(f"https://api.github.com/repos/{repo}/releases/latest") as r:
        rel = json.load(r)
    return [a for a in rel["assets"] if name_filter(a["name"])], rel["tag_name"]


def main():
    os.makedirs(SCRATCH, exist_ok=True)

    assets, tag = latest_release_assets(
        "scriptin/jmdict-simplified",
        lambda n: n.endswith(".json.tgz")
        and any(n.startswith(p) for p in ("jmdict-eng-", "kanjidic2-en-", "kradfile-", "radkfile-", "jmdict-examples-eng-")),
    )
    print(f"jmdict-simplified release: {tag}")
    for a in assets:
        dest = os.path.join(SCRATCH, a["name"])
        if not os.path.exists(dest):
            get(a["browser_download_url"], dest)
        with tarfile.open(dest) as tf:
            tf.extractall(SCRATCH)

    kv_assets, kv_tag = latest_release_assets("KanjiVG/kanjivg", lambda n: n.endswith("-main.zip"))
    print(f"kanjivg release: {kv_tag}")
    if kv_assets:
        a = kv_assets[0]
        dest = os.path.join(SCRATCH, a["name"])
        if not os.path.exists(dest):
            get(a["browser_download_url"], dest)
        kanjivg_dir = os.path.join(SCRATCH, "kanjivg")
        os.makedirs(kanjivg_dir, exist_ok=True)
        with zipfile.ZipFile(dest) as zf:
            zf.extractall(kanjivg_dir)

    print("Done. Scratch dir:", SCRATCH)


if __name__ == "__main__":
    main()
