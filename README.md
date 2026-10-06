# TenderPack — Tender Document Package Builder

TenderPack turns a tender's `requirements.json` and a folder of PDF files into **one complete,
checked, correctly ordered PDF package** (`<tender_id>_Package.pdf`), ready for submission.

It runs **100% in the browser**: no server, no database, no uploads. Every PDF is read, checked
and merged locally on your computer.

## Run it

```bash
npm i
npm run dev        # http://localhost:5173
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Production build into `dist/` (static files, works on any host thanks to `base: "./"`) |
| `npm test` | Unit tests (vitest): status engine, requirements validation, PDF reading, package generation, i18n |
| `npm run verify` | End-to-end smoke test on the sample pack in `test-data/`; writes `test-data/out/<tender_id>_Package.pdf` |

## How to use it (5 steps)

1. **Load `requirements.json`**: click *Choose requirements.json* or drop the file on the page.
   The tender details and the list of required documents appear, sorted by `order`.
2. **Add the PDF files**: drop them on *Uploaded files* or click *Choose PDF files*. Each file
   shows its page count and size. Non-PDFs, damaged or password-protected PDFs are rejected with
   a clear reason. Identical files are marked **Duplicate**.
3. **Match each document**: in *Required Documents*, pick the PDF for every row. A file can be
   used for one document only; choosing a file that is used elsewhere moves it.
4. **Enter expiry dates** where asked. Every row shows exactly one status: OK, Missing,
   Expiry date needed, Expired (expiry before the submission deadline) or Not provided (optional).
5. **Generate Package**: the button unlocks when nothing is blocking. The download contains an
   English cover page, then every page of every document in the required order, with
   `<tender_id> | Page X of Y` on every page.

Switch between **English | বাংলা** at any time from the header; the whole interface follows.
The generated PDF is always in English.

### Time savers

- **Load pack (.zip)**: one click loads `requirements.json` (found anywhere in the zip) and every
  file inside a `documents/` folder, through the same checks as normal uploads. You can also drop a
  whole pack folder on the first screen.
- **Auto-match files**: suggests a file for every document that has none, by comparing file names
  with document names (with a small table of tender synonyms, newer year wins a tie). Suggestions
  are marked *Suggested — please check* until you confirm or change them.
- **Include index page** (on by default): an index after the cover lists where each document
  starts; the cover shows start pages too. Entries are clickable and the PDF has bookmarks.
- **Export checklist (CSV)**: order, document, required, file name, pages, expiry date and status
  in the current language, saved as `<tender_id>_Checklist.csv` (UTF-8 with BOM, opens in Excel).
- **Save and reopen**: your work (requirements, files, matches, dates, options) is saved in this
  browser's IndexedDB after every change and restored when you come back. *Start over* clears it.

## Privacy

Everything stays in your browser. Files are never uploaded, stored on a server or sent to
any external service. To let you continue later, your work is kept in this browser's own storage
(IndexedDB) on this computer only; *Start over* deletes it.

## How the package is built

- **Cover page** (A4): tender ID, title, procuring entity, bidder, deadline, creation date and
  the numbered list of included documents with page counts and start pages.
- **Index page** (optional): every document with the page where it starts, with dot leaders.
- **Documents** in requirement `order` (never by file name), all pages in their original order.
  Optional documents without a file are skipped.
- **Footer** `<tender_id> | Page N of M` on every page, including the cover. It is drawn in a
  28 pt strip *added below* each page (CropBox and MediaBox are extended), so it never covers
  original content such as full-page scans. Rotated pages get the strip on their visual bottom.
- Unusual characters in the JSON are converted to safe ASCII before drawing, so generation never
  fails because of a curly quote or a non-Latin character.

## Tech stack

- Vite + React (JavaScript), Tailwind CSS v4 (`@tailwindcss/vite`)
- [pdf-lib](https://pdf-lib.js.org/) for reading, page counting, merging, cover page and footers
- [JSZip](https://stuk.github.io/jszip/) for loading a whole pack from a .zip
- Web Crypto SHA-256 for duplicate detection (with a pure-JS fallback on non-secure origins)
- lucide-react icons, Inter + Hind Siliguri fonts
- vitest for unit tests

## Project layout

```
src/
  App.jsx, main.jsx, index.css, i18n.js
  state/useTenderStore.js     one reducer: all state + actions, derived data via useMemo
  utils/requirements.js       parse + validate requirements.json
  utils/pdfFile.js            %PDF- check, limits, pdf-lib load, page count, SHA-256
  utils/status.js             the status engine (single source of truth)
  utils/packageGenerator.js   pure: bytes in -> bytes out (cover, merge, footer strip)
  utils/pdfText.js            safeText() for Helvetica / WinAnsi
  utils/zipPack.js            read a pack .zip (requirements.json + documents/)
  utils/autoMatch.js          suggest matches from file names
  utils/csv.js                checklist CSV export
  utils/storage.js            IndexedDB save / restore
  components/                 UI
tests/                        vitest unit tests
scripts/verify-sample.mjs     sample-pack smoke test
prompts/MASTER_PROMPT.md      the AI prompt used to build this app
```
