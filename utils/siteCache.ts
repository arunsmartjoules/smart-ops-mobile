/**
 * Site Cache — persists user sites to AsyncStorage.
 *
 * @deprecated These utilities are deprecated. Use `siteResolver` from
 * `@/services/SiteResolver` directly instead. These functions are thin
 * delegates kept for backwards compatibility only and will be removed in
 * a future release.
 */

import { siteResolver, type Site } from "@/services/SiteResolver";

export interface CachedSite {
  site_code: string;
  name: string;
}

/**
 * Get cached user sites.
 *
 * @deprecated Use `siteResolver.getSites()` instead.
 */
export async function getCachedUserSites(userId: string): Promise<CachedSite[]> {
  const sites: Site[] = siteResolver.getSites();
  return sites.map((s) => ({ site_code: s.site_code, name: s.site_name }));
}

/**
 * Cache user sites (triggers a non-blocking refresh via siteResolver).
 *
 * @deprecated Use `siteResolver.refresh(userId)` instead.
 */
export async function cacheUserSites(userId: string, sites: CachedSite[]): Promise<void> {
  // Non-blocking — fire and forget
  siteResolver.refresh(userId).catch(() => {});
}
