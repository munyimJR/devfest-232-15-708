import { describe, expect, it } from "vitest";
import { checklistCsv, csvCell, toCsv } from "../src/utils/csv.js";
import { createI18n } from "../src/i18n.js";
import { STATUS } from "../src/utils/status.js";

const BOM = String.fromCharCode(0xfeff);

const rows = [
  {
    req: { id: "R01", order: 1, title_en: "Trade License", title_bn: "ট্রেড লাইসেন্স", mandatory: true, has_expiry: true },
    file: { name: "trade_license_2026.pdf", pages: 1 },
    expiryDate: "2027-06-30",
    status: STATUS.OK,
  },
  {
    req: { id: "R06", order: 6, title_en: "Audited Financial Statement", title_bn: "নিরীক্ষিত আর্থিক বিবরণী", mandatory: false, has_expiry: false },
    file: null,
    expiryDate: "",
    status: STATUS.NOT_PROVIDED,
  },
  {
    req: { id: "R09", order: 9, title_en: 'Financial Proposal, "final"', title_bn: "আর্থিক প্রস্তাব", mandatory: true, has_expiry: false },
    file: { name: "=cmd.pdf", pages: 2 },
    expiryDate: "",
    status: STATUS.OK,
  },
];

describe("csv", () => {
  it("quotes commas, quotes and new lines, and guards formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell(5)).toBe("5");
    expect(csvCell(null)).toBe("");
  });

  it("starts with a UTF-8 BOM and uses CRLF", () => {
    const text = toCsv([["a", "b"], ["c", "d"]]);
    expect(text.startsWith(BOM)).toBe(true);
    expect(text).toBe(`${BOM}a,b\r\nc,d\r\n`);
  });

  it("exports the checklist in English", () => {
    const lines = checklistCsv(rows, createI18n("en")).slice(1).trim().split("\r\n");
    expect(lines[0]).toBe("Order,Document,Required,File name,Pages,Expiry date,Status");
    expect(lines[1]).toBe("1,Trade License,Yes,trade_license_2026.pdf,1,2027-06-30,OK");
    expect(lines[2]).toBe("6,Audited Financial Statement,No,,,,Not provided");
    expect(lines[3]).toBe(`9,"Financial Proposal, ""final""",Yes,'=cmd.pdf,2,,OK`);
  });

  it("exports document names and statuses in Bangla", () => {
    const lines = checklistCsv(rows, createI18n("bn")).slice(1).trim().split("\r\n");
    expect(lines[0]).toBe("ক্রম,নথি,আবশ্যক,ফাইলের নাম,পৃষ্ঠা,মেয়াদ শেষের তারিখ,অবস্থা");
    expect(lines[1]).toBe("1,ট্রেড লাইসেন্স,হ্যাঁ,trade_license_2026.pdf,1,2027-06-30,ঠিক আছে");
    expect(lines[2]).toBe("6,নিরীক্ষিত আর্থিক বিবরণী,না,,,,প্রদান করা হয়নি");
  });
});
