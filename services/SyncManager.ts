import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { AppState, AppStateStatus } from "react-native";
import {
  syncPendingTicketUpdates,
  pullRecentTickets,
} from "@/utils/syncTicketStorage";
import {
  syncPendingSiteLogs,
  pullRecentSiteLogs,
  pullRecentChillerReadings,
} from "@/utils/syncSiteLogStorage";
import { authService } from "./AuthService";
import logger from "@/utils/logger";

// We need to avoid hardcoded URLs if possible, but for sync we need API connection
// Ideally this comes from a config or env
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { API_BASE_URL } from "../constants/api";

const API_URL = API_BASE_URL;
const BACKGROUND_SYNC_TASK = "BACKGROUND_SYNC_TASK";

// Register background task in the global scope
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  const manager = SyncManager.getInstance();
  await manager.triggerSync("background");
});

class SyncManager {
  private static instance: SyncManager;
  private isSyncing = false;
  private networkUnsubscribe: (() => void) | null = null;
  private appStateSubscription: any = null;
  private lastSyncTime: number = 0;
  private lastHistoryPullTime: number = 0;
  private syncCooldown = 30000; // 30 seconds minimum between syncs
  private historyPullThreshold = 12 * 60 * 60 * 1000; // 12 hours for expensive history pulls
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private currentSyncPromise: Promise<void> | null = null;

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
    this.registerBackgroundFetchAsync();
    logger.info("SyncManager initialized", { module: "SYNC_MANAGER" });
  }

  /**
   * Register background fetch task
   */
  private async registerBackgroundFetchAsync(): Promise<void> {
    try {
      const isRegistered =
        await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
      if (!isRegistered) {
        await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
          minimumInterval: 15 * 60, // 15 minutes
        });
        logger.info("Background sync task registered", {
          module: "SYNC_MANAGER",
        });
      }
    } catch (err: any) {
      logger.error("Failed to register background fetch", {
        module: "SYNC_MANAGER",
        error: err.message,
      });
    }
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
          // Debounce network reconnection events to prevent "event storms" during startup
          if (this.debounceTimer) clearTimeout(this.debounceTimer);
          this.debounceTimer = setTimeout(() => {
            logger.debug("Network stabilized, triggering sync", {
              module: "SYNC_MANAGER",
              reason: "network_reconnect",
            });
            this.triggerSync("network_reconnect");
          }, 2000);
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

    // Cooldown check (except for manual sync and background)
    const isBackground = reason === "background";
    const isManual = reason === "manual";

    if (
      !isManual &&
      !isBackground &&
      now - this.lastSyncTime < this.syncCooldown
    ) {
      logger.debug("Sync skipped - cooldown active", {
        module: "SYNC_MANAGER",
      });
      return;
    }

    if (this.isSyncing && this.currentSyncPromise) {
      logger.debug("Sync already in progress, awaiting current sync", {
        module: "SYNC_MANAGER",
      });
      return this.currentSyncPromise;
    }

    this.isSyncing = true;
    this.currentSyncPromise = this.performSync(reason);

    try {
      await this.currentSyncPromise;
      this.lastSyncTime = now;
    } finally {
      this.isSyncing = false;
      this.currentSyncPromise = null;
    }
  }

  /**
   * Prefetch all essential data for current user
   */
  async prefetchAll(): Promise<void> {
    if (!authService.getValidToken()) return;

    logger.info("Starting background prefetch", { module: "SYNC_MANAGER" });

    // We run these in parallel without blocking
    Promise.all([
      this.triggerSync("prefetch"),
      // Add other specific prefetch calls here if needed as they are implemented
    ]).catch((err) => {
      logger.error("Prefetch failed", {
        module: "SYNC_MANAGER",
        error: err.message,
      });
    });
  }

  /**
   * Internal sync logic
   */
  private async performSync(reason: string): Promise<void> {
    const now = Date.now();
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

      // Sync ticket updates
      try {
        const ticketResult = await syncPendingTicketUpdates(token, API_URL);

        // Also pull recent tickets for history (with threshold)
        if (
          now - this.lastHistoryPullTime > this.historyPullThreshold ||
          reason === "manual"
        ) {
          // We need site codes from user context or similar.
          const siteCode = await authService.getCurrentSiteCode();
          if (siteCode) {
            const pullTicketResult = await pullRecentTickets(
              siteCode,
              token,
              API_URL,
            );
            logger.info("Ticket history pull complete", {
              module: "SYNC_MANAGER",
              pulled: pullTicketResult.pulled,
            });
          }
        }

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

      // Sync site logs and chiller readings
      try {
        const siteLogResult = await syncPendingSiteLogs(token, API_URL);

        // Also pull recent logs to populate history/tasks
        if (
          siteLogResult.synced > 0 ||
          now - this.lastHistoryPullTime > this.historyPullThreshold ||
          reason === "manual"
        ) {
          logger.debug("Pulling recent history (Smart Pull)", {
            module: "SYNC_MANAGER",
            reason,
          });
          const siteLogResult = await pullRecentSiteLogs(token, API_URL);
          const chillerResult = await pullRecentChillerReadings(token, API_URL);
          const ticketResult = await pullRecentTickets(
            (await authService.getCurrentSiteCode()) || "",
            token,
            API_URL,
          );

          logger.info("Background pull complete", {
            module: "SYNC_MANAGER",
            siteLogs: siteLogResult.pulled,
            chillerReadings: chillerResult.pulled,
            tickets: ticketResult.pulled,
          });

          this.lastHistoryPullTime = now;
        }

        logger.info("Site logs sync complete", {
          module: "SYNC_MANAGER",
          synced: siteLogResult.synced,
          failed: siteLogResult.failed,
        });
      } catch (err: any) {
        logger.error("Error syncing site logs/history", {
          module: "SYNC_MANAGER",
          error: err.message,
        });
      }

      // Sync PM responses and pull PM instances
      try {
        const PMService = (await import("./PMService")).default;
        await PMService.pushPendingResponses();

        const siteCode = await authService.getCurrentSiteCode();
        if (siteCode) {
          await PMService.pullFromServer(siteCode);
        }

        logger.info("PM sync complete", { module: "SYNC_MANAGER" });
      } catch (err: any) {
        logger.error("PM sync failed", {
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
