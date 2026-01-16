import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "../utils/logger";
import { authEvents } from "../utils/authEvents";
import {
  cacheAttendance,
  getCachedAttendance,
} from "../utils/offlineDataCache";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || "http://192.168.31.152:3420";

import {
  saveOfflineAttendance,
  getPendingAttendance,
} from "../utils/offlineStorage";

// Helper to get the token
const getToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem("auth_token");
  } catch (error: any) {
    logger.error("Failed to get auth token from storage", {
      module: "ATTENDANCE_SERVICE",
      error: error.message,
    });
    return null;
  }
};

// Helper for API requests with auth
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = await getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(`${BACKEND_URL}${endpoint}`, {
      ...options,
      headers,
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
    longitude?: number
  ): Promise<LocationValidationResult> {
    const params = new URLSearchParams();
    if (latitude) params.append("latitude", latitude.toString());
    if (longitude) params.append("longitude", longitude.toString());

    const result = await apiFetch(
      `/api/attendance/validate-location/${userId}?${params.toString()}`
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
    address?: string
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

    if (result.isNetworkError) {
      const timestamp = new Date().toISOString();
      await saveOfflineAttendance({
        user_id: userId,
        site_id: siteId,
        punch_type: "punch_in",
        timestamp,
        latitude,
        longitude,
      });

      // Construct a mock log item for UI
      const mockLog: AttendanceLog = {
        id: `offline_${Date.now()}`,
        user_id: userId,
        site_id: siteId,
        date: new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
        check_in_time: timestamp,
        status: "Present",
      };

      return { success: true, data: mockLog, isOffline: true };
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
    remarks?: string
  ): Promise<{
    success: boolean;
    data?: AttendanceLog;
    error?: string;
    isEarlyCheckout?: boolean;
    hoursWorked?: string;
    isOffline?: boolean;
  }> {
    // If it's an offline attendance ID, we can't call API directly
    // but we can save the punch out record.
    // However, the backend needs an actual record ID to finish.
    // In our simplified offline mode, we'll try to find the user_id and site_id
    // from the mock attendanceId or state if we were robust, but for now
    // we assume most checkouts happen online or we need to find the user from context.

    // Let's refine the offline punch record to be more generic.
    // Finding user_id here might be tricky without passing it.
    // For now, let's just attempt the API and if it fails due to network,
    // we save it offline IF we have the user_id (maybe passed in remarks or similar hacks,
    // but better to fix the signature).

    const result = await apiFetch(`/api/attendance/${attendanceId}/check-out`, {
      method: "POST",
      body: JSON.stringify({
        latitude,
        longitude,
        address,
        remarks,
      }),
    });

    if (result.isNetworkError) {
      // NOTE: For offline check-out to work, we'd ideally need the user_id and site_id.
      // Since the current signature only has attendanceId, we might need to store
      // those when we check in or fetch them from current app state.
      // For this POC, we'll rely on the API.
      return result;
    }

    return result;
  },

  /**
   * Get attendance history for a user
   */
  async getAttendanceHistory(
    userId: string,
    page: number = 1,
    limit: number = 30
  ): Promise<{ data: AttendanceLog[]; pagination: any }> {
    const result = await apiFetch(
      `/api/attendance/user/${userId}?page=${page}&limit=${limit}`
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
