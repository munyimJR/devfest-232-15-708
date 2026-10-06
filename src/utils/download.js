// Browser download / preview helpers.

const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** Replace only characters that are illegal in file names with "-". */
export function sanitizeFileName(name) {
  return String(name).replace(ILLEGAL_FILENAME_CHARS, "-").replace(CONTROL_CHARS, "-");
}

/** "<tender_id>_Package.pdf" */
export function packageFileName(tenderId) {
  return `${sanitizeFileName(tenderId)}_Package.pdf`;
}

/** Save bytes as a file through a temporary <a download> link. */
export function downloadBytes(bytes, fileName, type = "application/pdf") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before releasing the memory.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Blob URLs for previews, kept until the file is removed so the preview tab can reload.
const previewUrls = new Map();

/** Open PDF bytes in a new tab (Chrome's built-in PDF viewer). Returns false if blocked. */
export function openPdfInNewTab(key, bytes) {
  let url = previewUrls.get(key);
  if (!url) {
    url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    previewUrls.set(key, url);
  }
  const win = window.open(url, "_blank");
  if (!win) return false;
  try {
    win.opener = null;
  } catch {
    // ignore
  }
  return true;
}

export function revokePreview(key) {
  const url = previewUrls.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    previewUrls.delete(key);
  }
}

export function revokeAllPreviews() {
  for (const key of [...previewUrls.keys()]) revokePreview(key);
}
