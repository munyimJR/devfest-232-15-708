// Checklist export as CSV. Pure: the caller passes the translation helpers.

// Byte-order mark so Excel opens the UTF-8 file with Bangla text intact.
const BOM = String.fromCharCode(0xfeff);

/** One CSV cell. Text that a spreadsheet would run as a formula is prefixed with "'". */
export function csvCell(value) {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Rows (arrays of cells) -> CSV text with BOM and CRLF line endings. */
export function toCsv(rows) {
  return `${BOM}${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/**
 * Columns: Order, Document, Required, File name, Pages, Expiry date, Status.
 * Header, document names, Yes/No and statuses use the current UI language via `t` / `title`.
 */
export function checklistCsv(rows, { t, title }) {
  const header = [
    t("csv.order"),
    t("csv.document"),
    t("csv.required"),
    t("csv.fileName"),
    t("csv.pages"),
    t("csv.expiry"),
    t("csv.status"),
  ];
  const body = rows.map((row) => [
    row.req.order,
    title(row.req),
    row.req.mandatory ? t("csv.yes") : t("csv.no"),
    row.file?.name ?? "",
    row.file ? row.file.pages : "",
    row.req.has_expiry && row.file ? row.expiryDate : "",
    t(`status.${row.status}`),
  ]);
  return toCsv([header, ...body]);
}
