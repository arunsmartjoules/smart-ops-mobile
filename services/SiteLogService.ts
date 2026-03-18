import { Q } from "@nozbe/watermelondb";
import { startOfDay, endOfDay } from "date-fns";
import {
  database,
  siteLogCollection,
  chillerReadingCollection,
  logMasterCollection,
} from "../database";
import SiteLog from "../database/models/SiteLog";
import ChillerReading from "../database/models/ChillerReading";
import logger from "../utils/logger";
import { addToDeletionQueue } from "../utils/syncSiteLogStorage";
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
  saveSiteLog(data: any): Promise<SiteLog>;
  saveChillerReading(data: any): Promise<ChillerReading>;
  updateChillerReading(id: string, data: Partial<any>): Promise<ChillerReading>;
  deleteChillerReading(id: string): Promise<void>;
  deleteSiteLog(id: string): Promise<void>;
  getSiteLogById(id: string): Promise<SiteLog | null>;
  updateSiteLog(id: string, data: Partial<any>): Promise<SiteLog>;
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
 * Helper to build log queries
 */
const _buildLogQuery = (
  siteCode: string,
  logType: string,
  options: any = {},
) => {
  let collection =
    logType === "Chiller Logs" ? chillerReadingCollection : siteLogCollection;
  let conditions: any[] = [];

  if (siteCode && siteCode !== "all") {
    conditions.push(Q.where("site_code", siteCode));
  }

  if (logType !== "Chiller Logs") {
    conditions.push(Q.where("log_name", logType));
  }

  if (options.fromDate) {
    conditions.push(Q.where("created_at", Q.gte(options.fromDate)));
  }
  if (options.toDate) {
    conditions.push(Q.where("created_at", Q.lte(options.toDate)));
  }

  return collection.query(...conditions, Q.sortBy("created_at", Q.desc));
};

