import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "../utils/logger";
import { authEvents } from "../utils/authEvents";
import {
  cacheAttendance,
  getCachedAttendance,
} from "../utils/offlineDataCache";
import { authService } from "../services/AuthService";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || "http://192.168.31.152:3420";

import {
  saveOfflineAttendance,
  getPendingAttendance,
} from "../utils/offlineStorage";
import { fetchWithTimeout } from "../utils/apiHelper";

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
        result.error =
          "Session expired or invalid. Please sign out and sign in again.";
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
      error: "Network unavailable. Using offline data.",
      isNetworkError: true,
    };
  }
};

// Types
export interface Site {
  site_id: string;
  name: string;
  site_code?: string;
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
  site_id: string;
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
    const result = await apiFetch(`/api/attendance/user/${userId}/today`);
    if (result.success) {
      // Just update the 'today' part of the cache without triggering a full history fetch
      getCachedAttendance(userId).then((cached) => {
        cacheAttendance(userId, {
          today: result.data,
          history: cached ? cached.history : [],
        });
      });
      return result.data;
    }

    // Fallback to cache if network error
    if (result.isNetworkError) {
      const cached = await getCachedAttendance(userId);
      return cached ? cached.today : null;
    }
    return null;
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
  async getUserSites(userId: string): Promise<Site[]> {
    const result = await apiFetch(`/api/attendance/user-sites/${userId}`);
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
    siteId: string,
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
        site_id: siteId,
        latitude,
        longitude,
        address,
      }),
    });

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
    isOffline?: boolean;
  }> {
    return await apiFetch(`/api/attendance/${attendanceId}/check-out`, {
      method: "POST",
      body: JSON.stringify({
        latitude,
        longitude,
        address,
        remarks,
      }),
    });
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
