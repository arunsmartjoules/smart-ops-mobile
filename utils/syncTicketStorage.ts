import { Q } from "@nozbe/watermelondb";
import {
  database,
  ticketCollection,
  ticketUpdateCollection,
} from "../database";
import { fetchWithTimeout, syncWithRetry } from "./apiHelper";
import logger from "./logger";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TICKET_SYNC_STATUS_KEY = "@ticket_sync_status";

export interface TicketSyncStatus {
  lastSynced: string | null;
  pendingCount: number;
  autoSyncEnabled: boolean;
}

/**
 * Pull last 3 months of tickets for a site
 */
export async function pullRecentTickets(
  siteId: string,
  token: string,
  apiUrl: string,
): Promise<{ pulled: number }> {
  let pulled = 0;
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const fromDate = ninetyDaysAgo.toISOString();

    const response = await fetchWithTimeout(
      `${apiUrl}/api/complaints/site/${siteId}?fromDate=${fromDate}&limit=1000`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (response.ok) {
      const result = await response.json();
      const tickets = result.data || [];

      if (tickets.length > 0) {
        await database.write(async () => {
          for (const t of tickets) {
            const existing = await ticketCollection
              .query(Q.where("server_id", t.ticket_id || t.id))
              .fetch();

            if (existing.length > 0) {
              await existing[0].update((record) => {
                record.ticketNumber = t.ticket_no;
                record.title = t.title;
                record.description = t.description || t.internal_remarks;
                record.status = t.status;
                record.priority = t.priority;
                record.category = t.category;
                record.area = t.area_asset || t.location;
                record.assignedTo = t.assigned_to;
                record.createdBy = t.created_user || "unknown";
                record.isSynced = true;
              });
            } else {
              await ticketCollection.create((record) => {
                record.serverId = t.ticket_id || t.id;
                record.siteId = siteId;
                record.ticketNumber = t.ticket_no;
                record.title = t.title;
                record.description = t.description || t.internal_remarks;
                record.status = t.status;
                record.priority = t.priority;
                record.category = t.category;
                record.area = t.area_asset || t.location;
                record.assignedTo = t.assigned_to;
                record.createdBy = t.created_user || "unknown";
                record.isSynced = true;
              });
            }
            pulled++;
          }
        });
      }
    }
  } catch (error: any) {
    logger.error("Error pulling recent tickets", {
      module: "TICKET_SYNC",
      error: error.message,
    });
  }
  return { pulled };
}

/**
 * Sync pending ticket updates to server
 */
export async function syncPendingTicketUpdates(
  token: string,
  apiUrl: string,
): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;

  const updates = await ticketUpdateCollection
    .query(Q.where("is_synced", false))
    .fetch();

  for (const update of updates) {
    try {
      const ticket = await ticketCollection.find(update.ticketId);
      if (!ticket || !ticket.serverId) {
        logger.warn("Cannot sync update for missing/local-only ticket", {
          id: update.id,
        });
        continue;
      }

      const updateData = JSON.parse(update.updateData);

      const response = await syncWithRetry(() =>
        fetchWithTimeout(`${apiUrl}/api/complaints/${ticket.serverId}`, {
          method: "PUT", // Or PATCH if backend supports
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(updateData),
        }),
      );

      if (response.ok) {
        await database.write(async () => {
          await update.update((r) => {
            r.isSynced = true;
          });
        });
        synced++;
      } else {
        failed++;
      }
    } catch (err: any) {
      logger.error("Failed to sync ticket update", {
        id: update.id,
        error: err.message,
      });
      failed++;
    }
  }

  return { synced, failed };
}

/**
 * Get ticket sync status
 */
export async function getTicketSyncStatus(): Promise<TicketSyncStatus> {
  const statusStr = await AsyncStorage.getItem(TICKET_SYNC_STATUS_KEY);
  const status = statusStr
    ? JSON.parse(statusStr)
    : {
        lastSynced: null,
        pendingCount: 0,
        autoSyncEnabled: true,
      };

  const pending = await getPendingTicketUpdates();
  return {
    ...status,
    pendingCount: pending.length,
  };
}

/**
 * Update sync status
 */
export async function updateTicketSyncStatus(
  updates: Partial<TicketSyncStatus>,
): Promise<void> {
  const current = await getTicketSyncStatus();
  await AsyncStorage.setItem(
    TICKET_SYNC_STATUS_KEY,
    JSON.stringify({ ...current, ...updates }),
  );
}

/**
 * Get count of pending ticket updates
 */
export async function getPendingTicketUpdates() {
  return await ticketUpdateCollection
    .query(Q.where("is_synced", false))
    .fetch();
}

/**
 * Toggle auto-sync
 */
export async function setTicketAutoSyncEnabled(
  enabled: boolean,
): Promise<void> {
  await updateTicketSyncStatus({ autoSyncEnabled: enabled });
}

/**
 * Clear all offline ticket data
 */
export async function clearAllOfflineTicketData(): Promise<void> {
  await database.write(async () => {
    const allTickets = await ticketCollection.query().fetch();
    const allUpdates = await ticketUpdateCollection.query().fetch();
    for (const t of allTickets) await t.destroyPermanently();
    for (const u of allUpdates) await u.destroyPermanently();
  });
  await AsyncStorage.removeItem(TICKET_SYNC_STATUS_KEY);
}
