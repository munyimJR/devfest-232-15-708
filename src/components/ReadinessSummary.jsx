import { useI18n, useStore } from "../state/contexts.js";
import { MAX_FILES, MAX_TOTAL_BYTES } from "../utils/pdfFile.js";

function Stat({ label, value, max, tone = "default" }) {
  const toneClass = tone === "bad" ? "text-red-700" : tone === "good" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs font-medium text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-lg leading-tight font-bold whitespace-nowrap tabular-nums ${toneClass}`}>
        {value}
        {max && <span className="text-xs font-medium text-slate-500"> / {max}</span>}
      </dd>
    </div>
  );
}

/** Progress bar "X of Y documents ready" plus issue / file / size / page counts. */
export default function ReadinessSummary() {
  const { t, num, bytes } = useI18n();
  const { state, derived } = useStore();
  const { summary, totalBytes, packagePages } = derived;

  const total = summary.needed;
  const percent = total ? Math.round((summary.ready / total) * 100) : 0;
  const complete = summary.canGenerate;
  const issues = summary.blocking.length;

  return (
    <section className="card px-5 py-4" aria-labelledby="readiness-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="readiness-heading" className="kicker">
          {t("ready.heading")}
        </h2>
        <p className={`text-sm font-semibold ${complete ? "text-emerald-700" : "text-slate-700"}`} aria-live="polite">
          {total ? t("ready.count", { ready: summary.ready, total }) : t("ready.nothing")}
        </p>
      </div>
      <div
        className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={t("ready.heading")}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${complete ? "bg-emerald-600" : "bg-brand-600"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("stat.issues")} value={num(issues)} tone={issues ? "bad" : summary.included.length ? "good" : "default"} />
        <Stat label={t("stat.files")} value={num(state.files.length)} max={num(MAX_FILES)} />
        <Stat label={t("stat.size")} value={bytes(totalBytes)} max={bytes(MAX_TOTAL_BYTES)} />
        <Stat label={t("stat.pages")} value={num(packagePages)} />
      </dl>
    </section>
  );
}
