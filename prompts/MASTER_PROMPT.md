# TenderPack — Master Prompt for Claude Code

## How to use this file (for you, not for Claude Code)

1. Create an empty folder, e.g. `tenderpack/`, and open Claude Code in it.
2. Unzip `problem-pack.zip` into `tenderpack/test-data/` (so you have `test-data/sample-pack/requirements.json` and `test-data/sample-pack/documents/`).
3. Copy this file into the repo as `prompts/MASTER_PROMPT.md` (the commit rules require the AI prompt to be recorded).
4. Paste **PHASE 1** into Claude Code. Wait until it is done, tested and committed.
5. Deploy right after Phase 1 (Vercel or Netlify → import the GitHub repo → framework "Vite" → deploy). Every push redeploys.
6. Paste **PHASE 2**, then **PHASE 3** only if there is time left.
7. At the end, in the live app: load the sample pack, fix the problems, generate the package, save it as `output/T-2026-0417_Package.pdf`, take screenshots into `screenshots/`, commit, push. Stop at T+90.

---
---

# PHASE 1 PROMPT — Core app (paste everything below this line until "END OF PHASE 1")

You are building **TenderPack — Tender Document Package Builder**, a frontend-only React web app for a 90-minute hackathon. Work fast, but every required feature must be reliable. Do not build anything not listed in this phase.

## 0. Context

Office staff must turn a set of PDF files into **one complete, checked, correctly ordered PDF package** for a tender submission.
Input: a `requirements.json` file + many PDF files. Output: `<tender_id>_Package.pdf`.
A sample pack is in `test-data/sample-pack/` — use it for testing only. **Judges will test with a different, unseen pack in the same format.** Never hardcode anything from the sample (tender ID, titles, IDs, number of requirements, file names, dates).

## 1. Hard rules

- 100% in the browser. No backend, no database, no server upload, no external API, no cloud storage. All PDF processing happens locally.
- Must run in the latest Google Chrome.
- Input limits: PDF only, max 30 files, max 50 MB total.
- The app must never crash or show raw JavaScript errors. Every failure shows a friendly message (in the current language).

## 2. Stack

- Vite + React + **JavaScript** (no TypeScript).
- Tailwind CSS v4 via `@tailwindcss/vite` (`@import "tailwindcss";` in `index.css`).
- `pdf-lib` for validating, counting pages, merging, cover page and footers.
- `lucide-react` for icons.
- Web Crypto `crypto.subtle.digest("SHA-256", bytes)` for duplicate detection.
- `vitest` for unit tests.
- Fonts from Google Fonts: **Inter** (English UI) and **Hind Siliguri** or **Noto Sans Bengali** (Bangla UI).
- `vite.config.js`: set `base: "./"` so the build works on any static host.
- Do NOT add pdf.js in this phase. Preview = open the file's blob URL in a new tab (Chrome's built-in PDF viewer).

## 3. File structure

```
src/
  main.jsx
  App.jsx                    (layout only, small)
  index.css
  i18n.js                    (en/bn dictionaries + t() + Bangla digit/date helpers)
  state/
    useTenderStore.js        (useReducer: all state + actions)
  utils/
    requirements.js          (parse + validate requirements.json)
    pdfFile.js               (read file, %PDF- check, pdf-lib load, page count, SHA-256)
    status.js                (pure status engine — single source of truth)
    packageGenerator.js      (pure: bytes in → bytes out; NO DOM/React imports)
    pdfText.js               (safeText(): make strings WinAnsi-safe for Helvetica)
    download.js
  components/
    Header.jsx  LanguageSwitcher.jsx  TenderHeader.jsx  WorkflowSteps.jsx
    ReadinessSummary.jsx  BlockingIssues.jsx  UploadZone.jsx
    UploadedFileList.jsx  UploadedFileRow.jsx  RequirementChecklist.jsx
    RequirementRow.jsx  MatchSelect.jsx  ExpiryInput.jsx  StatusBadge.jsx
    GeneratePanel.jsx  EmptyState.jsx  Toasts.jsx
tests/
  status.test.js
  requirements.test.js
scripts/
  verify-sample.mjs          (Node smoke test, see section 12)
```

