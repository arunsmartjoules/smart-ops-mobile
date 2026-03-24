import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "./logger";
import { fetchWithTimeout, syncWithRetry } from "./apiHelper";

const ATTENDANCE_QUEUE_KEY = "@offline_attendance_queue";

export type OfflineAttendanceAction =
  | {
      type: "check_in";
      localId: string;
      userId: string;
      siteCode: string;
      timestamp: string;
    }
  | {
      type: "check_out";
      localId: string;
      attendanceId: string; // server id or local optimistic id
      timestamp: string;
      remarks?: string;
    };

export async function getPendingAttendanceQueue(): Promise<OfflineAttendanceAction[]> {
  try {
    const raw = await AsyncStorage.getItem(ATTENDANCE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: OfflineAttendanceAction[]): Promise<void> {
  await AsyncStorage.setItem(ATTENDANCE_QUEUE_KEY, JSON.stringify(queue));
}

export async function queueOfflineCheckIn(
  userId: string,
  siteCode: string,
  timestamp: string,
): Promise<string> {
  const localId = `local-ci-${Date.now()}`;
  const queue = await getPendingAttendanceQueue();
  queue.push({ type: "check_in", localId, userId, siteCode, timestamp });
  await saveQueue(queue);
  logger.info("Queued offline check-in", {
    module: "ATTENDANCE_SYNC",
    localId,
    siteCode,
  });
  return localId;
}

export async function queueOfflineCheckOut(
  attendanceId: string,
  localId: string,
  timestamp: string,
  remarks?: string,
): Promise<void> {
  const queue = await getPendingAttendanceQueue();
  queue.push({ type: "check_out", localId, attendanceId, timestamp, remarks });
  await saveQueue(queue);
  logger.info("Queued offline check-out", {
    module: "ATTENDANCE_SYNC",
    localId,
    attendanceId,
  });
}

export async function clearSyncedAttendance(localIds: string[]): Promise<void> {
  const queue = await getPendingAttendanceQueue();
  const remaining = queue.filter((item) => !localIds.includes(item.localId));
  await saveQueue(remaining);
}

/**
 * Push all queued offline attendance records to the server.
 * Called by SyncManager when back online.
 */
export async function syncPendingAttendance(
  token: string,
  apiUrl: string,
): Promise<{ synced: number; failed: number }> {
  const queue = await getPendingAttendanceQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const syncedIds: string[] = [];

  // Track server-assigned IDs for check-ins so check-outs can reference them
  const localToServerId: Record<string, string> = {};

  for (const item of queue) {
    try {
      if (item.type === "check_in") {
        const response = await syncWithRetry(() =>
          fetchWithTimeout(`${apiUrl}/api/attendance/check-in`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              user_id: item.userId,
              site_code: item.siteCode,
              check_in_time: item.timestamp,
            }),
          }),
        );

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data?.id) {
            localToServerId[item.localId] = result.data.id;
          }
          syncedIds.push(item.localId);
          synced++;
          logger.info("Synced offline check-in", {
            module: "ATTENDANCE_SYNC",
            localId: item.localId,
            serverId: result.data?.id,
          });
        } else {
          failed++;
          logger.warn("Failed to sync offline check-in", {
            module: "ATTENDANCE_SYNC",
            localId: item.localId,
            status: response.status,
          });
        }
      } else if (item.type === "check_out") {
        // Resolve server ID — may have been a local optimistic id
        const serverId =
          localToServerId[item.attendanceId] || item.attendanceId;

        // Skip if still a local id (check-in hasn't synced yet)
        if (serverId.startsWith("local-")) {
          logger.warn("Skipping check-out — check-in not yet synced", {
            module: "ATTENDANCE_SYNC",
            localId: item.localId,
          });
          failed++;
          continue;
        }

        const response = await syncWithRetry(() =>
          fetchWithTimeout(`${apiUrl}/api/attendance/${serverId}/check-out`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              check_out_time: item.timestamp,
              remarks: item.remarks,
            }),
          }),
        );

        if (response.ok) {
          syncedIds.push(item.localId);
          synced++;
          logger.info("Synced offline check-out", {
            module: "ATTENDANCE_SYNC",
            localId: item.localId,
            serverId,
          });
        } else {
          failed++;
          logger.warn("Failed to sync offline check-out", {
            module: "ATTENDANCE_SYNC",
            localId: item.localId,
            status: response.status,
          });
        }
      }
    } catch (err: any) {
      failed++;
      logger.error("Error syncing attendance item", {
        module: "ATTENDANCE_SYNC",
        localId: item.localId,
        error: err.message,
      });
    }
  }

  if (syncedIds.length > 0) {
    await clearSyncedAttendance(syncedIds);
  }

  return { synced, failed };
}
