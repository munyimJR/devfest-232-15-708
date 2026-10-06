// Date helpers that work on "YYYY-MM-DD" strings only.
// Dates are never compared through `new Date()` (time-zone off-by-one risk):
// a valid "YYYY-MM-DD" string sorts correctly with a plain string compare.

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** True when `value` is a real calendar date written as YYYY-MM-DD. */
export function isValidYmd(value) {
  if (typeof value !== "string") return false;
  const match = YMD_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

/** Today's date in the user's local time zone, as YYYY-MM-DD. */
export function todayLocalYmd(now = new Date()) {
  const y = String(now.getFullYear()).padStart(4, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole days from `fromYmd` to `toYmd` (negative when `toYmd` is earlier). Display only. */
export function daysBetween(fromYmd, toYmd) {
  if (!isValidYmd(fromYmd) || !isValidYmd(toYmd)) return null;
  const toUtc = (ymd) => {
    const [y, m, d] = ymd.split("-").map(Number);
    const date = new Date(Date.UTC(2000, m - 1, d));
    date.setUTCFullYear(y);
    return date.getTime();
  };
  return Math.round((toUtc(toYmd) - toUtc(fromYmd)) / 86400000);
}
