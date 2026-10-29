/**
 * Pure helpers for the "Create RCA" flow: which section answers are complete,
 * the photo rules (JPEG/PNG only, size and count limits), the starting values
 * for the incident-details questions, and the exact payload the server wants.
 *
 * Times, question visibility and the incident-field checks are reused from the
 * RCA-upload flow (rcaImportLib) so both flows accept the same incidents.
 */
import type {
  RcaSection,
  RcaSectionPayload,
  RcaSectionTarget,
  RcaTemplate,
} from "@/services/RcaCreateService";
import type { RcaCreateFields, RcaFields, RcaImportResult } from "@/services/RcaImportService";
import {
  FIELD_ORDER,
  isFullLocal,
  localToIso,
  validateRcaFields,
  type RcaFieldErrors,
} from "./rcaImportLib";

/* ── Limits (contract) ───────────────────────────────────────────────────── */

export const SECTION_TEXT_MAX = 4000;
export const CAPTION_MAX = 120;
export const PHOTOS_PER_SECTION = 8;
export const PHOTOS_TOTAL = 24;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
/** The polish endpoint takes 1–2000 characters. */
export const POLISH_MAX = 2000;
/** Template list gets a search box above this many files. */
export const TEMPLATE_SEARCH_THRESHOLD = 8;

export const PHOTO_FORMAT_MESSAGE = "Please use a JPG or PNG photo.";

/* ── Answers ─────────────────────────────────────────────────────────────── */

export type PhotoStatus = "uploading" | "done" | "failed";

export interface PhotoItem {
  /** Local id, never sent to the server. */
  id: string;
  /** The phone's copy — shown as the thumbnail and used to retry an upload. */
  localUri: string;
  /** JPG/PNG; also names the S3 key, which sets the content type. */
  ext: "jpg" | "png";
  /** Public URL once uploaded. */
  url: string | null;
  caption: string;
  status: PhotoStatus;
}

export interface SectionAnswer {
  text: string;
  photos: PhotoItem[];
}

export type AnswerMap = Record<string, SectionAnswer>;

export const emptyAnswer = (): SectionAnswer => ({ text: "", photos: [] });

export const sectionAsksText = (s: Pick<RcaSection, "kind">) => s.kind !== "photos";
export const sectionAsksPhotos = (s: Pick<RcaSection, "kind">) => s.kind !== "text";

/** The closing remark is always required, whatever the template said. */
export const isSectionRequired = (s: Pick<RcaSection, "required" | "maps_to">) =>
  s.required || s.maps_to === "remarks";

export const uploadedPhotos = (a: SectionAnswer | undefined) =>
  (a?.photos ?? []).filter((p) => p.status === "done" && !!p.url);

export const hasUploading = (a: SectionAnswer | undefined) =>
  (a?.photos ?? []).some((p) => p.status === "uploading");

export const anyUploading = (answers: AnswerMap) => Object.values(answers).some(hasUploading);

export const totalPhotoCount = (answers: AnswerMap) =>
  Object.values(answers).reduce((n, a) => n + a.photos.length, 0);

/**
 * Why the person can't move on from this section yet, or null. Upload state
 * comes first (it is transient and the most actionable), then the same
 * required rules the server re-checks.
 */
export function sectionProblem(section: RcaSection, answer: SectionAnswer | undefined): string | null {
  const a = answer ?? emptyAnswer();
  if (hasUploading(a)) return "Please wait for the photos to finish uploading.";
  if (a.photos.some((p) => p.status === "failed")) {
    return "A photo didn't upload. Tap Retry on it, or remove it.";
  }
  if (a.text.length > SECTION_TEXT_MAX) {
    return `Please keep this under ${SECTION_TEXT_MAX} characters.`;
  }
  if (isSectionRequired(section)) {
    if (sectionAsksText(section) && !a.text.trim()) return `Please answer “${section.title}”.`;
    if (!sectionAsksText(section) && uploadedPhotos(a).length === 0) {
      return `Please add at least one photo for “${section.title}”.`;
    }
  }
  return null;
}

/** True when the section may be left blank without a problem. */
export const isSectionBlank = (a: SectionAnswer | undefined) =>
  !a || (!a.text.trim() && a.photos.length === 0);

/* ── Photos ──────────────────────────────────────────────────────────────── */

