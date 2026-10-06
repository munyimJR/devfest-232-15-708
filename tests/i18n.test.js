import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DICTIONARIES, createI18n, formatBytes, formatDate, toBnDigits, translate } from "../src/i18n.js";
import { STATUS } from "../src/utils/status.js";

const baseKeys = (dict) => new Set(Object.keys(dict).map((key) => key.replace(/_(one|other)$/, "")));
const srcDir = path.resolve(import.meta.dirname, "../src");

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(jsx?|mjs)$/.test(entry.name) ? [full] : [];
  });
}

describe("dictionaries", () => {
  it("English and Bangla have the same keys", () => {
    const en = baseKeys(DICTIONARIES.en);
    const bn = baseKeys(DICTIONARIES.bn);
    expect([...en].filter((key) => !bn.has(key))).toEqual([]);
    expect([...bn].filter((key) => !en.has(key))).toEqual([]);
  });

  it("every key used in the code exists in both languages", () => {
    const en = baseKeys(DICTIONARIES.en);
    const bn = baseKeys(DICTIONARIES.bn);
    const used = new Set();
    for (const file of sourceFiles(srcDir)) {
      const text = fs.readFileSync(file, "utf8");
      for (const match of text.matchAll(/\bt\(\s*["']([\w.]+)["']/g)) used.add(match[1]);
      for (const match of text.matchAll(/key:\s*["']([\w.]+)["']/g)) used.add(match[1]);
      for (const match of text.matchAll(/notify\(\s*["']\w+["'],\s*["']([\w.]+)["']/g)) used.add(match[1]);
    }
    expect(used.size).toBeGreaterThan(40);
    const missing = [...used].filter((key) => !en.has(key) || !bn.has(key));
    expect(missing).toEqual([]);
  });

  it("has every status, step state and rejection message", () => {
    for (const status of Object.values(STATUS)) {
      expect(DICTIONARIES.en[`status.${status}`]).toBeTruthy();
      expect(DICTIONARIES.bn[`status.${status}`]).toBeTruthy();
    }
    for (const state of ["done", "current", "problem", "upcoming"]) expect(DICTIONARIES.bn[`steps.state.${state}`]).toBeTruthy();
    for (const code of ["not_pdf", "too_many_files", "too_large", "unreadable"]) expect(DICTIONARIES.bn[`reject.${code}`]).toBeTruthy();
  });

  it("uses the required Bangla translations", () => {
    const bn = DICTIONARIES.bn;
    expect(bn["tender.kicker"]).toBe("টেন্ডার প্যাকেজ");
    expect(bn["checklist.heading"]).toBe("প্রয়োজনীয় নথিপত্র");
    expect(bn["gen.button"]).toBe("প্যাকেজ তৈরি করুন");
    expect(bn["status.missing"]).toBe("অনুপস্থিত");
    expect(bn["status.expiry_needed"]).toBe("মেয়াদের তারিখ দিন");
    expect(bn["status.expired"]).toBe("মেয়াদোত্তীর্ণ");
    expect(bn["status.not_provided"]).toBe("প্রদান করা হয়নি");
    expect(bn["status.ok"]).toBe("ঠিক আছে");
    expect(bn["col.expiry"]).toBe("মেয়াদ শেষের তারিখ");
    expect(bn["file.duplicate"]).toBe("একই ফাইল (ডুপ্লিকেট)");
    expect(bn["file.remove"]).toBe("সরান");
    expect(bn["file.preview"]).toBe("দেখুন");
  });

  it("components contain no hard-coded English text between tags", () => {
    const offenders = [];
    for (const file of sourceFiles(path.join(srcDir, "components"))) {
      const text = fs.readFileSync(file, "utf8");
      for (const match of text.matchAll(/>\s*([A-Za-z][A-Za-z ,.'!?-]{2,})\s*</g)) offenders.push(`${path.basename(file)}: ${match[1]}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("translate", () => {
  it("fills parameters and picks plural forms", () => {
    expect(translate("en", "file.pages", { count: 1 })).toBe("1 page");
    expect(translate("en", "file.pages", { count: 6 })).toBe("6 pages");
    expect(translate("bn", "file.pages", { count: 6 })).toBe("৬ পৃষ্ঠা");
    expect(translate("en", "gen.issues", { count: 1 })).toBe("1 issue must be fixed before generating");
  });

  it("shows numbers with Bangla digits and picks { en, bn } params", () => {
    expect(translate("bn", "ready.count", { ready: 8, total: 10 })).toBe("১০টির মধ্যে ৮টি নথি প্রস্তুত");
    expect(translate("bn", "file.matchedTo", { title: { en: "Trade License", bn: "ট্রেড লাইসেন্স" } })).toBe(
      "যুক্ত আছে: ট্রেড লাইসেন্স",
    );
    expect(translate("en", "file.matchedTo", { title: { en: "Trade License", bn: "ট্রেড লাইসেন্স" } })).toBe(
      "Matched to: Trade License",
    );
  });

  it("falls back to English, then to the key", () => {
    expect(translate("xx", "status.ok")).toBe("OK");
    expect(translate("bn", "no.such.key")).toBe("no.such.key");
  });
});

describe("formatting", () => {
  it("converts digits", () => {
    expect(toBnDigits("2026-10-20")).toBe("২০২৬-১০-২০");
  });

  it("formats dates without time-zone shifts", () => {
    expect(formatDate("2026-10-20", "en")).toBe("20 Oct 2026");
    expect(formatDate("2026-10-20", "bn")).toMatch(/২০/);
    expect(formatDate("2026-10-20", "bn")).toMatch(/২০২৬/);
    expect(formatDate("2026-01-01", "en")).toBe("1 Jan 2026");
    expect(formatDate("2025-12-31", "en")).toBe("31 Dec 2025");
  });

  it("formats sizes", () => {
    expect(formatBytes(2946, "en")).toBe("2.9 KB");
    expect(formatBytes(171663, "en")).toBe("168 KB");
    expect(formatBytes(50 * 1024 * 1024, "en")).toBe("50 MB");
    expect(formatBytes(50 * 1024 * 1024, "bn")).toBe("৫০ এমবি");
  });

  it("gives requirement titles in the current language", () => {
    const req = { title_en: "Trade License", title_bn: "ট্রেড লাইসেন্স" };
    expect(createI18n("en").title(req)).toBe("Trade License");
    expect(createI18n("bn").title(req)).toBe("ট্রেড লাইসেন্স");
    expect(createI18n("bn").title({ title_en: "Only English", title_bn: "" })).toBe("Only English");
  });
});
