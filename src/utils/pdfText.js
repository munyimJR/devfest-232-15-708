// Make any string safe to draw with the standard Helvetica fonts (WinAnsi encoding).
// pdf-lib throws when asked to draw a character the font cannot encode, so every
// string drawn into the package goes through safeText() first.

// Typographic characters converted to plain ASCII.
const ASCII_REPLACEMENTS = new Map([
  ["\u2018", "'"], ["\u2019", "'"], ["\u201A", "'"], ["\u201B", "'"], ["\u2032", "'"], ["\u02BC", "'"],
  ["\u201C", '"'], ["\u201D", '"'], ["\u201E", '"'], ["\u201F", '"'], ["\u2033", '"'],
  ["\u2010", "-"], ["\u2011", "-"], ["\u2012", "-"], ["\u2013", "-"], ["\u2014", "-"], ["\u2015", "-"], ["\u2212", "-"],
  ["\u2026", "..."],
  ["\u00A0", " "], ["\u2007", " "], ["\u202F", " "],
  // Letters with strokes have no accent-free decomposition in Unicode.
  ["\u0141", "L"], ["\u0142", "l"], ["\u0110", "D"], ["\u0111", "d"], ["\u0131", "i"],
  ["\u0126", "H"], ["\u0127", "h"], ["\u0166", "T"], ["\u0167", "t"],
]);

// Characters removed entirely (invisible formatting).
const REMOVED = new Set([0x00ad, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);

// Code points Helvetica can encode with WinAnsiEncoding.
const WIN_ANSI = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);
for (let cp = 0x20; cp <= 0x7e; cp += 1) WIN_ANSI.add(cp);
for (let cp = 0xa1; cp <= 0xff; cp += 1) if (cp !== 0xad) WIN_ANSI.add(cp);

function isEncodable(text) {
  for (const ch of text) if (!WIN_ANSI.has(ch.codePointAt(0))) return false;
  return true;
}

/** Return a version of `input` that Helvetica / Helvetica-Bold can always draw. */
export function safeText(input) {
  const text = String(input ?? "").normalize("NFC");
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const replacement = ASCII_REPLACEMENTS.get(ch);
    if (replacement !== undefined) {
      out += replacement;
    } else if (cp === 0x09 || cp === 0x0a || cp === 0x0d) {
      out += " ";
    } else if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) || REMOVED.has(cp)) {
      // control / invisible characters are dropped
    } else if (/\s/u.test(ch)) {
      out += " ";
    } else if (WIN_ANSI.has(cp)) {
      out += ch;
    } else {
      // Try the base letter without accents (e.g. "\u0151" -> "o"), otherwise "?".
      const base = ch.normalize("NFKD").replace(/\p{M}/gu, "");
      out += base && isEncodable(base) ? base : "?";
    }
  }
  return out;
}