## 4. State (one reducer, no duplicated state)

```js
{
  tender: null | { tender_id, title, procuring_entity, bidder, submission_deadline },
  requirements: [],            // sorted by order ASC (then id)
  files: [],                   // { id, name, size, pages, hash, bytes }  (bytes = Uint8Array, kept in memory)
  matches: {},                 // { [requirementId]: fileId }
  expiry: {},                  // { [requirementId]: "YYYY-MM-DD" }
  lang: "en" | "bn",           // persist in localStorage (wrapped in try/catch)
  messages: []                 // toasts / rejected-file messages
}
```

Everything else is **derived** with `useMemo`: status per requirement, blocking list, duplicate groups (by hash), counts, readiness %, included documents, total pages, `canGenerate`.

Reducer rules:
- `assign(reqId, fileId)`: remove `fileId` from any other requirement first, then assign. Reject (with a message) if another file with the **same hash** is already matched to a **different** requirement.
- `unassign(reqId)`: removes the match **and** clears `expiry[reqId]`.
- `removeFile(fileId)`: removes the file, any match pointing to it, and that requirement's expiry.
- `loadRequirements(json)`: replaces tender + requirements, clears matches and expiry (keep uploaded files).
- `reset()`: "Start over" button (with confirm).

## 5. requirements.json loading (Task 4.1)

Format:
```json
{ "tender": { "tender_id": "...", "title": "...", "procuring_entity": "...", "bidder": "...", "submission_deadline": "YYYY-MM-DD" },
  "requirements": [ { "id": "R01", "order": 1, "title_en": "...", "title_bn": "...", "mandatory": true, "has_expiry": true } ] }
```
- Load via button and via drag-drop of a `.json` file.
- Validate: JSON parses; all 5 tender fields are non-empty strings; `submission_deadline` matches `^\d{4}-\d{2}-\d{2}$` and is a real calendar date; `requirements` is a non-empty array; each item has unique string `id`, numeric `order`, string `title_en`, booleans `mandatory` and `has_expiry`. If `title_bn` is missing, fall back to `title_en`.
- On error, show a clear message saying which field is wrong. Never crash.
- Show the tender details card and the checklist sorted by `order`.

## 6. Upload (Task 4.2)

- Drag-and-drop zone + file picker, `multiple`. Show "Reading PDF…" per file while processing.
- For each file:
  1. Not a PDF → reject: "`<name>` is not a PDF file. Only PDF files are accepted." Check the first 5 bytes are `%PDF-` (not just the extension).
  2. Would exceed 30 files → reject: "Maximum 30 PDF files allowed."
  3. Would exceed 50 MB total → reject: "Total size cannot exceed 50 MB."
  4. `PDFDocument.load(bytes)` with pdf-lib. If it throws (encrypted / damaged) → reject: "`<name>` could not be read. It may be damaged or password-protected." Never crash.
  5. Page count = `pdfDoc.getPageCount()`. Hash = SHA-256 hex of the bytes.
- Keep the original `Uint8Array` bytes in state. Always pass copies (`bytes.slice()`) to any library that may take ownership of a buffer.
- File list row: PDF icon, name, `N pages · 1.2 MB`, "Matched to: <title>" or "Not matched", **Duplicate** badge if any other file has the same hash ("Same content as `<other name>`"), **Preview** (opens blob URL in new tab) and **Remove** buttons.
- Rejected files appear in a dismissible message list so the user sees exactly what was rejected and why.

## 7. Matching (Task 4.3) + duplicates (Task 4.6)

- Each checklist row has a `<select>` labelled "Select PDF file", options = uploaded files (`name · N pages`) plus "— No file —" (undo).
- A file already used by another requirement is shown as disabled with "(used for <title>)" — or selecting it moves it (assign rule above). Pick one behaviour and make it obvious.
- A file whose duplicate twin is matched to another requirement is disabled with "(duplicate of `<name>`, already used)".
- Matching and unmatching are possible at any time.

