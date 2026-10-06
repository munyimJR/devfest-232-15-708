// All app state in one reducer. Everything else (statuses, blocking list, duplicates,
// counts, readiness) is derived with useMemo - never stored twice.

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import { formatBytes, loadSavedLang, saveLang } from "../i18n.js";
import { MAX_FILES, MAX_TOTAL_BYTES, inspectIncomingFile } from "../utils/pdfFile.js";
import { parseRequirementsText } from "../utils/requirements.js";
import { buildChecklist, fileUsage, findDuplicates, summarizeChecklist } from "../utils/status.js";
import { revokeAllPreviews, revokePreview } from "../utils/download.js";

const MAX_MESSAGES = 100;

const SIZE_LIMIT_PARAM = { en: formatBytes(MAX_TOTAL_BYTES, "en"), bn: formatBytes(MAX_TOTAL_BYTES, "bn") };

export function createInitialState(lang = "en") {
  return {
    tender: null, // { tender_id, title, procuring_entity, bidder, submission_deadline }
    requirements: [], // sorted by order, then id
    files: [], // { id, name, size, pages, hash, bytes }
    matches: {}, // { [requirementId]: fileId }
    expiry: {}, // { [requirementId]: "YYYY-MM-DD" }
    lang,
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
        requirementsError: null,
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
      for (const [reqId, fileId] of Object.entries(state.matches)) {
        if (fileId === action.fileId) dropMatch(matches, expiry, reqId);
      }
      return { ...state, files: state.files.filter((f) => f.id !== action.fileId), matches, expiry };
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

      const next = { ...state, matches, expiry };
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
      return { ...state, matches, expiry };
    }

    case "setExpiry": {
      const { reqId, value } = action;
      if (!state.matches[reqId]) return state;
      const expiry = { ...state.expiry };
      if (value) expiry[reqId] = value;
      else delete expiry[reqId];
      return { ...state, expiry };
    }

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
      return { ...createInitialState(state.lang), seq: state.seq };

    default:
      return state;
  }
}

const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

export function useTenderStore() {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(loadSavedLang()));

  // Latest files for the upload pipeline's limit checks.
  const filesRef = useRef(state.files);
  useLayoutEffect(() => {
    filesRef.current = state.files;
  });

  const queueRef = useRef(Promise.resolve());
  const epochRef = useRef(0); // bumped by reset() so a running upload batch stops
  const tempIdRef = useRef(0);

  useEffect(() => {
    saveLang(state.lang);
    document.documentElement.lang = state.lang;
  }, [state.lang]);

  const notify = useCallback((level, key, params) => dispatch({ type: "notify", level, key, params }), []);

  /** Read, validate and load requirements.json. `confirmReplace` is asked before replacing matches. */
  const loadRequirementsFile = useCallback(async (file, { confirmReplace } = {}) => {
    if (!file) return false;
    let text;
    try {
      text = await file.text();
    } catch {
      dispatch({ type: "requirementsError", error: { key: "err.json_unreadable" } });
      return false;
    }
    const result = parseRequirementsText(text);
    if (!result.ok) {
      const looksLikeJson = /\.json$/i.test(file.name) || file.type === "application/json";
      const error =
        result.error.code === "json_invalid" && !looksLikeJson
          ? { key: "json.notJson", params: { name: file.name } }
          : { key: `err.${result.error.code}`, params: result.error.params };
      dispatch({ type: "requirementsError", error });
      return false;
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

  const removeFile = useCallback((fileId) => {
    revokePreview(fileId);
    dispatch({ type: "removeFile", fileId });
  }, []);

  const assign = useCallback((reqId, fileId) => dispatch({ type: "assign", reqId, fileId }), []);
  const unassign = useCallback((reqId) => dispatch({ type: "unassign", reqId }), []);
  const setExpiry = useCallback((reqId, value) => dispatch({ type: "setExpiry", reqId, value }), []);
  const setLang = useCallback((lang) => dispatch({ type: "setLang", lang }), []);
  const packageGenerated = useCallback((info) => dispatch({ type: "packageGenerated", info }), []);
  const dismiss = useCallback((id) => dispatch({ type: "dismiss", id }), []);
  const dismissKind = useCallback((kind) => dispatch({ type: "dismissKind", kind }), []);

  const reset = useCallback(() => {
    epochRef.current += 1;
    revokeAllPreviews();
    dispatch({ type: "reset" });
  }, []);

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
    // Cover page + every page of every included document.
    const packagePages = summary.included.length ? summary.documentPages + 1 : 0;
    // Everything that changes the package content; a stored package with another signature is out of date.
    const packageSignature = JSON.stringify([
      state.tender,
      summary.included.map((row) => [row.req.id, row.req.title_en, row.file.id]),
    ]);
    const packageFresh = Boolean(state.lastPackage) && state.lastPackage.signature === packageSignature && summary.canGenerate;
    return { rows, summary, duplicates, usage, totalBytes, requirementsById, packagePages, packageSignature, packageFresh };
  }, [state.tender, state.requirements, state.files, state.matches, state.expiry, state.lastPackage]);

  const actions = useMemo(
    () => ({
      loadRequirementsFile,
      addFiles,
      removeFile,
      assign,
      unassign,
      setExpiry,
      setLang,
      packageGenerated,
      notify,
      dismiss,
      dismissKind,
      reset,
    }),
    [loadRequirementsFile, addFiles, removeFile, assign, unassign, setExpiry, setLang, packageGenerated, notify, dismiss, dismissKind, reset],
  );

  return { state, derived, actions };
}
