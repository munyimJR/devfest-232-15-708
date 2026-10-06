import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFName, PDFRawStream, StandardFonts, degrees } from "pdf-lib";
import {
  A4,
  FOOTER_HEIGHT,
  buildPackage,
  documentStartPages,
  footerText,
  normalizeRotation,
  textWidth,
  wrapText,
} from "../src/utils/packageGenerator.js";
import { safeText } from "../src/utils/pdfText.js";

const tender = {
  tender_id: "T-TEST-1",
  title: "Test Tender",
  procuring_entity: "Entity",
  bidder: "Bidder",
  submission_deadline: "2026-12-01",
};

async function makePdf(pages) {
  const doc = await PDFDocument.create();
  for (const spec of pages) {
    const page = doc.addPage(spec.size ?? [595.28, 841.89]);
    if (spec.rotate) page.setRotation(degrees(spec.rotate));
    if (spec.crop) page.setCropBox(...spec.crop);
  }
  return doc.save();
}

const doc = (id, order, title, bytes, pages) => ({
  req: { id, order, title_en: title, title_bn: title, mandatory: true, has_expiry: false },
  file: { id: `f-${id}`, name: `${id}.pdf`, bytes, pages, size: bytes.length, hash: id },
});

function pageText(pdf, page) {
  const contents = page.node.get(PDFName.of("Contents"));
  const resolved = pdf.context.lookup(contents);
  const refs = resolved instanceof PDFArray ? resolved.asArray() : [contents];
  return refs
    .map((ref) => pdf.context.lookup(ref))
    .filter((stream) => stream instanceof PDFRawStream)
    .map((stream) => {
      try {
        return zlib.inflateSync(Buffer.from(stream.contents)).toString("latin1");
      } catch {
        return Buffer.from(stream.contents).toString("latin1");
      }
    })
    .join("\n");
}

const hexOf = (text) => Buffer.from(text, "latin1").toString("hex");