## 8. Expiry + status engine (Tasks 4.4, 4.5, Section 5)

`<input type="date">` appears only when `has_expiry === true` AND a file is matched.

`src/utils/status.js` — pure, the only place statuses are computed:
```js
export const STATUS = { MISSING: "missing", EXPIRY_NEEDED: "expiry_needed", EXPIRED: "expired", NOT_PROVIDED: "not_provided", OK: "ok" };
export const BLOCKING = new Set([STATUS.MISSING, STATUS.EXPIRY_NEEDED, STATUS.EXPIRED]);
export function getStatus(req, fileId, expiryDate, deadline) {
  if (!fileId) return req.mandatory ? STATUS.MISSING : STATUS.NOT_PROVIDED;
  if (req.has_expiry) {
    if (!expiryDate) return STATUS.EXPIRY_NEEDED;
    if (expiryDate < deadline) return STATUS.EXPIRED;   // "YYYY-MM-DD" string compare. Same day = OK.
  }
  return STATUS.OK;
}
```
- **Never use `new Date()` to compare dates** (timezone off-by-one). Only string compare valid `YYYY-MM-DD`.
- Every requirement shows exactly one status, updated instantly on every change.
- Badges (icon + text, never colour alone): OK = green ✓, Missing = red ✕, Expired = red ✕, Expiry date needed = amber !, Not provided = grey ○.
- For Expired, show a hint: "Expired on <date>, before the deadline <deadline>. Upload a valid document."

## 9. Generate (Tasks 4.7, 4.8, Section 6)

**GeneratePanel**
- Disabled while any requirement is blocking. Show "N issues must be fixed before generating" and list each one: "• Trade License — Expired".
- When ready: strong success state "✓ Package ready — X documents, Y pages" and an enabled **Generate Package** button. Show a spinner while generating.
- Download as exactly `${tender_id}_Package.pdf` (only replace characters illegal in filenames `\ / : * ? " < > |` with `-`).

**`packageGenerator.js`** — pure function, no DOM:
```js
export async function buildPackage({ tender, includedDocs, createdDate }) // includedDocs: [{ req, file }] already sorted by order
  → Promise<Uint8Array>
```
1. **Cover page (page 1, English only, A4 595.28×841.89)**: heading "TENDER DOCUMENT PACKAGE"; Tender ID; Tender Title; Procuring Entity; Bidder; Submission Deadline; Package Created (today, local date, `YYYY-MM-DD`); then "Included Documents" as a numbered list in order: `1. Trade License (1 page)`. Use `title_en` always. Wrap long text using `font.widthOfTextAtSize`. If the list is long, reduce font size/line height so it fits on one page. Clean professional layout (Helvetica / Helvetica-Bold, a dark teal accent bar, thin rules).
2. **Documents**: for each included doc in `order`, `copyPages(src, src.getPageIndices())` and add every page in original order. Skip optional requirements with no file. Mandatory ones always have a file here.
3. **Footer on every page including the cover**: text exactly `${tender_id} | Page ${n} of ${total}`, computed after all pages are added.
   - **Do NOT draw on top of the original page content.** Some inputs are full-page scanned images. For every page add a 28pt strip below the visible area:
     - `crop = page.getCropBox()`; new box = `{x: crop.x, y: crop.y - 28, width: crop.width, height: crop.height + 28}`.
     - `page.setCropBox(...)` with the new box; set MediaBox to the union of the old MediaBox and the new box.
     - Draw a white rectangle over the strip, a thin light-grey line at its top, and the footer text centred in it (Helvetica 9.5pt, dark grey).
   - If `page.getRotation().angle` is 90/180/270, add the strip on the side that is visually at the bottom and rotate the text to match, so it reads correctly in a viewer.
