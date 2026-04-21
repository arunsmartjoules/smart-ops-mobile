import {
  eq,
  and,
  desc,
  asc,
  ne,
  gte,
  lte,
  lt,
  inArray,
  count,
  sql,
} from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import NetInfo from "@react-native-community/netinfo";
import { startOfDay, endOfDay, addDays } from "date-fns";
import { db, siteLogs, chillerReadings, logMaster } from "../database";
import logger from "../utils/logger";
import { authEvents } from "../utils/authEvents";
import { apiFetch as centralApiFetch } from "../utils/apiHelper";
import { SiteConfigService } from "./SiteConfigService";
import type { TaskItem } from "./SiteConfigService";
import cacheManager from "./CacheManager";
import { AttachmentQueueService } from "./AttachmentQueueService";
import { getISTDateString } from "./AttendanceService";

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

const LOCAL_URI_PREFIXES = [
  "file://",
  "content://",
  "ph://",
  "asset-library://",
];
const isLocalUri = (uri?: string | null) =>
  !!uri && LOCAL_URI_PREFIXES.some((p) => uri.startsWith(p));

/**
 * If the given URI is a local file, queue it for deferred upload and
 * return the persistent local URI. Otherwise return the URI as-is.
 */
const queueAttachmentIfLocal = async (
  uri: string | null | undefined,
  folder: string,
  entityType: "site_log" | "chiller_reading",
  entityId: string,
  field: string,
): Promise<string | null> => {
  if (!uri) return null;
  if (!isLocalUri(uri)) return uri;
  return AttachmentQueueService.queueAttachment({
    localUri: uri,
    bucketName: "jouleops-attachments",
    remotePath: `${folder}/${entityId}_${Date.now()}.jpg`,
    relatedEntityType: entityType,
    relatedEntityId: entityId,
    relatedField: field,
  });
};

// Helper for API requests with auth and retry logic
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  try {
    let response = await centralApiFetch(`${BACKEND_URL}${endpoint}`, options);

    if (!response.ok && response.status === 401) {
      try {
        const errData = (await response.clone().json()) as { error?: string };
        if (__DEV__) {
          logger.debug("SiteLog API 401", {
            module: "SITE_LOG_SERVICE",
            endpoint,
            error: errData?.error,
          });
        }
      } catch {
        // ignore parse errors
      }
      authEvents.emitUnauthorized();
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
  prefetchPendingForCategory(siteCode: string, logName: string): Promise<void>;
  getTodayChillerReadingCount(siteCode: string, targetDate?: Date): Promise<number>;
  getTodayChillerCompletedReadingCount(
    siteCode: string,
    targetDate?: Date,
  ): Promise<number>;
  getTodayChillerDailyPendingCount(
    siteCode: string,
    targetDate?: Date,
    goal?: number,
  ): Promise<number>;
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
  runCleanup(): Promise<void>;
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

    if (options.scheduledDate) {
      conditions.push(eq(siteLogs.scheduled_date, options.scheduledDate));
    } else if (options.fromDate || options.toDate) {
      const toDateStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);
      if (options.fromDate) {
        conditions.push(
          gte(siteLogs.scheduled_date, toDateStr(options.fromDate)),
        );
      }
      if (options.toDate) {
        conditions.push(
          lte(siteLogs.scheduled_date, toDateStr(options.toDate)),
        );
      }
    }

    return db
      .select()
      .from(siteLogs)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0])
      .orderBy(desc(siteLogs.scheduled_date), desc(siteLogs.created_at))
      .then((rows) => {
        logger.debug("_fetchLogs raw query result", {
          module: "SITE_LOG_SERVICE",
          siteCode,
          logType,
          conditionsCount: conditions.length,
          rowCount: rows.length,
          firstRow: rows[0]
            ? {
                id: rows[0].id,
                log_name: (rows[0] as any).log_name,
                site_code: (rows[0] as any).site_code,
                scheduled_date: (rows[0] as any).scheduled_date,
              }
            : null,
        });
        return rows;
      });
  }
};

