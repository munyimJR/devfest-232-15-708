// Status engine: the only place requirement statuses are computed. Pure functions.

import { isValidYmd } from "./dates.js";

export const STATUS = {
  MISSING: "missing",
  EXPIRY_NEEDED: "expiry_needed",
  EXPIRED: "expired",
  NOT_PROVIDED: "not_provided",
  OK: "ok",
};

export const BLOCKING = new Set([STATUS.MISSING, STATUS.EXPIRY_NEEDED, STATUS.EXPIRED]);

/**
 * Status of one requirement.
 * Dates are "YYYY-MM-DD" strings and are compared as strings (never via new Date()).
 * Expiry on the deadline day itself is OK.
 */
export function getStatus(req, fileId, expiryDate, deadline) {
  if (!fileId) return req.mandatory ? STATUS.MISSING : STATUS.NOT_PROVIDED;
  if (req.has_expiry) {
    if (!expiryDate || !isValidYmd(expiryDate)) return STATUS.EXPIRY_NEEDED;
    if (expiryDate < deadline) return STATUS.EXPIRED;
  }
  return STATUS.OK;
}

export function isBlocking(status) {
  return BLOCKING.has(status);
}

/**
 * One row per requirement (requirements are already sorted by order):
 * { req, file, expiryDate, status, blocking }
 */
export function buildChecklist({ requirements, files, matches, expiry, deadline }) {
  const filesById = new Map(files.map((file) => [file.id, file]));
  return requirements.map((req) => {
    const file = filesById.get(matches[req.id]) ?? null;
    const expiryDate = req.has_expiry && file ? expiry[req.id] || "" : "";
    const status = getStatus(req, file ? file.id : null, expiryDate, deadline);
    return { req, file, expiryDate, status, blocking: BLOCKING.has(status) };
  });
}

/** Counts and lists derived from the checklist rows. */
export function summarizeChecklist(rows) {
  const blocking = rows.filter((row) => row.blocking);
  const included = rows.filter((row) => row.file); // in requirement order
  const needed = rows.filter((row) => row.status !== STATUS.NOT_PROVIDED).length;
  const ready = rows.filter((row) => row.status === STATUS.OK).length;
  const documentPages = included.reduce((sum, row) => sum + row.file.pages, 0);
  return {
    blocking,
    included,
    needed,
    ready,
    documentPages,
    canGenerate: blocking.length === 0 && included.length > 0,
  };
}

/** Map of fileId -> other files with exactly the same content (same SHA-256). */
export function findDuplicates(files) {
  const byHash = new Map();
  for (const file of files) {
    const group = byHash.get(file.hash) ?? [];
    group.push(file);
    byHash.set(file.hash, group);
  }
  const twins = new Map();
  for (const group of byHash.values()) {
    if (group.length < 2) continue;
    for (const file of group) twins.set(file.id, group.filter((other) => other.id !== file.id));
  }
  return twins;
}

/** Map of fileId -> requirement id it is matched to. */
export function fileUsage(matches) {
  const usage = new Map();
  for (const [reqId, fileId] of Object.entries(matches)) usage.set(fileId, reqId);
  return usage;
}
