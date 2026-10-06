import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { readPackZip } from "../src/utils/zipPack.js";
import { inspectIncomingFile } from "../src/utils/pdfFile.js";

const requirementsJson = JSON.stringify({
  tender: { tender_id: "T-Z", title: "Zip", procuring_entity: "E", bidder: "B", submission_deadline: "2026-12-01" },
  requirements: [{ id: "R1", order: 1, title_en: "Doc", mandatory: true, has_expiry: false }],
});

async function pdfBytes() {
  const doc = await PDFDocument.create();
  doc.addPage();
  return doc.save();
}

async function zipFile(entries, name = "pack.zip") {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  return new File([await zip.generateAsync({ type: "uint8array" })], name);
}

describe("readPackZip", () => {
  it("finds requirements.json in a sub-folder and takes only files inside documents/", async () => {
    const pdf = await pdfBytes();
    const file = await zipFile({
      "my-pack/README.txt": "readme",
      "my-pack/requirements.json": requirementsJson,
      "my-pack/documents/a.pdf": pdf,
      "my-pack/documents/sub/b.pdf": pdf,
      "my-pack/documents/logo.png": "PNG",
      "my-pack/documents/.DS_Store": "junk",
      "__MACOSX/my-pack/documents/._a.pdf": "junk",
    });
    const pack = await readPackZip(file);
    expect(pack.ok).toBe(true);
    expect(JSON.parse(pack.requirementsText).tender.tender_id).toBe("T-Z");
    expect(pack.documents.map((d) => d.name)).toEqual(["a.pdf", "logo.png", "b.pdf"]);
  });

  it("sends documents through the normal pipeline (non-PDFs are rejected)", async () => {
    const pdf = await pdfBytes();
    const pack = await readPackZip(await zipFile({ "requirements.json": requirementsJson, "documents/a.pdf": pdf, "documents/logo.png": "PNG" }));
    const results = [];
    for (const doc of pack.documents) results.push(await inspectIncomingFile(doc, { count: 0, totalBytes: 0 }));
    expect(results.map((r) => (r.ok ? r.file.pages : r.error.code))).toEqual([1, "not_pdf"]);
  });

  it("prefers the shallowest requirements.json", async () => {
    const other = requirementsJson.replace("T-Z", "T-DEEP");
    const pack = await readPackZip(await zipFile({ "a/b/requirements.json": other, "a/requirements.json": requirementsJson }));
    expect(JSON.parse(pack.requirementsText).tender.tender_id).toBe("T-Z");
  });

  it("reports a zip without requirements.json", async () => {
    expect(await readPackZip(await zipFile({ "documents/a.pdf": "x" }))).toEqual({ ok: false, error: { code: "zip_no_requirements" } });
  });

  it("reports a damaged zip", async () => {
    expect(await readPackZip(new File(["not a zip at all"], "broken.zip"))).toEqual({ ok: false, error: { code: "zip_invalid" } });
  });
});
