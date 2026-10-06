import { describe, expect, it } from "vitest";
import { suggestMatches, tokenize, yearInName } from "../src/utils/autoMatch.js";

const req = (id, order, title) => ({ id, order, title_en: title, title_bn: title, mandatory: true, has_expiry: false });
const file = (name, hash = name) => ({ id: `id:${name}`, name, hash, pages: 1, size: 1 });

describe("tokenize", () => {
  it("drops the extension, digits, punctuation and stop words", () => {
    expect([...tokenize("01_financial_proposal.pdf", { fileName: true })]).toEqual(["financial", "proposal"]);
    expect([...tokenize("experience_cert (1).pdf", { fileName: true })]).toEqual(["experience", "certificate"]);
    expect([...tokenize("Certificate of the Bank and a Trade")]).toEqual(["certificate", "bank", "trade"]);
  });

  it("folds synonyms, plurals and camelCase", () => {
    expect(tokenize("Trade Licence")).toEqual(tokenize("trade-license"));
    expect([...tokenize("TradeLicense2026.pdf", { fileName: true })]).toEqual(["trade", "license"]);
    expect(tokenize("Proposals")).toEqual(new Set(["proposal"]));
    expect(tokenize("price schedule")).toContain("financial");
    expect(tokenize("MAF")).toContain("authorization");
    expect(tokenize("Manufacturer's Authorisation")).toEqual(new Set(["manufacturer", "authorization"]));
  });
});

describe("yearInName", () => {
  it("finds the highest four-digit year", () => {
    expect(yearInName("trade_license_2026.pdf")).toBe(2026);
    expect(yearInName("scan_0042.pdf")).toBe(0);
    expect(yearInName("report-2019-to-2021.pdf")).toBe(2021);
  });
});

describe("suggestMatches", () => {
  const requirements = [
    req("R01", 1, "Trade License"),
    req("R02", 2, "TIN Certificate"),
    req("R03", 3, "VAT Registration Certificate"),
    req("R04", 4, "Bank Solvency Certificate"),
    req("R05", 5, "Experience Certificate"),
    req("R06", 6, "Audited Financial Statement"),
    req("R07", 7, "Manufacturer's Authorization"),
    req("R08", 8, "Technical Proposal"),
    req("R09", 9, "Financial Proposal"),
    req("R10", 10, "Signed Declaration"),
  ];
  const files = [
    file("01_financial_proposal.pdf"),
    file("02_technical_proposal.pdf"),
    file("03_tin_certificate.pdf"),
    file("04_vat_certificate.pdf"),
    file("bank_solvency.pdf"),
    file("experience_cert (1).pdf", "same"),
    file("experience_cert.pdf", "same"),
    file("scan_0042.pdf"),
    file("trade_license_2025.pdf"),
    file("trade_license_2026.pdf"),
  ];
  const asNames = (suggestions) =>
    Object.fromEntries(suggestions.map((s) => [s.reqId, s.fileId.replace("id:", "")]));

  it("matches the sample file names sensibly", () => {
    expect(asNames(suggestMatches({ requirements, files, matches: {} }))).toEqual({
      R01: "trade_license_2026.pdf",
      R02: "03_tin_certificate.pdf",
      R03: "04_vat_certificate.pdf",
      R04: "bank_solvency.pdf",
      R05: "experience_cert.pdf",
      R08: "02_technical_proposal.pdf",
      R09: "01_financial_proposal.pdf",
    });
  });

  it("never overwrites existing matches or reuses a used file", () => {
    const matches = { R01: "id:trade_license_2025.pdf", R09: "id:02_technical_proposal.pdf" };
    const result = asNames(suggestMatches({ requirements, files, matches }));
    expect(result.R01).toBeUndefined();
    expect(result.R09).toBeUndefined();
    expect(Object.values(result)).not.toContain("02_technical_proposal.pdf");
    expect(Object.values(result)).not.toContain("trade_license_2025.pdf");
  });

  it("skips a file whose identical twin is already used", () => {
    const matches = { R05: "id:experience_cert.pdf" };
    const result = asNames(suggestMatches({ requirements, files, matches }));
    expect(Object.values(result)).not.toContain("experience_cert (1).pdf");
  });

  it("prefers the newer year when two files tie", () => {
    const result = suggestMatches({
      requirements: [req("R1", 1, "Trade License")],
      files: [file("license_2027_trade.pdf"), file("trade license 2031.pdf"), file("trade_license.pdf")],
      matches: {},
    });
    expect(result[0].fileId).toBe("id:trade license 2031.pdf");
  });

  it("needs at least one shared word", () => {
    expect(suggestMatches({ requirements: [req("R1", 1, "Signed Declaration")], files: [file("scan_0042.pdf")], matches: {} })).toEqual([]);
  });
});
