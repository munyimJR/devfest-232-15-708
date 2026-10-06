import { describe, expect, it } from "vitest";
import { AI_MODEL, askAiForFile, buildAiRequest, bytesToBase64, parseAiReply } from "../src/utils/aiAssist.js";

const requirements = [
  { id: "R01", order: 1, title_en: "Trade License", title_bn: "ট্রেড লাইসেন্স", mandatory: true, has_expiry: true },
  { id: "R10", order: 10, title_en: "Signed Declaration", title_bn: "স্বাক্ষরিত ঘোষণাপত্র", mandatory: true, has_expiry: false },
];
const ids = requirements.map((r) => r.id);
const textReply = (text, extra = {}) => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: AI_MODEL,
  content: [
    { type: "thinking", thinking: "", signature: "sig" },
    { type: "text", text },
  ],
  stop_reason: "end_turn",
  stop_details: null,
  usage: { input_tokens: 10, output_tokens: 10 },
  ...extra,
});

describe("bytesToBase64", () => {
  it("matches Node's base64 for small and large inputs", () => {
    for (const length of [0, 1, 2, 3, 100, 70000]) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 7) & 0xff);
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
    }
  });
});

describe("buildAiRequest", () => {
  it("asks claude-opus-5-5 for structured JSON with server-side fallback", () => {
    const body = buildAiRequest({ requirements, base64Pdf: "QUJD" });
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(body.fallbacks).toBe("default");
    expect(body.output_config.effort).toBe("low");
    const schema = body.output_config.format.schema;
    expect(body.output_config.format.type).toBe("json_schema");
    expect(schema.properties.requirement_id.enum).toEqual(["R01", "R10", "NONE"]);
    expect(schema.required).toEqual(["requirement_id", "expiry_date", "reason"]);
    expect(schema.additionalProperties).toBe(false);
    const [doc, text] = body.messages[0].content;
    expect(doc).toEqual({ type: "document", source: { type: "base64", media_type: "application/pdf", data: "QUJD" } });
    expect(text.text).toContain("R01: Trade License (has expiry)");
    expect(text.text).toContain("R10: Signed Declaration\n");
    expect(text.text).toContain("Use NONE if nothing matches");
  });
});

describe("parseAiReply", () => {
  it("reads a suggestion from the first text block", () => {
    const reply = textReply(JSON.stringify({ requirement_id: "R01", expiry_date: "2027-06-30", reason: "Trade licence valid until June 2027" }));
    expect(parseAiReply(reply, ids)).toEqual({
      ok: true,
      suggestion: { requirementId: "R01", expiryDate: "2027-06-30", reason: "Trade licence valid until June 2027" },
    });
  });

  it("treats NONE as no match and drops invalid dates", () => {
    const reply = textReply(JSON.stringify({ requirement_id: "NONE", expiry_date: "30/06/2027", reason: "A logo" }));
    expect(parseAiReply(reply, ids).suggestion).toEqual({ requirementId: null, expiryDate: "", reason: "A logo" });
  });

  it("checks refusal first and rejects unknown ids or broken JSON", () => {
    expect(parseAiReply(textReply("{}", { stop_reason: "refusal" }), ids)).toEqual({ ok: false, error: { code: "refused" } });
    expect(parseAiReply(textReply(JSON.stringify({ requirement_id: "R99", expiry_date: "", reason: "" })), ids).error.code).toBe("bad_reply");
    expect(parseAiReply(textReply("not json"), ids).error.code).toBe("bad_reply");
    expect(parseAiReply({ content: [], stop_reason: "end_turn" }, ids).error.code).toBe("bad_reply");
  });
});

describe("askAiForFile (mocked network)", () => {
  const file = { id: "f1", name: "scan.pdf", bytes: new TextEncoder().encode("%PDF-1.4 test") };
  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": "req_test" } });

  it("sends the request with the key and beta header, and returns the suggestion", async () => {
    let seen = null;
    const fetch = async (url, init) => {
      seen = { url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) };
      return json(200, textReply(JSON.stringify({ requirement_id: "R10", expiry_date: "", reason: "Signed declaration dated 2026-10-15" })));
    };
    const result = await askAiForFile({ apiKey: "sk-ant-test", file, requirements, fetch });
    expect(result).toEqual({
      ok: true,
      suggestion: { requirementId: "R10", expiryDate: "", reason: "Signed declaration dated 2026-10-15" },
    });
    expect(seen.url).toContain("/v1/messages");
    expect(seen.headers.get("x-api-key")).toBe("sk-ant-test");
    expect(seen.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(seen.headers.get("anthropic-dangerous-direct-browser-access")).toBe("true");
    expect(seen.body.fallbacks).toBe("default");
    expect(seen.body.messages[0].content[0].source.data).toBe(Buffer.from(file.bytes).toString("base64"));
    expect(seen.body).not.toHaveProperty("betas");
  });

  it("maps an invalid key to a friendly code", async () => {
    const fetch = async () => json(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
    expect(await askAiForFile({ apiKey: "bad", file, requirements, fetch })).toEqual({ ok: false, error: { code: "invalid_key" } });
  });

  it("maps a network failure to offline", async () => {
    const fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect((await askAiForFile({ apiKey: "sk", file, requirements, fetch })).error.code).toBe("offline");
  }, 15000);

  it("reports a refusal", async () => {
    const fetch = async () => json(200, textReply("", { stop_reason: "refusal", stop_details: { type: "refusal", category: null } }));
    expect((await askAiForFile({ apiKey: "sk", file, requirements, fetch })).error.code).toBe("refused");
  });

  it("needs a key and refuses files that are too large", async () => {
    expect((await askAiForFile({ apiKey: "", file, requirements })).error.code).toBe("no_key");
    const big = { ...file, bytes: new Uint8Array(21 * 1024 * 1024) };
    expect((await askAiForFile({ apiKey: "sk", file: big, requirements })).error.code).toBe("too_large");
  });
});
