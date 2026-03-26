import { eq, and, or, ne, gte, lte, like, inArray, desc, asc, count } from "drizzle-orm";
import { db, areas, siteLogs, chillerReadings, logMaster } from "../database";
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
      const siteAreas = await db
        .select()
        .from(areas)
        .where(eq(areas.site_code, siteCode));
      const siteAreaNames = new Set(siteAreas.map(a => a.asset_name.trim()).filter(n => n && n !== "Unnamed Area"));

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

      const logMasterEntries = await db
        .select()
        .from(logMaster)
        .where(inArray(logMaster.log_name, logVariants));

      const taskMap = new Map<string, TaskItem>();

      // A. CRITICAL LOGIC: Use correct discovery source per log type
      //    - Temp/RH: uses areas table (room/AHU names)
      //    - Water/Chemical: uses logMaster (chemical types / water test tasks)
      //    - Fallback: if primary is empty, try the other source
      if (isTempLog) {
        // Temp RH: use rooms/AHUs from areas (site-scoped)
        if (siteAreaNames.size > 0) {
          siteAreaNames.forEach(name => {
            taskMap.set(name, { id: `area_${name}`, name, type: "area", isCompleted: false, status: "Open" });
          });
        } else {
          // Fallback to LogMaster when areas aren't in local DB yet
          logMasterEntries.forEach(entry => {
            const name = entry.task_name?.trim();
            if (name && name !== "Unnamed Area") {
              taskMap.set(name, { id: `master_${entry.id}`, name, type: "area", isCompleted: false, status: "Open" });
            }
          });
        }
      } else {
        // Water / Chemical: use LogMaster as PRIMARY source (areas are not relevant for these)
        if (logMasterEntries.length > 0) {
          logMasterEntries.forEach(entry => {
            const name = entry.task_name?.trim();
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


      // 3. PROGRESS: Fetch all non-completed logs + today's completed logs.
      // Non-completed (Open/Inprogress/Pending) are shown regardless of date.
      // Completed logs are scoped to the date window to show today's progress.
      const recentLogs = await db
        .select()
        .from(siteLogs)
        .where(
          and(
            eq(siteLogs.site_code, siteCode),
            inArray(siteLogs.log_name, logVariants),
            or(
              ne(siteLogs.status, "Completed"),
              and(
                gte(siteLogs.created_at, start),
                lte(siteLogs.created_at, end)
              )
            )
          )
        )
        .orderBy(desc(siteLogs.created_at));

      const shiftMarker = shift === 'A' ? '1/3' : shift === 'B' ? '2/3' : shift === 'C' ? '3/3' : null;

      const finalTasks: TaskItem[] = [];
      const templateTaskNamesObserved = new Set<string>();

      recentLogs.forEach(log => {
        const name = log.task_name?.trim();
        if (!name) return;

        // Shift filtering
        if (shiftMarker) {
          const isShiftMatch = log.remarks?.includes(shiftMarker);
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
      // All site-scoped template tasks (from areas or logMaster) are valid —
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
      const recentReadings = await db
        .select()
        .from(chillerReadings)
        .where(eq(chillerReadings.site_code, siteCode))
        .orderBy(desc(chillerReadings.created_at))
        .limit(50);

      const uniqueChillers = new Set<string>();
      recentReadings.forEach((r) => {
        if (r.chiller_id) uniqueChillers.add(r.chiller_id);
      });

      if (uniqueChillers.size === 0) {
        // DISCOVERY FALLBACK: Check areas/LogMaster only if we have some local history
        // to avoid showing phantom chillers from other sites
        const fallbackChillers = await db
          .select()
          .from(areas)
          .where(
            and(
              eq(areas.site_code, siteCode),
              like(areas.asset_name, "%Chiller%")
            )
          );

        if (fallbackChillers.length > 0) {
          fallbackChillers.forEach(a => uniqueChillers.add(a.asset_name));
        } else {
          // Final fallback: LogMaster — only use if we have site-specific area data
          // to avoid cross-site inflation
          const siteHasAreasResult = await db
            .select({ value: count() })
            .from(areas)
            .where(eq(areas.site_code, siteCode));
          const siteHasAreas = siteHasAreasResult[0]?.value ?? 0;

          if (siteHasAreas > 0) {
            const masterChillers = await db
              .select()
              .from(logMaster)
              .where(like(logMaster.log_name, "%Chiller%"));
            masterChillers.forEach(m => {
              if (m.task_name) uniqueChillers.add(m.task_name);
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

      const timeframeReadings = await db
        .select()
        .from(chillerReadings)
        .where(
          and(
            eq(chillerReadings.site_code, siteCode),
            or(
              ne(chillerReadings.status, "Completed"),
              and(
                gte(chillerReadings.reading_time, start),
                lte(chillerReadings.reading_time, end)
              )
            )
          )
        )
        .orderBy(desc(chillerReadings.reading_time));

      const finalTasks: TaskItem[] = [];
      const templateChillerIdsObserved = new Set<string>();

      timeframeReadings.forEach((reading) => {
        const chillerId = reading.chiller_id;
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
      const logMasterEntries = await db
        .select()
        .from(logMaster)
        .where(eq(logMaster.log_name, "Chiller Logs"));

      const sequenceMap = new Map<string, number>();
      logMasterEntries.forEach(entry => {
        sequenceMap.set(entry.task_name, entry.sequence_number);
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

    const result = await db
      .select({ value: count() })
      .from(siteLogs)
      .where(
        and(
          eq(siteLogs.site_code, siteCode),
          eq(siteLogs.log_name, logName),
          or(
            ne(siteLogs.status, "Completed"),
            and(
              gte(siteLogs.created_at, start),
              lte(siteLogs.created_at, end)
            )
          )
        )
      );

    const logCount = result[0]?.value ?? 0;

    return {
      id: logName,
      name: logName === "Water" ? "Water Parameters" : `${logName} Log`,
      type: "general",
      isCompleted: logCount > 0,
      status: logCount > 0 ? "Completed" : "Open",
    };
  },
};
