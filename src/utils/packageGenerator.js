// Build the tender package PDF. Pure: bytes in -> bytes out. No DOM or React imports.
//
// Package = English cover page + every page of each included document in requirement
// order + the footer "<tender_id> | Page N of M" on every page. The footer lives in a
// 28pt strip added *outside* each page's visible area, so it never covers original
// content (some pages are full-page scans).

import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { safeText } from "./pdfText.js";

export const FOOTER_HEIGHT = 28;
export const A4 = { width: 595.28, height: 841.89 };

const FOOTER_FONT_SIZE = 9.5;
const HELVETICA_CAP_HEIGHT = 0.718; // cap height / font size

const COLORS = {
  teal: rgb(15 / 255, 76 / 255, 92 / 255),
  ink: rgb(0.1, 0.12, 0.14),
  text: rgb(0.2, 0.22, 0.25),
  muted: rgb(0.42, 0.45, 0.49),
  rule: rgb(0.83, 0.86, 0.88),
  panel: rgb(0.953, 0.973, 0.976),
  panelBorder: rgb(0.85, 0.9, 0.91),
  white: rgb(1, 1, 1),
  footerText: rgb(0.27, 0.29, 0.31),
  footerRule: rgb(0.8, 0.82, 0.84),
};

/** Error with a code the UI can translate ("doc_unreadable"). */
export class PackageError extends Error {
  constructor(code, params = {}) {
    super(code);
    this.name = "PackageError";
    this.code = code;
    this.params = params;
  }
}

export function footerText(tenderId, pageNumber, totalPages) {
  return `${tenderId} | Page ${pageNumber} of ${totalPages}`;
}

export function pageLabel(count) {
  return `${count} ${count === 1 ? "page" : "pages"}`;
}

/**
 * @param {object} args
 * @param {object} args.tender        tender details from requirements.json
 * @param {Array}  args.includedDocs  [{ req, file }] already sorted by requirement order
 * @param {string} args.createdDate   local date, YYYY-MM-DD
 * @returns {Promise<Uint8Array>}
 */
export async function buildPackage({ tender, includedDocs, createdDate }) {
  const out = await PDFDocument.create();
  const fonts = {
    regular: await out.embedFont(StandardFonts.Helvetica),
    bold: await out.embedFont(StandardFonts.HelveticaBold),
  };
  out.setTitle(`${tender.tender_id} - Tender Document Package`, { showInWindowTitleBar: true });
  out.setSubject(tender.title);
  out.setAuthor(tender.bidder);
  out.setCreator("TenderPack");
  out.setProducer("TenderPack (pdf-lib)");
  out.setLanguage("en");

  const cover = out.addPage([A4.width, A4.height]);
  drawCover(cover, fonts, { tender, includedDocs, createdDate });

  for (const { file } of includedDocs) {
    let copied;
    try {
      const src = await PDFDocument.load(file.bytes.slice(), { updateMetadata: false });
      copied = await out.copyPages(src, src.getPageIndices());
    } catch {
      throw new PackageError("doc_unreadable", { name: file.name });
    }
    for (const page of copied) out.addPage(page);
  }

  // Footers are added last, when the total page count is known.
  const pages = out.getPages();
  pages.forEach((page, index) => {
    addFooterStrip(page, fonts.regular, footerText(tender.tender_id, index + 1, pages.length));
  });

  return out.save();
}

// ---------------------------------------------------------------------------
// Cover page
// ---------------------------------------------------------------------------

