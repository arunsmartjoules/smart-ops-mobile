import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { AppState, AppStateStatus } from "react-native";
import {
  syncPendingTicketUpdates,
  pullRecentTickets,
  updateTicketLastSynced,
} from "@/utils/syncTicketStorage";
import {
  syncPendingSiteLogs,
  pullRecentSiteLogs,
  pullRecentChillerReadings,
} from "@/utils/syncSiteLogStorage";
import { syncPendingAttendance } from "@/utils/syncAttendanceStorage";
import { supabase } from "./supabase";
import { updatePMLastSynced } from "@/utils/syncPMStorage";
import logger from "@/utils/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";

// We need to avoid hardcoded URLs if possible, but for sync we need API connection
// Ideally this comes from a config or env
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { API_BASE_URL } from "../constants/api";
import { fetchWithTimeout } from "../utils/apiHelper";
import { cacheSites, cacheAreas, cacheCategories } from "../utils/offlineDataCache";
import { database } from "../database";
import UserSite from "../database/models/UserSite";

const API_URL = API_BASE_URL;
const BACKGROUND_SYNC_TASK = "BACKGROUND_SYNC_TASK";

// Register background task in the global scope
// CRITICAL: This must be defined before SyncManager instance is used
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    logger.info("Background sync task starting...", {
      module: "SYNC_MANAGER",
    });
    // Use the singleton instance
    const manager = SyncManager.getInstance();
    await manager.triggerSync("background");
    logger.info("Background sync task completed successfully", {
      module: "SYNC_MANAGER",
    });
  } catch (err: any) {
    logger.error("Background sync task failed", {
      module: "SYNC_MANAGER",
      error: err.message,
    });
    throw err;
  }
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
    this.loadPersistedTimes();
    logger.info("SyncManager initialized", { module: "SYNC_MANAGER" });
  }

  /**
   * Load persisted timestamps from storage
   */
  private async loadPersistedTimes(): Promise<void> {
    try {
      const globalTime = await AsyncStorage.getItem("@sync_last_time");
      if (globalTime) this.lastSyncTime = parseInt(globalTime);
    } catch (err) {}
  }

  /**
   * Register background fetch task
   */
  private async registerBackgroundFetchAsync(): Promise<void> {
    try {
      const isRegistered =
        await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
      if (!isRegistered) {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
          minimumInterval: 15 * 60, // 15 minutes
          stopOnTerminate: false,
          startOnBoot: true,
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
            // Flush any queued activity logs first, then sync data
            logger.flushActivityQueue().catch(() => {});
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
   * Trigger sync with cooldown protection.
   * network_reconnect and manual triggers bypass the 30s cooldown.
   */
  async triggerSync(reason: string = "manual"): Promise<void> {
    const now = Date.now();

    const isManual = reason === "manual";
    const isBackground = reason === "background";
    const isReconnect = reason === "network_reconnect";

    // Bypass cooldown for manual, background, and network_reconnect triggers
    const bypassCooldown = isManual || isBackground || isReconnect;

    if (!bypassCooldown && now - this.lastSyncTime < this.syncCooldown) {
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
      await AsyncStorage.setItem("@sync_last_time", String(now));
    } finally {
      this.isSyncing = false;
      this.currentSyncPromise = null;
    }
  }

  /**
   * Prefetch all essential data for current user.
   * Runs a full manual sync (bypasses all thresholds) with a 24h staleness guard
   * to avoid redundant prefetch runs on repeated logins within the same day.
   */
  async prefetchAll(): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    // 24h staleness guard — skip if already prefetched recently
    try {
      const lastPrefetch = await AsyncStorage.getItem("@prefetch_last_time");
      if (lastPrefetch) {
        const elapsed = Date.now() - parseInt(lastPrefetch, 10);
        if (elapsed < 24 * 60 * 60 * 1000) {
          logger.debug("Prefetch skipped — already fresh", { module: "SYNC_MANAGER" });
          return;
        }
      }
    } catch (_) {}

    logger.info("Starting prefetch (full manual sync)", { module: "SYNC_MANAGER" });

    try {
      // triggerSync("manual") bypasses all thresholds and runs the full push + pull
      // phase including areas, categories, and sites caching (Fixes 3, 4, 5)
      await this.triggerSync("manual");
      await AsyncStorage.setItem("@prefetch_last_time", String(Date.now()));
      logger.info("Prefetch complete", { module: "SYNC_MANAGER" });
    } catch (err: any) {
      logger.error("Prefetch failed", { module: "SYNC_MANAGER", error: err.message });
    }
  }

  /**
   * Resolve all site codes assigned to the user.
   * Falls back to the cached last_site_{userId} key if AttendanceService fails.
   */
  private async resolveSiteCodes(userId: string): Promise<string[]> {
    try {
      const AttendanceService = (await import("./AttendanceService")).default;
      const sites = await AttendanceService.getUserSites(userId, "JouleCool");
      const codes = sites.map((s: any) => s.site_code).filter(Boolean);
      if (codes.length > 0) {
        // Persist the first site as the "last active" for fallback use
        await AsyncStorage.setItem(`last_site_${userId}`, codes[0]);

        // Persist full sites list to AsyncStorage cache for offline fallback
        await cacheSites(userId, sites);

        // Upsert sites into WatermelonDB user_sites table for offline queries
        try {
          const userSiteCollection = database.get<UserSite>("user_sites");
          await database.write(async () => {
            const existing = await userSiteCollection
              .query()
              .fetch();
            const existingBySiteCode = new Map(
              existing.map((r) => [r.siteCode, r]),
            );
            const now = Date.now();
            const batched = sites.map((site: any) => {
              const record = existingBySiteCode.get(site.site_code);
              if (record) {
                return record.prepareUpdate((r: UserSite) => {
                  r.siteName = site.name || site.site_code;
                  r.cachedAt = now;
                });
              }
              return userSiteCollection.prepareCreate((r: UserSite) => {
                r.serverId = site.id || site.site_code;
                r.userId = userId;
                r.siteCode = site.site_code;
                r.siteName = site.name || site.site_code;
                r.cachedAt = now;
              });
            });
            await database.batch(...batched);
          });
        } catch (dbErr: any) {
          logger.warn("Failed to upsert user_sites in WatermelonDB", {
            module: "SYNC_MANAGER",
            error: dbErr.message,
          });
          // Non-fatal — AsyncStorage cache is the primary offline fallback
        }

        return codes;
      }
    } catch (err: any) {
      logger.error("Failed to resolve site codes from AttendanceService", {
        module: "SYNC_MANAGER",
        error: err.message,
      });
    }

    // Fallback: use cached site code
    const cached = await AsyncStorage.getItem(`last_site_${userId}`).catch(() => null);
    if (cached && cached !== "all") return [cached];
    return [];
  }

  /**
   * Internal sync logic — corrected architecture:
   *  1. Each push module is wrapped in its own try-catch (independent failures)
   *  2. Pull phase always runs after push, never gated on push results
   *  3. network_reconnect and manual triggers bypass the 12h history pull threshold
   *  4. All assigned site codes are iterated in the pull phase
   */
  private async performSync(reason: string): Promise<void> {
    const now = Date.now();
    logger.info(`Starting sync (reason: ${reason})`, { module: "SYNC_MANAGER" });

    // 1. Get auth token
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? null;
    if (!token || !session) {
      logger.warn("Sync aborted - no valid token", { module: "SYNC_MANAGER" });
      return;
    }

    // 2. Resolve all assigned site codes
    const userId = session.user.id;
    const siteCodes = await this.resolveSiteCodes(userId);

    // ─── PUSH PHASE ──────────────────────────────────────────────────────────
    // Each module is independent — an error in one does NOT abort the others.

    // Module 1: Tickets push
    try {
      const ticketResult = await syncPendingTicketUpdates(token, API_URL);
      if (ticketResult.synced > 0) await updateTicketLastSynced();
      logger.info("Ticket push complete", {
        module: "SYNC_MANAGER",
        synced: ticketResult.synced,
        failed: ticketResult.failed,
      });
    } catch (err: any) {
      logger.error("Ticket push failed", { module: "SYNC_MANAGER", error: err.message });
      // continue — do NOT return
    }

    // Module 2: Site logs push (deletions first, then upserts)
    try {
      const siteLogResult = await syncPendingSiteLogs(token, API_URL);
      logger.info("Site log push complete", {
        module: "SYNC_MANAGER",
        synced: siteLogResult.synced,
        failed: siteLogResult.failed,
      });
    } catch (err: any) {
      logger.error("Site log push failed", { module: "SYNC_MANAGER", error: err.message });
      // continue — do NOT return
    }

    // Module 3: PM push
    try {
      const PMService = (await import("./PMService")).default;
      await PMService.pushPendingResponses();
      await PMService.pushPendingInstances();
      logger.info("PM push complete", { module: "SYNC_MANAGER" });
    } catch (err: any) {
      logger.error("PM push failed", { module: "SYNC_MANAGER", error: err.message });
      // continue — do NOT return
    }

    // Module 4: Attendance push
    try {
      const attendanceResult = await syncPendingAttendance(token, API_URL);
      if (attendanceResult.synced > 0 || attendanceResult.failed > 0) {
        logger.info("Attendance push complete", {
          module: "SYNC_MANAGER",
          synced: attendanceResult.synced,
          failed: attendanceResult.failed,
        });
      }
    } catch (err: any) {
      logger.error("Attendance push failed", { module: "SYNC_MANAGER", error: err.message });
      // continue — do NOT return
    }

    // ─── FREQUENT PULL PHASE (Always Runs) ──────────────────────────────────
    // Ensure daily/recent PM tasks and checklists are ALWAYS available
    if (siteCodes.length > 0) {
      try {
        const PMService = (await import("./PMService")).default;
        
        // Lightweight window: -7 to +15 days
        const lightFrom = new Date();
        lightFrom.setDate(lightFrom.getDate() - 7);
        const lightTo = new Date();
        lightTo.setDate(lightTo.getDate() + 15);

        for (const siteCode of siteCodes) {
          await PMService.pullFromServer(siteCode, lightFrom, lightTo);
        }
        logger.info("PM frequent pull complete", { module: "SYNC_MANAGER" });

        // Unconditionally ensure all checklists are cached as requested
        await PMService.pullAllChecklistItems();
        logger.info("PM required checklist sync complete", { module: "SYNC_MANAGER" });
      } catch (err: any) {
        logger.error("PM frequent/checklist pull failed", { module: "SYNC_MANAGER", error: err.message });
      }
    }

    // ─── HEAVY PULL PHASE (Threshold based) ──────────────────────────────────
    // Runs after push. Bypassed by network_reconnect or manual.
    const bypassThreshold = reason === "network_reconnect" || reason === "manual" || reason === "app_foreground";
    const thresholdExceeded = (now - this.lastHistoryPullTime) > this.historyPullThreshold;
    const shouldPull = bypassThreshold || thresholdExceeded;

    if (shouldPull) {
      if (siteCodes.length === 0) {
        logger.warn("No site codes resolved — skipping pull phase", { module: "SYNC_MANAGER" });
      } else {
        logger.info("Starting heavy pull phase", { module: "SYNC_MANAGER", reason, siteCodes });

        // 180-day history window for PM (already fetched last 7 days above)
        const historyFrom = new Date();
        historyFrom.setDate(historyFrom.getDate() - 180);
        const historyTo = new Date();
        historyTo.setDate(historyTo.getDate() - 7);

        for (const siteCode of siteCodes) {
          // Tickets pull
          try {
            const r = await pullRecentTickets(siteCode, token, API_URL);
            logger.info("Ticket pull complete", { module: "SYNC_MANAGER", siteCode, pulled: r.pulled });
          } catch (err: any) {
            logger.error("Ticket pull failed", { module: "SYNC_MANAGER", siteCode, error: err.message });
          }

          // Site logs pull
          try {
            const r = await pullRecentSiteLogs(token, API_URL, siteCode);
            logger.info("Site log pull complete", { module: "SYNC_MANAGER", siteCode, pulled: r.pulled });
          } catch (err: any) {
            logger.error("Site log pull failed", { module: "SYNC_MANAGER", siteCode, error: err.message });
          }

          // Chiller readings pull
          try {
            const r = await pullRecentChillerReadings(token, API_URL, siteCode);
            logger.info("Chiller pull complete", { module: "SYNC_MANAGER", siteCode, pulled: r.pulled });
          } catch (err: any) {
            logger.error("Chiller pull failed", { module: "SYNC_MANAGER", siteCode, error: err.message });
          }

          // PM instances HEAVY pull (last 180 days up to 7 days ago)
          try {
            const PMService = (await import("./PMService")).default;
            await PMService.pullFromServer(siteCode, historyFrom, historyTo);
            logger.info("PM history pull complete", { module: "SYNC_MANAGER", siteCode });
          } catch (err: any) {
            logger.error("PM history pull failed", { module: "SYNC_MANAGER", siteCode, error: err.message });
          }

          // Areas pull — cache per-site for offline ticket creation dropdowns
          try {
            const areasResp = await fetchWithTimeout(
              `${API_URL}/api/assets?site_code=${siteCode}`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (areasResp.ok) {
              const areasResult = await areasResp.json();
              if (areasResult.success && Array.isArray(areasResult.data)) {
                await cacheAreas(siteCode, areasResult.data);
                logger.info("Areas pull complete", { module: "SYNC_MANAGER", siteCode, count: areasResult.data.length });
              }
            }
          } catch (err: any) {
            logger.warn("Areas pull failed", { module: "SYNC_MANAGER", siteCode, error: err.message });
          }
        }

        // Categories pull — global, fetched once per cycle
        try {
          const catResp = await fetchWithTimeout(
            `${API_URL}/api/complaint-categories`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (catResp.ok) {
            const catResult = await catResp.json();
            if (catResult.success && Array.isArray(catResult.data)) {
              await cacheCategories(catResult.data);
              logger.info("Categories pull complete", { module: "SYNC_MANAGER", count: catResult.data.length });
            }
          }
        } catch (err: any) {
          logger.warn("Categories pull failed", { module: "SYNC_MANAGER", error: err.message });
        }

        // Attendance history pull — once per sync cycle, keyed to user
        try {
          const AttendanceService = (await import("./AttendanceService")).default;
          await AttendanceService.getAttendanceHistory(userId, 1, 100);
          logger.info("Attendance history pull complete", { module: "SYNC_MANAGER" });
        } catch (err: any) {
          logger.error("Attendance history pull failed", { module: "SYNC_MANAGER", error: err.message });
        }

        this.lastHistoryPullTime = now;
        await updatePMLastSynced();
      }
    } else {
      const nextPullIn = Math.round(
        (this.historyPullThreshold - (now - this.lastHistoryPullTime)) / 60000
      );
      logger.debug("Pull phase skipped - threshold not exceeded", {
        module: "SYNC_MANAGER",
        reason,
        nextPullIn: `${nextPullIn}m`,
      });
    }

    logger.info(`Sync complete (reason: ${reason})`, { module: "SYNC_MANAGER" });
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
