/**
 * PM Sync Utilities - PowerSync Edition
 * 
 * Simplified sync status utilities for PowerSync.
 * PowerSync handles actual syncing automatically via logical replication.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { powerSync } from "@/database";
import logger from "./logger";

export interface PMSyncStatus {
  autoSyncEnabled: boolean;
  lastSynced: number | null;
  pendingCount: number;
}

const PM_AUTO_SYNC_KEY = "@pm_auto_sync_enabled";
const PM_LAST_SYNC_KEY = "@pm_last_sync_time";

export async function getPMSyncStatus(): Promise<PMSyncStatus> {
  try {
    const [autoSyncStr, lastSyncStr] = await Promise.all([
      AsyncStorage.getItem(PM_AUTO_SYNC_KEY),
      AsyncStorage.getItem(PM_LAST_SYNC_KEY),
    ]);

    return {
      autoSyncEnabled: autoSyncStr !== "false",
      lastSynced: lastSyncStr ? parseInt(lastSyncStr, 10) : null,
      pendingCount: 0,
    };
  } catch (error) {
    logger.error("Error getting PM sync status", { error });
    return { autoSyncEnabled: true, lastSynced: null, pendingCount: 0 };
  }
}

export async function getPendingPMCount(): Promise<number> {
  try {
    const result = await powerSync.execute(
      `SELECT COUNT(*) as count FROM ps_crud 
       WHERE (tx_table = 'pm_instances' OR tx_table = 'pm_responses') 
       AND upload_status = 0`
    );
    return result.rows?._array[0]?.count || 0;
  } catch (error) {
    logger.error("Error getting pending PM count", { error });
    return 0;
  }
}

export async function setPMAutoSyncEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(PM_AUTO_SYNC_KEY, enabled.toString());
    logger.info(`PM auto-sync ${enabled ? "enabled" : "disabled"}`);
  } catch (error) {
    logger.error("Error setting PM auto-sync", { error });
  }
}

export async function clearAllOfflinePMData(): Promise<void> {
  try {
    await powerSync.execute("DELETE FROM pm_instances");
    await powerSync.execute("DELETE FROM pm_responses");
    await AsyncStorage.multiRemove([PM_AUTO_SYNC_KEY, PM_LAST_SYNC_KEY]);
    logger.info("Cleared all offline PM data");
  } catch (error) {
    logger.error("Error clearing offline PM data", { error });
    throw error;
  }
}
