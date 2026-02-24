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
  lastLogId?: string;
  meta?: any; // For storing extra data like chiller_id or site_code
}

export const SiteConfigService = {
  /**
   * Get all Tasks (Areas) for a Site and Log Type.
   * Derived from historical logs.
   */
  async getLogTasks(siteCode: string, logName: string): Promise<TaskItem[]> {
    try {
      // 1. Fetch distinct Task Names (Areas) from recent logs
      // We look back to find what "Areas" or "Points" exist for this log type.
      const recentLogs = await siteLogCollection
        .query(
          Q.where("site_code", siteCode),
          Q.where("log_name", logName),
          Q.sortBy("created_at", Q.desc),
          Q.take(500), // increased to capture more history if needed
        )
        .fetch();

      const uniqueTasks = new Set<string>();
      recentLogs.forEach((l) => {
        if (l.taskName) uniqueTasks.add(l.taskName);
      });

      if (uniqueTasks.size === 0) {
        return [];
      }

      // 2. Fetch logs for TODAY to check completion status
      const start = startOfDay(new Date()).getTime();
      const end = endOfDay(new Date()).getTime();

      const todaysLogs = await siteLogCollection
        .query(
          Q.where("site_code", siteCode),
          Q.where("log_name", logName),
          Q.where("created_at", Q.gte(start)),
          Q.where("created_at", Q.lte(end)),
        )
        .fetch();

      // 3. Map to Task Items
      const tasks: TaskItem[] = Array.from(uniqueTasks).map((taskName) => {
        // Check if completed today
        // We consider it completed if there is a log with status='completed' OR just exists (legacy)
        // Ideally we check l.status === 'completed'
        // But for backward compat, existence is enough if status is missing.
        const completedLog = todaysLogs.find((l) => l.taskName === taskName);
        const isCompleted =
          !!completedLog &&
          (completedLog.status === "completed" || !completedLog.status);

        // Return existing log ID if needed
        const lastLogId = completedLog?.id;

        return {
          id: taskName,
          name: taskName,
          type: "area",
          isCompleted,
          lastLogId,
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
        )
        .fetch();

      const tasks: TaskItem[] = Array.from(uniqueChillers).map((chillerId) => {
        const isCompleted = todaysReadings.some(
          (r) => r.chillerId === chillerId,
        );
        return {
          id: chillerId,
          name: chillerId, // e.g. "CH-01"
          type: "asset",
          isCompleted,
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
      name: `${logName} Log`,
      type: "general",
      isCompleted: count > 0,
    };
  },
};
