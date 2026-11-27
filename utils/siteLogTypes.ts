/**
 * Which Site Logs log types a screen shows: the ones the role can view whose
 * category is on for the selected site's project type (web Settings › Pages by
 * Project Type). By default Chiller is off at JoulePays sites (spec 0002,
 * AC-57), so its card, its history and the add button that opens /chiller all
 * go with it.
 */
import {
  isModuleOnFor,
  projectTypeOfSite,
  type ProjectTypePageMatrix,
} from "../services/ProjectTypePages";

/**
 * The site /chiller starts with: the code it was opened with, unless the
 * phone's site list knows that code as a site whose project type has the
 * Chiller log off, then none ("Pick a site first"). A code the list does not
 * know is kept, as before. `project_type` empty counts as JouleCool (AC-54).
 */
export function chillerInitialSite(
  code: string,
  knownSites: readonly { site_code: string; project_type?: string | null }[],
  pages: ProjectTypePageMatrix,
): string {
  if (!code) return "";
  const site = knownSites.find((s) => s.site_code === code);
  if (site && !isModuleOnFor(pages, projectTypeOfSite(site), "site_logs_chiller")) return "";
  return code;
}

export function visibleLogTypes<T extends { key: string; permission: string }>(
  tabs: readonly T[],
  canView: (permission: T["permission"]) => boolean,
  pageOn: (permission: T["permission"]) => boolean,
): T[] {
  return tabs.filter((tab) => canView(tab.permission) && pageOn(tab.permission));
}
