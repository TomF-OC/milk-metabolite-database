#!/usr/bin/env python3
"""Build the Milk Metabolite Database website.

Reads   src/site.json              site text and the list of studies
        src/Book1.xlsx             study data (one sheet per study)
        src/metabolites.csv        one row per metabolite: class, role, optional IDs
        src/<season_sheet>.csv     optional seasonal summary for a time-course study
Writes  site/                      a static website ready for GitHub Pages

Run:    python3 build.py
Needs:  Python 3.9+, openpyxl, numpy
"""
import csv, html, json, math, re, shutil, sys
from pathlib import Path

import numpy as np
import openpyxl

ROOT = Path(__file__).parent
SRC, OUT = ROOT / "src", ROOT / "site"
CFG = json.loads((SRC / "site.json").read_text(encoding="utf-8"))
E = html.escape


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def mean_sd(cell):
    a, b = re.split(r"±", str(cell))
    return float(a), float(b)


def pnum(v):
    s = str(v).strip()
    return 0.0005 if s.startswith("<") else float(s)


def plabel(v):
    s = str(v).strip()
    if s.startswith("<"):
        return "<" + s.lstrip("<").strip()
    f = float(s)
    return f"{f:.3f}".rstrip("0").rstrip(".") if f < 1 else s


# ---------------------------------------------------------------- read data
# A study with "visible": false in site.json is left out of the website completely
# (no page, no charts, no data downloads, no figures). Preview it on your own computer with
#   python3 build.py --show-hidden
SHOW_HIDDEN = "--show-hidden" in sys.argv
HIDDEN = [st for st in CFG["studies"] if st.get("visible", True) is False and not SHOW_HIDDEN]
for st in HIDDEN:
    print(f"hidden study (not published): {st['id']}")
books = {}
def sheet_rows(st):
    wbname = st.get("workbook", "Book1.xlsx")  # optional: a study can keep its data in its own .xlsx
    path = SRC / wbname if (SRC / wbname).exists() else ROOT / wbname  # e.g. "drafts/new-study.xlsx"
    if path not in books:
        books[path] = openpyxl.load_workbook(path, data_only=True)
    return list(books[path][st["sheet"]].iter_rows(values_only=True))
studies = []
for st in CFG["studies"]:
    if st in HIDDEN:
        continue
    rows = sheet_rows(st)
    d = dict(st)
    if st["kind"] == "timecourse":
        head = rows[0]
        times = [h for h in head[1:] if h]
        recs = []
        for r in rows[1:]:
            if not r[0]:
                continue
            for i, t in enumerate(times):
                m, s = mean_sd(r[i + 1])
                recs.append({"m": r[0], "t": t, "i": i, "mean": m, "sd": s})
        d["levels"] = times
        d["rows"] = recs
        if st.get("season_sheet"):
            ss = list(csv.DictReader(open(SRC / st["season_sheet"], encoding="utf-8")))
            d["season_rows"] = [{"m": r["metabolite"], "season": r["season"], "mean": float(r["mean_mM"]), "sd": float(r["sd"])} for r in ss]
            d["seasons"] = list(dict.fromkeys(r["season"] for r in ss))
    else:
        hi = next(i for i, r in enumerate(rows) if r and r[1] and "-" in str(r[1]))
        head = rows[hi]
        groups = [h for h in head[1:] if h and not str(h).lower().startswith("p-value")]
        pcols = [h for h in head[1:] if h and str(h).lower().startswith("p-value")]
        recs, pv = [], []
        for r in rows[hi + 1:]:
            if not r[0]:
                continue
            for i, g in enumerate(groups):
                a, b = [x.strip() for x in str(g).split("-", 1)]
                m, s = mean_sd(r[i + 1])
                recs.append({"m": r[0], "a": a, "b": b, "mean": m, "sd": s})
            vals = r[1 + len(groups): 1 + len(groups) + len(pcols)]
            pv.append({"m": r[0], "p": [pnum(v) for v in vals], "pl": [plabel(v) for v in vals]})
        d["a_levels"] = list(dict.fromkeys(x["a"] for x in recs))
        d["b_levels"] = list(dict.fromkeys(x["b"] for x in recs))
        d["p_names"] = [re.sub(r"(?i)p-value\s*", "", str(p)).strip().replace("×", "×") for p in pcols]
        d["rows"], d["pvalues"] = recs, pv
    d["metabolites"] = list(dict.fromkeys(x["m"] for x in d["rows"]))
    studies.append(d)

# metabolite reference table (editable CSV)
mcsv = SRC / "metabolites.csv"
if not mcsv.exists():
    info = json.loads((SRC / "metabolite_info.json").read_text(encoding="utf-8"))
    with open(mcsv, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["metabolite", "class", "role", "hmdb_id", "chebi_id", "kegg_id", "pubchem_cid"])
        for r in info:
            w.writerow([r["metabolite"], r["class"], r["role"], "", "", "", ""])
meta = {r["metabolite"]: r for r in csv.DictReader(open(mcsv, encoding="utf-8"))}
all_mets = sorted({m for s in studies for m in s["metabolites"]}, key=str.lower)
for m in all_mets:
    meta.setdefault(m, {"metabolite": m, "class": "Other", "role": ""})
for m in all_mets:
    i = meta[m]
    own = i.get("text_source") == "MetaBó-Bainne" and i.get("biochem")
    i["short"] = re.split(r"(?<=[a-z\)])\. ", i["biochem"])[0].rstrip(".") + "." if own else i.get("role", "")
    i["lede"] = i["biochem"] if own else i.get("role", "")
classes = list(dict.fromkeys(meta[m]["class"] for m in sorted(all_mets, key=lambda x: meta[x]["class"])))


