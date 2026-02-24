import { Q } from "@nozbe/watermelondb";
import {
  database,
  siteLogCollection,
  chillerReadingCollection,
} from "../database";
import SiteLog from "../database/models/SiteLog";
import ChillerReading from "../database/models/ChillerReading";
import logger from "../utils/logger";
import { authService } from "./AuthService";
import { fetchWithTimeout } from "../utils/apiHelper";

import { API_BASE_URL } from "../constants/api";

const BACKEND_URL = API_BASE_URL;

// Helper for API requests with auth and retry logic
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  // Get valid token (will refresh if needed)
  let token = await authService.getValidToken();

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

    // If 401, try refresh once
    if (response.status === 401) {
      logger.debug(`401 on ${endpoint}, attempting refresh`, {
        module: "SITE_LOG_SERVICE",
      });
      const newToken = await authService.refreshToken();

      if (newToken) {
        token = newToken;
        // Retry with new token
        response = await fetchWithTimeout(`${BACKEND_URL}${endpoint}`, {
          ...options,
          headers: getHeaders(token),
        });
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

export const SiteLogService = {
  /**
   * Fetch logs for a site by type
   */
  async getLogsByType(siteCode: string, logType: string, options: any = {}) {
    try {
      let query;
      if (logType === "Chiller Logs") {
        query = chillerReadingCollection.query(
          Q.where("site_code", siteCode),
          Q.sortBy("created_at", Q.desc),
        );
      } else {
        query = siteLogCollection.query(
          Q.where("site_code", siteCode),
          Q.where("log_name", logType),
          Q.sortBy("created_at", Q.desc),
        );
      }

      // Apply date filters
      const conditions: any[] = [];
      if (options.fromDate) {
        conditions.push(Q.where("created_at", Q.gte(options.fromDate)));
      }
      if (options.toDate) {
        conditions.push(Q.where("created_at", Q.lte(options.toDate)));
      }

      if (conditions.length > 0) {
        // Unfortunately WatermelonDB query is immutable, we need to create a new one with combined clauses
        // Re-creating the query with all clauses
        if (logType === "Chiller Logs") {
          query = chillerReadingCollection.query(
            Q.where("site_code", siteCode),
            ...conditions,
            Q.sortBy("created_at", Q.desc),
          );
        } else {
          query = siteLogCollection.query(
            Q.where("site_code", siteCode),
            Q.where("log_name", logType),
            ...conditions,
            Q.sortBy("created_at", Q.desc),
          );
        }
      }

      return await query.fetch();
    } catch (error: any) {
      logger.error(`Error fetching ${logType} logs`, {
        module: "SITE_LOG_SERVICE",
        error: error.message,
      });
      return [];
    }
  },

  /**
   * Bulk Save site logs (Temp RH, Water, Chemical Dosing)
   */
  async saveBulkSiteLogs(logs: any[]): Promise<void> {
    await database.write(async () => {
      const batch = logs.map((data) =>
        siteLogCollection.prepareCreate((record) => {
          record.siteCode = data.siteCode;
          record.executorId = data.executorId;
          record.logName = data.logName;
          record.taskName = data.taskName;
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
          record.status = data.status || "completed";
          record.isSynced = false;
        }),
      );
      await database.batch(...batch);
    });
  },

  /**
   * Save a site log (Temp RH, Water, Chemical Dosing)
   */
  async saveSiteLog(data: any): Promise<SiteLog> {
    return await database.write(async () => {
      return await siteLogCollection.create((record) => {
        record.siteCode = data.siteCode;
        record.executorId = data.executorId;
        record.logName = data.logName;
        record.taskName = data.taskName; // Ensure this is saved
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
      });
    });
  },

  /**
   * Save a chiller reading
   */
  async saveChillerReading(data: any): Promise<ChillerReading> {
    return await database.write(async () => {
      return await chillerReadingCollection.create((record) => {
        record.siteCode = data.siteCode;
        record.executorId = data.executorId;
        record.chillerId = data.chillerId || null;
        record.equipmentId = data.equipmentId || null;
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
        record.evaporatorOutletPressure = data.evaporatorOutletPressure || null;
        record.compressorLoadPercentage = data.compressorLoadPercentage || null;
        record.inlineBtuMeter = data.inlineBtuMeter || null;
        record.remarks = data.remarks || null;
        record.signatureText = data.signatureText || null;
        record.status = data.status || "Completed";
        record.isSynced = false;
      });
    });
  },

  /**
   * Pull site logs from server and sync to local DB
   */
  async pullSiteLogs(
    siteCode: string,
    options: { fromDate?: number; toDate?: number } = {},
  ) {
    try {
      logger.info(`Pulling site logs for ${siteCode}`, {
        module: "SITE_LOG_SERVICE",
        options,
      });

      let endpoint = `/api/site-logs/site/${siteCode}`;
      const params = new URLSearchParams();
      if (options.fromDate)
        params.append("date_from", new Date(options.fromDate).toISOString());
      if (options.toDate)
        params.append("date_to", new Date(options.toDate).toISOString());

      const queryString = params.toString();
      if (queryString) endpoint += `?${queryString}`;

      const response = await apiFetch(endpoint);

      if (!response.ok) {
        logger.error(`Failed to fetch site logs: ${response.status}`, {
          module: "SITE_LOG_SERVICE",
          status: response.status,
        });
        return;
      }

      const result = await response.json();

      logger.info(`Server response for logs:`, {
        success: result.success,
        count: result.data?.length,
        firstLog: result.data?.[0]
          ? JSON.stringify(result.data[0]).substring(0, 200)
          : "none",
      });

      if (result.success && Array.isArray(result.data)) {
        logger.info(`Fetched ${result.data.length} logs from server`, {
          module: "SITE_LOG_SERVICE",
        });
        await database.write(async () => {
          for (const serverLog of result.data) {
            // Check if record exists locally
            const localRecords = await siteLogCollection
              .query(Q.where("server_id", serverLog.id))
              .fetch();

            const executorId = serverLog.executor_id;
            const entryTime = serverLog.entry_time
              ? new Date(serverLog.entry_time).getTime()
              : null;
            const endTime = serverLog.end_time
              ? new Date(serverLog.end_time).getTime()
              : null;

            // Handle signature format (JSON vs Path string)
            let signature = serverLog.signature;
            if (typeof signature === "string" && signature.startsWith("{")) {
              try {
                const sigObj = JSON.parse(signature);
                signature = sigObj.path || serverLog.signature;
              } catch (e) {
                // Not valid JSON or parsing error, keep as is
              }
            }

            if (localRecords.length > 0) {
              // Update existing
              await localRecords[0].update((record) => {
                record.logName = serverLog.log_name;
                record.temperature = parseFloat(serverLog.temperature) || null;
                record.rh = parseFloat(serverLog.rh) || null;
                record.tds = parseFloat(serverLog.tds) || null;
                record.ph = parseFloat(serverLog.ph) || null;
                record.hardness = parseFloat(serverLog.hardness) || null;
                record.chemicalDosing = serverLog.chemical_dosing;
                record.remarks = serverLog.remarks;
                record.entryTime = entryTime;
                record.endTime = endTime;
                record.signature = signature;
                record.status = serverLog.status || "Completed";
                record.isSynced = true;
              });
            } else {
              // Create new
              await siteLogCollection.create((record) => {
                record.serverId = serverLog.id;
                record.siteCode = siteCode;
                record.executorId = executorId || "unknown";
                record.logName = serverLog.log_name;
                record.temperature = parseFloat(serverLog.temperature) || null;
                record.rh = parseFloat(serverLog.rh) || null;
                record.tds = parseFloat(serverLog.tds) || null;
                record.ph = parseFloat(serverLog.ph) || null;
                record.hardness = parseFloat(serverLog.hardness) || null;
                record.chemicalDosing = serverLog.chemical_dosing;
                record.remarks = serverLog.remarks;
                record.entryTime = entryTime;
                record.endTime = endTime;
                record.signature = signature;
                record.status = serverLog.status || "Completed";
                record.isSynced = true;
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
   * Pull chiller readings from server and sync to local DB
   */
  async pullChillerReadings(
    siteCode: string,
    options: { fromDate?: number; toDate?: number } = {},
  ) {
    try {
      logger.info(`Pulling chiller readings for ${siteCode}`, {
        module: "SITE_LOG_SERVICE",
        options,
      });

      let endpoint = `/api/chiller-readings/site/${siteCode}`;
      const params = new URLSearchParams();
      if (options.fromDate)
        params.append("date_from", new Date(options.fromDate).toISOString());
      if (options.toDate)
        params.append("date_to", new Date(options.toDate).toISOString());

      const queryString = params.toString();
      if (queryString) endpoint += `?${queryString}`;

      const response = await apiFetch(endpoint);

      if (!response.ok) {
        logger.error(`Failed to fetch chiller readings: ${response.status}`, {
          module: "SITE_LOG_SERVICE",
          status: response.status,
        });
        return;
      }

      const result = await response.json();

      logger.info(`Server response for chiller readings:`, {
        success: result.success,
        count: result.data?.length,
        firstLog: result.data?.[0]
          ? JSON.stringify(result.data[0]).substring(0, 200)
          : "none",
      });

      if (result.success && Array.isArray(result.data)) {
        logger.info(
          `Fetched ${result.data.length} chiller readings from server`,
          { module: "SITE_LOG_SERVICE" },
        );
        await database.write(async () => {
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
                record.chillerId = serverLog.chiller_id;
                record.equipmentId = serverLog.equipment_id;
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
            } else {
              await chillerReadingCollection.create((record) => {
                record.serverId = serverLog.id;
                record.siteCode = siteCode;
                record.chillerId = serverLog.chiller_id;
                record.equipmentId = serverLog.equipment_id;
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
      const logTypes = ["Temp RH", "Water Parameters", "Chemical Dosing"];

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
  ): Promise<Record<string, { total: number; completed: number }>> {
    try {
      const SiteConfigService =
        require("./SiteConfigService").SiteConfigService; // Circular dependency handling

      // 1. Temp RH
      const tempTasks = await SiteConfigService.getLogTasks(
        siteCode,
        "Temp RH",
      );
      const tempTotal = tempTasks.length;
      const tempCompleted = tempTasks.filter((t: any) => t.isCompleted).length;

      // 2. Chiller Readings
      const chillerTasks = await SiteConfigService.getChillerTasks(siteCode);
      const chillerTotal = chillerTasks.length;
      const chillerCompleted = chillerTasks.filter(
        (t: any) => t.isCompleted,
      ).length;

      // 3. Water
      const waterTask = await SiteConfigService.getGenericTask(
        siteCode,
        "Water",
      );

      // 4. Chemical
      const chemTask = await SiteConfigService.getGenericTask(
        siteCode,
        "Chemical Dosing",
      );

      // Map to "Display Title" keys
      return {
        "Temp RH": { total: tempTotal || 0, completed: tempCompleted || 0 },
        "Chiller Logs": {
          total: chillerTotal || 0,
          completed: chillerCompleted || 0,
        },
        Water: { total: 1, completed: waterTask.isCompleted ? 1 : 0 },
        "Chemical Dosing": {
          total: 1,
          completed: chemTask.isCompleted ? 1 : 0,
        },
      };
    } catch (error: any) {
      logger.error("Error calculating progress", {
        module: "SITE_LOG_SERVICE",
        error: error.message,
      });
      return {};
    }
  },

  /**
   * Get pending (unsynced) counts
   */
  async getUnsyncedCounts(): Promise<number> {
    const siteLogs = await siteLogCollection
      .query(Q.where("is_synced", false))
      .fetchCount();
    const chillerReadings = await chillerReadingCollection
      .query(Q.where("is_synced", false))
      .fetchCount();
    return siteLogs + chillerReadings;
  },
};

export default SiteLogService;
