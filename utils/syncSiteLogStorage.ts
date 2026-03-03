import logger from "./logger";
import { syncWithRetry, fetchWithTimeout } from "./apiHelper";
import {
  siteLogCollection,
  chillerReadingCollection,
  database,
} from "../database";
import { Q } from "@nozbe/watermelondb";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SITE_LOG_SYNC_STATUS_KEY = "@site_log_sync_status";
const CHILLER_DELETION_QUEUE_KEY = "@chiller_deletion_queue";
const SITE_LOG_DELETION_QUEUE_KEY = "@site_log_deletion_queue";

export interface SiteLogSyncStatus {
  lastSynced: string | null;
  pendingCount: number;
  autoSyncEnabled: boolean;
}

// Sync status management
export async function getSiteLogSyncStatus(): Promise<SiteLogSyncStatus> {
  try {
    const data = await AsyncStorage.getItem(SITE_LOG_SYNC_STATUS_KEY);
    if (data) {
      return JSON.parse(data);
    }
    return {
      lastSynced: null,
      pendingCount: 0,
      autoSyncEnabled: true,
    };
  } catch (error: any) {
    logger.error("Error getting site log sync status", {
      module: "OFFLINE_SITE_LOG_STORAGE",
      error: error.message,
    });
    return {
      lastSynced: null,
      pendingCount: 0,
      autoSyncEnabled: true,
    };
  }
}

export async function updateSiteLogLastSynced(): Promise<void> {
  const status = await getSiteLogSyncStatus();
  await AsyncStorage.setItem(
    SITE_LOG_SYNC_STATUS_KEY,
    JSON.stringify({
      ...status,
      lastSynced: new Date().toISOString(),
    }),
  );
}

export async function getPendingSiteLogsCount(): Promise<number> {
  const siteLogs = await siteLogCollection
    .query(Q.where("is_synced", false))
    .fetchCount();
  const chillerReadings = await chillerReadingCollection
    .query(Q.where("is_synced", false))
    .fetchCount();
  return siteLogs + chillerReadings;
}

export async function updateSiteLogPendingCount(): Promise<void> {
  const count = await getPendingSiteLogsCount();
  const status = await getSiteLogSyncStatus();
  await AsyncStorage.setItem(
    SITE_LOG_SYNC_STATUS_KEY,
    JSON.stringify({
      ...status,
      pendingCount: count,
    }),
  );
}

export async function setSiteLogAutoSyncEnabled(
  enabled: boolean,
): Promise<void> {
  const status = await getSiteLogSyncStatus();
  await AsyncStorage.setItem(
    SITE_LOG_SYNC_STATUS_KEY,
    JSON.stringify({
      ...status,
      autoSyncEnabled: enabled,
    }),
  );
}

export async function clearAllOfflineSiteLogData(): Promise<void> {
  try {
    await database.write(async () => {
      // Delete all unsynced logs (or all logs? usually "clear offline data" means clear cache)
      // "Clear All Offline Data" implies resetting the local state.
      // For WatermelonDB, we might want to just mark them as synced or actually delete them?
      // Usually, we want to wipe the local DB tables for these logs.
      const siteLogs = await siteLogCollection.query().fetch();
      for (const log of siteLogs) {
        await log.markAsDeleted(); // Or destroyPermanently()
      }
      const chillerReadings = await chillerReadingCollection.query().fetch();
      for (const log of chillerReadings) {
        await log.markAsDeleted();
      }
    });
    await updateSiteLogPendingCount();
  } catch (error: any) {
    logger.error("Error clearing all offline site log data", {
      module: "OFFLINE_SITE_LOG_STORAGE",
      error: error.message,
    });
    throw error;
  }
}

/**
 * Sync pending site logs and chiller readings to the server
 */