/** How many more photos can go in this section, given both limits. */
export const photoSlots = (inSection: number, inTotal: number) =>
  Math.max(0, Math.min(PHOTOS_PER_SECTION - inSection, PHOTOS_TOTAL - inTotal));

const extFrom = (s: string | null | undefined) => {
  const clean = (s ?? "").split("?")[0] ?? "";
  const last = clean.split("/").pop() ?? "";
  return last.includes(".") ? (last.split(".").pop() ?? "").toLowerCase() : "";
};

/**
 * JPEG or PNG only — the generated PDF can't embed anything else. The picker's
 * mime type wins when it has one (an edited photo's file name can lie);
 * otherwise the file extension decides.
 */
export function checkPhotoAsset(asset: {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}): { ok: true; ext: "jpg" | "png" } | { ok: false; error: string } {
  const mime = (asset.mimeType ?? "").toLowerCase();
  let ext: "jpg" | "png" | null = null;
  if (mime) {
    if (mime === "image/jpeg" || mime === "image/jpg") ext = "jpg";
    else if (mime === "image/png") ext = "png";
  } else {
    const e = extFrom(asset.fileName) || extFrom(asset.uri);
    if (e === "jpg" || e === "jpeg") ext = "jpg";
    else if (e === "png") ext = "png";
  }
  if (!ext) return { ok: false, error: PHOTO_FORMAT_MESSAGE };
  if (typeof asset.fileSize === "number" && asset.fileSize > PHOTO_MAX_BYTES) {
    return { ok: false, error: "That photo is larger than 5 MB. Please use a smaller one." };
  }
  return { ok: true, ext };
}

export interface PhotoPlan {
  accepted: { uri: string; ext: "jpg" | "png" }[];
  /** Plain-language reasons something wasn't added (deduplicated). */
  messages: string[];
}

/**
 * Of the photos just picked, which can be added: format and size first, then
 * the per-section and overall limits (first come, first kept).
 */
export function planPhotoAdds(
  assets: { uri: string; mimeType?: string | null; fileName?: string | null; fileSize?: number | null }[],
  inSection: number,
  inTotal: number,
): PhotoPlan {
  const accepted: PhotoPlan["accepted"] = [];
  const messages: string[] = [];
  const note = (m: string) => {
    if (!messages.includes(m)) messages.push(m);
  };
  for (const asset of assets) {
    const checked = checkPhotoAsset(asset);
    if (!checked.ok) {
      note(checked.error);
      continue;
    }
    if (inSection + accepted.length >= PHOTOS_PER_SECTION) {
      note(`You can add up to ${PHOTOS_PER_SECTION} photos in each section.`);
      continue;
    }
    if (inTotal + accepted.length >= PHOTOS_TOTAL) {
      note(`An RCA can have up to ${PHOTOS_TOTAL} photos in total.`);
      continue;
    }
    accepted.push({ uri: asset.uri, ext: checked.ext });
  }
  return { accepted, messages };
}

/** `incidents/<site>/rca-create/<uuid>.<ext>` — the contract's S3 key shape. */
export const photoKey = (siteCode: string, uuid: string, ext: "jpg" | "png") =>
  `incidents/${siteCode}/rca-create/${uuid}.${ext}`;

/* ── Incident details ────────────────────────────────────────────────────── */

/**
 * Starting values for the details questions: the server's blank fields plus
 * any Recommended choice / default it offered (e.g. status "Resolved").
 * Enum fields stay "" until answered.
 */
export function initialFields(result: RcaImportResult, siteCode: string): RcaFields {
  const f: RcaFields = { ...result.fields, site_code: result.fields.site_code || siteCode };
  for (const q of result.questions) {
    if (q.kind === "choice") {
      const rec = q.options?.find((o) => o.recommended);
      if (rec && q.field !== "site_code") (f as any)[q.field] = rec.value;
    } else if (q.kind === "datetime") {
      if (q.default && isFullLocal(q.default) && !isFullLocal(f[q.field] as string | null)) {
        (f as any)[q.field] = q.default;
      }
    } else if (q.kind === "text") {
      if (q.default && !String(f[q.field] ?? "").trim()) (f as any)[q.field] = q.default;
    }
  }
  return f;
}

/* ── Answers → payload ───────────────────────────────────────────────────── */

const NARRATIVE: RcaSectionTarget[] = [
  "immediate_action_taken",
  "root_cause",
  "corrective_action",
  "preventive_action",
  "remarks",
];

