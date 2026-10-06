// Parse and validate requirements.json.
// Returns { ok: true, tender, requirements } or { ok: false, error: { code, params } }.
// `code` maps to the translated message "err.<code>" in i18n.js. Never throws.

import { isValidYmd } from "./dates.js";

export const TENDER_FIELDS = ["tender_id", "title", "procuring_entity", "bidder", "submission_deadline"];

function fail(code, params = {}) {
  return { ok: false, error: { code, params } };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

/** Requirements are shown and packaged by `order` ascending, then by `id`. */
export function compareRequirements(a, b) {
  if (a.order !== b.order) return a.order - b.order;
  return a.id.localeCompare(b.id, "en", { numeric: true });
}

/** Parse the raw text of a requirements.json file. */
export function parseRequirementsText(text) {
  if (typeof text !== "string") return fail("json_unreadable");
  const clean = text.replace(/^\uFEFF/, ""); // tolerate a UTF-8 byte-order mark
  if (clean.trim() === "") return fail("json_empty");
  let data;
  try {
    data = JSON.parse(clean);
  } catch {
    return fail("json_invalid");
  }
  return validateRequirements(data);
}

/** Validate an already-parsed requirements object. */
export function validateRequirements(data) {
  if (!isPlainObject(data)) return fail("root_not_object");

  const rawTender = data.tender;
  if (!isPlainObject(rawTender)) return fail("tender_missing");

  const tender = {};
  for (const field of TENDER_FIELDS) {
    const value = rawTender[field];
    if (!isNonEmptyString(value)) return fail("tender_field", { field: `tender.${field}` });
    tender[field] = value.trim();
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tender.submission_deadline)) {
    return fail("deadline_format", { value: tender.submission_deadline });
  }
  if (!isValidYmd(tender.submission_deadline)) {
    return fail("deadline_invalid", { value: tender.submission_deadline });
  }

  const list = data.requirements;
  if (!Array.isArray(list)) return fail("requirements_missing");
  if (list.length === 0) return fail("requirements_empty");

  const seenIds = new Set();
  const requirements = [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const n = i + 1;
    if (!isPlainObject(item)) return fail("req_not_object", { n });

    if (!isNonEmptyString(item.id)) return fail("req_text", { n, id: `#${n}`, field: "id" });
    const id = item.id.trim();
    if (seenIds.has(id)) return fail("req_duplicate_id", { id });
    seenIds.add(id);

    if (typeof item.order !== "number" || !Number.isFinite(item.order)) {
      return fail("req_number", { n, id, field: "order" });
    }
    if (!isNonEmptyString(item.title_en)) return fail("req_text", { n, id, field: "title_en" });
    if (typeof item.mandatory !== "boolean") return fail("req_boolean", { n, id, field: "mandatory" });
    if (typeof item.has_expiry !== "boolean") return fail("req_boolean", { n, id, field: "has_expiry" });

    const titleEn = item.title_en.trim();
    requirements.push({
      id,
      order: item.order,
      title_en: titleEn,
      // A missing (or empty) Bangla title falls back to the English one.
      title_bn: isNonEmptyString(item.title_bn) ? item.title_bn.trim() : titleEn,
      mandatory: item.mandatory,
      has_expiry: item.has_expiry,
    });
  }

  requirements.sort(compareRequirements);
  return { ok: true, tender, requirements };
}