export const SiteLogService: ISiteLogService = {
  /**
   * Fetch logs for a site by type
   */
  async getLogsByType(siteCode: string, logType: string, options: any = {}) {
    try {
      const query = _buildLogQuery(siteCode, logType, options);
      return await query.fetch();
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
   */
  observeLogsByType(siteCode: string, logType: string, options: any = {}) {
    const query = _buildLogQuery(siteCode, logType, options);
    return query.observe();
  },

  /**
   * Save multiple logs at once (from bulk form)
   */
  async saveBulkSiteLogs(logs: any[]) {
    await database.write(async () => {
      const batch: any[] = [];
      
      for (const data of logs) {
        let existing: any = null;
        
        // Check if data.id is a potential local record ID
        if (data.id && data.id.length > 10) { 
          try {
            existing = await siteLogCollection.find(data.id);
          } catch (e) {
            // Not found or invalid ID, will treat as create
          }
        }

        if (existing) {
          batch.push(
            existing.prepareUpdate((record: any) => {
              record.temperature = data.temperature || record.temperature;
              record.rh = data.rh || record.rh;
              record.tds = data.tds || record.tds;
              record.ph = data.ph || record.ph;
              record.hardness = data.hardness || record.hardness;
              record.chemicalDosing = data.chemicalDosing || record.chemicalDosing;
              record.remarks = data.remarks || record.remarks;
              record.signature = data.signature || record.signature;
              record.attachment = data.attachment || record.attachment;
              record.status = data.status || record.status;
              record.entryTime = data.entryTime || record.entryTime;
              record.endTime = data.endTime || record.endTime;
              record.isSynced = false;
            })
          );
        } else {
          batch.push(
            siteLogCollection.prepareCreate((record: any) => {
              record.siteCode = data.siteCode;
              record.executorId = data.executorId;
              record.assignedTo = data.assignedTo || null;
              record.logName = data.logName;
              record.taskName = data.taskName || null;
              record.temperature = data.temperature || null;
              record.rh = data.rh || null;
              record.tds = data.tds || null;
              record.ph = data.ph || null;
              record.hardness = data.hardness || null;
              record.chemicalDosing = data.chemicalDosing || null;
              record.remarks = data.remarks || null;
              record.entryTime = data.entryTime || null;
              record.endTime = data.endTime || null;
              record.signature = data.signature || null;
              record.attachment = data.attachment || null;
              record.status = data.status || null;
              record.isSynced = false;
              record.createdAt = new Date();
            })
          );
        }
      }
      await database.batch(batch);
    });
    // Trigger background sync
    syncManager.triggerSync("manual").catch(() => {});
  },

  /**
   * Save a single site log
   */
  async saveSiteLog(data: any) {
    return await database
      .write(async () => {
        return await siteLogCollection.create((record) => {
          record.siteCode = data.siteCode;
          record.executorId = data.executorId;
          record.assignedTo = data.assignedTo || null;
          record.logName = data.logName;
          record.taskName = data.taskName || null;
          record.temperature = data.temperature || null;
          record.rh = data.rh || null;
          record.tds = data.tds || null;
          record.ph = data.ph || null;
          record.hardness = data.hardness || null;
          record.chemicalDosing = data.chemicalDosing || null;
          record.remarks = data.remarks || null;
          record.entryTime = data.entryTime || null;
          record.endTime = data.endTime || null;
          record.signature = data.signature || null;
          record.attachment = data.attachment || null;
          record.status = data.status || null;
          record.isSynced = false;
          record.createdAt = new Date();
        });
      })
      .then(async (record) => {
        syncManager.triggerSync("manual").catch(() => {});
        return record;
      });
  },

  /**
   * Save a chiller reading
   */
  async saveChillerReading(data: any): Promise<ChillerReading> {
    return await database
      .write(async () => {
        return await chillerReadingCollection.create((record) => {
          record.siteCode = data.siteCode;
          record.executorId = data.executorId;
          record.chillerId = data.chillerId || null;
          record.equipmentId = data.equipmentId || null;
          record.assetName = data.assetName || null;
          record.assignedTo = data.assignedTo || null;
          record.assetType = data.assetType || null;
          record.dateShift = data.dateShift || null;
          record.reading_time = data.readingTime || null;
          record.start_datetime = data.startDatetime || null;
          record.end_datetime = data.endDatetime || null;
          record.condenserInletTemp = data.condenserInletTemp || null;
          record.condenserOutletTemp = data.condenserOutletTemp || null;
          record.evaporatorInletTemp = data.evaporatorInletTemp || null;
          record.evaporatorOutletTemp = data.evaporatorOutletTemp || null;
          record.compressorSuctionTemp = data.compressorSuctionTemp || null;
          record.motorTemperature = data.motorTemperature || null;
          record.saturatedCondenserTemp = data.saturatedCondenserTemp || null;
          record.saturatedSuctionTemp = data.saturatedSuctionTemp || null;
          record.setPointCelsius = data.setPointCelsius || null;
          record.dischargePressure = data.dischargePressure || null;
          record.mainSuctionPressure = data.mainSuctionPressure || null;
          record.oilPressure = data.oilPressure || null;
          record.oilPressureDifference = data.oilPressureDifference || null;
          record.condenserInletPressure = data.condenserInletPressure || null;
          record.condenserOutletPressure = data.condenserOutletPressure || null;
          record.evaporatorInletPressure = data.evaporatorInletPressure || null;
          record.evaporatorOutletPressure =
            data.evaporatorOutletPressure || null;
          record.compressorLoadPercentage =
            data.compressorLoadPercentage || null;
          record.inlineBtuMeter = data.inlineBtuMeter || null;
          record.remarks = data.remarks || null;
          record.signatureText = data.signature || null;
          record.attachments = data.attachments || null;
          record.status = data.status || "Completed";
          record.isSynced = false;
        });
      })
      .then(async (record) => {
        syncManager.triggerSync("manual").catch(() => {});
        return record;
      });
  },

  /**
   * Update an existing chiller reading
   */
  async updateChillerReading(
    id: string,
    data: Partial<any>,
  ): Promise<ChillerReading> {
    return await database
      .write(async () => {
        const record = await chillerReadingCollection.find(id);
        return await record.update((r) => {
          if (data.chillerId !== undefined) r.chillerId = data.chillerId;
          if (data.equipmentId !== undefined) r.equipmentId = data.equipmentId;
          if (data.assetName !== undefined) r.assetName = data.assetName;
          if (data.assetType !== undefined) r.assetType = data.assetType;
          if (data.dateShift !== undefined) r.dateShift = data.dateShift;
          if (data.assignedTo !== undefined) r.assignedTo = data.assignedTo;
          if (data.readingTime !== undefined) r.reading_time = data.readingTime;
          if (data.startDatetime !== undefined)
            r.start_datetime = data.startDatetime;
          if (data.endDatetime !== undefined) r.end_datetime = data.endDatetime;
          if (data.condenserInletTemp !== undefined)
            r.condenserInletTemp = data.condenserInletTemp;
          if (data.condenserOutletTemp !== undefined)
            r.condenserOutletTemp = data.condenserOutletTemp;
          if (data.evaporatorInletTemp !== undefined)
            r.evaporatorInletTemp = data.evaporatorInletTemp;
          if (data.evaporatorOutletTemp !== undefined)
            r.evaporatorOutletTemp = data.evaporatorOutletTemp;
          if (data.saturatedCondenserTemp !== undefined)
            r.saturatedCondenserTemp = data.saturatedCondenserTemp;
          if (data.saturatedSuctionTemp !== undefined)
            r.saturatedSuctionTemp = data.saturatedSuctionTemp;
          if (data.compressorSuctionTemp !== undefined)
            r.compressorSuctionTemp = data.compressorSuctionTemp;
          if (data.motorTemperature !== undefined)
            r.motorTemperature = data.motorTemperature;
          if (data.setPointCelsius !== undefined)
            r.setPointCelsius = data.setPointCelsius;
          if (data.dischargePressure !== undefined)
            r.dischargePressure = data.dischargePressure;
          if (data.mainSuctionPressure !== undefined)
            r.mainSuctionPressure = data.mainSuctionPressure;
          if (data.oilPressure !== undefined) r.oilPressure = data.oilPressure;
          if (data.oilPressureDifference !== undefined)
            r.oilPressureDifference = data.oilPressureDifference;
          if (data.condenserInletPressure !== undefined)
            r.condenserInletPressure = data.condenserInletPressure;
          if (data.condenserOutletPressure !== undefined)
            r.condenserOutletPressure = data.condenserOutletPressure;
          if (data.evaporatorInletPressure !== undefined)
            r.evaporatorInletPressure = data.evaporatorInletPressure;
          if (data.evaporatorOutletPressure !== undefined)
            r.evaporatorOutletPressure = data.evaporatorOutletPressure;
          if (data.compressorLoadPercentage !== undefined)
            r.compressorLoadPercentage = data.compressorLoadPercentage;
          if (data.inlineBtuMeter !== undefined)
            r.inlineBtuMeter = data.inlineBtuMeter;
          if (data.remarks !== undefined) r.remarks = data.remarks;
          if (data.signatureText !== undefined)
            r.signatureText = data.signatureText;
          if (data.attachments !== undefined) r.attachments = data.attachments;
          if (data.status !== undefined) r.status = data.status;
          r.isSynced = false;
        });
      })
      .then(async (record) => {
        syncManager.triggerSync("manual").catch(() => {});
        return record;
      });
  },

  /**
   * Delete a chiller reading
   */
  async deleteChillerReading(id: string): Promise<void> {
    try {
      await database.write(async () => {
        const record = await chillerReadingCollection.find(id);
        if (record.serverId) {
          await addToDeletionQueue("chiller", record.serverId);
        }
        await record.markAsDeleted();
      });
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
      await database.write(async () => {
        const record = await siteLogCollection.find(id);
        if (record.serverId) {
          await addToDeletionQueue("site_log", record.serverId);
        }
        await record.markAsDeleted();
      });
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
  async getSiteLogById(id: string): Promise<SiteLog | null> {
    try {
      const record = await siteLogCollection.find(id);
      return record;
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
  async updateSiteLog(id: string, data: Partial<any>): Promise<SiteLog> {
    try {
      return await database.write(async () => {
        const record = await siteLogCollection.find(id);
        await record.update((r) => {
          if (data.temperature !== undefined) r.temperature = data.temperature;
          if (data.rh !== undefined) r.rh = data.rh;
          if (data.tds !== undefined) r.tds = data.tds;
          if (data.ph !== undefined) r.ph = data.ph;
          if (data.hardness !== undefined) r.hardness = data.hardness;
          if (data.chemicalDosing !== undefined)
            r.chemicalDosing = data.chemicalDosing;
          if (data.remarks !== undefined) r.remarks = data.remarks;
          if (data.signature !== undefined) r.signature = data.signature;
          if (data.attachment !== undefined) r.attachment = data.attachment;
          if (data.status !== undefined) r.status = data.status;
          if (data.assignedTo !== undefined) r.assignedTo = data.assignedTo;
          if (data.endTime !== undefined) r.endTime = data.endTime;
          r.isSynced = false;
        });
        return record;
      });
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

        // 1. STALE LOG CLEANUP: If we're pulling pending logs, any local log that has a serverId 
        // and matches the site(s)/logName but is NOT in the server response should be marked Completed.
        if (options.status === "pending") {
          const siteCodeQuery =
            options.siteCodes && options.siteCodes.length > 0
              ? Q.where("site_code", Q.oneOf(options.siteCodes))
              : Q.where("site_code", siteCode);

          const allLocalPending = await siteLogCollection
            .query(
              siteCodeQuery,
              Q.where("log_name", normalizeLogName(options.logName)),
              Q.where("status", Q.notEq("Completed")),
              Q.where("server_id", Q.notEq(null)),
            )
            .fetch();

          const serverIdSet = new Set(serverIds);
          const staleLogs = allLocalPending.filter(
            (l) => !serverIdSet.has(l.serverId),
          );

          if (staleLogs.length > 0) {
            await database.write(async () => {
              for (const stale of staleLogs) {
                await stale.update((record) => {
                  record.status = "Completed";
                  record.isSynced = true;
                });
              }
            });
            logger.info(`Marked ${staleLogs.length} stale logs as Completed`);
          }
        }

        if (serverLogs.length === 0) return;

        // 2. Fetch all local records matching server IDs in this batch (Single Query)
        const existingLocalRecords = await siteLogCollection
          .query(Q.where("server_id", Q.oneOf(serverIds)))
          .fetch();

        const localMap = new Map(
          existingLocalRecords.map((r: any) => [r.serverId, r]),
        );

        await database.write(async () => {
          for (const serverLog of serverLogs) {
            const localRecord = localMap.get(serverLog.id);
            const normalizedLogName = normalizeLogName(serverLog.log_name);

            if (localRecord) {
              await localRecord.update((record: any) => {
                record.siteCode = serverLog.site_code;
                record.executorId = serverLog.executor_id;
                record.assignedTo = serverLog.assigned_to || null;
                record.logName = normalizedLogName;
                record.taskName = serverLog.task_name || null;
                record.temperature = parseFloat(serverLog.temperature);
                record.rh = parseFloat(serverLog.rh);
                record.tds = parseFloat(serverLog.tds);
                record.ph = parseFloat(serverLog.ph);
                record.hardness = parseFloat(serverLog.hardness);
                record.chemicalDosing = serverLog.chemical_dosing;
                record.remarks = serverLog.remarks;
                if (serverLog.signature) {
                  record.signature = serverLog.signature;
                }
                record.status = serverLog.status;
                record.isSynced = true;
                if (serverLog.created_at) {
                  record.createdAt = new Date(serverLog.created_at);
                }
              });
            } else {
              await siteLogCollection.create((record: any) => {
                record.serverId = serverLog.id;
                record.siteCode = serverLog.site_code;
                record.executorId = serverLog.executor_id;
                record.assignedTo = serverLog.assigned_to || null;
                record.logName = normalizedLogName;
                record.taskName = serverLog.task_name || null;
                record.temperature = parseFloat(serverLog.temperature);
                record.rh = parseFloat(serverLog.rh);
                record.tds = parseFloat(serverLog.tds);
                record.ph = parseFloat(serverLog.ph);
                record.hardness = parseFloat(serverLog.hardness);
                record.chemicalDosing = serverLog.chemical_dosing;
                record.remarks = serverLog.remarks;
                record.signature = serverLog.signature;
                record.status = serverLog.status;
                record.isSynced = true;
                if (serverLog.created_at) {
                  record.createdAt = new Date(serverLog.created_at);
                }
              });
            }
          }
        });
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

        await database.write(async () => {
          // Find records to delete? (only if they were already synced)
          const allLocalSynced = await chillerReadingCollection
            .query(Q.where("site_code", siteCode), Q.where("is_synced", true))
            .fetch();

          for (const localLog of allLocalSynced) {
            if (localLog.serverId && !serverReadingIds.has(localLog.serverId)) {
              const logTime = localLog.reading_time;
              let inRange = true;
              if (options.fromDate && logTime && logTime < options.fromDate)
                inRange = false;
              if (options.toDate && logTime && logTime > options.toDate)
                inRange = false;

              if (inRange) {
                await localLog.destroyPermanently();
              }
            }
          }

          for (const serverLog of result.data) {
            const localRecords = await chillerReadingCollection
              .query(Q.where("server_id", serverLog.id))
              .fetch();

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
              await localRecords[0].update((record) => {
                record.siteCode =
                  serverLog.site_code || serverLog.siteCode || record.siteCode;
                record.chillerId = serverLog.chiller_id;
                record.equipmentId = serverLog.equipment_id;
                record.assetName = serverLog.asset_name;
                record.assignedTo = serverLog.assigned_to;
                record.assetType = serverLog.asset_type;
                record.executorId = executorId || "unknown";
                record.reading_time = readingTime;
                record.start_datetime = startDateTime;
                record.end_datetime = endDateTime;
                record.condenserInletTemp =
                  parseFloat(serverLog.condenser_inlet_temp) || null;
                record.condenserOutletTemp =
                  parseFloat(serverLog.condenser_outlet_temp) || null;
                record.evaporatorInletTemp =
                  parseFloat(serverLog.evaporator_inlet_temp) || null;
                record.evaporatorOutletTemp =
                  parseFloat(serverLog.evaporator_outlet_temp) || null;
                record.compressorSuctionTemp =
                  parseFloat(serverLog.compressor_suction_temp) || null;
                record.motorTemperature =
                  parseFloat(serverLog.motor_temperature) || null;
                record.saturatedCondenserTemp =
                  parseFloat(serverLog.saturated_condenser_temp) || null;
                record.saturatedSuctionTemp =
                  parseFloat(serverLog.saturated_suction_temp) || null;
                record.setPointCelsius =
                  parseFloat(serverLog.set_point_celsius) || null;
                record.dischargePressure =
                  parseFloat(serverLog.discharge_pressure) || null;
                record.mainSuctionPressure =
                  parseFloat(serverLog.main_suction_pressure) || null;
                record.oilPressure = parseFloat(serverLog.oil_pressure) || null;
                record.oilPressureDifference =
                  parseFloat(serverLog.oil_pressure_difference) || null;
                record.condenserInletPressure =
                  parseFloat(serverLog.condenser_inlet_pressure) || null;
                record.condenserOutletPressure =
                  parseFloat(serverLog.condenser_outlet_pressure) || null;
                record.evaporatorInletPressure =
                  parseFloat(serverLog.evaporator_inlet_pressure) || null;
                record.evaporatorOutletPressure =
                  parseFloat(serverLog.evaporator_outlet_pressure) || null;
                record.compressorLoadPercentage =
                  parseFloat(serverLog.compressor_load_percentage) || null;
                record.inlineBtuMeter =
                  parseFloat(serverLog.inline_btu_meter) || null;
                record.remarks = serverLog.remarks;
                record.signatureText = serverLog.signature_text;
                record.attachments = serverLog.attachments;
                record.status = serverLog.status || "Completed";
                record.isSynced = true;
              });
            } else {
              await chillerReadingCollection.create((record) => {
                const sCode =
                  serverLog.site_code || serverLog.siteCode || siteCode;
                record.serverId = serverLog.id;
                record.siteCode = sCode;
                record.chillerId = serverLog.chiller_id;
                record.equipmentId = serverLog.equipment_id;
                record.assetName = serverLog.asset_name;
                record.assignedTo = serverLog.assigned_to;
                record.assetType = serverLog.asset_type;
                record.executorId = executorId || "unknown";
                record.dateShift = serverLog.date_shift;
                record.reading_time = readingTime;
                record.start_datetime = startDateTime;
                record.end_datetime = endDateTime;
                record.condenserInletTemp =
                  parseFloat(serverLog.condenser_inlet_temp) || null;
                record.condenserOutletTemp =
                  parseFloat(serverLog.condenser_outlet_temp) || null;
                record.evaporatorInletTemp =
                  parseFloat(serverLog.evaporator_inlet_temp) || null;
                record.evaporatorOutletTemp =
                  parseFloat(serverLog.evaporator_outlet_temp) || null;
                record.compressorSuctionTemp =
                  parseFloat(serverLog.compressor_suction_temp) || null;
                record.motorTemperature =
                  parseFloat(serverLog.motor_temperature) || null;
                record.saturatedCondenserTemp =
                  parseFloat(serverLog.saturated_condenser_temp) || null;
                record.saturatedSuctionTemp =
                  parseFloat(serverLog.saturated_suction_temp) || null;
                record.setPointCelsius =
                  parseFloat(serverLog.set_point_celsius) || null;
                record.dischargePressure =
                  parseFloat(serverLog.discharge_pressure) || null;
                record.mainSuctionPressure =
                  parseFloat(serverLog.main_suction_pressure) || null;
                record.oilPressure = parseFloat(serverLog.oil_pressure) || null;
                record.oilPressureDifference =
                  parseFloat(serverLog.oil_pressure_difference) || null;
                record.condenserInletPressure =
                  parseFloat(serverLog.condenser_inlet_pressure) || null;
                record.condenserOutletPressure =
                  parseFloat(serverLog.condenser_outlet_pressure) || null;
                record.evaporatorInletPressure =
                  parseFloat(serverLog.evaporator_inlet_pressure) || null;
                record.evaporatorOutletPressure =
                  parseFloat(serverLog.evaporator_outlet_pressure) || null;
                record.compressorLoadPercentage =
                  parseFloat(serverLog.compressor_load_percentage) || null;
                record.inlineBtuMeter =
                  parseFloat(serverLog.inline_btu_meter) || null;
                record.remarks = serverLog.remarks;
                record.signatureText = serverLog.signature_text;
                record.status = serverLog.status || "Completed";
                record.isSynced = true;
              });
            }
          }
        });
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
        counts[type] = await siteLogCollection
          .query(Q.where("site_code", siteCode), Q.where("log_name", type))
          .fetchCount();
      }

      counts["Chiller Logs"] = await chillerReadingCollection
        .query(Q.where("site_code", siteCode))
        .fetchCount();

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

        const completed = tasks.filter((t) => t.isCompleted).length;
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
   * Get non-Completed counts per log type directly from the backend.
   * Uses a dedicated fetch that won't trigger global sign-out on failure.
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
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? null;
      if (!token) return counts;

      await Promise.all(
        logTypes.map(async (logName) => {
          try {
            // status=Pending → backend returns all rows where status != 'Completed'
            const url = `${BACKEND_URL}/api/site-logs/site/${siteCode}?log_name=${encodeURIComponent(logName)}&status=Pending&limit=1`;
            const response = await fetchWithTimeout(url, {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            });
            if (response.ok) {
              const result = await response.json();
              counts[logName] = result.pagination?.total ?? result.data?.length ?? 0;
            }
          } catch {
            // ignore per-type errors, fall back to 0
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
   * Get total unsynced count across all logs
   */
  async getUnsyncedCounts(): Promise<number> {
    try {
      const siteLogs = await siteLogCollection
        .query(Q.where("is_synced", false))
        .fetchCount();
      const chillerReadings = await chillerReadingCollection
        .query(Q.where("is_synced", false))
        .fetchCount();
      return siteLogs + chillerReadings;
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

      await database.write(async () => {
        for (const serverLog of serverLogs) {
          const localRecords = await logMasterCollection
            .query(Q.where("server_id", serverLog.id))
            .fetch();

          if (localRecords.length > 0) {
            await localRecords[0].update((record) => {
              record.taskName = serverLog.task_name;
              record.logName = serverLog.log_name;
              record.sequenceNumber = serverLog.sequence_number || 0;
              record.logId = serverLog.log_id;
              record.dlr = serverLog.dlr;
              record.dbr = serverLog.dbr;
              record.nlt = serverLog.nlt;
              record.nmt = serverLog.nmt;
            });
          } else {
            await logMasterCollection.create((record) => {
              record.serverId = serverLog.id;
              record.taskName = serverLog.task_name;
              record.logName = serverLog.log_name;
              record.sequenceNumber = serverLog.sequence_number || 0;
              record.logId = serverLog.log_id;
              record.dlr = serverLog.dlr;
              record.dbr = serverLog.dbr;
              record.nlt = serverLog.nlt;
              record.nmt = serverLog.nmt;
            });
          }
        }
      });

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
      return await logMasterCollection
        .query(
          Q.where("log_name", normalized),
          Q.sortBy("sequence_number", Q.asc)
        )
        .fetch();
    } catch (error) {
      return [];
    }
  },
};

export default SiteLogService;