export const SiteLogService: ISiteLogService = {
  /**
   * Fetch logs for a site by type
   */
  async getLogsByType(siteCode: string, logType: string, options: any = {}) {
    try {
      const result = await _fetchLogs(siteCode, logType, options);
      logger.debug("getLogsByType result", {
        module: "SITE_LOG_SERVICE",
        siteCode,
        logType,
        count: result.length,
        options,
      });
      return result;
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
   * Returns the current snapshot from local SQLite.
   * For reactive updates, callers should re-query on data change events.
   */
  observeLogsByType(siteCode: string, logType: string, options: any = {}) {
    return _fetchLogs(siteCode, logType, options);
  },

  /**
   * Save multiple logs at once
   */
  async saveBulkSiteLogs(logs: any[]) {
    if (!logs || logs.length === 0) return;
    const now = Date.now();
    const nowLocal = new Date();
    const formattedToday = nowLocal.toISOString().split("T")[0];

    try {
      // 1. Prepare records for batch insert
      const recordsToInsert = await Promise.all(
        logs.map(async (data) => {
          const id = data.id || uuidv4();
          const scheduledDate =
            data.scheduled_date || data.scheduledDate || formattedToday;

          // Queue attachment if local
          const attachment = await queueAttachmentIfLocal(
            data.attachment,
            "site-logs",
            "site_log",
            id,
            "attachment",
          );

          const signature = await queueAttachmentIfLocal(
            data.signature,
            "site-signatures",
            "site_log",
            id,
            "signature",
          );

          return {
            id,
            site_code: data.site_code || data.siteCode,
            executor_id: data.executor_id || data.executorId,
            assigned_to: data.assigned_to || data.assignedTo || null,
            log_name: data.log_name || data.logName,
            task_name: data.task_name || data.taskName || null,
            temperature: data.temperature || null,
            rh: data.rh || null,
            tds: data.tds || null,
            ph: data.ph || null,
            hardness: data.hardness || null,
            chemical_dosing:
              data.chemical_dosing || data.chemicalDosing || null,
            remarks: data.remarks || null,
            main_remarks: data.main_remarks || data.mainRemarks || null,
            signature: signature || null,
            attachment,
            status: data.status || "Completed",
            scheduled_date: scheduledDate,
            created_at: now,
            updated_at: now,
          };
        }),
      );

      // Determine which IDs already exist (pre-generated scheduled logs) so we
      // sync them as UPDATE instead of CREATE on the backend.
      const ids = recordsToInsert.map((r) => r.id).filter(Boolean);
      const existingRows = ids.length
        ? await db
            .select({ id: siteLogs.id })
            .from(siteLogs)
            .where(inArray(siteLogs.id, ids))
        : [];
      const existingIdSet = new Set(existingRows.map((r) => r.id));

      // 2. Batch Insert
      await db
        .insert(siteLogs)
        .values(recordsToInsert as any)
        .onConflictDoUpdate({
          target: [siteLogs.id],
          set: {
            temperature: sql`excluded.temperature`,
            rh: sql`excluded.rh`,
            tds: sql`excluded.tds`,
            ph: sql`excluded.ph`,
            hardness: sql`excluded.hardness`,
            chemical_dosing: sql`excluded.chemical_dosing`,
            remarks: sql`excluded.remarks`,
            main_remarks: sql`excluded.main_remarks`,
            signature: sql`excluded.signature`,
            attachment: sql`excluded.attachment`,
            status: sql`excluded.status`,
            updated_at: now,
          },
        });

      // 3. Enqueue for Sync
      for (const record of recordsToInsert) {
        const isExisting = existingIdSet.has(record.id);
        await cacheManager.enqueue({
          entity_type: isExisting ? "site_log_update" : "site_log_create",
          operation: isExisting ? "update" : "create",
          payload: {
            ...record,
            scheduled_date: record.scheduled_date,
          },
        });
      }

      // 4. Best-effort immediate API sync (online path).
      // Existing scheduled rows should be PUT, new rows should be POST.
      for (const record of recordsToInsert) {
        const isExisting = existingIdSet.has(record.id);
        try {
          if (isExisting) {
            const response = await apiFetch(`/api/site-logs/${record.id}`, {
              method: "PUT",
              body: JSON.stringify({
                temperature: record.temperature,
                rh: record.rh,
                tds: record.tds,
                ph: record.ph,
                hardness: record.hardness,
                chemical_dosing: record.chemical_dosing,
                remarks: record.remarks,
                main_remarks: record.main_remarks,
                signature: record.signature,
                attachment: record.attachment,
                status: record.status,
                assigned_to: record.assigned_to,
                scheduled_date: record.scheduled_date,
              }),
            });
            if (!response.ok) {
              throw new Error(`PUT /api/site-logs/${record.id} failed: ${response.status}`);
            }
          } else {
            const response = await apiFetch("/api/site-logs", {
              method: "POST",
              body: JSON.stringify(record),
            });
            if (!response.ok) {
              throw new Error(`POST /api/site-logs failed: ${response.status}`);
            }
          }
        } catch {
          logger.debug("saveBulkSiteLogs: immediate API sync failed, queued for retry", {
            module: "SITE_LOG_SERVICE",
            id: record.id,
            mode: isExisting ? "update" : "create",
          });
        }
      }

      logger.info(`Bulk saved ${recordsToInsert.length} logs`, {
        module: "SITE_LOG_SERVICE",
        siteCode: recordsToInsert[0]?.site_code,
      });
    } catch (e: any) {
      logger.error("saveBulkSiteLogs failed", {
        module: "SITE_LOG_SERVICE",
        error: e.message,
      });
      throw e;
    }
  },

  /**
   * Save a single site log
   */
  async saveSiteLog(data: any) {
    const now = Date.now();
    const id = uuidv4();
    // Default scheduled_date to today (YYYY-MM-DD) in local time if not provided
    const nowLocal = new Date();
    const year = nowLocal.getFullYear();
    const month = String(nowLocal.getMonth() + 1).padStart(2, "0");
    const day = String(nowLocal.getDate()).padStart(2, "0");
    const localToday = `${year}-${month}-${day}`;

    const scheduledDate = data.scheduledDate || localToday;

    // Queue attachment for deferred upload if it's a local file
    const attachment = await queueAttachmentIfLocal(
      data.attachment,
      "site-logs",
      "site_log",
      id,
      "attachment",
    );

    const signature = await queueAttachmentIfLocal(
      data.signature,
      "site-signatures",
      "site_log",
      id,
      "signature",
    );

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
      main_remarks: data.mainRemarks || data.main_remarks || null,
      entry_time: data.entryTime || null,
      end_time: data.endTime || null,
      signature: signature || null,
      attachment: attachment,
      status: data.status || null,
      scheduled_date: scheduledDate,
      created_at: now,
      updated_at: now,
    });

    const [record] = await db
      .select()
      .from(siteLogs)
      .where(eq(siteLogs.id, id))
      .limit(1);

    logger.activity(
      "CREATE",
      "SITE_LOG",
      `New ${data.logName} log created for ${data.siteCode}`,
      {
        log_id: id,
        log_name: data.logName,
        site_code: data.siteCode,
        task_name: data.taskName,
        status: data.status,
      },
    );

    // Enqueue for offline sync
    await cacheManager.enqueue({
      entity_type: "site_log_create",
      operation: "create",
      payload: {
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
        main_remarks: data.mainRemarks || data.main_remarks || null,
        entry_time: data.entryTime || null,
        end_time: data.endTime || null,
        signature: data.signature || null,
        attachment: data.attachment || null,
        status: data.status || null,
        scheduled_date: scheduledDate,
      },
    });

    // Best-effort API call
    try {
      await apiFetch("/api/site-logs", {
        method: "POST",
        body: JSON.stringify({
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
          main_remarks: data.mainRemarks || data.main_remarks || null,
          entry_time: data.entryTime || null,
          end_time: data.endTime || null,
          signature: data.signature || null,
          attachment: data.attachment || null,
          status: data.status || null,
          scheduled_date: scheduledDate,
        }),
      });
    } catch {
      logger.debug("saveSiteLog: API call failed, will sync later", {
        module: "SITE_LOG_SERVICE",
      });
    }

    return record;
  },

  /**
   * Save a chiller reading
   */
  async saveChillerReading(data: any): Promise<any> {
    const now = Date.now();
    const id = uuidv4();

    // Queue attachment for deferred upload if it's a local file
    const attachments = await queueAttachmentIfLocal(
      data.attachments,
      "chiller-readings",
      "chiller_reading",
      id,
      "attachments",
    );

    const signatureText = await queueAttachmentIfLocal(
      data.signature,
      "site-signatures",
      "chiller_reading",
      id,
      "signature_text",
    );

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
      signature_text: signatureText || null,
      attachments: attachments,
      status: data.status || "Completed",
      created_at: now,
      updated_at: now,
    });

    const [record] = await db
      .select()
      .from(chillerReadings)
      .where(eq(chillerReadings.id, id))
      .limit(1);

    logger.activity(
      "CREATE",
      "CHILLER_READING",
      `New chiller reading created for ${data.siteCode}`,
      {
        log_id: id,
        site_code: data.siteCode,
        asset_name: data.assetName,
        chiller_id: data.chillerId,
        status: data.status || "Completed",
      },
    );

    // Enqueue for offline sync
    await cacheManager.enqueue({
      entity_type: "chiller_reading_create",
      operation: "create",
      payload: record,
    });

    // Best-effort API call
    try {
      await apiFetch("/api/chiller-readings", {
        method: "POST",
        body: JSON.stringify(record),
      });
    } catch {
      logger.debug("saveChillerReading: API call failed, will sync later", {
        module: "SITE_LOG_SERVICE",
      });
    }

    return record;
  },

  /**
   * Update an existing chiller reading
   */
  async updateChillerReading(id: string, data: Partial<any>): Promise<any> {
    const updateFields: Record<string, any> = { updated_at: Date.now() };

    if (data.chillerId !== undefined) updateFields.chiller_id = data.chillerId;
    if (data.equipmentId !== undefined)
      updateFields.equipment_id = data.equipmentId;
    if (data.assetName !== undefined) updateFields.asset_name = data.assetName;
    if (data.assetType !== undefined) updateFields.asset_type = data.assetType;
    if (data.dateShift !== undefined) updateFields.date_shift = data.dateShift;
    if (data.assignedTo !== undefined)
      updateFields.assigned_to = data.assignedTo;
    if (data.readingTime !== undefined)
      updateFields.reading_time = data.readingTime;
    if (data.startDatetime !== undefined)
      updateFields.start_datetime = data.startDatetime;
    if (data.endDatetime !== undefined)
      updateFields.end_datetime = data.endDatetime;
    if (data.condenserInletTemp !== undefined)
      updateFields.condenser_inlet_temp = data.condenserInletTemp;
    if (data.condenserOutletTemp !== undefined)
      updateFields.condenser_outlet_temp = data.condenserOutletTemp;
    if (data.evaporatorInletTemp !== undefined)
      updateFields.evaporator_inlet_temp = data.evaporatorInletTemp;
    if (data.evaporatorOutletTemp !== undefined)
      updateFields.evaporator_outlet_temp = data.evaporatorOutletTemp;
    if (data.saturatedCondenserTemp !== undefined)
      updateFields.saturated_condenser_temp = data.saturatedCondenserTemp;
    if (data.saturatedSuctionTemp !== undefined)
      updateFields.saturated_suction_temp = data.saturatedSuctionTemp;
    if (data.compressorSuctionTemp !== undefined)
      updateFields.compressor_suction_temp = data.compressorSuctionTemp;
    if (data.motorTemperature !== undefined)
      updateFields.motor_temperature = data.motorTemperature;
    if (data.setPointCelsius !== undefined)
      updateFields.set_point_celsius = data.setPointCelsius;
    if (data.dischargePressure !== undefined)
      updateFields.discharge_pressure = data.dischargePressure;
    if (data.mainSuctionPressure !== undefined)
      updateFields.main_suction_pressure = data.mainSuctionPressure;
    if (data.oilPressure !== undefined)
      updateFields.oil_pressure = data.oilPressure;
    if (data.oilPressureDifference !== undefined)
      updateFields.oil_pressure_difference = data.oilPressureDifference;
    if (data.condenserInletPressure !== undefined)
      updateFields.condenser_inlet_pressure = data.condenserInletPressure;
    if (data.condenserOutletPressure !== undefined)
      updateFields.condenser_outlet_pressure = data.condenserOutletPressure;
    if (data.evaporatorInletPressure !== undefined)
      updateFields.evaporator_inlet_pressure = data.evaporatorInletPressure;
    if (data.evaporatorOutletPressure !== undefined)
      updateFields.evaporator_outlet_pressure = data.evaporatorOutletPressure;
    if (data.compressorLoadPercentage !== undefined)
      updateFields.compressor_load_percentage = data.compressorLoadPercentage;
    if (data.inlineBtuMeter !== undefined)
      updateFields.inline_btu_meter = data.inlineBtuMeter;
    if (data.remarks !== undefined) updateFields.remarks = data.remarks;
    if (data.status !== undefined) updateFields.status = data.status;

    const signatureValue =
      data.signatureText !== undefined ? data.signatureText : data.signature;

    if (signatureValue !== undefined) {
      updateFields.signature_text = await queueAttachmentIfLocal(
        signatureValue,
        "site-signatures",
        "chiller_reading",
        id,
        "signature_text",
      );
    }

    if (data.attachments !== undefined) {
      updateFields.attachments = await queueAttachmentIfLocal(
        data.attachments,
        "chiller-readings",
        "chiller_reading",
        id,
        "attachments",
      );
    }

    await db
      .update(chillerReadings)
      .set(updateFields)
      .where(eq(chillerReadings.id, id));

    const [record] = await db
      .select()
      .from(chillerReadings)
      .where(eq(chillerReadings.id, id))
      .limit(1);

    logger.activity(
      "UPDATE",
      "CHILLER_READING",
      `Chiller reading updated for ${record?.site_code || id}`,
      {
        log_id: id,
        site_code: record?.site_code,
        asset_name: record?.asset_name,
        chiller_id: record?.chiller_id,
        updated_fields: Object.keys(updateFields).filter(
          (k) => k !== "updated_at",
        ),
        status: data.status,
      },
    );

    // Enqueue for offline sync
    await cacheManager.enqueue({
      entity_type: "chiller_reading_update",
      operation: "update",
      payload: { id, ...updateFields },
    });

    // Best-effort API call
    try {
      await apiFetch(`/api/chiller-readings/${id}`, {
        method: "PUT",
        body: JSON.stringify(updateFields),
      });
    } catch {
      logger.debug("updateChillerReading: API call failed, will sync later", {
        module: "SITE_LOG_SERVICE",
      });
    }

    return record;
  },

  /**
   * Delete a chiller reading
   */
  async deleteChillerReading(id: string): Promise<void> {
    try {
      await db.delete(chillerReadings).where(eq(chillerReadings.id, id));

      // Enqueue for offline sync
      await cacheManager.enqueue({
        entity_type: "chiller_reading_delete",
        operation: "delete",
        payload: { id },
      });

      // Best-effort API call
      try {
        await apiFetch(`/api/chiller-readings/${id}`, { method: "DELETE" });
      } catch {
        logger.debug("deleteChillerReading: API call failed, will sync later", {
          module: "SITE_LOG_SERVICE",
        });
      }

      logger.activity(
        "DELETE",
        "CHILLER_READING",
        `Chiller reading deleted: ${id}`,
        { log_id: id },
      );
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
      await db.delete(siteLogs).where(eq(siteLogs.id, id));

      // Enqueue for offline sync
      await cacheManager.enqueue({
        entity_type: "site_log_delete",
        operation: "delete",
        payload: { id },
      });

      // Best-effort API call
      try {
        await apiFetch(`/api/site-logs/${id}`, { method: "DELETE" });
      } catch {
        logger.debug("deleteSiteLog: API call failed, will sync later", {
          module: "SITE_LOG_SERVICE",
        });
      }

      logger.activity("DELETE", "SITE_LOG", `Site log deleted: ${id}`, {
        log_id: id,
      });
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

      if (data.temperature !== undefined)
        updateFields.temperature = data.temperature;
      if (data.rh !== undefined) updateFields.rh = data.rh;
      if (data.tds !== undefined) updateFields.tds = data.tds;
      if (data.ph !== undefined) updateFields.ph = data.ph;
      if (data.hardness !== undefined) updateFields.hardness = data.hardness;
      if (data.chemicalDosing !== undefined)
        updateFields.chemical_dosing = data.chemicalDosing;
      if (data.remarks !== undefined) updateFields.remarks = data.remarks;
      if (data.mainRemarks !== undefined || data.main_remarks !== undefined) {
        updateFields.main_remarks =
          data.mainRemarks !== undefined ? data.mainRemarks : data.main_remarks;
      }
      if (data.status !== undefined) updateFields.status = data.status;
      if (data.assignedTo !== undefined)
        updateFields.assigned_to = data.assignedTo;
      if (data.endTime !== undefined) updateFields.end_time = data.endTime;
      if (data.scheduledDate !== undefined)
        updateFields.scheduled_date = data.scheduledDate;

      if (data.signature !== undefined) {
        updateFields.signature = await queueAttachmentIfLocal(
          data.signature,
          "site-signatures",
          "site_log",
          id,
          "signature",
        );
      }

      if (data.attachment !== undefined) {
        updateFields.attachment = await queueAttachmentIfLocal(
          data.attachment,
          "site-logs",
          "site_log",
          id,
          "attachment",
        );
      }

      await db.update(siteLogs).set(updateFields).where(eq(siteLogs.id, id));

      const [record] = await db
        .select()
        .from(siteLogs)
        .where(eq(siteLogs.id, id))
        .limit(1);

      logger.activity(
        "UPDATE",
        "SITE_LOG",
        `Site log updated (${record?.log_name || "unknown"}) for ${record?.site_code || id}`,
        {
          log_id: id,
          log_name: record?.log_name,
          site_code: record?.site_code,
          updated_fields: Object.keys(updateFields).filter(
            (k) => k !== "updated_at",
          ),
          status: data.status,
        },
      );

      // Enqueue for offline sync
      await cacheManager.enqueue({
        entity_type: "site_log_update",
        operation: "update",
        payload: { id, ...updateFields },
      });

      // Best-effort API call
      try {
        const response = await apiFetch(`/api/site-logs/${id}`, {
          method: "PUT",
          body: JSON.stringify(updateFields),
        });
        if (!response.ok) {
          throw new Error(`PUT /api/site-logs/${id} failed: ${response.status}`);
        }
      } catch {
        logger.debug("updateSiteLog: API call failed, will sync later", {
          module: "SITE_LOG_SERVICE",
        });
      }

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
      if (
        finalSiteCode === "all" &&
        options.siteCodes &&
        options.siteCodes.length === 1
      ) {
        finalSiteCode = options.siteCodes[0];
      }

      let url = `/api/site-logs/site/${finalSiteCode}?limit=2000`;
      if (options.logName)
        url += `&log_name=${encodeURIComponent(options.logName)}`;
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
        logger.debug("pullSiteLogs API response", {
          module: "SITE_LOG_SERVICE",
          url,
          count: serverLogs.length,
          firstLog: serverLogs[0]
            ? {
                id: serverLogs[0].id,
                log_name: serverLogs[0].log_name,
                site_code: serverLogs[0].site_code,
              }
            : null,
        });
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
            if (staleLogs.length > 0) {
              const staleLogIds = staleLogs.map((s: any) => s.id);
              await db
                .update(siteLogs)
                .set({ status: "Completed", updated_at: now })
                .where(inArray(siteLogs.id, staleLogIds));
              logger.info(`Marked ${staleLogs.length} stale logs as Completed`);
            }
          }
        }

        if (serverLogs.length === 0) return;

        // 2. Upsert all server logs via CacheManager (Req 1.6, 10.4)
        const normalizedLogs = serverLogs.map((serverLog: any) => {
          let scheduledDate: string | null = null;
          if (serverLog.scheduled_date) {
            // Server DATE column is returned as midnight UTC ISO string (e.g. 18:30 UTC previous day).
            // We must convert it to IST (+5:30) to get the correct LOCAL calendar day.
            const d = new Date(serverLog.scheduled_date);
            const istDate = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
            scheduledDate = istDate.toISOString().split("T")[0];
          }

          const safeParseFloat = (val: any) => {
            if (val === null || val === undefined || val === "") return null;
            const parsed = parseFloat(val);
            return isNaN(parsed) ? null : parsed;
          };

          const safeTimestamp = (val: any) => {
            if (!val) return Date.now();
            const d = new Date(val);
            const ts = d.getTime();
            return isNaN(ts) ? Date.now() : ts;
          };

          return {
            id: serverLog.id,
            site_code: serverLog.site_code || siteCode,
            executor_id: serverLog.executor_id || "system",
            assigned_to: serverLog.assigned_to || null,
            log_name: normalizeLogName(serverLog.log_name),
            task_name: serverLog.task_name || null,
            temperature: safeParseFloat(serverLog.temperature),
            rh: safeParseFloat(serverLog.rh),
            tds: safeParseFloat(serverLog.tds),
            ph: safeParseFloat(serverLog.ph),
            hardness: safeParseFloat(serverLog.hardness),
            chemical_dosing: serverLog.chemical_dosing || null,
            remarks: serverLog.remarks || null,
            main_remarks: serverLog.main_remarks || null,
            signature: serverLog.signature || null,
            status: serverLog.status || null,
            scheduled_date: scheduledDate,
            created_at: safeTimestamp(serverLog.created_at),
            updated_at: Date.now(),
          };
        });
        await cacheManager.write("site_logs", normalizedLogs);
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

        const safeParseFloat = (val: any) => {
          if (val === null || val === undefined || val === "") return null;
          const parsed = parseFloat(val);
          return isNaN(parsed) ? null : parsed;
        };

        const safeTimestamp = (val: any) => {
          if (!val) return null;
          const d = new Date(val);
          const ts = d.getTime();
          return isNaN(ts) ? null : ts;
        };

        // Upsert all server readings via CacheManager (Req 1.6, 10.4)
        const normalizedReadings = result.data.map((serverLog: any) => ({
          id: serverLog.id,
          log_id: serverLog.log_id || serverLog.id,
          site_code: serverLog.site_code || serverLog.siteCode || siteCode,
          chiller_id: serverLog.chiller_id || null,
          equipment_id: serverLog.equipment_id || null,
          asset_name: serverLog.asset_name || null,
          asset_type: serverLog.asset_type || null,
          executor_id: serverLog.executor_id || "system",
          date_shift: serverLog.date_shift || null,
          assigned_to: serverLog.assigned_to || null,
          reading_time: safeTimestamp(serverLog.reading_time),
          start_datetime: safeTimestamp(serverLog.start_datetime),
          end_datetime: safeTimestamp(serverLog.end_datetime),
          condenser_inlet_temp: safeParseFloat(serverLog.condenser_inlet_temp),
          condenser_outlet_temp: safeParseFloat(
            serverLog.condenser_outlet_temp,
          ),
          evaporator_inlet_temp: safeParseFloat(
            serverLog.evaporator_inlet_temp,
          ),
          evaporator_outlet_temp: safeParseFloat(
            serverLog.evaporator_outlet_temp,
          ),
          compressor_suction_temp: safeParseFloat(
            serverLog.compressor_suction_temp,
          ),
          motor_temperature: safeParseFloat(serverLog.motor_temperature),
          saturated_condenser_temp: safeParseFloat(
            serverLog.saturated_condenser_temp,
          ),
          saturated_suction_temp: safeParseFloat(
            serverLog.saturated_suction_temp,
          ),
          set_point_celsius: safeParseFloat(serverLog.set_point_celsius),
          discharge_pressure: safeParseFloat(serverLog.discharge_pressure),
          main_suction_pressure: safeParseFloat(
            serverLog.main_suction_pressure,
          ),
          oil_pressure: safeParseFloat(serverLog.oil_pressure),
          oil_pressure_difference: safeParseFloat(
            serverLog.oil_pressure_difference,
          ),
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
          inline_btu_meter: parseFloat(serverLog.inline_btu_meter) || null,
          remarks: serverLog.remarks || null,
          sla_status: serverLog.sla_status || null,
          reviewed_by: serverLog.reviewed_by || null,
          signature_text: serverLog.signature_text || null,
          attachments: serverLog.attachments || null,
          status: serverLog.status || "Completed",
          created_at: serverLog.created_at
            ? new Date(serverLog.created_at).getTime()
            : Date.now(),
          updated_at: Date.now(),
        }));
        await cacheManager.write("chiller_readings", normalizedReadings);
      }
    } catch (error: any) {
      logger.error("Error pulling chiller readings", {
        module: "SITE_LOG_SERVICE",
        error: error.message,
      });
    }
  },

  async prefetchPendingForCategory(siteCode: string, logName: string): Promise<void> {
    const netState = await NetInfo.fetch();
    if (netState.isConnected === false) return;

    const normalized = normalizeLogName(logName);
    if (normalized === "Chiller Logs") {
      const fromDateObj = startOfDay(addDays(new Date(), -1));
      const toDateObj = endOfDay(addDays(new Date(), 1));
      await this.pullChillerReadings(siteCode, {
        fromDate: fromDateObj.getTime(),
        toDate: toDateObj.getTime(),
      });
      return;
    }

    await this.pullSiteLogs(siteCode, {
      logName: normalized,
      status: "pending",
    });
  },

  async getTodayChillerReadingCount(
    siteCode: string,
    targetDate: Date = new Date(),
  ): Promise<number> {
    try {
      const targetDateStr = getISTDateString(targetDate);
      const rows = await db
        .select({
          reading_time: chillerReadings.reading_time,
          created_at: chillerReadings.created_at,
        })
        .from(chillerReadings)
        .where(eq(chillerReadings.site_code, siteCode));

      return rows.filter((row) => {
        const timestamp = row.reading_time || row.created_at;
        if (!timestamp) return false;
        return getISTDateString(new Date(timestamp)) === targetDateStr;
      }).length;
    } catch (error: any) {
      logger.error("Error getting today's chiller reading count", {
        module: "SITE_LOG_SERVICE",
        siteCode,
        error: error.message,
      });
      return 0;
    }
  },

  async getTodayChillerCompletedReadingCount(
    siteCode: string,
    targetDate: Date = new Date(),
  ): Promise<number> {
    try {
      const targetDateStr = getISTDateString(targetDate);

      const rows = await db
        .select({
          reading_time: chillerReadings.reading_time,
          created_at: chillerReadings.created_at,
        })
        .from(chillerReadings)
        .where(and(eq(chillerReadings.site_code, siteCode), eq(chillerReadings.status, "Completed")));

      return rows.filter((row) => {
        const timestamp = row.reading_time || row.created_at;
        if (!timestamp) return false;
        return getISTDateString(new Date(timestamp)) === targetDateStr;
      }).length;
    } catch (error: any) {
      logger.error("Error getting today's completed chiller reading count", {
        module: "SITE_LOG_SERVICE",
        siteCode,
        error: error.message,
      });
      return 0;
    }
  },

  async getTodayChillerDailyPendingCount(
    siteCode: string,
    targetDate: Date = new Date(),
    goal: number = 12,
  ): Promise<number> {
    const targetDateStr = getISTDateString(targetDate);

    const rows = await db
      .select({
        reading_time: chillerReadings.reading_time,
        created_at: chillerReadings.created_at,
      })
      .from(chillerReadings)
      .where(
        and(
          eq(chillerReadings.site_code, siteCode),
          eq(chillerReadings.status, "Completed"),
        ),
      );

    const completed = rows.filter((row) => {
      const timestamp = row.reading_time || row.created_at;
      if (!timestamp) return false;
      return getISTDateString(new Date(timestamp)) === targetDateStr;
    }).length;

    return Math.max(0, goal - completed);
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
            and(eq(siteLogs.site_code, siteCode), eq(siteLogs.log_name, type)),
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
          tasks = await SiteConfigService.getChillerTasks(
            siteCode,
            fromDate,
            toDate,
          );
        } else {
          tasks = await SiteConfigService.getLogTasks(
            siteCode,
            type,
            fromDate,
            toDate,
            undefined,
            true,
          );
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
      Water: 0,
      "Chemical Dosing": 0,
    };

    // PROACTIVE OFFLINE CHECK: skip API entirely if no connection
    const netState = await NetInfo.fetch();
    const isOffline = netState.isConnected === false;

    try {
      await Promise.all(
        logTypes.map(async (logName) => {
          if (isOffline) {
            // Offline: count local non-completed records
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
            return;
          }

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
            // Network fallback: count local non-completed records
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
   * Returns the count of pending items in the offline queue.
   */
  async getUnsyncedCounts(): Promise<number> {
    return cacheManager.getQueueCount();
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

      const records = serverLogs.map((serverLog: any) => ({
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
      }));
      await cacheManager.write("log_master", records);

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

  /**
   * Database Maintenance: Cleanup synced logs older than 90 days
   */
  async runCleanup(): Promise<void> {
    try {
      const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

      // Delete old synced logs
      const deletedLogs = await db
        .delete(siteLogs)
        .where(
          and(
            lt(siteLogs.created_at, ninetyDaysAgo),
            eq(siteLogs.status, "Completed"),
          ),
        );

      // Delete old synced chiller readings
      const deletedReadings = await db
        .delete(chillerReadings)
        .where(
          and(
            lt(chillerReadings.created_at, ninetyDaysAgo),
            eq(chillerReadings.status, "Completed"),
          ),
        );

      logger.info(
        `Database maintenance complete. Cleaned up old synced logs.`,
        {
          module: "SITE_LOG_SERVICE",
        },
      );
    } catch (error: any) {
      logger.error("Database maintenance failed", {
        module: "SITE_LOG_SERVICE",
        error: error.message,
      });
    }
  },
};

export default SiteLogService;
