/**
 * PM status vocabulary + date copy for the "JouleOps App" artboard
 * (app.dc.html `r_pm`, constants PM_ST: Overdue BAD · Due WARN ·
 * In progress INFO · Completed OK · Skipped MUTE).
 *
 * The backend only ever stores Pending / In-progress / Completed (assorted
 * casing over the years). "Overdue" is not a stored status — it is derived
 * here the same way the backend's getOverduePMInstances does: a not-started
 * PM whose due date is before today (IST calendar day).
 */
import type { JoTone } from "@/constants/jo";
import { formatIST, istDayStartMs } from "@/utils/istDate";

export type PmStatusKey =
  | "Overdue"
  | "Due"
  | "In progress"
  | "Completed"
  | "Skipped";

export const PM_TONE: Record<PmStatusKey, JoTone> = {
  Overdue: "bad",
  Due: "warn",
  "In progress": "info",
  Completed: "ok",
  Skipped: "mute",
};

const norm = (status: string | null | undefined) =>
  (status || "").toLowerCase().trim();

export const isPmInProgress = (status: string | null | undefined) => {
  const s = norm(status);
  return s === "in-progress" || s === "in progress" || s === "inprogress";
};

export const isPmCompleted = (status: string | null | undefined) =>
  norm(status) === "completed";

/** Pending / Open / blank (and a legacy stored "Overdue") — not started yet. */
export const isPmNotStarted = (status: string | null | undefined) => {
  const s = norm(status);
  return s === "pending" || s === "open" || s === "overdue" || s === "";
};

/**
 * The artboard's five states for one PM. `todayStartMs` is the IST start of
 * today — pass it in so a list classifies every row against the same day.
 */
export function pmStatusKey(
  status: string | null | undefined,
  dueMs: number | null | undefined,
  todayStartMs: number = istDayStartMs(new Date()),
): PmStatusKey {
  const s = norm(status);
  if (s === "completed") return "Completed";
  if (isPmInProgress(s)) return "In progress";
  if (s === "skipped" || s === "cancelled") return "Skipped";
  if (s === "overdue") return "Overdue";
  if (dueMs != null && istDayStartMs(dueMs) < todayStartMs) return "Overdue";
  return "Due";
}

/** "3/12" → 25. Returns null when the string isn't a fraction. */
export const parsePmProgress = (progress?: string | null) => {
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec((progress || "").trim());
  if (!match) return null;
  const done = Number(match[1]);
  const total = Number(match[2]);
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
};

const DM: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

/**
 * "Due today" / "Due tomorrow" / "Due 17 Aug" / "Done 17 Aug".
 * `late` drives the BAD colour on the date line.
 */
export function formatPmDue(
  dueMs?: number | null,
  completedMs?: number | null,
  showCompleted?: boolean,
): { label: string; late: boolean } {
  if (showCompleted && completedMs) {
    return { label: `Done ${formatIST(completedMs, DM)}`, late: false };
  }
  if (dueMs == null) return { label: "No due date", late: false };

  const today = istDayStartMs(new Date());
  const due = istDayStartMs(dueMs);
  const days = Math.round((due - today) / 86_400_000);

  if (days === 0) return { label: "Due today", late: false };
  if (days === 1) return { label: "Due tomorrow", late: false };
  // Overdue shows the due date only — the day count was dropped earlier as
  // noise on the card. `late` still paints the line as overdue.
  if (days < 0) return { label: `Due ${formatIST(dueMs, DM)}`, late: true };
  return { label: `Due ${formatIST(dueMs, DM)}`, late: false };
}
