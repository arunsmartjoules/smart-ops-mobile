import NetInfo from "@react-native-community/netinfo";
import logger from "../utils/logger";
import { authEvents } from "../utils/authEvents";
import { apiFetch as centralApiFetch } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";
import { cacheManager } from "./CacheManager";
import { siteResolver } from "./SiteResolver";
import { db, attendanceLogs } from "../database";
import { and, eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const BACKEND_URL = API_BASE_URL;

export const getISTDateString = (d: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

const safeDate = (value: any): Date | null => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const normalizeAttendanceLog = (log: any): AttendanceLog | null => {
  if (!log) return null;

  const ci = safeDate(log.check_in_time);
  const co = safeDate(log.check_out_time);

  return {
    ...log,
    site_code: log.site_code ?? "",
    check_in_time: ci ? ci.toISOString() : undefined,
    check_out_time: co ? co.toISOString() : undefined,
  } as AttendanceLog;
};

const isAttendanceForToday = (log: AttendanceLog | null | undefined) => {
  if (!log) return false;
  const today = getISTDateString();
  if (log.date && log.date === today) return true;
  const d = safeDate(log.check_in_time || log.check_out_time);
  if (!d) return false;
  return getISTDateString(d) === today;
};

/**
 * Translate an optimistic attendance id (`opt-${client_request_id}`) into the
 * real server-side UUID that was assigned when the queued check-in flushed.
 *
 * Strategy:
 *   1. Flush the offline queue so SyncEngine reconciles the optimistic row.
 *      After reconciliation the local SQLite row will have the server UUID.
 *   2. Re-read today's active attendance from SQLite. If we find a row with a
 *      non-`opt-` id and no check_out_time, that's the swapped record.
 *   3. As a final fallback, hit `/api/attendance/user/{userId}/today` directly.
 *
 * Returns `null` if no real id can be found (e.g. still offline and never
 * synced) so the caller can surface a friendly error.
 */
async function resolveOptimisticAttendanceId(
  optimisticId: string,
): Promise<string | null> {
  // 1. Try a queue flush — best path when network is available.
  try {
    const { syncEngine } = require("./SyncEngine") as typeof import("./SyncEngine");
    await syncEngine.flushQueue();
  } catch (e) {
    logger.warn("resolveOptimisticAttendanceId: flushQueue failed", {
      module: "ATTENDANCE_SERVICE",
      optimisticId,
      error: e,
    });
  }

  // 2. Look for the swapped row in SQLite (active session with a real uuid).
  try {
    const rows = await db
      .select()
      .from(attendanceLogs)
      .orderBy(desc(attendanceLogs.check_in_time))
      .limit(5);
    const today = getISTDateString();
    for (const row of rows) {
      if (!row?.id || row.id.startsWith("opt-")) continue;
      if (row.check_out_time) continue;
      if (row.date && row.date !== today) {
        // Allow cross-day sessions only if they're still within ~17h.
        const ci = safeDate(row.check_in_time);
        if (!ci || Date.now() - ci.getTime() > 17 * 60 * 60 * 1000) continue;
      }
      return row.id;
    }
  } catch (e) {
    logger.warn("resolveOptimisticAttendanceId: SQLite read failed", {
      module: "ATTENDANCE_SERVICE",
      optimisticId,
      error: e,
    });
  }

  // 3. Last-ditch: ask the server directly. We need the user_id, which we
  // can pull from the cached optimistic row.
  try {
    const optRow = await db
      .select()
      .from(attendanceLogs)
      .where(eq(attendanceLogs.id, optimisticId))
      .limit(1);
    const userId = optRow[0]?.user_id;
    if (userId) {
      const result = await apiFetch(`/api/attendance/user/${userId}/today`);
      const serverId = result?.success ? result?.data?.id : null;
      if (typeof serverId === "string" && !serverId.startsWith("opt-")) {
        // Drop the stale optimistic row and cache the server one so future
        // reads pick up the real id.
        try {
          await db.delete(attendanceLogs).where(eq(attendanceLogs.id, optimisticId));
        } catch {
          /* non-fatal */
        }
        await cacheManager.write("attendance", [result.data]).catch(() => {});
        return serverId;
      }
    }
  } catch (e) {
    logger.warn("resolveOptimisticAttendanceId: server lookup failed", {
      module: "ATTENDANCE_SERVICE",
      optimisticId,
      error: e,
    });
  }

  return null;
}

// Helper for API requests with auth and retry logic
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const fullUrl = `${BACKEND_URL}${endpoint}`;
  try {
    logger.debug(`API Request: ${fullUrl}`, { module: "ATTENDANCE_SERVICE" });
    const response = await centralApiFetch(fullUrl, options);

    const result = await response.json();

    if (!response.ok) {
      if (response.status >= 500) {
        logger.error(`API Error (${response.status}) on ${endpoint}`, {
          module: "ATTENDANCE_SERVICE",
          error: result.error,
          status: response.status,
          endpoint,
        });
      } else {
        logger.warn(`API Warning (${response.status}) on ${endpoint}`, {
          module: "ATTENDANCE_SERVICE",
          error: result.error,
          status: response.status,
          endpoint,
        });
      }

      if (response.status === 401) {
        // Silent sign-out: avoid intrusive alerts for token issues
        authEvents.emitUnauthorized();
      }
    }

    return result;
  } catch (error: any) {
    // This catches network errors (no internet, DNS failure, etc.)
    logger.warn(`Network Error on ${endpoint}`, {
      module: "ATTENDANCE_SERVICE",
      error: error.message,
      endpoint,
    });

    return {
      success: false,
      error: "Network unavailable. Please check your internet connection.",
      isNetworkError: true,
    };
  }
};

// Types
export interface Site {
  site_code: string;
  name: string;
  site_name?: string; // Compatibility alias
  address?: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  distance?: number;
  distanceMeters?: number;
  inRange?: boolean;
  isWithinRange?: boolean;
  radius?: number;
}

export interface AttendanceLog {
  id: string;
  user_id: string;
  site_code: string;
  date: string;
  check_in_time?: string;
  check_out_time?: string;
  check_in_latitude?: number;
  check_in_longitude?: number;
  check_out_latitude?: number;
  check_out_longitude?: number;
  check_in_address?: string;
  check_out_address?: string;
  status: "Present" | "Absent" | "Half Day" | "Leave";
  remarks?: string;
  site_name?: string;
}

export interface LocationValidationResult {
  isValid: boolean;
  isWFH: boolean;
  allowedSites: Site[];
  allSites?: Site[];
  nearestSite?: Site;
  resolvedSiteCode?: string | null;
  userLocation?: { latitude: number; longitude: number } | null;
  message: string;
}

// Service functions
export const AttendanceService = {
  /**
   * Get today's attendance for a user.
   * Reads from attendance_logs filtered by user_id and current IST date via CacheManager.
   * If force is true, it will wait for the API and ignore the cache return path.
   */
  async getTodayAttendance(userId: string, force = false): Promise<AttendanceLog | null> {
    const today = getISTDateString();

    // 1. Read from SQLite attendance_logs — look for the most recent session
    let cachedToday: AttendanceLog | null = null;
    try {
      const rows = await db
        .select()
        .from(attendanceLogs)
        .where(eq(attendanceLogs.user_id, userId))
        .orderBy(desc(attendanceLogs.check_in_time))
        .limit(1);

      if (rows.length > 0) {
        const log = normalizeAttendanceLog(rows[0]);
        if (log && !log.check_out_time && log.check_in_time) {
          // If still checked in, check 17-hour limit
          const checkIn = new Date(log.check_in_time);
          const diffHours = (Date.now() - checkIn.getTime()) / (1000 * 60 * 60);
          if (diffHours <= 17) {
            cachedToday = log;
            logger.debug("Found active cross-day/today session", {
              module: "ATTENDANCE_SERVICE",
              diffHours,
            });
          }
        }
        
        // If no active 17h session found, fall back to simple "is it today?" check for the record
        if (!cachedToday && log && log.date === today) {
          cachedToday = log;
        }
      }
    } catch (err) {
      logger.warn("AttendanceService.getTodayAttendance: SQLite read failed", {
        module: "ATTENDANCE_SERVICE",
        userId,
        error: err,
      });
    }

    const hasValidCache = !!cachedToday;

    // 2. Fire off the API check in the background
    const apiPromise = (async () => {
      try {
        const netState = await NetInfo.fetch();
        if (netState.isConnected === false) {
          return null;
        }

        const result = await apiFetch(`/api/attendance/user/${userId}/today`);
        if (result.success) {
          const normalized = normalizeAttendanceLog(result.data);
          // If API returns a check-in from today or a very recent cross-day one
          const todayFromApi = normalized;

          // Write API result back via CacheManager
          if (todayFromApi) {
            await cacheManager.write("attendance", [todayFromApi]);
          }
          return todayFromApi;
        }
        return null;
      } catch (e) {
        return null;
      }
    })();

    // If we have cache and we're NOT forcing a refresh, return it immediately to unblock UI
    if (hasValidCache && !force) {
      return cachedToday;
    }

    // If no valid cache, wait for API (or immediate null if offline via the promise above)
    return apiPromise;
  },

  /**
   * Validate user's location against their assigned sites
   */
  async validateLocation(
    userId: string,
    latitude?: number,
    longitude?: number,
  ): Promise<LocationValidationResult> {
    const params = new URLSearchParams();
    if (latitude != null && longitude != null) {
      params.append("latitude", String(latitude));
      params.append("longitude", String(longitude));
    }

    const result = await apiFetch(
      `/api/attendance/validate-location/${userId}?${params.toString()}`,
    );
    if (result.success) {
      return result.data;
    }

    // Network failure → allow the punch to proceed offline. The check-in will
    // be queued with GPS coords; the server validates the geofence at sync
    // time. Without this fallback the user would be blocked on flaky networks.
    if (result.isNetworkError) {
      const cachedSites = siteResolver.getSites();
      logger.warn("validateLocation offline — falling through to offline punch", {
        module: "ATTENDANCE_SERVICE",
        userId,
        cachedSiteCount: cachedSites.length,
      });
      return {
        isValid: true,
        isWFH: true,
        allowedSites: cachedSites.map((s: any) => ({
          site_code: s.site_code,
          name: s.site_name || s.name || s.site_code,
          site_name: s.site_name || s.name || s.site_code,
          latitude: s.latitude,
          longitude: s.longitude,
          radius: s.radius,
        })) as Site[],
        resolvedSiteCode: null,
        message: "Offline — will validate on sync.",
        userLocation:
          latitude != null && longitude != null
            ? { latitude, longitude }
            : null,
      };
    }

    logger.error("Location validation logic failure", {
      module: "ATTENDANCE_SERVICE",
      userId,
      error: result.error,
    });
    throw new Error(result.error || "Failed to validate location");
  },

  /**
   * Get user's assigned sites with coordinates.
   * Uses siteResolver for cache reads/writes instead of getCachedSites/cacheSites.
   * Defaults to 'JouleCool' project type — only mapped sites are returned.
   */
  async getUserSites(userId: string, projectType: string = "JouleCool"): Promise<Site[]> {
    const normalizeSites = (sites: any[]): Site[] => {
      const uniqueSites = new Map<string, Site>();

      for (const site of sites || []) {
        const siteCode = site?.site_code;
        if (!siteCode || uniqueSites.has(siteCode)) continue;

        uniqueSites.set(siteCode, {
          site_code: siteCode,
          name: site?.site_name || site?.name || siteCode,
          site_name: site?.site_name || site?.name || siteCode,
          address: site?.address,
          city: site?.city,
          state: site?.state,
          latitude: site?.latitude,
          longitude: site?.longitude,
          distance: site?.distance,
          inRange: site?.inRange,
          radius: site?.radius,
        });
      }

      return Array.from(uniqueSites.values());
    };

    // OFFLINE FAST PATH: skip all API calls when offline, return from siteResolver immediately
    try {
      const netState = await NetInfo.fetch();
      if (netState.isConnected === false) {
        const resolvedSites = siteResolver.getSites();
        if (resolvedSites.length > 0) {
          const mapped = normalizeSites(resolvedSites);
          logger.debug("Offline — returning siteResolver sites immediately", {
            module: "ATTENDANCE_SERVICE",
            userId,
            count: mapped.length,
          });
          return mapped;
        }
        // No cache available offline — return empty
        return [];
      }
    } catch (_) {
      // NetInfo check failed — proceed with API attempt
    }

    const mappedSitesResult = await apiFetch(`/api/site-users/user/${userId}`);
    if (mappedSitesResult.success && Array.isArray(mappedSitesResult.data)) {
      const rawSites = projectType
        ? mappedSitesResult.data.filter((r: any) => r.project_type === projectType)
        : mappedSitesResult.data;
      const mappedSites = normalizeSites(rawSites);
      if (mappedSites.length > 0) {
        logger.debug("Loaded mapped sites from site-users", {
          module: "ATTENDANCE_SERVICE",
          userId,
          count: mappedSites.length,
          projectType,
        });
        // Refresh siteResolver so offline fallback has fresh data
        siteResolver.refresh(userId).catch(() => {});
        return mappedSites;
      }
    }

    const params = new URLSearchParams();
    if (projectType) params.append("project_type", projectType);

    const queryStr = params.toString();
    const result = await apiFetch(
      `/api/attendance/user-sites/${userId}${queryStr ? `?${queryStr}` : ""}`,
    );
    if (result.success && Array.isArray(result.data)) {
      const attendanceSites = normalizeSites(result.data);
      logger.debug("Loaded mapped sites from attendance", {
        module: "ATTENDANCE_SERVICE",
        userId,
        count: attendanceSites.length,
        projectType,
      });
      // Refresh siteResolver so offline fallback has fresh data
      siteResolver.refresh(userId).catch(() => {});
      return attendanceSites;
    }

    // Offline fallback: return from siteResolver if both network calls failed
    try {
      const resolvedSites = siteResolver.getSites();
      if (resolvedSites.length > 0) {
        const mapped = normalizeSites(resolvedSites);
        logger.debug("Returning siteResolver sites (offline fallback)", {
          module: "ATTENDANCE_SERVICE",
          userId,
          count: mapped.length,
        });
        return mapped;
      }
    } catch (_) {}

    logger.warn("Failed to load mapped sites", {
      module: "ATTENDANCE_SERVICE",
      userId,
      projectType,
      siteUsersError: mappedSitesResult.error,
      attendanceError: result.error,
    });
    return [];
  },

  /**
   * Get all sites (for admins)
   */
  async getAllSites(): Promise<Site[]> {
    const result = await apiFetch("/api/sites");
    if (result.success) {
      return result.data;
    }
    return [];
  },

  /**
   * Check in. Requires network; server resolves site from GPS for non-WFH.
   * `siteCode` may be null for WFH when not on a geofenced site.
   */
  async checkIn(
    userId: string,
    siteCode: string | null,
    latitude?: number,
    longitude?: number,
    address?: string,
  ): Promise<{
    success: boolean;
    data?: AttendanceLog;
    error?: string;
    queued?: boolean;
    nearestSite?: Site;
    userLocation?: { latitude: number; longitude: number };
  }> {
    const payload = {
      user_id: userId,
      site_code: siteCode,
      latitude,
      longitude,
      address,
      client_request_id: uuidv4(),
      punched_at: new Date().toISOString(),
    };

    const result = await apiFetch("/api/attendance/check-in", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (result.success && result.data) {
      logger.activity(
        "PUNCH_IN",
        "ATTENDANCE",
        `User punched in at ${siteCode ?? "(no site)"}`,
        {
          site_code: siteCode,
          attendance_id: result.data.id,
          offline: false,
        },
      );
      await cacheManager.write("attendance", [result.data]).catch(() => {});
      return result;
    }

    // Network failure → queue and write an optimistic local record so the user
    // is not blocked. Server validation errors (e.g. out of geofence) are
    // surfaced as-is and not queued.
    if (result.isNetworkError) {
      const optimistic: AttendanceLog = {
        id: `opt-${payload.client_request_id}`,
        user_id: userId,
        site_code: siteCode ?? "",
        date: getISTDateString(),
        check_in_time: payload.punched_at,
        check_in_latitude: latitude,
        check_in_longitude: longitude,
        check_in_address: address,
        status: "Present",
      };
      await cacheManager
        .write("attendance", [optimistic as any])
        .catch(() => {});
      await cacheManager
        .enqueue({
          entity_type: "attendance_check_in",
          operation: "create",
          payload,
        })
        .catch(() => {});
      logger.activity(
        "PUNCH_IN",
        "ATTENDANCE",
        `User punched in OFFLINE at ${siteCode ?? "(no site)"}`,
        {
          site_code: siteCode,
          attendance_id: optimistic.id,
          offline: true,
        },
      );
      return { success: true, data: optimistic, queued: true };
    }

    return result;
  },

  /**
   * Check out. If the network is unreachable the request is queued and the
   * local attendance record is updated optimistically; SyncEngine will retry.
   */
  async checkOut(
    attendanceId: string,
    latitude?: number,
    longitude?: number,
    address?: string,
    remarks?: string,
  ): Promise<{
    success: boolean;
    data?: AttendanceLog;
    error?: string;
    queued?: boolean;
    isEarlyCheckout?: boolean;
    hoursWorked?: string;
  }> {
    // Guard: if the caller passed an optimistic id (offline check-in that
    // hasn't been reconciled yet), do not POST it to the server — Postgres
    // will reject it as an invalid uuid. Try to resolve the real id first by
    // flushing the queue and re-reading today's attendance.
    let resolvedId = attendanceId;
    if (typeof attendanceId === "string" && attendanceId.startsWith("opt-")) {
      const swapped = await resolveOptimisticAttendanceId(attendanceId);
      if (swapped) {
        resolvedId = swapped;
      } else {
        logger.warn(
          "checkOut: pending optimistic check-in could not be reconciled",
          { module: "ATTENDANCE_SERVICE", attendanceId },
        );
        return {
          success: false,
          error:
            "Your check-in is still syncing. Please reconnect to the internet and try again in a moment.",
        };
      }
    }

    const payload = {
      attendance_id: resolvedId,
      latitude,
      longitude,
      address,
      remarks,
      punched_at: new Date().toISOString(),
    };

    const result = await apiFetch(`/api/attendance/${resolvedId}/check-out`, {
      method: "POST",
      body: JSON.stringify({ latitude, longitude, address, remarks }),
    });

    if (result.success) {
      logger.activity("PUNCH_OUT", "ATTENDANCE", "User punched out", {
        attendance_id: attendanceId,
        offline: false,
      });
      if (result.data) {
        await cacheManager.write("attendance", [result.data]).catch(() => {});
      }
      return result;
    }

    if (result.isNetworkError) {
      // Update the local record with check_out_time so the UI reflects punch-out
      // immediately. Pull the existing row and patch it.
      try {
        const rows = await db
          .select()
          .from(attendanceLogs)
          .where(eq(attendanceLogs.id, resolvedId))
          .limit(1);
        if (rows.length > 0) {
          await db
            .update(attendanceLogs)
            .set({
              check_out_time: Date.parse(payload.punched_at),
              check_out_latitude: latitude,
              check_out_longitude: longitude,
              check_out_address: address,
              remarks: remarks ?? rows[0].remarks,
            })
            .where(eq(attendanceLogs.id, resolvedId));
        }
      } catch (e) {
        logger.warn("Optimistic check-out local update failed", {
          module: "ATTENDANCE_SERVICE",
          error: e,
        });
      }

      await cacheManager
        .enqueue({
          entity_type: "attendance_check_out",
          operation: "update",
          payload,
        })
        .catch(() => {});

      logger.activity("PUNCH_OUT", "ATTENDANCE", "User punched out OFFLINE", {
        attendance_id: resolvedId,
        offline: true,
      });

      return {
        success: true,
        queued: true,
        data: {
          id: resolvedId,
          user_id: "",
          site_code: "",
          date: getISTDateString(),
          check_out_time: payload.punched_at,
          status: "Present",
        } as AttendanceLog,
      };
    }

    return result;
  },

  /**
   * Get attendance history for a user.
   * Reads from attendance_logs filtered by user_id ordered by check_in_time desc via CacheManager.
   */
  async getAttendanceHistory(
    userId: string,
    page: number = 1,
    limit: number = 100,
  ): Promise<{ data: AttendanceLog[]; pagination: any }> {
    // OFFLINE FAST PATH: return cached history immediately when offline
    try {
      const netState = await NetInfo.fetch();
      if (netState.isConnected === false) {
        if (page === 1) {
          const rows = await db
            .select()
            .from(attendanceLogs)
            .where(eq(attendanceLogs.user_id, userId))
            .orderBy(desc(attendanceLogs.check_in_time));
          return {
            data: rows.map((r) => normalizeAttendanceLog(r)).filter(Boolean) as AttendanceLog[],
            pagination: {},
          };
        }
        return { data: [], pagination: {} };
      }
    } catch (_) {}

    const result = await apiFetch(
      `/api/attendance/user/${userId}?page=${page}&limit=${limit}`,
    );
    if (result.success) {
      // Write API result back via CacheManager (first page only to avoid stale overwrites)
      if (page === 1 && Array.isArray(result.data)) {
        await cacheManager.write("attendance", result.data);
      }
      return { data: result.data, pagination: result.pagination };
    }

    // Fallback to SQLite cache if network error and first page
    if (result.isNetworkError && page === 1) {
      const rows = await db
        .select()
        .from(attendanceLogs)
        .where(eq(attendanceLogs.user_id, userId))
        .orderBy(desc(attendanceLogs.check_in_time));
      return {
        data: rows.map((r) => normalizeAttendanceLog(r)).filter(Boolean) as AttendanceLog[],
        pagination: {},
      };
    }
    return { data: [], pagination: {} };
  },
};

export default AttendanceService;
