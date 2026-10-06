import { ChevronDown } from "lucide-react";
import { useI18n, useStore } from "../state/contexts.js";

/**
 * File picker for one requirement. Matching is 1-to-1:
 * - a file used by another requirement is listed with "(used for X — selecting moves it here)"
 * - a file whose identical twin is used by another requirement is disabled
 */
export default function MatchSelect({ req, fileId, describedBy }) {
  const { t, title } = useI18n();
  const { state, derived, actions } = useStore();
  const id = `match-${req.id}`;
  const noFiles = state.files.length === 0;

  const files = [...state.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  const options = files.map((file) => {
    const usedBy = derived.usage.get(file.id);
    const twins = derived.duplicates.get(file.id) ?? [];
    const twinUsedElsewhere = twins.find((twin) => {
      const twinReq = derived.usage.get(twin.id);
      return twinReq && twinReq !== req.id;
    });
    let label = `${file.name} · ${t("file.pages", { count: file.pages })}`;
    if (twinUsedElsewhere) {
      label += ` (${t("match.optDuplicateUsed", { name: twinUsedElsewhere.name })})`;
    } else if (usedBy && usedBy !== req.id) {
      label += ` (${t("match.optUsedFor", { title: title(derived.requirementsById.get(usedBy)) })})`;
    }
    return { value: file.id, label, disabled: Boolean(twinUsedElsewhere) };
  });

  return (
    <div>
      <label htmlFor={id} className="req-field-label mb-1 text-xs font-medium text-slate-600">
        {t("match.label")}
      </label>
      <div className="relative">
        <select
          id={id}
          value={fileId ?? ""}
          disabled={noFiles}
          aria-label={t("match.aria", { title: title(req) })}
          aria-describedby={describedBy}
          onChange={(event) => actions.assign(req.id, event.target.value)}
          className={`field appearance-none truncate pr-9 ${fileId ? "font-medium text-slate-900" : "text-slate-500"}`}
        >
          <option value="" className="text-slate-700">
            {noFiles ? t("match.noFiles") : t("match.none")}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled} className="text-slate-900">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-slate-500"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
