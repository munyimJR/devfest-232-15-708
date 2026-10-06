import { History, RotateCcw, X } from "lucide-react";
import { useI18n, useStore } from "../state/contexts.js";

/** "Your previous work was restored · Start over" after reopening the app. */
export default function RestoredBanner() {
  const { t } = useI18n();
  const { state, actions } = useStore();
  if (!state.restored) return null;

  const startOver = () => {
    if (window.confirm(t("confirm.startOver"))) actions.reset();
  };

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-900"
    >
      <History className="size-5 shrink-0 text-brand-700" aria-hidden="true" />
      <p className="min-w-0 flex-1 font-medium">{t("restore.banner")}</p>
      <button type="button" className="btn btn-secondary min-h-9 px-3" onClick={startOver}>
        <RotateCcw className="size-4" aria-hidden="true" />
        {t("tender.startOver")}
      </button>
      <button
        type="button"
        className="rounded-md p-1.5 text-brand-800 hover:bg-brand-100"
        onClick={actions.dismissRestored}
        aria-label={t("toast.close")}
        title={t("toast.close")}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