describe("buildPackage", () => {
  it("adds a cover, keeps every page in order and footers every page", async () => {
    const a = await makePdf([{}, {}]);
    const b = await makePdf([{ size: [612, 792] }]);
    const bytes = await buildPackage({
      tender,
      includedDocs: [doc("R1", 1, "First", a, 2), doc("R2", 2, "Second", b, 1)],
      createdDate: "2026-10-06",
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(4);
    const pages = pdf.getPages();
    expect(pages[0].getCropBox().width).toBeCloseTo(A4.width);
    expect(pages[0].getCropBox().height).toBeCloseTo(A4.height + FOOTER_HEIGHT);
    expect(pages[3].getCropBox().width).toBeCloseTo(612);
    expect(pages[3].getCropBox().height).toBeCloseTo(792 + FOOTER_HEIGHT);
    pages.forEach((page, index) => {
      expect(pageText(pdf, page).toLowerCase()).toContain(hexOf(footerText("T-TEST-1", index + 1, 4)));
    });
    // The cover lists the documents in order with their page counts.
    const cover = pageText(pdf, pages[0]).toLowerCase();
    expect(cover).toContain(hexOf("First (2 pages)"));
    expect(cover).toContain(hexOf("Second (1 page)"));
    expect(cover.indexOf(hexOf("First (2 pages)"))).toBeLessThan(cover.indexOf(hexOf("Second (1 page)")));
  });

  it("puts the strip on the visual bottom of rotated pages", async () => {
    const src = await makePdf([{ rotate: 90 }, { rotate: 180 }, { rotate: 270 }, { rotate: -90 }]);
    const bytes = await buildPackage({ tender, includedDocs: [doc("R1", 1, "Rotated", src, 4)], createdDate: "2026-10-06" });
    const pdf = await PDFDocument.load(bytes);
    const [, r90, r180, r270, rMinus90] = pdf.getPages();
    const W = 595.28;
    const H = 841.89;

    // Rotate 90: visual bottom is the right edge (x max).
    expect(r90.getRotation().angle).toBe(90);
    expect(r90.getCropBox()).toMatchObject({ x: 0, y: 0 });
    expect(r90.getCropBox().width).toBeCloseTo(W + FOOTER_HEIGHT);
    expect(r90.getCropBox().height).toBeCloseTo(H);

    // Rotate 180: visual bottom is the top edge (y max).
    expect(r180.getCropBox()).toMatchObject({ x: 0, y: 0 });
    expect(r180.getCropBox().height).toBeCloseTo(H + FOOTER_HEIGHT);

    // Rotate 270 (and -90): visual bottom is the left edge (x min).
    for (const page of [r270, rMinus90]) {
      expect(page.getCropBox().x).toBeCloseTo(-FOOTER_HEIGHT);
      expect(page.getCropBox().width).toBeCloseTo(W + FOOTER_HEIGHT);
      expect(page.getMediaBox().x).toBeCloseTo(-FOOTER_HEIGHT);
    }
  });

  it("respects an existing CropBox and grows the MediaBox to contain the strip", async () => {
    const src = await makePdf([{ crop: [50, 60, 400, 500] }]);
    const bytes = await buildPackage({ tender, includedDocs: [doc("R1", 1, "Cropped", src, 1)], createdDate: "2026-10-06" });
    const page = (await PDFDocument.load(bytes)).getPage(1);
    expect(page.getCropBox()).toEqual({ x: 50, y: 60 - FOOTER_HEIGHT, width: 400, height: 500 + FOOTER_HEIGHT });
    const media = page.getMediaBox();
    expect(media.y).toBeLessThanOrEqual(60 - FOOTER_HEIGHT);
    expect(media.y + media.height).toBeGreaterThanOrEqual(560);
  });

  it("never throws on unusual characters in the JSON", async () => {
    const src = await makePdf([{}]);
    const weird = {
      tender_id: "T–2026/04:17 “Ω”",
      title: "Supply of “IT” Equipment — Phase 2… ট্রেড লাইসেন্স 😀 ﬁ ő\u00A0\u200B",
      procuring_entity: "Directorate\tof\nSample Services",
      bidder: "Ünïcødé Ltd. ‘quoted’",
      submission_deadline: "2026-10-20",
    };
    const bytes = await buildPackage({
      tender: weird,
      includedDocs: [doc("R1", 1, "Manufacturer’s Authorization — অনুমোদনপত্র", src, 1)],
      createdDate: "2026-10-06",
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    expect(pageText(pdf, pdf.getPage(1)).toLowerCase()).toContain(hexOf(safeText(footerText(weird.tender_id, 2, 2))));
  });

  it("fits a long list of long titles on the cover page", async () => {
    const src = await makePdf([{}]);
    const docs = Array.from({ length: 30 }, (_, i) =>
      doc(`R${i}`, i, `Very long requirement title number ${i} `.repeat(6), src, 1),
    );
    const bytes = await buildPackage({ tender, includedDocs: docs, createdDate: "2026-10-06" });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(31);
  });

  it("reports which document could not be read", async () => {
    const good = await makePdf([{}]);
    const broken = doc("R2", 2, "Broken", new TextEncoder().encode("%PDF-1.4 nothing here"), 1);
    await expect(
      buildPackage({ tender, includedDocs: [doc("R1", 1, "Good", good, 1), broken], createdDate: "2026-10-06" }),
    ).rejects.toMatchObject({ code: "doc_unreadable", params: { name: "R2.pdf" } });
  });
});

describe("index page", () => {
  it("computes start pages with and without the index", () => {
    expect(documentStartPages([1, 1, 2, 6], { includeIndex: false })).toEqual([2, 3, 4, 6]);
    expect(documentStartPages([1, 1, 2, 6], { includeIndex: true })).toEqual([3, 4, 5, 7]);
  });

  it("adds an index page after the cover listing every document's start page", async () => {
    const two = await makePdf([{}, {}]);
    const one = await makePdf([{}]);
    const bytes = await buildPackage({
      tender,
      includedDocs: [doc("R1", 1, "Alpha Document", two, 2), doc("R2", 2, "Beta Document", one, 1)],
      createdDate: "2026-10-06",
      includeIndex: true,
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(5);
    const cover = pageText(pdf, pdf.getPage(0)).toLowerCase();
    const index = pageText(pdf, pdf.getPage(1)).toLowerCase();
    expect(index).toContain(hexOf("INDEX OF DOCUMENTS"));
    expect(index).toContain(hexOf("Alpha Document"));
    expect(index).toContain(hexOf("Beta Document"));
    expect(cover).toContain(hexOf("Page 3"));
    expect(cover).toContain(hexOf("Page 5"));
    expect(index).toContain(hexOf(footerText("T-TEST-1", 2, 5)));
  });

  it("links the cover and index entries to the documents and adds bookmarks", async () => {
    const src = await makePdf([{}]);
    const bytes = await buildPackage({
      tender,
      includedDocs: [doc("R1", 1, "Alpha", src, 1), doc("R2", 2, "Beta", src, 1)],
      createdDate: "2026-10-06",
      includeIndex: true,
    });
    const pdf = await PDFDocument.load(bytes);
    const annotsOf = (page) => page.node.Annots()?.size() ?? 0;
    expect(annotsOf(pdf.getPage(0))).toBe(2);
    expect(annotsOf(pdf.getPage(1))).toBe(2);
    const outline = pdf.catalog.lookup(PDFName.of("Outlines"));
    expect(outline.lookup(PDFName.of("Count")).asNumber()).toBe(4); // cover, index, 2 documents
  });
});

describe("helpers", () => {
  it("measures text the way drawText renders it (no kerning)", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const dots = ". ".repeat(20);
    expect(textWidth(font, dots, 12)).toBeCloseTo(20 * 2 * font.widthOfTextAtSize(".", 12));
    expect(textWidth(font, dots, 12)).toBeGreaterThan(font.widthOfTextAtSize(dots, 12));
  });

  it("normalizes rotation", () => {
    expect([0, 90, 180, 270, 360, -90, 450, 89].map(normalizeRotation)).toEqual([0, 90, 180, 270, 0, 270, 90, 90]);
  });

  it("wraps text inside the width, splitting very long words", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const lines = wrapText(`short words then ${"x".repeat(200)}`, font, 10, 100);
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(textWidth(font, line, 10)).toBeLessThanOrEqual(100);
  });
});

describe("safeText", () => {
  it("converts typographic characters to ASCII", () => {
    expect(safeText("‘a’ “b” c–d e—f g… h\u00A0i")).toBe(`'a' "b" c-d e-f g... h i`);
  });

  it("drops accents it cannot encode and replaces other scripts with ?", () => {
    expect(safeText("Łódź ő")).toBe("Lódz o");
    expect(safeText("ট্রেড")).toMatch(/^\?+$/);
    expect(safeText("😀")).toBe("?");
    expect(safeText("café Müller")).toBe("café Müller");
  });

  it("always returns text Helvetica can encode", async () => {
    const pdf = await PDFDocument.create();
    const fonts = [await pdf.embedFont(StandardFonts.Helvetica), await pdf.embedFont(StandardFonts.HelveticaBold)];
    let sample = "";
    for (let cp = 0; cp < 0x3000; cp += 7) sample += String.fromCodePoint(cp);
    sample += "😀𝔘�\u0000\u001F ";
    const safe = safeText(sample);
    for (const font of fonts) expect(() => font.encodeText(safe)).not.toThrow();
  });

  it("matches the WinAnsi set pdf-lib uses for Helvetica", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const cp of font.getCharacterSet()) {
      const ch = String.fromCodePoint(cp);
      if (cp < 0x20 || cp === 0xa0 || cp === 0xad) continue;
      expect(() => font.encodeText(safeText(ch))).not.toThrow();
    }
  });
});
