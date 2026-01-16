import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "./logger";

const OFFLINE_TICKET_KEY = "@offline_ticket_updates";
const TICKET_SYNC_STATUS_KEY = "@ticket_sync_status";

export interface OfflineTicketUpdate {
  id: string;
  ticket_id: string;
  ticket_no: string;
  action: "update_status" | "update_details";
  payload: {
    status?: string;
    remarks?: string;
    area_asset?: string;
    category?: string;
  };
  created_at: string;
  synced: boolean;
}

export interface TicketSyncStatus {
  lastSynced: string | null;
  pendingCount: number;
  autoSyncEnabled: boolean;
}

// Save ticket update offline
export async function saveOfflineTicketUpdate(
  ticketId: string,
  ticketNo: string,
  action: OfflineTicketUpdate["action"],
  payload: OfflineTicketUpdate["payload"]
): Promise<void> {
  try {
    const existing = await getOfflineTicketUpdates();
    const newRecord: OfflineTicketUpdate = {
      id: `offline_ticket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ticket_id: ticketId,
      ticket_no: ticketNo,
      action,
      payload,
      created_at: new Date().toISOString(),
      synced: false,
    };
    await AsyncStorage.setItem(
      OFFLINE_TICKET_KEY,
      JSON.stringify([...existing, newRecord])
    );
    await updateTicketPendingCount();
  } catch (error: any) {
    logger.error("Error saving offline ticket update", {
      module: "OFFLINE_TICKET_STORAGE",
      error: error.message,
      ticketId,
    });
    throw error;
  }
}

// Get all offline ticket updates
export async function getOfflineTicketUpdates(): Promise<
  OfflineTicketUpdate[]
> {
  try {
    const data = await AsyncStorage.getItem(OFFLINE_TICKET_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error: any) {
    logger.error("Error getting offline ticket updates", {
      module: "OFFLINE_TICKET_STORAGE",
      error: error.message,
    });
    return [];
  }
}

// Get pending (not synced) ticket updates
export async function getPendingTicketUpdates(): Promise<
  OfflineTicketUpdate[]
> {
  const all = await getOfflineTicketUpdates();
  return all.filter((record) => !record.synced);
}

// Mark ticket updates as synced
export async function markTicketUpdatesAsSynced(ids: string[]): Promise<void> {
  try {
    const all = await getOfflineTicketUpdates();
    const updated = all.map((record) =>
      ids.includes(record.id) ? { ...record, synced: true } : record
    );
    await AsyncStorage.setItem(OFFLINE_TICKET_KEY, JSON.stringify(updated));
    await updateTicketPendingCount();
    await updateTicketLastSynced();
  } catch (error: any) {
    logger.error("Error marking ticket updates as synced", {
      module: "OFFLINE_TICKET_STORAGE",
      error: error.message,
    });
    throw error;
  }
}

// Clear synced ticket updates
export async function clearSyncedTicketUpdates(): Promise<void> {
  try {
    const pending = await getPendingTicketUpdates();
    await AsyncStorage.setItem(OFFLINE_TICKET_KEY, JSON.stringify(pending));
  } catch (error: any) {
    logger.error("Error clearing synced ticket updates", {
      module: "OFFLINE_TICKET_STORAGE",
      error: error.message,
    });
    throw error;
  }
}

// Clear all offline ticket data
export async function clearAllOfflineTicketData(): Promise<void> {
  try {
    await AsyncStorage.removeItem(OFFLINE_TICKET_KEY);
    await updateTicketPendingCount();
  } catch (error: any) {
    logger.error("Error clearing all offline ticket data", {
      module: "OFFLINE_TICKET_STORAGE",
      error: error.message,
    });
    throw error;
  }
}

// Sync status management
export async function getTicketSyncStatus(): Promise<TicketSyncStatus> {
  try {
    const data = await AsyncStorage.getItem(TICKET_SYNC_STATUS_KEY);
    if (data) {
      return JSON.parse(data);
    }
    return {
      lastSynced: null,
      pendingCount: 0,
      autoSyncEnabled: true,
    };
  } catch (error: any) {
    logger.error("Error getting ticket sync status", {
      module: "OFFLINE_TICKET_STORAGE",
      error: error.message,
    });
    return {
      lastSynced: null,
      pendingCount: 0,
      autoSyncEnabled: true,
    };
  }
}

export async function updateTicketLastSynced(): Promise<void> {
  const status = await getTicketSyncStatus();
  await AsyncStorage.setItem(
    TICKET_SYNC_STATUS_KEY,
    JSON.stringify({
      ...status,
      lastSynced: new Date().toISOString(),
    })
  );
}

export async function updateTicketPendingCount(): Promise<void> {
  const pending = await getPendingTicketUpdates();
  const status = await getTicketSyncStatus();
  await AsyncStorage.setItem(
    TICKET_SYNC_STATUS_KEY,
    JSON.stringify({
      ...status,
      pendingCount: pending.length,
    })
  );
}

export async function setTicketAutoSyncEnabled(
  enabled: boolean
): Promise<void> {
  const status = await getTicketSyncStatus();
  await AsyncStorage.setItem(
    TICKET_SYNC_STATUS_KEY,
    JSON.stringify({
      ...status,
      autoSyncEnabled: enabled,
    })
  );
}

// Sync pending ticket updates with server
export async function syncPendingTicketUpdates(
  token: string,
  apiUrl: string
): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingTicketUpdates();
  if (pending.length === 0) {
    return { synced: 0, failed: 0 };
  }

  let synced = 0;
  let failed = 0;
  const syncedIds: string[] = [];

  for (const record of pending) {
    try {
      const response = await fetch(
        `${apiUrl}/api/complaints/${record.ticket_id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(record.payload),
        }
      );

      if (response.ok) {
        syncedIds.push(record.id);
        synced++;
      } else {
        failed++;
      }
    } catch (error: any) {
      logger.error("Individual ticket sync failure", {
        module: "OFFLINE_TICKET_STORAGE",
        error: error.message,
        ticketId: record.ticket_id,
      });
      failed++;
    }
  }

  if (syncedIds.length > 0) {
    await markTicketUpdatesAsSynced(syncedIds);

    // Log sync activity to backend
    try {
      await fetch(`${apiUrl}/api/logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "OFFLINE_DATA_SYNC",
          module: "TICKETS",
          description: `Synced ${synced} offline ticket update(s) from device`,
        }),
      });
    } catch (logError) {
      console.log("Failed to log ticket sync activity:", logError);
    }
  }

  return { synced, failed };
}
