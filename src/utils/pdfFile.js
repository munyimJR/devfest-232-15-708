// Read and validate one incoming file: PDF signature, upload limits, pdf-lib load,
// page count and SHA-256. Works with browser File objects and Node's File class.
// Never throws: every failure is returned as { ok: false, error: { code } }.

import { PDFDocument } from "pdf-lib";
import { sha256Hex } from "./hash.js";

export const MAX_FILES = 30;
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

let idCounter = 0;

/** Unique id for a file record (works without crypto.randomUUID on insecure origins). */
export function makeFileId() {
  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 10);
  return `f${Date.now().toString(36)}${idCounter.toString(36)}${random}`;
}

/** True when the bytes start with "%PDF-" (checks content, not the file extension). */
export function hasPdfSignature(bytes) {
  if (!bytes || bytes.length < PDF_SIGNATURE.length) return false;
  return PDF_SIGNATURE.every((value, index) => bytes[index] === value);
}

/** Upload limits. `existing` = { count, totalBytes } of files already accepted. */
export function checkLimits(existing, size) {
  if (existing.count + 1 > MAX_FILES) return "too_many_files";
  if (existing.totalBytes + size > MAX_TOTAL_BYTES) return "too_large";
  return null;
}

/**
 * Open PDF bytes with pdf-lib. Throws for encrypted, damaged or empty documents.
 * A copy of the bytes is passed so pdf-lib can never hold on to the original buffer.
 */
export async function loadPdf(bytes) {
  const doc = await PDFDocument.load(bytes.slice(), { updateMetadata: false });
  const pages = doc.getPageCount();
  if (!pages) throw new Error("The PDF has no pages");
  return { doc, pages };
}

/**
 * Validate one file in the required order:
 * 1. "%PDF-" signature  2. file count limit  3. total size limit
 * 4. readable by pdf-lib (not encrypted / damaged)  5. page count + SHA-256.
 */
export async function inspectIncomingFile(file, existing = { count: 0, totalBytes: 0 }) {
  const reject = (code) => ({ ok: false, error: { code, params: { name: file?.name ?? "" } } });
  try {
    const header = new Uint8Array(await file.slice(0, PDF_SIGNATURE.length).arrayBuffer());
    if (!hasPdfSignature(header)) return reject("not_pdf");

    const limit = checkLimits(existing, file.size);
    if (limit) return reject(limit);

    const bytes = new Uint8Array(await file.arrayBuffer());
    let pages;
    try {
      ({ pages } = await loadPdf(bytes));
    } catch {
      return reject("unreadable");
    }
    const hash = await sha256Hex(bytes);
    return {
      ok: true,
      file: { id: makeFileId(), name: file.name, size: bytes.length, pages, hash, bytes },
    };
  } catch {
    return reject("unreadable");
  }
}
