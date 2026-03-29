/**
 * Attendance Cache Utilities
 *
 * @deprecated These utilities are deprecated. Use `cacheManager` from
 * `@/services/CacheManager` and `siteResolver` from `@/services/SiteResolver`
 * directly instead. These functions are thin delegates kept for backwards
 * compatibility only and will be removed in a future release.
 */

import { cacheManager } from "@/services/CacheManager";
import { siteResolver, type Site } from "@/services/SiteResolver";

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
 * Get cached attendance data for a user.
 *
 * @deprecated Use `cacheManager.read("attendance", { where: { user_id: userId } })` instead.
 */
export async function getCachedAttendance(
  userId: string
): Promise<AttendanceCache | null> {
  const rows = await cacheManager.read<AttendanceLog>("attendance", {
    where: { user_id: userId },
  });
  if (!rows || rows.length === 0) return null;
  const today = rows.find((r) => r.date === new Date().toISOString().slice(0, 10)) ?? null;
  return {
    today: today ?? null,
    history: rows,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Cache attendance data for a user.
 *
 * @deprecated Use `cacheManager.write("attendance", data)` instead.
 */
export async function cacheAttendance(
  userId: string,
  data: Partial<AttendanceCache>
): Promise<void> {
  const records: AttendanceLog[] = [];
  if (data.today) records.push(data.today);
  if (data.history && data.history.length > 0) records.push(...data.history);
  if (records.length > 0) {
    await cacheManager.write("attendance", records);
  }
}

/**
 * Get cached sites for a user.
 *
 * @deprecated Use `siteResolver.getSites()` instead.
 */
export async function getCachedSites(userId: string): Promise<SiteInfo[] | null> {
  const sites: Site[] = siteResolver.getSites();
  if (sites.length === 0) return null;
  return sites.map((s) => ({
    id: s.id,
    site_code: s.site_code,
    name: s.site_name,
  }));
}

/**
 * Cache sites for a user (triggers a non-blocking refresh via siteResolver).
 *
 * @deprecated Use `siteResolver.refresh(userId)` instead.
 */
export async function cacheSites(
  userId: string,
  sites: SiteInfo[]
): Promise<void> {
  // Non-blocking — fire and forget
  siteResolver.refresh(userId).catch(() => {});
}

/**
 * Clear all attendance-related caches for a user.
 *
 * @deprecated Use `cacheManager.clear("attendance")` instead.
 */
export async function clearAllAttendanceCaches(userId: string): Promise<void> {
  await cacheManager.clear("attendance");
}
