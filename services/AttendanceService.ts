import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import logger from "../utils/logger";
import { authEvents } from "../utils/authEvents";
import {
  cacheAttendance,
  getCachedAttendance,
  cacheSites,
  getCachedSites,
} from "../utils/offlineDataCache";
import {
  queueOfflineCheckIn,
  queueOfflineCheckOut,
} from "../utils/syncAttendanceStorage";
import { supabase } from "./supabase";
import { fetchWithTimeout } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";

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

// Helper for API requests with auth and retry logic
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  // Get valid token from Supabase session (auto-refreshed by SDK)
  const { data: { session } } = await supabase.auth.getSession();
  let token = session?.access_token ?? null;

  const getHeaders = (t: string | null) => ({
    "Content-Type": "application/json",
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
    ...options.headers,
  });

  const fullUrl = `${BACKEND_URL}${endpoint}`;
  try {
    logger.debug(`API Request: ${fullUrl}`, { module: "ATTENDANCE_SERVICE" });
    let response = await fetchWithTimeout(fullUrl, {
      ...options,
      headers: getHeaders(token),
    });

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
        result.error = "No token provided";
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
  address?: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  distance?: number;
  inRange?: boolean;
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
  message: string;
}

// Service functions
export const AttendanceService = {
  /**
   * Get today's attendance for a user.
   * If force is true, it will wait for the API and ignore the cache return path.
   */
  async getTodayAttendance(userId: string, force = false): Promise<AttendanceLog | null> {
    // 1. Try to get from cache first for immediate return
    const cached = await getCachedAttendance(userId);
    const cachedToday = normalizeAttendanceLog(cached?.today);

    // If we have a valid cached log for today, return it immediately to unblock UI
    const hasValidCache = cachedToday && isAttendanceForToday(cachedToday);

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
          const todayFromApi =
            normalized && isAttendanceForToday(normalized) ? normalized : null;

          // Update cache with fresh data
          cacheAttendance(userId, {
            today: todayFromApi,
            history: cached ? cached.history : [],
          });
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
    if (latitude) params.append("latitude", latitude.toString());
    if (longitude) params.append("longitude", longitude.toString());

    const result = await apiFetch(
      `/api/attendance/validate-location/${userId}?${params.toString()}`,
    );
    if (result.success) {
      return result.data;
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

    // OFFLINE FAST PATH: skip all API calls when offline, return cached immediately
    try {
      const netState = await NetInfo.fetch();
      if (netState.isConnected === false) {
        const cached = await getCachedSites(userId);
        if (cached.length > 0) {
          logger.debug("Offline — returning cached sites immediately", {
            module: "ATTENDANCE_SERVICE",
            userId,
            count: cached.length,
          });
          return cached;
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
        // Keep cache warm so offline fallback has fresh data
        cacheSites(userId, mappedSites).catch(() => {});
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
      // Keep cache warm so offline fallback has fresh data
      cacheSites(userId, attendanceSites).catch(() => {});
      return attendanceSites;
    }

    // Offline fallback: return previously cached sites if both network calls failed
    try {
      const cached = await getCachedSites(userId);
      if (cached.length > 0) {
        logger.debug("Returning cached sites (offline fallback)", {
          module: "ATTENDANCE_SERVICE",
          userId,
          count: cached.length,
        });
        return cached;
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
   * Check in to a site.
   * When offline, queues the record locally and returns an optimistic log.
   */
  async checkIn(
    userId: string,
    siteCode: string,
    latitude?: number,
    longitude?: number,
    address?: string,
  ): Promise<{
    success: boolean;
    data?: AttendanceLog;
    error?: string;
    isOffline?: boolean;
  }> {
    const result = await apiFetch("/api/attendance/check-in", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        site_code: siteCode,
        latitude,
        longitude,
        address,
      }),
    });

    if (!result.success && result.isNetworkError) {
      // Queue locally and return optimistic log
      const timestamp = new Date().toISOString();
      const localId = await queueOfflineCheckIn(userId, siteCode, timestamp);
      const optimisticLog: AttendanceLog = {
        id: localId,
        user_id: userId,
        site_code: siteCode,
        date: getISTDateString(),
        check_in_time: timestamp,
        status: "Present",
      };
      return { success: true, data: optimisticLog, isOffline: true };
    }

    return result;
  },

  /**
   * Check out from attendance.
   * When offline, queues the record locally and returns success.
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
    isEarlyCheckout?: boolean;
    hoursWorked?: string;
    isOffline?: boolean;
  }> {
    const result = await apiFetch(`/api/attendance/${attendanceId}/check-out`, {
      method: "POST",
      body: JSON.stringify({
        latitude,
        longitude,
        address,
        remarks,
      }),
    });

    if (!result.success && result.isNetworkError) {
      const timestamp = new Date().toISOString();
      await queueOfflineCheckOut(attendanceId, attendanceId, timestamp, remarks);
      return { success: true, isOffline: true };
    }

    return result;
  },

  /**
   * Get attendance history for a user
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
          const cached = await getCachedAttendance(userId);
          return { data: cached ? cached.history : [], pagination: {} };
        }
        return { data: [], pagination: {} };
      }
    } catch (_) {}

    const result = await apiFetch(
      `/api/attendance/user/${userId}?page=${page}&limit=${limit}`,
    );
    if (result.success) {
      // If first page, update the 'history' part of the cache
      if (page === 1) {
        getCachedAttendance(userId).then((cached) => {
          cacheAttendance(userId, {
            today: cached ? cached.today : null,
            history: result.data,
          });
        });
      }
      return { data: result.data, pagination: result.pagination };
    }

    // Fallback to cache if network error and first page
    if (result.isNetworkError && page === 1) {
      const cached = await getCachedAttendance(userId);
      return { data: cached ? cached.history : [], pagination: {} };
    }
    return { data: [], pagination: {} };
  },
};

export default AttendanceService;
