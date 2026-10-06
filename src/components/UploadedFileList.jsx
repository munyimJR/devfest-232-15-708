import { LoaderCircle } from "lucide-react";
import { useI18n, useStore } from "../state/contexts.js";
import UploadedFileRow from "./UploadedFileRow.jsx";

export default function UploadedFileList() {
  const { t } = useI18n();
  const { state } = useStore();

  if (!state.files.length && !state.processing.length) {
    return <p className="border-t border-slate-200 px-4 py-5 text-sm text-slate-500">{t("files.empty")}</p>;
  }

  return (
    <ul className="divide-y divide-slate-200 border-t border-slate-200" aria-label={t("upload.heading")}>
      {state.files.map((file) => (
        <UploadedFileRow key={file.id} file={file} />
      ))}
      {state.processing.map((item) => (
        <li key={item.id} className="flex items-center gap-3 px-4 py-3" aria-live="polite">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-brand-700">
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-700" title={item.name}>
              {item.name}
            </p>
            <p className="text-xs text-slate-500">{t("upload.reading")}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
