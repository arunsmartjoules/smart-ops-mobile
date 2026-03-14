import { Q } from "@nozbe/watermelondb";
import {
  areaCollection,
  chillerReadingCollection,
  siteLogCollection,
} from "../database";
import logger from "../utils/logger";
import { startOfDay, endOfDay } from "date-fns";

export interface TaskItem {
  id: string;
  name: string;
  type: "area" | "asset" | "general";
  isCompleted: boolean;
  status: "Open" | "Inprogress" | "Completed";
  lastLogId?: string;
  meta?: any;
}

const taskCache: Record<string, string[]> = {};
const lastCacheTime: Record<string, number> = {};
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export const SiteConfigService = {
  /**
   * Get all Tasks (Areas) for a Site and Log Type.
   * Derived from historical logs.
   */
  async getLogTasks(
    siteCode: string,
    logName: string,
    fromDate?: Date | null,
    toDate?: Date | null,
  ): Promise<TaskItem[]> {
    try {
      // Fetch the last 500 logs directly to guarantee we have the latest entry for each area
      const recentLogs = await siteLogCollection
        .query(
          Q.where("site_code", siteCode),
          Q.where("log_name", logName),
          Q.sortBy("created_at", Q.desc),
          Q.take(500),
        )
        .fetch();

      const uniqueSet = new Set<string>();
      recentLogs.forEach((log) => {
        const identifier = log.taskName || log.logName || "General Task";
        if (identifier) {
          uniqueSet.add(identifier);
        }
      });
      const uniqueTaskNames = Array.from(uniqueSet);

      if (uniqueTaskNames.length === 0) {
        return [];
      }

      // Check completion within the specified timeframe (or today by default)
      const start = fromDate
        ? startOfDay(fromDate).getTime()
        : startOfDay(new Date()).getTime();
      const end = toDate
        ? endOfDay(toDate).getTime()
        : endOfDay(new Date()).getTime();

      const tasks: TaskItem[] = uniqueTaskNames.map((taskName) => {
        // Since recentLogs is sorted by created_at DESC, the first match is the absolute latest
        const latestLog = recentLogs.find((l) => l.taskName === taskName);

        let status: "Open" | "Inprogress" | "Completed" = "Open";
        let meta: any = null;

        if (latestLog) {
          const rawStatus = (latestLog.status || "")
            .toLowerCase()
            .replace(/\s/g, "");

          const isWithinRange =
            latestLog.createdAt?.getTime() >= start &&
            latestLog.createdAt?.getTime() <= end;

          if (rawStatus === "inprogress") {
            status = "Inprogress";
          } else if (rawStatus === "completed") {
            status = isWithinRange ? "Completed" : "Open";
          } else {
            // "pending", empty, or other statuses are treated as "Open"
            status = "Open";
          }

          // Always include the most recent data for pre-filling, even if status is "Open"
          meta = {
            temperature: latestLog.temperature,
            rh: latestLog.rh,
            tds: latestLog.tds,
            ph: latestLog.ph,
            hardness: latestLog.hardness,
            chemicalDosing: latestLog.chemicalDosing,
            remarks: latestLog.remarks,
          };
        }

        const isCompleted = status === "Completed";
        const lastLogId = latestLog?.id;

        return {
          id: taskName,
          name: taskName,
          type: "area",
          isCompleted,
          status,
          lastLogId,
          meta,
        };
      });

      return tasks.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error: any) {
      logger.error(`Error fetching tasks for ${logName}`, {
        module: "SITE_CONFIG_SERVICE",
        error: error.message,
      });
      return [];
    }
  },

  /**
   * Get Chillers for a Site (derived from history) and check status.
   */
  async getChillerTasks(
    siteCode: string,
    fromDate?: Date | null,
    toDate?: Date | null,
  ): Promise<TaskItem[]> {
    try {
      // 1. Fetch distinct Chiller IDs from historical logs
      const recentReadings = await chillerReadingCollection
        .query(
          Q.where("site_code", siteCode),
          Q.sortBy("created_at", Q.desc),
          Q.take(50),
        )
        .fetch();

      const uniqueChillers = new Set<string>();
      recentReadings.forEach((r) => {
        if (r.chillerId) uniqueChillers.add(r.chillerId);
      });

      if (uniqueChillers.size === 0) {
        return [];
      }

      // 2. Check completion within the specified timeframe (or today by default)
      const start = fromDate
        ? startOfDay(fromDate).getTime()
        : startOfDay(new Date()).getTime();
      const end = toDate
        ? endOfDay(toDate).getTime()
        : endOfDay(new Date()).getTime();

      const timeframeReadings = await chillerReadingCollection
        .query(
          Q.where("site_code", siteCode),
          Q.where("reading_time", Q.gte(start)),
          Q.where("reading_time", Q.lte(end)),
          Q.sortBy("reading_time", Q.desc),
        )
        .fetch();

      const tasks: TaskItem[] = Array.from(uniqueChillers).map((chillerId) => {
        const reading = timeframeReadings.find((r) => r.chillerId === chillerId);

        let status: "Open" | "Inprogress" | "Completed" = "Open";
        if (reading) {
          const rawStatus = (reading.status || "")
            .toLowerCase()
            .replace(/\s/g, "");
          if (rawStatus === "completed" || !reading.status) {
            status = "Completed";
          } else if (rawStatus === "inprogress") {
            status = "Inprogress";
          }
        }

        const isCompleted = status === "Completed";
        return {
          id: chillerId,
          name: chillerId, // e.g. "CH-01"
          type: "asset",
          isCompleted,
          status,
        };
      });

      return tasks.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error: any) {
      logger.error("Error fetching chiller tasks", {
        module: "SITE_CONFIG_SERVICE",
        error: error.message,
      });
      return [];
    }
  },

  /**
   * Helper to get generic tasks (Water/Chemical)
   * These are usually 1-per-shift site-wide, but we treat them as single tasks.
   */
  async getGenericTask(siteCode: string, logName: string): Promise<TaskItem> {
    const start = startOfDay(new Date()).getTime();
    const end = endOfDay(new Date()).getTime();

    const count = await siteLogCollection
      .query(
        Q.where("site_code", siteCode),
        Q.where("log_name", logName),
        Q.where("created_at", Q.gte(start)),
        Q.where("created_at", Q.lte(end)),
      )
      .fetchCount();

    return {
      id: logName,
      name: logName === "Water" ? "Water Parameters" : `${logName} Log`,
      type: "general",
      isCompleted: count > 0,
      status: count > 0 ? "Completed" : "Open",
    };
  },
};
