import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, degrees } from "pdf-lib";
import {
  describeSealPages,
  formatPageRanges,
  hasPngSignature,
  inspectSealImage,
  parsePageSelection,
  pngSize,
  presetPages,
  sealPlacement,
} from "../src/utils/seal.js";
import { buildPackage } from "../src/utils/packageGenerator.js";
import { makePng } from "./helpers.js";

const BN = (text) => text.replace(/[0-9]/g, (d) => String.fromCharCode(0x09e6 + Number(d)));

describe("PNG checks", () => {
  it("checks the PNG signature and reads the size", () => {
    const png = makePng(30, 12);
    expect(hasPngSignature(png)).toBe(true);
    expect(pngSize(png)).toEqual({ width: 30, height: 12 });
    expect(hasPngSignature(new TextEncoder().encode("%PDF-1.7"))).toBe(false);
  });

  it("accepts a PNG and rejects anything else", async () => {
    const ok = await inspectSealImage(new File([makePng(20, 10)], "seal.png"));
    expect(ok).toMatchObject({ ok: true, seal: { name: "seal.png", width: 20, height: 10 } });
    const jpeg = await inspectSealImage(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])], "seal.png"));
    expect(jpeg).toMatchObject({ ok: false, error: { code: "not_png", params: { name: "seal.png" } } });
    const broken = new Uint8Array(makePng(20, 10).slice(0, 40));
    expect((await inspectSealImage(new File([broken], "cut.png"))).error.code).toBe("unreadable");
  });
});

describe("parsePageSelection", () => {
  const limits = { total: 17, firstDocPage: 3 };

  it("reads numbers and ranges, sorted and unique", () => {
    expect(parsePageSelection("3, 8-13", limits)).toEqual({ ok: true, pages: [3, 8, 9, 10, 11, 12, 13] });
    expect(parsePageSelection(" 9 ,9; 4 - 5 ", limits).pages).toEqual([4, 5, 9]);
    expect(parsePageSelection("", limits)).toEqual({ ok: true, pages: [] });
  });

  it("accepts Bangla digits and en dashes", () => {
    expect(parsePageSelection(BN("3, 8") + String.fromCharCode(0x2013) + BN("10"), limits).pages).toEqual([3, 8, 9, 10]);
  });

  it("explains what is wrong", () => {
    expect(parsePageSelection("3, abc", limits).error).toEqual({ code: "invalid", params: { token: "abc" } });
    expect(parsePageSelection("13-8", limits).error).toEqual({ code: "backwards", params: { token: "13-8" } });
    expect(parsePageSelection("18", limits).error).toEqual({ code: "out_of_range", params: { page: 18, total: 17 } });
    expect(parsePageSelection("1", limits).error).toEqual({ code: "front", params: { page: 1 } });
    expect(parsePageSelection("2-4", limits).error).toEqual({ code: "front", params: { page: 2 } });
    expect(parsePageSelection("0", limits).error.code).toBe("invalid");
  });
});

describe("page helpers", () => {
  const docs = [
    { startPage: 3, pages: 1 },
    { startPage: 4, pages: 2 },
    { startPage: 6, pages: 6 },
  ];

  it("formats ranges", () => {
    expect(formatPageRanges([8, 3, 4, 5, 6, 14, 16, 17])).toBe("3-6, 8, 14, 16-17");
    expect(formatPageRanges([])).toBe("");
  });

  it("builds the quick choices", () => {
    expect(presetPages("last", docs)).toEqual([3, 5, 11]);
    expect(formatPageRanges(presetPages("all", docs))).toBe("3-11");
  });

  it("describes which document pages are meant", () => {
    expect(describeSealPages([3, 5, 6, 7, 8], docs)).toEqual([
      { docIndex: 0, pages: [1] },
      { docIndex: 1, pages: [2] },
      { docIndex: 2, pages: [1, 2, 3] },
    ]);
  });
});

