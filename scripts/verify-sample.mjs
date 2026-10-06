// Smoke test against the sample pack, using the same utils/ modules as the app.
//   node scripts/verify-sample.mjs [path/to/sample-pack]
// This script may name sample files; the app code never does.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { PDFDocument, PDFName, PDFArray, PDFRawStream } from "pdf-lib";
import { parseRequirementsText } from "../src/utils/requirements.js";
import { inspectIncomingFile } from "../src/utils/pdfFile.js";
import { STATUS, buildChecklist, summarizeChecklist } from "../src/utils/status.js";
import { FOOTER_HEIGHT, buildPackage, footerText } from "../src/utils/packageGenerator.js";
import { todayLocalYmd } from "../src/utils/dates.js";
import { readPackZip } from "../src/utils/zipPack.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [process.argv[2], "test-data/sample-pack", "test-data/problem-pack/sample-pack"].filter(Boolean);
const packDir = candidates.map((c) => path.resolve(root, c)).find((dir) => fs.existsSync(path.join(dir, "requirements.json")));
if (!packDir) {
  console.error(`Sample pack not found. Looked in: ${candidates.join(", ")}`);
  process.exit(1);
}

let failures = 0;
function check(ok, label, detail = "") {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${!ok && detail ? `\n          ${detail}` : ""}`);
  if (!ok) failures += 1;
}
const section = (title) => console.log(`\n${title}`);

console.log(`Sample pack: ${path.relative(root, packDir)}`);
const outDir = path.join(root, "test-data", "out");
fs.mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- requirements
section("requirements.json");
const parsed = parseRequirementsText(fs.readFileSync(path.join(packDir, "requirements.json"), "utf8"));
check(parsed.ok, "requirements.json is valid", JSON.stringify(parsed.error));
if (!parsed.ok) process.exit(1);
const { tender, requirements } = parsed;
check(
  requirements.every((r, i) => i === 0 || requirements[i - 1].order <= r.order),
  `${requirements.length} requirements sorted by order`,
);

// ---------------------------------------------------------------- upload pipeline
section("Upload pipeline");
const docDir = path.join(packDir, "documents");
const accepted = {};
const rejected = {};
let existing = { count: 0, totalBytes: 0 };
for (const name of fs.readdirSync(docDir).sort()) {
  const file = new File([fs.readFileSync(path.join(docDir, name))], name);
  const result = await inspectIncomingFile(file, existing);
  if (result.ok) {
    accepted[name] = result.file;
    existing = { count: existing.count + 1, totalBytes: existing.totalBytes + result.file.size };
  } else {
    rejected[name] = result.error.code;
  }
}
check(rejected["company_logo.png"] === "not_pdf", "company_logo.png is rejected as not a PDF", JSON.stringify(rejected));
check(Object.keys(rejected).length === 1, "every other file is accepted", JSON.stringify(rejected));
check(
  Boolean(accepted["experience_cert.pdf"]) &&
    accepted["experience_cert.pdf"].hash === accepted["experience_cert (1).pdf"]?.hash,
  'experience_cert.pdf and "experience_cert (1).pdf" have equal SHA-256',
);
check(
  accepted["trade_license_2025.pdf"]?.hash !== accepted["trade_license_2026.pdf"]?.hash,
  "trade_license_2025.pdf and trade_license_2026.pdf differ",
);
for (const [name, file] of Object.entries(accepted)) {
  const expected = createHash("sha256").update(file.bytes).digest("hex");
  if (file.hash !== expected) check(false, `SHA-256 of ${name} matches Node crypto`);
}

// ---------------------------------------------------------------- zip pack
section("ZIP pack");
const zip = new JSZip();
zip.file("sample-pack/requirements.json", fs.readFileSync(path.join(packDir, "requirements.json")));
zip.file("sample-pack/README.txt", "not a document");
for (const name of fs.readdirSync(docDir)) zip.file(`sample-pack/documents/${name}`, fs.readFileSync(path.join(docDir, name)));
zip.file("__MACOSX/sample-pack/documents/._scan_0042.pdf", "resource fork");
zip.file("sample-pack/documents/.DS_Store", "finder junk");
const zipBytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
fs.writeFileSync(path.join(outDir, "sample-pack.zip"), zipBytes);
const pack = await readPackZip(new File([zipBytes], "sample-pack.zip"));
check(pack.ok && parseRequirementsText(pack.requirementsText).ok, "requirements.json is found inside a sub-folder of the zip");
const zipNames = pack.ok ? pack.documents.map((d) => d.name).sort() : [];
check(
  JSON.stringify(zipNames) === JSON.stringify(fs.readdirSync(docDir).sort()),
  "only the documents/ files are taken (README, __MACOSX and dot-files ignored)",
  zipNames.join(", "),
);
const zipResults = {};
let zipExisting = { count: 0, totalBytes: 0 };
for (const doc of pack.ok ? pack.documents : []) {
  const result = await inspectIncomingFile(doc, zipExisting);
  zipResults[doc.name] = result.ok ? result.file.hash : result.error.code;
  if (result.ok) zipExisting = { count: zipExisting.count + 1, totalBytes: zipExisting.totalBytes + result.file.size };
}
check(
  zipResults["company_logo.png"] === "not_pdf" &&
    Object.entries(accepted).every(([name, file]) => zipResults[name] === file.hash),
  "zip documents go through the same pipeline with the same results",
);

// ---------------------------------------------------------------- statuses
section("Status engine");
const files = Object.values(accepted);
function evaluate(assignment, expiry) {
  const matches = Object.fromEntries(Object.entries(assignment).map(([reqId, name]) => [reqId, accepted[name].id]));
  const rows = buildChecklist({ requirements, files, matches, expiry, deadline: tender.submission_deadline });
  return { rows, summary: summarizeChecklist(rows), statusOf: (id) => rows.find((row) => row.req.id === id)?.status };
}

const expiredCase = evaluate({ R01: "trade_license_2025.pdf" }, { R01: "2025-06-30" });
check(expiredCase.statusOf("R01") === STATUS.EXPIRED, "R01 = trade_license_2025 (expiry 2025-06-30) is Expired");
check(!expiredCase.summary.canGenerate, "generation is blocked while R01 is Expired");

const validAssignment = {
  R01: "trade_license_2026.pdf",
  R02: "03_tin_certificate.pdf",
  R03: "04_vat_certificate.pdf",
  R04: "bank_solvency.pdf",
  R05: "experience_cert.pdf",
  R08: "02_technical_proposal.pdf",
  R09: "01_financial_proposal.pdf",
  R10: "scan_0042.pdf",
};
const validCase = evaluate(validAssignment, { R01: "2027-06-30", R04: "2026-12-31" });
const statusLine = validCase.rows.map((row) => `${row.req.id}=${row.status}`).join(" ");
check(
  validCase.rows.every((row) =>
    ["R06", "R07"].includes(row.req.id) ? row.status === STATUS.NOT_PROVIDED : row.status === STATUS.OK,
  ),
  "valid assignment: all OK, R06 and R07 Not provided",
  statusLine,
);
check(validCase.summary.canGenerate, "generation is not blocked");

// ---------------------------------------------------------------- package
section("Package");
const includedDocs = validCase.summary.included.map(({ req, file }) => ({ req, file }));
const packageBytes = await buildPackage({ tender, includedDocs, createdDate: todayLocalYmd() });
const pkg = await PDFDocument.load(packageBytes);
const pkgPages = pkg.getPages();
const expectedTotal = 1 + includedDocs.reduce((sum, doc) => sum + doc.file.pages, 0);
check(pkgPages.length === 16 && expectedTotal === 16, `package has 16 pages (got ${pkgPages.length})`);

function contentStreams(doc, page) {
  const contents = page.node.get(PDFName.of("Contents"));
  const resolved = doc.context.lookup(contents);
  const refs = resolved instanceof PDFArray ? resolved.asArray() : [contents];
  return refs.map((ref) => doc.context.lookup(ref)).filter((stream) => stream instanceof PDFRawStream);
}
const fingerprint = (stream) => createHash("sha256").update(stream.contents).digest("hex");
function decodedText(doc, page) {
  return contentStreams(doc, page)
    .map((stream) => {
      const filter = stream.dict.get(PDFName.of("Filter"));
      try {
        return filter && String(filter) === "/FlateDecode"
          ? zlib.inflateSync(Buffer.from(stream.contents)).toString("latin1")
          : Buffer.from(stream.contents).toString("latin1");
      } catch {
        return "";
      }
    })
    .join("\n");
}

// Expected source page for every package page (index 0 = cover).
const expected = [{ label: "cover" }];
for (const doc of includedDocs) {
  const src = await PDFDocument.load(doc.file.bytes.slice());
  src.getPages().forEach((page, index) => {
    expected.push({
      label: `${doc.req.title_en} p.${index + 1}`,
      reqId: doc.req.id,
      streams: contentStreams(src, page).map(fingerprint),
      crop: page.getCropBox(),
    });
  });
}

let orderOk = true;
let cropOk = true;
let footerOk = true;
pkgPages.forEach((page, index) => {
  const want = expected[index];
  if (index > 0 && want) {
    const have = new Set(contentStreams(pkg, page).map(fingerprint));
    if (!want.streams.every((fp) => have.has(fp))) {
      orderOk = false;
      console.log(`          page ${index + 1} is not ${want.label}`);
    }
  }
  const crop = page.getCropBox();
  const media = page.getMediaBox();
  const sourceHeight = index === 0 ? 841.89 : want?.crop.height;
  if (Math.abs(crop.height - (sourceHeight + FOOTER_HEIGHT)) > 0.01) {
    cropOk = false;
    console.log(`          page ${index + 1}: CropBox height ${crop.height}, source ${sourceHeight}`);
  }
  if (crop.x < media.x || crop.y < media.y || crop.x + crop.width > media.x + media.width + 0.01 || crop.y + crop.height > media.y + media.height + 0.01) {
    cropOk = false;
    console.log(`          page ${index + 1}: CropBox outside MediaBox`);
  }
  const hex = Buffer.from(footerText(tender.tender_id, index + 1, pkgPages.length), "latin1").toString("hex");
  if (!decodedText(pkg, page).toLowerCase().includes(hex)) {
    footerOk = false;
    console.log(`          page ${index + 1}: footer text not found`);
  }
});
check(orderOk, "every package page is the right source page, in requirement order");

const firstOf = (reqId) => expected.findIndex((e) => e.reqId === reqId) + 1;
const lastOf = (reqId) => expected.map((e) => e.reqId).lastIndexOf(reqId) + 1;
check(
  lastOf("R08") < firstOf("R09"),
  `Technical Proposal (pages ${firstOf("R08")}-${lastOf("R08")}) comes before Financial Proposal (pages ${firstOf("R09")}-${lastOf("R09")})`,
);
check(cropOk, `every page's CropBox is ${FOOTER_HEIGHT}pt taller than its source and inside the MediaBox`);
check(footerOk, `every page has the footer "${footerText(tender.tender_id, "N", pkgPages.length)}"`);

const outFile = path.join(outDir, `${tender.tender_id}_Package.pdf`);
fs.writeFileSync(outFile, packageBytes);
console.log(`\nWrote ${path.relative(root, outFile)} (${(packageBytes.length / 1024).toFixed(1)} KB)`);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
