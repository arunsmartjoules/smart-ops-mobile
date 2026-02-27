import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "../utils/logger";
import { authEvents } from "../utils/authEvents";
import {
  cacheAttendance,
  getCachedAttendance,
} from "../utils/offlineDataCache";
import { authService } from "../services/AuthService";
import { fetchWithTimeout } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";

const BACKEND_URL = API_BASE_URL;

const getISTDateString = (d: Date = new Date()) =>
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
  // Get valid token (will refresh if needed)
  let token = await authService.getValidToken();

  const getHeaders = (t: string | null) => ({
    "Content-Type": "application/json",
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
    ...options.headers,
  });

  try {
    let response = await fetchWithTimeout(`${BACKEND_URL}${endpoint}`, {
      ...options,
      headers: getHeaders(token),
    });

    // If 401, try refresh once
    if (response.status === 401) {
      logger.debug(`401 on ${endpoint}, attempting refresh`, {
        module: "ATTENDANCE_SERVICE",
      });
      const newToken = await authService.refreshToken();

      if (newToken) {
        token = newToken;
        // Retry with new token
        response = await fetchWithTimeout(`${BACKEND_URL}${endpoint}`, {
          ...options,
          headers: getHeaders(token),
        });
      }
    }

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
   * Get today's attendance for a user
   */
  async getTodayAttendance(userId: string): Promise<AttendanceLog | null> {
    // 1. Try to get from cache first for immediate return
    const cached = await getCachedAttendance(userId);
    const cachedToday = normalizeAttendanceLog(cached?.today);

    // If we have a valid cached log for today, return it immediately to unblock UI
    const hasValidCache = cachedToday && isAttendanceForToday(cachedToday);

    // 2. Fire off the API check in the background
    const apiPromise = apiFetch(`/api/attendance/user/${userId}/today`).then(
      (result) => {
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
      },
    );

    // If we have cache, return it and let the caller update again if they want
    // (Actual pattern will be implemented in the screen hook/component)
    if (hasValidCache) {
      return cachedToday;
    }

    // If no valid cache, wait for API
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
   * Get user's assigned sites with coordinates
   */
  async getUserSites(userId: string, projectType?: string): Promise<Site[]> {
    const params = new URLSearchParams();
    if (projectType) params.append("project_type", projectType);

    const queryStr = params.toString();
    const result = await apiFetch(
      `/api/attendance/user-sites/${userId}${queryStr ? `?${queryStr}` : ""}`,
    );
    if (result.success) {
      return result.data;
    }
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
   * Check in to a site
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
      return {
        success: false,
        error: "Cannot check in offline. Internet connection required.",
      };
    }

    return result;
  },

  /**
   * Check out from attendance
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
      return {
        success: false,
        error: "Cannot check out offline. Internet connection required.",
      };
    }

    return result;
  },

  /**
   * Get attendance history for a user
   */
  async getAttendanceHistory(
    userId: string,
    page: number = 1,
    limit: number = 30,
  ): Promise<{ data: AttendanceLog[]; pagination: any }> {
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
