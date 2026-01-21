import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "./logger";
import { syncWithRetry, fetchWithTimeout } from "./apiHelper";

const OFFLINE_ATTENDANCE_KEY = "@offline_attendance";
const SYNC_STATUS_KEY = "@sync_status";

export interface OfflineAttendanceRecord {
  id: string;
  user_id: string;
  site_id: string;
  punch_type: "punch_in" | "punch_out";
  timestamp: string;
  latitude?: number;
  longitude?: number;
  selfie_url?: string;
  created_at: string;
  synced: boolean;
}

export interface SyncStatus {
  lastSynced: string | null;
  pendingCount: number;
  autoSyncEnabled: boolean;
}

// Save attendance record offline
export async function saveOfflineAttendance(
  record: Omit<OfflineAttendanceRecord, "id" | "created_at" | "synced">,
): Promise<void> {
  try {
    const existing = await getOfflineAttendance();
    const newRecord: OfflineAttendanceRecord = {
      ...record,
      id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date().toISOString(),
      synced: false,
    };
    await AsyncStorage.setItem(
      OFFLINE_ATTENDANCE_KEY,
      JSON.stringify([...existing, newRecord]),
    );
    await updatePendingCount();
  } catch (error: any) {
    logger.error("Error saving offline attendance", {
      module: "OFFLINE_STORAGE",
      error: error.message,
    });
    throw error;
  }
}

// Get all offline attendance records
export async function getOfflineAttendance(): Promise<
  OfflineAttendanceRecord[]
> {
  try {
    const data = await AsyncStorage.getItem(OFFLINE_ATTENDANCE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error: any) {
    logger.error("Error getting offline attendance", {
      module: "OFFLINE_STORAGE",
      error: error.message,
    });
    return [];
  }
}

// Get pending (not synced) attendance records
export async function getPendingAttendance(): Promise<
  OfflineAttendanceRecord[]
> {
  const all = await getOfflineAttendance();
  return all.filter((record) => !record.synced);
}

// Mark records as synced
export async function markAsSynced(ids: string[]): Promise<void> {
  try {
    const all = await getOfflineAttendance();
    const updated = all.map((record) =>
      ids.includes(record.id) ? { ...record, synced: true } : record,
    );
    await AsyncStorage.setItem(OFFLINE_ATTENDANCE_KEY, JSON.stringify(updated));
    await updatePendingCount();
    await updateLastSynced();
  } catch (error: any) {
    logger.error("Error marking records as synced", {
      module: "OFFLINE_STORAGE",
      error: error.message,
    });
    throw error;
  }
}

// Clear synced records (keep pending ones)
export async function clearSyncedRecords(): Promise<void> {
  try {
    const pending = await getPendingAttendance();
    await AsyncStorage.setItem(OFFLINE_ATTENDANCE_KEY, JSON.stringify(pending));
  } catch (error: any) {
    logger.error("Error clearing synced records", {
      module: "OFFLINE_STORAGE",
      error: error.message,
    });
    throw error;
  }
}

// Clear all offline data
export async function clearAllOfflineData(): Promise<void> {
  try {
    await AsyncStorage.removeItem(OFFLINE_ATTENDANCE_KEY);
    await updatePendingCount();
  } catch (error: any) {
    logger.error("Error clearing all offline data", {
      module: "OFFLINE_STORAGE",
      error: error.message,
    });
    throw error;
  }
}

// Sync status management
export async function getSyncStatus(): Promise<SyncStatus> {
  try {
    const data = await AsyncStorage.getItem(SYNC_STATUS_KEY);
    if (data) {
      return JSON.parse(data);
    }
    return {
      lastSynced: null,
      pendingCount: 0,
      autoSyncEnabled: true,
    };
  } catch (error: any) {
    logger.error("Error getting sync status", {
      module: "OFFLINE_STORAGE",
      error: error.message,
    });
    return {
      lastSynced: null,
      pendingCount: 0,
      autoSyncEnabled: true,
    };
  }
}

export async function updateLastSynced(): Promise<void> {
  const status = await getSyncStatus();
  await AsyncStorage.setItem(
    SYNC_STATUS_KEY,
    JSON.stringify({
      ...status,
      lastSynced: new Date().toISOString(),
    }),
  );
}

export async function updatePendingCount(): Promise<void> {
  const pending = await getPendingAttendance();
  const status = await getSyncStatus();
  await AsyncStorage.setItem(
    SYNC_STATUS_KEY,
    JSON.stringify({
      ...status,
      pendingCount: pending.length,
    }),
  );
}

export async function setAutoSyncEnabled(enabled: boolean): Promise<void> {
  const status = await getSyncStatus();
  await AsyncStorage.setItem(
    SYNC_STATUS_KEY,
    JSON.stringify({
      ...status,
      autoSyncEnabled: enabled,
    }),
  );
}

// Sync pending records with server
export async function syncPendingAttendance(
  token: string,
  apiUrl: string,
): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingAttendance();
  if (pending.length === 0) {
    return { synced: 0, failed: 0 };
  }

  let synced = 0;
  let failed = 0;
  const syncedIds: string[] = [];

  for (const record of pending) {
    try {
      const response = await syncWithRetry(() =>
        fetchWithTimeout(`${apiUrl}/api/attendance`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            user_id: record.user_id,
            site_id: record.site_id,
            punch_type: record.punch_type,
            timestamp: record.timestamp,
            latitude: record.latitude,
            longitude: record.longitude,
            selfie_url: record.selfie_url,
          }),
        }),
      );

      if (response.ok) {
        syncedIds.push(record.id);
        synced++;
      } else {
        failed++;
      }
    } catch (error: any) {
      logger.error("Individual record sync failure", {
        module: "OFFLINE_STORAGE",
        error: error.message,
        recordId: record.id,
      });
      failed++;
    }
  }

  if (syncedIds.length > 0) {
    await markAsSynced(syncedIds);

    // Log sync activity to backend
    try {
      await fetchWithTimeout(`${apiUrl}/api/logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "OFFLINE_DATA_SYNC",
          module: "ATTENDANCE",
          description: `Synced ${synced} offline attendance record(s) from device`,
        }),
      });
    } catch (logError) {
      logger.warn("Failed to log sync activity", {
        module: "OFFLINE_STORAGE",
        error: logError,
      });
    }
  }

  return { synced, failed };
}
