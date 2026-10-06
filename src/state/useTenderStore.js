// All app state in one reducer. Everything else (statuses, blocking list, duplicates,
// counts, readiness) is derived with useMemo - never stored twice.

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { formatBytes, loadSavedLang, saveLang } from "../i18n.js";
import { MAX_FILES, MAX_TOTAL_BYTES, inspectIncomingFile } from "../utils/pdfFile.js";
import { parseRequirementsText } from "../utils/requirements.js";
import { buildChecklist, fileUsage, findDuplicates, summarizeChecklist } from "../utils/status.js";
import { revokeAllPreviews, revokePreview } from "../utils/download.js";
import { MAX_ZIP_BYTES, readPackZip } from "../utils/zipPack.js";
import { suggestMatches } from "../utils/autoMatch.js";
import { clearSavedWork, loadSavedWork, sanitizeSavedWork, saveWork, sessionFromState } from "../utils/storage.js";
import { inspectSealImage, parsePageSelection } from "../utils/seal.js";
import { documentStartPages } from "../utils/packageGenerator.js";
import { askAiForFile, loadRememberedKey, rememberKey } from "../utils/aiAssist.js";

const MAX_MESSAGES = 100;

const SIZE_LIMIT_PARAM = { en: formatBytes(MAX_TOTAL_BYTES, "en"), bn: formatBytes(MAX_TOTAL_BYTES, "bn") };

export const DEFAULT_OPTIONS = { includeIndex: true, sealPosition: "bottom-right", sealWidth: 110 };

export function createInitialState(lang = "en", options = DEFAULT_OPTIONS, hydrated = false) {
  return {
    hydrated, // false until saved work has been looked up (nothing is saved before that)
    restored: false, // true when previous work was restored (shows the banner)
    tender: null, // { tender_id, title, procuring_entity, bidder, submission_deadline }
    requirements: [], // sorted by order, then id
    files: [], // { id, name, size, pages, hash, bytes }
    matches: {}, // { [requirementId]: fileId }
    expiry: {}, // { [requirementId]: "YYYY-MM-DD" }
    suggested: {}, // { [requirementId]: fileId } auto-matched, not yet checked by the user
    seal: null, // { name, bytes, width, height } PNG seal / signature image
    sealPages: "", // package page numbers for the seal, e.g. "3, 8-13"
    aiSuggestions: {}, // { [fileId]: { status, requirementId, expiryDate, reason, code } } (never saved)
    lang,
    options, // package options (kept when a new pack is loaded)
    messages: [], // { id, kind: "toast" | "rejection", level, key, params }
    processing: [], // files being read right now: { id, name }
    requirementsError: null, // { key, params } from the last failed requirements.json load
    lastPackage: null, // { fileName, bytes, pages, documents, signature } of the last generated package
    seq: 0, // message id counter
  };
}

function pushMessage(state, message) {
  const seq = state.seq + 1;
  return { ...state, seq, messages: [...state.messages, { id: seq, level: "info", ...message }].slice(-MAX_MESSAGES) };
}

function rejectionMessage(code, name) {
  return { kind: "rejection", level: "error", key: `reject.${code}`, params: { name, max: MAX_FILES, size: SIZE_LIMIT_PARAM } };
}

function titleOf(state, reqId) {
  const req = state.requirements.find((r) => r.id === reqId);
  return { en: req?.title_en ?? reqId, bn: req?.title_bn || req?.title_en || reqId };
}

/** Remove the match of `reqId` and its expiry date. */
function dropMatch(matches, expiry, reqId) {
  delete matches[reqId];
  delete expiry[reqId];
}

/** Suggestions for the given requirements are settled (changed or confirmed by the user). */
function withoutSuggestions(suggested, reqIds) {
  if (!reqIds.some((id) => id in suggested)) return suggested;
  const next = { ...suggested };
  for (const id of reqIds) delete next[id];
  return next;
}

