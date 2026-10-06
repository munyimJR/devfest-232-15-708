// Render Bangla text to PNG images in the browser (needs the DOM: canvas + document.fonts).
// pdf-lib cannot shape Bangla script, so the UI renders each string with the Bangla web font
// and hands the PNG bytes to the pure package generator.

const FONT_FAMILY = '"Hind Siliguri", "Noto Sans Bengali", "Nirmala UI", "Vrinda", sans-serif';
const RENDER_SIZE_PX = 64; // rendered large and scaled down in the PDF, so it prints sharp

/** True when the text contains Bengali-script characters. */
export function hasBangla(text) {
  return /[\u0980-\u09FF]/.test(String(text ?? ""));
}

function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("PNG export failed"));
        return;
      }
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, "image/png");
  });
}

async function renderOne(text, color) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const font = `500 ${RENDER_SIZE_PX}px ${FONT_FAMILY}`;
  context.font = font;
  const metrics = context.measureText(text);
  const ascent = Math.ceil(metrics.actualBoundingBoxAscent || RENDER_SIZE_PX * 0.95);
  const descent = Math.ceil(metrics.actualBoundingBoxDescent || RENDER_SIZE_PX * 0.4);
  const pad = Math.ceil(RENDER_SIZE_PX * 0.08);
  canvas.width = Math.max(1, Math.ceil(metrics.width + pad * 2));
  canvas.height = Math.max(1, ascent + descent + pad * 2);
  context.font = font; // resizing the canvas resets the context
  context.fillStyle = color;
  context.textBaseline = "alphabetic";
  context.fillText(text, pad, pad + ascent);
  return {
    png: await canvasToPng(canvas),
    width: canvas.width,
    height: canvas.height,
    baseline: pad + ascent, // pixels from the top of the image to the text baseline
    fontSizePx: RENDER_SIZE_PX,
  };
}

/**
 * items: [{ key, text }] -> { [key]: { png, width, height, baseline, fontSizePx } }.
 * Items that fail to render are left out; the PDF then simply shows the English name.
 */
export async function renderBanglaLabels(items, { color = "#4b5563" } = {}) {
  const labels = {};
  if (typeof document === "undefined" || !items.length) return labels;
  try {
    await document.fonts?.load(`500 ${RENDER_SIZE_PX}px "Hind Siliguri"`, items.map((item) => item.text).join(" "));
  } catch {
    // web font unavailable (offline): a system Bangla font is used instead
  }
  for (const { key, text } of items) {
    try {
      labels[key] = await renderOne(text, color);
    } catch {
      // skip this label
    }
  }
  return labels;
}
