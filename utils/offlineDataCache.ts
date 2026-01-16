import AsyncStorage from "@react-native-async-storage/async-storage";

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
  site_id: string;
  description?: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
}

export interface CacheMetadata {
  areas: { [siteId: string]: string }; // siteId -> timestamp
  categories: string | null; // timestamp
  sites: { [userId: string]: string }; // userId -> timestamp
  tickets: { [siteId: string]: string }; // siteId -> timestamp
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
  } catch (error) {
    console.error("Error getting cache metadata:", error);
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
  updates: Partial<CacheMetadata>
): Promise<void> {
  const current = await getCacheMetadata();
  await AsyncStorage.setItem(
    CACHE_METADATA_KEY,
    JSON.stringify({ ...current, ...updates })
  );
}

// ===== AREAS =====

export async function cacheAreas(siteId: string, areas: Area[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${CACHE_AREAS_PREFIX}${siteId}`,
      JSON.stringify(areas)
    );
    const metadata = await getCacheMetadata();
    await updateCacheMetadata({
      areas: { ...metadata.areas, [siteId]: new Date().toISOString() },
    });
  } catch (error) {
    console.error("Error caching areas:", error);
  }
}

export async function getCachedAreas(siteId: string): Promise<Area[]> {
  try {
    const data = await AsyncStorage.getItem(`${CACHE_AREAS_PREFIX}${siteId}`);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting cached areas:", error);
    return [];
  }
}

export async function getAreasCacheAge(siteId: string): Promise<number | null> {
  const metadata = await getCacheMetadata();
  if (!metadata.areas[siteId]) return null;
  return Date.now() - new Date(metadata.areas[siteId]).getTime();
}

// ===== CATEGORIES =====

export async function cacheCategories(categories: Category[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CACHE_CATEGORIES_KEY,
      JSON.stringify(categories)
    );
    await updateCacheMetadata({ categories: new Date().toISOString() });
  } catch (error) {
    console.error("Error caching categories:", error);
  }
}

export async function getCachedCategories(): Promise<Category[]> {
  try {
    const data = await AsyncStorage.getItem(CACHE_CATEGORIES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting cached categories:", error);
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
      JSON.stringify(sites)
    );
    const metadata = await getCacheMetadata();
    await updateCacheMetadata({
      sites: { ...metadata.sites, [userId]: new Date().toISOString() },
    });
  } catch (error) {
    console.error("Error caching sites:", error);
  }
}

export async function getCachedSites(userId: string): Promise<any[]> {
  try {
    const data = await AsyncStorage.getItem(`${CACHE_SITES_PREFIX}${userId}`);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting cached sites:", error);
    return [];
  }
}

// ===== TICKETS =====

export async function cacheTickets(
  siteId: string,
  tickets: any[]
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${CACHE_TICKETS_PREFIX}${siteId}`,
      JSON.stringify(tickets)
    );
    const metadata = await getCacheMetadata();
    await updateCacheMetadata({
      tickets: { ...metadata.tickets, [siteId]: new Date().toISOString() },
    });
  } catch (error) {
    console.error("Error caching tickets:", error);
  }
}

export async function getCachedTickets(siteId: string): Promise<any[]> {
  try {
    const data = await AsyncStorage.getItem(`${CACHE_TICKETS_PREFIX}${siteId}`);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting cached tickets:", error);
    return [];
  }
}

export async function getTicketsCacheAge(
  siteId: string
): Promise<number | null> {
  const metadata = await getCacheMetadata();
  if (!metadata.tickets[siteId]) return null;
  return Date.now() - new Date(metadata.tickets[siteId]).getTime();
}

// ===== ATTENDANCE =====

export async function cacheAttendance(
  userId: string,
  data: { today: any; history: any[] }
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${CACHE_ATTENDANCE_PREFIX}${userId}`,
      JSON.stringify(data)
    );
    const metadata = await getCacheMetadata();
    await updateCacheMetadata({
      attendance: {
        ...metadata.attendance,
        [userId]: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error caching attendance:", error);
  }
}

export async function getCachedAttendance(
  userId: string
): Promise<{ today: any; history: any[] } | null> {
  try {
    const data = await AsyncStorage.getItem(
      `${CACHE_ATTENDANCE_PREFIX}${userId}`
    );
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("Error getting cached attendance:", error);
    return null;
  }
}

export async function getAttendanceCacheAge(
  userId: string
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
        key === CACHE_METADATA_KEY
    );
    await AsyncStorage.multiRemove(cacheKeys);
  } catch (error) {
    console.error("Error clearing cache:", error);
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
        key === CACHE_CATEGORIES_KEY
    );

    let totalBytes = 0;
    for (const key of cacheKeys) {
      const value = await AsyncStorage.getItem(key);
      if (value) {
        totalBytes += value.length * 2; // UTF-16 characters = 2 bytes each
      }
    }

    return { items: cacheKeys.length, bytes: totalBytes };
  } catch (error) {
    console.error("Error calculating cache size:", error);
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
