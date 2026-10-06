import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex, sha256HexSync } from "../src/utils/hash.js";

const nodeSha = (bytes) => createHash("sha256").update(bytes).digest("hex");

describe("sha256", () => {
  it("Web Crypto version matches Node crypto", async () => {
    const bytes = new TextEncoder().encode("TenderPack");
    expect(await sha256Hex(bytes)).toBe(nodeSha(bytes));
  });

  it("pure-JS fallback matches Node crypto for every padding length", () => {
    for (const length of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 31 + 7) & 0xff);
      expect(sha256HexSync(bytes)).toBe(nodeSha(bytes));
    }
  });

  it("fallback handles a sub-array view and larger input", () => {
    const big = new Uint8Array(300_000).map((_, i) => (i * 13) & 0xff);
    const view = big.subarray(17, 250_017);
    expect(sha256HexSync(view)).toBe(nodeSha(view));
  });
});
