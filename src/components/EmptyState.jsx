import { useRef, useState } from "react";
import { CircleAlert, FileArchive, FileJson, FolderOpen, LoaderCircle, Lock } from "lucide-react";
import { useI18n, useStore } from "../state/contexts.js";
import { splitPackFiles } from "../utils/dropFiles.js";
import DropZone from "./DropZone.jsx";

/** Before requirements.json is loaded: one clear "Step 1" card. */
export default function EmptyState() {
  const { t } = useI18n();
  const { state, actions } = useStore();
  const inputRef = useRef(null);
  const zipRef = useRef(null);
  const [opening, setOpening] = useState(false);

  const openPack = async (file) => {
    setOpening(true);
    try {
      await actions.loadPack(file);
    } finally {
      setOpening(false);
    }
  };

  // Accepts requirements.json alone, a pack .zip, or a whole dropped pack folder (json + documents).
  const handleItems = async (items) => {
    if (!items.length) return;
    const zip = items.find((item) => /\.zip$/i.test(item.path));
    if (zip) return openPack(zip.file);
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

        <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-slate-200 px-4 py-3.5 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="text-sm text-slate-600">{t("zip.hint")}</p>
          <button type="button" className="btn btn-secondary shrink-0" disabled={opening} onClick={() => zipRef.current?.click()}>
            {opening ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileArchive className="size-4" aria-hidden="true" />
            )}
            {opening ? t("zip.opening") : t("zip.button")}
          </button>
          <input
            ref={zipRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) openPack(file);
            }}
          />
        </div>

        {state.requirementsError && (
          <div role="alert" className="mt-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden="true" />
            <div>
              <p className="font-semibold">{t(state.requirementsError.title ?? "empty.errorTitle")}</p>
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