function drawCover(page, fonts, { tender, includedDocs, createdDate }) {
  const { regular, bold } = fonts;
  const { width, height } = page.getSize();
  const margin = 56;
  const contentWidth = width - margin * 2;

  page.drawRectangle({ x: 0, y: height - 12, width, height: 12, color: COLORS.teal });

  let y = height - 12 - 62;
  page.drawText("TENDER DOCUMENT PACKAGE", { x: margin, y, size: 24, font: bold, color: COLORS.teal });
  y -= 20;
  const bidderLine = clampLines(wrapText(safeText(tender.bidder), regular, 11, contentWidth), 1, regular, 11, contentWidth)[0];
  page.drawText(bidderLine, {
    x: margin,
    y,
    size: 11,
    font: regular,
    color: COLORS.muted,
  });
  y -= 26;

  // Tender details in a light panel: label column + wrapped value column.
  const pad = 18;
  const labelWidth = 132;
  const valueWidth = contentWidth - pad * 2 - labelWidth;
  const details = [
    ["Tender ID", tender.tender_id, { size: 15, color: COLORS.teal }],
    ["Tender Title", tender.title],
    ["Procuring Entity", tender.procuring_entity],
    ["Bidder", tender.bidder],
    ["Submission Deadline", tender.submission_deadline],
    ["Package Created", createdDate],
  ].map(([label, value, style = {}]) => {
    const size = style.size ?? 12;
    const lineHeight = size * 1.3;
    const lines = clampLines(wrapText(safeText(value), bold, size, valueWidth), 4, bold, size, valueWidth);
    return { label, lines, size, lineHeight, color: style.color ?? COLORS.ink, height: (lines.length - 1) * lineHeight + 24 };
  });
  const panelHeight = details.reduce((sum, row) => sum + row.height, 0) + pad * 2 - 10;
  page.drawRectangle({
    x: margin,
    y: y - panelHeight,
    width: contentWidth,
    height: panelHeight,
    color: COLORS.panel,
    borderColor: COLORS.panelBorder,
    borderWidth: 0.75,
  });
  page.drawRectangle({ x: margin, y: y - panelHeight, width: 3, height: panelHeight, color: COLORS.teal });

  let rowY = y - pad - 10;
  for (const row of details) {
    page.drawText(row.label, { x: margin + pad, y: rowY, size: 10, font: regular, color: COLORS.muted });
    row.lines.forEach((line, index) => {
      page.drawText(line, {
        x: margin + pad + labelWidth,
        y: rowY - index * row.lineHeight,
        size: row.size,
        font: bold,
        color: row.color,
      });
    });
    rowY -= row.height;
  }
  y -= panelHeight + 34;

  const totalPages = includedDocs.reduce((sum, doc) => sum + doc.file.pages, 0);
  page.drawText("Included Documents", { x: margin, y, size: 13, font: bold, color: COLORS.teal });
  const summary = `${includedDocs.length} ${includedDocs.length === 1 ? "document" : "documents"}, ${pageLabel(totalPages)}`;
  const summarySize = 10;
  page.drawText(summary, {
    x: margin + contentWidth - regular.widthOfTextAtSize(summary, summarySize),
    y,
    size: summarySize,
    font: regular,
    color: COLORS.muted,
  });
  y -= 10;
  drawRule(page, margin, y, contentWidth, 0.75);
  y -= 20;

  const items = includedDocs.map((doc) => safeText(`${doc.req.title_en} (${pageLabel(doc.file.pages)})`));
  drawDocumentList(page, fonts, items, { x: margin, top: y, width: contentWidth, bottom: 84 });

  // Closing note at the bottom of the cover.
  drawRule(page, margin, 66, contentWidth, 0.5);
  const note = "Documents follow the order of the tender's requirement list. Every page is numbered in the footer.";
  page.drawText(note, { x: margin, y: 50, size: 8.5, font: regular, color: COLORS.muted });
}