# ---------------------------------------------------------------- derived
def pca(labels, mets, cell):
    X = np.array([[math.log2(cell[(l, m)]) for m in mets] for l in labels])
    sd = X.std(0, ddof=1)
    keep = sd > 0
    X = (X[:, keep] - X[:, keep].mean(0)) / sd[keep]
    U, S, Vt = np.linalg.svd(X, full_matrices=False)
    if U[0, 0] > 0:
        U[:, 0] *= -1; Vt[0] *= -1
    if U[0, 1] > 0:
        U[:, 1] *= -1; Vt[1] *= -1
    var = S ** 2 / (S ** 2).sum()
    km = [m for m, k in zip(mets, keep) if k]
    return {
        "var": [round(float(v), 4) for v in var[:2]],
        "scores": [{"label": l, "pc1": round(float(U[i, 0] * S[0]), 4), "pc2": round(float(U[i, 1] * S[1]), 4)} for i, l in enumerate(labels)],
        "loadings": [{"m": m, "pc1": round(float(Vt[0, j]), 4), "pc2": round(float(Vt[1, j]), 4)} for j, m in enumerate(km)],
    }


for s in studies:
    if s["kind"] == "timecourse":
        cell = {(r["t"], r["m"]): r["mean"] for r in s["rows"]}
        s["pca"] = pca(s["levels"], s["metabolites"], cell)
        summ = {}
        for m in s["metabolites"]:
            rs = [r for r in s["rows"] if r["m"] == m]
            hi = max(rs, key=lambda r: r["mean"]); lo = min(rs, key=lambda r: r["mean"])
            avg = sum(r["mean"] for r in rs) / len(rs)
            summ[m] = {"peak": hi["t"], "low": lo["t"], "swing": round(hi["mean"] / lo["mean"], 1)}
            for r in rs:
                r["l2m"] = round(math.log2(r["mean"] / avg), 4)
                r["l2f"] = round(math.log2(r["mean"] / rs[0]["mean"]), 4)
        s["summary_by_met"] = summ
    else:
        groups = [f"{a} - {b}" for a in s["a_levels"] for b in s["b_levels"]]
        cell = {(f"{r['a']} - {r['b']}", r["m"]): r["mean"] for r in s["rows"]}
        s["pca"] = pca(groups, s["metabolites"], cell)
        for sc in s["pca"]["scores"]:
            sc["a"], sc["b"] = [x.strip() for x in sc["label"].split("-", 1)]
        bl = s["b_levels"]
        pairs = [(bl[i], bl[j]) for i in range(len(bl)) for j in range(len(bl) - 1, i, -1)]
        lut = {(r["m"], r["a"], r["b"]): r["mean"] for r in s["rows"]}
        s["contrasts"] = [f"{x} vs {y}" for x, y in pairs]
        s["shift"] = [{"m": m, "a": a, "c": f"{x} vs {y}", "v": round(math.log2(lut[(m, a, x)] / lut[(m, a, y)]), 4)}
                      for m in s["metabolites"] for a in s["a_levels"] for x, y in pairs]
        s["sig_counts"] = [sum(1 for p in s["pvalues"] if p["p"][k] < 0.05) for k in range(len(s["p_names"]))]

# cross-study seasonal agreement (first time-course vs first factorial with a season factor)
tc = next((s for s in studies if s["kind"] == "timecourse"), None)
fa = next((s for s in studies if s["kind"] == "factorial"), None)
cross = None
if tc and fa:
    pts = []
    for m in set(tc["metabolites"]) & set(fa["metabolites"]):
        rs = [r for r in tc["rows"] if r["m"] == m]
        early = sum(r["mean"] for r in rs[:3]) / 3; late = sum(r["mean"] for r in rs[-3:]) / 3
        fr = [r for r in fa["rows"] if r["m"] == m]
        first = [r["mean"] for r in fr if r["a"] == fa["a_levels"][0]]; last = [r["mean"] for r in fr if r["a"] == fa["a_levels"][-1]]
        pts.append({"m": m, "x": round(math.log2(late / early), 4), "y": round(math.log2((sum(last) / len(last)) / (sum(first) / len(first))), 4)})
    xs = np.array([p["x"] for p in pts]); ys = np.array([p["y"] for p in pts])
    cross = {"pts": sorted(pts, key=lambda p: p["m"]), "r": round(float(np.corrcoef(xs, ys)[0, 1]), 2),
             "x_label": f"{tc['short']}: last 3 vs first 3 {tc.get('time_label', 'time points').lower()}s",
             "y_label": f"{fa['short']}: {fa['a_levels'][-1].lower()} vs {fa['a_levels'][0].lower()}"}

# ---------------------------------------------------------------- write data
keep_d3 = (OUT / "assets" / "d3.min.js").read_bytes() if (OUT / "assets" / "d3.min.js").exists() else None
if OUT.exists():  # clear generated files but keep site/figures, which may hold the only copy of the figures
    for p in OUT.iterdir():
        if p.name == "figures":
            continue
        shutil.rmtree(p) if p.is_dir() else p.unlink()
(OUT / "assets").mkdir(parents=True, exist_ok=True)
(OUT / "data").mkdir()
(OUT / "metabolites").mkdir()
(OUT / "studies").mkdir()
d3src = SRC / "d3.min.js"
if d3src.exists():
    shutil.copy(d3src, OUT / "assets" / "d3.min.js")
elif keep_d3:
    (OUT / "assets" / "d3.min.js").write_bytes(keep_d3)
for f in ["style.css", "app.js"]:
    shutil.copy(SRC / f, OUT / "assets" / f)
