import { CalendarDays, Check, CircleAlert, CircleX, Sparkles } from "lucide-react";
import { useI18n, useStore } from "../state/contexts.js";
import { STATUS } from "../utils/status.js";
import ExpiryInput from "./ExpiryInput.jsx";
import MatchSelect from "./MatchSelect.jsx";
import StatusBadge from "./StatusBadge.jsx";

const ACCENT = {
  [STATUS.OK]: "before:bg-emerald-500",
  [STATUS.MISSING]: "before:bg-red-500",
  [STATUS.EXPIRED]: "before:bg-red-500",
  [STATUS.EXPIRY_NEEDED]: "before:bg-amber-500",
  [STATUS.NOT_PROVIDED]: "before:bg-slate-300",
};

/** One requirement: order · title · Required/Optional · file select · expiry · status. */
export default function RequirementRow({ row }) {
  const { t, title, date, num } = useI18n();
  const { state, derived, actions } = useStore();
  const { req, file, expiryDate, status } = row;
  const suggested = derived.suggestedReqIds.has(req.id);
  const deadline = state.tender.submission_deadline;

  let hint = null;
  if (status === STATUS.EXPIRED) {
    hint = {
      Icon: CircleX,
      className: "text-red-800",
      text: t("hint.expired", { date: date(expiryDate), deadline: date(deadline) }),
    };
  } else if (status === STATUS.EXPIRY_NEEDED) {
    hint = { Icon: CircleAlert, className: "text-amber-900", text: t("hint.expiryNeeded") };
  }
  const hintId = hint ? `hint-${req.id}` : undefined;

  return (
    <li
      id={`req-${req.id}`}
      className={`relative scroll-mt-6 px-4 py-3 before:absolute before:inset-y-0 before:left-0 before:w-1 ${ACCENT[status]} ${
        suggested ? "bg-violet-50/50" : ""
      }`}
    >
      <div className="req-grid">
        <span
          className="req-num grid size-8 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-700 tabular-nums"
          aria-hidden="true"
        >
          {num(req.order)}
        </span>
        <div className="req-title min-w-0">
          <p className="font-semibold break-words text-slate-900">
            <span className="sr-only">{num(req.order)}. </span>
            {title(req)}
          </p>
          {req.has_expiry && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {t("req.hasExpiry")}
            </p>
          )}
        </div>
        <div className="req-type">
          <span
            className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
              req.mandatory ? "bg-brand-50 text-brand-800 ring-brand-600/20" : "bg-white text-slate-600 ring-slate-300"
            }`}
          >
            {req.mandatory ? t("req.required") : t("req.optional")}
          </span>
        </div>
        <div className="req-file min-w-0">
          <MatchSelect req={req} fileId={file?.id} describedBy={hintId} />
          {suggested && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-1.5 py-0.5 text-xs font-semibold text-violet-900 ring-1 ring-violet-300/70 ring-inset">
                <Sparkles className="size-3" aria-hidden="true" />
                {t("auto.tag")}
              </span>
              <button
                type="button"
                onClick={() => actions.confirmSuggestion(req.id)}
                aria-label={t("auto.confirmAria", { title: title(req) })}
                className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-xs font-semibold text-brand-800 ring-1 ring-brand-300 ring-inset hover:bg-brand-50"
              >
                <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                {t("auto.confirm")}
              </button>
            </div>
          )}
        </div>
        <div className="req-expiry min-w-0">
          {req.has_expiry && file ? (
            <ExpiryInput req={req} value={expiryDate} invalid={status === STATUS.EXPIRED} describedBy={hintId} />
          ) : (
            <span className="req-expiry-empty text-sm text-slate-400">
              <span aria-hidden="true">—</span>
              <span className="sr-only">{t("expiry.notNeeded")}</span>
            </span>
          )}
        </div>
        <div className="req-status">
          <StatusBadge status={status} />
        </div>
      </div>
      {hint && (
        <p id={hintId} className={`req-hint mt-2 flex items-start gap-1.5 text-sm font-medium ${hint.className}`}>
          <hint.Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{hint.text}</span>
        </p>
      )}
    </li>
  );
}
