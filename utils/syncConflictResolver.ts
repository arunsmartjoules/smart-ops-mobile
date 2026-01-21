export type ConflictStrategy = "server_wins" | "client_wins" | "ask_user";

export interface SyncConflict<T> {
  localData: T;
  serverData: T;
  localUpdatedAt: string;
  serverUpdatedAt: string;
}

export interface ConflictResolution<T> {
  resolved: boolean;
  data: T;
  strategy: ConflictStrategy;
}

/**
 * Detect if there's a conflict between local and server data
 */
export function detectConflict<T extends { updated_at?: string }>(
  localData: T,
  serverData: T,
  localQueuedAt: string,
): boolean {
  if (!serverData.updated_at) return false;

  const serverTime = new Date(serverData.updated_at).getTime();
  const localQueueTime = new Date(localQueuedAt).getTime();

  // Conflict if server was updated after local change was queued
  // We use a small buffer (1s) to avoid false positives due to clock skew
  return serverTime > localQueueTime + 1000;
}

/**
 * Resolve conflict based on strategy
 */
export function resolveConflict<T>(
  conflict: SyncConflict<T>,
  strategy: ConflictStrategy = "server_wins",
): ConflictResolution<T> {
  switch (strategy) {
    case "server_wins":
      return {
        resolved: true,
        data: conflict.serverData,
        strategy: "server_wins",
      };

    case "client_wins":
      return {
        resolved: true,
        data: conflict.localData,
        strategy: "client_wins",
      };

    case "ask_user":
    default:
      return {
        resolved: false,
        data: conflict.localData,
        strategy: "ask_user",
      };
  }
}

/**
 * Merge non-conflicting fields
 */
export function mergeData<T extends Record<string, unknown>>(
  localData: T,
  serverData: T,
  localChangedFields: (keyof T)[],
): T {
  const merged = { ...serverData };

  // Apply only the fields that were changed locally
  for (const field of localChangedFields) {
    if (localData[field] !== undefined) {
      merged[field] = localData[field];
    }
  }

  return merged;
}
