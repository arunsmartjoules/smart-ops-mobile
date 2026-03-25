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
  siteCode: string,
  token: string,
  apiUrl: string,
): Promise<{ pulled: number }> {
  let pulled = 0;
  try {
    const oneHundredEightyDaysAgo = new Date();
    oneHundredEightyDaysAgo.setDate(oneHundredEightyDaysAgo.getDate() - 180);
    const fromDate = encodeURIComponent(oneHundredEightyDaysAgo.toISOString());

    const response = await syncWithRetry(() =>
      fetchWithTimeout(
        `${apiUrl}/api/complaints/site/${siteCode}?fromDate=${fromDate}&limit=1000&status=Open,Closed,Resolved,Cancelled,Hold,Waiting,Inprogress`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      ),
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
              const record = existing[0];
              // Only update if local is already synced to avoid overwriting local changes
              if (record.isSynced) {
                await record.update((r) => {
                  r.ticketNumber = t.ticket_no;
                  r.title = t.title;
                  r.description = t.description || t.internal_remarks;
                  r.status = t.status;
                  r.priority = t.priority;
                  r.category = t.category;
                  r.area = t.area_asset || t.location;
                  r.assignedTo = t.assigned_to;
                  r.createdBy = t.created_user || "unknown";
                  r.isSynced = true;
                });
              }
            } else {
              await ticketCollection.create((record) => {
                record.serverId = t.ticket_id || t.id;
                record.siteCode = siteCode;
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
    } else {
      logger.warn("Failed to pull recent tickets", {
        module: "TICKET_SYNC",
        status: response.status,
      });
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

  logger.info("Starting ticket update sync", {
    module: "TICKET_SYNC",
    pendingCount: updates.length,
  });

  for (const update of updates) {
    try {
      const ticket = await ticketCollection.find(update.ticketId);
      if (!ticket || !ticket.serverId) {
        logger.warn("Cannot sync update for missing/local-only ticket", {
          module: "TICKET_SYNC",
          updateId: update.id,
          ticketId: update.ticketId,
        });
        // Mark as synced to prevent it from blocking future syncs
        await database.write(async () => {
          await update.update((r) => {
            r.isSynced = true;
          });
        });
        synced++;
        continue;
      }

      const updateData = JSON.parse(update.updateData);

      logger.debug("Syncing ticket update", {
        module: "TICKET_SYNC",
        updateId: update.id,
        ticketServerId: ticket.serverId,
        updateType: update.updateType,
      });

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
          // Mark the update as synced
          await update.update((r) => {
            r.isSynced = true;
          });
          
          // Mark the ticket itself as synced in WatermelonDB
          await ticket.update((t) => {
            t.isSynced = true;
          });
        });
        synced++;
        logger.info("Ticket update synced successfully", {
          module: "TICKET_SYNC",
          updateId: update.id,
          ticketId: ticket.serverId,
        });
      } else {
        const errorText = await response.text().catch(() => "Unknown error");
        logger.error("Ticket update sync failed - server error", {
          module: "TICKET_SYNC",
          updateId: update.id,
          status: response.status,
          error: errorText,
        });
        failed++;
      }
    } catch (err: any) {
      logger.error("Failed to sync ticket update", {
        module: "TICKET_SYNC",
        id: update.id,
        error: err.message,
      });
      failed++;
    }
  }

  logger.info("Ticket update sync complete", {
    module: "TICKET_SYNC",
    synced,
    failed,
  });

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
 * Update ticket last synced timestamp to now
 */
export async function updateTicketLastSynced(): Promise<void> {
  await updateTicketSyncStatus({ lastSynced: new Date().toISOString() });
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
 * Get detailed info about pending ticket updates for debugging
 */
export async function getPendingTicketUpdatesDebug(): Promise<any[]> {
  const updates = await getPendingTicketUpdates();
  const details = [];
  
  for (const update of updates) {
    try {
      const ticket = await ticketCollection.find(update.ticketId).catch(() => null);
      details.push({
        updateId: update.id,
        ticketId: update.ticketId,
        ticketExists: !!ticket,
        ticketServerId: ticket?.serverId || null,
        updateType: update.updateType,
        updateData: update.updateData,
        createdAt: update.createdAt,
      });
    } catch (err) {
      details.push({
        updateId: update.id,
        ticketId: update.ticketId,
        error: "Failed to load ticket",
      });
    }
  }
  
  return details;
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
