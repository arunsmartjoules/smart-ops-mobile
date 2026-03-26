import { eq, and, desc, asc, ne, gte, lte, inArray, count, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import NetInfo from "@react-native-community/netinfo";
import { startOfDay, endOfDay } from "date-fns";
import { db, siteLogs, chillerReadings, logMaster } from "../database";
import logger from "../utils/logger";
import { authEvents } from "../utils/authEvents";
import { supabase } from "./supabase";
import { fetchWithTimeout } from "../utils/apiHelper";
import { syncManager } from "./SyncManager";
import { SiteConfigService } from "./SiteConfigService";
import type { TaskItem } from "./SiteConfigService";

import { API_BASE_URL } from "../constants/api";

const BACKEND_URL = API_BASE_URL;

/**
 * Normalize log_name from server to the local canonical form.
 * The server (or web app) may store "Temp & Humidity" while mobile uses "Temp RH".
 */
const normalizeLogName = (serverLogName: string): string => {
  if (!serverLogName) return serverLogName;
  const lower = serverLogName.toLowerCase();
  if (lower.includes("temp")) return "Temp RH";
  if (lower.includes("chemical")) return "Chemical Dosing";
  if (lower.includes("chiller")) return "Chiller Logs";
  if (lower.includes("water")) return "Water";
  return serverLogName;
};

// Helper for API requests with auth and retry logic
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  // Get valid token from Supabase session (auto-refreshed by SDK)
  const { data: { session } } = await supabase.auth.getSession();
  let token = session?.access_token ?? null;

  const getHeaders = (t: string | null) => ({
    "Content-Type": "application/json",
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
    ...options.headers,
  });

  try {
    let response = await fetchWithTimeout(`${BACKEND_URL}${endpoint}`, {
      ...options,
      headers: getHeaders(token),
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Silent sign-out: avoid intrusive alerts for token issues
        const result = { success: false, error: "No token provided" };
        authEvents.emitUnauthorized();
        return {
          ok: false,
          status: 401,
          json: async () => result,
        } as Response;
      }
    }

    return response;
  } catch (error) {
    logger.error(`API Fetch Error: ${endpoint}`, {
      module: "SITE_LOG_SERVICE",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

interface ISiteLogService {
  getLogsByType(
    siteCode: string,
    logType: string,
    options?: any,
  ): Promise<any[]>;
  observeLogsByType(siteCode: string, logType: string, options?: any): any;
  saveBulkSiteLogs(logs: any[]): Promise<void>;
  saveSiteLog(data: any): Promise<any>;
  saveChillerReading(data: any): Promise<any>;
  updateChillerReading(id: string, data: Partial<any>): Promise<any>;
  deleteChillerReading(id: string): Promise<void>;
  deleteSiteLog(id: string): Promise<void>;
  getSiteLogById(id: string): Promise<any | null>;
  updateSiteLog(id: string, data: Partial<any>): Promise<any>;
  pullSiteLogs(
    siteCode: string,
    options?: {
      fromDate?: number;
      toDate?: number;
      logName?: string;
      status?: string;
      siteCodes?: string[];
    },
  ): Promise<void>;
  pullChillerReadings(
    siteCode: string,
    options?: { fromDate?: number; toDate?: number },
  ): Promise<void>;
  getSummaryCounts(siteCode: string): Promise<Record<string, number>>;
  getCategoryProgress(
    siteCode: string,
    fromDate?: Date | null,
    toDate?: Date | null,
  ): Promise<Record<string, { total: number; completed: number }>>;
  getOpenCounts(siteCode: string): Promise<Record<string, number>>;
  getUnsyncedCounts(): Promise<number>;
  pullLogMaster(): Promise<void>;
  getLogMaster(logName: string): Promise<any[]>;
}

/**
 * Helper to build log queries and fetch results
 */
const _fetchLogs = async (
  siteCode: string,
  logType: string,
  options: any = {},
) => {
  if (logType === "Chiller Logs") {
    const conditions: any[] = [];
    if (siteCode && siteCode !== "all") {
      conditions.push(eq(chillerReadings.site_code, siteCode));
    }
    if (options.fromDate) {
      conditions.push(gte(chillerReadings.created_at, options.fromDate));
    }
    if (options.toDate) {
      conditions.push(lte(chillerReadings.created_at, options.toDate));
    }
    return db
      .select()
      .from(chillerReadings)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0])
      .orderBy(desc(chillerReadings.created_at));
  } else {
    const conditions: any[] = [];
    if (siteCode && siteCode !== "all") {
      conditions.push(eq(siteLogs.site_code, siteCode));
    }
    conditions.push(eq(siteLogs.log_name, logType));
    if (options.fromDate) {
      conditions.push(gte(siteLogs.created_at, options.fromDate));
    }
    if (options.toDate) {
      conditions.push(lte(siteLogs.created_at, options.toDate));
    }
    return db
      .select()
      .from(siteLogs)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0])
      .orderBy(desc(siteLogs.created_at));
  }
};

