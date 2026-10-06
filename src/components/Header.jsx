import { Lock, PackageCheck } from "lucide-react";
import { useI18n } from "../state/contexts.js";
import LanguageSwitcher from "./LanguageSwitcher.jsx";

export default function Header() {
  const { t } = useI18n();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-700 text-white shadow-sm">
            <PackageCheck className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-lg leading-tight font-bold tracking-tight text-slate-900">{t("app.name")}</p>
            <p className="truncate text-xs text-slate-500">{t("app.subtitle")}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 sm:gap-6">
          <p className="hidden items-center gap-1.5 text-xs font-medium text-slate-600 md:flex" title={t("header.localTitle")}>
            <Lock className="size-3.5 text-brand-700" aria-hidden="true" />
            {t("header.local")}
          </p>
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