4. All text drawn with standard fonts must go through `safeText()` (`pdfText.js`): convert smart quotes, en/em dashes, ellipsis and non-breaking spaces to ASCII; replace any other character Helvetica cannot encode with `?`. Drawing must never throw because of an unusual character in the JSON.

## 10. Bangla / English (Task 4.9)

- `English | বাংলা` switch in the header. The **whole UI** switches: every label, button, status, hint, empty state, error and toast. No hardcoded English strings in components — everything through `t(key, params)`.
- Requirement names: `title_bn` in Bangla mode, `title_en` in English mode.
- In Bangla mode, show numbers with Bangla digits (০-৯) and dates with `Intl.DateTimeFormat("bn-BD")`.
- Required translations include: Tender Package → টেন্ডার প্যাকেজ; Required Documents → প্রয়োজনীয় নথিপত্র; Generate Package → প্যাকেজ তৈরি করুন; Missing → অনুপস্থিত; Expiry date needed → মেয়াদের তারিখ দিন; Expired → মেয়াদোত্তীর্ণ; Not provided → প্রদান করা হয়নি; OK → ঠিক আছে; Expiry Date → মেয়াদ শেষের তারিখ; Duplicate → একই ফাইল (ডুপ্লিকেট); Remove → সরান; Preview → দেখুন.
- The generated PDF stays English.

## 11. UI / UX

