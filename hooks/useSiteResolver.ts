/**
 * useSiteResolver — thin React wrapper around the SiteResolver singleton.
 *
 * Subscribes to siteResolver.subscribeState() and manages selectedSite state
 * with AsyncStorage persistence using key `last_site_{userId}`.
 *
 * `loading` stays true until SiteResolver has emitted a real resolution result
 * (rather than its empty initial state), so consumers can distinguish
 * "still resolving" from "resolved with zero authorized sites".
 */

import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  siteResolver,
  type Site,
  type ResolutionState,
} from "@/services/SiteResolver";

export interface UseSiteResolverResult {
  sites: Site[];
  selectedSite: Site | null;
  selectSite: (site: Site) => Promise<void>;
  loading: boolean;
  refresh: () => Promise<void>;
  /** True once SiteResolver has produced a resolution result for this user. */
  initialized: boolean;
  /** Most recent resolution state from SiteResolver (or null before init). */
  state: ResolutionState | null;
}

export function useSiteResolver(
  userId: string | undefined,
): UseSiteResolverResult {
  const normalizedIdentity = userId?.trim().toLowerCase();
  const initialState = siteResolver.getState();
  const [sites, setSites] = useState<Site[]>(initialState.sites);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(!initialState.initialized);
  const [state, setState] = useState<ResolutionState | null>(
    initialState.initialized ? initialState : null,
  );

  const lastSiteKey = normalizedIdentity ? `last_site_${normalizedIdentity}` : null;

  // Restore persisted selectedSite when authorized sites are available. The
  // selection is constrained to the authorized list — a stored site_code that
  // is no longer authorized is ignored, never silently surfaced.
  const applyPersistedSite = useCallback(
    async (siteList: Site[]) => {
      if (siteList.length === 0) {
        setSelectedSite(null);
        return;
      }
      if (!lastSiteKey) {
        setSelectedSite(siteList[0]);
        return;
      }
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

  useEffect(() => {
    if (!normalizedIdentity) {
      setLoading(false);
      setSites([]);
      setSelectedSite(null);
      setState(null);
      return;
    }

    const current = siteResolver.getState();
    setLoading(!current.initialized);

    const unsubscribe = siteResolver.subscribeState(async (next) => {
      setState(next);
      if (next.initialized) {
        setSites(next.sites);
        await applyPersistedSite(next.sites);
        setLoading(false);
      }
    });

    siteResolver.initialize(normalizedIdentity).catch(() => {
      setLoading(false);
    });

    return unsubscribe;
  }, [normalizedIdentity, applyPersistedSite]);

  const selectSite = useCallback(
    async (site: Site) => {
      // Defensive: only allow selecting a site the user is authorized for.
      const authorized = siteResolver
        .getSites()
        .some((s) => s.site_code === site.site_code);
      if (!authorized) return;

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
    if (!normalizedIdentity) return;
    await siteResolver.refresh(normalizedIdentity);
  }, [normalizedIdentity]);

  return {
    sites,
    selectedSite,
    selectSite,
    loading,
    refresh,
    initialized: state?.initialized ?? false,
    state,
  };
}
