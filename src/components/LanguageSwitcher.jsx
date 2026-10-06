import { useI18n, useStore } from "../state/contexts.js";

const OPTIONS = [
  { value: "en", label: "English" },
  { value: "bn", label: "বাংলা" },
];

/** "English | বাংলা" switch. Each label is written in its own language. */
export default function LanguageSwitcher() {
  const { t, lang } = useI18n();
  const { setLang } = useStore().actions;
  return (
    <div role="group" aria-label={t("lang.label")} className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5">
      {OPTIONS.map((option) => {
        const active = lang === option.value;
        return (
          <button
            key={option.value}
            type="button"
            lang={option.value}
            aria-pressed={active}
            onClick={() => setLang(option.value)}
            className={`min-h-9 rounded-md px-3 text-sm font-semibold transition-colors ${
              active ? "bg-white text-brand-800 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
