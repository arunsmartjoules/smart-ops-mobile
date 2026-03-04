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
  async getLogTasks(siteCode: string, logName: string): Promise<TaskItem[]> {
    try {
      const cacheKey = `${siteCode}_${logName}`;
      const now = Date.now();
      let uniqueTaskNames: string[] = [];

      // 1. Fetch distinct Task Names (Areas) from recent logs (with caching)
      if (taskCache[cacheKey] && now - lastCacheTime[cacheKey] < CACHE_TTL) {
        uniqueTaskNames = taskCache[cacheKey];
      } else {
        const recentLogs = await siteLogCollection
          .query(
            Q.where("site_code", siteCode),
            Q.where("log_name", logName),
            Q.sortBy("created_at", Q.desc),
            Q.take(500),
          )
          .fetch();

        const uniqueSet = new Set<string>();
        recentLogs.forEach((l) => {
          if (l.taskName) uniqueSet.add(l.taskName);
        });
        uniqueTaskNames = Array.from(uniqueSet);

        // Update cache
        taskCache[cacheKey] = uniqueTaskNames;
        lastCacheTime[cacheKey] = now;
      }

      if (uniqueTaskNames.length === 0) {
        return [];
      }

      // 2. Fetch logs for TODAY + any Inprogress logs from the last 24h
      const nowTs = Date.now();
      const start = startOfDay(new Date()).getTime();
      const end = endOfDay(new Date()).getTime();
      const twentyFourHoursAgo = nowTs - 24 * 60 * 60 * 1000;

      const candidates = await siteLogCollection
        .query(
          Q.where("site_code", siteCode),
          Q.where("log_name", logName),
          Q.where("created_at", Q.gte(twentyFourHoursAgo)),
          Q.sortBy("created_at", Q.desc),
        )
        .fetch();

      // 3. Map to Task Items
      const tasks: TaskItem[] = uniqueTaskNames.map((taskName) => {
        // Find the latest log for this task
        const latestLog = candidates.find((l) => l.taskName === taskName);

        // Determine status based on the log
        let status: "Open" | "Inprogress" | "Completed" = "Open";
        let meta: any = null;

        if (latestLog) {
          const rawStatus = (latestLog.status || "")
            .toLowerCase()
            .replace(/\s/g, "");

          const isToday = latestLog.createdAt?.getTime() >= start && latestLog.createdAt?.getTime() <= end;

          if (rawStatus === "inprogress") {
            status = "Inprogress";
          } else if (rawStatus === "completed" || !latestLog.status) {
            // Only count as completed if it was done TODAY
            status = isToday ? "Completed" : "Open";
          }

          // If in progress, include log data for pre-filling
          if (status === "Inprogress") {
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
  async getChillerTasks(siteCode: string): Promise<TaskItem[]> {
    try {
      // 1. Fetch distinct Chiller IDs from historical logs
      // WatermelonDB doesn't support 'distinct' easily.
      // We will fetch the last 100 chiller readings to guess the active chillers.
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

      // Default if none found (bootstrap)
      if (uniqueChillers.size === 0) {
        // Return empty if no chillers found
        return [];
      }

      // 2. Check today's completion
      const start = startOfDay(new Date()).getTime();
      const end = endOfDay(new Date()).getTime();

      const todaysReadings = await chillerReadingCollection
        .query(
          Q.where("site_code", siteCode),
          Q.where("created_at", Q.gte(start)),
          Q.where("created_at", Q.lte(end)),
          Q.sortBy("created_at", Q.desc),
        )
        .fetch();

      const tasks: TaskItem[] = Array.from(uniqueChillers).map((chillerId) => {
        const reading = todaysReadings.find((r) => r.chillerId === chillerId);

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
