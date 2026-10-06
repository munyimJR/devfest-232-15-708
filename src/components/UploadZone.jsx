import { useRef } from "react";
import { CloudUpload, FilePlus2, FileWarning, Sparkles, X } from "lucide-react";
import { useI18n, useStore } from "../state/contexts.js";
import { MAX_FILES, MAX_TOTAL_BYTES } from "../utils/pdfFile.js";
import { splitPackFiles } from "../utils/dropFiles.js";
import DropZone from "./DropZone.jsx";
import UploadedFileList from "./UploadedFileList.jsx";

/** Files that were rejected, with the exact reason. Stays until dismissed. */
function RejectedFiles() {
  const { t } = useI18n();
  const { state, actions } = useStore();
  const rejected = state.messages.filter((message) => message.kind === "rejection");
  if (!rejected.length) return null;
  return (
    <div className="mx-4 mb-4 rounded-xl border border-red-200 bg-red-50" role="alert">
      <div className="flex items-center justify-between gap-2 border-b border-red-200/70 px-3 py-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-red-900">
          <FileWarning className="size-4 text-red-600" aria-hidden="true" />
          {t("rejected.heading")}
        </p>
        {rejected.length > 1 && (
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-100"
            onClick={() => actions.dismissKind("rejection")}
          >
            {t("rejected.dismissAll")}
          </button>
        )}
      </div>
      <ul className="max-h-48 divide-y divide-red-200/60 overflow-y-auto">
        {rejected.map((message) => (
          <li key={message.id} className="flex items-start gap-2 px-3 py-2 text-sm text-red-900">
            <span className="min-w-0 flex-1 break-words">{t(message.key, message.params)}</span>
            <button
              type="button"
              className="-m-1 shrink-0 rounded-md p-1 text-red-700 hover:bg-red-100"
              onClick={() => actions.dismiss(message.id)}
              aria-label={t("rejected.dismiss")}
              title={t("rejected.dismiss")}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** With an API key: ask the AI about every file that is not matched yet. */
function AskAiForUnmatched() {
  const { t } = useI18n();
  const { state, derived, actions, ai } = useStore();
  if (!ai.hasKey || !state.files.length) return null;
  const busy = Object.values(state.aiSuggestions).some((s) => s.status === "loading" || s.status === "queued");
  const unmatched = state.files.filter((file) => !derived.usage.has(file.id) && state.aiSuggestions[file.id]?.status !== "done");
  return (
    <div className="mx-4 mb-3 flex items-center justify-between gap-2 rounded-lg bg-violet-50 px-3 py-2 ring-1 ring-violet-200 ring-inset">
      <p className="text-xs font-medium text-violet-900">{t("ai.unmatchedCount", { count: unmatched.length })}</p>
      <button
        type="button"
        className="btn btn-secondary min-h-8 px-2.5 py-1 text-xs"
        disabled={busy || !unmatched.length}
        onClick={() =>
          actions.askAi(
            unmatched.map((file) => file.id),
            { confirmSend: (count) => window.confirm(t("ai.confirmSend", { count })) },
          )
        }
      >
        <Sparkles className="size-3.5 text-violet-600" aria-hidden="true" />
        {t("ai.askAll")}
      </button>
    </div>
  );
}

/** Left column: drop zone + file picker, rejected files and the uploaded file list. */
export default function UploadZone() {
  const { t, bytes } = useI18n();
  const { state, derived, actions } = useStore();
  const inputRef = useRef(null);

  return (
    <section className="card overflow-hidden" aria-labelledby="upload-heading">
      <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
        <h2 id="upload-heading" className="text-base font-bold text-slate-900">
          {t("upload.heading")}
        </h2>
        <p className="text-xs font-medium text-slate-500 tabular-nums">
          {t("stat.ofMax", { value: state.files.length, max: MAX_FILES })} · {bytes(derived.totalBytes)}
        </p>
      </div>

      <div className="p-4">
        <DropZone
          onDrop={({ items, hasFolders }) => {
            const zip = items.find((item) => /\.zip$/i.test(item.path));
            if (zip) {
              // A .zip is a whole pack: it replaces the current tender after confirmation.
              actions.loadPack(zip.file, { confirmReplace: () => window.confirm(t("confirm.replacePack")) });
              return;
            }
            // A dropped folder may hold a whole pack: only its document files are added here.
            actions.addFiles(hasFolders ? splitPackFiles(items).documents : items.map((item) => item.file));
          }}
          activeLabel={t("upload.dropActive")}
        >
          <div className="flex flex-col items-center px-4 py-6 text-center">
            <CloudUpload className="size-8 text-brand-600" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-slate-800">{t("upload.drop")}</p>
            <p className="my-1.5 text-xs text-slate-500">{t("upload.or")}</p>
            <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}>
              <FilePlus2 className="size-4" aria-hidden="true" />
              {t("upload.choose")}
            </button>
            <p className="mt-3 text-xs text-slate-500">
              {t("upload.limits", { max: MAX_FILES, size: bytes(MAX_TOTAL_BYTES) })}
            </p>
            {/* No `accept` filter on purpose: every chosen file is checked, and non-PDFs get a clear message. */}
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                actions.addFiles(files);
              }}
            />
          </div>
        </DropZone>
      </div>

      <RejectedFiles />
      <AskAiForUnmatched />
      <UploadedFileList />
    </section>
  );
}
