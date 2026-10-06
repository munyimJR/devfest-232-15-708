import { useEffect } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useI18n, useStore } from "../state/contexts.js";

const LOOK = {
  success: { Icon: CircleCheck, className: "border-emerald-200 bg-white", iconClass: "text-emerald-600" },
  info: { Icon: Info, className: "border-slate-200 bg-white", iconClass: "text-brand-600" },
  warning: { Icon: CircleAlert, className: "border-amber-300 bg-amber-50", iconClass: "text-amber-600" },
  error: { Icon: CircleAlert, className: "border-red-300 bg-red-50", iconClass: "text-red-600" },
};

function Toast({ message, onClose }) {
  const { t } = useI18n();
  const { Icon, className, iconClass } = LOOK[message.level] ?? LOOK.info;

  useEffect(() => {
    const timer = setTimeout(onClose, message.level === "error" ? 10000 : 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id]);

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-lg shadow-slate-900/10 ${className}`}
      role={message.level === "error" ? "alert" : "status"}
    >
      <Icon className={`mt-0.5 size-5 shrink-0 ${iconClass}`} aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm break-words text-slate-800">{t(message.key, message.params)}</p>
      <button
        type="button"
        onClick={onClose}
        className="-m-1 shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-900/5 hover:text-slate-800"
        aria-label={t("toast.close")}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Short-lived confirmations and errors, top right. */
export default function Toasts() {
  const { t } = useI18n();
  const { state, actions } = useStore();
  const toasts = state.messages.filter((message) => message.kind === "toast").slice(-4);
  return (
    <div
      className="pointer-events-none fixed top-4 right-4 z-50 flex w-[min(25rem,calc(100vw-2rem))] flex-col gap-2"
      aria-label={t("toast.region")}
    >
      {toasts.map((message) => (
        <Toast key={message.id} message={message} onClose={() => actions.dismiss(message.id)} />
      ))}
    </div>
  );
}
