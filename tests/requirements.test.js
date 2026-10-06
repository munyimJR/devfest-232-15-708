import { describe, expect, it } from "vitest";
import { parseRequirementsText, validateRequirements } from "../src/utils/requirements.js";
import { translate } from "../src/i18n.js";

const valid = () => ({
  tender: {
    tender_id: "T-1",
    title: "Supply of Chairs",
    procuring_entity: "Office",
    bidder: "Company Ltd.",
    submission_deadline: "2026-12-01",
  },
  requirements: [
    { id: "B", order: 2, title_en: "Second", title_bn: "দ্বিতীয়", mandatory: true, has_expiry: false },
    { id: "A", order: 1, title_en: "First", title_bn: "প্রথম", mandatory: false, has_expiry: true },
    { id: "C", order: 2, title_en: "Second (tie)", mandatory: true, has_expiry: false },
  ],
});

const messageOf = (result) => translate("en", `err.${result.error.code}`, result.error.params);

describe("parseRequirementsText", () => {
  it("accepts valid JSON and sorts by order, then id", () => {
    const result = parseRequirementsText(JSON.stringify(valid()));
    expect(result.ok).toBe(true);
    expect(result.requirements.map((r) => r.id)).toEqual(["A", "B", "C"]);
    expect(result.tender.tender_id).toBe("T-1");
  });

  it("falls back to title_en when title_bn is missing", () => {
    const result = parseRequirementsText(JSON.stringify(valid()));
    expect(result.requirements.find((r) => r.id === "C").title_bn).toBe("Second (tie)");
    expect(result.requirements.find((r) => r.id === "A").title_bn).toBe("প্রথম");
  });

  it("accepts a UTF-8 byte-order mark", () => {
    expect(parseRequirementsText(`\uFEFF${JSON.stringify(valid())}`).ok).toBe(true);
  });

  it("rejects text that is not JSON", () => {
    const result = parseRequirementsText("{ not json");
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("json_invalid");
    expect(messageOf(result)).toMatch(/not valid JSON/);
  });

  it("rejects an empty file", () => {
    expect(parseRequirementsText("   ").error.code).toBe("json_empty");
  });
});

describe("validateRequirements", () => {
  it("names the missing tender field", () => {
    const data = valid();
    delete data.tender.bidder;
    const result = validateRequirements(data);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("tender_field");
    expect(messageOf(result)).toContain("tender.bidder");
  });

  it("rejects empty tender strings", () => {
    const data = valid();
    data.tender.title = "   ";
    expect(validateRequirements(data).error.params.field).toBe("tender.title");
  });

  it("rejects a badly formatted deadline", () => {
    const data = valid();
    data.tender.submission_deadline = "01/12/2026";
    const result = validateRequirements(data);
    expect(result.error.code).toBe("deadline_format");
    expect(messageOf(result)).toContain("YYYY-MM-DD");
  });

  it("rejects a deadline that is not a real date", () => {
    const data = valid();
    data.tender.submission_deadline = "2026-02-30";
    expect(validateRequirements(data).error.code).toBe("deadline_invalid");
    data.tender.submission_deadline = "2026-13-01";
    expect(validateRequirements(data).error.code).toBe("deadline_invalid");
  });

  it("accepts 29 February in a leap year only", () => {
    const data = valid();
    data.tender.submission_deadline = "2028-02-29";
    expect(validateRequirements(data).ok).toBe(true);
    data.tender.submission_deadline = "2027-02-29";
    expect(validateRequirements(data).ok).toBe(false);
  });

  it("rejects an empty requirements list", () => {
    const data = valid();
    data.requirements = [];
    const result = validateRequirements(data);
    expect(result.error.code).toBe("requirements_empty");
    expect(messageOf(result)).toMatch(/empty/);
  });

  it("rejects a missing requirements list", () => {
    const data = valid();
    delete data.requirements;
    expect(validateRequirements(data).error.code).toBe("requirements_missing");
  });

  it("rejects a missing tender section", () => {
    expect(validateRequirements({ requirements: [] }).error.code).toBe("tender_missing");
    expect(validateRequirements([]).error.code).toBe("root_not_object");
  });

  it("names the requirement and field that are wrong", () => {
    const data = valid();
    data.requirements[1].mandatory = "yes";
    const result = validateRequirements(data);
    expect(result.error.code).toBe("req_boolean");
    expect(result.error.params).toMatchObject({ n: 2, id: "A", field: "mandatory" });
    expect(messageOf(result)).toContain('"mandatory"');
  });

  it("requires a numeric order and text title", () => {
    const data = valid();
    data.requirements[0].order = "2";
    expect(validateRequirements(data).error).toMatchObject({ code: "req_number", params: { field: "order" } });
    const data2 = valid();
    data2.requirements[0].title_en = "";
    expect(validateRequirements(data2).error).toMatchObject({ code: "req_text", params: { field: "title_en" } });
    const data3 = valid();
    delete data3.requirements[2].has_expiry;
    expect(validateRequirements(data3).error).toMatchObject({ code: "req_boolean", params: { field: "has_expiry" } });
  });

  it("rejects duplicate requirement ids", () => {
    const data = valid();
    data.requirements[2].id = "A";
    const result = validateRequirements(data);
    expect(result.error.code).toBe("req_duplicate_id");
    expect(messageOf(result)).toContain('"A"');
  });

  it("rejects a requirement that is not an object", () => {
    const data = valid();
    data.requirements.push("oops");
    expect(validateRequirements(data).error).toMatchObject({ code: "req_not_object", params: { n: 4 } });
  });

  it("has a Bangla message for every error", () => {
    const data = valid();
    data.tender.submission_deadline = "bad";
    const result = validateRequirements(data);
    const bn = translate("bn", `err.${result.error.code}`, result.error.params);
    expect(bn).not.toBe(`err.${result.error.code}`);
    expect(bn).toMatch(/[\u0980-\u09FF]/);
  });
});
