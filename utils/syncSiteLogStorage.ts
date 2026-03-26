/**
 * Site Log Sync Utilities - PowerSync Edition
 * 
 * Simplified sync status utilities for PowerSync.
 * PowerSync handles actual syncing automatically via logical replication.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { powerSync } from "@/database";
import logger from "./logger";

export interface SiteLogSyncStatus {
  autoSyncEnabled: boolean;
  lastSynced: number | null;
  pendingCount: number;
}

const SITELOG_AUTO_SYNC_KEY = "@sitelog_auto_sync_enabled";
const SITELOG_LAST_SYNC_KEY = "@sitelog_last_sync_time";

export async function getSiteLogSyncStatus(): Promise<SiteLogSyncStatus> {
  try {
    const [autoSyncStr, lastSyncStr] = await Promise.all([
      AsyncStorage.getItem(SITELOG_AUTO_SYNC_KEY),
      AsyncStorage.getItem(SITELOG_LAST_SYNC_KEY),
    ]);

    return {
      autoSyncEnabled: autoSyncStr !== "false",
      lastSynced: lastSyncStr ? parseInt(lastSyncStr, 10) : null,
      pendingCount: 0,
    };
  } catch (error) {
    logger.error("Error getting site log sync status", { error });
    return { autoSyncEnabled: true, lastSynced: null, pendingCount: 0 };
  }
}

export async function getPendingSiteLogs(): Promise<any[]> {
  try {
    const result = await powerSync.execute(
      `SELECT * FROM ps_crud 
       WHERE (tx_table = 'site_logs' OR tx_table = 'chiller_readings') 
       AND upload_status = 0`
    );
    return result.rows?._array || [];
  } catch (error) {
    logger.error("Error getting pending site logs", { error });
    return [];
  }
}

export async function setSiteLogAutoSyncEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SITELOG_AUTO_SYNC_KEY, enabled.toString());
    logger.info(`Site log auto-sync ${enabled ? "enabled" : "disabled"}`);
  } catch (error) {
    logger.error("Error setting site log auto-sync", { error });
  }
}

export async function clearAllOfflineSiteLogData(): Promise<void> {
  try {
    await powerSync.execute("DELETE FROM site_logs");
    await powerSync.execute("DELETE FROM chiller_readings");
    await AsyncStorage.multiRemove([SITELOG_AUTO_SYNC_KEY, SITELOG_LAST_SYNC_KEY]);
    logger.info("Cleared all offline site log data");
  } catch (error) {
    logger.error("Error clearing offline site log data", { error });
    throw error;
  }
}
