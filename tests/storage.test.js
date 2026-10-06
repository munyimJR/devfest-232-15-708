import { describe, expect, it } from "vitest";
import { SAVE_VERSION, sanitizeSavedWork, sessionFromState } from "../src/utils/storage.js";

const tender = { tender_id: "T-1", title: "T", procuring_entity: "E", bidder: "B", submission_deadline: "2026-12-01" };
const requirements = [
  { id: "R1", order: 1, title_en: "One", title_bn: "এক", mandatory: true, has_expiry: true },
  { id: "R2", order: 2, title_en: "Two", title_bn: "দুই", mandatory: false, has_expiry: false },
];
const fileRecord = (id) => ({ id, name: `${id}.pdf`, size: 3, pages: 1, hash: `h-${id}`, bytes: new Uint8Array([1, 2, 3]) });
const state = {
  tender,
  requirements,
  files: [fileRecord("a"), fileRecord("b")],
  matches: { R1: "a", R2: "b" },
  expiry: { R1: "2027-01-31" },
  suggested: { R2: "b" },
  options: { includeIndex: false },
};

describe("saved work", () => {
  it("round-trips the saved parts of the state", () => {
    const session = sessionFromState(state);
    expect(session.version).toBe(SAVE_VERSION);
    expect(session.fileIds).toEqual(["a", "b"]);
    expect(session).not.toHaveProperty("files");
    const restored = sanitizeSavedWork({ session, files: state.files }, { includeIndex: true });
    expect(restored).toEqual({ ...state, files: state.files });
  });

  it("keeps file order and drops matches to files that are gone", () => {
    const session = sessionFromState(state);
    const restored = sanitizeSavedWork({ session, files: [fileRecord("b")] }, { includeIndex: true });
    expect(restored.files.map((f) => f.id)).toEqual(["b"]);
    expect(restored.matches).toEqual({ R2: "b" });
    expect(restored.expiry).toEqual({});
  });

  it("drops invalid dates, unknown requirements and broken file records", () => {
    const session = { ...sessionFromState(state), expiry: { R1: "2027-02-30" }, matches: { R1: "a", R9: "b" } };
    const broken = { ...fileRecord("b"), bytes: "not bytes" };
    const restored = sanitizeSavedWork({ session, files: [fileRecord("a"), broken] }, { includeIndex: true });
    expect(restored.matches).toEqual({ R1: "a" });
    expect(restored.expiry).toEqual({});
    expect(restored.files.map((f) => f.id)).toEqual(["a"]);
  });

  it("ignores saves from another version or with invalid requirements", () => {
    expect(sanitizeSavedWork({ session: { ...sessionFromState(state), version: 99 }, files: [] })).toBe(null);
    expect(sanitizeSavedWork({ session: { ...sessionFromState(state), requirements: [] }, files: [] })).toBe(null);
    expect(sanitizeSavedWork(null)).toBe(null);
  });

  it("only restores known options with the right type", () => {
    const session = { ...sessionFromState(state), options: { includeIndex: "yes", evil: true } };
    expect(sanitizeSavedWork({ session, files: state.files }, { includeIndex: true }).options).toEqual({ includeIndex: true });
  });
});