export function reducer(state, action) {
  switch (action.type) {
    case "loadRequirements":
      // New requirement list: matches and expiry dates no longer apply; uploaded files are kept.
      return {
        ...state,
        tender: action.tender,
        requirements: action.requirements,
        matches: {},
        expiry: {},
        suggested: {},
        sealPages: "",
        requirementsError: null,
      };

    case "loadPack":
      // A whole pack replaces everything: tender, requirements, files, matches and dates.
      return {
        ...createInitialState(state.lang, state.options, true),
        seq: state.seq,
        seal: state.seal,
        tender: action.tender,
        requirements: action.requirements,
        messages: state.messages.filter((m) => m.kind === "toast"),
      };

    case "requirementsError": {
      const next = { ...state, requirementsError: action.error };
      return state.tender
        ? pushMessage(next, { kind: "toast", level: "error", key: action.error.key, params: action.error.params })
        : next;
    }

    case "processingAdd":
      return { ...state, processing: [...state.processing, ...action.items] };

    case "processingDone":
      return { ...state, processing: state.processing.filter((item) => item.id !== action.id) };

    case "addFile": {
      // Final guard for the limits (the upload pipeline checks them first).
      const { file } = action;
      const totalBytes = state.files.reduce((sum, f) => sum + f.size, 0);
      if (state.files.length >= MAX_FILES) return pushMessage(state, rejectionMessage("too_many_files", file.name));
      if (totalBytes + file.size > MAX_TOTAL_BYTES) return pushMessage(state, rejectionMessage("too_large", file.name));
      return { ...state, files: [...state.files, file] };
    }

    case "reject":
      return pushMessage(state, rejectionMessage(action.code, action.name));

    case "removeFile": {
      if (!state.files.some((f) => f.id === action.fileId)) return state;
      const matches = { ...state.matches };
      const expiry = { ...state.expiry };
      const affected = [];
      for (const [reqId, fileId] of Object.entries(state.matches)) {
        if (fileId === action.fileId) {
          dropMatch(matches, expiry, reqId);
          affected.push(reqId);
        }
      }
      const aiSuggestions = { ...state.aiSuggestions };
      delete aiSuggestions[action.fileId];
      return {
        ...state,
        files: state.files.filter((f) => f.id !== action.fileId),
        matches,
        expiry,
        suggested: withoutSuggestions(state.suggested, affected),
        aiSuggestions,
      };
    }

    case "assign": {
      const { reqId, fileId } = action;
      if (!fileId) return reducer(state, { type: "unassign", reqId });
      const file = state.files.find((f) => f.id === fileId);
      if (!file || !state.requirements.some((r) => r.id === reqId)) return state;
      if (state.matches[reqId] === fileId) return state;

      // A file with the same content may not be used for a different requirement.
      for (const [otherReqId, otherFileId] of Object.entries(state.matches)) {
        if (otherReqId === reqId || otherFileId === fileId) continue;
        const other = state.files.find((f) => f.id === otherFileId);
        if (other && other.hash === file.hash) {
          return pushMessage(state, {
            kind: "toast",
            level: "error",
            key: "match.duplicateBlocked",
            params: { name: file.name, other: other.name, title: titleOf(state, otherReqId) },
          });
        }
      }

      const matches = { ...state.matches };
      const expiry = { ...state.expiry };
      // 1-to-1: the file leaves any other requirement first.
      let movedFrom = null;
      for (const [otherReqId, otherFileId] of Object.entries(state.matches)) {
        if (otherFileId === fileId && otherReqId !== reqId) {
          dropMatch(matches, expiry, otherReqId);
          movedFrom = otherReqId;
        }
      }
      // A different document replaces the old one: its expiry date no longer applies.
      if (matches[reqId]) delete expiry[reqId];
      matches[reqId] = fileId;

      const next = {
        ...state,
        matches,
        expiry,
        suggested: withoutSuggestions(state.suggested, movedFrom ? [reqId, movedFrom] : [reqId]),
      };
      if (!movedFrom) return next;
      return pushMessage(next, {
        kind: "toast",
        level: "info",
        key: "match.moved",
        params: { name: file.name, from: titleOf(state, movedFrom), to: titleOf(state, reqId) },
      });
    }

    case "unassign": {
      if (!(action.reqId in state.matches) && !(action.reqId in state.expiry)) return state;
      const matches = { ...state.matches };
      const expiry = { ...state.expiry };
      dropMatch(matches, expiry, action.reqId);
      return { ...state, matches, expiry, suggested: withoutSuggestions(state.suggested, [action.reqId]) };
    }

    case "setExpiry": {
      const { reqId, value } = action;
      if (!state.matches[reqId]) return state;
      const expiry = { ...state.expiry };
      if (value) expiry[reqId] = value;
      else delete expiry[reqId];
      return { ...state, expiry };
    }

    case "autoMatch": {
      const suggestions = suggestMatches({ requirements: state.requirements, files: state.files, matches: state.matches });
      if (!suggestions.length) return pushMessage(state, { kind: "toast", level: "info", key: "auto.none" });
      const matches = { ...state.matches };
      const suggested = { ...state.suggested };
      for (const { reqId, fileId } of suggestions) {
        matches[reqId] = fileId;
        suggested[reqId] = fileId;
      }
      return pushMessage(
        { ...state, matches, suggested },
        { kind: "toast", level: "success", key: "auto.done", params: { count: suggestions.length } },
      );
    }

    case "confirmSuggestion":
      return { ...state, suggested: withoutSuggestions(state.suggested, [action.reqId]) };

    case "confirmAllSuggestions":
      return { ...state, suggested: {} };

    case "restore":
      if (!action.data) return { ...state, hydrated: true };
      return { ...state, ...action.data, hydrated: true, restored: true };

    case "dismissRestored":
      return { ...state, restored: false };

    case "aiStatus":
      return { ...state, aiSuggestions: { ...state.aiSuggestions, [action.fileId]: action.entry } };

    case "aiClear": {
      if (!(action.fileId in state.aiSuggestions)) return state;
      const aiSuggestions = { ...state.aiSuggestions };
      delete aiSuggestions[action.fileId];
      return { ...state, aiSuggestions };
    }

    case "aiAccept": {
      // Accept = the normal assign (all matching rules apply) + the expiry date if the AI found one.
      const entry = state.aiSuggestions[action.fileId];
      if (!entry?.requirementId) return state;
      const req = state.requirements.find((r) => r.id === entry.requirementId);
      if (!req) return state;
      let next = reducer(state, { type: "assign", reqId: req.id, fileId: action.fileId });
      if (next.matches[req.id] !== action.fileId) return next; // assign was refused (message already shown)
      if (req.has_expiry && entry.expiryDate) next = reducer(next, { type: "setExpiry", reqId: req.id, value: entry.expiryDate });
      const aiSuggestions = { ...next.aiSuggestions };
      delete aiSuggestions[action.fileId];
      const file = next.files.find((f) => f.id === action.fileId);
      return pushMessage(
        { ...next, aiSuggestions },
        { kind: "toast", level: "success", key: "ai.accepted", params: { name: file?.name ?? "", title: titleOf(next, req.id) } },
      );
    }

    case "setSeal":
      return { ...state, seal: action.seal };

    case "removeSeal":
      return { ...state, seal: null };

    case "setSealPages":
      return { ...state, sealPages: action.value };

    case "setOption":
      return { ...state, options: { ...state.options, [action.name]: action.value } };

    case "setLang":
      return { ...state, lang: action.lang === "bn" ? "bn" : "en" };

    case "packageGenerated":
      return { ...state, lastPackage: action.info };

    case "notify":
      return pushMessage(state, { kind: "toast", level: action.level, key: action.key, params: action.params });

    case "dismiss":
      return { ...state, messages: state.messages.filter((m) => m.id !== action.id) };

    case "dismissKind":
      return { ...state, messages: state.messages.filter((m) => m.kind !== action.kind) };

    case "reset":
      return { ...createInitialState(state.lang, state.options, true), seq: state.seq };

    default:
      return state;
  }
}

