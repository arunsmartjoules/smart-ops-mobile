import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "./logger";

// Cache keys
const CACHE_AREAS_PREFIX = "@cache_areas_";
const CACHE_CATEGORIES_KEY = "@cache_categories";
const CACHE_SITES_PREFIX = "@cache_sites_";
const CACHE_TICKETS_PREFIX = "@cache_tickets_";
const CACHE_ATTENDANCE_PREFIX = "@cache_attendance_";
const CACHE_METADATA_KEY = "@cache_metadata";

export interface Area {
  id: string;
  name: string;
  site_code: string;
  description?: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
}

export interface CacheMetadata {
  areas: { [siteCode: string]: string }; // siteCode -> timestamp
  categories: string | null; // timestamp
  sites: { [userId: string]: string }; // userId -> timestamp
  tickets: { [siteCode: string]: string }; // siteCode -> timestamp
  attendance: { [userId: string]: string }; // userId -> timestamp
}

// Get cache metadata
async function getCacheMetadata(): Promise<CacheMetadata> {
  try {
    const data = await AsyncStorage.getItem(CACHE_METADATA_KEY);
    return data
      ? JSON.parse(data)
      : {
          areas: {},
          categories: null,
          sites: {},
          tickets: {},
          attendance: {},
        };
  } catch (error: any) {
    logger.error("Error getting cache metadata", {
      module: "OFFLINE_DATA_CACHE",
      error: error.message,
    });
    return {
      areas: {},
      categories: null,
      sites: {},
      tickets: {},
      attendance: {},
    };
  }
}

// Update cache metadata
async function updateCacheMetadata(
  updates: Partial<CacheMetadata>,
): Promise<void> {
  const current = await getCacheMetadata();
  await AsyncStorage.setItem(
    CACHE_METADATA_KEY,
    JSON.stringify({ ...current, ...updates }),
  );
}

// ===== AREAS =====

export async function cacheAreas(
  siteCode: string,
  areas: Area[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${CACHE_AREAS_PREFIX}${siteCode}`,
      JSON.stringify(areas),
    );
    const metadata = await getCacheMetadata();
    await updateCacheMetadata({
      areas: { ...metadata.areas, [siteCode]: new Date().toISOString() },
    });
  } catch (error: any) {
    logger.error("Error caching areas", {
      module: "OFFLINE_DATA_CACHE",
      error: error.message,
      siteCode,
    });
  }
}

export async function getCachedAreas(siteCode: string): Promise<Area[]> {
  try {
    const data = await AsyncStorage.getItem(`${CACHE_AREAS_PREFIX}${siteCode}`);
    return data ? JSON.parse(data) : [];
  } catch (error: any) {
    logger.error("Error getting cached areas", {
      module: "OFFLINE_DATA_CACHE",
      error: error.message,
      siteCode,
    });
    return [];
  }
}

export async function getAreasCacheAge(
  siteCode: string,
): Promise<number | null> {
  const metadata = await getCacheMetadata();
  if (!metadata.areas[siteCode]) return null;
  return Date.now() - new Date(metadata.areas[siteCode]).getTime();
}

// ===== CATEGORIES =====

export async function cacheCategories(categories: Category[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CACHE_CATEGORIES_KEY,
      JSON.stringify(categories),
    );
    await updateCacheMetadata({ categories: new Date().toISOString() });
  } catch (error: any) {
    logger.error("Error caching categories", {
      module: "OFFLINE_DATA_CACHE",
      error: error.message,
    });
  }
}

export async function getCachedCategories(): Promise<Category[]> {
  try {
    const data = await AsyncStorage.getItem(CACHE_CATEGORIES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error: any) {
    logger.error("Error getting cached categories", {
      module: "OFFLINE_DATA_CACHE",
      error: error.message,
    });
    return [];
  }
}

export async function getCategoriesCacheAge(): Promise<number | null> {
  const metadata = await getCacheMetadata();
  if (!metadata.categories) return null;
  return Date.now() - new Date(metadata.categories).getTime();
}

// ===== SITES =====

export async function cacheSites(userId: string, sites: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${CACHE_SITES_PREFIX}${userId}`,
      JSON.stringify(sites),
    );
    const metadata = await getCacheMetadata();
    await updateCacheMetadata({
      sites: { ...metadata.sites, [userId]: new Date().toISOString() },
    });
  } catch (error: any) {
    logger.error("Error caching sites", {
      module: "OFFLINE_DATA_CACHE",
      error: error.message,
      userId,
    });
  }
}

