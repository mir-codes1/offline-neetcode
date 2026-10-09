#!/usr/bin/env python3
"""Download the Monaco editor (min/vs, Python only) into static/vendor/monaco/vs. Stdlib only."""
import json
import os
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

VERSION = sys.argv[1] if len(sys.argv) > 1 else "0.52.2"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, "static", "vendor", "monaco")
LIST_URL = f"https://data.jsdelivr.com/v1/package/npm/monaco-editor@{VERSION}/flat"
FILE_URL = f"https://cdn.jsdelivr.net/npm/monaco-editor@{VERSION}/"


def wanted(name):
    if not name.startswith("/min/vs/"):
        return False
    rel = name[len("/min/vs/"):]
    if rel == "loader.js" or rel.startswith(("editor/", "base/")):
        # skip localised nls bundles (editor.main.nls.de.js etc.); keep the default one
        return not re.search(r"nls\.[a-z\-]+\.js$", rel)
    return rel.startswith("basic-languages/python/")


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def fetch(name):
    out = os.path.join(DEST, name[len("/min/"):])
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return name, True
    os.makedirs(os.path.dirname(out), exist_ok=True)
    for _ in range(3):
        try:
            data = get(FILE_URL + name[1:])
            with open(out, "wb") as f:
                f.write(data)
            return name, True
        except Exception:
            pass
    return name, False


def main():
    files = [f["name"] for f in json.loads(get(LIST_URL))["files"] if wanted(f["name"])]
    print(f"monaco-editor@{VERSION}: {len(files)} files")
    with ThreadPoolExecutor(8) as ex:
        bad = [n for n, ok in ex.map(fetch, files) if not ok]
    if bad:
        print("FAILED:", *bad, sep="\n  ")
        sys.exit(1)
    print("done ->", DEST)


if __name__ == "__main__":
    main()