const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

export function useTenderStore() {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(loadSavedLang()));

  // Latest files / requirements for async work (upload pipeline limits, AI requests).
  const filesRef = useRef(state.files);
  const requirementsRef = useRef(state.requirements);
  useLayoutEffect(() => {
    filesRef.current = state.files;
    requirementsRef.current = state.requirements;
  });

  // AI help: the user's own API key lives only in memory (and sessionStorage if they ask).
  const [apiKey, setApiKeyState] = useState(() => loadRememberedKey());
  const [keyRemembered, setKeyRemembered] = useState(() => Boolean(loadRememberedKey()));
  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;
  const aiConsentRef = useRef(false);
  const aiEpochRef = useRef(0);

  const queueRef = useRef(Promise.resolve());
  const epochRef = useRef(0); // bumped by reset() so a running upload batch stops
  const tempIdRef = useRef(0);

  useEffect(() => {
    saveLang(state.lang);
    document.documentElement.lang = state.lang;
  }, [state.lang]);

  // Reopen previous work saved in this browser.
  useEffect(() => {
    let cancelled = false;
    loadSavedWork().then((saved) => {
      if (!cancelled) dispatch({ type: "restore", data: saved ? sanitizeSavedWork(saved, DEFAULT_OPTIONS) : null });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Save after every change (debounced). Never before the saved work has been read.
  const saveWarnedRef = useRef(false);
  useEffect(() => {
    if (!state.hydrated) return undefined;
    const timer = setTimeout(() => {
      if (!state.tender) {
        clearSavedWork();
        return;
      }
      saveWork(sessionFromState(state), state.files).catch(() => {
        if (saveWarnedRef.current) return;
        saveWarnedRef.current = true;
        dispatch({ type: "notify", level: "warning", key: "storage.saveFailed" });
      });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.hydrated,
    state.tender,
    state.requirements,
    state.files,
    state.matches,
    state.expiry,
    state.suggested,
    state.options,
    state.seal,
    state.sealPages,
  ]);

  const notify = useCallback((level, key, params) => dispatch({ type: "notify", level, key, params }), []);

  /** Send files through the upload pipeline, one at a time, in the order given. */
  const addFiles = useCallback((list) => {
    const incoming = Array.from(list ?? []);
    if (!incoming.length) return queueRef.current;
    const batch = incoming.map((file) => {
      tempIdRef.current += 1;
      return { file, tempId: `p${tempIdRef.current}` };
    });
    dispatch({ type: "processingAdd", items: batch.map(({ file, tempId }) => ({ id: tempId, name: file.name })) });
    const epoch = epochRef.current;

    const run = async () => {
      const accepted = [];
      for (const { file, tempId } of batch) {
        if (epochRef.current !== epoch) break;
        try {
          const current = filesRef.current;
          const notYetInState = accepted.filter((a) => !current.some((c) => c.id === a.id));
          const all = [...current, ...notYetInState];
          const existing = { count: all.length, totalBytes: all.reduce((sum, f) => sum + f.size, 0) };
          const result = await inspectIncomingFile(file, existing);
          if (epochRef.current !== epoch) break;
          if (result.ok) {
            accepted.push(result.file);
            dispatch({ type: "addFile", file: result.file });
          } else {
            dispatch({ type: "reject", code: result.error.code, name: file.name });
          }
        } catch {
          dispatch({ type: "reject", code: "unreadable", name: file.name });
        } finally {
          dispatch({ type: "processingDone", id: tempId });
        }
        await yieldToBrowser();
      }
      if (epochRef.current === epoch && accepted.length) {
        dispatch({ type: "notify", level: "success", key: "files.added", params: { count: accepted.length } });
      }
    };
    queueRef.current = queueRef.current.then(run, run);
    return queueRef.current;
  }, []);

  /** Read, validate and load requirements.json. `confirmReplace` is asked before replacing matches. */
  const loadRequirementsFile = useCallback(async (file, { confirmReplace } = {}) => {
    if (!file) return false;
    const fail = (key, params) => {
      dispatch({ type: "requirementsError", error: { key, params, title: "json.errorTitle" } });
      return false;
    };
    let text;
    try {
      text = await file.text();
    } catch {
      return fail("err.json_unreadable");
    }
    const result = parseRequirementsText(text);
    if (!result.ok) {
      const looksLikeJson = /\.json$/i.test(file.name) || file.type === "application/json";
      return result.error.code === "json_invalid" && !looksLikeJson
        ? fail("json.notJson", { name: file.name })
        : fail(`err.${result.error.code}`, result.error.params);
    }
    if (confirmReplace && !confirmReplace()) return false;
    dispatch({ type: "loadRequirements", tender: result.tender, requirements: result.requirements });
    dispatch({
      type: "notify",
      level: "success",
      key: "json.loaded",
      params: { count: result.requirements.length, id: result.tender.tender_id },
    });
    return true;
  }, []);

  /**
   * Load a whole pack from a .zip: requirements.json from anywhere in the zip, and every file
   * in a documents/ folder through the normal upload pipeline. Replaces the current work.
   */
  const loadPack = useCallback(
    async (file, { confirmReplace } = {}) => {
      if (!file) return false;
      const fail = (key, params) => {
        dispatch({ type: "requirementsError", error: { key, params, title: "zip.errorTitle" } });
        return false;
      };
      const pack = await readPackZip(file);
      if (!pack.ok) {
        return fail(`zip.${pack.error.code}`, { size: { en: formatBytes(MAX_ZIP_BYTES, "en"), bn: formatBytes(MAX_ZIP_BYTES, "bn") } });
      }
      const result = parseRequirementsText(pack.requirementsText);
      if (!result.ok) return fail(`err.${result.error.code}`, result.error.params);
      if (confirmReplace && !confirmReplace()) return false;

      epochRef.current += 1; // stop any upload still running for the old work
      aiEpochRef.current += 1;
      revokeAllPreviews();
      dispatch({ type: "loadPack", tender: result.tender, requirements: result.requirements });
      dispatch({
        type: "notify",
        level: "success",
        key: "zip.loaded",
        params: { id: result.tender.tender_id, count: pack.documents.length + pack.oversized.length },
      });
      for (const name of pack.oversized) dispatch({ type: "reject", code: "too_large", name });
      await addFiles(pack.documents);
      return true;
    },
    [addFiles],
  );

  const removeFile = useCallback((fileId) => {
    revokePreview(fileId);
    dispatch({ type: "removeFile", fileId });
  }, []);

  const assign = useCallback((reqId, fileId) => dispatch({ type: "assign", reqId, fileId }), []);
  const unassign = useCallback((reqId) => dispatch({ type: "unassign", reqId }), []);
  const setExpiry = useCallback((reqId, value) => dispatch({ type: "setExpiry", reqId, value }), []);
  const setLang = useCallback((lang) => dispatch({ type: "setLang", lang }), []);
  const autoMatch = useCallback(() => dispatch({ type: "autoMatch" }), []);
  const setOption = useCallback((name, value) => dispatch({ type: "setOption", name, value }), []);
  const setSealPages = useCallback((value) => dispatch({ type: "setSealPages", value }), []);
  const removeSeal = useCallback(() => dispatch({ type: "removeSeal" }), []);
  const setSealFile = useCallback(async (file) => {
    if (!file) return false;
    const result = await inspectSealImage(file);
    if (!result.ok) {
      dispatch({ type: "notify", level: "error", key: `seal.${result.error.code}`, params: result.error.params });
      return false;
    }
    dispatch({ type: "setSeal", seal: result.seal });
    return true;
  }, []);
  const confirmSuggestion = useCallback((reqId) => dispatch({ type: "confirmSuggestion", reqId }), []);
  const confirmAllSuggestions = useCallback(() => dispatch({ type: "confirmAllSuggestions" }), []);
  const packageGenerated = useCallback((info) => dispatch({ type: "packageGenerated", info }), []);
  const dismiss = useCallback((id) => dispatch({ type: "dismiss", id }), []);
  const dismissKind = useCallback((kind) => dispatch({ type: "dismissKind", kind }), []);

  const reset = useCallback(() => {
    epochRef.current += 1;
    aiEpochRef.current += 1;
    revokeAllPreviews();
    clearSavedWork();
    dispatch({ type: "reset" });
  }, []);
  const dismissRestored = useCallback(() => dispatch({ type: "dismissRestored" }), []);

  const setApiKey = useCallback((key, remember) => {
    const value = String(key ?? "").trim();
    setApiKeyState(value);
    setKeyRemembered(Boolean(value) && remember);
    rememberKey(remember ? value : "");
  }, []);

  /**
   * Ask the AI about these files, one at a time. `confirmSend(count)` is asked once per
   * session before the first file is sent to Anthropic.
   */
  const askAi = useCallback(async (fileIds, { confirmSend } = {}) => {
    const ids = fileIds.filter((id) => filesRef.current.some((f) => f.id === id));
    if (!ids.length) return;
    if (!apiKeyRef.current) {
      dispatch({ type: "notify", level: "error", key: "ai.noKey" });
      return;
    }
    if (!aiConsentRef.current) {
      if (confirmSend && !confirmSend(ids.length)) return;
      aiConsentRef.current = true;
    }
    const epoch = aiEpochRef.current;
    for (const fileId of ids) dispatch({ type: "aiStatus", fileId, entry: { status: "queued" } });
    for (let i = 0; i < ids.length; i += 1) {
      const fileId = ids[i];
      const file = filesRef.current.find((f) => f.id === fileId);
      if (!file || aiEpochRef.current !== epoch) continue;
      dispatch({ type: "aiStatus", fileId, entry: { status: "loading" } });
      const result = await askAiForFile({ apiKey: apiKeyRef.current, file, requirements: requirementsRef.current });
      if (aiEpochRef.current !== epoch || !filesRef.current.some((f) => f.id === fileId)) continue;
      dispatch({
        type: "aiStatus",
        fileId,
        entry: result.ok ? { status: "done", ...result.suggestion } : { status: "error", code: result.error.code },
      });
      // A wrong key fails every request: stop instead of sending the remaining files.
      if (!result.ok && result.error.code === "invalid_key") {
        for (const rest of ids.slice(i + 1)) dispatch({ type: "aiClear", fileId: rest });
        break;
      }
    }
  }, []);

  const acceptAi = useCallback((fileId) => dispatch({ type: "aiAccept", fileId }), []);
  const dismissAi = useCallback((fileId) => dispatch({ type: "aiClear", fileId }), []);

  const derived = useMemo(() => {
    const totalBytes = state.files.reduce((sum, f) => sum + f.size, 0);
    const duplicates = findDuplicates(state.files);
    const usage = fileUsage(state.matches);
    const rows = state.tender
      ? buildChecklist({
          requirements: state.requirements,
          files: state.files,
          matches: state.matches,
          expiry: state.expiry,
          deadline: state.tender.submission_deadline,
        })
      : [];
    const summary = summarizeChecklist(rows);
    const requirementsById = new Map(state.requirements.map((r) => [r.id, r]));
    // Cover page (+ index page) + every page of every included document.
    const frontPages = state.options.includeIndex ? 2 : 1;
    const packagePages = summary.included.length ? summary.documentPages + frontPages : 0;
    const startPages = documentStartPages(
      summary.included.map((row) => row.file.pages),
      { includeIndex: state.options.includeIndex },
    );
    const packageDocs = summary.included.map((row, index) => ({ req: row.req, startPage: startPages[index], pages: row.file.pages }));

    // Seal: the page choice is checked against the current package layout.
    let sealSelection = null;
    if (state.seal && state.sealPages.trim()) {
      sealSelection = packageDocs.length
        ? parsePageSelection(state.sealPages, { total: packagePages, firstDocPage: frontPages + 1 })
        : { ok: false, error: { code: "no_docs", params: {} } };
    }
    const sealIssue = sealSelection && !sealSelection.ok ? sealSelection.error : null;
    const sealPageList = sealSelection?.ok ? sealSelection.pages : [];
    const readyToGenerate = summary.canGenerate && !sealIssue;
    // Everything that changes the package content; a stored package with another signature is out of date.
    const packageSignature = JSON.stringify([
      state.tender,
      state.options,
      summary.included.map((row) => [row.req.id, row.req.title_en, row.file.id]),
      state.seal ? [state.seal.name, state.seal.bytes.length, sealPageList] : null,
    ]);
    const packageFresh = Boolean(state.lastPackage) && state.lastPackage.signature === packageSignature && readyToGenerate;
    // A suggestion shows only while the auto-matched file is still the match.
    const suggestedReqIds = new Set(
      Object.entries(state.suggested)
        .filter(([reqId, fileId]) => state.matches[reqId] === fileId)
        .map(([reqId]) => reqId),
    );
    const canAutoMatch =
      state.requirements.some((req) => !state.matches[req.id]) && state.files.some((file) => !usage.has(file.id));
    return {
      rows,
      summary,
      duplicates,
      usage,
      totalBytes,
      requirementsById,
      packagePages,
      packageDocs,
      packageSignature,
      packageFresh,
      sealIssue,
      sealPageList,
      readyToGenerate,
      suggestedReqIds,
      canAutoMatch,
    };
  }, [state.tender, state.requirements, state.files, state.matches, state.expiry, state.suggested, state.options, state.seal, state.sealPages, state.lastPackage]);

  const actions = useMemo(
    () => ({
      loadRequirementsFile,
      loadPack,
      addFiles,
      removeFile,
      assign,
      unassign,
      setExpiry,
      setLang,
      autoMatch,
      setOption,
      setSealFile,
      setSealPages,
      removeSeal,
      confirmSuggestion,
      confirmAllSuggestions,
      packageGenerated,
      notify,
      dismiss,
      dismissKind,
      reset,
      dismissRestored,
      setApiKey,
      askAi,
      acceptAi,
      dismissAi,
    }),
    [loadRequirementsFile, loadPack, addFiles, removeFile, assign, unassign, setExpiry, setLang, autoMatch, setOption, setSealFile, setSealPages, removeSeal, confirmSuggestion, confirmAllSuggestions, packageGenerated, notify, dismiss, dismissKind, reset, dismissRestored, setApiKey, askAi, acceptAi, dismissAi],
  );

  const ai = useMemo(() => ({ apiKey, hasKey: Boolean(apiKey), keyRemembered }), [apiKey, keyRemembered]);

  return { state, derived, actions, ai };
}
