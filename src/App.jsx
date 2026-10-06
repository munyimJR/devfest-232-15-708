import { useEffect, useMemo } from "react";
import { createI18n } from "./i18n.js";
import { I18nContext, StoreContext } from "./state/contexts.js";
import { useTenderStore } from "./state/useTenderStore.js";
import Header from "./components/Header.jsx";
import EmptyState from "./components/EmptyState.jsx";
import TenderHeader from "./components/TenderHeader.jsx";
import WorkflowSteps from "./components/WorkflowSteps.jsx";
import ReadinessSummary from "./components/ReadinessSummary.jsx";
import UploadZone from "./components/UploadZone.jsx";
import RequirementChecklist from "./components/RequirementChecklist.jsx";
import GeneratePanel from "./components/GeneratePanel.jsx";
import Toasts from "./components/Toasts.jsx";
import RestoredBanner from "./components/RestoredBanner.jsx";
import { LoaderCircle } from "lucide-react";

/** Stop the browser from opening a file dropped outside a drop zone (that would lose all work). */
function useDropGuard() {
  useEffect(() => {
    const guard = (event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (event.type === "dragover" && event.dataTransfer) event.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);
    return () => {
      window.removeEventListener("dragover", guard);
      window.removeEventListener("drop", guard);
    };
  }, []);
}

export default function App() {
  const store = useTenderStore();
  const i18n = useMemo(() => createI18n(store.state.lang), [store.state.lang]);
  useDropGuard();

  return (
    <I18nContext.Provider value={i18n}>
      <StoreContext.Provider value={store}>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-6 sm:px-6">
            {!store.state.hydrated ? (
              <div className="grid place-items-center py-24 text-slate-500" role="status">
                <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
                <span className="sr-only">{i18n.t("app.loading")}</span>
              </div>
            ) : store.state.tender ? (
              <div className="space-y-5 pt-6">
                <RestoredBanner />
                <TenderHeader />
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                  <WorkflowSteps />
                  <ReadinessSummary />
                </div>
                <div className="grid items-start gap-5 xl:grid-cols-[minmax(340px,380px)_minmax(0,1fr)]">
                  <UploadZone />
                  <RequirementChecklist />
                </div>
                <GeneratePanel />
              </div>
            ) : (
              <EmptyState />
            )}
          </main>
        </div>
        <Toasts />
      </StoreContext.Provider>
    </I18nContext.Provider>
  );
}