(OUT / ".nojekyll").write_text("")
for d in ["figures", "brand"]:  # read from the repo root (figures/, brand/) and/or src/
    for base in (ROOT, SRC):
        if (base / d).exists():
            shutil.copytree(base / d, OUT / d, dirs_exist_ok=True)
in_use = {(s.get("metabolite_figures") or {}).get("dir") for s in CFG["studies"] if s not in HIDDEN}
for st in HIDDEN:  # keep a hidden study's figures off the website too
    for d in [f"figures/{st['id']}", (st.get("metabolite_figures") or {}).get("dir")]:
        if d and d not in in_use and (OUT / d).exists():
            shutil.rmtree(OUT / d)


def fig_html(root, f, cls="fig"):
    return (f'<figure class="{cls}"><a href="{root}{E(f["file"])}" class="lb" data-caption="{E(f.get("caption", ""))}" data-title="{E(f.get("title", ""))}">'
            f'<img src="{root}{E(f["file"])}" alt="{E(f.get("alt") or f.get("title", ""))}" loading="lazy" decoding="async"></a>'
            f'<figcaption>{("<b>" + E(f["title"]) + ".</b> ") if f.get("title") else ""}{E(f.get("caption", ""))}</figcaption></figure>')

downloads = []
for s in studies:
    fn = f"{s['id']}_means.csv"
    with open(OUT / "data" / fn, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        if s["kind"] == "timecourse":
            w.writerow(["metabolite", s.get("time_label", "time").lower(), "mean_mM", "sd_mM"])
            for r in s["rows"]:
                w.writerow([r["m"], r["t"], r["mean"], r["sd"]])
        else:
            w.writerow(["metabolite", s["factor_a"].lower(), s["factor_b"].lower(), "mean_mM", "sd_mM"])
            for r in s["rows"]:
                w.writerow([r["m"], r["a"], r["b"], r["mean"], r["sd"]])
    downloads.append((s, fn, "Group means and standard deviations (mM), long format."))
    if s["kind"] == "factorial":
        fn = f"{s['id']}_pvalues.csv"
        with open(OUT / "data" / fn, "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["metabolite"] + [f"p_{slug(n).replace('-', '_')}" for n in s["p_names"]])
            for p in s["pvalues"]:
                w.writerow([p["m"]] + p["pl"])
        downloads.append((s, fn, "P-values for each effect, as reported (<0.001 kept as text)."))
    if s.get("season_rows"):
        fn = f"{s['id']}_by_season.csv"
        with open(OUT / "data" / fn, "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["metabolite", "season", "mean_mM", "sd_mM"])
            for r in s["season_rows"]:
                w.writerow([r["m"], r["season"], r["mean"], r["sd"]])
        downloads.append((s, fn, "Seasonal means and standard deviations (mM), including the whole-lactation mean."))
with open(OUT / "data" / "metabolites.csv", "w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh)
    w.writerow(["metabolite", "metabobainne_id", "group", "chemical_class", "biochemical_description", "relevance_diet_study", "seasonal_trend", "mcdb_url", "pubchem_cid", "studies"])
    for m in all_mets:
        i = meta[m]
        w.writerow([m, i.get("mbb_id", ""), i["class"], i.get("chem_class", ""), i["lede"], i.get("relevance_diet", ""), i.get("relevance_season", ""), i.get("mcdb_url", ""), i.get("pubchem_cid", ""), ";".join(s["id"] for s in studies if m in s["metabolites"])])
downloads.append((None, "metabolites.csv", "Metabolite list with class, a short description and the studies that measured it."))

payload = {
    "studies": [{k: v for k, v in s.items() if k not in ("sheet", "season_sheet")} for s in studies],
    "mets": [{"m": m, "slug": slug(m), "cls": meta[m]["class"], "role": meta[m]["short"], "mbb": meta[m].get("mbb_id", ""),
              "vip": [s.get("vip_label", "Key marker") for s in studies if m in s.get("vip_metabolites", [])],
              "studies": [s["id"] for s in studies if m in s["metabolites"]]} for m in all_mets],
    "classes": classes,
    "cross": cross,
}
(OUT / "assets" / "data.js").write_text("window.MB=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")


# ---------------------------------------------------------------- pages
def page(path, title, body, root, kind, extra="", desc=""):
    nav = [("Studies", f"{root}index.html#studies"), ("MetaBó-Cards", f"{root}metabolites/index.html"), ("Data &amp; citation", f"{root}data.html")]
    navh = "".join(f'<a href="{h}">{t}</a>' for t, h in nav)
    full = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{E(title)}</title>
<meta name="description" content="{E(desc or CFG['tagline'])}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;1,400&family=Source+Sans+3:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="{root}assets/style.css">
</head>
<body data-page="{kind}" data-root="{root}" {extra}>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="wrap top-in">
    <a class="brand" href="{root}index.html">{('<img class="brand-logo" src="' + root + E(CFG['logo']) + '" alt="" width="32" height="40">') if CFG.get('logo') else '<span class="brand-mark" aria-hidden="true"></span>'}<span><b>{E(CFG['project'])}</b><span class="brand-sub">{E(CFG['site_title'])}</span></span></a>
    <nav class="nav" aria-label="Main">{navh}<a class="ext" href="{E(CFG['project_url'])}">Project website ↗</a></nav>
  </div>
</header>
<main id="main">
{body}
</main>
<footer class="foot">
  <div class="wrap foot-in">
    <div class="foot-main"><div><b>{E(CFG['project'])}</b> · {E(CFG['site_title'])}<br><span class="muted">{E(CFG['funding'])}</span></div>{('<img class="partners" src="' + root + E(CFG['partners_image']) + '" alt="' + E(CFG.get('partners_alt', 'Project partners')) + '" loading="lazy">') if CFG.get('partners_image') else ''}</div>
    <div class="muted">{('<a href="' + root + 'terms.html">Terms &amp; Conditions</a> · ') if CFG.get('terms') else ''}<a href="{root}data.html">How to cite and download</a> · <a href="{E(CFG['project_url'])}">metabobainne.ie</a></div>
  </div>
</footer>
<div class="tip" id="tip" role="status"></div>
<dialog class="lightbox" id="lightbox" aria-label="Figure"><form method="dialog"><button class="lb-close" aria-label="Close">×</button></form><img alt=""><p class="lb-cap"></p></dialog>
<script src="{root}assets/d3.min.js"></script>
<script src="{root}assets/data.js"></script>
<script src="{root}assets/app.js"></script>
</body>
</html>
"""
    p = OUT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(full, encoding="utf-8")


def fmt(v):
    return f"{v:.3f}".rstrip("0").rstrip(".") if v < 100 else f"{v:.1f}"


def cite_block(s):
    if not s.get("citation"):
        return ""
    link = f' <a href="{E(s["citation_url"])}">Read the paper ↗</a>' if s.get("citation_url") else ""
    return f'<p class="cite">{E(s["citation"])}{link}</p>'


# home
n_samples = "533"
study_cards = "".join(f"""
  <a class="study-card" href="studies/{s['id']}.html" id="card-{s['id']}">
    <span class="eyebrow">{E(s['short'])}</span>
    <h3>{E(s['title'])}</h3>
    <p>{E(s['summary'])}</p>
    <div class="study-viz" data-study-preview="{s['id']}" aria-hidden="true"></div>
    <span class="study-meta">{len(s['metabolites'])} metabolites · {('%d months' % len(s['levels'])) if s['kind'] == 'timecourse' else ('%d diets × %d seasons' % (len(s['b_levels']), len(s['a_levels'])))}</span>
  </a>""" for s in studies)
home = f"""
<section class="hero">
  <div class="wrap hero-in">
    <div class="hero-text">
      <p class="eyebrow">Open ¹H-NMR milk metabolomics</p>
      <h1>{E(CFG['site_title'])}</h1>
      <p class="lede">{E(CFG['tagline'])}</p>
      <div class="hero-stats">
        <div><b>{len(all_mets)}</b><span>metabolites</span></div>
        <div><b>{len(studies)}</b><span>studies</span></div>
        <div><b>{sum(len(s['rows']) for s in studies)}</b><span>published group means</span></div>
      </div>
      <form class="hero-search" role="search" action="metabolites/index.html">
        <label for="q" class="sr">Find a metabolite</label>
        <input id="q" name="q" type="search" placeholder="Find a metabolite, e.g. hippurate" autocomplete="off" list="met-list">
        <datalist id="met-list">{''.join(f'<option value="{E(m)}">' for m in all_mets)}</datalist>
        <button type="submit">Search</button>
      </form>
    </div>
    <figure class="spectrum" id="spectrum">
      <figcaption>Stylised ¹H-NMR spectrum of milk. Peak positions are approximate; hover a peak to see its metabolite.</figcaption>
    </figure>
  </div>
</section>
<section class="wrap block" id="studies">
  <div class="block-head"><h2>Studies</h2><p class="muted">Each study has its own interactive page, and every metabolite has a MetaBó-Card that joins the studies together.</p></div>
  <div class="study-grid">{study_cards}</div>
</section>
"""
if cross:
    home += f"""
<section class="wrap block" id="across">
  <div class="block-head"><h2>Do the two studies agree on season?</h2>
  <p class="muted">Each dot is a metabolite measured in both studies, plotted by how much it changed from early to late in the year. Dots near the dashed diagonal moved the same way, by a similar amount, in both. Correlation <b class="num">r = {cross['r']}</b> across {len(cross['pts'])} metabolites.</p></div>
  <div class="panel"><div class="chart" id="cross-chart" style="--h:420px"></div><ul class="legend" id="cross-legend"></ul></div>
</section>"""
home += f"""
<section class="wrap block" id="explore">
  <div class="block-head"><h2>Explore the metabolites</h2><p class="muted">Every metabolite has a MetaBó-Card with its biochemical role and its values in each study.</p></div>
  <div id="explorer" data-explorer="home"></div>
</section>"""
page("index.html", f"{CFG['site_title']} · {CFG['project']}", home, "", "home")

# study pages
for s in studies:
    root = "../"
    head = f"""
<section class="page-head">
  <div class="wrap">
    <p class="crumbs"><a href="../index.html#studies">Studies</a> / {E(s['short'])}</p>
    <h1>{E(s['title'])}</h1>
    <p class="lede">{E(s.get('intro') or s['summary'])}</p>
    {cite_block(s)}
  </div>
</section>"""
    if s["kind"] == "factorial":
        diets = "".join(f"""<article class="diet" style="--dc:var(--s{i + 1})"><h3><span class="code">{E(b)}</span> {E(s['level_names'].get(b, b))}</h3><p>{E(s['level_text'].get(b, ''))}</p></article>""" for i, b in enumerate(s["b_levels"]))
        tiles = "".join(f'<div class="tile"><b class="num">{c}</b><span>of {len(s["pvalues"])} metabolites changed by {E(n.lower())} (p &lt; 0.05)</span></div>' for n, c in zip(s["p_names"], s["sig_counts"]))
        body = head + f"""
<section class="wrap block">
  <div class="tiles">{tiles}</div>
</section>
<section class="wrap block" id="diets">
  <div class="block-head"><h2>The three feeding systems</h2></div>
  <div class="diet-grid">{diets}</div>
</section>
<section class="wrap block grid2" id="findings">
  <div class="panel"><div class="panel-head"><h2>Study design</h2></div><p>{E(s.get('design', ''))}</p>{fig_html(root, s['design_figure']) if s.get('design_figure') else ''}</div>
  <div class="panel"><div class="panel-head"><h2>Key findings</h2></div><ul class="findings">{''.join(f'<li>{E(f)}</li>' for f in s['findings'])}</ul></div>
</section>
{('<section class="wrap block" id="figures" data-chart="figures"><div class="block-head"><h2>Published figures</h2><p class="muted">From the multivariate analysis of individual milk samples. Click a figure to enlarge it.</p></div><div class="fig-grid">' + ''.join(fig_html(root, f) for f in s['figures']) + '</div></section>') if s.get('figures') else ''}
<section class="wrap block" id="explore-bars" data-chart="bars">
  <div class="panel">
    <div class="panel-head"><h2>One metabolite, every diet and season</h2>
    <p class="muted">Mean ± SD in mM. Press tour to step through every metabolite with a significant diet × season interaction.</p></div>
    <div class="controls"><label for="bar-met">Metabolite</label><select id="bar-met"></select><button class="btn" id="bar-tour" aria-pressed="false">▶ Tour interactions</button></div>
    <div class="chips" id="bar-chips"></div>
    <ul class="legend" id="bar-legend"></ul>
    <div class="chart" id="bar-chart" style="--h:320px"></div>
  </div>
</section>
<section class="wrap block grid2">
  <div class="panel" data-chart="pca">
    <div class="panel-head"><h2>Diet and season groups (PCA)</h2><p class="muted">PCA of the nine group means (log2, autoscaled). Each diet's path runs {E(' → '.join(s['a_levels']))}; dots grow through the year. PC1 explains <b class="num">{s['pca']['var'][0]:.1%}</b>, PC2 <b class="num">{s['pca']['var'][1]:.1%}</b>.</p></div>
    <div class="controls"><button class="btn" id="pca-load" aria-pressed="false">Show top loadings</button><button class="btn" id="pca-replay">↻ Replay</button></div>
    <ul class="legend" id="pca-legend"></ul>
    <div class="chart" id="pca-chart" style="--h:380px"></div>
  </div>
  <div class="panel" data-chart="drivers">
    <div class="panel-head"><h2>What drives each component</h2><p class="muted">The 12 metabolites with the largest loadings. Metabolites on the same side rise and fall together.</p></div>
    <div class="controls"><label for="drv-pc">Component</label><select id="drv-pc"><option value="pc1">PC1</option><option value="pc2">PC2</option></select></div>
    <div class="chart" id="drv-chart" style="--h:330px"></div>
  </div>
</section>
<section class="wrap block" data-chart="shift">
  <div class="panel">
    <div class="panel-head"><h2>Dietary shift across seasons</h2><p class="muted">How far one diet moves each metabolite relative to another, one dot per season. A long line means the diet effect depends on the season. Sort by a season to watch the ranking reshuffle.</p></div>
    <div class="controls"><label for="sh-c">Compare</label><select id="sh-c"></select><span class="muted">Sort by</span><div class="chips" id="sh-focus"></div></div>
    <ul class="legend" id="sh-legend"></ul>
    <div class="chart" id="sh-chart" style="--h:780px"></div>
  </div>
</section>
<section class="wrap block" data-chart="pvalues">
  <div class="panel">
    <div class="panel-head"><h2>Significance table</h2><p class="muted">P-values as reported. Bold values are below 0.05. Sort by any column; metabolite names open their MetaBó-Card.</p></div>
    <div class="controls"><input type="search" id="pv-q" placeholder="Search metabolites" aria-label="Search metabolites"><a class="btn" href="../data/{s['id']}_pvalues.csv" download>Download CSV</a></div>
    <div class="table-wrap"><table class="data" id="pv-table"></table></div>
  </div>
</section>"""
    else:
        seas_tbl = ""
        if s.get("season_rows"):
            seas_tbl = f"""
<section class="wrap block" data-chart="by_season">
  <div class="panel">
    <div class="panel-head"><h2>By season</h2><p class="muted">{E(s.get('season_def', ''))} Mean ± SD in mM. Shading runs from each metabolite's lowest season (light) to its highest (dark).</p></div>
    <div class="controls"><input type="search" id="ss-q" placeholder="Search metabolites" aria-label="Search metabolites"><a class="btn" href="../data/{s['id']}_by_season.csv" download>Download CSV</a></div>
    <div class="table-wrap"><table class="data" id="ss-table"></table></div>
  </div>
</section>"""
        body = head + f"""
<section class="wrap block grid2">
  <div class="panel"><div class="panel-head"><h2>Study design</h2></div><p>{E(s.get('design', ''))}</p><p class="muted">{E(s.get('season_def', ''))}</p>{fig_html(root, s['design_figure']) if s.get('design_figure') else ''}</div>
  <div class="panel"><div class="panel-head"><h2>Key findings</h2></div><ul class="findings">{''.join(f'<li>{E(f)}</li>' for f in s['findings'])}</ul></div>
</section>
{('<section class="wrap block" id="figures" data-chart="figures"><div class="block-head"><h2>Published figures</h2><p class="muted">From the multivariate analysis of all 533 milk samples. Click a figure to enlarge it.</p></div><div class="fig-grid wide">' + ''.join(fig_html(root, f) for f in s['figures']) + '</div></section>') if s.get('figures') else ''}
<section class="wrap block" data-chart="year">
  <div class="panel">
    <div class="panel-head"><h2>Through the year</h2><p class="muted">Monthly mean ± SD in mM. Press play to move through the months; every chart on this page follows the same month.</p></div>
    <div class="controls">
      <button class="btn" id="play" aria-pressed="false">▶ Play the year</button>
      <input type="range" id="month" min="1" max="{len(s['levels'])}" value="1" aria-label="Month">
      <span class="month-big" id="month-label">{E(s['levels'][0])}</span>
    </div>
    <div class="grid2 inner">
      <div>
        <div class="controls"><label for="line-met">Metabolite</label><select id="line-met"></select></div>
        <div class="chart" id="line-chart" style="--h:280px"></div>
        <p class="readout" id="readout"></p>
      </div>
      <div>
        <p class="sub-h">Fold change against {E(s['levels'][0])}, the 12 most seasonal metabolites</p>
        <div class="chart" id="race-chart" style="--h:334px"></div>
      </div>
    </div>
  </div>
</section>
<section class="wrap block grid2">
  <div class="panel" data-chart="clock">
    <div class="panel-head"><h2>Seasonal clock</h2><p class="muted">The most seasonal metabolites around the calendar against their own average. Pick up to four.</p></div>
    <div class="chips" id="clock-chips"></div>
    <div class="chart" id="clock-chart" style="--h:440px"></div>
  </div>
  <div class="panel" data-chart="pca">
    <div class="panel-head"><h2>Seasonal trajectory (PCA)</h2><p class="muted">PCA of the monthly means (log2, autoscaled); the path follows the calendar and the ring marks the selected month. PC1 explains <b class="num">{s['pca']['var'][0]:.1%}</b>, PC2 <b class="num">{s['pca']['var'][1]:.1%}</b>. The published PLS-DA used the individual samples.</p></div>
    <div class="controls"><button class="btn" id="pca-load" aria-pressed="false">Show top loadings</button><button class="btn" id="pca-replay">↻ Replay</button></div>
    <div class="chart" id="pca-chart" style="--h:380px"></div>
  </div>
</section>
<section class="wrap block" data-chart="fingerprint">
  <div class="panel">
    <div class="panel-head"><h2>Seasonal fingerprint</h2><p class="muted">Each metabolite against its own February–November average, ordered by the month it peaks. Click a row to chart it above.</p></div>
    <div class="grad"><span>½× average</span><span class="bar"></span><span>2× average</span></div>
    <div class="chart" id="heat-chart" style="--h:640px"></div>
  </div>
</section>{seas_tbl}"""
    for name in s.get("hide", []):  # charts switched off in site.json, e.g. "hide": ["pca", "shift"]
        if f'data-chart="{name}"' not in body:
            print(f"warning: {s['id']} hide: no chart called '{name}'")
        body = body.replace(f'data-chart="{name}"', f'data-chart="{name}" hidden')
    page(f"studies/{s['id']}.html", f"{s['title']} · {CFG['site_title']}", body, root, "study", f'data-study="{s["id"]}"', s["summary"])

# metabolite index
body = """
<section class="page-head"><div class="wrap">
  <p class="crumbs"><a href="../index.html">Home</a> / MetaBó-Cards</p>
  <h1>MetaBó-Cards</h1>
  <p class="lede">One card per metabolite: what it is, what it does in the cow and in milk, and how it behaved in each study.</p>
</div></section>
<section class="wrap block"><div id="explorer" data-explorer="full"></div></section>"""
page("metabolites/index.html", f"MetaBó-Cards · {CFG['site_title']}", body, "../", "index")

# metabolite pages
for k, m in enumerate(all_mets):
    sl = slug(m)
    info = meta[m]
    prev_m, next_m = all_mets[k - 1], all_mets[(k + 1) % len(all_mets)]
    q = m.replace("+", " ")
    links = [("HMDB", f"https://hmdb.ca/unearth/q?query={q}&searcher=metabolites"),
             ("PubChem", f"https://pubchem.ncbi.nlm.nih.gov/#query={q}"),
             ("ChEBI", f"https://www.ebi.ac.uk/chebi/beta/search?query={q}"),
             ("KEGG", f"https://www.genome.jp/dbget-bin/www_bfind_sub?mode=bfind&max_hit=100&dbkey=compound&keywords={q}")]
    if info.get("hmdb_id"):
        links[0] = ("HMDB " + info["hmdb_id"], f"https://hmdb.ca/metabolites/{info['hmdb_id']}")
    if info.get("pubchem_cid"):
        links[1] = ("PubChem " + info["pubchem_cid"], f"https://pubchem.ncbi.nlm.nih.gov/compound/{info['pubchem_cid']}")
    secs = ""
    for s in studies:
        if m not in s["metabolites"]:
            continue
        if s["kind"] == "factorial":
            rs = [r for r in s["rows"] if r["m"] == m]
            pv = next(p for p in s["pvalues"] if p["m"] == m)
            chips = "".join(f'<span class="chip{" sig" if p < 0.05 else ""}">{E(n)} p {E(pl) if str(pl).startswith("<") else "= " + E(pl)}</span>' for n, p, pl in zip(s["p_names"], pv["p"], pv["pl"]))
            thead = "<tr><th>" + E(s["factor_a"]) + "</th>" + "".join(f"<th>{E(b)}</th>" for b in s["b_levels"]) + "</tr>"
            tb = "".join("<tr><th>" + E(a) + "</th>" + "".join(f'<td>{fmt(r["mean"])} <span class="sd">± {fmt(r["sd"])}</span></td>' for b in s["b_levels"] for r in rs if r["a"] == a and r["b"] == b) + "</tr>" for a in s["a_levels"])
            secs += f"""
<section class="panel mc-sec" id="{s['id']}">
  <div class="panel-head"><p class="eyebrow"><a href="../studies/{s['id']}.html">{E(s['short'])}</a></p><h2>{E(s['title'])}</h2></div>
  <div class="chips">{chips}</div>
  <ul class="legend" data-legend="{s['id']}"></ul>
  <div class="chart" data-mc-chart="{s['id']}" style="--h:280px"></div>
  <div class="table-wrap"><table class="data compact"><thead>{thead}</thead><tbody>{tb}</tbody></table></div>
</section>"""
        else:
            sm = s["summary_by_met"][m]
            rs = [r for r in s["rows"] if r["m"] == m]
            ss = [r for r in s.get("season_rows", []) if r["m"] == m]
            stbl = ""
            if ss:
                stbl = '<div class="table-wrap"><table class="data compact"><thead><tr>' + "".join(f"<th>{E(r['season'])}</th>" for r in ss) + "</tr></thead><tbody><tr>" + "".join(f'<td>{fmt(r["mean"])} <span class="sd">± {fmt(r["sd"])}</span></td>' for r in ss) + "</tr></tbody></table></div>"
            mtbl = '<div class="table-wrap"><table class="data compact"><thead><tr>' + "".join(f"<th>{E(r['t'][:3])}</th>" for r in rs) + "</tr></thead><tbody><tr>" + "".join(f'<td>{fmt(r["mean"])}</td>' for r in rs) + "</tr></tbody></table></div>"
            secs += f"""
<section class="panel mc-sec" id="{s['id']}">
  <div class="panel-head"><p class="eyebrow"><a href="../studies/{s['id']}.html">{E(s['short'])}</a></p><h2>{E(s['title'])}</h2></div>
  <div class="facts"><div><span>Peak month</span><b>{E(sm['peak'])}</b></div><div><span>Lowest month</span><b>{E(sm['low'])}</b></div><div><span>Low to peak</span><b class="num">{sm['swing']}×</b></div></div>
  <div class="chart" data-mc-chart="{s['id']}" style="--h:260px"></div>
  {stbl}
  <details><summary>Monthly means (mM)</summary>{mtbl}</details>
</section>"""
    figs = ""
    for s in studies:
        mf = s.get("metabolite_figures")
        if not mf or m not in s["metabolites"]:
            continue
        items = [dict(it, file=f"{mf['dir']}/{sl}/{it['key']}.{it.get('ext', 'jpg')}", title=it["title"], alt=f"{m}: {it['title'].lower()}") for it in mf["items"] if any((base / mf["dir"] / sl / f"{it['key']}.{it.get('ext', 'jpg')}").exists() for base in (ROOT, SRC, OUT))]
        if items:
            figs += f'<section class="panel" id="figures-{s["id"]}"><div class="panel-head"><p class="eyebrow">{E(s["short"])} · individual samples</p><h2>Figures</h2><p class="muted">Plots of every milk sample in the {E(s["short"].lower())}. Click to enlarge.</p></div><div class="fig-grid two">' + "".join(fig_html("../", f) for f in items) + "</div></section>"
    about = ""
    if info.get("text_source") == "MetaBó-Bainne":
        ids = []
        if info.get("mbb_id"): ids.append(f'<div><dt>MetaBó-Bainne ID</dt><dd class="num">{E(info["mbb_id"])}</dd></div>')
        if info.get("mcdb_url"): ids.append(f'<div><dt>Milk Composition Database</dt><dd><a href="{E(info["mcdb_url"])}">{E(info["mcdb_url"].rstrip("/").split("/")[-1])} ↗</a></dd></div>')
        if info.get("pubchem_cid"): ids.append(f'<div><dt>PubChem compound</dt><dd><a href="https://pubchem.ncbi.nlm.nih.gov/compound/{E(info["pubchem_cid"])}">CID {E(info["pubchem_cid"])} ↗</a></dd></div>')
        about = f"""<section class="panel about" id="about"><div class="panel-head"><h2>About {E(m)}</h2></div>
  <dl class="about-dl">
    <div><dt>Chemical class</dt><dd>{E(info.get('chem_class', ''))}</dd></div>
    <div><dt>Biochemical description</dt><dd>{E(info.get('biochem', ''))}</dd></div>
    {('<div><dt>Note</dt><dd>' + E(info['note']) + '</dd></div>') if info.get('note') else ''}
    {('<div><dt>Relevance in milk and feeding systems · diet study</dt><dd>' + E(info['relevance_diet']) + '</dd></div>') if info.get('relevance_diet') else ''}
    {('<div><dt>Seasonal trend · seasonality study</dt><dd>' + E(info['relevance_season']) + '</dd></div>') if info.get('relevance_season') else ''}
  </dl>
  <dl class="ids">{''.join(ids)}</dl>
</section>"""
    vipb = "".join(f'<span class="vip" title="Variable importance in projection score above 1 in the {E(s["short"].lower())} PLS-DA">{E(s.get("vip_label", "Key marker"))} (VIP &gt; 1)</span>' for s in studies if m in s.get("vip_metabolites", []))
    related = [x for x in all_mets if meta[x]["class"] == info["class"] and x != m][:8]
    rel = "".join(f'<a class="chip link" href="{slug(x)}.html">{E(x)}</a>' for x in related)
    body = f"""
<section class="page-head mc-head" style="--cc:var(--k{classes.index(info['class']) + 1})">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">MetaBó-Cards</a> / {E(m)}</p>
    <div class="mc-title"><h1>{E(m)}</h1><span class="cls">{E(info['class'])}</span>{('<span class="mbb num">' + E(info['mbb_id']) + '</span>') if info.get('mbb_id') else ''}{vipb}</div>
    <p class="lede">{E(info['short'])}</p>
    <p class="ext-links">Look it up: {' · '.join(f'<a href="{E(u)}">{E(t)} ↗</a>' for t, u in links)}</p>
  </div>
</section>
<div class="wrap block mc-body">
  {about}
  {secs}
  {figs}
  <section class="panel"><div class="panel-head"><h2>Related metabolites</h2><p class="muted">Other {E(info['class'].lower())} compounds in the database.</p></div><div class="chips">{rel or '<span class="muted">None yet.</span>'}</div></section>
  <nav class="pager" aria-label="Browse metabolites"><a href="{slug(prev_m)}.html">← {E(prev_m)}</a><a href="{slug(next_m)}.html">{E(next_m)} →</a></nav>
</div>"""
    page(f"metabolites/{sl}.html", f"{m} · MetaBó-Card", body, "../", "metabolite", f'data-met="{E(m)}"', f"{m}: {info['short']}")

# data page
rows = "".join(f'<tr><td><a href="data/{fn}" download>{fn}</a></td><td>{E(s["short"]) if s else "All studies"}</td><td>{E(d)}</td></tr>' for s, fn, d in downloads)
cites = "".join(f'<li>{E(s["citation"])} <a href="{E(s["citation_url"])}">{E(s["citation_url"])}</a></li>' for s in studies if s.get("citation"))
lic = ""
if CFG.get("attribution"):
    lic += f'<p>When citing or referencing data from this site, please acknowledge:</p><blockquote class="attrib" id="attrib">{E(CFG["attribution"])}</blockquote><p class="muted">and the relevant publication above for the data you use.</p>'
if CFG.get("terms"):
    lic += '<p>The database is open access for research, educational and non-commercial use with attribution. See the <a href="terms.html">Terms &amp; Conditions</a>.</p>'
elif CFG.get("license_name"):
    lic += f'<p>Data on this site are shared under <a href="{E(CFG["license_url"])}">{E(CFG["license_name"])}</a>.</p>'
doi = f'<p>Dataset archive: <a href="https://doi.org/{E(CFG["dataset_doi"])}">doi:{E(CFG["dataset_doi"])}</a></p>' if CFG.get("dataset_doi") else ""
contact = f'<p>Questions about the data: <a href="mailto:{E(CFG["contact_email"])}">{E(CFG["contact_email"])}</a></p>' if CFG.get("contact_email") else ""
body = f"""
<section class="page-head"><div class="wrap">
  <p class="crumbs"><a href="index.html">Home</a> / Data &amp; citation</p>
  <h1>Data &amp; citation</h1>
  <p class="lede">Download the tables behind every chart, and cite the studies when you use them.</p>
</div></section>
<div class="wrap block">
  <section class="panel"><div class="panel-head"><h2>Downloads</h2><p class="muted">Plain CSV, UTF-8, one row per value. Concentrations are in mM; values are mean ± SD as published.</p></div>
  <div class="table-wrap"><table class="data"><thead><tr><th>File</th><th>Study</th><th>Contents</th></tr></thead><tbody>{rows}</tbody></table></div></section>
  <section class="panel"><div class="panel-head"><h2>How to cite</h2></div><ul class="findings">{cites}</ul>{doi}{lic}{contact}</section>
  <section class="panel"><div class="panel-head"><h2>Notes on the data</h2></div>
  <ul class="findings">
    <li>Metabolites were identified and quantified by ¹H-NMR spectroscopy.</li>
    <li>P-values reported as &lt;0.001 are kept as text in the downloads. The interactive charts treat them as the smallest values when sorting.</li>
    <li>The PCA plots on this site are computed from the published group means (log2-transformed, autoscaled) to give an overview. The published analyses used individual samples.</li>
    <li>Metabolite descriptions on the MetaBó-Cards are short general summaries. Follow the HMDB, PubChem, ChEBI and KEGG links for full reference information.</li>
  </ul></section>
</div>"""
page("data.html", f"Data & citation · {CFG['site_title']}", body, "", "data")
if CFG.get("terms"):
    secs = ""
    for i, t in enumerate(CFG["terms"], 1):
        bl = ""
        for x in t["blocks"]:
            if isinstance(x, dict):
                bl += "<ul>" + "".join(f"<li>{E(li)}</li>" for li in x["list"]) + "</ul>"
            else:
                txt = E(x)
                if "{email}" in x:
                    em = E(CFG.get("contact_email", ""))
                    txt = txt.replace("{email}", f'<a href="mailto:{em}">{em}</a>')
                bl += f"<p>{txt}</p>"
        secs += f'<section class="term" id="t{i}"><h2><span class="tn">{i}.</span> {E(t["title"])}</h2>{bl}</section>'
    eff = f'<p class="muted">Effective {E(CFG["terms_effective"])}</p>' if CFG.get("terms_effective") else ""
    body = f"""
<section class="page-head"><div class="wrap">
  <p class="crumbs"><a href="index.html">Home</a> / Terms &amp; Conditions</p>
  <h1>Terms &amp; Conditions</h1>{eff}
</div></section>
<div class="wrap block"><div class="panel terms">{secs}</div></div>"""
    page("terms.html", f"Terms & Conditions · {CFG['site_title']}", body, "", "data")
page("404.html", "Page not found", '<section class="page-head"><div class="wrap"><h1>Page not found</h1><p class="lede"><a href="index.html">Back to the database home page</a></p></div></section>', "", "data")
print(f"Built {len(all_mets)} MetaBó-Cards and {len(studies)} study pages in {OUT}")