describe("sealPlacement", () => {
  const box = { x: 0, y: 0, width: 600, height: 800 };

  it("places presets on an upright page", () => {
    expect(sealPlacement(box, 0, "bottom-right", 100, 50)).toEqual({ x: 476, y: 24, rotate: 0, width: 100, height: 50 });
    expect(sealPlacement(box, 0, "bottom-left", 100, 50)).toMatchObject({ x: 24, y: 24 });
    expect(sealPlacement(box, 0, "bottom-center", 100, 50)).toMatchObject({ x: 250, y: 24 });
    expect(sealPlacement(box, 0, "top-right", 100, 50)).toMatchObject({ x: 476, y: 726 });
  });

  it("keeps the seal upright and at the visual bottom right on rotated pages", () => {
    // Visual bounding box of the drawn image in user space for each rotation.
    const bounds = (p) => {
      if (p.rotate === 90) return { x1: p.x - p.height, x2: p.x, y1: p.y, y2: p.y + p.width };
      if (p.rotate === 180) return { x1: p.x - p.width, x2: p.x, y1: p.y - p.height, y2: p.y };
      if (p.rotate === 270) return { x1: p.x, x2: p.x + p.height, y1: p.y - p.width, y2: p.y };
      return { x1: p.x, x2: p.x + p.width, y1: p.y, y2: p.y + p.height };
    };
    // Rotate 90: visual bottom = right edge, visual right = top edge.
    const r90 = bounds(sealPlacement(box, 90, "bottom-right", 100, 50));
    expect(r90).toEqual({ x1: 526, x2: 576, y1: 676, y2: 776 });
    // Rotate 180: visual bottom = top edge, visual right = left edge.
    const r180 = bounds(sealPlacement(box, 180, "bottom-right", 100, 50));
    expect(r180).toEqual({ x1: 24, x2: 124, y1: 726, y2: 776 });
    // Rotate 270: visual bottom = left edge, visual right = bottom edge.
    const r270 = bounds(sealPlacement(box, 270, "bottom-right", 100, 50));
    expect(r270).toEqual({ x1: 24, x2: 74, y1: 24, y2: 124 });
  });

  it("shrinks a seal that is larger than the page", () => {
    const small = { x: 0, y: 0, width: 100, height: 100 };
    const place = sealPlacement(small, 0, "bottom-right", 180, 90);
    expect(place.width).toBeCloseTo(52);
    expect(place.height).toBeCloseTo(26);
  });
});

describe("stamping the package", () => {
  const tender = { tender_id: "T-S", title: "Seal", procuring_entity: "E", bidder: "B", submission_deadline: "2026-12-01" };

  async function pdf(pageCount, rotate = 0) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i += 1) doc.addPage([595.28, 841.89]).setRotation(degrees(rotate));
    return doc.save();
  }
  const doc = (id, bytes, pages) => ({
    req: { id, order: 1, title_en: id, title_bn: id, mandatory: true, has_expiry: false },
    file: { id, name: `${id}.pdf`, bytes, pages, size: bytes.length, hash: id },
  });
  const images = (page) => page.node.Resources()?.lookup(PDFName.of("XObject"))?.keys().length ?? 0;

  it("stamps only the chosen document pages, never the cover or index", async () => {
    const bytes = await buildPackage({
      tender,
      includedDocs: [doc("A", await pdf(2), 2), doc("B", await pdf(1, 90), 1)],
      createdDate: "2026-10-06",
      includeIndex: true,
      seal: { png: makePng(40, 40), pages: [1, 2, 4, 5, 99], position: "bottom-right", width: 100 },
    });
    const out = await PDFDocument.load(bytes);
    expect(out.getPages().map(images)).toEqual([0, 0, 0, 1, 1]);
  });

  it("reports a seal image pdf-lib cannot use", async () => {
    await expect(
      buildPackage({
        tender,
        includedDocs: [doc("A", await pdf(1), 1)],
        createdDate: "2026-10-06",
        seal: { png: new Uint8Array([1, 2, 3]), pages: [2], position: "bottom-right", width: 100 },
      }),
    ).rejects.toMatchObject({ code: "seal_unreadable" });
  });
});
