/**
 * What the sub-tab strip and the bottom bar need, besides the role, to decide
 * which sub-tabs show (components/jo/modules `visibleSubTabs`): the selected
 * site, whether that site is one the user enters trend sheet readings for, and
 * whether it is a JouleCool site.
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
import { isJouleCoolSite } from "@/services/SiteResolver";
import type { SubTabContext } from "@/components/jo/modules";

export function useSubTabContext(): SubTabContext {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id;
  const { selectedSite } = useSites(userId);
  const siteCode = selectedSite?.site_code ?? null;
  // No site yet counts as JouleCool, so SLA and Efficiency never flicker away
  // while the stored selection is restored.
  const jouleCoolSite = selectedSite ? isJouleCoolSite(selectedSite) : true;
  const { sites } = useTrendSites(userId);
  return useMemo(() => {
    const site = siteCode ? sites.find((s) => s.site_code === siteCode) : undefined;
    return { siteCode, trendSite: !!site && site.categories.length > 0, jouleCoolSite };
  }, [siteCode, sites, jouleCoolSite]);
}
