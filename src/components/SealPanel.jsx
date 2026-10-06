import { useEffect, useMemo, useRef } from "react";
import { CircleAlert, CircleCheck, RefreshCw, Stamp, Trash2 } from "lucide-react";
import { useI18n, useStore } from "../state/contexts.js";
import {
  SEAL_MAX_WIDTH,
  SEAL_MIN_WIDTH,
  SEAL_POSITIONS,
  describeSealPages,
  formatPageRanges,
  presetPages,
} from "../utils/seal.js";
import { A4 } from "../utils/packageGenerator.js";

/** Object URL for PNG bytes, released when the bytes change or the panel unmounts. */
function usePngUrl(bytes) {
  const url = useMemo(() => (bytes ? URL.createObjectURL(new Blob([bytes], { type: "image/png" })) : null), [bytes]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return url;
}

/** Small portrait page showing where the seal will sit. */
function PositionPreview({ position, width, aspect, label }) {
  const boxWidth = 64;
  const scale = boxWidth / A4.width;
  const sealWidth = Math.max(6, width * scale);
  const sealHeight = sealWidth * aspect;
  const margin = 24 * scale;
  const style = { width: sealWidth, height: sealHeight };
  if (position === "bottom-left") Object.assign(style, { left: margin, bottom: margin });
  else if (position === "bottom-center") Object.assign(style, { left: (boxWidth - sealWidth) / 2, bottom: margin });
  else if (position === "top-right") Object.assign(style, { right: margin, top: margin });
  else Object.assign(style, { right: margin, bottom: margin });
  return (
    <div
      className="relative shrink-0 rounded-sm border border-slate-300 bg-white shadow-sm"
      style={{ width: boxWidth, height: boxWidth * (A4.height / A4.width) }}
      role="img"
      aria-label={label}
    >
      <div className="absolute inset-x-2 top-2 space-y-1" aria-hidden="true">
        <div className="h-1 w-3/4 rounded bg-slate-200" />
        <div className="h-1 w-full rounded bg-slate-200" />
        <div className="h-1 w-5/6 rounded bg-slate-200" />
      </div>
      <div className="absolute rounded-full border border-brand-600 bg-brand-100/80" style={style} aria-hidden="true" />
    </div>
  );
}

/** Optional seal / signature stamped on chosen package pages. */
export default function SealPanel() {
  const { t, num, title, lang } = useI18n();
  const { state, derived, actions } = useStore();
  const inputRef = useRef(null);
  const previewUrl = usePngUrl(state.seal?.bytes);
  const { seal, sealPages, options } = state;
  const docs = derived.packageDocs;

  const showPages = (text) => (lang === "bn" ? text.replace(/[0-9]/g, (d) => num(Number(d))) : text).replace(/-/g, "–");
  const groups = derived.sealPageList.length ? describeSealPages(derived.sealPageList, docs) : [];
  const applyPreset = (kind) => actions.setSealPages(formatPageRanges(presetPages(kind, docs)));

  return (
    <section className="card overflow-hidden" aria-labelledby="seal-heading">
      <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
        <h2 id="seal-heading" className="text-base font-bold text-slate-900">
          {t("seal.heading")}
        </h2>
        <span className="text-xs font-medium text-slate-500">{t("req.optional")}</span>
      </div>

      <div className="space-y-4 p-4">
        {!seal ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{t("seal.explain")}</p>
            <button type="button" className="btn btn-secondary" onClick={() => inputRef.current?.click()}>
              <Stamp className="size-4 text-brand-700" aria-hidden="true" />
              {t("seal.choose")}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <img
                src={previewUrl ?? undefined}
                alt=""
                className="size-14 shrink-0 rounded-lg border border-slate-200 bg-slate-50 object-contain p-1"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900" title={seal.name}>
                  {seal.name}
                </p>
                <p className="text-xs text-slate-500 tabular-nums">
                  {t("seal.pixels", { width: seal.width, height: seal.height })}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button type="button" className="btn btn-secondary min-h-8 justify-start px-2.5 py-1 text-xs" onClick={() => inputRef.current?.click()}>
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  {t("seal.replace")}
                </button>
                <button type="button" className="btn btn-danger-ghost min-h-8 justify-start px-2.5 py-1 text-xs" onClick={actions.removeSeal}>
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  {t("seal.remove")}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="seal-pages" className="block text-sm font-medium text-slate-800">
                {t("seal.pages")}
              </label>
              <input
                id="seal-pages"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                className={`field mt-1 ${derived.sealIssue ? "border-red-400 bg-red-50/40" : ""}`}
                value={sealPages}
                placeholder={t("seal.pagesPlaceholder")}
                aria-invalid={derived.sealIssue ? true : undefined}
                aria-describedby="seal-pages-help"
                onChange={(event) => actions.setSealPages(event.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary min-h-8 px-2.5 py-1 text-xs" disabled={!docs.length} onClick={() => applyPreset("last")}>
                  {t("seal.lastPages")}
                </button>
                <button type="button" className="btn btn-secondary min-h-8 px-2.5 py-1 text-xs" disabled={!docs.length} onClick={() => applyPreset("all")}>
                  {t("seal.allPages")}
                </button>
              </div>
              <div id="seal-pages-help" className="mt-2 text-sm" aria-live="polite">
                {derived.sealIssue ? (
                  <p className="flex items-start gap-1.5 font-medium text-red-800">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {t(`seal.err.${derived.sealIssue.code}`, derived.sealIssue.params)}
                  </p>
                ) : groups.length ? (
                  <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900 ring-1 ring-emerald-200 ring-inset">
                    <p className="flex items-center gap-1.5 font-medium">
                      <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
                      {t("seal.means", { count: derived.sealPageList.length })}
                    </p>
                    <ul className="mt-1 space-y-0.5 pl-5.5 text-xs">
                      {groups.map((group) => (
                        <li key={group.docIndex}>
                          {t("seal.docPages", {
                            count: group.pages.length,
                            title: title(docs[group.docIndex].req),
                            pages: showPages(formatPageRanges(group.pages)),
                          })}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-slate-500">{t("seal.noPages")}</p>
                )}
              </div>
            </div>

            <fieldset>
              <legend className="text-sm font-medium text-slate-800">{t("seal.position")}</legend>
              <div className="mt-1.5 flex items-start gap-3">
                <div className="grid flex-1 grid-cols-2 gap-1.5">
                  {SEAL_POSITIONS.map((position) => (
                    <label key={position} className="relative">
                      <input
                        type="radio"
                        name="seal-position"
                        value={position}
                        className="peer sr-only"
                        checked={options.sealPosition === position}
                        onChange={() => actions.setOption("sealPosition", position)}
                      />
                      <span className="flex min-h-9 items-center justify-center rounded-lg border border-slate-300 px-2 py-1 text-center text-xs font-semibold text-slate-700 peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-800 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 hover:bg-slate-50">
                        {t(`seal.pos.${position}`)}
                      </span>
                    </label>
                  ))}
                </div>
                <PositionPreview
                  position={options.sealPosition}
                  width={options.sealWidth}
                  aspect={seal.height / seal.width}
                  label={t("seal.preview")}
                />
              </div>
            </fieldset>

            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="seal-size" className="text-sm font-medium text-slate-800">
                  {t("seal.size")}
                </label>
                <span className="text-xs font-semibold text-slate-600 tabular-nums">{t("seal.sizeValue", { value: options.sealWidth })}</span>
              </div>
              <input
                id="seal-size"
                type="range"
                min={SEAL_MIN_WIDTH}
                max={SEAL_MAX_WIDTH}
                step={5}
                value={options.sealWidth}
                onChange={(event) => actions.setOption("sealWidth", Number(event.target.value))}
                className="mt-1 w-full accent-brand-700"
              />
            </div>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/png,.png"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) actions.setSealFile(file);
          }}
        />
      </div>
    </section>
  );
}
