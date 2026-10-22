/**
 * Client communication — vocabulary, row derivations and date helpers.
 *
 * Vocabulary and the stream/status/overdue rules are copied from the web
 * workspace (web/src/app/customer-communication/lib.tsx + page.tsx) so both
 * clients read the same rows the same way. Colours follow the mobile
 * artboard (app.dc.html COMM_TYPE + the comms `extra()` colour rules).
 */
import {
  bxIcon,
  File,
  Info,
  MessageCircle,
  MessageSquareWarning,
  ThumbsUp,
  Users,
  type LucideIcon,
} from "@/components/jo/bxIcons";
import type { JoTone } from "@/constants/jo";
import type { CommRow } from "@/services/CustomerCommunicationService";
import { istParts, istTodayString } from "@/utils/istDate";

export type Stream = "action" | "feedback";

export interface CommType {
  key: string;
  icon: LucideIcon;
  tone: JoTone;
  stream: Stream;
}

export const TYPES: CommType[] = [
  { key: "Escalation", icon: bxIcon("bx-error"), tone: "bad", stream: "action" },
  { key: "Complaint", icon: MessageSquareWarning, tone: "warn", stream: "action" },
  { key: "Request / New Work", icon: File, tone: "info", stream: "action" },
  { key: "Update", icon: Info, tone: "info", stream: "feedback" },
  { key: "Feedback", icon: MessageCircle, tone: "mute", stream: "feedback" },
  { key: "Appreciation", icon: ThumbsUp, tone: "ok", stream: "feedback" },
  { key: "Meeting / Review", icon: Users, tone: "mute", stream: "feedback" },
];

const TYPE_BY_KEY: Record<string, CommType> = Object.fromEntries(TYPES.map((t) => [t.key, t]));

const FALLBACK_TYPE: CommType = { key: "", icon: MessageCircle, tone: "mute", stream: "feedback" };

export function typeDef(key?: string | null): CommType {
  return (key && TYPE_BY_KEY[key]) || { ...FALLBACK_TYPE, key: key || "Communication" };
}

export const OWNER_TEAMS = [
  "Operations/Field Services",
  "Administration/HR",
  "Executive Leadership",
  "Projects",
  "Procurement",
  "Finance",
  "Engineering/Technical",
];

export const PRIORITIES = ["Critical", "High", "Medium", "Low"];
export const ACTION_STATUSES = ["Open", "In Progress", "Blocked", "Closed"];
export const FEEDBACK_STATUSES = ["Logged", "Acknowledged", "Shared with team"];

/** Activity wording the web writes when a feedback record state changes. */
export const FEEDBACK_STATUS_EVENT: Record<string, string> = {
  Logged: "moved back to logged — awaiting acknowledgement",
  Acknowledged: "acknowledged",
  "Shared with team": "shared with the site team",
};

/** Artboard: Critical BAD (solid) · High WARN · Medium INFO · else MUTE. */
export function priorityTone(p?: string | null): JoTone {
  if (p === "Critical") return "bad";
  if (p === "High") return "warn";
  if (p === "Medium") return "info";
  return "mute";
}

/** Artboard status colours. */
export function statusTone(s: string): JoTone {
  switch (s) {
    case "Open":
      return "bad";
    case "In Progress":
      return "info";
    case "Blocked":
      return "warn";
    case "Closed":
    case "Acknowledged":
      return "ok";
    case "Shared with team":
      return "info";
    default:
      return "mute";
  }
}

/* ── Field parsing (same rules as the web lib) ─────────────────────────── */

