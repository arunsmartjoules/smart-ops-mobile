import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "../utils/logger";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || "http://192.168.31.152:3420";

// Helper to get the token
const getToken = async (): Promise<string | null> => {
  return await AsyncStorage.getItem("auth_token");
};

// Helper for API requests with auth
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = await getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const result = await response.json();

  if (!response.ok) {
    // Only log as error if it's a server error (500+)
    // 400 errors are often business logic (early checkout, out of range)
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

    // If unauthorized, we might want to flag the session as invalid
    if (response.status === 401) {
      result.error =
        "Session expired or invalid. Please sign out and sign in again.";
    }
  }

  return result;
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
      return result.data;
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
  ): Promise<{ success: boolean; data?: AttendanceLog; error?: string }> {
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
    remarks?: string
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
      return { data: result.data, pagination: result.pagination };
    }
    return { data: [], pagination: {} };
  },
};

export default AttendanceService;
