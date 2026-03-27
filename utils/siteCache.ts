/**
 * Site Cache — persists user sites to AsyncStorage
 * so they are available offline regardless of PowerSync sync status.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "./logger";

const SITE_CACHE_KEY = "@user_sites_cache_";

export interface CachedSite {
  site_code: string;
  name: string;
}

export async function getCachedUserSites(userId: string): Promise<CachedSite[]> {
  try {
    const raw = await AsyncStorage.getItem(`${SITE_CACHE_KEY}${userId}`);
    if (!raw) return [];
    return JSON.parse(raw) as CachedSite[];
  } catch {
    return [];
  }
}

export async function cacheUserSites(userId: string, sites: CachedSite[]): Promise<void> {
  try {
    await AsyncStorage.setItem(`${SITE_CACHE_KEY}${userId}`, JSON.stringify(sites));
    logger.debug("Cached user sites", { module: "SITE_CACHE", userId, count: sites.length });
  } catch (error) {
    logger.error("Failed to cache user sites", { module: "SITE_CACHE", error });
  }
}
