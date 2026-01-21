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

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || "http://192.168.31.152:3420";

const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  let token = await authService.getValidToken();

  const getHeaders = (t: string | null) => ({
    "Content-Type": "application/json",
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
    ...options.headers,
  });

  try {
    const response = await fetchWithTimeout(`${BACKEND_URL}${endpoint}`, {
      ...options,
      headers: getHeaders(token),
    });

    if (response.status === 401) {
      const newToken = await authService.refreshToken();
      if (newToken) {
        return await fetchWithTimeout(`${BACKEND_URL}${endpoint}`, {
          ...options,
          headers: getHeaders(newToken),
        }).then((res) => res.json());
      }
    }

    return await response.json();
  } catch (error: any) {
    logger.warn(`Network Error on ${endpoint}`, {
      module: "SITE_LOG_SERVICE",
      error: error.message,
    });
    return { success: false, isNetworkError: true };
  }
};

export const SiteLogService = {
  /**
   * Fetch logs for a site by type
   */
  async getLogsByType(siteId: string, logType: string, options: any = {}) {
    try {
      if (logType === "Chiller Logs") {
        return await chillerReadingCollection
          .query(Q.where("site_id", siteId), Q.sortBy("created_at", Q.desc))
          .fetch();
      } else {
        return await siteLogCollection
          .query(
            Q.where("site_id", siteId),
            Q.where("log_name", logType),
            Q.sortBy("created_at", Q.desc),
          )
          .fetch();
      }
    } catch (error: any) {
      logger.error(`Error fetching ${logType} logs`, {
        module: "SITE_LOG_SERVICE",
        error: error.message,
      });
      return [];
    }
  },

  /**
   * Save a site log (Temp RH, Water, Chemical Dosing)
   */
  async saveSiteLog(data: any): Promise<SiteLog> {
    return await database.write(async () => {
      return await siteLogCollection.create((record) => {
        record.logId = `LOG-${Date.now()}`;
        record.siteId = data.siteId;
        record.executorId = data.executorId;
        record.logName = data.logName;
        record.scheduledDate = data.scheduledDate || null;
        record.entryTime = data.entryTime || null;
        record.endTime = data.endTime || null;
        record.temperature = data.temperature || null;
        record.rh = data.rh || null;
        record.tds = data.tds || null;
        record.ph = data.ph || null;
        record.hardness = data.hardness || null;
        record.chemicalDosing = data.chemicalDosing || null;
        record.remarks = data.remarks || null;
        record.mainRemarks = data.mainRemarks || null;
        record.signature = data.signature || null;
        record.isSynced = false;
        record.taskName = data.taskName || null;
        record.taskLineId = data.taskLineId || null;
      });
    });
  },

  /**
   * Save a chiller reading
   */
  async saveChillerReading(data: any): Promise<ChillerReading> {
    return await database.write(async () => {
      return await chillerReadingCollection.create((record) => {
        record.logId = `CHL-${Date.now()}`;
        record.siteId = data.siteId;
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
        record.isSynced = false;
      });
    });
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
