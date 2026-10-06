import { useRef } from "react";
import { CalendarClock, FileJson, RotateCcw } from "lucide-react";
import { useI18n, useStore } from "../state/contexts.js";
import { daysBetween, todayLocalYmd } from "../utils/dates.js";

function DeadlineChip({ deadline }) {
  const { t } = useI18n();
  const days = daysBetween(todayLocalYmd(), deadline);
  if (days === null) return null;
  let text;
  let tone;
  if (days < 0) {
    text = t("tender.passed");
    tone = "bg-red-50 text-red-800 ring-red-600/20";
  } else if (days === 0) {
    text = t("tender.dueToday");
    tone = "bg-amber-50 text-amber-900 ring-amber-600/25";
  } else {
    text = t("tender.daysLeft", { count: days });
    tone = days <= 3 ? "bg-amber-50 text-amber-900 ring-amber-600/25" : "bg-slate-100 text-slate-700 ring-slate-500/15";
  }
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${tone}`}>{text}</span>;
}

/** Tender details card with "load different requirements.json" and "start over". */
export default function TenderHeader() {
  const { t, date } = useI18n();
  const { state, actions } = useStore();
  const { tender } = state;
  const inputRef = useRef(null);

  const replaceRequirements = (file) => {
    const hasWork = Object.keys(state.matches).length > 0 || Object.keys(state.expiry).length > 0;
    actions.loadRequirementsFile(file, {
      confirmReplace: hasWork ? () => window.confirm(t("confirm.replaceJson")) : undefined,
    });
  };

  const startOver = () => {
    if (window.confirm(t("confirm.startOver"))) actions.reset();
  };

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="tender-id">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="kicker">{t("tender.kicker")}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">{t("tender.id")}</p>
          <h1 id="tender-id" className="text-2xl font-bold tracking-tight break-words text-brand-800 sm:text-3xl">
            {tender.tender_id}
          </h1>
          <p className="mt-1 text-base font-semibold break-words text-slate-800 sm:text-lg">
            <span className="sr-only">{t("tender.title")}: </span>
            {tender.title}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => inputRef.current?.click()}>
            <FileJson className="size-4" aria-hidden="true" />
            {t("tender.loadOther")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={startOver}>
            <RotateCcw className="size-4" aria-hidden="true" />
            {t("tender.startOver")}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) replaceRequirements(file);
            }}
          />
        </div>
      </div>

      <dl className="mt-5 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="kicker">{t("tender.entity")}</dt>
          <dd className="mt-1 font-medium break-words text-slate-900">{tender.procuring_entity}</dd>
        </div>
        <div className="min-w-0">
          <dt className="kicker">{t("tender.bidder")}</dt>
          <dd className="mt-1 font-medium break-words text-slate-900">{tender.bidder}</dd>
        </div>
        <div className="min-w-0">
          <dt className="kicker">{t("tender.deadline")}</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2 font-medium text-slate-900">
            <CalendarClock className="size-4 text-slate-500" aria-hidden="true" />
            <time dateTime={tender.submission_deadline}>{date(tender.submission_deadline)}</time>
            <DeadlineChip deadline={tender.submission_deadline} />
          </dd>
        </div>
      </dl>
    </section>
  );
}
