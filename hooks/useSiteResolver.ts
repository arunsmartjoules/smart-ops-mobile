/**
 * useSiteResolver — thin React wrapper around the SiteResolver singleton.
 *
 * Subscribes to siteResolver.subscribeState() for the authorized site list.
 * The selected site is the app-wide one from services/SiteSelection, so a
 * change made on any screen is reflected on every other mounted screen.
 *
 * `loading` stays true until SiteResolver has emitted a real resolution result
 * (rather than its empty initial state), so consumers can distinguish
 * "still resolving" from "resolved with zero authorized sites".
 */

import { useState, useEffect, useCallback } from "react";
import {
  siteResolver,
  type Site,
  type ResolutionState,
} from "@/services/SiteResolver";
import {
  getSelectedSiteCode,
  setSelectedSiteCode,
  subscribeSelectedSite,
} from "@/services/SiteSelection";

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

  // Restore persisted selectedSite when authorized sites are available. The
  // selection is constrained to the authorized list — a stored site_code that
  // is no longer authorized is ignored, never silently surfaced.
  const applyPersistedSite = useCallback(
    async (siteList: Site[]) => {
      if (siteList.length === 0) {
        setSelectedSite(null);
        return;
      }
      const stored = await getSelectedSiteCode(normalizedIdentity);
      const match = stored
        ? siteList.find((s) => s.site_code === stored) ?? null
        : null;
      setSelectedSite(match ?? siteList[0]);
    },
    [normalizedIdentity],
  );

  // Follow selections made on other screens.
  useEffect(() => {
    if (!normalizedIdentity) return;
    return subscribeSelectedSite((identity, siteCode) => {
      if (identity !== normalizedIdentity) return;
      const match = siteResolver.getSites().find((s) => s.site_code === siteCode);
      if (match) setSelectedSite(match);
    });
  }, [normalizedIdentity]);

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
      // Broadcasts to every other screen and persists the choice.
      await setSelectedSiteCode(normalizedIdentity, site.site_code);
    },
    [normalizedIdentity],
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
