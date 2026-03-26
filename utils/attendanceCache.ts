/**
 * Attendance Cache Utilities
 * 
 * Provides caching for attendance data to support offline functionality
 * and improve app performance.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "./logger";

const ATTENDANCE_CACHE_KEY = "@attendance_cache_";
const SITES_CACHE_KEY = "@sites_cache_";

export interface AttendanceLog {
  id?: string;
  user_id: string;
  site_code?: string;
  date?: string;
  check_in_time?: string;
  check_out_time?: string;
  check_in_lat?: number;
  check_in_lng?: number;
  check_out_lat?: number;
  check_out_lng?: number;
  remarks?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AttendanceCache {
  today: AttendanceLog | null;
  history: AttendanceLog[];
  lastUpdated: string;
}

export interface SiteInfo {
  id: string;
  site_code: string;
  name: string;
  location?: string;
  [key: string]: any;
}

/**
 * Get cached attendance data for a user
 */
export async function getCachedAttendance(
  userId: string
): Promise<AttendanceCache | null> {
  try {
    const key = `${ATTENDANCE_CACHE_KEY}${userId}`;
    const cached = await AsyncStorage.getItem(key);
    
    if (!cached) {
      return null;
    }

    const data = JSON.parse(cached) as AttendanceCache;
    
    logger.debug("Retrieved cached attendance", {
      module: "ATTENDANCE_CACHE",
      userId,
      hasToday: !!data.today,
      historyCount: data.history?.length || 0,
      lastUpdated: data.lastUpdated,
    });

    return data;
  } catch (error) {
    logger.error("Error getting cached attendance", {
      module: "ATTENDANCE_CACHE",
      error,
    });
    return null;
  }
}

/**
 * Cache attendance data for a user
 */
export async function cacheAttendance(
  userId: string,
  data: Partial<AttendanceCache>
): Promise<void> {
  try {
    const key = `${ATTENDANCE_CACHE_KEY}${userId}`;
    
    // Get existing cache to merge
    const existing = await getCachedAttendance(userId);
    
    const cacheData: AttendanceCache = {
      today: data.today !== undefined ? data.today : existing?.today || null,
      history: data.history !== undefined ? data.history : existing?.history || [],
      lastUpdated: new Date().toISOString(),
    };

    await AsyncStorage.setItem(key, JSON.stringify(cacheData));

    logger.debug("Cached attendance data", {
      module: "ATTENDANCE_CACHE",
      userId,
      hasToday: !!cacheData.today,
      historyCount: cacheData.history.length,
    });
  } catch (error) {
    logger.error("Error caching attendance", {
      module: "ATTENDANCE_CACHE",
      error,
    });
  }
}

/**
 * Clear cached attendance for a user
 */
export async function clearAttendanceCache(userId: string): Promise<void> {
  try {
    const key = `${ATTENDANCE_CACHE_KEY}${userId}`;
    await AsyncStorage.removeItem(key);
    
    logger.info("Cleared attendance cache", {
      module: "ATTENDANCE_CACHE",
      userId,
    });
  } catch (error) {
    logger.error("Error clearing attendance cache", {
      module: "ATTENDANCE_CACHE",
      error,
    });
  }
}

/**
 * Get cached sites for a user
 */
export async function getCachedSites(userId: string): Promise<SiteInfo[] | null> {
  try {
    const key = `${SITES_CACHE_KEY}${userId}`;
    const cached = await AsyncStorage.getItem(key);
    
    if (!cached) {
      return null;
    }

    const data = JSON.parse(cached);
    
    logger.debug("Retrieved cached sites", {
      module: "ATTENDANCE_CACHE",
      userId,
      count: data.sites?.length || 0,
    });

    return data.sites || [];
  } catch (error) {
    logger.error("Error getting cached sites", {
      module: "ATTENDANCE_CACHE",
      error,
    });
    return null;
  }
}

/**
 * Cache sites for a user
 */
export async function cacheSites(
  userId: string,
  sites: SiteInfo[]
): Promise<void> {
  try {
    const key = `${SITES_CACHE_KEY}${userId}`;
    
    const cacheData = {
      sites,
      lastUpdated: new Date().toISOString(),
    };

    await AsyncStorage.setItem(key, JSON.stringify(cacheData));

    logger.debug("Cached sites data", {
      module: "ATTENDANCE_CACHE",
      userId,
      count: sites.length,
    });
  } catch (error) {
    logger.error("Error caching sites", {
      module: "ATTENDANCE_CACHE",
      error,
    });
  }
}

/**
 * Clear cached sites for a user
 */
export async function clearSitesCache(userId: string): Promise<void> {
  try {
    const key = `${SITES_CACHE_KEY}${userId}`;
    await AsyncStorage.removeItem(key);
    
    logger.info("Cleared sites cache", {
      module: "ATTENDANCE_CACHE",
      userId,
    });
  } catch (error) {
    logger.error("Error clearing sites cache", {
      module: "ATTENDANCE_CACHE",
      error,
    });
  }
}

/**
 * Clear all attendance-related caches for a user
 */
export async function clearAllAttendanceCaches(userId: string): Promise<void> {
  await Promise.all([
    clearAttendanceCache(userId),
    clearSitesCache(userId),
  ]);
  
  logger.info("Cleared all attendance caches", {
    module: "ATTENDANCE_CACHE",
    userId,
  });
}
