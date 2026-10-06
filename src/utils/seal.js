// Seal / signature helpers: PNG checks, page selection ("3, 8-13") and placement geometry.
// No DOM. Page numbers are final package page numbers (cover = 1).

import { PDFDocument } from "pdf-lib";

export const SEAL_POSITIONS = ["bottom-right", "bottom-left", "bottom-center", "top-right"];
export const SEAL_MIN_WIDTH = 60;
export const SEAL_MAX_WIDTH = 180;
export const SEAL_MAX_BYTES = 5 * 1024 * 1024;
export const SEAL_MARGIN = 24;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function hasPngSignature(bytes) {
  return Boolean(bytes && bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b));
}

/** Width and height from the PNG IHDR chunk, or null. */
export function pngSize(bytes) {
  if (!hasPngSignature(bytes) || bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Validate an uploaded seal image: PNG signature, size limit, and that pdf-lib can embed it.
 * Returns { ok: true, seal: { name, bytes, width, height } } or { ok: false, error: { code } }.
 */
export async function inspectSealImage(file) {
  const fail = (code) => ({ ok: false, error: { code, params: { name: file?.name ?? "" } } });
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasPngSignature(bytes)) return fail("not_png");
    if (bytes.length > SEAL_MAX_BYTES) return fail("too_large");
    const size = pngSize(bytes);
    if (!size) return fail("unreadable");
    const probe = await PDFDocument.create();
    await probe.embedPng(bytes.slice());
    return { ok: true, seal: { name: file.name, bytes, ...size } };
  } catch {
    return fail("unreadable");
  }
}

const BANGLA_ZERO = 0x09e6;
const BANGLA_DIGITS = new RegExp(`[${String.fromCharCode(BANGLA_ZERO)}-${String.fromCharCode(BANGLA_ZERO + 9)}]`, "g");
const DASHES = new RegExp(`[${String.fromCharCode(0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2212)}]`, "g");

/**
 * Parse "3, 8-13" into sorted unique page numbers. Bangla digits and en dashes are accepted.
 * Pages before `firstDocPage` (cover / index) and after `total` are errors.
 * Returns { ok: true, pages } or { ok: false, error: { code, params } }.
 */
export function parsePageSelection(text, { total, firstDocPage }) {
  const normalized = String(text ?? "")
    .replace(BANGLA_DIGITS, (digit) => String(digit.charCodeAt(0) - BANGLA_ZERO))
    .replace(DASHES, "-")
    .replace(/\s*-\s*/g, "-");
  const tokens = normalized.split(/[\s,;]+/).filter(Boolean);
  const pages = new Set();
  for (const token of tokens) {
    const single = /^\d+$/.exec(token);
    const range = /^(\d+)-(\d+)$/.exec(token);
    let from;
    let to;
    if (single) {
      from = Number(token);
      to = from;
    } else if (range) {
      from = Number(range[1]);
      to = Number(range[2]);
      if (from > to) return { ok: false, error: { code: "backwards", params: { token } } };
    } else {
      return { ok: false, error: { code: "invalid", params: { token } } };
    }
    if (from < 1) return { ok: false, error: { code: "invalid", params: { token } } };
    if (to > total) return { ok: false, error: { code: "out_of_range", params: { page: to, total } } };
    if (from < firstDocPage) return { ok: false, error: { code: "front", params: { page: from } } };
    for (let page = from; page <= to; page += 1) pages.add(page);
  }
  return { ok: true, pages: [...pages].sort((a, b) => a - b) };
}

/** [3, 4, 5, 6, 8] -> "3-6, 8" */
export function formatPageRanges(pages) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < sorted.length; i += 1) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
    parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : String(sorted[i]));
    i = j;
  }
  return parts.join(", ");
}

/** Quick choices. docs: [{ startPage, pages }] in package order. */
export function presetPages(kind, docs) {
  if (kind === "last") return docs.map((doc) => doc.startPage + doc.pages - 1);
  return docs.flatMap((doc) => Array.from({ length: doc.pages }, (_, i) => doc.startPage + i));
}

/** Which document pages a selection means: [{ docIndex, pages: [page in document] }]. */
export function describeSealPages(pages, docs) {
  const groups = [];
  for (const page of pages) {
    const docIndex = docs.findIndex((doc) => page >= doc.startPage && page < doc.startPage + doc.pages);
    if (docIndex < 0) continue;
    const last = groups[groups.length - 1];
    const inDoc = page - docs[docIndex].startPage + 1;
    if (last && last.docIndex === docIndex) last.pages.push(inDoc);
    else groups.push({ docIndex, pages: [inDoc] });
  }
  return groups;
}

/**
 * Where to draw a w x h seal on a page whose visible box is `box` and rotation `rotation`
 * (0/90/180/270), so it appears upright at `position` with SEAL_MARGIN from the visual edges.
 * Returns { x, y, rotate, width, height } in user space for pdf-lib drawImage.
 */
export function sealPlacement(box, rotation, position, width, height, margin = SEAL_MARGIN) {
  const sideways = rotation === 90 || rotation === 270;
  const visualWidth = sideways ? box.height : box.width;
  const visualHeight = sideways ? box.width : box.height;
  // Never larger than the page allows.
  const fit = Math.min(1, (visualWidth - 2 * margin) / width, (visualHeight - 2 * margin) / height);
  const w = width * Math.max(fit, 0.05);
  const h = height * Math.max(fit, 0.05);

  let vx;
  let vy;
  if (position === "bottom-left") {
    vx = margin;
    vy = margin;
  } else if (position === "bottom-center") {
    vx = (visualWidth - w) / 2;
    vy = margin;
  } else if (position === "top-right") {
    vx = visualWidth - margin - w;
    vy = visualHeight - margin - h;
  } else {
    vx = visualWidth - margin - w;
    vy = margin;
  }

  const { x: cx, y: cy, width: cw, height: ch } = box;
  if (rotation === 90) return { x: cx + cw - vy, y: cy + vx, rotate: 90, width: w, height: h };
  if (rotation === 180) return { x: cx + cw - vx, y: cy + ch - vy, rotate: 180, width: w, height: h };
  if (rotation === 270) return { x: cx + vy, y: cy + ch - vx, rotate: 270, width: w, height: h };
  return { x: cx + vx, y: cy + vy, rotate: 0, width: w, height: h };
}
