// Optional AI help with the user's own Anthropic API key. The only feature that calls an
// external API, and only after the user agrees. The SDK is loaded on demand so the app
// itself stays small and works fully without it.
//
// The AI only *suggests*: it never changes matches or dates by itself.

import { isValidYmd } from "./dates.js";

export const AI_MODEL = "claude-opus-5-5";
// Base64 makes the request about a third larger; keep well under the 32 MB request limit.
export const AI_MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Base64 of a Uint8Array, converted in chunks (no stack overflow on large files). */
export function bytesToBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Request body for one file. Pure, so it can be tested without the network. */
export function buildAiRequest({ requirements, base64Pdf }) {
  const requirementIds = requirements.map((req) => req.id);
  const list = requirements
    .map((req) => `${req.id}: ${req.title_en}${req.has_expiry ? " (has expiry)" : ""}`)
    .join("\n");
  return {
    model: AI_MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            requirement_id: { type: "string", enum: [...requirementIds, "NONE"] },
            expiry_date: { type: "string", description: "YYYY-MM-DD or empty" },
            reason: { type: "string" },
          },
          required: ["requirement_id", "expiry_date", "reason"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Pdf } },
          {
            type: "text",
            text:
              "This PDF is one document from a tender bid package. Which of these requirements does it match?\n" +
              `${list}\n` +
              "If the document shows an expiry / valid-until date, return it as YYYY-MM-DD, otherwise an empty string. " +
              "Use NONE if nothing matches. Reason under 15 words.",
          },
        ],
      },
    ],
  };
}

/**
 * Read the model's reply. Returns { ok: true, suggestion: { requirementId, expiryDate, reason } }
 * (requirementId null = no match) or { ok: false, error: { code } }.
 */
export function parseAiReply(response, requirementIds) {
  if (!response || response.stop_reason === "refusal") return { ok: false, error: { code: "refused" } };
  const textBlock = (response.content ?? []).find((block) => block.type === "text");
  if (!textBlock) return { ok: false, error: { code: "bad_reply" } };
  let data;
  try {
    data = JSON.parse(textBlock.text);
  } catch {
    return { ok: false, error: { code: "bad_reply" } };
  }
  if (!data || typeof data.requirement_id !== "string") return { ok: false, error: { code: "bad_reply" } };
  const known = requirementIds.includes(data.requirement_id);
  if (!known && data.requirement_id !== "NONE") return { ok: false, error: { code: "bad_reply" } };
  const expiry = typeof data.expiry_date === "string" ? data.expiry_date.trim() : "";
  const reason = typeof data.reason === "string" ? data.reason.trim().slice(0, 200) : "";
  return {
    ok: true,
    suggestion: {
      requirementId: known ? data.requirement_id : null,
      expiryDate: isValidYmd(expiry) ? expiry : "",
      reason,
    },
  };
}

/** Friendly error code for an SDK / network error. */
export function aiErrorCode(error, Anthropic) {
  if (Anthropic) {
    if (error instanceof Anthropic.AuthenticationError) return "invalid_key";
    if (error instanceof Anthropic.PermissionDeniedError) return "permission";
    if (error instanceof Anthropic.RateLimitError) return "rate_limit";
    if (error instanceof Anthropic.APIConnectionError) return "offline"; // includes timeouts
    if (error instanceof Anthropic.BadRequestError) return /too (large|long)|exceed|maximum/i.test(error.message) ? "too_large" : "failed";
    if (error instanceof Anthropic.InternalServerError) return "busy";
  }
  const status = error?.status;
  if (status === 401) return "invalid_key";
  if (status === 403) return "permission";
  if (status === 413) return "too_large";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "busy";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  return "failed";
}

/**
 * Ask the AI which requirement `file` matches. `fetch` can be injected (tests).
 * Never throws.
 */
export async function askAiForFile({ apiKey, file, requirements, fetch: customFetch }) {
  if (!apiKey) return { ok: false, error: { code: "no_key" } };
  if (file.bytes.length > AI_MAX_FILE_BYTES) return { ok: false, error: { code: "too_large" } };
  let Anthropic = null;
  try {
    Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
      maxRetries: 1,
      ...(customFetch ? { fetch: customFetch } : {}),
    });
    const response = await client.beta.messages.create(buildAiRequest({ requirements, base64Pdf: bytesToBase64(file.bytes) }));
    return parseAiReply(response, requirements.map((req) => req.id));
  } catch (error) {
    return { ok: false, error: { code: aiErrorCode(error, Anthropic) } };
  }
}

const KEY_STORAGE = "tenderpack.anthropicKey";

/** Key remembered for this browser tab only (sessionStorage), if the user chose so. */
export function loadRememberedKey() {
  try {
    return globalThis.sessionStorage?.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function rememberKey(key) {
  try {
    if (key) globalThis.sessionStorage?.setItem(KEY_STORAGE, key);
    else globalThis.sessionStorage?.removeItem(KEY_STORAGE);
  } catch {
    // storage unavailable: the key simply lives in memory
  }
}