Look: clean, trustworthy procurement software. Light neutral background, white rounded cards, subtle borders, strong typography, dark teal primary (#0F4C5C), professional status colours, lots of whitespace. No big illustrations, no heavy gradients, minimal animation.

Layout (one workspace, not a multi-page wizard):
1. **Header**: "TenderPack" + subtitle "Tender Document Package Builder", language switch, small lock icon "Processed locally in your browser".
2. **Empty state** (before JSON is loaded): one clear card "Step 1 — Load requirements.json" with button + drop area, and one sentence explaining the app.
3. **Tender card**: Tender ID (prominent), title, procuring entity, bidder, deadline.
4. **Workflow steps** (visual only): 1 Tender → 2 Documents → 3 Review → 4 Generate, with done ✓ / current / problem ! states.
5. **Readiness summary**: progress bar "X of Y documents ready", counts of issues and files.
6. **Two-column body on desktop** (stack on tablet): left = upload zone + file list; right (wider) = requirement checklist table (order · title · Required/Optional · file select · expiry · status).
7. **GeneratePanel** at the bottom (sticky on desktop) with blocking list or success state.

Usability for non-technical staff: big click targets, plain words, inline hints, visible focus rings, proper `<label>`s, keyboard accessible, good contrast. Must look good at 1366px, 1440px, 1920px and tablet widths, with no horizontal page scroll.

## 12. Testing (do this before finishing)

1. `tests/status.test.js` (vitest): every status rule, including expiry == deadline → OK, expiry one day before → Expired, optional+no file → Not provided, has_expiry+no date → Expiry date needed.
2. `tests/requirements.test.js`: valid JSON passes and is sorted by order; missing field / bad date / empty list fails with a message.
3. `scripts/verify-sample.mjs` (Node, imports the same `utils/` modules): reads `test-data/sample-pack/`, checks
   - `company_logo.png` is rejected as not-PDF;
   - `experience_cert.pdf` and `experience_cert (1).pdf` have equal hashes;
   - with trade_license_2025 (expiry 2025-06-30) on R01 → R01 = Expired and generation blocked;
   - with this valid assignment: R01 trade_license_2026 (2027-06-30), R02 03_tin_certificate, R03 04_vat_certificate, R04 bank_solvency (2026-12-31), R05 experience_cert, R08 02_technical_proposal, R09 01_financial_proposal, R10 scan_0042; R06 and R07 unmatched → statuses all OK / Not provided, not blocked;
   - `buildPackage` output has **16 pages** (cover + 1+1+1+1+2+6+2+1), Technical Proposal pages come before Financial Proposal pages (filenames are numbered the opposite way on purpose), and every page's CropBox is 28pt taller than the source.
   - Write the result to `test-data/out/T-2026-0417_Package.pdf` for inspection.
   (The test may hardcode sample file names; the **app code must not**.)
4. `npm run build` must pass with no errors. Run `npm run dev` and check there are no console errors.
5. Fix everything that fails, then re-run.

## 13. Git

- `git init` if needed, add a `.gitignore` (node_modules, dist, test-data/out).
- Commit after each milestone (about every 15–20 minutes): (1) scaffold + requirements loading, (2) upload + matching + status, (3) package generation, (4) Bangla + polish + tests.
- Commit message format (contest rule — must include the AI prompt used):
  ```
  <short summary of what changed>

  AI prompt: Phase 1 of prompts/MASTER_PROMPT.md — "Build TenderPack core: load requirements.json, upload/validate PDFs, match, expiry, status engine, duplicates, generate package with cover + footer, EN/BN UI."
  ```
- Add a short `README.md`: what the app does, how to run (`npm i`, `npm run dev`), how to use it in 5 steps, privacy note (everything stays in the browser), tech stack.

## 14. Definition of done

All of the following work with an unseen pack and no code changes: load list sorted by order; upload many PDFs with name + pages; reject non-PDF and unreadable PDFs clearly; remove files; 1-to-1 matching with change/undo; duplicates marked and blocked from matching to different documents; expiry input; exactly-one correct status updating live; Generate disabled with reasons while blocking; package = English cover + docs in order + all pages + `<tender_id> | Page X of Y` on every page without covering content; download named `<tender_id>_Package.pdf`; full EN/BN switch; tests + build pass; committed.

Report at the end: what was built, test results, anything not done.

# END OF PHASE 1

---
---

# PHASE 2 PROMPT — Quick bonuses (paste after Phase 1 is committed and deployed)

Phase 1 of TenderPack is done. Add these bonus features **in this order**, committing after each one. Do not break any Phase 1 behaviour; re-run tests, `scripts/verify-sample.mjs` and `npm run build` after each feature. All new UI text must be translated in `i18n.js` (EN + BN). Still 100% in-browser.

Commit message format: `<what changed>` + blank line + `AI prompt: Phase 2 of prompts/MASTER_PROMPT.md — "<feature name>"`.

1. **Load whole pack from a ZIP** (`jszip`): button "Load pack (.zip)". Find `requirements.json` anywhere in the zip (it may be inside a sub-folder). Take every file inside any `documents/` folder and send it through the **same** upload pipeline (so non-PDFs like `.png` are rejected with the normal message, limits apply, duplicates are detected). Ignore `__MACOSX` and dot-files.

2. **Auto-match from file names**: button "Auto-match files". Generic algorithm, no sample names:
   - Normalise file name (lowercase, drop extension, `_ - . ( )` and digits → spaces) and `title_en` into word tokens; drop stop words (of, the, and, a, for).
   - Score = shared tokens, plus a small generic synonym table for tender documents (licence/license; tin/tax; vat/bin; bank/solvency; experience/exp; technical/tech; financial/finance/price; declaration/undertaking; audit/audited; authorization/authorisation/maf).
   - Assign greedily by highest score, only to unmatched requirements and unused files, skipping a file whose duplicate twin is already used, minimum score 1. When two files tie for one requirement, prefer the one with the higher 4-digit year in its name (newer document).
   - Never overwrite existing matches. Mark auto-matched rows with a "Suggested — please check" tag until the user changes or confirms them. Toast: "8 files matched automatically. Please check them."

3. **Index page** (after the cover): checkbox "Include index page" (default ON). Lists each included document with the page number where it starts (final package numbering, including cover and index), e.g. `Trade License ........ 3`. Also show start pages on the cover list. Update `verify-sample.mjs`: with index → 17 pages; without → 16.

4. **Export checklist as CSV**: button "Export checklist (CSV)". Columns: Order, Document, Required, File name, Pages, Expiry date, Status. Document names and statuses in the current UI language. Add a UTF-8 BOM so Excel shows Bangla correctly. File name `${tender_id}_Checklist.csv`.

5. **Save and reopen** (IndexedDB, wrapped in try/catch, app still works if storage is unavailable): auto-save requirements, files (name + bytes), matches, expiry dates and options after every change (debounced). On start, restore and show a banner "Your previous work was restored · Start over". "Start over" clears storage.

Report what was added and the test results.

# END OF PHASE 2

---
---

# PHASE 3 PROMPT — Optional bonuses (only if time is left)

Phases 1 and 2 of TenderPack are done. Add these only if they can be finished safely; commit after each. Same rules: no regressions, tests + build pass, all UI text EN + BN.

Commit message format: `<what changed>` + blank line + `AI prompt: Phase 3 of prompts/MASTER_PROMPT.md — "<feature name>"`.

1. **Bangla text on the index page**: next to each English document name on the index page, show `title_bn`. pdf-lib cannot shape Bangla, so render each Bangla string onto an off-screen `<canvas>` using the Bangla web font (await `document.fonts.load(...)` first), export as PNG, and `embedPng` it into the PDF at the right size. The cover page stays English only. Keep `packageGenerator.js` pure: render the PNGs in the UI layer and pass them in.

2. **Seal or signature**: the user uploads a PNG image (check PNG signature bytes, reject anything else) and places it on chosen pages.
   - Page choice: a text field with final package page numbers/ranges (e.g. `3, 8-13`) plus quick buttons "Last page of each document" and "All document pages". Validate the input and show which pages it means.
   - Position preset: bottom-right / bottom-left / bottom-centre / top-right; size slider (60–180 pt width, keep aspect ratio).
   - Draw the seal inside the original page area (above the footer strip), before footers are added. Never on the cover.

3. **AI help with the user's own API key** (opt-in, the only feature allowed to call an external API):
   - Settings dialog: "Anthropic API key" (`type="password"`), kept in React state; optional "Remember on this device" → `sessionStorage`. Never put a key in code, `.env`, or the repo (Vite puts `VITE_*` vars into the public bundle).
   - Before the first call show: "The selected file will be sent to Anthropic to be read. Continue?"
   - "✨ Ask AI" button on each file row and "Ask AI for all unmatched files".
   - Use `@anthropic-ai/sdk` in the browser:
     ```js
     const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
     const response = await client.beta.messages.create({
       model: "claude-opus-5-5",
       max_tokens: 4000,
       betas: ["server-side-fallback-2026-07-01"],
       fallbacks: "default",
       output_config: {
         effort: "low",
         format: { type: "json_schema", schema: {
           type: "object",
           properties: {
             requirement_id: { type: "string", enum: [...requirementIds, "NONE"] },
             expiry_date: { type: "string", description: "YYYY-MM-DD or empty" },
             reason: { type: "string" }
           },
           required: ["requirement_id", "expiry_date", "reason"],
           additionalProperties: false
         } }
       },
       messages: [{ role: "user", content: [
         { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Pdf } },
         { type: "text", text: "This PDF is one document from a tender bid package. Which of these requirements does it match?\n<id: title_en (has expiry)> list\nIf the document shows an expiry / valid-until date, return it as YYYY-MM-DD, otherwise an empty string. Use NONE if nothing matches. Reason under 15 words." }
       ] }]
     });
     ```
     Check `response.stop_reason === "refusal"` before reading content; parse the first `text` block with `JSON.parse`. Convert bytes to base64 in chunks (no stack overflow on large files).
   - Show the result as a suggestion card: "AI suggests: Signed Declaration · no expiry · 'Signed declaration dated 2026-10-15'" with **Accept** / **Dismiss**. Accept = normal `assign` (all rules apply) + fill expiry if given and valid. The AI never changes anything without the user clicking Accept.
   - Friendly errors: invalid key (401), no internet, rate limit, file too large. The app works fully without a key.

Report what was added and the test results.

# END OF PHASE 3
