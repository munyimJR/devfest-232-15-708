// Build the tender package PDF. Pure: bytes in -> bytes out. No DOM or React imports.
//
// Package = English cover page + optional index page + every page of each included document
// in requirement order + the footer "<tender_id> | Page N of M" on every page. The footer
// lives in a 28pt strip added *outside* each page's visible area, so it never covers original
// content (some pages are full-page scans). Cover and index entries link to the document start
// pages, and the PDF gets one bookmark per document.

import { PDFDocument, PDFHexString, PDFName, StandardFonts, degrees, rgb } from "pdf-lib";
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
  leader: rgb(0.62, 0.65, 0.68),
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
 * Width of `text` as drawText renders it. pdf-lib's widthOfTextAtSize() applies kerning,
 * but drawText() does not, so measuring glyph by glyph keeps alignment exact.
 */
export function textWidth(font, text, size) {
  let width = 0;
  for (const ch of String(text)) width += font.widthOfTextAtSize(ch, size);
  return width;
}

/** Page number (1-based, final package numbering) where each document starts. */
export function documentStartPages(pageCounts, { includeIndex = false } = {}) {
  let next = (includeIndex ? 2 : 1) + 1;
  return pageCounts.map((count) => {
    const start = next;
    next += count;
    return start;
  });
}

/**
 * @param {object} args
 * @param {object} args.tender        tender details from requirements.json
 * @param {Array}  args.includedDocs  [{ req, file }] already sorted by requirement order
 * @param {string} args.createdDate   local date, YYYY-MM-DD
 * @param {boolean} [args.includeIndex] add an index page after the cover
 * @param {object} [args.banglaLabels] { [requirementId]: { png, width, height, baseline, fontSizePx } }
 *   PNG images of the Bangla titles (rendered by the UI), shown next to the English names on
 *   the index page
 * @returns {Promise<Uint8Array>}
 */
export async function buildPackage({ tender, includedDocs, createdDate, includeIndex = false, banglaLabels = null }) {
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

  // Open every document first, so start pages use the real page counts.
  const sources = [];
  for (const { file } of includedDocs) {
    try {
      const src = await PDFDocument.load(file.bytes.slice(), { updateMetadata: false });
      if (!src.getPageCount()) throw new Error("no pages");
      sources.push(src);
    } catch {
      throw new PackageError("doc_unreadable", { name: file.name });
    }
  }
  const pageCounts = sources.map((src) => src.getPageCount());
  const startPages = documentStartPages(pageCounts, { includeIndex });
  const labels = {};
  if (includeIndex && banglaLabels) {
    for (const { req } of includedDocs) {
      const label = banglaLabels[req.id];
      if (!label?.png) continue;
      try {
        labels[req.id] = { ...label, embedded: await out.embedPng(label.png) };
      } catch {
        // an unusable image is skipped; the English name is still shown
      }
    }
  }
  const entries = includedDocs.map((doc, index) => ({
    title: doc.req.title_en,
    pages: pageCounts[index],
    startPage: startPages[index],
    label: labels[doc.req.id] ?? null,
  }));

  const cover = out.addPage([A4.width, A4.height]);
  const coverLinks = drawCover(cover, fonts, { tender, entries, createdDate });
  let indexPage = null;
  let indexLinks = [];
  if (includeIndex) {
    indexPage = out.addPage([A4.width, A4.height]);
    indexLinks = drawIndexPage(indexPage, fonts, { tender, entries });
  }

  for (let i = 0; i < sources.length; i += 1) {
    let copied;
    try {
      copied = await out.copyPages(sources[i], sources[i].getPageIndices());
    } catch {
      throw new PackageError("doc_unreadable", { name: includedDocs[i].file.name });
    }
    for (const page of copied) out.addPage(page);
  }

  const pages = out.getPages();
  for (const link of coverLinks) addLink(out, cover, link.rect, pages[entries[link.entry].startPage - 1]);
  for (const link of indexLinks) addLink(out, indexPage, link.rect, pages[entries[link.entry].startPage - 1]);
  addOutline(out, [
    { title: "Cover page", page: pages[0] },
    ...(indexPage ? [{ title: "Index", page: indexPage }] : []),
    ...entries.map((entry) => ({ title: entry.title, page: pages[entry.startPage - 1] })),
  ]);

  // Footers are added last, when the total page count is known.
  pages.forEach((page, index) => {
    addFooterStrip(page, fonts.regular, footerText(tender.tender_id, index + 1, pages.length));
  });

  return out.save();
}

