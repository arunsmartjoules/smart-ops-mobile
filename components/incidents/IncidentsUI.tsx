/**
 * Incident-specific colour maps, mirroring the ticket list's treatment so the
 * two module tabs read identically. The surrounding chrome (header, status
 * tabs, count line, empty card) is shared — see components/shared/ListChrome.
 */
import type { DsTheme } from "@/hooks/useDs";

export { soRadius, soShadow } from "@/components/home/SiteOverview";

/** Incidents use their own three-state vocabulary; "Resolved" reads as Completed. */
export const incidentStatusMap = (
  ds: DsTheme,
): Record<string, { label: string; bg: string; fg: string }> => ({
  Open: { label: "Open", bg: ds.flame[1000], fg: ds.flame[100] },
  Inprogress: { label: "In progress", bg: ds.sky[1000], fg: ds.sky[100] },
  Resolved: { label: "Completed", bg: ds.sky[900], fg: ds.isDark ? ds.sky[100] : "#1F757D" },
});

export const getIncidentStatus = (status: string | undefined, ds: DsTheme) =>
  incidentStatusMap(ds)[status || "Open"] ?? {
    label: status || "Open",
    bg: ds.carbon[1000],
    fg: ds.carbon[400],
  };

/** RCA progress rides in the second badge, where tickets carry priority. */
export const incidentRcaMap = (
  ds: DsTheme,
): Record<string, { bg: string; fg: string }> => ({
  Open: { bg: ds.carbon[1000], fg: ds.carbon[400] },
  "RCA Under Review": { bg: ds.flame[1000], fg: ds.flame[100] },
  "RCA Submitted": { bg: ds.sky[1000], fg: ds.sky[100] },
});

export const getIncidentRca = (rca: string | undefined, ds: DsTheme) => {
  if (!rca) return null;
  return {
    label: rca,
    ...(incidentRcaMap(ds)[rca] ?? { bg: ds.carbon[1000], fg: ds.carbon[400] }),
  };
};

/** Icon well behind the row glyph — tinted by the incident's status. */
export const getIncidentTint = (status: string | undefined, ds: DsTheme) => {
  switch (status) {
    case "Inprogress":
      return { tint: ds.sky[1000], icon: ds.sky[100] };
    case "Resolved":
      return { tint: ds.sky[900], icon: ds.isDark ? ds.sky[100] : "#1F757D" };
    default:
      return { tint: ds.flame[1000], icon: ds.flame[100] };
  }
};
