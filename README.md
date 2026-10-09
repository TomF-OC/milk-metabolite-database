# MetaBó-Bainne Milk Metabolite Database

The source for **https://data.metabobainne.ie**, the open-access database of the MetaBó-Bainne ¹H-NMR milk metabolomics studies.

**How it works:** you edit the source files listed below and push in GitHub Desktop. GitHub then rebuilds the website and publishes it, usually within one to two minutes. You can watch the progress on the repository's **Actions** tab: a green tick means it is live, and a red cross means something in the files stopped the build. Click into a failed run to see the error. The live site keeps showing the previous version until a build succeeds.

Never edit web pages directly: the site is regenerated from these files on every push.

## What to edit

| To change… | Edit |
|---|---|
| Measured values (mean ± SD, p-values) | `src/Book1.xlsx`, one sheet per study |
| Any page text: study titles, design, findings, citations, figure captions, funding, terms, contact | `src/site.json` |
| A metabolite's IDs, class, description or relevance text | `src/metabolites.csv` (opens in Excel; save as CSV UTF-8) |
| Study figures (PLS-DA, VIP, outlines) | `figures/<study-id>/`, and list them in that study's entry in `site.json` |
| Per-metabolite R plots | `figures/metabolites/<metabolite>/` (diet study) or `figures/seasonality-metabolites/<metabolite>/` |
| Logos | `brand/logo.png` (header), `brand/partners.png` (footer) |
| Design and charts | `src/style.css`, `src/app.js` |

`<metabolite>` is the lower-case name with hyphens, e.g. `glucose-1-phosphate`, `o-acetylcarnitine`. Replacing a figure file with one of the same name updates it everywhere it appears.

Tips:
- `site.json` is strict JSON. Keep the quotes and commas exactly as they are, and write a quote mark inside text as `\"`. If a build fails after editing it, paste the file into jsonlint.com to find the problem.
- Close Excel before committing, so its temporary `~$` lock file isn't picked up.

## Switch a chart off

Each study entry in `src/site.json` can have a `hide` list. For example, to remove the PCA and the dietary-shift chart from the diet study, add this line inside that study's entry, next to `"kind"`:

```
"hide": ["pca", "drivers", "shift"],
```

To bring a chart back, delete its name from the list. Names you can use:

| Diet study (`factorial`) | Seasonality study (`timecourse`) |
|---|---|
| `bars`: one metabolite, every diet and season | `year`: through the year (line chart, play button, fold-change bars) |
| `pca`: diet and season groups (PCA) | `clock`: seasonal clock |
| `drivers`: what drives each component | `pca`: seasonal trajectory (PCA) |
| `shift`: dietary shift across seasons | `fingerprint`: seasonal fingerprint heatmap |
| `pvalues`: significance table | `by_season`: by-season table |
| `figures`: published figures | `figures`: published figures |

If a name is misspelt, nothing is hidden, and the build log on the Actions tab shows a warning.

## Prepare a study before it goes public

A study can live in its own folder instead of in `site.json` and `Book1.xlsx`:

- `drafts/<study-id>/` is for unpublished work. This folder is listed in `.gitignore`, so it stays on your computer and is never uploaded to GitHub. It never appears on the public website.
- `src/studies/<study-id>/` is for published studies. Moving a draft folder here, then committing and pushing, publishes it.

Each study folder contains:
- `study.json`: title, summary, design, findings, citation and figure captions, in the same fields as the studies in `src/site.json`.
- The data files, e.g. `properties.csv` and `predictors.csv` for a study of milk properties.
- `figures/`: the study's images, referred to in `study.json` by file name only.

Example: the techno-functional study (milk composition, pH, rennet gelation and heat stability through the year, plus the metabolite prediction models) is in `drafts/techno-functional/`. Its study type is `"kind": "properties"`.