// ---------------------------------------------------------------------------
// Cover page
// ---------------------------------------------------------------------------

function drawCover(page, fonts, { tender, entries, createdDate }) {
  const { regular, bold } = fonts;
  const { width, height } = page.getSize();
  const margin = 56;
  const contentWidth = width - margin * 2;

  page.drawRectangle({ x: 0, y: height - 12, width, height: 12, color: COLORS.teal });

  let y = height - 12 - 62;
  page.drawText("TENDER DOCUMENT PACKAGE", { x: margin, y, size: 24, font: bold, color: COLORS.teal });
  y -= 20;
  const bidderLine = clampLines(wrapText(safeText(tender.bidder), regular, 11, contentWidth), 1, regular, 11, contentWidth)[0];
  page.drawText(bidderLine, { x: margin, y, size: 11, font: regular, color: COLORS.muted });
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

  const totalPages = entries.reduce((sum, entry) => sum + entry.pages, 0);
  page.drawText("Included Documents", { x: margin, y, size: 13, font: bold, color: COLORS.teal });
  const summary = `${entries.length} ${entries.length === 1 ? "document" : "documents"}, ${pageLabel(totalPages)}`;
  page.drawText(summary, {
    x: margin + contentWidth - textWidth(regular, summary, 10),
    y,
    size: 10,
    font: regular,
    color: COLORS.muted,
  });
  y -= 10;
  drawRule(page, margin, y, contentWidth, 0.75);
  y -= 20;

  const items = entries.map((entry) => ({
    text: safeText(`${entry.title} (${pageLabel(entry.pages)})`),
    page: `Page ${entry.startPage}`,
  }));
  const links = drawEntryList(page, fonts, items, { x: margin, top: y, width: contentWidth, bottom: 84, leaders: false });

  // Closing note at the bottom of the cover.
  drawRule(page, margin, 66, contentWidth, 0.5);
  const note = "Documents follow the order of the tender's requirement list. Every page is numbered in the footer.";
  page.drawText(note, { x: margin, y: 50, size: 8.5, font: regular, color: COLORS.muted });
  return links;
}

// ---------------------------------------------------------------------------
// Index page
// ---------------------------------------------------------------------------

function drawIndexPage(page, fonts, { tender, entries }) {
  const { regular, bold } = fonts;
  const { width, height } = page.getSize();
  const margin = 56;
  const contentWidth = width - margin * 2;

  page.drawRectangle({ x: 0, y: height - 12, width, height: 12, color: COLORS.teal });
  let y = height - 12 - 62;
  page.drawText("INDEX OF DOCUMENTS", { x: margin, y, size: 22, font: bold, color: COLORS.teal });
  y -= 20;
  const subtitle = clampLines(
    wrapText(safeText(`${tender.tender_id} - ${tender.title}`), regular, 11, contentWidth),
    1,
    regular,
    11,
    contentWidth,
  )[0];
  page.drawText(subtitle, { x: margin, y, size: 11, font: regular, color: COLORS.muted });
  y -= 26;

  page.drawText("Document", { x: margin, y, size: 9, font: bold, color: COLORS.muted });
  const pageHeader = "Starts on page";
  page.drawText(pageHeader, {
    x: margin + contentWidth - textWidth(bold, pageHeader, 9),
    y,
    size: 9,
    font: bold,
    color: COLORS.muted,
  });
  y -= 9;
  drawRule(page, margin, y, contentWidth, 0.75);
  y -= 22;

  const items = entries.map((entry) => ({ text: safeText(entry.title), page: String(entry.startPage), image: entry.label }));
  const links = drawEntryList(page, fonts, items, { x: margin, top: y, width: contentWidth, bottom: 84, leaders: true });

  drawRule(page, margin, 66, contentWidth, 0.5);
  const note = "Page numbers refer to the footer numbering of this package. Click an entry to open the document.";
  page.drawText(note, { x: margin, y: 50, size: 8.5, font: regular, color: COLORS.muted });
  return links;
}

/**
 * Numbered list that always fits between `top` and `bottom` (the font shrinks if needed).
 * items: [{ text, page, image? }]. With `leaders`, dots run from the title to a bold page
 * number (index style); otherwise the page label sits right-aligned in muted text (cover
 * style). `image` is an embedded PNG of the Bangla title, placed after the English title on
 * the same line, or on its own line below when it does not fit.
 * Returns [{ entry, rect }] so each entry can link to its document.
 */
