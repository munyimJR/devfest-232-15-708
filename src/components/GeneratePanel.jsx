import { useState } from "react";
import { CircleCheck, Download, ExternalLink, FileDown, Info, LoaderCircle } from "lucide-react";
import { useI18n, useStore } from "../state/contexts.js";
import { buildPackage } from "../utils/packageGenerator.js";
import { downloadBytes, openPdfInNewTab, packageFileName, revokePreview } from "../utils/download.js";
import { todayLocalYmd } from "../utils/dates.js";
import { hasBangla, renderBanglaLabels } from "../utils/banglaText.js";
import BlockingIssues from "./BlockingIssues.jsx";

const nextPaint = () => new Promise((resolve) => setTimeout(resolve, 40));

/** Bottom panel: blocking issues, or "Package ready" + Generate Package. */
export default function GeneratePanel() {
  const { t } = useI18n();
  const { state, derived, actions } = useStore();
  const { summary, packagePages, packageFresh } = derived;
  const [busy, setBusy] = useState(false);

  const blocking = summary.blocking;
  const ready = summary.canGenerate;
  const lastPackage = state.lastPackage;

  const generate = async () => {
    if (!summary.canGenerate || busy) return;
    setBusy(true);
    try {
      await nextPaint(); // let the spinner show before the CPU-heavy work starts
      // Bangla names for the index page, drawn as images (pdf-lib cannot shape Bangla text).
      let banglaLabels = null;
      if (state.options.includeIndex) {
        try {
          banglaLabels = await renderBanglaLabels(
            summary.included
              .filter(({ req }) => req.title_bn !== req.title_en && hasBangla(req.title_bn))
              .map(({ req }) => ({ key: req.id, text: req.title_bn })),
          );
        } catch {
          banglaLabels = null; // the index still lists the English names
        }
      }
      const bytes = await buildPackage({
        tender: state.tender,
        includedDocs: summary.included.map(({ req, file }) => ({ req, file })),
        createdDate: todayLocalYmd(),
        includeIndex: state.options.includeIndex,
        banglaLabels,
      });
      const fileName = packageFileName(state.tender.tender_id);
      downloadBytes(bytes, fileName);
      revokePreview("package");
      actions.packageGenerated({
        fileName,
        bytes,
        pages: packagePages,
        documents: summary.included.length,
        signature: derived.packageSignature,
      });
      actions.notify("success", "gen.done", { name: fileName });
    } catch (error) {
      console.error("Package generation failed:", error);
      if (error?.code === "doc_unreadable") actions.notify("error", "gen.errorDoc", error.params);
      else actions.notify("error", "gen.error");
    } finally {
      setBusy(false);
    }
  };

  const openPackage = () => {
    if (lastPackage && !openPdfInNewTab("package", lastPackage.bytes)) actions.notify("error", "file.previewFailed");
  };

  return (
    <section className="z-20 lg:sticky lg:bottom-0 lg:-mx-6 lg:bg-gradient-to-t lg:from-canvas lg:from-60% lg:px-6 lg:pt-3 lg:pb-3" aria-labelledby="generate-heading">
      <div
        className={`card flex flex-col gap-3 p-4 shadow-lg shadow-slate-900/5 lg:flex-row lg:items-center lg:gap-5 ${
          ready ? "border-emerald-300 bg-emerald-50/40" : ""
        }`}
      >
        <div className="min-w-0 flex-1" aria-live="polite">
          {blocking.length > 0 ? (
            <BlockingIssues rows={blocking} headingId="generate-heading" />
          ) : !ready ? (
            <p id="generate-heading" className="flex items-center gap-2 font-semibold text-slate-700">
              <Info className="size-5 shrink-0 text-slate-500" aria-hidden="true" />
              {t("gen.noDocs")}
            </p>
          ) : (
            <div>
              <p id="generate-heading" className="flex items-center gap-2 text-lg font-bold text-emerald-800">
                <CircleCheck className="size-6 shrink-0" aria-hidden="true" />
                {t("gen.ready", { docs: summary.included.length, pages: packagePages })}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {t(state.options.includeIndex ? "gen.readyNoteIndex" : "gen.readyNote")}
              </p>
              {lastPackage && !packageFresh && <p className="mt-1 text-sm font-medium text-amber-800">{t("gen.stale")}</p>}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <label className="mr-1 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            <input
              type="checkbox"
              className="size-4 rounded accent-brand-700"
              checked={state.options.includeIndex}
              onChange={(event) => actions.setOption("includeIndex", event.target.checked)}
            />
            {t("gen.includeIndex")}
          </label>
          {packageFresh && (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => downloadBytes(lastPackage.bytes, lastPackage.fileName)}>
                <Download className="size-4" aria-hidden="true" />
                {t("gen.downloadAgain")}
              </button>
              <button type="button" className="btn btn-secondary" onClick={openPackage}>
                <ExternalLink className="size-4" aria-hidden="true" />
                {t("gen.open")}
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-primary h-12 px-6 text-base"
            disabled={!ready || busy}
            aria-busy={busy || undefined}
            onClick={generate}
          >
            {busy ? (
              <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <FileDown className="size-5" aria-hidden="true" />
            )}
            {busy ? t("gen.generating") : t("gen.button")}
          </button>
        </div>
      </div>
    </section>
  );
}