export async function syncPendingSiteLogs(
  token: string,
  apiUrl: string,
): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;

  // 0. Sync Deletions
  // A. Chiller Readings
  const pendingChillerDeletions = await getPendingDeletions("chiller");
  for (const serverId of pendingChillerDeletions) {
    try {
      const response = await syncWithRetry(() =>
        fetchWithTimeout(`${apiUrl}/api/chiller-readings/${serverId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      if (response.ok || response.status === 404) {
        await removeFromDeletionQueue("chiller", serverId);
      }
    } catch (error) {
      logger.error("Failed to sync chiller deletion", { serverId, error });
    }
  }

  // B. Site Logs
  const pendingSiteLogDeletions = await getPendingDeletions("site_log");
  for (const serverId of pendingSiteLogDeletions) {
    try {
      const response = await syncWithRetry(() =>
        fetchWithTimeout(`${apiUrl}/api/site-logs/${serverId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      if (response.ok || response.status === 404) {
        await removeFromDeletionQueue("site_log", serverId);
      }
    } catch (error) {
      logger.error("Failed to sync site log deletion", { serverId, error });
    }
  }

  // 1. Sync Site Logs
  const pendingSiteLogs = await siteLogCollection
    .query(Q.where("is_synced", false))
    .fetch();

  for (const log of pendingSiteLogs) {
    try {
      const isUpdate = !!log.serverId;
      const response = await syncWithRetry(() =>
        fetchWithTimeout(
          isUpdate
            ? `${apiUrl}/api/site-logs/${log.serverId}`
            : `${apiUrl}/api/site-logs`,
          {
            method: isUpdate ? "PUT" : "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              site_code: log.siteCode,
              executor_id: log.executorId,
              log_name: log.logName,
              temperature: log.temperature,
              rh: log.rh,
              tds: log.tds,
              ph: log.ph,
              hardness: log.hardness,
              chemical_dosing: log.chemicalDosing,
              remarks: log.remarks,
              signature: log.signature,
              entry_time: log.entryTime,
              end_time: log.endTime,
            }),
          },
        ),
      );

      if (response.ok) {
        const result = await response.json();
        await database.write(async () => {
          await log.update((record: any) => {
            record.isSynced = true;
            record.serverId = result.data?.id;
            record.lastSync = Date.now();
          });
        });
        synced++;
      } else {
        failed++;
      }
    } catch (error: any) {
      logger.error("Site log sync failure", {
        module: "OFFLINE_SITE_LOG_STORAGE",
        error: error.message,
        recordId: log.id,
      });
      failed++;
    }
  }

  // 2. Sync Chiller Readings
  const pendingChillerReadings = await chillerReadingCollection
    .query(Q.where("is_synced", false))
    .fetch();

  for (const log of pendingChillerReadings) {
    try {
      const isUpdate = !!log.serverId;
      const response = await syncWithRetry(() =>
        fetchWithTimeout(
          isUpdate
            ? `${apiUrl}/api/chiller-readings/${log.serverId}`
            : `${apiUrl}/api/chiller-readings`,
          {
            method: isUpdate ? "PUT" : "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              log_id: log.logId,
              site_code: log.siteCode,
              executor_id: log.executorId,
              chiller_id: log.chillerId,
              equipment_id: log.equipmentId,
              asset_name: log.assetName,
              asset_type: log.assetType,
              date_shift: log.dateShift,
              reading_time: log.reading_time,
              condenser_inlet_temp: log.condenserInletTemp,
              condenser_outlet_temp: log.condenserOutletTemp,
              evaporator_inlet_temp: log.evaporatorInletTemp,
              evaporator_outlet_temp: log.evaporatorOutletTemp,
              compressor_suction_temp: log.compressorSuctionTemp,
              motor_temperature: log.motorTemperature,
              saturated_condenser_temp: log.saturatedCondenserTemp,
              saturated_suction_temp: log.saturatedSuctionTemp,
              discharge_pressure: log.dischargePressure,
              main_suction_pressure: log.mainSuctionPressure,
              oil_pressure: log.oilPressure,
              oil_pressure_difference: log.oilPressureDifference,
              compressor_load_percentage: log.compressorLoadPercentage,
              inline_btu_meter: log.inlineBtuMeter,
              set_point_celsius: log.setPointCelsius,
              remarks: log.remarks,
              signature_text: log.signatureText,
              status: log.status,
              start_datetime: log.start_datetime,
              end_datetime: log.end_datetime,
            }),
          },
        ),
      );

      if (response.ok) {
        const result = await response.json();
        await database.write(async () => {
          await log.update((record: any) => {
            record.isSynced = true;
            record.serverId = result.data?.id;
          });
        });
        synced++;
      } else {
        failed++;
      }
    } catch (error: any) {
      logger.error("Chiller reading sync failure", {
        module: "OFFLINE_SITE_LOG_STORAGE",
        error: error.message,
        recordId: log.id,
      });
      failed++;
    }
  }

  // Update status after sync attempt
  if (synced > 0) {
    await updateSiteLogLastSynced();
  }
  await updateSiteLogPendingCount();

  return { synced, failed };
}

