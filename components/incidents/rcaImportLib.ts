/**
 * Pure helpers for the "Upload RCA report" flow: file checks done before
 * anything is uploaded, local wall-clock time handling, question visibility
 * and the same final validation the server runs (so problems show inline
 * instead of as a failed submit).
 */
import type { RcaFields, RcaQuestion } from "@/services/RcaImportService";

/* ── File checks ─────────────────────────────────────────────────────────── */

export const RCA_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const RCA_MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const RCA_PICKER_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const DOC_EXT = ["pdf", "docx", "pptx"] as const;
const PHOTO_EXT = ["jpg", "jpeg", "png", "webp"] as const;

export type RcaFileKind = "pdf" | "docx" | "pptx" | "photo";

export interface PickedRcaFile {
  uri: string;
  name: string;
  size: number | null;
  /** Normalised extension — the S3 key's content type is inferred from it. */
  ext: string;
  kind: RcaFileKind;
}

const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/msword": "doc",
  "application/vnd.ms-powerpoint": "ppt",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const extFrom = (s: string | null | undefined) => {
  const clean = (s ?? "").split("?")[0] ?? "";
  const last = clean.split("/").pop() ?? "";
  return last.includes(".") ? (last.split(".").pop() ?? "").toLowerCase() : "";
};

/**
 * Checks a picked document BEFORE it is uploaded, so an unsupported or
 * oversized file never costs bandwidth or a read. Returns the user-facing
 * reason, or the normalised file.
 */
export function checkRcaFile(asset: {
  uri: string;
  name?: string | null;
  size?: number | null;
  mimeType?: string | null;
}): { ok: true; file: PickedRcaFile } | { ok: false; error: string } {
  const ext =
    extFrom(asset.name) || extFrom(asset.uri) || MIME_EXT[asset.mimeType ?? ""] || "";
  if (ext === "doc" || ext === "ppt") {
    return {
      ok: false,
      error: "This is an older Office file. Please save it as PDF or .docx and upload again.",
    };
  }
  const isDoc = (DOC_EXT as readonly string[]).includes(ext);
  const isPhoto = (PHOTO_EXT as readonly string[]).includes(ext);
  if (!isDoc && !isPhoto) {
    return {
      ok: false,
      error:
        "This file type isn't supported. Please upload the RCA as a PDF, Word (.docx) or PowerPoint (.pptx) file, or a clear photo (JPG/PNG).",
    };
  }
  const size = typeof asset.size === "number" ? asset.size : null;
  if (size === 0) {
    return { ok: false, error: "This file is empty. Please choose the RCA document again." };
  }
  if (size !== null && isPhoto && size > RCA_MAX_PHOTO_BYTES) {
    return {
      ok: false,
      error: "This photo is larger than 5 MB. Please upload a smaller photo or a PDF of the RCA.",
    };
  }
  if (size !== null && size > RCA_MAX_FILE_BYTES) {
    return {
      ok: false,
      error:
        "This file is larger than 15 MB. Please upload a smaller copy — saving it as a PDF usually helps.",
    };
  }
  const name = (asset.name || "").trim() || `RCA report.${ext}`;
  return {
    ok: true,
    file: {
      uri: asset.uri,
      name,
      size,
      ext: ext === "jpeg" ? "jpg" : ext,
      kind: isPhoto ? "photo" : (ext as RcaFileKind),
    },
  };
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const FILE_KIND_LABEL: Record<string, string> = {
  pdf: "PDF",
  docx: "Word document",
  pptx: "PowerPoint",
  photo: "Photo",
  image: "Photo",
};

/* ── Local wall-clock times ──────────────────────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DDTHH:mm" → a Date in the device's timezone (null if not full). */
export function parseLocal(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value ?? "");
  if (!m) return null;
  const d = new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "YYYY-MM-DD" (or the date part of a full value) → local midnight. */
export function parseLocalDate(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!m) return null;
  const d = new Date(+m[1]!, +m[2]! - 1, +m[3]!);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const isFullLocal = (value: string | null | undefined) => parseLocal(value) !== null;

export function toLocalString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local value → ISO instant for the create call. */
export const localToIso = (value: string | null | undefined) => parseLocal(value)?.toISOString() ?? null;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const formatDay = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

export function formatClock(d: Date) {
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
}

export const formatLocal = (value: string | null | undefined) => {
  const d = parseLocal(value);
  return d ? `${formatDay(d)}, ${formatClock(d)}` : "";
};

/** Small allowance for a phone clock running a little ahead (server uses 5 min). */
export const FUTURE_SKEW_MS = 60 * 1000;

export const isFuture = (d: Date) => d.getTime() > Date.now() + FUTURE_SKEW_MS;

/* ── Questions ───────────────────────────────────────────────────────────── */

export const isQuestionVisible = (q: RcaQuestion, fields: RcaFields) =>
  !q.only_if || String(fields[q.only_if.field] ?? "") === q.only_if.equals;

export function isQuestionAnswered(q: RcaQuestion, fields: RcaFields): boolean {
  const v = fields[q.field];
  if (q.kind === "datetime") {
    const d = parseLocal(v as string | null);
    return !!d && !isFuture(d);
  }
  return typeof v === "string" && v.trim().length > 0;
}

/* ── Final validation (mirrors the server's validateFinal) ──────────────── */

export type RcaFieldErrors = Partial<Record<keyof RcaFields, string>>;

export function validateRcaFields(f: RcaFields): RcaFieldErrors {
  const e: RcaFieldErrors = {};
  if (!f.site_code) e.site_code = "Please choose the site.";
  if (!(f.asset_location ?? "").trim()) e.asset_location = "Please choose the affected equipment.";
  if (!f.fault_symptom.trim()) e.fault_symptom = "Please add a short title for the incident.";
  if (!(f.assigned_to ?? "").trim()) e.assigned_to = "Please choose who the incident is assigned to.";
  if (!f.fault_type) e.fault_type = "Please choose the fault type.";
  if (!f.severity) e.severity = "Please choose the severity.";
  if (!f.operating_condition) e.operating_condition = "Please choose the equipment's operating condition.";

  const created = parseLocal(f.incident_created_time);
  const responded = parseLocal(f.incident_updated_time);
  const resolved = f.status === "Resolved" ? parseLocal(f.incident_resolved_time) : null;

  if (!created) e.incident_created_time = "Please set when the incident happened.";
  else if (isFuture(created)) e.incident_created_time = "The incident time can't be in the future.";

  if (responded) {
    if (isFuture(responded)) e.incident_updated_time = "The response time can't be in the future.";
    else if (created && responded < created) {
      e.incident_updated_time = "The response time can't be before the incident happened.";
    }
  }

  if (f.status === "Resolved") {
    if (!resolved) e.incident_resolved_time = "Please set when the incident was resolved.";
    else if (isFuture(resolved)) e.incident_resolved_time = "The resolved time can't be in the future.";
    else if (created && resolved < created) {
      e.incident_resolved_time = "The resolved time can't be before the incident happened.";
    } else if (responded && resolved < responded) {
      e.incident_resolved_time = "The resolved time can't be before the response time.";
    }
    if (!f.remarks.trim()) e.remarks = "Please add a closing remark on how it was fixed.";
  }
  return e;
}

/** Order the review screen reads top to bottom — the first error shown. */
export const FIELD_ORDER: (keyof RcaFields)[] = [
  "site_code",
  "asset_location",
  "fault_symptom",
  "fault_type",
  "severity",
  "operating_condition",
  "assigned_to",
  "incident_created_time",
  "incident_updated_time",
  "incident_resolved_time",
  "remarks",
];
