/**
 * Signatures as data, not files.
 *
 * The pad's strokes are encoded in plain JS into a small SVG data URI that is
 * stored directly in the record (site_logs.signature /
 * chiller_readings.signature_text). Completing a log therefore needs no native
 * snapshot, no temp file, no copy and no upload — the steps that could stall
 * "Complete & sign" — and the server receives a viewable signature instead of a
 * phone-local file:// path.
 *
 * A stroke is a flat [x0, y0, x1, y1, …] list of whole pixels.
 */
export type Stroke = number[];

export const SIGNATURE_DATA_URI_PREFIX = "data:image/svg+xml;base64,";

/** Points closer than this to the previous one add size but no detail. */
const MIN_POINT_DISTANCE_PX = 2;

/** Hard ceiling for the stored value; real signatures are ~1–4 KB. */
const MAX_DATA_URI_LENGTH = 24_000;

/** Appends (x, y) unless it is within MIN_POINT_DISTANCE_PX of the last point. */
export function addPoint(stroke: Stroke, x: number, y: number): Stroke {
  const px = Math.round(x);
  const py = Math.round(y);
  const n = stroke.length;
  if (n >= 2) {
    const dx = px - stroke[n - 2]!;
    const dy = py - stroke[n - 1]!;
    if (dx * dx + dy * dy < MIN_POINT_DISTANCE_PX * MIN_POINT_DISTANCE_PX) return stroke;
  }
  return [...stroke, px, py];
}

/** SVG path for one stroke, in relative coordinates to keep it short. */
export function strokeToPath(stroke: Stroke): string {
  if (stroke.length < 2) return "";
  let d = `M${stroke[0]} ${stroke[1]}`;
  if (stroke.length === 2) return `${d}l0 0`; // a tap still draws a dot
  d += "l";
  for (let i = 2; i < stroke.length; i += 2) {
    const dx = stroke[i]! - stroke[i - 2]!;
    const dy = stroke[i + 1]! - stroke[i - 1]!;
    d += `${i > 2 && dx >= 0 ? " " : ""}${dx}${dy >= 0 ? " " : ""}${dy}`;
  }
  return d;
}

export function hasInk(strokes: Stroke[]): boolean {
  return strokes.some((s) => s.length >= 2);
}

function buildSvg(strokes: Stroke[], width: number, height: number): string {
  // Never clip the ink, even if the pad's size was never measured.
  let maxX = 0;
  let maxY = 0;
  for (const s of strokes) {
    for (let i = 0; i < s.length; i += 2) {
      maxX = Math.max(maxX, s[i]!);
      maxY = Math.max(maxY, s[i + 1]!);
    }
  }
  const w = Math.max(1, Math.round(width), maxX + 4);
  const h = Math.max(1, Math.round(height), maxY + 4);
  const d = strokes.map(strokeToPath).filter(Boolean).join("");
  // Dark ink on white so it reads on any background (web dark mode, PDFs).
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<rect width="100%" height="100%" fill="#fff"/>` +
    `<path d="${d}" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

/** Keeps every other interior point (stroke ends are kept). */
function thin(stroke: Stroke): Stroke {
  if (stroke.length <= 6) return stroke;
  const out: Stroke = [stroke[0]!, stroke[1]!];
  for (let i = 2; i < stroke.length - 2; i += 4) out.push(stroke[i]!, stroke[i + 1]!);
  out.push(stroke[stroke.length - 2]!, stroke[stroke.length - 1]!);
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 of an ASCII string. Local so it doesn't depend on a runtime btoa. */
export function asciiToBase64(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i);
    const b = i + 1 < input.length ? input.charCodeAt(i + 1) : NaN;
    const c = i + 2 < input.length ? input.charCodeAt(i + 2) : NaN;
    const n = (a << 16) | ((b || 0) << 8) | (c || 0);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    out += Number.isNaN(b) ? "=" : B64[(n >> 6) & 63]!;
    out += Number.isNaN(c) ? "=" : B64[n & 63]!;
  }
  return out;
}

/**
 * The value to store for a signature drawn on a `width` × `height` pad.
 * Pure and synchronous — it cannot hang or fail on device state.
 */
export function buildSignatureDataUri(strokes: Stroke[], width: number, height: number): string {
  let current = strokes.filter((s) => s.length >= 2);
  let uri = SIGNATURE_DATA_URI_PREFIX + asciiToBase64(buildSvg(current, width, height));
  // Unusually long scribbles: halve the detail until the value fits.
  for (let pass = 0; uri.length > MAX_DATA_URI_LENGTH && pass < 6; pass += 1) {
    current = current.map(thin);
    uri = SIGNATURE_DATA_URI_PREFIX + asciiToBase64(buildSvg(current, width, height));
  }
  return uri;
}
