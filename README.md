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

## Privacy

Everything stays in your browser tab. Files are never uploaded, stored on a server or sent to
any external service. Closing the tab discards them.

## How the package is built

- **Cover page** (A4): tender ID, title, procuring entity, bidder, deadline, creation date and
  the numbered list of included documents with page counts.
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
  components/                 UI
tests/                        vitest unit tests
scripts/verify-sample.mjs     sample-pack smoke test
prompts/MASTER_PROMPT.md      the AI prompt used to build this app
```
