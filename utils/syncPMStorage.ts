import AsyncStorage from "@react-native-async-storage/async-storage";
import { Q } from "@nozbe/watermelondb";
import {
  database,
  pmChecklistMasterCollection,
  pmChecklistItemCollection,
  pmInstanceCollection,
  pmResponseCollection,
} from "../database";
import logger from "./logger";

const PM_SYNC_STATUS_KEY = "@pm_sync_status";

export interface PMSyncStatus {
  lastSynced: string | null;
  pendingCount: number;
  autoSyncEnabled: boolean;
}

/**
 * Get PM sync status from AsyncStorage
 */
export async function getPMSyncStatus(): Promise<PMSyncStatus> {
  try {
    const data = await AsyncStorage.getItem(PM_SYNC_STATUS_KEY);
    const status = data
      ? JSON.parse(data)
      : {
          lastSynced: null,
          pendingCount: 0,
          autoSyncEnabled: true,
        };

    const pendingCount = await getPendingPMCount();
    return { ...status, pendingCount };
  } catch (error: any) {
    logger.error("Error getting PM sync status", {
      module: "PM_SYNC_STORAGE",
      error: error.message,
    });
    return {
      lastSynced: null,
      pendingCount: 0,
      autoSyncEnabled: true,
    };
  }
}

/**
 * Update PM sync status in AsyncStorage
 */
export async function updatePMSyncStatus(
  updates: Partial<PMSyncStatus>,
): Promise<void> {
  try {
    const current = await getPMSyncStatus();
    await AsyncStorage.setItem(
      PM_SYNC_STATUS_KEY,
      JSON.stringify({ ...current, ...updates }),
    );
  } catch (error: any) {
    logger.error("Error updating PM sync status", {
      module: "PM_SYNC_STORAGE",
      error: error.message,
    });
  }
}

/**
 * Update PM last synced timestamp to now
 */
export async function updatePMLastSynced(): Promise<void> {
  await updatePMSyncStatus({ lastSynced: new Date().toISOString() });
}

/**
 * Get count of pending PM updates (un-synced instances or responses)
 */
export async function getPendingPMCount(): Promise<number> {
  try {
    const pendingInstances = await pmInstanceCollection
      .query(Q.where("is_synced", false))
      .fetchCount();
    const pendingResponses = await pmResponseCollection
      .query(Q.where("is_synced", false))
      .fetchCount();
    return pendingInstances + pendingResponses;
  } catch (error: any) {
    logger.error("Error getting pending PM count", {
      module: "PM_SYNC_STORAGE",
      error: error.message,
    });
    return 0;
  }
}

/**
 * Toggle auto-sync for PM
 */
export async function setPMAutoSyncEnabled(enabled: boolean): Promise<void> {
  await updatePMSyncStatus({ autoSyncEnabled: enabled });
}

/**
 * Clear all offline PM data
 */
export async function clearAllOfflinePMData(): Promise<void> {
  await database.write(async () => {
    const allInstances = await pmInstanceCollection.query().fetch();
    const allResponses = await pmResponseCollection.query().fetch();
    const allChecklists = await pmChecklistMasterCollection.query().fetch();
    const allChecklistItems = await pmChecklistItemCollection.query().fetch();

    for (const record of allInstances) await record.destroyPermanently();
    for (const record of allResponses) await record.destroyPermanently();
    for (const record of allChecklists) await record.destroyPermanently();
    for (const record of allChecklistItems) await record.destroyPermanently();
  });
  await AsyncStorage.removeItem(PM_SYNC_STATUS_KEY);
}
