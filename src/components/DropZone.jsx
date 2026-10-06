import { useRef, useState } from "react";
import { collectDroppedFiles } from "../utils/dropFiles.js";

/**
 * Dashed drop area. Calls onDrop({ items: [{ path, file }], hasFolders }) with the dropped
 * files (folders are walked). Keyboard users use the button placed inside `children`.
 */
export default function DropZone({ onDrop, activeLabel, className = "", children }) {
  const [active, setActive] = useState(false);
  const depth = useRef(0);

  const carriesFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

  return (
    <div
      onDragEnter={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setActive(true);
      }}
      onDragOver={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!carriesFiles(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setActive(false);
      }}
      onDrop={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setActive(false);
        collectDroppedFiles(event.dataTransfer)
          .then((result) => {
            if (result.items.length) onDrop(result);
          })
          .catch(() => {});
      }}
      className={`relative rounded-xl border-2 border-dashed transition-colors ${
        active ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50/70 hover:border-slate-400"
      } ${className}`}
    >
      {children}
      {active && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-[10px] bg-brand-50/95 px-4 text-center text-sm font-semibold text-brand-800">
          {activeLabel}
        </div>
      )}
    </div>
  );
}