/** Numbered list that always fits between `top` and `bottom` (font shrinks if needed). */
function drawDocumentList(page, fonts, items, { x, top, width, bottom }) {
  const { regular, bold } = fonts;
  const available = top - bottom;
  const layout = (size, maxLines) => {
    const lineHeight = size * 1.42;
    const gap = size * 0.55;
    const numberWidth = bold.widthOfTextAtSize(`${items.length}.`, size) + size * 0.8;
    const textWidth = width - numberWidth;
    const blocks = items.map((text) => clampLines(wrapText(text, regular, size, textWidth), maxLines, regular, size, textWidth));
    const height = blocks.reduce((sum, lines) => sum + lines.length * lineHeight, 0) + gap * Math.max(0, items.length - 1);
    return { size, lineHeight, gap, numberWidth, blocks, height };
  };

  let chosen = null;
  for (const size of [11, 10.5, 10, 9.5, 9, 8.5, 8, 7.5, 7]) {
    const candidate = layout(size, 3);
    if (candidate.height <= available) {
      chosen = candidate;
      break;
    }
  }
  let hidden = 0;
  if (!chosen) {
    // Extremely long lists: one line per item and stop before the page bottom.
    chosen = layout(7, 1);
    const perItem = chosen.lineHeight + chosen.gap;
    const fit = Math.max(1, Math.floor((available - chosen.lineHeight) / perItem));
    if (fit < items.length) {
      hidden = items.length - fit;
      chosen.blocks = chosen.blocks.slice(0, fit);
    }
  }

  const { size, lineHeight, gap, numberWidth, blocks } = chosen;
  let y = top;
  blocks.forEach((lines, index) => {
    const number = `${index + 1}.`;
    page.drawText(number, {
      x: x + numberWidth - size * 0.8 - bold.widthOfTextAtSize(number, size),
      y,
      size,
      font: bold,
      color: COLORS.teal,
    });
    lines.forEach((line, lineIndex) => {
      page.drawText(line, { x: x + numberWidth, y: y - lineIndex * lineHeight, size, font: regular, color: COLORS.text });
    });
    y -= lines.length * lineHeight + gap;
  });
  if (hidden > 0) {
    page.drawText(`... and ${hidden} more`, { x: x + numberWidth, y, size, font: regular, color: COLORS.muted });
  }
}

function drawRule(page, x, y, width, thickness = 0.6) {
  page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness, color: COLORS.rule });
}