/** Comma-joined field (types, owner teams) → trimmed list. */
export function splitList(v?: string | null): string[] {
  return String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Attachments column: one URL per line. */
export function splitLinks(v?: string | null): string[] {
  return String(v || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function points(text?: string | null): string[] {
  return String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export const stripBullet = (s: string): string => s.replace(/^\d+\)\s*/, "");

/** Card / sheet title: the description's first point. */
export function titleOf(row: CommRow): string {
  const first = points(row.detailed_description)[0];
  return first ? stripBullet(first) : "(no description)";
}

export interface TimelineEvent {
  when: string;
  who: string;
  what: string;
}

export function parseTimeline(v?: string | null): TimelineEvent[] {
  if (!v) return [];
  try {
    const parsed: unknown = JSON.parse(v);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (e): e is TimelineEvent => !!e && typeof (e as TimelineEvent).what === "string",
      );
    }
  } catch {
    /* malformed trail — show none */
  }
  return [];
}

export function streamOf(row: CommRow): Stream {
  if (row.stream === "action" || row.stream === "feedback") return row.stream;
  const types = splitList(row.communication_type);
  return types.some((t) => TYPE_BY_KEY[t]?.stream === "action") ? "action" : "feedback";
}

export function statusOf(row: CommRow): string {
  if (row.status) return row.status;
  return streamOf(row) === "action" ? "Open" : "Logged";
}

/** Next `CC-####` reference given the rows already loaded (web `nextRef`). */
export function nextRef(rows: CommRow[]): string {
  let max = 0;
  for (const r of rows) {
    const m = /CC-(\d+)/.exec(r.cc_id || "");
    if (m) max = Math.max(max, parseInt(m[1] ?? "0", 10));
  }
  return "CC-" + String(max + 1).padStart(4, "0");
}

/**
 * Day the entry was closed, when the activity trail records it. The web
 * writes "status set to Closed" into the trail on every close; there is no
 * closed-at column, so entries closed without the trail return null.
 */
export function closedOn(row: CommRow): string | null {
  const tl = parseTimeline(row.timeline);
  for (let i = tl.length - 1; i >= 0; i--) {
    const e = tl[i];
    if (e && /status set to Closed/i.test(e.what) && /^\d{4}-\d{2}-\d{2}/.test(e.when)) {
      return e.when.slice(0, 10);
    }
  }
  return null;
}

/* ── Dates — calendar dates stay `YYYY-MM-DD` strings ──────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Calendar date as `YYYY-MM-DD`. With no argument it is TODAY IN IST (the app
 * runs in India; the device zone must not move "today"). With a Date it reads
 * that Date's local parts — only the native pickers pass one, and they hand
 * back the local wall-clock day the person tapped.
 */
export function todayStr(d?: Date): string {
  if (!d) return istTodayString();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "HH:MM" — IST now with no argument, else the picker Date's local time. */
export function nowHHMM(d?: Date): string {
  if (!d) {
    const p = istParts(new Date());
    return `${pad(p.hour)}:${pad(p.minute)}`;
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Timeline stamp, same shape as the web: "YYYY-MM-DD HH:MM" (IST). */
export function nowStamp(): string {
  return `${todayStr()} ${nowHHMM()}`;
}

function parts(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Whole-day difference `a - b`, both `YYYY-MM-DD` (UTC arithmetic, no TZ drift). */
export function dayDiff(a: string, b: string): number {
  const x = parts(a);
  const y = parts(b);
  if (!x || !y) return 0;
  return Math.round((Date.UTC(x[0], x[1] - 1, x[2]) - Date.UTC(y[0], y[1] - 1, y[2])) / 86400000);
}

/** "14 Sep" (adds the year when it isn't the current one). */
export function fmtShort(iso?: string | null, today = todayStr()): string {
  if (!iso) return "—";
  const p = parts(iso);
  const mon = p ? MONTHS[p[1] - 1] : undefined;
  if (!p || !mon) return String(iso);
  return p[0] === Number(today.slice(0, 4)) ? `${p[2]} ${mon}` : `${p[2]} ${mon} ${p[0]}`;
}

/** "14 Sep 2026". */
export function fmtLong(iso?: string | null): string {
  if (!iso) return "—";
  const p = parts(iso);
  const mon = p ? MONTHS[p[1] - 1] : undefined;
  if (!p || !mon) return String(iso);
  return `${p[2]} ${mon} ${p[0]}`;
}

export function monthShort(iso: string): string {
  const p = parts(iso);
  return (p && MONTHS[p[1] - 1]) || "";
}

export function hhmm(t?: string | null): string {
  return t ? String(t).slice(0, 5) : "";
}

/** `YYYY-MM-DD` → local noon Date, for the native picker only. */
export function isoToPickerDate(iso: string): Date {
  const p = parts(iso) ?? parts(todayStr())!;
  return new Date(p[0], p[1] - 1, p[2], 12, 0, 0);
}

/** "HH:MM" → today at that local time, for the native time picker only. */
export function hhmmToPickerDate(t: string): Date {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  const d = new Date();
  if (m) d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

/* ── Due line (artboard: overdue / soon / done / date) ─────────────────── */

export type DueKind = "overdue" | "soon" | "done" | "date";

export interface DueInfo {
  kind: DueKind;
  label: string;
}

export function dueOf(row: CommRow, today: string): DueInfo {
  const isAction = streamOf(row) === "action";
  if (!isAction) return { kind: "date", label: fmtShort(row.communication_date, today) };
  const status = statusOf(row);
  if (status === "Closed") {
    const on = closedOn(row);
    return { kind: "done", label: on ? `Closed ${fmtShort(on, today)}` : "Closed" };
  }
  const due = row.expected_closure_date;
  if (!due) return { kind: "date", label: "No closure date" };
  const days = dayDiff(due, today);
  if (days < 0) return { kind: "overdue", label: `Overdue ${Math.abs(days)}d` };
  if (days === 0) return { kind: "soon", label: "Due today" };
  return { kind: days <= 7 ? "soon" : "date", label: `Close by ${fmtShort(due, today)}` };
}

export function isOverdue(row: CommRow, today: string): boolean {
  return (
    streamOf(row) === "action" &&
    statusOf(row) !== "Closed" &&
    !!row.expected_closure_date &&
    dayDiff(row.expected_closure_date, today) < 0
  );
}

/** Same-site test the web uses: trimmed, case-insensitive name match. */
export const siteKey = (name?: string | null) => String(name || "").trim().toLowerCase();

/* ── Attachments ───────────────────────────────────────────────────────── */

/** Last path segment of an attachment URL, decoded (web `fileNameFromUrl`). */
export function fileNameFromUrl(url: string): string {
  try {
    const clean = url.split("?")[0] ?? url;
    return decodeURIComponent(clean.split("/").pop() || url);
  } catch {
    return url;
  }
}

/** Lower-case extension of a file name / uri ("" when there is none). */
export function extOf(nameOrUri?: string | null): string {
  const clean = (String(nameOrUri || "").split("?")[0] ?? "").toLowerCase();
  const last = clean.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  return dot > 0 ? last.slice(dot + 1) : "";
}

/* ── Date range filter (web components/date-range-filter + lib/date-presets) */

export type DatePresetKey = "today" | "month" | "lastMonth" | "all" | "custom";

/** The web's chip set, in its order. */
export const DATE_PRESETS: { key: Exclude<DatePresetKey, "custom">; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "month", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "all", label: "All" },
];

/** Every web module opens on the current month. */
export const DEFAULT_DATE_PRESET: DatePresetKey = "month";

/**
 * Preset → `{from, to}` as `YYYY-MM-DD` ("" = unbounded). Same rules as the
 * web `resolveDateRange` with its default `monthEnd: "today"`: This Month runs
 * from the 1st to today, Last Month is the whole previous calendar month.
 * Pure string/UTC arithmetic — no device-timezone drift.
 */
export function resolveDateRange(
  preset: DatePresetKey,
  customFrom = "",
  customTo = "",
  today = todayStr(),
): { from: string; to: string } {
  switch (preset) {
    case "custom":
      return { from: customFrom, to: customTo };
    case "today":
      return { from: today, to: today };
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today };
    case "lastMonth": {
      const p = parts(today);
      if (!p) return { from: "", to: "" };
      const first = new Date(Date.UTC(p[0], p[1] - 2, 1));
      const last = new Date(Date.UTC(p[0], p[1] - 1, 0));
      const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      return { from: ymd(first), to: ymd(last) };
    }
    default:
      return { from: "", to: "" };
  }
}

/** Button label for the active range. */
export function dateRangeLabel(preset: DatePresetKey, from: string, to: string): string {
  if (preset !== "custom") return DATE_PRESETS.find((p) => p.key === preset)?.label ?? "All";
  if (from && to) return from === to ? fmtLong(from) : `${fmtLong(from)} – ${fmtLong(to)}`;
  if (from) return `From ${fmtLong(from)}`;
  if (to) return `Until ${fmtLong(to)}`;
  return "All";
}

/* ── CSV export (web `exportCsv`: same columns, same order) ────────────── */

export const EXPORT_FILENAME = "critical-communication.csv";

export function exportRows(rows: CommRow[]): (string | null | undefined)[][] {
  const head = [
    "Reference", "Stream", "Site Name", "Date", "Time", "Input From",
    "Communication Type", "Detailed Description", "Priority", "Owner",
    "Assigned To", "Status", "Expected Action", "Expected Closure Date",
    "Resolution Summary", "Attachments", "Logged By", "Logged At",
  ];
  return [
    head,
    ...rows.map((e) => [
      e.cc_id, streamOf(e), e.site_name, e.communication_date,
      hhmm(e.communication_time), e.input_from, e.communication_type,
      e.detailed_description, e.priority, e.owner, e.assignee, statusOf(e),
      e.expected_action, e.expected_closure_date, e.resolution_summary,
      splitLinks(e.attachments).join("; "), e.email_address, e.submitted_at,
    ]),
  ];
}
