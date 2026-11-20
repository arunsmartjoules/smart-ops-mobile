/**
 * Which Site Logs log types a screen shows: the ones the role can view, minus
 * the JouleCool only ones while a JoulePays site is selected. Chiller is not
 * used at JoulePays sites (spec 0002, AC-57), so its card, its history and the
 * add button that opens /chiller all go with it.
 */

/** Log types that exist only at JouleCool sites. */
export const JOULECOOL_ONLY_LOG_TYPES: ReadonlySet<string> = new Set(["Chiller Logs"]);

/**
 * The site /chiller starts with: the code it was opened with, unless the
 * phone's site list knows that code as a JoulePays site, then none ("Pick a
 * site first"). A code the list does not know is kept, as before.
 * `project_type` empty counts as JouleCool (spec 0002, AC-54).
 */
export function chillerInitialSite(
  code: string,
  knownSites: readonly { site_code: string; project_type?: string | null }[],
): string {
  if (!code) return "";
  const site = knownSites.find((s) => s.site_code === code);
  if (site && site.project_type && site.project_type !== "JouleCool") return "";
  return code;
}

export function visibleLogTypes<T extends { key: string; permission: string }>(
  tabs: readonly T[],
  canView: (permission: T["permission"]) => boolean,
  jouleCoolSite: boolean,
): T[] {
  return tabs.filter(
    (tab) => canView(tab.permission) && (jouleCoolSite || !JOULECOOL_ONLY_LOG_TYPES.has(tab.key)),
  );
}
