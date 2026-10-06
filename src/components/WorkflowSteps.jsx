import { Check } from "lucide-react";
import { useI18n, useStore } from "../state/contexts.js";
import { STATUS } from "../utils/status.js";

const STYLES = {
  done: "bg-brand-700 text-white ring-brand-700",
  current: "bg-white text-brand-800 ring-2 ring-brand-600",
  problem: "bg-amber-500 text-white ring-amber-500",
  upcoming: "bg-white text-slate-500 ring-1 ring-slate-300",
};

/** Visual only: 1 Tender -> 2 Documents -> 3 Review -> 4 Generate. */
export default function WorkflowSteps() {
  const { t, num } = useI18n();
  const { rows, summary, packageFresh, readyToGenerate } = useStore().derived;

  const anyMissing = rows.some((row) => row.status === STATUS.MISSING);
  const anyDateProblem = rows.some((row) => row.status === STATUS.EXPIRED || row.status === STATUS.EXPIRY_NEEDED);
  const documentsDone = !anyMissing && summary.included.length > 0;

  const states = ["done"];
  states.push(documentsDone ? "done" : "current");
  if (anyDateProblem) states.push("problem");
  else states.push(documentsDone ? "done" : "upcoming");
  if (packageFresh) states.push("done");
  else states.push(readyToGenerate ? "current" : "upcoming");

  const steps = ["steps.tender", "steps.documents", "steps.review", "steps.generate"].map((key, index) => ({
    key,
    state: states[index],
    number: index + 1,
  }));

  return (
    <nav className="card flex items-center px-4 py-4 sm:px-5" aria-label={t("steps.aria")}>
      <ol className="flex w-full items-start sm:items-center">
        {steps.map((step, index) => (
          <li key={step.key} className={`flex items-start sm:items-center ${index < steps.length - 1 ? "flex-1" : ""}`}>
            <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-2.5">
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ring-inset ${STYLES[step.state]}`}
                aria-hidden="true"
              >
                {step.state === "done" ? <Check className="size-4" strokeWidth={3} /> : step.state === "problem" ? "!" : num(step.number)}
              </span>
              <span
                className={`text-center text-xs font-semibold sm:text-sm sm:whitespace-nowrap ${
                  step.state === "upcoming" ? "text-slate-500" : step.state === "problem" ? "text-amber-800" : "text-slate-900"
                }`}
              >
                {t(step.key)}
                <span className="sr-only"> ({t(`steps.state.${step.state}`)})</span>
              </span>
            </div>
            {index < steps.length - 1 && (
              <span
                className={`mx-2 mt-4 h-0.5 min-w-3 flex-1 rounded sm:mx-3 sm:mt-0 ${steps[index + 1].state === "upcoming" ? "bg-slate-200" : "bg-brand-600/60"}`}
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
