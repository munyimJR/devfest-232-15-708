import { CircleAlert, LoaderCircle, RotateCw, Sparkles } from "lucide-react";
import { useI18n, useStore } from "../state/contexts.js";

/** AI result for one file. Nothing changes until the user clicks Accept. */
export default function AiSuggestion({ file, suggestion }) {
  const { t, title, date } = useI18n();
  const { derived, actions } = useStore();
  const confirmSend = (count) => window.confirm(t("ai.confirmSend", { count }));

  if (suggestion.status === "queued" || suggestion.status === "loading") {
    return (
      <p className="mt-2 flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 text-xs font-medium text-violet-900" aria-live="polite">
        {suggestion.status === "loading" ? (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="size-3.5" aria-hidden="true" />
        )}
        {t(suggestion.status === "loading" ? "ai.reading" : "ai.queued")}
      </p>
    );
  }

  if (suggestion.status === "error") {
    return (
      <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-900 ring-1 ring-red-200 ring-inset" role="alert">
        <p className="flex items-start gap-1.5 font-medium">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {t(`ai.err.${suggestion.code}`)}
        </p>
        <div className="mt-1.5 flex gap-2">
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-red-800 hover:underline" onClick={() => actions.askAi([file.id], { confirmSend })}>
            <RotateCw className="size-3" aria-hidden="true" />
            {t("ai.retry")}
          </button>
          <button type="button" className="font-semibold text-slate-700 hover:underline" onClick={() => actions.dismissAi(file.id)}>
            {t("ai.dismiss")}
          </button>
        </div>
      </div>
    );
  }

  const req = suggestion.requirementId ? derived.requirementsById.get(suggestion.requirementId) : null;
  return (
    <div className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-950 ring-1 ring-violet-200 ring-inset" aria-live="polite">
      <p className="flex items-start gap-1.5">
        <Sparkles className="mt-px size-3.5 shrink-0 text-violet-600" aria-hidden="true" />
        <span>
          {req ? (
            <>
              <span className="font-semibold">{t("ai.suggests", { title: title(req) })}</span>
              {" · "}
              {req.has_expiry && suggestion.expiryDate ? t("ai.expires", { date: date(suggestion.expiryDate) }) : t("ai.noExpiry")}
            </>
          ) : (
            <span className="font-semibold">{t("ai.none")}</span>
          )}
          {suggestion.reason && <span className="block text-violet-800 italic">&ldquo;{suggestion.reason}&rdquo;</span>}
        </span>
      </p>
      <div className="mt-1.5 flex gap-2 pl-5">
        {req && (
          <button
            type="button"
            className="rounded-md bg-brand-700 px-2 py-1 font-semibold text-white hover:bg-brand-800"
            onClick={() => actions.acceptAi(file.id)}
          >
            {t("ai.accept")}
          </button>
        )}
        <button
          type="button"
          className="rounded-md bg-white px-2 py-1 font-semibold text-slate-700 ring-1 ring-slate-300 ring-inset hover:bg-slate-50"
          onClick={() => actions.dismissAi(file.id)}
        >
          {t("ai.dismiss")}
        </button>
      </div>
    </div>
  );
}
