import { useEffect, useRef, useState } from "react";
import { KeyRound, Lock, Sparkles } from "lucide-react";
import { useI18n, useStore } from "../state/contexts.js";

/** Optional AI help: the user's own Anthropic API key. Kept in memory (or this tab's sessionStorage). */
export default function AiSettingsDialog({ open, onClose }) {
  const { t } = useI18n();
  const { ai, actions } = useStore();
  const dialogRef = useRef(null);
  const [key, setKey] = useState(ai.apiKey);
  const [remember, setRemember] = useState(ai.keyRemembered);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setKey(ai.apiKey);
      setRemember(ai.keyRemembered);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = (event) => {
    event.preventDefault();
    const value = key.trim();
    actions.setApiKey(value, remember);
    actions.notify(value ? "success" : "info", value ? "ai.keySaved" : "ai.keyRemoved");
    onClose();
  };

  const removeKey = () => {
    actions.setApiKey("", false);
    setKey("");
    actions.notify("info", "ai.keyRemoved");
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="ai-settings-title"
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40"
    >
      <form onSubmit={save}>
        <div className="space-y-4 p-6">
          <h2 id="ai-settings-title" className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="size-5 text-violet-600" aria-hidden="true" />
            {t("ai.settingsTitle")}
          </h2>
          <p className="text-sm leading-relaxed text-slate-600">{t("ai.settingsBody")}</p>
          <div>
            <label htmlFor="ai-key" className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
              <KeyRound className="size-4 text-slate-500" aria-hidden="true" />
              {t("ai.keyLabel")}
            </label>
            <input
              id="ai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="field mt-1 font-mono"
              placeholder="sk-ant-..."
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-brand-700"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            <span>{t("ai.remember")}</span>
          </label>
          <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <Lock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {t("ai.privacy")}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-6 py-4">
          {ai.hasKey && (
            <button type="button" className="btn btn-danger-ghost mr-auto" onClick={removeKey}>
              {t("ai.removeKey")}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t("ai.close")}
          </button>
          <button type="submit" className="btn btn-primary">
            {t("ai.save")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