/**
 * Pull recent site logs from server to populate local history (bootstrapping)
 */
export async function pullRecentSiteLogs(
  token: string,
  apiUrl: string,
): Promise<{ pulled: number }> {
  let pulled = 0;
  try {
    // Calculate date for 90 days ago (3 months)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const startDate = ninetyDaysAgo.toISOString();

    const response = await fetchWithTimeout(
      `${apiUrl}/api/site-logs?startDate=${startDate}&limit=1000`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (response.ok) {
      const result = await response.json();
      const logs = result.data || [];

      if (logs.length > 0) {
        await database.write(async () => {
          for (const logData of logs) {
            // Check if exists
            const existing = await siteLogCollection
              .query(Q.where("server_id", logData.id))
              .fetch();

            const safeNum = (val: any) =>
              val !== undefined && val !== null && val !== ""
                ? Number(val)
                : null;

            if (existing.length > 0) {
              await existing[0].update((r) => {
                r.siteCode = (logData.site_code || logData.site_id) ?? "";
                r.executorId = logData.executor_id;
                r.logName = logData.log_name;
                r.taskName = logData.task_name;
                r.temperature = safeNum(logData.temperature);
                r.rh = safeNum(logData.rh);
                r.tds = safeNum(logData.tds);
                r.ph = safeNum(logData.ph);
                r.hardness = safeNum(logData.hardness);
                r.chemicalDosing = logData.chemical_dosing;
                r.remarks = logData.remarks;
                r.signature = logData.signature;
                r.entryTime = logData.entry_time
                  ? Number(new Date(logData.entry_time))
                  : null;
                r.endTime = logData.end_time
                  ? Number(new Date(logData.end_time))
                  : null;
                r.isSynced = true;
              });
            } else {
              await siteLogCollection.create((r) => {
                r.serverId = logData.id;
                r.siteCode = (logData.site_code || logData.site_id) ?? "";
                r.executorId = logData.executor_id;
                r.logName = logData.log_name;
                r.taskName = logData.task_name;
                r.temperature = safeNum(logData.temperature);
                r.rh = safeNum(logData.rh);
                r.tds = safeNum(logData.tds);
                r.ph = safeNum(logData.ph);
                r.hardness = safeNum(logData.hardness);
                r.chemicalDosing = logData.chemical_dosing;
                r.remarks = logData.remarks;
                r.signature = logData.signature;
                r.entryTime = logData.entry_time
                  ? Number(new Date(logData.entry_time))
                  : null;
                r.endTime = logData.end_time
                  ? Number(new Date(logData.end_time))
                  : null;
                r.isSynced = true;
              });
            }
            pulled++;
          }
        });
      }
    }
  } catch (error: any) {
    logger.error("Error pulling recent site logs", {
      module: "OFFLINE_SITE_LOG_STORAGE",
      error: error.message,
    });
  }
  return { pulled };
}

/**
 * Pull recent chiller readings from server to populate local history
 */
export async function pullRecentChillerReadings(
  token: string,
  apiUrl: string,
): Promise<{ pulled: number }> {
  let pulled = 0;
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const startDate = ninetyDaysAgo.toISOString();

    const response = await fetchWithTimeout(
      `${apiUrl}/api/chiller-readings/site/all?limit=1000&fromDate=${startDate}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (response.ok) {
      const result = await response.json();
      const logs = result.data || [];

      if (logs.length > 0) {
        await database.write(async () => {
          for (const serverLog of logs) {
            const existing = await chillerReadingCollection
              .query(Q.where("server_id", serverLog.id))
              .fetch();

            const readingTime = serverLog.reading_time
              ? new Date(serverLog.reading_time).getTime()
              : null;
            const startDateTime = serverLog.start_datetime
              ? new Date(serverLog.start_datetime).getTime()
              : null;
            const endDateTime = serverLog.end_datetime
              ? new Date(serverLog.end_datetime).getTime()
              : null;

            const safeNum = (val: any) =>
              val !== undefined && val !== null && val !== ""
                ? Number(val)
                : null;

            if (existing.length > 0) {
              await existing[0].update((record) => {
                record.siteCode = serverLog.site_code || record.siteCode;
                record.chillerId = serverLog.chiller_id;
                record.equipmentId = serverLog.equipment_id;
                record.assetName = serverLog.asset_name;
                record.assignedTo = serverLog.assigned_to;
                record.assetType = serverLog.asset_type;
                record.executorId = serverLog.executor_id || "unknown";
                record.reading_time = readingTime;
                record.start_datetime = startDateTime;
                record.end_datetime = endDateTime;
                record.condenserInletTemp = safeNum(
                  serverLog.condenser_inlet_temp,
                );
                record.condenserOutletTemp = safeNum(
                  serverLog.condenser_outlet_temp,
                );
                record.evaporatorInletTemp = safeNum(
                  serverLog.evaporator_inlet_temp,
                );
                record.evaporatorOutletTemp = safeNum(
                  serverLog.evaporator_outlet_temp,
                );
                record.compressorSuctionTemp = safeNum(
                  serverLog.compressor_suction_temp,
                );
                record.motorTemperature = safeNum(serverLog.motor_temperature);
                record.saturatedCondenserTemp = safeNum(
                  serverLog.saturated_condenser_temp,
                );
                record.saturatedSuctionTemp = safeNum(
                  serverLog.saturated_suction_temp,
                );
                record.setPointCelsius = safeNum(serverLog.set_point_celsius);
                record.dischargePressure = safeNum(
                  serverLog.discharge_pressure,
                );
                record.mainSuctionPressure = safeNum(
                  serverLog.main_suction_pressure,
                );
                record.oilPressure = safeNum(serverLog.oil_pressure);
                record.oilPressureDifference = safeNum(
                  serverLog.oil_pressure_difference,
                );
                record.condenserInletPressure = safeNum(
                  serverLog.condenser_inlet_pressure,
                );
                record.condenserOutletPressure = safeNum(
                  serverLog.condenser_outlet_pressure,
                );
                record.evaporatorInletPressure = safeNum(
                  serverLog.evaporator_inlet_pressure,
                );
                record.evaporatorOutletPressure = safeNum(
                  serverLog.evaporator_outlet_pressure,
                );
                record.compressorLoadPercentage = safeNum(
                  serverLog.compressor_load_percentage,
                );
                record.inlineBtuMeter = safeNum(serverLog.inline_btu_meter);
                record.remarks = serverLog.remarks;
                record.status = serverLog.status || "Completed";
                record.isSynced = true;
              });
            } else {
              await chillerReadingCollection.create((record) => {
                record.serverId = serverLog.id;
                record.siteCode = serverLog.site_code;
                record.chillerId = serverLog.chiller_id;
                record.equipmentId = serverLog.equipment_id;
                record.assetName = serverLog.asset_name;
                record.assignedTo = serverLog.assigned_to;
                record.assetType = serverLog.asset_type;
                record.executorId = serverLog.executor_id || "unknown";
                record.dateShift = serverLog.date_shift;
                record.reading_time = readingTime;
                record.start_datetime = startDateTime;
                record.end_datetime = endDateTime;
                record.condenserInletTemp = safeNum(
                  serverLog.condenser_inlet_temp,
                );
                record.condenserOutletTemp = safeNum(
                  serverLog.condenser_outlet_temp,
                );
                record.evaporatorInletTemp = safeNum(
                  serverLog.evaporator_inlet_temp,
                );
                record.evaporatorOutletTemp = safeNum(
                  serverLog.evaporator_outlet_temp,
                );
                record.compressorSuctionTemp = safeNum(
                  serverLog.compressor_suction_temp,
                );
                record.motorTemperature = safeNum(serverLog.motor_temperature);
                record.saturatedCondenserTemp = safeNum(
                  serverLog.saturated_condenser_temp,
                );
                record.saturatedSuctionTemp = safeNum(
                  serverLog.saturated_suction_temp,
                );
                record.setPointCelsius = safeNum(serverLog.set_point_celsius);
                record.dischargePressure = safeNum(
                  serverLog.discharge_pressure,
                );
                record.mainSuctionPressure = safeNum(
                  serverLog.main_suction_pressure,
                );
                record.oilPressure = safeNum(serverLog.oil_pressure);
                record.oilPressureDifference = safeNum(
                  serverLog.oil_pressure_difference,
                );
                record.condenserInletPressure = safeNum(
                  serverLog.condenser_inlet_pressure,
                );
                record.condenserOutletPressure = safeNum(
                  serverLog.condenser_outlet_pressure,
                );
                record.evaporatorInletPressure = safeNum(
                  serverLog.evaporator_inlet_pressure,
                );
                record.evaporatorOutletPressure = safeNum(
                  serverLog.evaporator_outlet_pressure,
                );
                record.compressorLoadPercentage = safeNum(
                  serverLog.compressor_load_percentage,
                );
                record.inlineBtuMeter = safeNum(serverLog.inline_btu_meter);
                record.remarks = serverLog.remarks;
                record.signatureText = serverLog.signature_text;
                record.status = serverLog.status || "Completed";
                record.isSynced = true;
              });
            }
            pulled++;
          }
        });
      }
    }
  } catch (error: any) {
    logger.error("Error pulling recent chiller readings", {
      module: "OFFLINE_SITE_LOG_STORAGE",
      error: error.message,
    });
  }
  return { pulled };
}

/**
 * Deletion Queue Helpers
 */
export async function addToDeletionQueue(
  type: "chiller" | "site_log",
  serverId: string,
): Promise<void> {
  const key =
    type === "chiller"
      ? CHILLER_DELETION_QUEUE_KEY
      : SITE_LOG_DELETION_QUEUE_KEY;
  try {
    const queueStr = await AsyncStorage.getItem(key);
    const queue: string[] = queueStr ? JSON.parse(queueStr) : [];
    if (!queue.includes(serverId)) {
      queue.push(serverId);
      await AsyncStorage.setItem(key, JSON.stringify(queue));
    }
  } catch (error) {
    logger.error(`Error adding to ${type} deletion queue`, {
      module: "OFFLINE_SYNC",
      error: (error as Error).message,
    });
  }
}

export async function getPendingDeletions(
  type: "chiller" | "site_log",
): Promise<string[]> {
  const key =
    type === "chiller"
      ? CHILLER_DELETION_QUEUE_KEY
      : SITE_LOG_DELETION_QUEUE_KEY;
  try {
    const queueStr = await AsyncStorage.getItem(key);
    return queueStr ? JSON.parse(queueStr) : [];
  } catch (error) {
    return [];
  }
}

export async function removeFromDeletionQueue(
  type: "chiller" | "site_log",
  serverId: string,
): Promise<void> {
  const key =
    type === "chiller"
      ? CHILLER_DELETION_QUEUE_KEY
      : SITE_LOG_DELETION_QUEUE_KEY;
  try {
    const queueStr = await AsyncStorage.getItem(key);
    if (queueStr) {
      let queue: string[] = JSON.parse(queueStr);
      queue = queue.filter((id) => id !== serverId);
      await AsyncStorage.setItem(key, JSON.stringify(queue));
    }
  } catch (error) {}
}
