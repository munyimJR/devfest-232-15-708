// Save and reopen work in IndexedDB (this browser only, nothing leaves the device).
// Two stores: "files" holds each PDF once (written when added, deleted when removed) and
// "session" holds the small rest (requirements, matches, dates, options), rewritten on change.
// Every function fails softly: without IndexedDB the app simply works without saving.

import { validateRequirements } from "./requirements.js";
import { isValidYmd } from "./dates.js";

const DB_NAME = "tenderpack";
const DB_VERSION = 1;
const SESSION_STORE = "session";
const FILE_STORE = "files";
const SESSION_KEY = "current";
export const SAVE_VERSION = 1;

let dbPromise = null;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) db.createObjectStore(SESSION_STORE);
      if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB upgrade blocked"));
  });
}

function getDb() {
  dbPromise ??= openDb().catch((error) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

const result = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });

/** { session, files } as stored, or null when nothing is saved / storage is unavailable. */
export async function loadSavedWork() {
  try {
    const db = await withTimeout(getDb(), 3000);
    const tx = db.transaction([SESSION_STORE, FILE_STORE], "readonly");
    const session = await result(tx.objectStore(SESSION_STORE).get(SESSION_KEY));
    if (!session) return null;
    const files = await result(tx.objectStore(FILE_STORE).getAll());
    return { session, files };
  } catch {
    return null;
  }
}

/** Store the session and sync the file store to exactly `files`. Throws on failure. */
export async function saveWork(session, files) {
  const db = await getDb();
  const tx = db.transaction([SESSION_STORE, FILE_STORE], "readwrite");
  const finished = done(tx);
  const fileStore = tx.objectStore(FILE_STORE);
  const storedIds = new Set(await result(fileStore.getAllKeys()));
  const wantedIds = new Set(files.map((file) => file.id));
  for (const id of storedIds) if (!wantedIds.has(id)) fileStore.delete(id);
  for (const file of files) {
    if (!storedIds.has(file.id)) {
      const { id, name, size, pages, hash, bytes } = file;
      fileStore.put({ id, name, size, pages, hash, bytes });
    }
  }
  tx.objectStore(SESSION_STORE).put(session, SESSION_KEY);
  await finished;
}

/** Forget all saved work. Never throws. */
export async function clearSavedWork() {
  try {
    const db = await withTimeout(getDb(), 3000);
    const tx = db.transaction([SESSION_STORE, FILE_STORE], "readwrite");
    const finished = done(tx);
    tx.objectStore(SESSION_STORE).clear();
    tx.objectStore(FILE_STORE).clear();
    await finished;
  } catch {
    // nothing saved or storage unavailable
  }
}

/** The part of the app state that is saved (file bytes are stored separately). */
export function sessionFromState(state) {
  return {
    version: SAVE_VERSION,
    tender: state.tender,
    requirements: state.requirements,
    fileIds: state.files.map((file) => file.id),
    matches: state.matches,
    expiry: state.expiry,
    suggested: state.suggested,
    options: state.options,
  };
}

function isFileRecord(file) {
  return (
    file &&
    typeof file.id === "string" &&
    typeof file.name === "string" &&
    file.bytes instanceof Uint8Array &&
    file.bytes.length > 0 &&
    Number.isInteger(file.pages) &&
    file.pages > 0 &&
    typeof file.hash === "string"
  );
}

/**
 * Check saved data before using it (it may come from an older version or be damaged).
 * Returns the state to restore, or null when it cannot be used.
 */
export function sanitizeSavedWork(saved, defaultOptions = {}) {
  const session = saved?.session;
  if (!session || session.version !== SAVE_VERSION) return null;
  const parsed = validateRequirements({ tender: session.tender, requirements: session.requirements });
  if (!parsed.ok) return null;

  const stored = new Map((Array.isArray(saved.files) ? saved.files : []).filter(isFileRecord).map((f) => [f.id, f]));
  const files = (Array.isArray(session.fileIds) ? session.fileIds : [])
    .map((id) => stored.get(id))
    .filter(Boolean)
    .map((file) => ({ ...file, size: file.bytes.length }));
  const fileIds = new Set(files.map((file) => file.id));
  const reqIds = new Set(parsed.requirements.map((req) => req.id));

  const matches = {};
  const usedFiles = new Set();
  for (const [reqId, fileId] of Object.entries(session.matches ?? {})) {
    if (reqIds.has(reqId) && fileIds.has(fileId) && !usedFiles.has(fileId)) {
      matches[reqId] = fileId;
      usedFiles.add(fileId);
    }
  }
  const expiry = {};
  for (const [reqId, date] of Object.entries(session.expiry ?? {})) {
    if (matches[reqId] && isValidYmd(date)) expiry[reqId] = date;
  }
  const suggested = {};
  for (const [reqId, fileId] of Object.entries(session.suggested ?? {})) {
    if (matches[reqId] === fileId) suggested[reqId] = fileId;
  }
  const options = { ...defaultOptions };
  for (const [name, value] of Object.entries(session.options ?? {})) {
    if (name in defaultOptions && typeof value === typeof defaultOptions[name]) options[name] = value;
  }
  return { tender: parsed.tender, requirements: parsed.requirements, files, matches, expiry, suggested, options };
}
