import { useI18n, useStore } from "../state/contexts.js";

/** Native date input; only rendered when the requirement has an expiry and a file is matched. */
export default function ExpiryInput({ req, value, invalid, describedBy }) {
  const { t, title, date, lang } = useI18n();
  const { actions } = useStore();
  const id = `expiry-${req.id}`;
  const empty = !value;

  return (
    <div>
      <label htmlFor={id} className="req-field-label mb-1 text-xs font-medium text-slate-600">
        {t("expiry.label")}
      </label>
      <input
        id={id}
        type="date"
        value={value || ""}
        max="9999-12-31"
        aria-label={t("expiry.aria", { title: title(req) })}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => actions.setExpiry(req.id, event.target.value)}
        className={`field px-2.5 tabular-nums ${
          empty ? "border-amber-400 bg-amber-50/50" : invalid ? "border-red-400 bg-red-50/40 text-red-900" : ""
        }`}
      />
      {/* The native control shows the browser's own digits; repeat the date in Bangla for clarity. */}
      {lang === "bn" && value && <p className="mt-1 text-xs text-slate-500">{date(value)}</p>}
    </div>
  );
}
