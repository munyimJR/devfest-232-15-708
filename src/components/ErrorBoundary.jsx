import { Component } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { loadSavedLang, translate } from "../i18n.js";

/** Last line of defence: show a friendly message instead of a blank page or a raw error. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("TenderPack error:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const lang = document.documentElement.lang === "bn" ? "bn" : loadSavedLang();
    const t = (key) => translate(lang, key);
    return (
      <main className="grid min-h-screen place-items-center bg-canvas p-6">
        <div className="card max-w-md p-8 text-center" role="alert">
          <AlertTriangle className="mx-auto size-10 text-amber-600" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">{t("crash.title")}</h1>
          <p className="mt-2 text-slate-600">{t("crash.body")}</p>
          <button type="button" className="btn btn-primary mt-6" onClick={() => window.location.reload()}>
            <RotateCw className="size-4" aria-hidden="true" />
            {t("crash.reload")}
          </button>
        </div>
      </main>
    );
  }
}
