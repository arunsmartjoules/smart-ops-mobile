/**
 * PM-specific colour maps and date copy — Claude Design "JouleOps PM.dc.html".
 * The surrounding chrome is shared; see components/shared/ListChrome.
 */
import { ds } from "@/constants/ds";
import { formatIST, istDayStartMs } from "@/utils/istDate";

export { soRadius, soShadow } from "@/components/home/SiteOverview";

/** The mock's amber "Due" pair has no ds token — it's specific to PM. */
const DUE_BG = "#FEF4E9";
const DUE_FG = "#B5710A";

export const PM_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  Overdue: { label: "Overdue", bg: ds.flame[1000], fg: ds.flame[100] },
  Due: { label: "Due", bg: DUE_BG, fg: DUE_FG },
  "In progress": { label: "In progress", bg: ds.sky[1000], fg: ds.sky[100] },
  Completed: { label: "Completed", bg: ds.sky[900], fg: "#1F757D" },
  Skipped: { label: "Skipped", bg: ds.carbon[1000], fg: ds.carbon[500] },
};

/**
 * The backend's PM vocabulary (Pending / Overdue / In-progress / Completed,
 * with assorted casing) mapped onto the design's five states.
 */
export const getPmStatus = (status?: string | null) => {
  const s = (status || "").toLowerCase().trim();
  if (s === "completed") return PM_STATUS.Completed;
  if (s === "in-progress" || s === "in progress" || s === "inprogress") {
    return PM_STATUS["In progress"];
  }
  if (s === "overdue") return PM_STATUS.Overdue;
  if (s === "skipped" || s === "cancelled") return PM_STATUS.Skipped;
  return PM_STATUS.Due;
};

/** Frequency rides in the second badge, in neutral carbon. */
export const getPmFrequency = (frequency?: string | null) => {
  const label = (frequency || "").trim();
  if (!label) return null;
  return { label, bg: ds.carbon[1000], fg: ds.carbon[400] };
};

/** "3/12" → 25. Returns null when the string isn't a fraction. */
export const parsePmProgress = (progress?: string | null) => {
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec((progress || "").trim());
  if (!match) return null;
  const done = Number(match[1]);
  const total = Number(match[2]);
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
};

/**
 * "Due today" / "Due tomorrow" / "Due 17 Aug · 2d late" / "Done 17 Aug".
 * `late` drives the flame treatment on the date line.
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
  if (days < 0) {
    const late = Math.abs(days);
    return {
      label: `Due ${formatIST(dueMs, DM)} · ${late}d late`,
      late: true,
    };
  }
  return { label: `Due ${formatIST(dueMs, DM)}`, late: false };
}

const DM: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
