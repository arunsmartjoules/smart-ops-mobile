import { Q } from "@nozbe/watermelondb";
import {
  areaCollection,
  chillerReadingCollection,
  siteLogCollection,
  logMasterCollection,
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
    shift?: string,
    countOnly = false, // When true, don't inflate with template-only tasks that have no DB history
  ): Promise<TaskItem[]> {
    try {
      const start = fromDate ? startOfDay(fromDate).getTime() : startOfDay(new Date()).getTime();
      const end = toDate ? endOfDay(toDate).getTime() : endOfDay(new Date()).getTime();

      logger.info(`Fetching tasks for ${siteCode} / ${logName}`, { shift });

      // 1. DISCOVERY: Find all possible areas for this site
      const siteAreas = await areaCollection.query(Q.where("site_code", siteCode)).fetch();
      const siteAreaNames = new Set(siteAreas.map(a => a.name.trim()).filter(n => n && n !== "Unnamed Area"));
      
      // 2. TEMPLATE: Get LogMaster entry templates using multi-variant matching
      let logVariants = [logName];
      const lowerLog = logName.toLowerCase();
      const isTempLog = lowerLog.includes("temp") || lowerLog.includes("rh");

      if (isTempLog) {
        logVariants = [logName, "Temp & Humidity", "Temperature & Humidity", "Temp RH", "Temp/RH"];
      } else if (lowerLog.includes("water")) {
        logVariants = ["Water", "Water Monitoring", "Water Analysis", "Water Parameters", "Water Logs", "Raw Water Monitoring"];
      } else if (lowerLog.includes("chemical")) {
        logVariants = ["Chemical Dosing", "Chemical Monitoring", "Chemical Analysis", "Chemicals", "Cooling Tower Chemical Dosing"];
      }

      const logMasterEntries = await logMasterCollection.query(
        Q.where("log_name", Q.oneOf(logVariants))
      ).fetch();

      const taskMap = new Map<string, TaskItem>();

      // A. CRITICAL LOGIC: Use correct discovery source per log type
      //    - Temp/RH: uses areaCollection (room/AHU names)
      //    - Water/Chemical: uses logMaster (chemical types / water test tasks)
      //    - Fallback: if primary is empty, try the other source
      if (isTempLog) {
        // Temp RH: use rooms/AHUs from areas (site-scoped)
        if (siteAreaNames.size > 0) {
          siteAreaNames.forEach(name => {
            taskMap.set(name, { id: `area_${name}`, name, type: "area", isCompleted: false, status: "Open" });
          });
        } else if (!countOnly) {
          // Fallback to LogMaster only when NOT counting for dashboard
          // (LogMaster is global — using it for counts causes cross-site inflation)
          logMasterEntries.forEach(entry => {
            const name = entry.taskName?.trim();
            if (name && name !== "Unnamed Area") {
              taskMap.set(name, { id: `master_${entry.id}`, name, type: "area", isCompleted: false, status: "Open" });
            }
          });
        }
      } else {
        // Water / Chemical: use LogMaster as PRIMARY source (areas are not relevant for these)
        if (logMasterEntries.length > 0) {
          logMasterEntries.forEach(entry => {
            const name = entry.taskName?.trim();
            if (name && name !== "Unnamed Area") {
              taskMap.set(name, { id: `master_${entry.id}`, name, type: "area", isCompleted: false, status: "Open" });
            }
          });
        } else if (!countOnly) {
          // Fallback if LogMaster is empty — only when NOT counting for dashboard
          siteAreaNames.forEach(name => {
            taskMap.set(name, { id: `area_${name}`, name, type: "area", isCompleted: false, status: "Open" });
          });
        }
      }


      // 3. PROGRESS: Fetch logs to overlay completion status.
      // We fetch ALL non-completed logs (Open/Inprogress) plus today's logs.
      const recentLogs = await siteLogCollection
        .query(
          Q.where("site_code", siteCode),
          Q.where("log_name", Q.oneOf(logVariants)),
          Q.or(
            Q.where("status", Q.notEq("Completed")),
            Q.and(
              Q.where("created_at", Q.gte(start)),
              Q.where("created_at", Q.lte(end))
            )
          ),
          Q.sortBy("created_at", Q.desc)
        )
        .fetch();

      const shiftMarker = shift === 'A' ? '1/3' : shift === 'B' ? '2/3' : shift === 'C' ? '3/3' : null;

      const finalTasks: TaskItem[] = [];
      const templateTaskNamesObserved = new Set<string>();

      recentLogs.forEach(log => {
        const name = log.taskName?.trim();
        if (!name) return;

        // Shift filtering
        if (shiftMarker) {
          const isShiftMatch = log.remarks?.includes(shiftMarker) || (log as any).shift === shift;
          if (!isShiftMatch) return;
        }

        const isCompleted = log.status?.toLowerCase() === "completed";
        
        if (isCompleted) {
          // For completed logs, update the template entry
          const templateTask = taskMap.get(name);
          if (templateTask) {
            templateTask.isCompleted = true;
            templateTask.status = "Completed";
            templateTask.lastLogId = log.id;
            templateTask.meta = {
              temperature: log.temperature,
              rh: log.rh,
              remarks: log.remarks,
              attachment: log.attachment
            };
          }
        } else {
          // For NON-completed logs, add as individual task items
          finalTasks.push({
            id: log.id, // Use log ID for uniqueness
            name: name,
            type: "area",
            isCompleted: false,
            status: (log.status as any) || "Open",
            lastLogId: log.id,
            meta: {
              temperature: log.temperature,
              rh: log.rh,
              remarks: log.remarks,
              attachment: log.attachment
            }
          });
          // Mark this area as having a pending log, so we don't show the base template
          templateTaskNamesObserved.add(name);
        }
      });

      // Add template tasks that don't have a pending log replica already in finalTasks.
      // All site-scoped template tasks (from areaCollection or logMaster) are valid —
      // untouched ones are pending by definition.
      taskMap.forEach((task, name) => {
        if (!templateTaskNamesObserved.has(name)) {
          finalTasks.push(task);
        }
      });

      logger.info(`Final task count for ${siteCode}: ${finalTasks.length}`, { 
        siteCode, 
        logCount: recentLogs.length, 
        pendingCount: finalTasks.filter(t => !t.isCompleted).length 
      });

      // 5. SORT: Reliable alphabetical sorting.
      return finalTasks.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error: any) {
      logger.error(`Error in rebuilt getLogTasks`, { siteCode, error: error.message });
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
        // DISCOVERY FALLBACK: Check areas/LogMaster only if we have some local history
        // to avoid showing phantom chillers from other sites
        const fallbackChillers = await areaCollection
          .query(Q.where("site_code", siteCode), Q.where("name", Q.like("%Chiller%")))
          .fetch();
        
        if (fallbackChillers.length > 0) {
          fallbackChillers.forEach(a => uniqueChillers.add(a.name));
        } else {
          // Final fallback: LogMaster — only use if we have site-specific area data
          // to avoid cross-site inflation
          const siteHasAreas = await areaCollection
            .query(Q.where("site_code", siteCode))
            .fetchCount();
          if (siteHasAreas > 0) {
            const masterChillers = await logMasterCollection
              .query(Q.where("log_name", Q.like("%Chiller%")))
              .fetch();
            masterChillers.forEach(m => {
              if (m.taskName) uniqueChillers.add(m.taskName);
            });
          }
        }
      }

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
          Q.or(
            Q.where("status", Q.notEq("Completed")),
            Q.and(
              Q.where("reading_time", Q.gte(start)),
              Q.where("reading_time", Q.lte(end))
            )
          ),
          Q.sortBy("reading_time", Q.desc),
        )
        .fetch();

      const finalTasks: TaskItem[] = [];
      const templateChillerIdsObserved = new Set<string>();

      timeframeReadings.forEach((reading) => {
        const chillerId = reading.chillerId;
        if (!chillerId) return;

        let status: "Open" | "Inprogress" | "Completed" = "Open";
        const rawStatus = (reading.status || "").toLowerCase().replace(/\s/g, "");
        if (rawStatus === "completed" || !reading.status) {
          status = "Completed";
        } else if (rawStatus === "inprogress") {
          status = "Inprogress";
        }

        if (status === "Completed") {
          // For completed, we only want one entry per chiller (the latest one)
          if (!templateChillerIdsObserved.has(chillerId)) {
            finalTasks.push({
              id: reading.id,
              name: chillerId,
              type: "asset",
              isCompleted: true,
              status: "Completed",
            });
            templateChillerIdsObserved.add(chillerId);
          }
        } else {
          // For pending, add as individual items
          finalTasks.push({
            id: reading.id,
            name: chillerId,
            type: "asset",
            isCompleted: false,
            status: status,
          });
          templateChillerIdsObserved.add(chillerId);
        }
      });

      // Add standard "Open" tasks for chillers that have no readings today
      uniqueChillers.forEach((chillerId) => {
        if (!templateChillerIdsObserved.has(chillerId)) {
          finalTasks.push({
            id: chillerId,
            name: chillerId,
            type: "asset",
            isCompleted: false,
            status: "Open",
          });
        }
      });

      // Fetch Log Master for sorting chillers
      const logMasterEntries = await logMasterCollection
        .query(Q.where("log_name", "Chiller Logs"))
        .fetch();
      
      const sequenceMap = new Map<string, number>();
      logMasterEntries.forEach(entry => {
        sequenceMap.set(entry.taskName, entry.sequenceNumber);
      });

      return finalTasks.sort((a, b) => {
        const seqA = sequenceMap.get(a.name) ?? 999;
        const seqB = sequenceMap.get(b.name) ?? 999;
        if (seqA !== seqB) return seqA - seqB;
        return a.name.localeCompare(b.name);
      });
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
        Q.or(
          Q.where("status", Q.notEq("Completed")),
          Q.and(
            Q.where("created_at", Q.gte(start)),
            Q.where("created_at", Q.lte(end))
          )
        )
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