export async function getCachedSites(userId: string): Promise<any[]> {
  try {
    const data = await AsyncStorage.getItem(`${CACHE_SITES_PREFIX}${userId}`);
    return data ? JSON.parse(data) : [];
  } catch (error: any) {
    logger.error("Error getting cached sites", {
      module: "OFFLINE_DATA_CACHE",
      error: error.message,
      userId,
    });
    return [];
  }
}

// ===== TICKETS =====

export async function cacheTickets(
  siteCode: string,
  tickets: any[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${CACHE_TICKETS_PREFIX}${siteCode}`,
      JSON.stringify(tickets),
    );
    const metadata = await getCacheMetadata();
    await updateCacheMetadata({
      tickets: { ...metadata.tickets, [siteCode]: new Date().toISOString() },
    });
  } catch (error: any) {
    logger.error("Error caching tickets", {
      module: "OFFLINE_DATA_CACHE",
      error: error.message,
      siteCode,
    });
  }
}

export async function getCachedTickets(siteCode: string): Promise<any[]> {
  try {
    const data = await AsyncStorage.getItem(
      `${CACHE_TICKETS_PREFIX}${siteCode}`,
    );
    return data ? JSON.parse(data) : [];
  } catch (error: any) {
    logger.error("Error getting cached tickets", {
      module: "OFFLINE_DATA_CACHE",
      error: error.message,
      siteCode,
    });
    return [];
  }
}

export async function getTicketsCacheAge(
  siteCode: string,
): Promise<number | null> {
  const metadata = await getCacheMetadata();
  if (!metadata.tickets[siteCode]) return null;
  return Date.now() - new Date(metadata.tickets[siteCode]).getTime();
}

// ===== ATTENDANCE =====

export async function cacheAttendance(
  userId: string,
  data: { today: any; history: any[] },
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${CACHE_ATTENDANCE_PREFIX}${userId}`,
      JSON.stringify(data),
    );
    const metadata = await getCacheMetadata();
    await updateCacheMetadata({
      attendance: {
        ...metadata.attendance,
        [userId]: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error("Error caching attendance", {
      module: "OFFLINE_DATA_CACHE",
      error: error.message,
      userId,
    });
  }
}

export async function getCachedAttendance(
  userId: string,
): Promise<{ today: any; history: any[] } | null> {
  try {
    const data = await AsyncStorage.getItem(
      `${CACHE_ATTENDANCE_PREFIX}${userId}`,
    );
    return data ? JSON.parse(data) : null;
  } catch (error: any) {
    logger.error("Error getting cached attendance", {
      module: "OFFLINE_DATA_CACHE",
      error: error.message,
      userId,
    });
    return null;
  }
}

export async function getAttendanceCacheAge(
  userId: string,
): Promise<number | null> {
  const metadata = await getCacheMetadata();
  if (!metadata.attendance[userId]) return null;
  return Date.now() - new Date(metadata.attendance[userId]).getTime();
}

// ===== CLEAR ALL CACHE =====

export async function clearAllCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(
      (key) =>
        key.startsWith(CACHE_AREAS_PREFIX) ||
        key.startsWith(CACHE_SITES_PREFIX) ||
        key.startsWith(CACHE_TICKETS_PREFIX) ||
        key.startsWith(CACHE_ATTENDANCE_PREFIX) ||
        key === CACHE_CATEGORIES_KEY ||
        key === CACHE_METADATA_KEY,
    );
    await AsyncStorage.multiRemove(cacheKeys);
  } catch (error: any) {
    logger.error("Error clearing cache", {
      module: "OFFLINE_DATA_CACHE",
      error: error.message,
    });
    throw error;
  }
}

// ===== CACHE SIZE =====

export async function getCacheSize(): Promise<{
  items: number;
  bytes: number;
}> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(
      (key) =>
        key.startsWith(CACHE_AREAS_PREFIX) ||
        key.startsWith(CACHE_SITES_PREFIX) ||
        key.startsWith(CACHE_TICKETS_PREFIX) ||
        key.startsWith(CACHE_ATTENDANCE_PREFIX) ||
        key === CACHE_CATEGORIES_KEY,
    );

    let totalBytes = 0;
    const records = await AsyncStorage.multiGet(cacheKeys);

    for (const [, value] of records) {
      if (value) {
        totalBytes += value.length * 2; // UTF-16 characters = 2 bytes each
      }
    }

    return { items: cacheKeys.length, bytes: totalBytes };
  } catch (error: any) {
    logger.error("Error calculating cache size", {
      module: "OFFLINE_DATA_CACHE",
      error: error.message,
    });
    return { items: 0, bytes: 0 };
  }
}

// Helper to format bytes
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
