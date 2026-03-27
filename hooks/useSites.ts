/**
 * useSites — loads user's assigned sites
 *
 * Priority:
 * 1. AsyncStorage site cache — instant, always available
 * 2. PowerSync local DB (user_sites table) — available after first sync
 * 3. API — once per session when online, result cached for next time
 *
 * No infinite loops. API called at most once per mount.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { db, userSites } from "@/database";
import { eq } from "drizzle-orm";
import { getCachedUserSites, cacheUserSites } from "@/utils/siteCache";
import AttendanceService, { type Site } from "@/services/AttendanceService";

export function useSites(userId: string | undefined) {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSiteState] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const hasFetchedRef = useRef(false); // prevent repeated API calls
  const lastSiteKey = userId ? `last_site_${userId}` : null;

  const selectSite = useCallback(async (site: Site) => {
    setSelectedSiteState(site);
    if (lastSiteKey) {
      await AsyncStorage.setItem(lastSiteKey, site.site_code);
    }
  }, [lastSiteKey]);

  const applyLastSite = useCallback(async (siteList: Site[]) => {
    if (!lastSiteKey || siteList.length === 0) return;
    const last = await AsyncStorage.getItem(lastSiteKey).catch(() => null);
    const match = last && last !== "all" ? siteList.find((s) => s.site_code === last) : null;
    setSelectedSiteState(match ?? siteList[0]);
  }, [lastSiteKey]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      // 1. AsyncStorage cache — instant
      const cached = await getCachedUserSites(userId).catch(() => [] as Site[]);
      if (cached.length > 0 && !cancelled) {
        setSites(cached);
        await applyLastSite(cached);
        setLoading(false);
      }

      // 2. PowerSync local DB
      try {
        const rows = await db.select().from(userSites).where(eq(userSites.user_id, userId));
        const localSites: Site[] = rows.map((r) => ({
          site_code: r.site_code,
          name: r.site_name || r.site_code,
        }));
        if (localSites.length > 0 && !cancelled) {
          setSites(localSites);
          await applyLastSite(localSites);
          setLoading(false);
          // Update cache with fresh local DB data
          await cacheUserSites(userId, localSites.map((s) => ({ site_code: s.site_code, name: s.name || s.site_code })));
        }
      } catch {}

      // 3. API — only once per mount, only when online
      if (!hasFetchedRef.current) {
        hasFetchedRef.current = true;
        const net = await NetInfo.fetch().catch(() => ({ isConnected: false }));
        if (net.isConnected) {
          try {
            const fresh = await AttendanceService.getUserSites(userId, "JouleCool");
            if (fresh.length > 0 && !cancelled) {
              setSites(fresh);
              await applyLastSite(fresh);
              await cacheUserSites(userId, fresh.map((s) => ({ site_code: s.site_code, name: s.name || s.site_code })));
            }
          } catch {}
        }
      }

      if (!cancelled) setLoading(false);
    };

    load();

    return () => { cancelled = true; };
  }, [userId]); // only re-run when userId changes

  return { sites, selectedSite, selectSite, loading };
}
