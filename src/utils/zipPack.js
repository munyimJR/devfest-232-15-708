// Read a whole tender pack from a .zip: requirements.json (anywhere in the zip) plus every
// file inside any "documents/" folder. Documents are returned as lazy File-like objects that
// go through the normal upload pipeline (PDF check, limits, duplicates) one at a time.

import JSZip from "jszip";
import { isIgnoredPath, splitPackFiles } from "./dropFiles.js";
import { MAX_TOTAL_BYTES } from "./pdfFile.js";

export const MAX_ZIP_BYTES = 200 * 1024 * 1024;
const ZIP_SIGNATURE = [0x50, 0x4b]; // "PK"

export function looksLikeZip(file, header) {
  if (/\.zip$/i.test(file?.name ?? "")) return true;
  return Boolean(header && header.length >= 2 && ZIP_SIGNATURE.every((b, i) => header[i] === b));
}

function baseName(path) {
  const parts = String(path).split("/");
  return parts[parts.length - 1];
}

/**
 * File-like wrapper around a zip entry: the entry is only decompressed when the upload
 * pipeline reads it, so a large pack never sits fully decompressed in memory.
 */
function lazyEntryFile(entry, path) {
  let bytes = null;
  let pending = null;
  const load = async () => {
    if (bytes) return bytes;
    pending ??= entry.async("uint8array");
    bytes = await pending;
    return bytes;
  };
  const declaredSize = entry._data?.uncompressedSize;
  return {
    name: baseName(path),
    path,
    type: "",
    get size() {
      return bytes ? bytes.length : typeof declaredSize === "number" ? declaredSize : 0;
    },
    declaredSize: typeof declaredSize === "number" ? declaredSize : null,
    slice(start, end) {
      return { arrayBuffer: async () => (await load()).slice(start, end).buffer };
    },
    async arrayBuffer() {
      return (await load()).slice().buffer;
    },
    async text() {
      return new TextDecoder().decode(await load());
    },
  };
}

/**
 * @returns {Promise<{ ok: true, requirementsText: string, documents: object[], oversized: string[] }
 *                  | { ok: false, error: { code: string } }>}
 */
export async function readPackZip(file) {
  if (file.size > MAX_ZIP_BYTES) return { ok: false, error: { code: "zip_too_large" } };
  let zip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    return { ok: false, error: { code: "zip_invalid" } };
  }

  const items = [];
  zip.forEach((path, entry) => {
    if (!entry.dir && !isIgnoredPath(path)) items.push({ path, file: lazyEntryFile(entry, path) });
  });
  items.sort((a, b) => a.path.localeCompare(b.path, "en", { numeric: true }));

  const { requirementsFile, documents } = splitPackFiles(items);
  if (!requirementsFile) return { ok: false, error: { code: "zip_no_requirements" } };

  let requirementsText;
  try {
    requirementsText = await requirementsFile.text();
  } catch {
    return { ok: false, error: { code: "zip_invalid" } };
  }

  // An entry that alone exceeds the total size limit is reported without decompressing it.
  const oversized = documents.filter((doc) => doc.declaredSize !== null && doc.declaredSize > MAX_TOTAL_BYTES);
  return {
    ok: true,
    requirementsText,
    documents: documents.filter((doc) => !oversized.includes(doc)),
    oversized: oversized.map((doc) => doc.name),
  };
}