/** Same join the server uses: every section mapping to a column, blank-line separated. */
export function narrativeFromAnswers(
  sections: RcaSection[],
  answers: AnswerMap,
): Record<RcaSectionTarget, string> {
  const out = Object.fromEntries(NARRATIVE.map((k) => [k, [] as string[]])) as Record<
    RcaSectionTarget,
    string[]
  >;
  for (const s of sections) {
    if (!s.maps_to) continue;
    const text = (answers[s.id]?.text ?? "").trim();
    if (text) out[s.maps_to].push(text);
  }
  return Object.fromEntries(NARRATIVE.map((k) => [k, out[k].join("\n\n")])) as Record<
    RcaSectionTarget,
    string
  >;
}

/**
 * Every section from `start`, in order, echoing its metadata plus the answer.
 * Only finished uploads are sent; text is dropped for photo-only sections and
 * photos for text-only ones, so a stale answer can't leak in.
 */
export function buildSectionsPayload(sections: RcaSection[], answers: AnswerMap): RcaSectionPayload[] {
  return sections.map((s) => {
    const a = answers[s.id] ?? emptyAnswer();
    return {
      id: s.id,
      title: s.title,
      prompt: s.prompt,
      help: s.help,
      kind: s.kind,
      maps_to: s.maps_to,
      required: isSectionRequired(s),
      text: sectionAsksText(s) ? a.text.trim() : "",
      photos: sectionAsksPhotos(s)
        ? uploadedPhotos(a).map((p) => ({ url: p.url as string, caption: p.caption.trim().slice(0, CAPTION_MAX) }))
        : [],
    };
  });
}

/** The details fields for the create call: the three times as ISO instants, narrative left to the sections. */
export function buildCreateFields(fields: RcaFields): Partial<RcaCreateFields> {
  const rest: Partial<RcaFields> = { ...fields };
  for (const key of NARRATIVE) delete rest[key];
  return {
    ...rest,
    fault_symptom: fields.fault_symptom.trim(),
    asset_location: (fields.asset_location ?? "").trim() || null,
    raised_by: (fields.raised_by ?? "").trim(),
    vendor_tagged: (fields.vendor_tagged ?? "").trim(),
    incident_created_time: localToIso(fields.incident_created_time) ?? undefined,
    incident_updated_time: localToIso(fields.incident_updated_time),
    incident_resolved_time: fields.status === "Resolved" ? localToIso(fields.incident_resolved_time) : null,
  };
}

/* ── Whole-wizard problems (review step) ─────────────────────────────────── */

export type ProblemTarget = { type: "field"; field: keyof RcaFields } | { type: "section"; id: string };
export interface Problem {
  key: string;
  message: string;
  target: ProblemTarget;
}

/**
 * Everything still wrong, in the order the wizard asks: details first, then
 * sections. Mirrors the server's final validation so problems show before
 * the request is sent.
 */
export function collectProblems(
  fields: RcaFields,
  sections: RcaSection[],
  answers: AnswerMap,
): Problem[] {
  const narrative = narrativeFromAnswers(sections, answers);
  const errors: RcaFieldErrors = validateRcaFields({ ...fields, ...narrative });
  const remarksSection = sections.find((s) => s.maps_to === "remarks");
  const problems: Problem[] = [];

  for (const field of FIELD_ORDER) {
    const message = errors[field];
    if (!message) continue;
    if (field === "remarks") {
      // Answered in a section, not a details question.
      if (remarksSection) {
        problems.push({ key: "remarks", message, target: { type: "section", id: remarksSection.id } });
      }
      continue;
    }
    problems.push({ key: String(field), message, target: { type: "field", field } });
  }
  for (const s of sections) {
    const message = sectionProblem(s, answers[s.id]);
    if (message && !problems.some((p) => p.target.type === "section" && p.target.id === s.id)) {
      problems.push({ key: s.id, message, target: { type: "section", id: s.id } });
    }
  }
  return problems;
}

/* ── Template list ───────────────────────────────────────────────────────── */

export function filterTemplates(list: RcaTemplate[], query: string): RcaTemplate[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((t) =>
    [t.file_name, t.incident_id, t.site_name, t.site_code, t.fault_symptom]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)),
  );
}

/** First non-empty line of an answer, trimmed for a summary row. */
export function firstLine(text: string, max = 90): string {
  const line = (text.split("\n").find((l) => l.trim()) ?? "").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}
