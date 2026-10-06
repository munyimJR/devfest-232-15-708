import { Circle, CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { useI18n } from "../state/contexts.js";
import { STATUS } from "../utils/status.js";

// Icon + text, never colour alone.
const LOOK = {
  [STATUS.OK]: { Icon: CircleCheck, className: "bg-emerald-50 text-emerald-800 ring-emerald-600/25" },
  [STATUS.MISSING]: { Icon: CircleX, className: "bg-red-50 text-red-800 ring-red-600/25" },
  [STATUS.EXPIRED]: { Icon: CircleX, className: "bg-red-50 text-red-800 ring-red-600/25" },
  [STATUS.EXPIRY_NEEDED]: { Icon: CircleAlert, className: "bg-amber-50 text-amber-900 ring-amber-600/30" },
  [STATUS.NOT_PROVIDED]: { Icon: Circle, className: "bg-slate-100 text-slate-700 ring-slate-500/20" },
};

export default function StatusBadge({ status }) {
  const { t } = useI18n();
  const { Icon, className } = LOOK[status] ?? LOOK[STATUS.MISSING];
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${className}`}
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      <span className="min-w-0">{t(`status.${status}`)}</span>
    </span>
  );
}
