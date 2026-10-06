import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { MAX_FILES, MAX_TOTAL_BYTES, checkLimits, hasPdfSignature, inspectIncomingFile } from "../src/utils/pdfFile.js";

async function makePdf(pageCount = 1) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([300, 400]);
  return doc.save();
}

describe("hasPdfSignature", () => {
  it("checks the first five bytes, not the name", () => {
    expect(hasPdfSignature(new TextEncoder().encode("%PDF-1.7 ..."))).toBe(true);
    expect(hasPdfSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe(false);
    expect(hasPdfSignature(new TextEncoder().encode(" %PDF-"))).toBe(false);
    expect(hasPdfSignature(new Uint8Array([]))).toBe(false);
  });
});

describe("checkLimits", () => {
  it("allows up to 30 files and 50 MB", () => {
    expect(checkLimits({ count: MAX_FILES - 1, totalBytes: 0 }, 10)).toBe(null);
    expect(checkLimits({ count: MAX_FILES, totalBytes: 0 }, 10)).toBe("too_many_files");
    expect(checkLimits({ count: 0, totalBytes: MAX_TOTAL_BYTES - 10 }, 10)).toBe(null);
    expect(checkLimits({ count: 0, totalBytes: MAX_TOTAL_BYTES - 10 }, 11)).toBe("too_large");
  });
});

describe("inspectIncomingFile", () => {
  it("accepts a PDF and reports pages, size and SHA-256", async () => {
    const bytes = await makePdf(3);
    const result = await inspectIncomingFile(new File([bytes], "three.pdf"));
    expect(result.ok).toBe(true);
    expect(result.file).toMatchObject({ name: "three.pdf", pages: 3, size: bytes.length });
    expect(result.file.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.file.bytes).toBeInstanceOf(Uint8Array);
  });

  it("rejects a non-PDF even when it is named .pdf", async () => {
    const result = await inspectIncomingFile(new File(["hello"], "fake.pdf"));
    expect(result).toMatchObject({ ok: false, error: { code: "not_pdf", params: { name: "fake.pdf" } } });
  });

  it("rejects an empty file as not a PDF", async () => {
    expect((await inspectIncomingFile(new File([], "empty.pdf"))).error.code).toBe("not_pdf");
  });

  it("rejects a damaged PDF", async () => {
    const result = await inspectIncomingFile(new File(["%PDF-1.4\n garbage without objects"], "broken.pdf"));
    expect(result).toMatchObject({ ok: false, error: { code: "unreadable" } });
  });

  it("rejects a truncated PDF", async () => {
    const bytes = await makePdf(2);
    const result = await inspectIncomingFile(new File([bytes.slice(0, 40)], "truncated.pdf"));
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("unreadable");
  });

  it("rejects an encrypted (password-protected) PDF", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.context.trailerInfo.Encrypt = doc.context.obj({ Filter: "Standard", V: 2, R: 3 });
    const bytes = await doc.save({ useObjectStreams: false });
    const result = await inspectIncomingFile(new File([bytes], "locked.pdf"));
    expect(result).toMatchObject({ ok: false, error: { code: "unreadable" } });
  });

  it("applies the file-count limit before reading the PDF", async () => {
    const bytes = await makePdf(1);
    const result = await inspectIncomingFile(new File([bytes], "a.pdf"), { count: MAX_FILES, totalBytes: 0 });
    expect(result.error.code).toBe("too_many_files");
  });

  it("applies the total-size limit", async () => {
    const bytes = await makePdf(1);
    const result = await inspectIncomingFile(new File([bytes], "a.pdf"), { count: 1, totalBytes: MAX_TOTAL_BYTES });
    expect(result.error.code).toBe("too_large");
  });

  it("reports not-PDF before the limits", async () => {
    const result = await inspectIncomingFile(new File(["PNG"], "logo.png"), { count: MAX_FILES, totalBytes: MAX_TOTAL_BYTES });
    expect(result.error.code).toBe("not_pdf");
  });

  it("does not hand its original buffer to pdf-lib", async () => {
    const bytes = await makePdf(1);
    const result = await inspectIncomingFile(new File([bytes], "a.pdf"));
    const before = Array.from(result.file.bytes.slice(0, 64));
    await PDFDocument.load(result.file.bytes.slice());
    expect(Array.from(result.file.bytes.slice(0, 64))).toEqual(before);
  });
});