function drawEntryList(page, fonts, items, { x, top, width, bottom, leaders }) {
  const { regular, bold } = fonts;
  const available = top - bottom;
  const pageFont = leaders ? bold : regular;

  const layout = (size, maxLines) => {
    const lineHeight = size * 1.42;
    const gap = size * (leaders ? 0.75 : 0.55);
    const imageGap = size * 0.8;
    const numberWidth = textWidth(bold, `${items.length}.`, size) + size * 0.8;
    const pageWidth = Math.max(0, ...items.map((item) => textWidth(pageFont, item.page, size)));
    const titleWidth = width - numberWidth - pageWidth - size * 2;
    const blocks = items.map((item) => {
      const lines = clampLines(wrapText(item.text, regular, size, titleWidth), maxLines, regular, size, titleWidth);
      const block = { lines, image: null, height: lines.length * lineHeight };
      if (item.image) {
        // Bangla glyphs drawn at about the same size as the English text.
        let scale = (size * 1.02) / item.image.fontSizePx;
        const lastWidth = textWidth(regular, lines[lines.length - 1], size);
        const ownLine = lastWidth + imageGap + item.image.width * scale > titleWidth;
        if (ownLine && item.image.width * scale > titleWidth) scale = titleWidth / item.image.width;
        block.image = { ...item.image, scale, ownLine, offset: ownLine ? 0 : lastWidth + imageGap };
        // Bangla needs a little more height (vowel signs above and below the line).
        block.height += ownLine ? lineHeight * 1.2 : size * 0.35;
      }
      return block;
    });
    const height = blocks.reduce((sum, block) => sum + block.height, 0) + gap * Math.max(0, items.length - 1);
    return { size, lineHeight, gap, numberWidth, pageWidth, blocks, height };
  };

  let chosen = null;
  for (const size of leaders ? [12, 11.5, 11, 10.5, 10, 9.5, 9, 8.5, 8, 7.5, 7] : [11, 10.5, 10, 9.5, 9, 8.5, 8, 7.5, 7]) {
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
    let used = 0;
    let fit = 0;
    for (const block of chosen.blocks) {
      if (used + block.height + chosen.lineHeight > available) break;
      used += block.height + chosen.gap;
      fit += 1;
    }
    fit = Math.max(1, fit);
    if (fit < items.length) {
      hidden = items.length - fit;
      chosen.blocks = chosen.blocks.slice(0, fit);
    }
  }

  const { size, lineHeight, gap, numberWidth, pageWidth, blocks } = chosen;
  const textX = x + numberWidth;
  const right = x + width;
  const links = [];
  let y = top;
  blocks.forEach(({ lines, image, height }, index) => {
    const number = `${index + 1}.`;
    page.drawText(number, {
      x: textX - size * 0.8 - textWidth(bold, number, size),
      y,
      size,
      font: bold,
      color: COLORS.teal,
    });
    lines.forEach((line, lineIndex) => {
      page.drawText(line, { x: textX, y: y - lineIndex * lineHeight, size, font: regular, color: COLORS.text });
    });

    // The last line carries the page label (and the Bangla image when it has its own line).
    let lastY = y - (lines.length - 1) * lineHeight;
    let lastEnd = textX + textWidth(regular, lines[lines.length - 1], size);
    if (image) {
      const baseline = image.ownLine ? lastY - lineHeight * 1.2 : lastY;
      const imageX = textX + image.offset;
      page.drawImage(image.embedded, {
        x: imageX,
        y: baseline - (image.height - image.baseline) * image.scale,
        width: image.width * image.scale,
        height: image.height * image.scale,
      });
      lastY = baseline;
      lastEnd = imageX + image.width * image.scale;
    }

    const label = items[index].page;
    const labelWidth = textWidth(pageFont, label, size);
    page.drawText(label, {
      x: right - labelWidth,
      y: lastY,
      size,
      font: pageFont,
      color: leaders ? COLORS.ink : COLORS.muted,
    });
    if (leaders) {
      const textEnd = lastEnd + size * 0.5;
      const leaderEnd = right - pageWidth - size * 0.6; // same end on every row
      const dot = ". ";
      const dotWidth = textWidth(regular, dot, size);
      const count = Math.floor((leaderEnd - textEnd) / dotWidth);
      if (count > 0) {
        page.drawText(dot.repeat(count).trimEnd(), {
          x: leaderEnd - count * dotWidth + (dotWidth - textWidth(regular, ".", size)),
          y: lastY,
          size,
          font: regular,
          color: COLORS.leader,
        });
      }
    }

    links.push({
      entry: index,
      rect: { x, y: lastY - size * 0.45, width, height: y - lastY + size * 1.4 },
    });
    y -= height + gap;
  });
  if (hidden > 0) {
    page.drawText(`... and ${hidden} more`, { x: textX, y, size, font: regular, color: COLORS.muted });
  }
  return links;
}

