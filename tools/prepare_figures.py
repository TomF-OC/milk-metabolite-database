#!/usr/bin/env python3
"""Resize R/Notion figures for the web.

Usage: python3 tools/prepare_figures.py <folder with one sub-folder per metabolite>
Each sub-folder's *_Diet.jpg, *_Diet_density.jpg, *_Diet_line.jpg and *_Diet_season.jpg
become src/figures/metabolites/<slug>/{diet,density,line,season}.jpg (1600 px wide).
"""
import re, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "figures" / "metabolites"
ALIAS = {"Caprate Caprylate": "Caprate+Caprylate"}
KINDS = {"_Diet_density": "density", "_Diet_line": "line", "_Diet_season": "season", "_Diet": "diet"}

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def save(src, dst, width=1600):
    im = Image.open(src).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "JPEG", quality=82, optimize=True, progressive=True)

if __name__ == "__main__":
    base = Path(sys.argv[1])
    n = 0
    for d in sorted(p for p in base.iterdir() if p.is_dir()):
        name = ALIAS.get(d.name, d.name)
        for f in d.glob("*.jpg"):
            for suf, kind in KINDS.items():
                if f.stem.endswith(suf):
                    save(f, OUT / slug(name) / f"{kind}.jpg"); n += 1
                    break
    print(f"{n} figures written to {OUT}")
