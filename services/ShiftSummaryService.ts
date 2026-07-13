/**
 * ShiftSummaryService
 *
 * Assembles the "End Day" shift summary for the currently-signed-in operator,
 * scoped to TODAY (IST) and their active site. Pure local reads (Drizzle +
 * existing per-domain services) so the sign-off screen renders fully offline.
 *
 * Scoping:
 *  - Tickets & PM: the operator's own work, matched by display name
 *    (`operatorLabel(user)`) against `assigned_to` / `assigned_to_name` — the
 *    app has no assignee foreign key, only a free-form label.
 *  - Site logs: site/shift-level category progress (Temp RH / Chiller / Water /
 *    Chemical Dosing), mirroring the reference mock.
 */

import { db, tickets } from "../database";
import { operatorLabel, emailLocalPart } from "../utils/assignee";
import { istDayStartMs, istDayEndMs, istTodayString } from "../utils/istDate";
import { TICKET_STATUS } from "../constants/statuses";
import PMService from "./PMService";
import { SiteLogService } from "./SiteLogService";
import logger from "../utils/logger";

export interface TicketSummaryItem {
  id: string;
  ticket_number: string;
  title: string;
  site: string;
  status: string;
}

export interface PMSummaryItem {
  title: string;
  asset: string;
  status: string;
  progress: string;
}

export interface LogCategoryProgress {
  category: string;
  total: number;
  completed: number;
  percent: number;
}

export interface ShiftSummary {
  operatorLabel: string;
  siteCode: string;
  date: string;
  tickets: {
    total: number;
    completed: number;
    inProgress: number;
    items: TicketSummaryItem[];
  };
  pm: {
    total: number;
    done: number;
    inProgress: number;
    items: PMSummaryItem[];
  };
  siteLogs: LogCategoryProgress[];
}

type OperatorUser = Parameters<typeof operatorLabel>[0];

const norm = (v?: string | null) => String(v ?? "").trim().toLowerCase();

const SENTINELS = new Set(["", "system", "unknown", "null", "undefined"]);

/**
 * All display identities the current user could have been recorded under in an
 * `assigned_to` / `assigned_to_name` column. Assignment writes `full_name ||
 * name`, but those can differ (e.g. "A R U N" vs "Arun"), and legacy rows may
 * hold the employee code or email local-part. Matching against the whole set
 * makes "assigned to me" robust to which variant was stored.
 */
function candidateLabels(user: OperatorUser): Set<string> {
  const out = new Set<string>();
  const add = (v?: string | null) => {
    const s = norm(v);
    if (!SENTINELS.has(s)) out.add(s);
  };
  add(user?.full_name);
  add(user?.name);
  add(user?.employee_code);
  add(emailLocalPart(user?.email));
  return out;
}

const inToday = (ms?: number | null, start?: number, end?: number) =>
  typeof ms === "number" && ms >= (start ?? 0) && ms <= (end ?? 0);

const PM_DONE = new Set(["completed"]);
const PM_INPROGRESS = new Set(["in-progress", "in progress", "inprogress"]);

const LOG_CATEGORIES = ["Temp RH", "Chiller Logs", "Water", "Chemical Dosing"];

