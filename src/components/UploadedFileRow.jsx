import { CircleCheck, Copy, Eye, FileText, Sparkles, Trash2 } from "lucide-react";
import { useI18n, useStore } from "../state/contexts.js";
import { openPdfInNewTab } from "../utils/download.js";
import AiSuggestion from "./AiSuggestion.jsx";

/** One uploaded PDF: name, pages, size, what it is matched to, duplicate warning, preview / remove. */
export default function UploadedFileRow({ file }) {
  const { t, bytes, title } = useI18n();
  const { state, derived, actions, ai } = useStore();
  const suggestion = state.aiSuggestions[file.id];
  const aiBusy = suggestion?.status === "loading" || suggestion?.status === "queued";

  const reqId = derived.usage.get(file.id);
  const req = reqId ? derived.requirementsById.get(reqId) : null;
  const twins = derived.duplicates.get(file.id) ?? [];

  const preview = () => {
    if (!openPdfInNewTab(file.id, file.bytes)) actions.notify("error", "file.previewFailed");
  };

  const remove = () => {
    actions.removeFile(file.id);
    actions.notify("info", "files.removed", { name: file.name });
  };

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-red-50 text-red-700 ring-1 ring-red-100">
          <FileText className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900" title={file.name}>
            {file.name}
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            {t("file.pages", { count: file.pages })} · {bytes(file.size)}
          </p>
          {req ? (
            <p className="mt-1 flex items-start gap-1 text-xs font-medium text-emerald-800">
              <CircleCheck className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{t("file.matchedTo", { title: title(req) })}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">{t("file.notMatched")}</p>
          )}
          {twins.length > 0 && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-amber-900">
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 font-semibold ring-1 ring-amber-300/60 ring-inset">
                <Copy className="size-3" aria-hidden="true" />
                {t("file.duplicate")}
              </span>
              <span className="min-w-0 break-words">{t("file.sameAs", { name: twins.map((twin) => twin.name).join(", ") })}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-1">
          <button
            type="button"
            className="btn btn-secondary min-h-8 justify-start px-2.5 py-1 text-xs"
            onClick={preview}
            aria-label={t("file.previewAria", { name: file.name })}
          >
            <Eye className="size-3.5" aria-hidden="true" />
            {t("file.preview")}
          </button>
          {ai.hasKey && (
            <button
              type="button"
              className="btn btn-secondary min-h-8 justify-start px-2.5 py-1 text-xs"
              disabled={aiBusy}
              onClick={() => actions.askAi([file.id], { confirmSend: (count) => window.confirm(t("ai.confirmSend", { count })) })}
              aria-label={t("ai.askAria", { name: file.name })}
            >
              <Sparkles className="size-3.5 text-violet-600" aria-hidden="true" />
              {t("ai.ask")}
            </button>
          )}
          <button
            type="button"
            className="btn btn-danger-ghost min-h-8 justify-start px-2.5 py-1 text-xs"
            onClick={remove}
            aria-label={t("file.removeAria", { name: file.name })}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            {t("file.remove")}
          </button>
        </div>
      </div>
      {suggestion && <AiSuggestion file={file} suggestion={suggestion} />}
    </li>
  );
}