**To publish it once the paper is out:**
1. Fill in `citation` and `citation_url` in `drafts/techno-functional/study.json`.
2. Move the whole `techno-functional` folder from `drafts/` into `src/studies/`.
3. Commit and push. It then gets its own study page, a card on the home page, a "Predicts milk processing properties" section on the MetaBó-Card of every metabolite in its models, and CSV downloads.

To keep a study in `src/studies/` but hide it again, add `"visible": false,` to its `study.json`. For studies defined in `site.json`, the same `"visible": false,` line hides them; see the note on public files below.

**Note:** this repository is public, so anything committed under `src/` or `figures/` can be downloaded from github.com even while the study is hidden from the website. Keep unpublished data in `drafts/` only.

To preview drafts on your own computer, run `python3 build.py --show-hidden` and open `site/index.html`.

## Add a new study

1. **Data:** add a sheet to `src/Book1.xlsx` in the same layout as the existing ones: metabolite names down the first column, and a `mean ± SD` value in each cell.
   - For two crossed factors with p-values, like the diet × season sheet, the group headers look like `Spring - GRS`, followed by the p-value columns.
   - For successive time points, like the monthly seasonality sheet, there is one column per time point.
2. **Text:** in `src/site.json`, copy an existing study entry inside `"studies"` and change it:
   - `id`: a short web-safe name, e.g. `"housing-2027"`. It becomes the page address `studies/housing-2027.html`.
   - `sheet`: the exact sheet name in Book1.xlsx.
   - `kind`: `"factorial"` (like the diet study) or `"timecourse"` (like the seasonality study).
   - `title`, `short`, `summary`, `citation`, `citation_url`, `design`, `findings`, `figures` and the key markers (`vip_metabolites`).
3. **Metabolites:** add a row to `src/metabolites.csv` for any metabolite that isn't already in it. Names must match the spelling in Book1.xlsx.
4. **Figures:** put them in `figures/<id>/`. Per-metabolite plots go in their own folder, and you list that folder under `metabolite_figures` in the study entry, the same way the existing studies do it.
5. **Publish:** commit and push.

The new study gets its own page with interactive charts, PCA, tables and CSV downloads. It also appears on the home page and on every MetaBó-Card for the metabolites it measured. A study design that is neither factorial nor time-course needs a small code change in `build.py` and `src/app.js`.

## Building on your own computer (optional)

You only need this to preview changes before pushing:

```
pip install -r requirements.txt
python3 build.py
```

Then open `site/index.html` in a browser. The `site/` folder is never committed, because GitHub builds its own.

## Other files

- `build.py` turns the source files into the website.
- `tools/prepare_figures.py` imports a folder of R plots from a Notion export or R output. It expects one sub-folder per metabolite, with files ending `_Diet.jpg`, `_Diet_density.jpg`, `_Diet_line.jpg` and `_Diet_season.jpg`, and resizes them for the web:
  `python3 tools/prepare_figures.py "<path to the Metabolites folder>"`
- `ID_CHECK.csv` lists places where the two studies' tables disagree on a metabolite ID. Fix them in `src/metabolites.csv`.
- `.github/workflows/build-and-deploy.yml` is the automatic build and publish step.
- `CNAME` records the custom domain `data.metabobainne.ie`.

## Citations, DOIs and downloads

- Each study's `doi` field in `src/site.json` (for example `"doi": "10.3168/jds.2024-26168"`) is shown beside its citation on the study page and on the Data & citation page.
- `"show_downloads": false` near the top of `src/site.json` removes every CSV download from the website, including the Download buttons and the Downloads table. Change it to `true` to offer the CSV files again.

## Terms and archiving

Your Terms & Conditions are in `src/site.json` under `terms`, and appear on `terms.html`. To record when the terms took effect, fill in `terms_effective`.

To give the data a citable DOI, upload the CSV files from the site's Data page to zenodo.org as a *Dataset*. Choose a licence matching your terms (CC BY-NC 4.0) and link both papers.