export const ShiftSummaryService = {
  /**
   * Build today's shift summary for `user` at `siteCode` (the attendance
   * record's site — pass it in; PM stores site_code UPPERCASE internally so
   * `getLocalInstances` re-normalizes).
   */
  async buildTodaySummary(params: {
    user: OperatorUser;
    siteCode: string;
  }): Promise<ShiftSummary> {
    const { user, siteCode } = params;
    const meSet = candidateLabels(user);
    const dayStart = istDayStartMs();
    const dayEnd = istDayEndMs();
    const date = istTodayString();

    const [ticketsPart, pmPart, logsPart] = await Promise.all([
      this._buildTickets(meSet, dayStart, dayEnd),
      this._buildPM(siteCode, meSet, dayStart, dayEnd),
      this._buildSiteLogs(siteCode),
    ]);

    return {
      operatorLabel: operatorLabel(user),
      siteCode,
      date,
      tickets: ticketsPart,
      pm: pmPart,
      siteLogs: logsPart,
    };
  },

  async _buildTickets(
    meSet: Set<string>,
    dayStart: number,
    dayEnd: number,
  ): Promise<ShiftSummary["tickets"]> {
    try {
      // Match by assignee across the operator's locally-synced tickets. We do
      // NOT scope by site here: the attendance record's site_code is often null
      // (WFH/off-site punch-in), and tickets are assigned by display name, not
      // by site. The local `tickets` table only holds the operator's authorized
      // sites, so an assignee match is both sufficient and robust.
      const rows = await db.select().from(tickets);

      const items: TicketSummaryItem[] = [];
      let completed = 0;
      let inProgress = 0;

      for (const t of rows) {
        if (!meSet.has(norm(t.assigned_to))) continue;
        const status = t.status;

        let bucket: "completed" | "inProgress" | null = null;
        if (status === TICKET_STATUS.RESOLVED) {
          // `closed_at` is not populated by the tickets pull, so use the synced
          // `updated_at` (bumped when the ticket is resolved) as the
          // "resolved today" signal — otherwise stale resolved tickets from
          // prior days would inflate the count.
          if (inToday(t.updated_at as number | null, dayStart, dayEnd)) {
            bucket = "completed";
          }
        } else if (status === TICKET_STATUS.IN_PROGRESS) {
          bucket = "inProgress";
        }
        // Open / Hold / Waiting / Cancelled (and tickets resolved on a prior
        // day) are not part of the shift summary — only completed + in-progress.
        if (!bucket) continue;

        if (bucket === "completed") completed++;
        else inProgress++;

        items.push({
          id: t.id,
          ticket_number: t.ticket_number,
          title: t.title,
          site: t.site_code,
          status,
        });
      }

      return { total: completed + inProgress, completed, inProgress, items };
    } catch (error: any) {
      logger.warn("ShiftSummaryService: tickets build failed", {
        module: "SHIFT_SUMMARY",
        error: error?.message,
      });
      return { total: 0, completed: 0, inProgress: 0, items: [] };
    }
  },

  async _buildPM(
    siteCode: string,
    meSet: Set<string>,
    dayStart: number,
    dayEnd: number,
  ): Promise<ShiftSummary["pm"]> {
    try {
      const rows = await PMService.getLocalInstances(siteCode);

      const items: PMSummaryItem[] = [];
      let done = 0;
      let inProgress = 0;

      for (const r of rows as any[]) {
        // Scope to this operator's PMs by name (when assigned).
        if (!meSet.has(norm(r.assigned_to_name))) continue;
        const status = norm(r.status);

        let bucket: "done" | "inProgress" | null = null;
        if (PM_DONE.has(status)) {
          // Completed today (or completion time unknown but marked done).
          if (
            r.completed_on == null ||
            inToday(r.completed_on, dayStart, dayEnd)
          ) {
            bucket = "done";
          }
        } else if (PM_INPROGRESS.has(status)) {
          bucket = "inProgress";
        }
        // Pending / Overdue are not part of the shift summary.
        if (!bucket) continue;

        if (bucket === "done") done++;
        else inProgress++;

        items.push({
          title: r.title,
          asset: r.asset_type || r.location || "",
          status: r.status,
          progress: r.progress || "",
        });
      }

      return { total: done + inProgress, done, inProgress, items };
    } catch (error: any) {
      logger.warn("ShiftSummaryService: PM build failed", {
        module: "SHIFT_SUMMARY",
        error: error?.message,
      });
      return { total: 0, done: 0, inProgress: 0, items: [] };
    }
  },

  async _buildSiteLogs(siteCode: string): Promise<LogCategoryProgress[]> {
    try {
      if (!siteCode) return [];
      const today = new Date();
      const progress = await SiteLogService.getCategoryProgress(
        siteCode,
        today,
        today,
      );
      return LOG_CATEGORIES.map((category) => {
        const p = progress[category] || { total: 0, completed: 0 };
        const percent = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
        return { category, total: p.total, completed: p.completed, percent };
      });
    } catch (error: any) {
      logger.warn("ShiftSummaryService: site logs build failed", {
        module: "SHIFT_SUMMARY",
        error: error?.message,
      });
      return LOG_CATEGORIES.map((category) => ({
        category,
        total: 0,
        completed: 0,
        percent: 0,
      }));
    }
  },
};

export default ShiftSummaryService;
