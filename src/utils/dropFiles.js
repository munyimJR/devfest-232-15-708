// Helpers for files dropped on the page: walk dropped folders, and pick requirements.json
// plus the document files out of a dropped pack folder.

/** Hidden files, dot-folders and macOS "__MACOSX" folders are ignored. */
export function isIgnoredPath(path) {
  return String(path)
    .split("/")
    .some((segment) => segment === "__MACOSX" || (segment.startsWith(".") && segment !== "." && segment !== ".."));
}

function baseName(path) {
  const parts = String(path).split("/");
  return parts[parts.length - 1];
}

function depth(path) {
  return String(path).split("/").filter(Boolean).length;
}

/**
 * From a list of { path, file } pick:
 * - requirementsFile: the shallowest "requirements.json" (null if none)
 * - documents: files inside any "documents/" folder, or every other file when there is no such folder
 */
export function splitPackFiles(items) {
  const visible = items.filter((item) => !isIgnoredPath(item.path));
  const jsonItems = visible
    .filter((item) => baseName(item.path).toLowerCase() === "requirements.json")
    .sort((a, b) => depth(a.path) - depth(b.path));
  const requirements = jsonItems[0] ?? null;
  const others = visible.filter((item) => item !== requirements);
  const inDocumentsFolder = others.filter((item) =>
    String(item.path)
      .split("/")
      .slice(0, -1)
      .some((segment) => segment.toLowerCase() === "documents"),
  );
  return {
    requirementsFile: requirements ? requirements.file : null,
    documents: (inDocumentsFolder.length ? inDocumentsFolder : others).map((item) => item.file),
  };
}

function readEntryFile(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readDirectoryBatch(reader) {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function walkEntry(entry, out) {
  if (!entry || isIgnoredPath(entry.fullPath ?? entry.name)) return;
  if (entry.isFile) {
    try {
      out.push({ path: (entry.fullPath || entry.name).replace(/^\//, ""), file: await readEntryFile(entry) });
    } catch {
      // unreadable entry: skip
    }
    return;
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    // readEntries returns results in batches until an empty batch.
    for (;;) {
      let batch;
      try {
        batch = await readDirectoryBatch(reader);
      } catch {
        break;
      }
      if (!batch.length) break;
      for (const child of batch) await walkEntry(child, out);
    }
  }
}

/**
 * Must be called synchronously inside the drop handler (DataTransfer items expire after it).
 * Returns a promise of { items: [{ path, file }], hasFolders }.
 */
export function collectDroppedFiles(dataTransfer) {
  const plainFiles = Array.from(dataTransfer?.files ?? []);
  const entries = Array.from(dataTransfer?.items ?? [])
    .filter((item) => item.kind === "file" && typeof item.webkitGetAsEntry === "function")
    .map((item) => item.webkitGetAsEntry())
    .filter(Boolean);
  const hasFolders = entries.some((entry) => entry.isDirectory);
  if (!hasFolders) {
    return Promise.resolve({ items: plainFiles.map((file) => ({ path: file.name, file })), hasFolders: false });
  }
  return (async () => {
    const items = [];
    for (const entry of entries) await walkEntry(entry, items);
    items.sort((a, b) => a.path.localeCompare(b.path, "en", { numeric: true }));
    return { items, hasFolders: true };
  })();
}
