import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { AppState, AppStateStatus } from "react-native";
import { syncPendingAttendance } from "@/utils/offlineStorage";
import { syncPendingTicketUpdates } from "@/utils/offlineTicketStorage";
import { authService } from "./AuthService";
import logger from "@/utils/logger";

// We need to avoid hardcoded URLs if possible, but for sync we need API connection
// Ideally this comes from a config or env
const API_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || "http://192.168.31.152:3420";

type SyncStatus = "idle" | "syncing" | "error";

class SyncManager {
  private static instance: SyncManager;
  private isSyncing = false;
  private networkUnsubscribe: (() => void) | null = null;
  private appStateSubscription: any = null;
  private lastSyncTime: number = 0;
  private syncCooldown = 30000; // 30 seconds minimum between syncs

  private constructor() {}

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  /**
   * Initialize sync manager - call once on app start
   */
  initialize(): void {
    this.setupNetworkListener();
    this.setupAppStateListener();
    logger.info("SyncManager initialized", { module: "SYNC_MANAGER" });
  }

  /**
   * Cleanup - call on logout or app unmount
   */
  cleanup(): void {
    if (this.networkUnsubscribe) {
      this.networkUnsubscribe();
      this.networkUnsubscribe = null;
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    logger.info("SyncManager cleanup complete", { module: "SYNC_MANAGER" });
  }

  /**
   * Listen for network reconnection
   */
  private setupNetworkListener(): void {
    this.networkUnsubscribe = NetInfo.addEventListener(
      (state: NetInfoState) => {
        if (state.isConnected && state.isInternetReachable) {
          logger.debug("Network connected, triggering sync", {
            module: "SYNC_MANAGER",
          });
          this.triggerSync("network_reconnect");
        }
      },
    );
  }

  /**
   * Listen for app returning to foreground
   */
  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (nextState === "active") {
          logger.debug("App foregrounded, triggering sync", {
            module: "SYNC_MANAGER",
          });
          this.triggerSync("app_foreground");
        }
      },
    );
  }

  /**
   * Trigger sync with cooldown protection
   */
  async triggerSync(reason: string = "manual"): Promise<void> {
    const now = Date.now();

    // Cooldown check (except for manual sync)
    // If reason is manual, we bypass cooldown
    if (reason !== "manual" && now - this.lastSyncTime < this.syncCooldown) {
      logger.debug("Sync skipped - cooldown active", {
        module: "SYNC_MANAGER",
      });
      return;
    }

    if (this.isSyncing) {
      logger.debug("Sync already in progress", { module: "SYNC_MANAGER" });
      return;
    }

    // Check network
    const networkState = await NetInfo.fetch();
    if (!networkState.isConnected || !networkState.isInternetReachable) {
      logger.debug("Sync skipped - no network", { module: "SYNC_MANAGER" });
      return;
    }

    this.isSyncing = true;
    this.lastSyncTime = now;

    try {
      logger.info(`Starting sync (reason: ${reason})`, {
        module: "SYNC_MANAGER",
      });

      // Get token (will refresh if needed)
      const token = await authService.getValidToken();
      if (!token) {
        logger.warn("Sync aborted - no valid token", {
          module: "SYNC_MANAGER",
        });
        return;
      }

      // Sync attendance records
      try {
        const attendanceResult = await syncPendingAttendance(token, API_URL);
        logger.info("Attendance sync complete", {
          module: "SYNC_MANAGER",
          synced: attendanceResult.synced,
          failed: attendanceResult.failed,
        });
      } catch (err: any) {
        logger.error("Attendance sync failed", {
          module: "SYNC_MANAGER",
          error: err.message,
        });
      }

      // Sync ticket updates
      try {
        const ticketResult = await syncPendingTicketUpdates(token, API_URL);
        logger.info("Ticket sync complete", {
          module: "SYNC_MANAGER",
          synced: ticketResult.synced,
          failed: ticketResult.failed,
        });
      } catch (err: any) {
        logger.error("Ticket sync failed", {
          module: "SYNC_MANAGER",
          error: err.message,
        });
      }
    } catch (error: any) {
      logger.error("Sync failed", {
        module: "SYNC_MANAGER",
        error: error.message,
      });
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Get current sync status
   */
  getStatus(): { isSyncing: boolean; lastSyncTime: number } {
    return {
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
    };
  }
}

export const syncManager = SyncManager.getInstance();
