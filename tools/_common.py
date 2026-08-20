"""Shared helpers for the tools/build_*.py data-regeneration scripts."""
import glob
import os


def find_one(scratch, pattern):
    matches = glob.glob(os.path.join(scratch, pattern))
    if not matches:
        raise SystemExit(f"missing {pattern} in {scratch} -- run download_sources.py first")
    return matches[0]
