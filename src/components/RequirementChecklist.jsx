import { CheckCheck, WandSparkles } from "lucide-react";
import { useI18n, useStore } from "../state/contexts.js";
import RequirementRow from "./RequirementRow.jsx";

/** Right column: every requirement in `order`, each with exactly one status. */
export default function RequirementChecklist() {
  const { t } = useI18n();
  const { state, derived, actions } = useStore();
  const required = state.requirements.filter((req) => req.mandatory).length;

  return (
    <section className="card checklist overflow-hidden" aria-labelledby="checklist-heading">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 id="checklist-heading" className="text-base font-bold text-slate-900">
            {t("checklist.heading")}
          </h2>
          <p className="text-xs font-medium text-slate-500">
            {t("checklist.summary", { total: state.requirements.length, required })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {derived.suggestedReqIds.size > 0 && (
            <button type="button" className="btn btn-ghost min-h-9 px-3" onClick={actions.confirmAllSuggestions}>
              <CheckCheck className="size-4" aria-hidden="true" />
              {t("auto.confirmAll")}
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary min-h-9 px-3"
            onClick={actions.autoMatch}
            disabled={!derived.canAutoMatch}
            title={t("auto.hint")}
          >
            <WandSparkles className="size-4 text-brand-700" aria-hidden="true" />
            {t("auto.button")}
          </button>
        </div>
      </div>
      <div
        className="req-head req-grid border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500"
        aria-hidden="true"
      >
        <span className="req-num text-center">{t("col.order")}</span>
        <span className="req-title">{t("col.document")}</span>
        <span className="req-type">{t("col.type")}</span>
        <span className="req-file">{t("col.file")}</span>
        <span className="req-expiry">{t("col.expiry")}</span>
        <span className="req-status">{t("col.status")}</span>
      </div>
      <ol className="divide-y divide-slate-200">
        {derived.rows.map((row) => (
          <RequirementRow key={row.req.id} row={row} />
        ))}
      </ol>
    </section>
  );
}
