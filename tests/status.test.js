import { describe, expect, it } from "vitest";
import {
  BLOCKING,
  STATUS,
  buildChecklist,
  fileUsage,
  findDuplicates,
  getStatus,
  summarizeChecklist,
} from "../src/utils/status.js";

const DEADLINE = "2026-10-20";
const req = (overrides = {}) => ({ id: "R01", order: 1, title_en: "Doc", title_bn: "Doc", mandatory: true, has_expiry: false, ...overrides });

describe("getStatus", () => {
  it("mandatory requirement without a file is Missing", () => {
    expect(getStatus(req({ mandatory: true }), null, "", DEADLINE)).toBe(STATUS.MISSING);
  });

  it("optional requirement without a file is Not provided", () => {
    expect(getStatus(req({ mandatory: false }), null, "", DEADLINE)).toBe(STATUS.NOT_PROVIDED);
    expect(getStatus(req({ mandatory: false, has_expiry: true }), undefined, "2020-01-01", DEADLINE)).toBe(STATUS.NOT_PROVIDED);
  });

  it("file without expiry requirement is OK", () => {
    expect(getStatus(req(), "f1", "", DEADLINE)).toBe(STATUS.OK);
    expect(getStatus(req({ mandatory: false }), "f1", "", DEADLINE)).toBe(STATUS.OK);
  });

  it("has_expiry with a file but no date is Expiry date needed", () => {
    expect(getStatus(req({ has_expiry: true }), "f1", "", DEADLINE)).toBe(STATUS.EXPIRY_NEEDED);
    expect(getStatus(req({ has_expiry: true }), "f1", undefined, DEADLINE)).toBe(STATUS.EXPIRY_NEEDED);
  });

  it("an invalid or partial date counts as not entered", () => {
    expect(getStatus(req({ has_expiry: true }), "f1", "2026-02-30", DEADLINE)).toBe(STATUS.EXPIRY_NEEDED);
    expect(getStatus(req({ has_expiry: true }), "f1", "12345-01-01", DEADLINE)).toBe(STATUS.EXPIRY_NEEDED);
    expect(getStatus(req({ has_expiry: true }), "f1", "2026-1-5", DEADLINE)).toBe(STATUS.EXPIRY_NEEDED);
  });

  it("expiry on the deadline day is OK", () => {
    expect(getStatus(req({ has_expiry: true }), "f1", "2026-10-20", DEADLINE)).toBe(STATUS.OK);
  });

  it("expiry one day before the deadline is Expired", () => {
    expect(getStatus(req({ has_expiry: true }), "f1", "2026-10-19", DEADLINE)).toBe(STATUS.EXPIRED);
  });

  it("expiry after the deadline is OK, long before is Expired", () => {
    expect(getStatus(req({ has_expiry: true }), "f1", "2027-06-30", DEADLINE)).toBe(STATUS.OK);
    expect(getStatus(req({ has_expiry: true }), "f1", "2025-06-30", DEADLINE)).toBe(STATUS.EXPIRED);
  });

  it("year and month boundaries compare correctly as strings", () => {
    expect(getStatus(req({ has_expiry: true }), "f1", "2025-12-31", "2026-01-01")).toBe(STATUS.EXPIRED);
    expect(getStatus(req({ has_expiry: true }), "f1", "2026-01-01", "2026-01-01")).toBe(STATUS.OK);
    expect(getStatus(req({ has_expiry: true }), "f1", "2026-09-30", "2026-10-01")).toBe(STATUS.EXPIRED);
  });

  it("only Missing, Expiry date needed and Expired are blocking", () => {
    expect([...BLOCKING].sort()).toEqual([STATUS.EXPIRED, STATUS.EXPIRY_NEEDED, STATUS.MISSING].sort());
    expect(BLOCKING.has(STATUS.OK)).toBe(false);
    expect(BLOCKING.has(STATUS.NOT_PROVIDED)).toBe(false);
  });
});

describe("buildChecklist / summarizeChecklist", () => {
  const requirements = [
    req({ id: "R01", order: 1, has_expiry: true }),
    req({ id: "R02", order: 2 }),
    req({ id: "R03", order: 3, mandatory: false }),
    req({ id: "R04", order: 4, mandatory: false, has_expiry: true }),
  ];
  const files = [
    { id: "a", name: "a.pdf", pages: 2, hash: "h1" },
    { id: "b", name: "b.pdf", pages: 3, hash: "h2" },
    { id: "c", name: "c.pdf", pages: 1, hash: "h1" },
  ];

  it("gives exactly one status per requirement and blocks generation", () => {
    const rows = buildChecklist({ requirements, files, matches: { R01: "a" }, expiry: {}, deadline: DEADLINE });
    expect(rows.map((r) => r.status)).toEqual([STATUS.EXPIRY_NEEDED, STATUS.MISSING, STATUS.NOT_PROVIDED, STATUS.NOT_PROVIDED]);
    const summary = summarizeChecklist(rows);
    expect(summary.canGenerate).toBe(false);
    expect(summary.blocking.map((r) => r.req.id)).toEqual(["R01", "R02"]);
  });

  it("is ready when every blocking status is resolved", () => {
    const rows = buildChecklist({
      requirements,
      files,
      matches: { R01: "a", R02: "b" },
      expiry: { R01: "2026-10-20" },
      deadline: DEADLINE,
    });
    const summary = summarizeChecklist(rows);
    expect(summary.canGenerate).toBe(true);
    expect(summary.included.map((r) => r.req.id)).toEqual(["R01", "R02"]);
    expect(summary.documentPages).toBe(5);
    expect(summary.ready).toBe(2);
    expect(summary.needed).toBe(2);
  });

  it("an optional document with a file but no expiry date blocks", () => {
    const rows = buildChecklist({
      requirements,
      files,
      matches: { R01: "a", R02: "b", R04: "c" },
      expiry: { R01: "2027-01-01" },
      deadline: DEADLINE,
    });
    expect(rows[3].status).toBe(STATUS.EXPIRY_NEEDED);
    expect(summarizeChecklist(rows).canGenerate).toBe(false);
  });

  it("ignores a match that points to a removed file", () => {
    const rows = buildChecklist({ requirements, files, matches: { R02: "gone" }, expiry: {}, deadline: DEADLINE });
    expect(rows[1].status).toBe(STATUS.MISSING);
  });

  it("cannot generate with zero included documents", () => {
    const optionalOnly = [req({ id: "X", mandatory: false })];
    const rows = buildChecklist({ requirements: optionalOnly, files: [], matches: {}, expiry: {}, deadline: DEADLINE });
    expect(summarizeChecklist(rows).canGenerate).toBe(false);
  });
});

describe("duplicates and usage", () => {
  it("groups files by identical hash", () => {
    const files = [
      { id: "a", hash: "x" },
      { id: "b", hash: "y" },
      { id: "c", hash: "x" },
    ];
    const twins = findDuplicates(files);
    expect(twins.get("a").map((f) => f.id)).toEqual(["c"]);
    expect(twins.get("c").map((f) => f.id)).toEqual(["a"]);
    expect(twins.has("b")).toBe(false);
  });

  it("maps files to the requirement they are used for", () => {
    const usage = fileUsage({ R01: "a", R02: "b" });
    expect(usage.get("a")).toBe("R01");
    expect(usage.get("b")).toBe("R02");
  });
});
