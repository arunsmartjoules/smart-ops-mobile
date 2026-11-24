/**
 * What the sub-tab strip and the bottom bar need, besides the role, to decide
 * which sub-tabs show (components/jo/modules `visibleSubTabs`): the selected
 * site, whether that site is one the user enters trend sheet readings for, and
 * which pages its project type has (Pages by Project Type).
 * Re-renders its caller when the site or the trend sheet site list changes.
 *
 * The site comes from `useSites`, the same source as the Ops header's site
 * picker, so a tab never disagrees with the site shown above it (a first run
 * has no stored selection yet and falls back to the first authorized site).
 */
import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSites } from "@/hooks/useSites";
import { useTrendSites } from "@/services/TrendSheetSites";
import { useSelectedPageOn } from "@/components/jo/useSelectedPageOn";
import type { SubTabContext } from "@/components/jo/modules";

export function useSubTabContext(): SubTabContext {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id;
  const { selectedSite } = useSites(userId);
  const siteCode = selectedSite?.site_code ?? null;
  const pageOn = useSelectedPageOn();
  const { sites } = useTrendSites(userId);
  return useMemo(() => {
    const site = siteCode ? sites.find((s) => s.site_code === siteCode) : undefined;
    return { siteCode, trendSite: !!site && site.categories.length > 0, pageOn };
  }, [siteCode, sites, pageOn]);
}