// ---------------------------------------------------------------------------
// Links and bookmarks
// ---------------------------------------------------------------------------

/** Invisible link from `rect` on `page` to the top of `target`. */
function addLink(doc, page, rect, target) {
  if (!page || !target) return;
  const annotation = doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
    Border: [0, 0, 0],
    Dest: [target.ref, "Fit"],
  });
  page.node.addAnnot(doc.context.register(annotation));
}

/** One top-level bookmark per item: [{ title, page }]. */
function addOutline(doc, items) {
  const valid = items.filter((item) => item.page);
  if (!valid.length) return;
  const { context } = doc;
  const outlineRef = context.nextRef();
  const refs = valid.map(() => context.nextRef());
  valid.forEach((item, index) => {
    const entry = context.obj({
      Title: PDFHexString.fromText(item.title),
      Parent: outlineRef,
      Dest: [item.page.ref, "Fit"],
    });
    if (index > 0) entry.set(PDFName.of("Prev"), refs[index - 1]);
    if (index < refs.length - 1) entry.set(PDFName.of("Next"), refs[index + 1]);
    context.assign(refs[index], entry);
  });
  context.assign(
    outlineRef,
    context.obj({ Type: "Outlines", First: refs[0], Last: refs[refs.length - 1], Count: refs.length }),
  );
  doc.catalog.set(PDFName.of("Outlines"), outlineRef);
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
    if (textWidth(font, candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (textWidth(font, word, size) <= maxWidth) {
      line = word;
      continue;
    }
    // A single word longer than the line: break it by characters.
    let chunk = "";
    for (const ch of word) {
      if (chunk && textWidth(font, chunk + ch, size) > maxWidth) {
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
  while (last && textWidth(font, `${last}...`, size) > maxWidth) last = last.slice(0, -1);
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
  const widthAtSize = (s) => textWidth(font, safe, s);
  if (widthAtSize(size) > length - 2 * inset) size = Math.max(4, (size * (length - 2 * inset)) / widthAtSize(size));
  const footerWidth = widthAtSize(size);
  const capHeight = size * HELVETICA_CAP_HEIGHT;
  const baselineOffset = (H - capHeight) / 2; // from the strip's visual bottom edge
  const ruleOffset = 0.6; // keep the rule fully inside the strip

  const ruleStyle = { thickness: 0.6, color: COLORS.footerRule };
  const textStyle = { size, font, color: COLORS.footerText, rotate: degrees(rotation) };

  if (rotation === 90) {
    const ruleX = strip.x + ruleOffset;
    page.drawLine({ start: { x: ruleX, y: strip.y + inset }, end: { x: ruleX, y: strip.y + strip.height - inset }, ...ruleStyle });
    page.drawText(safe, { x: strip.x + H - baselineOffset, y: strip.y + (strip.height - footerWidth) / 2, ...textStyle });
  } else if (rotation === 180) {
    const ruleY = strip.y + ruleOffset;
    page.drawLine({ start: { x: strip.x + inset, y: ruleY }, end: { x: strip.x + strip.width - inset, y: ruleY }, ...ruleStyle });
    page.drawText(safe, { x: strip.x + (strip.width + footerWidth) / 2, y: strip.y + H - baselineOffset, ...textStyle });
  } else if (rotation === 270) {
    const ruleX = strip.x + H - ruleOffset;
    page.drawLine({ start: { x: ruleX, y: strip.y + inset }, end: { x: ruleX, y: strip.y + strip.height - inset }, ...ruleStyle });
    page.drawText(safe, { x: strip.x + baselineOffset, y: strip.y + (strip.height + footerWidth) / 2, ...textStyle });
  } else {
    const ruleY = strip.y + H - ruleOffset;
    page.drawLine({ start: { x: strip.x + inset, y: ruleY }, end: { x: strip.x + strip.width - inset, y: ruleY }, ...ruleStyle });
    page.drawText(safe, { x: strip.x + (strip.width - footerWidth) / 2, y: strip.y + baselineOffset, ...textStyle });
  }
}
