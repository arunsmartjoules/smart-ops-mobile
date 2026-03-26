/**
 * Ticket Sync Utilities - PowerSync Edition
 * 
 * Simplified sync status utilities for PowerSync.
 * PowerSync handles actual syncing automatically via logical replication.
 * These utilities just provide status information for the UI.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { powerSync } from "@/database";
import logger from "./logger";

export interface TicketSyncStatus {
  autoSyncEnabled: boolean;
  lastSynced: number | null;
  pendingCount: number;
}

const TICKET_AUTO_SYNC_KEY = "@ticket_auto_sync_enabled";
const TICKET_LAST_SYNC_KEY = "@ticket_last_sync_time";

/**
 * Get current ticket sync status
 */
export async function getTicketSyncStatus(): Promise<TicketSyncStatus> {
  try {
    const [autoSyncStr, lastSyncStr] = await Promise.all([
      AsyncStorage.getItem(TICKET_AUTO_SYNC_KEY),
      AsyncStorage.getItem(TICKET_LAST_SYNC_KEY),
    ]);

    const autoSyncEnabled = autoSyncStr !== "false"; // Default to true
    const lastSynced = lastSyncStr ? parseInt(lastSyncStr, 10) : null;

    return {
      autoSyncEnabled,
      lastSynced,
      pendingCount: 0, // Will be updated by getPendingTicketUpdates
    };
  } catch (error) {
    logger.error("Error getting ticket sync status", { error });
    return {
      autoSyncEnabled: true,
      lastSynced: null,
      pendingCount: 0,
    };
  }
}

/**
 * Get pending ticket updates count
 * With PowerSync, this checks the ps_crud table for unsynced changes
 */
export async function getPendingTicketUpdates(): Promise<any[]> {
  try {
    // Query PowerSync's internal CRUD queue for ticket-related changes
    const result = await powerSync.execute(
      `SELECT * FROM ps_crud 
       WHERE (tx_table = 'tickets' OR tx_table = 'ticket_updates') 
       AND upload_status = 0`
    );
    
    return result.rows?._array || [];
  } catch (error) {
    logger.error("Error getting pending ticket updates", { error });
    return [];
  }
}

/**
 * Get debug info for pending ticket updates
 */
export async function getPendingTicketUpdatesDebug(): Promise<string> {
  try {
    const pending = await getPendingTicketUpdates();
    
    if (pending.length === 0) {
      return "No pending ticket updates";
    }

    const summary = pending.map((item, index) => {
      return `${index + 1}. Table: ${item.tx_table}, Op: ${item.op}, ID: ${item.tx_id}`;
    }).join("\n");

    return `${pending.length} pending updates:\n\n${summary}`;
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Enable/disable auto-sync for tickets
 * Note: PowerSync always syncs automatically. This just controls the UI preference.
 */
export async function setTicketAutoSyncEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(TICKET_AUTO_SYNC_KEY, enabled.toString());
    logger.info(`Ticket auto-sync ${enabled ? "enabled" : "disabled"}`, {
      module: "SYNC_TICKET_STORAGE",
    });
  } catch (error) {
    logger.error("Error setting ticket auto-sync", { error });
  }
}

/**
 * Update last sync timestamp
 */
export async function updateTicketLastSyncTime(): Promise<void> {
  try {
    await AsyncStorage.setItem(TICKET_LAST_SYNC_KEY, Date.now().toString());
  } catch (error) {
    logger.error("Error updating ticket last sync time", { error });
  }
}

/**
 * Clear all offline ticket data
 * With PowerSync, this clears the local database
 */
export async function clearAllOfflineTicketData(): Promise<void> {
  try {
    // Clear PowerSync's local ticket data
    await powerSync.execute("DELETE FROM tickets");
    await powerSync.execute("DELETE FROM ticket_updates");
    
    // Clear sync status
    await AsyncStorage.multiRemove([
      TICKET_AUTO_SYNC_KEY,
      TICKET_LAST_SYNC_KEY,
    ]);
    
    logger.info("Cleared all offline ticket data", {
      module: "SYNC_TICKET_STORAGE",
    });
  } catch (error) {
    logger.error("Error clearing offline ticket data", { error });
    throw error;
  }
}

/**
 * Legacy function - no longer needed with PowerSync
 * PowerSync handles background sync automatically
 */
export async function pullRecentTickets(
  _siteCode: string,
  _token: string,
  _backendUrl: string
): Promise<void> {
  // PowerSync handles this automatically via logical replication
  // This is a no-op for backward compatibility
  logger.debug("pullRecentTickets called - PowerSync handles this automatically", {
    module: "SYNC_TICKET_STORAGE",
  });
}
