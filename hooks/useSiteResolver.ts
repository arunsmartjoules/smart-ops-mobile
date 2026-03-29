/**
 * useSiteResolver — thin React wrapper around the SiteResolver singleton.
 *
 * Subscribes to siteResolver.subscribe() and manages selectedSite state
 * with AsyncStorage persistence using key `last_site_{userId}`.
 *
 * Requirements: 5.1, 5.4
 */

import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { siteResolver, type Site } from "@/services/SiteResolver";

export function useSiteResolver(userId: string | undefined): {
  sites: Site[];
  selectedSite: Site | null;
  selectSite: (site: Site) => Promise<void>;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [sites, setSites] = useState<Site[]>(siteResolver.getSites());
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);

  const lastSiteKey = userId ? `last_site_${userId}` : null;

  // Restore persisted selectedSite when sites become available
  const applyPersistedSite = useCallback(
    async (siteList: Site[]) => {
      if (!lastSiteKey || siteList.length === 0) return;
      try {
        const stored = await AsyncStorage.getItem(lastSiteKey);
        const match = stored
          ? siteList.find((s) => s.site_code === stored) ?? null
          : null;
        setSelectedSite(match ?? siteList[0]);
      } catch {
        setSelectedSite(siteList[0]);
      }
    },
    [lastSiteKey],
  );

  // Subscribe to siteResolver and initialize on userId change
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Subscribe — listener is called immediately with current sites
    const unsubscribe = siteResolver.subscribe(async (resolved) => {
      setSites(resolved);
      await applyPersistedSite(resolved);
      setLoading(false);
    });

    // Kick off resolution if not already done
    siteResolver.initialize(userId).catch(() => {
      setLoading(false);
    });

    return unsubscribe;
  }, [userId, applyPersistedSite]);

  const selectSite = useCallback(
    async (site: Site) => {
      setSelectedSite(site);
      if (lastSiteKey) {
        try {
          await AsyncStorage.setItem(lastSiteKey, site.site_code);
        } catch {
          // non-fatal — selection still applied in memory
        }
      }
    },
    [lastSiteKey],
  );

  const refresh = useCallback(async () => {
    if (!userId) return;
    await siteResolver.refresh(userId);
  }, [userId]);

  return { sites, selectedSite, selectSite, loading, refresh };
}
