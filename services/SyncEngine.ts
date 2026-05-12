/**
 * SyncEngine — Background sync orchestrator for SmartOps offline architecture.
 *
 * Responsibilities:
 *  - Watch NetInfo + AppState to trigger syncs on foreground/online transitions
 *  - Flush the offline_queue before pulling fresh data
 *  - Pull each DataDomain in priority order, isolated per domain
 *  - Respect per-domain TTLs via CacheManager.getLastSyncedAt
 *  - Emit SyncStatus to all subscribers after every state change
 *  - Debounce concurrent syncNow() calls (return in-flight Promise)
 */

import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { startOfDay, endOfDay, addDays } from "date-fns";
import { AppState, AppStateStatus } from "react-native";
import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import { apiFetch as centralApiFetch } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import cacheManager, { DataDomain } from "./CacheManager";
import { SiteLogService } from "./SiteLogService";
import PMService from "./PMService";
import logger from "../utils/logger";
import { getValidAuthToken } from "./AuthTokenManager";

// ─── Background Fetch Task ────────────────────────────────────────────────────

export const BACKGROUND_SYNC_TASK = "BACKGROUND_SYNC_TASK";

/**
 * Global background task definition — MUST be in global scope.
 * This runs when the OS wakes the app in the background.
 */
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    const token = await getValidAuthToken();
    const userJson = await AsyncStorage.getItem("auth_user");
    const user = userJson ? JSON.parse(userJson) : null;

    if (!token || !user?.user_id) {
      logger.debug("BackgroundSync: skipping task — no active session or token", {
        module: "SYNC_ENGINE",
      });
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const userId = user.user_id;
    logger.info("BackgroundSync: task triggered", {
      module: "SYNC_ENGINE",
      userId,
    });

    // Android Reliability: Small delay for background tasks to allow native
    // modules (like SQLite) to fully initialize in the new process context.
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Initialize the engine for this user session if needed
    await syncEngine.initialize(userId);

    // Run a full sync cycle
    await syncEngine.syncNow();

    logger.info("BackgroundSync: task completed successfully", {
      module: "SYNC_ENGINE",
      userId,
    });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    logger.error("BackgroundSync: task failed", {
      module: "SYNC_ENGINE",
      error,
    });
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SyncStatus {
  connected: boolean;
  downloading: boolean;
  lastSyncedAt: string | null; // ISO 8601 timestamp
  pendingQueueCount: number;
}

export interface SyncEngine {
  initialize(userId: string): Promise<void>;
  cleanup(): Promise<void>;
  syncNow(): Promise<void>;
  subscribe(listener: (status: SyncStatus) => void): () => void;
  get status(): SyncStatus;
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface DomainSyncHandler {
  domain: DataDomain;
  ttlMs: number;
  sync(userId: string): Promise<void>;
}

// ─── TTL constants (ms) ───────────────────────────────────────────────────────

const TTL = {
  tickets: 10 * 60 * 1000,
  incidents: 10 * 60 * 1000,
  site_logs: 10 * 60 * 1000,
  pm_instances: 5 * 60 * 1000,
  attendance: 5 * 60 * 1000,
  chiller_readings: 15 * 60 * 1000,
  sites: 60 * 60 * 1000,
  reference: 120 * 60 * 1000,
} as const;

// ─── Shared apiFetch helper ───────────────────────────────────────────────────

const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  return centralApiFetch(`${API_BASE_URL}${endpoint}`, options);
};

// ─── SyncEngine implementation ────────────────────────────────────────────────

class SyncEngineImpl implements SyncEngine {
  private _status: SyncStatus = {
    connected: false,
    downloading: false,
    lastSyncedAt: null,
    pendingQueueCount: 0,
  };

  private listeners: Set<(status: SyncStatus) => void> = new Set();
  private userId: string | null = null;

  // Lifecycle handles
  private netUnsubscribe: (() => void) | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  // Debounce: in-flight sync promise
  private syncPromise: Promise<void> | null = null;
  private forceFullSyncOnce = false;
  private hasAttemptedEmptySitesRecovery = false;

  // Track previous connectivity to detect offline→online transitions
  private wasConnected = false;

  // ── Domain handlers (priority order) ────────────────────────────────────

  private readonly domainHandlers: DomainSyncHandler[] = [
    // Priority 0: sites
    {
      domain: "sites",
      ttlMs: TTL.sites,
      sync: async (userId: string) => {
        const response = await apiFetch(`/api/site-users/user/${userId}`);
        if (!response.ok) throw new Error(`sites API ${response.status}`);
        const result = await response.json();
        const records = (result.data || []).map((r: any) => ({
          id: r.id || `${userId}_${r.site_code}`,
          user_id: userId,
          site_id: r.site_id || null,
          site_code: r.site_code,
          site_name: r.site_name || r.name || r.site_code,
        }));
        await cacheManager.write("sites", records);
      },
    },

    // Priority 1: tickets
    {
      domain: "tickets",
      ttlMs: TTL.tickets,
      sync: async (_userId: string) => {
        // Fetch tickets only for the user's authorized sites. If the user has
        // no assigned sites, skip the sync entirely — never request "all".
        const sites = await cacheManager.read<{ site_code: string }>("sites");
        const siteCodes = [...new Set(sites.map((s) => s.site_code))].filter(
          (c) => typeof c === "string" && c.length > 0,
        );
        if (siteCodes.length === 0) {
          logger.debug("SyncEngine.tickets: skipped — user has no sites", {
            module: "SYNC_ENGINE",
          });
          return;
        }

        for (const siteCode of siteCodes) {
          const response = await apiFetch(
            `/api/complaints/site/${siteCode}?limit=100`,
          );
          if (!response.ok) continue;
          const result = await response.json();
          const records = (result.data || []).map((t: any) => ({
            id: t.id,
            site_code: t.site_code || siteCode,
            ticket_number: t.ticket_no || t.ticket_number || "",
            title: t.title || "",
            description: t.internal_remarks || t.description || "",
            status: t.status || "",
            priority: t.priority || "",
            category: t.category || "",
            area: t.area_asset || t.location || "",
            assigned_to: t.assigned_to || "",
            created_by: t.created_user || "",
            created_at: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
            updated_at: Date.now(),
          }));
          await cacheManager.write("tickets", records);
        }
      },
    },

    // Priority 1.5: incidents
    {
      domain: "incidents",
      ttlMs: TTL.incidents,
      sync: async (_userId: string) => {
        const sites = await cacheManager.read<{ site_code: string }>("sites");
        const siteCodes = [...new Set(sites.map((s) => s.site_code))].filter(
          (c) => typeof c === "string" && c.length > 0,
        );
        if (siteCodes.length === 0) {
          logger.debug("SyncEngine.incidents: skipped — user has no sites", {
            module: "SYNC_ENGINE",
          });
          return;
        }

        for (const siteCode of siteCodes) {
          const response = await apiFetch(`/api/incidents?site_code=${encodeURIComponent(siteCode)}&limit=100`);
          if (!response.ok) continue;
          const result = await response.json();
          const records = (result.data || []).map((i: any) => ({
            id: i.id,
            incident_id: i.incident_id || "",
            source: i.source || "Incident",
            ticket_id: i.ticket_id || null,
            site_code: i.site_code || siteCode,
            asset_location: i.asset_location || null,
            raised_by: i.raised_by || null,
            incident_created_time: i.incident_created_time
              ? new Date(i.incident_created_time).getTime()
              : Date.now(),
            incident_updated_time: i.incident_updated_time
              ? new Date(i.incident_updated_time).getTime()
              : null,
            incident_resolved_time: i.incident_resolved_time
              ? new Date(i.incident_resolved_time).getTime()
              : null,
            fault_symptom: i.fault_symptom || "",
            fault_type: i.fault_type || "Others",
            severity: i.severity || "Moderate",
            operating_condition: i.operating_condition || null,
            immediate_action_taken: i.immediate_action_taken || null,
            attachments: JSON.stringify(i.attachments || []),
            rca_attachments: JSON.stringify(i.rca_attachments || []),
            remarks: i.remarks || null,
            status: i.status || "Open",
            rca_status: i.rca_status || "Open",
            assigned_by: i.assigned_by || null,
            assignment_type: i.assignment_type || null,
            vendor_tagged: i.vendor_tagged || null,
            rca_maker: i.rca_maker || null,
            rca_checker: i.rca_checker || null,
            assigned_to: JSON.stringify(i.assigned_to || []),
            created_at: i.created_at ? new Date(i.created_at).getTime() : Date.now(),
            updated_at: i.updated_at ? new Date(i.updated_at).getTime() : Date.now(),
          }));
          await cacheManager.write("incidents", records);
        }
      },
    },

    // Priority 2: site_logs
    {
      domain: "site_logs",
      ttlMs: TTL.site_logs,
      sync: async (_userId: string) => {
        const sites = await cacheManager.read<{ site_code: string }>("sites");
        const siteCodes = [...new Set(sites.map((s) => s.site_code))].filter(
          (c) => typeof c === "string" && c.length > 0,
        );
        if (siteCodes.length === 0) {
          logger.debug("SyncEngine.site_logs: skipped — user has no sites", {
            module: "SYNC_ENGINE",
          });
          return;
        }

        // Pull each log type separately to avoid the 500-record limit cutting off any type
        const fromDateObj = startOfDay(addDays(new Date(), -7));
        const toDateObj = endOfDay(addDays(new Date(), 7));
        
        const logTypes = ["Temp RH", "Water", "Chemical Dosing"];
        for (const siteCode of siteCodes) {
          for (const logName of logTypes) {
            await SiteLogService.pullSiteLogs(siteCode, { 
              logName,
              fromDate: fromDateObj.getTime(),
              toDate: toDateObj.getTime()
            });
          }
        }
        await cacheManager.write("site_logs", []);
      },
    },

    // Priority 3: pm_instances
    {
      domain: "pm_instances",
      ttlMs: TTL.pm_instances,
      sync: async (_userId: string) => {
        const sites = await cacheManager.read<{ site_code: string }>("sites");
        const siteCodes = [...new Set(sites.map((s) => s.site_code))].filter(
          (c) => typeof c === "string" && c.length > 0,
        );
        if (siteCodes.length === 0) {
          logger.debug("SyncEngine.pm_instances: skipped — user has no sites", {
            module: "SYNC_ENGINE",
          });
          return;
        }

        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 30);
        const toDate = new Date();
        toDate.setDate(toDate.getDate() + 60);

        for (const siteCode of siteCodes) {
          await PMService.fetchFromAPI(siteCode, 500, 0, fromDate, toDate);
        }
      },
    },

    // Priority 4: attendance
    {
      domain: "attendance",
      ttlMs: TTL.attendance,
      sync: async (userId: string) => {
        const response = await apiFetch(
          `/api/attendance/user/${userId}?page=1&limit=100`,
        );
        if (!response.ok) throw new Error(`attendance API ${response.status}`);
        const result = await response.json();
        const records = (result.data || []).map((log: any) => ({
          id: log.id,
          user_id: log.user_id || userId,
          site_code: log.site_code || "",
          date: log.date || "",
          check_in_time: log.check_in_time
            ? new Date(log.check_in_time).getTime()
            : null,
          check_out_time: log.check_out_time
            ? new Date(log.check_out_time).getTime()
            : null,
          check_in_latitude: log.check_in_latitude ?? null,
          check_in_longitude: log.check_in_longitude ?? null,
          check_out_latitude: log.check_out_latitude ?? null,
          check_out_longitude: log.check_out_longitude ?? null,
          check_in_address: log.check_in_address ?? null,
          check_out_address: log.check_out_address ?? null,
          shift_id: log.shift_id ?? null,
          status: log.status || "Present",
          remarks: log.remarks ?? null,
          fieldproxy_punch_id: log.fieldproxy_punch_id ?? null,
          created_at: log.created_at ? new Date(log.created_at).getTime() : Date.now(),
          updated_at: log.updated_at ? new Date(log.updated_at).getTime() : Date.now(),
        }));
        await cacheManager.write("attendance", records);
      },
    },

    // Priority 5: chiller_readings
    {
      domain: "chiller_readings",
      ttlMs: TTL.chiller_readings,
      sync: async (_userId: string) => {
        const sites = await cacheManager.read<{ site_code: string }>("sites");
        const siteCodes = [...new Set(sites.map((s) => s.site_code))].filter(
          (c) => typeof c === "string" && c.length > 0,
        );
        if (siteCodes.length === 0) {
          logger.debug(
            "SyncEngine.chiller_readings: skipped — user has no sites",
            { module: "SYNC_ENGINE" },
          );
          return;
        }

        for (const siteCode of siteCodes) {
          await SiteLogService.pullChillerReadings(siteCode);
        }
        await cacheManager.write("chiller_readings", []);
      },
    },

    // Priority 6: reference (areas + categories + log_master)
    {
      domain: "areas", // used as the representative domain for TTL check
      ttlMs: TTL.reference,
      sync: async (_userId: string) => {
        // areas — per site
        const sites = await cacheManager.read<{ site_code: string }>("sites");
        const siteCodes = [...new Set(sites.map((s) => s.site_code))].filter(
          (c) => typeof c === "string" && c.length > 0,
        );
        // Site-scoped reference data is skipped when no sites are authorized,
        // but global reference data (categories, log_master) below still runs.
        for (const siteCode of siteCodes) {
          const response = await apiFetch(`/api/assets/site/${siteCode}`);
          if (!response.ok) continue;
          const result = await response.json();
          const records = (result.data || []).map((a: any) => ({
            id: a.id,
            site_code: a.site_code || siteCode,
            asset_name: a.asset_name || "",
            asset_type: a.asset_type ?? null,
            location: a.location ?? null,
            description: a.description ?? null,
            created_at: a.created_at ? new Date(a.created_at).getTime() : null,
            updated_at: a.updated_at ? new Date(a.updated_at).getTime() : null,
          }));
          await cacheManager.write("areas", records);
        }

        // categories
        const catResponse = await apiFetch("/api/complaint-categories");
        if (catResponse.ok) {
          const catResult = await catResponse.json();
          const catRecords = (catResult.data || []).map((c: any) => ({
            id: c.id,
            category: c.category || "",
            description: c.description ?? null,
          }));
          await cacheManager.write("categories", catRecords);
        }

        // log_master
        await SiteLogService.pullLogMaster();
        await cacheManager.write("log_master", []);
      },
    },
  ];

  // ── Status helpers ────────────────────────────────────────────────────────

  get status(): SyncStatus {
    return { ...this._status };
  }

  private setStatus(patch: Partial<SyncStatus>): void {
    this._status = { ...this._status, ...patch };
    this.emit();
  }

  private emit(): void {
    const snapshot = this.status;
    this.listeners.forEach((l) => {
      try {
        l(snapshot);
      } catch (e) {
        logger.warn("SyncEngine: subscriber threw", { module: "SYNC_ENGINE", error: e });
      }
    });
  }

  // ── subscribe ─────────────────────────────────────────────────────────────

  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    // Call immediately with current status (Req 7.2)
    try {
      listener(this.status);
    } catch (e) {
      logger.warn("SyncEngine: subscriber threw on immediate call", {
        module: "SYNC_ENGINE",
        error: e,
      });
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ── initialize ────────────────────────────────────────────────────────────

  async initialize(userId: string): Promise<void> {
    // If already initialized for the same user, skip to avoid stacking listeners
    if (this.userId === userId && this.netUnsubscribe !== null) {
      logger.debug("SyncEngine: already initialized for user, skipping", {
        module: "SYNC_ENGINE",
        userId,
      });
      return;
    }

    // Clean up any previous listeners before re-initializing for a new user
    if (this.netUnsubscribe !== null) {
      await this.cleanup();
    }

    this.userId = userId;
    this.hasAttemptedEmptySitesRecovery = false;

    logger.info("SyncEngine runtime config", {
      module: "SYNC_ENGINE",
      apiBaseUrl: API_BASE_URL,
      userId,
    });

    // Seed connected state
    const netState = await NetInfo.fetch();
    this.wasConnected = netState.isConnected === true;
    const pendingQueueCount = await cacheManager.getQueueCount();
    this.setStatus({
      connected: this.wasConnected,
      pendingQueueCount,
    });

    // If local caches are empty, force a complete first sync (ignore TTL once).
    this.forceFullSyncOnce = await this.areLocalCachesEmpty();

    if (this.wasConnected) {
      await this.runHealthCheck();
    }

    // Watch network changes
    this.netUnsubscribe = NetInfo.addEventListener(
      (state: NetInfoState) => this.onNetworkChange(state),
    );

    // Watch app foreground/background transitions
    this.appStateSubscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => this.onAppStateChange(nextState),
    );

    // 15-minute background interval (Req 2.3)
    this.intervalHandle = setInterval(() => {
      if (this._status.connected) {
        this.syncNow().catch((e) =>
          logger.warn("SyncEngine: interval sync failed", {
            module: "SYNC_ENGINE",
            error: e,
          }),
        );
      }
    }, 15 * 60 * 1000);

    // Trigger an initial sync if online
    if (this.wasConnected) {
      this.syncNow().catch((e) =>
        logger.warn("SyncEngine: initial sync failed", {
          module: "SYNC_ENGINE",
          error: e,
        }),
      );
    }

    logger.info("SyncEngine initialized", {
      module: "SYNC_ENGINE",
      userId,
      connected: this.wasConnected,
    });
  }

  // ── cleanup ───────────────────────────────────────────────────────────────

  async cleanup(): Promise<void> {
    this.netUnsubscribe?.();
    this.netUnsubscribe = null;

    this.appStateSubscription?.remove();
    this.appStateSubscription = null;

    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    this.userId = null;
    this.syncPromise = null;
    this.wasConnected = false;

    this.setStatus({
      connected: false,
      downloading: false,
      lastSyncedAt: null,
      pendingQueueCount: 0,
    });

    logger.info("SyncEngine cleaned up", { module: "SYNC_ENGINE" });
  }

  // ── syncNow ───────────────────────────────────────────────────────────────

  syncNow(): Promise<void> {
    // Debounce: return in-flight promise if already running (Req 2.8 / design note)
    if (this.syncPromise) {
      return this.syncPromise;
    }

    this.syncPromise = this._runSync().finally(() => {
      this.syncPromise = null;
    });

    return this.syncPromise;
  }

  private async _runSync(): Promise<void> {
    if (!this.userId) {
      logger.warn("SyncEngine.syncNow: no userId, skipping", {
        module: "SYNC_ENGINE",
      });
      return;
    }

    const syncStartedAt = Date.now();

    // Set downloading = true (Req 2.5)
    this.setStatus({ downloading: true });

    try {
      // Step 1: Flush offline queue BEFORE pulling fresh data (Req 2.10, 3.7)
      await this._flushQueue();

      // Step 2: Pull each domain in priority order (Req 2.4)
      for (const handler of this.domainHandlers) {
        const eligible = this.forceFullSyncOnce
          ? true
          : await this.isDomainEligible(handler.domain);
        if (!eligible) {
          logger.debug(`SyncEngine: skipping ${handler.domain} (within TTL)`, {
            module: "SYNC_ENGINE",
          });
          continue;
        }

        try {
          await handler.sync(this.userId!);
          logger.info(`SyncEngine: synced ${handler.domain}`, {
            module: "SYNC_ENGINE",
          });
        } catch (err) {
          // Isolated per domain — failure does not stop others (Req 2.7)
          logger.error(`SyncEngine: domain ${handler.domain} sync failed`, {
            module: "SYNC_ENGINE",
            error: err,
          });
        }
      }

      this.forceFullSyncOnce = false;

      const syncedSites = await cacheManager.read<{ site_code: string }>("sites");
      if (
        this._status.connected &&
        syncedSites.length === 0 &&
        !this.hasAttemptedEmptySitesRecovery
      ) {
        this.hasAttemptedEmptySitesRecovery = true;
        logger.warn("SyncEngine: empty sites after sync, forcing one recovery refresh", {
          module: "SYNC_ENGINE",
          userId: this.userId,
        });
        await this.domainHandlers[0].sync(this.userId);
      }
    } finally {
      // Always clear downloading flag and update lastSyncedAt (Req 2.6)
      const pendingQueueCount = await cacheManager.getQueueCount();
      this.setStatus({
        downloading: false,
        lastSyncedAt: new Date(syncStartedAt).toISOString(),
        pendingQueueCount,
      });
    }
  }

  private async runHealthCheck(): Promise<void> {
    try {
      const response = await apiFetch("/api/health");
      logger.info("SyncEngine health check result", {
        module: "SYNC_ENGINE",
        status: response.status,
        ok: response.ok,
      });
    } catch (error) {
      logger.warn("SyncEngine health check failed", {
        module: "SYNC_ENGINE",
        error,
      });
    }
  }

  private async areLocalCachesEmpty(): Promise<boolean> {
    try {
      const [sites, tickets, attendance, pmInstances] = await Promise.all([
        cacheManager.read("sites", { limit: 1 }),
        cacheManager.read("tickets", { limit: 1 }),
        cacheManager.read("attendance", { limit: 1 }),
        cacheManager.read("pm_instances", { limit: 1 }),
      ]);
      return (
        sites.length === 0 &&
        tickets.length === 0 &&
        attendance.length === 0 &&
        pmInstances.length === 0
      );
    } catch {
      return true;
    }
  }

  // ── isDomainEligible ──────────────────────────────────────────────────────

  async isDomainEligible(domain: DataDomain): Promise<boolean> {
    const lastSyncedAt = await cacheManager.getLastSyncedAt(domain);
    if (lastSyncedAt === null) return true; // Never synced → eligible (Req 8.4)

    const ttl = this._getTtlForDomain(domain);
    return Date.now() - lastSyncedAt > ttl;
  }

  private _getTtlForDomain(domain: DataDomain): number {
    const handler = this.domainHandlers.find((h) => h.domain === domain);
    if (handler) return handler.ttlMs;

    // Fallback TTLs for sub-domains not directly in the handler list
    switch (domain) {
      case "categories":
      case "log_master":
        return TTL.reference;
      default:
        return 15 * 60 * 1000;
    }
  }

  // ── Queue flush ───────────────────────────────────────────────────────────

  private async _flushQueue(): Promise<void> {
    const items = await cacheManager.getQueue();
    if (items.length === 0) return;

    logger.info(`SyncEngine: flushing ${items.length} queue items`, {
      module: "SYNC_ENGINE",
    });

    for (const item of items) {
      // Items with retry_count > 5 → dead letter (Req 3.5)
      if (item.retry_count > 5) {
        await cacheManager.deadLetterQueueItem(item.id);
        logger.warn("SyncEngine: item moved to dead_letter", {
          module: "SYNC_ENGINE",
          id: item.id,
          entity_type: item.entity_type,
        });
        continue;
      }

      try {
        await this._processQueueItem(item);
        await cacheManager.dequeue(item.id); // Success → remove (Req 3.3)
      } catch (err: any) {
        const statusCode = err?.statusCode ?? err?.status ?? 0;
        const is4xx = statusCode >= 400 && statusCode < 500;
        const is5xx = statusCode >= 500;

        if (is4xx) {
          // 4xx: increment retry_count, record error, skip for this cycle (Req 3.4)
          await cacheManager.markQueueItemFailed(
            item.id,
            err?.message ?? String(err),
          );
          logger.warn("SyncEngine: queue item 4xx, incremented retry_count", {
            module: "SYNC_ENGINE",
            id: item.id,
            statusCode,
          });
        } else if (is5xx) {
          // 5xx: transient, do NOT increment retry_count (Req 3.4 / design)
          logger.warn("SyncEngine: queue item 5xx, will retry next cycle", {
            module: "SYNC_ENGINE",
            id: item.id,
            statusCode,
          });
        } else {
          // Network error or unknown — treat as transient
          logger.warn("SyncEngine: queue item network error, will retry", {
            module: "SYNC_ENGINE",
            id: item.id,
            error: err?.message,
          });
        }
      }
    }

    // Refresh pending count after flush
    const pendingQueueCount = await cacheManager.getQueueCount();
    this.setStatus({ pendingQueueCount });
  }

  private async _processQueueItem(item: {
    id: string;
    entity_type: string;
    operation: string;
    payload: Record<string, any>;
  }): Promise<void> {
    const { entity_type, operation, payload } = item;

    let endpoint = "";
    let method = "POST";
    let body: string | undefined = JSON.stringify(payload);

    if (entity_type === "ticket_update") {
      const ticketId = payload.ticket_id || payload.id;
      if (operation === "update") {
        endpoint = `/api/complaints?id=${ticketId}`;
        method = "PUT";
      } else {
        endpoint = `/api/complaints`;
        method = "POST";
      }
    } else if (entity_type === "attendance_check_in") {
      endpoint = "/api/attendance/check-in";
      method = "POST";
    } else if (entity_type === "incident_create") {
      endpoint = "/api/incidents";
      method = "POST";
    } else if (entity_type === "incident_update") {
      endpoint = `/api/incidents/${payload.id}`;
      method = "PUT";
    } else if (entity_type === "incident_status_update") {
      endpoint = `/api/incidents/${payload.id}/status`;
      method = "PATCH";
    } else if (entity_type === "incident_rca_status_update") {
      endpoint = `/api/incidents/${payload.id}/rca-status`;
      method = "PATCH";
    } else if (entity_type === "incident_attachment_add") {
      endpoint = `/api/incidents/${payload.id}/attachments`;
      method = "POST";
      body = JSON.stringify({ attachment: payload.attachment });
    } else if (entity_type === "attendance_check_out") {
      const attendanceId = payload.attendance_id || payload.id;
      endpoint = `/api/attendance/${attendanceId}/check-out`;
      method = "POST";

    } else if (entity_type === "notification_token_registration") {
      endpoint = "/api/notifications/register-token";
      method = "POST";
      body = JSON.stringify({
        pushToken: payload.pushToken,
        deviceId: payload.deviceId,
        platform: payload.platform,
      });

    // ── Site log operations ───────────────────────────────────────────────
    } else if (entity_type === "site_log_create") {
      endpoint = "/api/site-logs";
      method = "POST";
    } else if (entity_type === "site_log_update") {
      endpoint = `/api/site-logs/${payload.id}`;
      method = "PUT";
    } else if (entity_type === "site_log_delete") {
      endpoint = `/api/site-logs/${payload.id}`;
      method = "DELETE";
      body = undefined;

    // ── Chiller reading operations ────────────────────────────────────────
    } else if (entity_type === "chiller_reading_create") {
      endpoint = "/api/chiller-readings";
      method = "POST";
    } else if (entity_type === "chiller_reading_update") {
      endpoint = `/api/chiller-readings/${payload.id}`;
      method = "PUT";
    } else if (entity_type === "chiller_reading_delete") {
      endpoint = `/api/chiller-readings/${payload.id}`;
      method = "DELETE";
      body = undefined;

    // ── PM operations ─────────────────────────────────────────────────────
    } else if (entity_type === "pm_response_upsert") {
      endpoint = "/api/pm-response";
      method = "POST";
    } else if (entity_type === "pm_instance_update") {
      endpoint = `/api/pm-instances/${payload.id}`;
      method = "PUT";
      // Convert ms-epoch completed_on to ISO string for Postgres timestamp column
      if (payload.completed_on && typeof payload.completed_on === "number") {
        payload.completed_on = new Date(payload.completed_on).toISOString();
      }
      body = JSON.stringify(payload);

    // ── Ticket line item ──────────────────────────────────────────────────
    } else if (entity_type === "ticket_line_item") {
      endpoint = `/api/complaints/${payload.ticket_id}/line-items`;
      method = "POST";

    // ── Attachment upload (delegated to AttachmentQueueService) ────────────
    } else if (entity_type === "attachment_upload") {
      // Will be handled by AttachmentQueueService in Phase 3
      const { AttachmentQueueService } = require("./AttachmentQueueService");
      await AttachmentQueueService.processAttachment(payload.attachment_queue_id);
      return;

    } else {
      // Unknown entity type — skip silently
      logger.warn("SyncEngine: unknown entity_type in queue", {
        module: "SYNC_ENGINE",
        entity_type,
      });
      return;
    }

    const response = await apiFetch(endpoint, {
      method,
      ...(body ? { body } : {}),
    });

    if (!response.ok) {
      const err: any = new Error(
        `Queue item API error: ${response.status} ${response.statusText}`,
      );
      err.statusCode = response.status;
      throw err;
    }
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  private onNetworkChange(state: NetInfoState): void {
    const isConnected = state.isConnected === true;
    this.setStatus({ connected: isConnected });

    // Offline → online transition: trigger sync within 5 seconds (Req 2.2)
    if (!this.wasConnected && isConnected && this.userId) {
      setTimeout(() => {
        this.syncNow().catch((e) =>
          logger.warn("SyncEngine: online-transition sync failed", {
            module: "SYNC_ENGINE",
            error: e,
          }),
        );
      }, 1000); // 1 second debounce, well within the 5-second requirement
    }

    this.wasConnected = isConnected;
  }

  private onAppStateChange(nextState: AppStateStatus): void {
    if (nextState === "active") {
      // App came to foreground — trigger sync if online (Req 2.1)
      if (this._status.connected && this.userId) {
        this.syncNow().catch((e) =>
          logger.warn("SyncEngine: foreground sync failed", {
            module: "SYNC_ENGINE",
            error: e,
          }),
        );
      }
    } else if (nextState === "background" || nextState === "inactive") {
      // Pause interval when backgrounded (Req 2.9)
      // The interval itself won't fire meaningful work since syncNow checks
      // connectivity, but we clear and restart on next foreground for cleanliness.
      if (this.intervalHandle !== null) {
        clearInterval(this.intervalHandle);
        this.intervalHandle = null;
      }
    }
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const syncEngine = new SyncEngineImpl();

/**
 * Registers the background sync task with the OS.
 * Should be called once during app startup (e.g. in _layout.tsx).
 */
export async function registerBackgroundSyncAsync(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
      logger.debug("BackgroundSync: task already registered", { module: "SYNC_ENGINE" });
    }

    // expo-background-task uses WorkManager (Android) / BGTaskScheduler (iOS);
    // both persist across reboot by default, so the old startOnBoot/
    // stopOnTerminate flags from expo-background-fetch are no longer needed.
    // minimumInterval is now in MINUTES (was seconds).
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 15, // 15 minutes (OS minimum)
    });

    logger.info("BackgroundSync: task registered successfully", {
      module: "SYNC_ENGINE",
    });
  } catch (err) {
    logger.error("BackgroundSync: failed to register task", {
      module: "SYNC_ENGINE",
      error: err,
    });
  }
}

export default syncEngine;