/** Word-wrap `text` (already safeText'd) to lines no wider than `maxWidth`. */
export function wrapText(text, font, size, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      line = word;
      continue;
    }
    // A single word longer than the line: break it by characters.
    let chunk = "";
    for (const ch of word) {
      if (chunk && font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** Keep at most `maxLines` lines, ending the last one with "..." when text was cut. */
export function clampLines(lines, maxLines, font, size, maxWidth) {
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && font.widthOfTextAtSize(`${last}...`, size) > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}...`;
  return kept;
}

// ---------------------------------------------------------------------------
// Footer strip
// ---------------------------------------------------------------------------

function normalizeRect({ x, y, width, height }) {
  return {
    x: Math.min(x, x + width),
    y: Math.min(y, y + height),
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

function intersectRect(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function unionRect(a, b) {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Page rotation snapped to 0 / 90 / 180 / 270. */
export function normalizeRotation(angle) {
  const snapped = Math.round((Number(angle) || 0) / 90) * 90;
  return ((snapped % 360) + 360) % 360;
}

/** The page area a viewer actually shows: CropBox clipped to MediaBox. */
export function visibleBox(page) {
  const media = normalizeRect(page.getMediaBox());
  return intersectRect(normalizeRect(page.getCropBox()), media) ?? media;
}

/**
 * Add a FOOTER_HEIGHT strip on the side of the page that is visually at the bottom
 * (taking /Rotate into account), grow CropBox + MediaBox to include it, and draw the
 * footer inside the strip. The original content area is never drawn on.
 */
export function addFooterStrip(page, font, text) {
  const H = FOOTER_HEIGHT;
  const media = normalizeRect(page.getMediaBox());
  const crop = visibleBox(page);
  const rotation = normalizeRotation(page.getRotation().angle);

  // `strip` is the new area in user space. `edge` = coordinate where the strip meets
  // the original content; `outer` = the strip's outer edge (visual bottom of the page).
  let box;
  let strip;
  if (rotation === 90) {
    box = { x: crop.x, y: crop.y, width: crop.width + H, height: crop.height };
    strip = { x: crop.x + crop.width, y: crop.y, width: H, height: crop.height };
  } else if (rotation === 180) {
    box = { x: crop.x, y: crop.y, width: crop.width, height: crop.height + H };
    strip = { x: crop.x, y: crop.y + crop.height, width: crop.width, height: H };
  } else if (rotation === 270) {
    box = { x: crop.x - H, y: crop.y, width: crop.width + H, height: crop.height };
    strip = { x: crop.x - H, y: crop.y, width: H, height: crop.height };
  } else {
    box = { x: crop.x, y: crop.y - H, width: crop.width, height: crop.height + H };
    strip = { x: crop.x, y: crop.y - H, width: crop.width, height: H };
  }

  page.setCropBox(box.x, box.y, box.width, box.height);
  const newMedia = unionRect(media, box);
  page.setMediaBox(newMedia.x, newMedia.y, newMedia.width, newMedia.height);

  // White background hides anything in the MediaBox that the old CropBox used to hide.
  page.drawRectangle({ x: strip.x, y: strip.y, width: strip.width, height: strip.height, color: COLORS.white });

  const safe = safeText(text);
  const horizontal = rotation === 0 || rotation === 180;
  const length = horizontal ? strip.width : strip.height; // visual width of the strip
  const inset = Math.min(24, length * 0.04);
  let size = FOOTER_FONT_SIZE;
  const widthAtSize = (s) => font.widthOfTextAtSize(safe, s);
  if (widthAtSize(size) > length - 2 * inset) size = Math.max(4, (size * (length - 2 * inset)) / widthAtSize(size));
  const textWidth = widthAtSize(size);
  const capHeight = size * HELVETICA_CAP_HEIGHT;
  const baselineOffset = (H - capHeight) / 2; // from the strip's visual bottom edge
  const ruleOffset = 0.6; // keep the rule fully inside the strip

  const ruleStyle = { thickness: 0.6, color: COLORS.footerRule };
  const textStyle = { size, font, color: COLORS.footerText, rotate: degrees(rotation) };

  if (rotation === 90) {
    const ruleX = strip.x + ruleOffset;
    page.drawLine({ start: { x: ruleX, y: strip.y + inset }, end: { x: ruleX, y: strip.y + strip.height - inset }, ...ruleStyle });
    page.drawText(safe, { x: strip.x + H - baselineOffset, y: strip.y + (strip.height - textWidth) / 2, ...textStyle });
  } else if (rotation === 180) {
    const ruleY = strip.y + ruleOffset;
    page.drawLine({ start: { x: strip.x + inset, y: ruleY }, end: { x: strip.x + strip.width - inset, y: ruleY }, ...ruleStyle });
    page.drawText(safe, { x: strip.x + (strip.width + textWidth) / 2, y: strip.y + H - baselineOffset, ...textStyle });
  } else if (rotation === 270) {
    const ruleX = strip.x + H - ruleOffset;
    page.drawLine({ start: { x: ruleX, y: strip.y + inset }, end: { x: ruleX, y: strip.y + strip.height - inset }, ...ruleStyle });
    page.drawText(safe, { x: strip.x + baselineOffset, y: strip.y + (strip.height + textWidth) / 2, ...textStyle });
  } else {
    const ruleY = strip.y + H - ruleOffset;
    page.drawLine({ start: { x: strip.x + inset, y: ruleY }, end: { x: strip.x + strip.width - inset, y: ruleY }, ...ruleStyle });
    page.drawText(safe, { x: strip.x + (strip.width - textWidth) / 2, y: strip.y + baselineOffset, ...textStyle });
  }
}
