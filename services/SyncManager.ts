/**
 * SyncManager — PowerSync Edition
 *
 * Dramatically simplified from the WatermelonDB version. PowerSync handles:
 *  - Pull sync (via Postgres logical replication — automatic)
 *  - Background sync scheduling
 *  - Network reconnection detection
 *  - Conflict detection
 *
 * This manager now only handles:
 *  - Connecting/disconnecting PowerSync
 *  - Exposing sync status to the UI
 *  - Login prefetch trigger
 */

import { powerSync } from "@/database";
import { SmartOpsConnector } from "@/database/connector";
import logger from "@/utils/logger";

class SyncManager {
  private static instance: SyncManager;
  private connector: SmartOpsConnector | null = null;
  private isConnected = false;

  private constructor() {}

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  /**
   * Initialize — call once on app start after authentication.
   * Connects PowerSync to the backend via the SmartOpsConnector.
   */
  async initialize(): Promise<void> {
    if (this.isConnected) {
      logger.debug("SyncManager already connected", {
        module: "SYNC_MANAGER",
      });
      return;
    }

    try {
      this.connector = new SmartOpsConnector();
      await powerSync.connect(this.connector);
      this.isConnected = true;
      logger.info("PowerSync connected", { module: "SYNC_MANAGER" });
    } catch (err: any) {
      logger.error("Failed to connect PowerSync", {
        module: "SYNC_MANAGER",
        error: err.message,
      });
    }
  }

  /**
   * Disconnect PowerSync — call on logout or app teardown.
   */
  async cleanup(): Promise<void> {
    try {
      await powerSync.disconnect();
      this.isConnected = false;
      this.connector = null;
      logger.info("PowerSync disconnected", { module: "SYNC_MANAGER" });
    } catch (err: any) {
      logger.error("PowerSync disconnect error", {
        module: "SYNC_MANAGER",
        error: err.message,
      });
    }
  }

  /**
   * Trigger a manual sync (e.g. pull-to-refresh).
   * PowerSync handles the actual sync — this just nudges it.
   */
  async triggerSync(_reason: string = "manual"): Promise<void> {
    if (!this.isConnected) {
      logger.warn("Cannot sync — PowerSync not connected", {
        module: "SYNC_MANAGER",
      });
      return;
    }

    // PowerSync automatically syncs, but we can trigger an immediate check
    // by disconnecting and reconnecting (the SDK doesn't expose a force-sync API).
    // For pull-to-refresh UX, the data is already live — this is mostly a no-op.
    logger.debug("Manual sync requested — PowerSync handles this automatically", {
      module: "SYNC_MANAGER",
    });
  }

  /**
   * Prefetch all data — called after login.
   * With PowerSync, the initial sync happens automatically on connect.
   * This method ensures we wait for the first full sync to complete.
   */
  async prefetchAll(): Promise<void> {
    if (!this.isConnected) {
      await this.initialize();
    }

    // Wait for the initial sync to complete (or timeout after 30s)
    const start = Date.now();
    const timeout = 30000;

    while (Date.now() - start < timeout) {
      const status = powerSync.currentStatus;
      if (status?.connected && !status?.downloading) {
        logger.info("Initial sync complete", { module: "SYNC_MANAGER" });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    logger.warn("Prefetch timed out — sync may still be in progress", {
      module: "SYNC_MANAGER",
    });
  }

  /**
   * Get current sync status for UI display.
   */
  getStatus(): {
    isSyncing: boolean;
    lastSyncTime: number;
    connected: boolean;
  } {
    const status = powerSync.currentStatus;
    return {
      isSyncing: status?.downloading || status?.uploading || false,
      lastSyncTime: status?.lastSyncedAt?.getTime() || 0,
      connected: status?.connected || false,
    };
  }

  /**
   * Clear all local data — used for logout.
   */
  async clearAllData(): Promise<void> {
    await powerSync.disconnectAndClear();
    this.isConnected = false;
    this.connector = null;
    logger.info("PowerSync data cleared", { module: "SYNC_MANAGER" });
  }
}

export const syncManager = SyncManager.getInstance();