export const SiteLogService: ISiteLogService = {
  /**
   * Fetch logs for a site by type
   */
  async getLogsByType(siteCode: string, logType: string, options: any = {}) {
    try {
      return await _fetchLogs(siteCode, logType, options);
    } catch (error: any) {
      logger.error("Error fetching logs by type", {
        module: "SITE_LOG_SERVICE",
        siteCode,
        logType,
        error: error.message,
      });
      return [];
    }
  },

  /**
   * Observe logs for a site by type (Live Updates)
   * NOTE: With PowerSync/Drizzle there is no built-in .observe().
   * Callers should use PowerSync's watch API or useLiveQuery hook instead.
   * This returns the current snapshot as a fallback.
   */
  observeLogsByType(siteCode: string, logType: string, options: any = {}) {
    // Return a promise of the current data; callers should migrate to
    // PowerSync's reactive watch/useLiveQuery for live updates.
    return _fetchLogs(siteCode, logType, options);
  },

  /**
   * Save multiple logs at once (from bulk form)
   */
  async saveBulkSiteLogs(logs: any[]) {
    const now = Date.now();
    for (const data of logs) {
      // Check if data.id is a potential local record ID
      if (data.id && data.id.length > 10) {
        const existing = await db
          .select()
          .from(siteLogs)
          .where(eq(siteLogs.id, data.id))
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(siteLogs)
            .set({
              temperature: data.temperature ?? existing[0].temperature,
              rh: data.rh ?? existing[0].rh,
              tds: data.tds ?? existing[0].tds,
              ph: data.ph ?? existing[0].ph,
              hardness: data.hardness ?? existing[0].hardness,
              chemical_dosing: data.chemicalDosing ?? existing[0].chemical_dosing,
              remarks: data.remarks ?? existing[0].remarks,
              signature: data.signature ?? existing[0].signature,
              attachment: data.attachment ?? existing[0].attachment,
              status: data.status ?? existing[0].status,
              entry_time: data.entryTime ?? existing[0].entry_time,
              end_time: data.endTime ?? existing[0].end_time,
              updated_at: now,
            })
            .where(eq(siteLogs.id, data.id));
          continue;
        }
      }

      await db.insert(siteLogs).values({
        id: uuidv4(),
        site_code: data.siteCode,
        executor_id: data.executorId,
        assigned_to: data.assignedTo || null,
        log_name: data.logName,
        task_name: data.taskName || null,
        temperature: data.temperature || null,
        rh: data.rh || null,
        tds: data.tds || null,
        ph: data.ph || null,
        hardness: data.hardness || null,
        chemical_dosing: data.chemicalDosing || null,
        remarks: data.remarks || null,
        entry_time: data.entryTime || null,
        end_time: data.endTime || null,
        signature: data.signature || null,
        attachment: data.attachment || null,
        status: data.status || null,
        created_at: now,
        updated_at: now,
      });
    }
    // Trigger background sync
    syncManager.triggerSync("manual").catch(() => {});
  },

  /**
   * Save a single site log
   */
  async saveSiteLog(data: any) {
    const now = Date.now();
    const id = uuidv4();
    await db.insert(siteLogs).values({
      id,
      site_code: data.siteCode,
      executor_id: data.executorId,
      assigned_to: data.assignedTo || null,
      log_name: data.logName,
      task_name: data.taskName || null,
      temperature: data.temperature || null,
      rh: data.rh || null,
      tds: data.tds || null,
      ph: data.ph || null,
      hardness: data.hardness || null,
      chemical_dosing: data.chemicalDosing || null,
      remarks: data.remarks || null,
      entry_time: data.entryTime || null,
      end_time: data.endTime || null,
      signature: data.signature || null,
      attachment: data.attachment || null,
      status: data.status || null,
      created_at: now,
      updated_at: now,
    });

    syncManager.triggerSync("manual").catch(() => {});

    const [record] = await db
      .select()
      .from(siteLogs)
      .where(eq(siteLogs.id, id))
      .limit(1);
    return record;
  },

  /**
   * Save a chiller reading
   */
  async saveChillerReading(data: any): Promise<any> {
    const now = Date.now();
    const id = uuidv4();
    await db.insert(chillerReadings).values({
      id,
      log_id: data.logId || id,
      site_code: data.siteCode,
      executor_id: data.executorId,
      chiller_id: data.chillerId || null,
      equipment_id: data.equipmentId || null,
      asset_name: data.assetName || null,
      assigned_to: data.assignedTo || null,
      asset_type: data.assetType || null,
      date_shift: data.dateShift || null,
      reading_time: data.readingTime || null,
      start_datetime: data.startDatetime || null,
      end_datetime: data.endDatetime || null,
      condenser_inlet_temp: data.condenserInletTemp || null,
      condenser_outlet_temp: data.condenserOutletTemp || null,
      evaporator_inlet_temp: data.evaporatorInletTemp || null,
      evaporator_outlet_temp: data.evaporatorOutletTemp || null,
      compressor_suction_temp: data.compressorSuctionTemp || null,
      motor_temperature: data.motorTemperature || null,
      saturated_condenser_temp: data.saturatedCondenserTemp || null,
      saturated_suction_temp: data.saturatedSuctionTemp || null,
      set_point_celsius: data.setPointCelsius || null,
      discharge_pressure: data.dischargePressure || null,
      main_suction_pressure: data.mainSuctionPressure || null,
      oil_pressure: data.oilPressure || null,
      oil_pressure_difference: data.oilPressureDifference || null,
      condenser_inlet_pressure: data.condenserInletPressure || null,
      condenser_outlet_pressure: data.condenserOutletPressure || null,
      evaporator_inlet_pressure: data.evaporatorInletPressure || null,
      evaporator_outlet_pressure: data.evaporatorOutletPressure || null,
      compressor_load_percentage: data.compressorLoadPercentage || null,
      inline_btu_meter: data.inlineBtuMeter || null,
      remarks: data.remarks || null,
      signature_text: data.signature || null,
      attachments: data.attachments || null,
      status: data.status || "Completed",
      created_at: now,
      updated_at: now,
    });

    syncManager.triggerSync("manual").catch(() => {});

    const [record] = await db
      .select()
      .from(chillerReadings)
      .where(eq(chillerReadings.id, id))
      .limit(1);
    return record;
  },

  /**
   * Update an existing chiller reading
   */
  async updateChillerReading(
    id: string,
    data: Partial<any>,
  ): Promise<any> {
    const updateFields: Record<string, any> = { updated_at: Date.now() };

    if (data.chillerId !== undefined) updateFields.chiller_id = data.chillerId;
    if (data.equipmentId !== undefined) updateFields.equipment_id = data.equipmentId;
    if (data.assetName !== undefined) updateFields.asset_name = data.assetName;
    if (data.assetType !== undefined) updateFields.asset_type = data.assetType;
    if (data.dateShift !== undefined) updateFields.date_shift = data.dateShift;
    if (data.assignedTo !== undefined) updateFields.assigned_to = data.assignedTo;
    if (data.readingTime !== undefined) updateFields.reading_time = data.readingTime;
    if (data.startDatetime !== undefined) updateFields.start_datetime = data.startDatetime;
    if (data.endDatetime !== undefined) updateFields.end_datetime = data.endDatetime;
    if (data.condenserInletTemp !== undefined) updateFields.condenser_inlet_temp = data.condenserInletTemp;
    if (data.condenserOutletTemp !== undefined) updateFields.condenser_outlet_temp = data.condenserOutletTemp;
    if (data.evaporatorInletTemp !== undefined) updateFields.evaporator_inlet_temp = data.evaporatorInletTemp;
    if (data.evaporatorOutletTemp !== undefined) updateFields.evaporator_outlet_temp = data.evaporatorOutletTemp;
    if (data.saturatedCondenserTemp !== undefined) updateFields.saturated_condenser_temp = data.saturatedCondenserTemp;
    if (data.saturatedSuctionTemp !== undefined) updateFields.saturated_suction_temp = data.saturatedSuctionTemp;
    if (data.compressorSuctionTemp !== undefined) updateFields.compressor_suction_temp = data.compressorSuctionTemp;
    if (data.motorTemperature !== undefined) updateFields.motor_temperature = data.motorTemperature;
    if (data.setPointCelsius !== undefined) updateFields.set_point_celsius = data.setPointCelsius;
    if (data.dischargePressure !== undefined) updateFields.discharge_pressure = data.dischargePressure;
    if (data.mainSuctionPressure !== undefined) updateFields.main_suction_pressure = data.mainSuctionPressure;
    if (data.oilPressure !== undefined) updateFields.oil_pressure = data.oilPressure;
    if (data.oilPressureDifference !== undefined) updateFields.oil_pressure_difference = data.oilPressureDifference;
    if (data.condenserInletPressure !== undefined) updateFields.condenser_inlet_pressure = data.condenserInletPressure;
    if (data.condenserOutletPressure !== undefined) updateFields.condenser_outlet_pressure = data.condenserOutletPressure;
    if (data.evaporatorInletPressure !== undefined) updateFields.evaporator_inlet_pressure = data.evaporatorInletPressure;
    if (data.evaporatorOutletPressure !== undefined) updateFields.evaporator_outlet_pressure = data.evaporatorOutletPressure;
    if (data.compressorLoadPercentage !== undefined) updateFields.compressor_load_percentage = data.compressorLoadPercentage;
    if (data.inlineBtuMeter !== undefined) updateFields.inline_btu_meter = data.inlineBtuMeter;
    if (data.remarks !== undefined) updateFields.remarks = data.remarks;
    if (data.signatureText !== undefined) updateFields.signature_text = data.signatureText;
    if (data.attachments !== undefined) updateFields.attachments = data.attachments;
    if (data.status !== undefined) updateFields.status = data.status;

    await db
      .update(chillerReadings)
      .set(updateFields)
      .where(eq(chillerReadings.id, id));

    syncManager.triggerSync("manual").catch(() => {});

    const [record] = await db
      .select()
      .from(chillerReadings)
      .where(eq(chillerReadings.id, id))
      .limit(1);
    return record;
  },

  /**
   * Delete a chiller reading
   */
  async deleteChillerReading(id: string): Promise<void> {
    try {
      await db
        .delete(chillerReadings)
        .where(eq(chillerReadings.id, id));
      syncManager.triggerSync("manual").catch(() => {});
    } catch (error: any) {
      logger.error("Error deleting chiller reading", {
        module: "SITE_LOG_SERVICE",
        error: error.message,
      });
      throw error;
    }
  },

  /**
   * Delete a site log
   */
  async deleteSiteLog(id: string): Promise<void> {
    try {
      await db
        .delete(siteLogs)
        .where(eq(siteLogs.id, id));
      syncManager.triggerSync("manual").catch(() => {});
    } catch (error: any) {
      logger.error("Error deleting site log", {
        module: "SITE_LOG_SERVICE",
        error: error.message,
      });
      throw error;
    }
  },

  /**
   * Get a single site log by ID
   */
  async getSiteLogById(id: string): Promise<any | null> {
    try {
      const [record] = await db
        .select()
        .from(siteLogs)
        .where(eq(siteLogs.id, id))
        .limit(1);
      return record || null;
    } catch (error: any) {
      logger.error("Error fetching site log by ID", {
        module: "SITE_LOG_SERVICE",
        id,
        error: error.message,
      });
      return null;
    }
  },

  /**
   * Update an existing site log
   */
  async updateSiteLog(id: string, data: Partial<any>): Promise<any> {
    try {
      const updateFields: Record<string, any> = { updated_at: Date.now() };

      if (data.temperature !== undefined) updateFields.temperature = data.temperature;
      if (data.rh !== undefined) updateFields.rh = data.rh;
      if (data.tds !== undefined) updateFields.tds = data.tds;
      if (data.ph !== undefined) updateFields.ph = data.ph;
      if (data.hardness !== undefined) updateFields.hardness = data.hardness;
      if (data.chemicalDosing !== undefined) updateFields.chemical_dosing = data.chemicalDosing;
      if (data.remarks !== undefined) updateFields.remarks = data.remarks;
      if (data.signature !== undefined) updateFields.signature = data.signature;
      if (data.attachment !== undefined) updateFields.attachment = data.attachment;
      if (data.status !== undefined) updateFields.status = data.status;
      if (data.assignedTo !== undefined) updateFields.assigned_to = data.assignedTo;
      if (data.endTime !== undefined) updateFields.end_time = data.endTime;

      await db
        .update(siteLogs)
        .set(updateFields)
        .where(eq(siteLogs.id, id));

      syncManager.triggerSync("manual").catch(() => {});

      const [record] = await db
        .select()
        .from(siteLogs)
        .where(eq(siteLogs.id, id))
        .limit(1);
      return record;
    } catch (error: any) {
      logger.error("Error updating site log", {
        module: "SITE_LOG_SERVICE",
        id,
        error: error.message,
      });
      throw error;
    }
  },

  /**
   * Pull logs from server
   */
  async pullSiteLogs(siteCode: string, options: any = {}) {
    try {
      let finalSiteCode = siteCode;

      // If "all" is requested but we have specific site codes,
      // check if we can just pull a specific one
      if (finalSiteCode === "all" && options.siteCodes && options.siteCodes.length === 1) {
        finalSiteCode = options.siteCodes[0];
      }

      let url = `/api/site-logs/site/${finalSiteCode}?limit=500`;
      if (options.logName)
        url += `&logName=${encodeURIComponent(options.logName)}`;
      if (options.fromDate) url += `&fromDate=${options.fromDate}`;
      if (options.toDate) url += `&toDate=${options.toDate}`;
      if (options.status) url += `&status=${options.status}`;
      if (options.siteCodes && Array.isArray(options.siteCodes)) {
        url += `&site_codes=${options.siteCodes.join(",")}`;
      }

      const response = await apiFetch(url);
      if (response.ok) {
        const result = await response.json();
        const serverLogs = result.data || [];
        const serverIds = serverLogs.map((l: any) => l.id);

        // 1. STALE LOG CLEANUP: If we're pulling pending logs, any local log that has
        // matching site(s)/logName but is NOT in the server response should be marked Completed.
        if (options.status === "pending") {
          const normalizedName = normalizeLogName(options.logName);
          const conditions: any[] = [
            eq(siteLogs.log_name, normalizedName),
            ne(siteLogs.status, "Completed"),
          ];

          if (options.siteCodes && options.siteCodes.length > 0) {
            conditions.push(inArray(siteLogs.site_code, options.siteCodes));
          } else {
            conditions.push(eq(siteLogs.site_code, siteCode));
          }

          const allLocalPending = await db
            .select()
            .from(siteLogs)
            .where(and(...conditions));

          const serverIdSet = new Set(serverIds);
          const staleLogs = allLocalPending.filter(
            (l) => !serverIdSet.has(l.id),
          );

          if (staleLogs.length > 0) {
            const now = Date.now();
            for (const stale of staleLogs) {
              await db
                .update(siteLogs)
                .set({ status: "Completed", updated_at: now })
                .where(eq(siteLogs.id, stale.id));
            }
            logger.info(`Marked ${staleLogs.length} stale logs as Completed`);
          }
        }

        if (serverLogs.length === 0) return;

        // 2. Fetch all local records matching server IDs in this batch (Single Query)
        const existingLocalRecords = await db
          .select()
          .from(siteLogs)
          .where(inArray(siteLogs.id, serverIds));

        const localMap = new Map(
          existingLocalRecords.map((r) => [r.id, r]),
        );

        const now = Date.now();
        for (const serverLog of serverLogs) {
          const localRecord = localMap.get(serverLog.id);
          const normalizedLogName = normalizeLogName(serverLog.log_name);

          if (localRecord) {
            await db
              .update(siteLogs)
              .set({
                site_code: serverLog.site_code,
                executor_id: serverLog.executor_id,
                assigned_to: serverLog.assigned_to || null,
                log_name: normalizedLogName,
                task_name: serverLog.task_name || null,
                temperature: parseFloat(serverLog.temperature),
                rh: parseFloat(serverLog.rh),
                tds: parseFloat(serverLog.tds),
                ph: parseFloat(serverLog.ph),
                hardness: parseFloat(serverLog.hardness),
                chemical_dosing: serverLog.chemical_dosing,
                remarks: serverLog.remarks,
                signature: serverLog.signature || localRecord.signature,
                status: serverLog.status,
                created_at: serverLog.created_at
                  ? new Date(serverLog.created_at).getTime()
                  : localRecord.created_at,
                updated_at: now,
              })
              .where(eq(siteLogs.id, serverLog.id));
          } else {
            await db.insert(siteLogs).values({
              id: serverLog.id,
              site_code: serverLog.site_code,
              executor_id: serverLog.executor_id,
              assigned_to: serverLog.assigned_to || null,
              log_name: normalizedLogName,
              task_name: serverLog.task_name || null,
              temperature: parseFloat(serverLog.temperature),
              rh: parseFloat(serverLog.rh),
              tds: parseFloat(serverLog.tds),
              ph: parseFloat(serverLog.ph),
              hardness: parseFloat(serverLog.hardness),
              chemical_dosing: serverLog.chemical_dosing,
              remarks: serverLog.remarks,
              signature: serverLog.signature,
              status: serverLog.status,
              created_at: serverLog.created_at
                ? new Date(serverLog.created_at).getTime()
                : now,
              updated_at: now,
            });
          }
        }
      }
    } catch (error: any) {
      logger.error("Error pulling site logs", {
        module: "SITE_LOG_SERVICE",
        error: error.message,
      });
    }
  },

  /**
   * Pull chiller readings from server
   */
  async pullChillerReadings(siteCode: string, options: any = {}) {
    try {
      let url = `/api/chiller-readings/site/${siteCode}?limit=100`;
      if (options.fromDate) url += `&fromDate=${options.fromDate}`;
      if (options.toDate) url += `&toDate=${options.toDate}`;

      const response = await apiFetch(url);

      if (response.ok) {
        const result = await response.json();
        const serverReadingIds = new Set(result.data.map((r: any) => r.id));

        // Find synced records to delete if they no longer exist on the server
        const allLocal = await db
          .select()
          .from(chillerReadings)
          .where(eq(chillerReadings.site_code, siteCode));

        for (const localLog of allLocal) {
          if (localLog.id && !serverReadingIds.has(localLog.id)) {
            const logTime = localLog.reading_time;
            let inRange = true;
            if (options.fromDate && logTime && logTime < options.fromDate)
              inRange = false;
            if (options.toDate && logTime && logTime > options.toDate)
              inRange = false;

            if (inRange) {
              await db
                .delete(chillerReadings)
                .where(eq(chillerReadings.id, localLog.id));
            }
          }
        }

        const now = Date.now();
        for (const serverLog of result.data) {
          const localRecords = await db
            .select()
            .from(chillerReadings)
            .where(eq(chillerReadings.id, serverLog.id))
            .limit(1);

          const executorId = serverLog.executor_id;
          const readingTime = serverLog.reading_time
            ? new Date(serverLog.reading_time).getTime()
            : serverLog.reading_time || null;
          const startDateTime = serverLog.start_datetime
            ? new Date(serverLog.start_datetime).getTime()
            : serverLog.start_datetime || null;
          const endDateTime = serverLog.end_datetime
            ? new Date(serverLog.end_datetime).getTime()
            : serverLog.end_datetime || null;

          if (localRecords.length > 0) {
            await db
              .update(chillerReadings)
              .set({
                site_code:
                  serverLog.site_code || serverLog.siteCode || localRecords[0].site_code,
                chiller_id: serverLog.chiller_id,
                equipment_id: serverLog.equipment_id,
                asset_name: serverLog.asset_name,
                assigned_to: serverLog.assigned_to,
                asset_type: serverLog.asset_type,
                executor_id: executorId || "unknown",
                reading_time: readingTime,
                start_datetime: startDateTime,
                end_datetime: endDateTime,
                condenser_inlet_temp:
                  parseFloat(serverLog.condenser_inlet_temp) || null,
                condenser_outlet_temp:
                  parseFloat(serverLog.condenser_outlet_temp) || null,
                evaporator_inlet_temp:
                  parseFloat(serverLog.evaporator_inlet_temp) || null,
                evaporator_outlet_temp:
                  parseFloat(serverLog.evaporator_outlet_temp) || null,
                compressor_suction_temp:
                  parseFloat(serverLog.compressor_suction_temp) || null,
                motor_temperature:
                  parseFloat(serverLog.motor_temperature) || null,
                saturated_condenser_temp:
                  parseFloat(serverLog.saturated_condenser_temp) || null,
                saturated_suction_temp:
                  parseFloat(serverLog.saturated_suction_temp) || null,
                set_point_celsius:
                  parseFloat(serverLog.set_point_celsius) || null,
                discharge_pressure:
                  parseFloat(serverLog.discharge_pressure) || null,
                main_suction_pressure:
                  parseFloat(serverLog.main_suction_pressure) || null,
                oil_pressure: parseFloat(serverLog.oil_pressure) || null,
                oil_pressure_difference:
                  parseFloat(serverLog.oil_pressure_difference) || null,
                condenser_inlet_pressure:
                  parseFloat(serverLog.condenser_inlet_pressure) || null,
                condenser_outlet_pressure:
                  parseFloat(serverLog.condenser_outlet_pressure) || null,
                evaporator_inlet_pressure:
                  parseFloat(serverLog.evaporator_inlet_pressure) || null,
                evaporator_outlet_pressure:
                  parseFloat(serverLog.evaporator_outlet_pressure) || null,
                compressor_load_percentage:
                  parseFloat(serverLog.compressor_load_percentage) || null,
                inline_btu_meter:
                  parseFloat(serverLog.inline_btu_meter) || null,
                remarks: serverLog.remarks,
                signature_text: serverLog.signature_text,
                attachments: serverLog.attachments,
                status: serverLog.status || "Completed",
                updated_at: now,
              })
              .where(eq(chillerReadings.id, serverLog.id));
          } else {
            const sCode =
              serverLog.site_code || serverLog.siteCode || siteCode;
            await db.insert(chillerReadings).values({
              id: serverLog.id,
              log_id: serverLog.log_id || serverLog.id,
              site_code: sCode,
              chiller_id: serverLog.chiller_id,
              equipment_id: serverLog.equipment_id,
              asset_name: serverLog.asset_name,
              assigned_to: serverLog.assigned_to,
              asset_type: serverLog.asset_type,
              executor_id: executorId || "unknown",
              date_shift: serverLog.date_shift,
              reading_time: readingTime,
              start_datetime: startDateTime,
              end_datetime: endDateTime,
              condenser_inlet_temp:
                parseFloat(serverLog.condenser_inlet_temp) || null,
              condenser_outlet_temp:
                parseFloat(serverLog.condenser_outlet_temp) || null,
              evaporator_inlet_temp:
                parseFloat(serverLog.evaporator_inlet_temp) || null,
              evaporator_outlet_temp:
                parseFloat(serverLog.evaporator_outlet_temp) || null,
              compressor_suction_temp:
                parseFloat(serverLog.compressor_suction_temp) || null,
              motor_temperature:
                parseFloat(serverLog.motor_temperature) || null,
              saturated_condenser_temp:
                parseFloat(serverLog.saturated_condenser_temp) || null,
              saturated_suction_temp:
                parseFloat(serverLog.saturated_suction_temp) || null,
              set_point_celsius:
                parseFloat(serverLog.set_point_celsius) || null,
              discharge_pressure:
                parseFloat(serverLog.discharge_pressure) || null,
              main_suction_pressure:
                parseFloat(serverLog.main_suction_pressure) || null,
              oil_pressure: parseFloat(serverLog.oil_pressure) || null,
              oil_pressure_difference:
                parseFloat(serverLog.oil_pressure_difference) || null,
              condenser_inlet_pressure:
                parseFloat(serverLog.condenser_inlet_pressure) || null,
              condenser_outlet_pressure:
                parseFloat(serverLog.condenser_outlet_pressure) || null,
              evaporator_inlet_pressure:
                parseFloat(serverLog.evaporator_inlet_pressure) || null,
              evaporator_outlet_pressure:
                parseFloat(serverLog.evaporator_outlet_pressure) || null,
              compressor_load_percentage:
                parseFloat(serverLog.compressor_load_percentage) || null,
              inline_btu_meter:
                parseFloat(serverLog.inline_btu_meter) || null,
              remarks: serverLog.remarks,
              signature_text: serverLog.signature_text,
              status: serverLog.status || "Completed",
              created_at: now,
              updated_at: now,
            });
          }
        }
      }
    } catch (error: any) {
      logger.error("Error pulling chiller readings", {
        module: "SITE_LOG_SERVICE",
        error: error.message,
      });
    }
  },

  /**
   * Get summary counts for dashboard
   */
  async getSummaryCounts(siteCode: string): Promise<Record<string, number>> {
    try {
      const counts: Record<string, number> = {};
      const logTypes = ["Temp RH", "Water", "Chemical Dosing"];

      for (const type of logTypes) {
        const [result] = await db
          .select({ count: count() })
          .from(siteLogs)
          .where(
            and(
              eq(siteLogs.site_code, siteCode),
              eq(siteLogs.log_name, type),
            ),
          );
        counts[type] = result?.count ?? 0;
      }

      const [chillerResult] = await db
        .select({ count: count() })
        .from(chillerReadings)
        .where(eq(chillerReadings.site_code, siteCode));
      counts["Chiller Logs"] = chillerResult?.count ?? 0;

      return counts;
    } catch (error: any) {
      logger.error("Error getting summary counts", {
        module: "SITE_LOG_SERVICE",
        error: error.message,
      });
      return {};
    }
  },

  /**
   * Get progress counts (Pending vs Total) for dashboard
   */
  async getCategoryProgress(
    siteCode: string,
    fromDate?: Date | null,
    toDate?: Date | null,
  ): Promise<Record<string, { total: number; completed: number }>> {
    try {
      const SiteConfigService =
        require("./SiteConfigService").SiteConfigService;

      const types = ["Temp RH", "Chiller Logs", "Water", "Chemical Dosing"];
      const result: Record<string, { total: number; completed: number }> = {};

      for (const type of types) {
        let tasks: TaskItem[] = [];
        if (type === "Chiller Logs") {
          tasks = await SiteConfigService.getChillerTasks(siteCode, fromDate, toDate);
        } else {
          tasks = await SiteConfigService.getLogTasks(siteCode, type, fromDate, toDate, undefined, true);
        }

        const completed = tasks.filter((t: TaskItem) => t.isCompleted).length;
        result[type] = { total: tasks.length, completed };
      }

      return result;
    } catch (error: any) {
      logger.error("Error getting category progress", {
        module: "SITE_LOG_SERVICE",
        error: error.message,
      });
      throw error;
    }
  },

  /**
   * Get non-Completed counts per log type from backend (source of truth).
   * Falls back to local Drizzle DB if offline.
   * Returns { "Temp RH": n, "Water": n, "Chemical Dosing": n }
   */
  async getOpenCounts(siteCode: string): Promise<Record<string, number>> {
    const logTypes = ["Temp RH", "Water", "Chemical Dosing"];
    const counts: Record<string, number> = {
      "Temp RH": 0,
      "Water": 0,
      "Chemical Dosing": 0,
    };

    try {
      // PROACTIVE OFFLINE CHECK: skip API entirely if no connection
      const netState = await NetInfo.fetch();
      if (netState.isConnected === false) {
        throw new Error("Offline"); // Jump to catch block for local counts
      }

      // Fetch from backend in parallel -- status=pending means != Completed on the server
      await Promise.all(
        logTypes.map(async (logName) => {
          try {
            const url = `/api/site-logs/site/${siteCode}?log_name=${encodeURIComponent(logName)}&status=pending&limit=1`;
            const response = await apiFetch(url);
            if (response.ok) {
              const result = await response.json();
              counts[logName] = result.pagination?.total ?? 0;
            } else {
              throw new Error("non-ok response");
            }
          } catch {
            // Offline fallback: count local non-completed records
            const [result] = await db
              .select({ count: count() })
              .from(siteLogs)
              .where(
                and(
                  eq(siteLogs.site_code, siteCode),
                  eq(siteLogs.log_name, logName),
                  ne(siteLogs.status, "Completed"),
                ),
              );
            counts[logName] = result?.count ?? 0;
          }
        }),
      );
    } catch (error: any) {
      logger.error("Error getting open counts", {
        module: "SITE_LOG_SERVICE",
        error: error.message,
      });
    }

    return counts;
  },

  /**
   * Get total unsynced count across all logs.
   * With PowerSync, unsynced rows are tracked in the ps_crud table.
   * This returns the count of pending local mutations.
   */
  async getUnsyncedCounts(): Promise<number> {
    try {
      // PowerSync tracks unsynced mutations in the internal ps_crud table.
      // Use a raw SQL query to count pending writes.
      const result = await db.all<{ count: number }>(
        sql`SELECT COUNT(*) as count FROM ps_crud`,
      );
      return result[0]?.count ?? 0;
    } catch (error: any) {
      logger.error("Error getting unsynced counts", {
        module: "SITE_LOG_SERVICE",
        error: error.message,
      });
      return 0;
    }
  },

  /**
   * Pull Log Master from server
   */
  async pullLogMaster(): Promise<void> {
    try {
      const response = await apiFetch("/api/log-master");
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to pull log master");
      }

      const serverLogs = result.data || [];
      const now = Date.now();

      for (const serverLog of serverLogs) {
        const localRecords = await db
          .select()
          .from(logMaster)
          .where(eq(logMaster.id, serverLog.id))
          .limit(1);

        if (localRecords.length > 0) {
          await db
            .update(logMaster)
            .set({
              task_name: serverLog.task_name,
              log_name: serverLog.log_name,
              sequence_number: serverLog.sequence_number || 0,
              log_id: serverLog.log_id,
              dlr: serverLog.dlr,
              dbr: serverLog.dbr,
              nlt: serverLog.nlt,
              nmt: serverLog.nmt,
              updated_at: now,
            })
            .where(eq(logMaster.id, serverLog.id));
        } else {
          await db.insert(logMaster).values({
            id: serverLog.id,
            task_name: serverLog.task_name,
            log_name: serverLog.log_name,
            sequence_number: serverLog.sequence_number || 0,
            log_id: serverLog.log_id,
            dlr: serverLog.dlr,
            dbr: serverLog.dbr,
            nlt: serverLog.nlt,
            nmt: serverLog.nmt,
            created_at: now,
            updated_at: now,
          });
        }
      }

      logger.info("Log Master synchronized", {
        module: "SITE_LOG_SERVICE",
        count: serverLogs.length,
      });
    } catch (error: any) {
      logger.error("Error pulling log master", {
        module: "SITE_LOG_SERVICE",
        error: error.message,
      });
    }
  },

  /**
   * Get sorted log master entries for a category
   */
  async getLogMaster(logName: string) {
    try {
      const normalized = normalizeLogName(logName);
      return await db
        .select()
        .from(logMaster)
        .where(eq(logMaster.log_name, normalized))
        .orderBy(asc(logMaster.sequence_number));
    } catch (error) {
      return [];
    }
  },
};

export default SiteLogService;
