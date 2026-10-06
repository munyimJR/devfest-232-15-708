import { useRef } from "react";
import { CircleAlert, FileJson, FolderOpen, Lock } from "lucide-react";
import { useI18n, useStore } from "../state/contexts.js";
import { splitPackFiles } from "../utils/dropFiles.js";
import DropZone from "./DropZone.jsx";

/** Before requirements.json is loaded: one clear "Step 1" card. */
export default function EmptyState() {
  const { t } = useI18n();
  const { state, actions } = useStore();
  const inputRef = useRef(null);

  // Accepts requirements.json alone, or a whole dropped pack folder (json + documents).
  const handleItems = async (items) => {
    if (!items.length) return;
    const { requirementsFile, documents } = splitPackFiles(items);
    const jsonFile = requirementsFile ?? items.find((item) => /\.json$/i.test(item.path))?.file ?? items[0].file;
    const loaded = await actions.loadRequirementsFile(jsonFile);
    if (!loaded) return;
    const rest = requirementsFile ? documents : items.map((item) => item.file).filter((file) => file !== jsonFile);
    if (rest.length) actions.addFiles(rest);
  };

  return (
    <section className="mx-auto mt-10 max-w-2xl sm:mt-16" aria-labelledby="empty-heading">
      <div className="card p-6 sm:p-8">
        <h1 id="empty-heading" className="text-2xl font-bold tracking-tight text-slate-900">
          {t("empty.heading")}
        </h1>
        <p className="mt-2 leading-relaxed text-slate-600">{t("empty.explain")}</p>

        <DropZone onDrop={({ items }) => handleItems(items)} activeLabel={t("upload.dropActive")} className="mt-6">
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-white text-brand-700 shadow-sm ring-1 ring-slate-200">
              <FileJson className="size-7" aria-hidden="true" />
            </span>
            <p className="mt-4 font-semibold text-slate-800">{t("empty.drop")}</p>
            <p className="my-2 text-sm text-slate-500">{t("empty.or")}</p>
            <button type="button" className="btn btn-primary h-11 px-5 text-base" onClick={() => inputRef.current?.click()}>
              <FolderOpen className="size-5" aria-hidden="true" />
              {t("empty.choose")}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                handleItems(files.map((file) => ({ path: file.name, file })));
              }}
            />
          </div>
        </DropZone>

        {state.requirementsError && (
          <div role="alert" className="mt-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden="true" />
            <div>
              <p className="font-semibold">{t("empty.errorTitle")}</p>
              <p className="mt-1">{t(state.requirementsError.key, state.requirementsError.params)}</p>
            </div>
          </div>
        )}
      </div>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-sm text-slate-500">
        <Lock className="size-4 shrink-0" aria-hidden="true" />
        {t("empty.privacy")}
      </p>
    </section>
  );
}
