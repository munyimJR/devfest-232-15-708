// Suggest file -> requirement matches from file names. Generic: no sample names.
//
// 1. File names and English titles become word tokens (lowercase, extension dropped,
//    digits and punctuation split words, stop words dropped, simple plurals folded).
// 2. A small table of tender-document synonyms maps related words to one token.
// 3. Score = number of shared tokens. Pairs are assigned greedily from the highest score,
//    only to unmatched requirements and unused files, never using a file whose identical
//    twin is already used. Ties: rarer shared words first, then the newer year in the
//    file name (e.g. 2026 over 2025), then the shorter (more original-looking) name.

const STOP_WORDS = new Set(["of", "the", "and", "a", "an", "for", "to", "in", "on", "with", "pdf"]);

const SYNONYM_GROUPS = [
  ["license", "licence", "lic"],
  ["tin", "tax"],
  ["vat", "bin"],
  ["bank", "solvency"],
  ["experience", "exp"],
  ["technical", "tech"],
  ["financial", "finance", "price", "fin"],
  ["declaration", "undertaking"],
  ["audit", "audited"],
  ["authorization", "authorisation", "maf", "auth"],
  ["certificate", "cert", "certification"],
  ["registration", "reg"],
];

const CANONICAL = new Map();
for (const group of SYNONYM_GROUPS) for (const word of group) CANONICAL.set(word, group[0]);

/** Word tokens of a title or file name, with synonyms folded together. */
export function tokenize(text, { fileName = false } = {}) {
  let value = String(text ?? "");
  if (fileName) value = value.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  value = value
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase -> camel Case
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");
  const tokens = new Set();
  for (let word of value.split(/[^\p{L}]+/u)) {
    if (word.length < 2 || STOP_WORDS.has(word)) continue;
    if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) word = word.slice(0, -1);
    tokens.add(CANONICAL.get(word) ?? word);
  }
  return tokens;
}

/** Highest 4-digit year (1900-2099) written in a file name, or 0. */
export function yearInName(name) {
  let best = 0;
  for (const match of String(name).matchAll(/(?:^|[^0-9])((?:19|20)\d{2})(?![0-9])/g)) best = Math.max(best, Number(match[1]));
  return best;
}

/**
 * @param {{ requirements: object[], files: object[], matches: Record<string, string> }} input
 * @returns {{ reqId: string, fileId: string, score: number }[]} new matches only
 */
export function suggestMatches({ requirements, files, matches }) {
  const usedFileIds = new Set(Object.values(matches));
  const takenHashes = new Set(files.filter((f) => usedFileIds.has(f.id)).map((f) => f.hash));

  const titleTokens = new Map(requirements.map((req) => [req.id, tokenize(req.title_en)]));
  const documentFrequency = new Map();
  for (const tokens of titleTokens.values()) {
    for (const token of tokens) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
  }
  const weight = (token) => Math.log(1 + requirements.length / (documentFrequency.get(token) ?? 1));

  const openRequirements = requirements.filter((req) => !matches[req.id]);
  const freeFiles = files.filter((file) => !usedFileIds.has(file.id) && !takenHashes.has(file.hash));

  const candidates = [];
  for (const file of freeFiles) {
    const fileTokens = tokenize(file.name, { fileName: true });
    const year = yearInName(file.name);
    for (const req of openRequirements) {
      const shared = [...titleTokens.get(req.id)].filter((token) => fileTokens.has(token));
      if (shared.length < 1) continue;
      candidates.push({
        req,
        file,
        score: shared.length,
        rarity: shared.reduce((sum, token) => sum + weight(token), 0),
        year,
      });
    }
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      b.rarity - a.rarity ||
      b.year - a.year ||
      a.file.name.length - b.file.name.length ||
      a.file.name.localeCompare(b.file.name, "en", { numeric: true }) ||
      a.req.order - b.req.order,
  );

  const doneRequirements = new Set();
  const doneFiles = new Set();
  const suggestions = [];
  for (const { req, file, score } of candidates) {
    if (doneRequirements.has(req.id) || doneFiles.has(file.id) || takenHashes.has(file.hash)) continue;
    doneRequirements.add(req.id);
    doneFiles.add(file.id);
    takenHashes.add(file.hash);
    suggestions.push({ reqId: req.id, fileId: file.id, score });
  }
  return suggestions;
}
