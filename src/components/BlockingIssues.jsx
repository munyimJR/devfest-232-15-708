import { CircleAlert } from "lucide-react";
import { useI18n } from "../state/contexts.js";
import { STATUS } from "../utils/status.js";

/** Move keyboard focus to the control that fixes the issue. */
function focusRequirement(row) {
  const rowElement = document.getElementById(`req-${row.req.id}`);
  rowElement?.scrollIntoView({ behavior: "smooth", block: "center" });
  const target =
    (row.status !== STATUS.MISSING && document.getElementById(`expiry-${row.req.id}`)) ||
    document.getElementById(`match-${row.req.id}`);
  if (target && !target.disabled) target.focus({ preventScroll: true });
}

/** "N issues must be fixed before generating" + one clickable item per blocking requirement. */
export default function BlockingIssues({ rows, headingId }) {
  const { t, title } = useI18n();
  return (
    <div>
      <p id={headingId} className="flex items-center gap-2 font-semibold text-red-800">
        <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
        {t("gen.issues", { count: rows.length })}
      </p>
      <ul className="mt-2 flex max-h-[3.6rem] flex-wrap gap-1.5 overflow-y-auto pr-1">
        {rows.map((row) => (
          <li key={row.req.id}>
            <button
              type="button"
              onClick={() => focusRequirement(row)}
              className={`rounded-md px-2 py-0.5 text-left text-xs font-medium ring-1 ring-inset ${
                row.status === STATUS.EXPIRY_NEEDED
                  ? "bg-amber-50 text-amber-950 ring-amber-300 hover:bg-amber-100"
                  : "bg-red-50 text-red-900 ring-red-200 hover:bg-red-100"
              }`}
            >
              • {t("gen.issueItem", { title: title(row.req), status: t(`status.${row.status}`) })}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
