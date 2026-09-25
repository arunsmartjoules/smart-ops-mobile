/**
 * Incident-specific colour maps, mirroring the ticket list's treatment so the
 * two module tabs read identically. The surrounding chrome (header, status
 * tabs, count line, empty card) is shared — see components/shared/ListChrome.
 */
import type { DsTheme } from "@/hooks/useDs";

export { soRadius, soShadow } from "@/components/home/SiteOverview";

/**
 * The full lifecycle in one vocabulary: In progress → Resolved → RCA
 * Submitted. RCA used to ride in a second badge; it is a status of its own now
 * (2026-09-25), so a row carries exactly one chip.
 */
export const incidentStatusMap = (
  ds: DsTheme,
): Record<string, { label: string; bg: string; fg: string }> => ({
  Open: { label: "Open", bg: ds.flame[1000], fg: ds.flame[100] },
  Inprogress: { label: "In progress", bg: ds.sky[1000], fg: ds.sky[100] },
  Resolved: { label: "Resolved", bg: ds.sky[900], fg: ds.sky[100] },
  "RCA Submitted": { label: "RCA Submitted", bg: ds.thunder[1000], fg: ds.thunder[100] },
});

export const getIncidentStatus = (status: string | undefined, ds: DsTheme) =>
  incidentStatusMap(ds)[status || "Inprogress"] ?? {
    label: status || "In progress",
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
      return { tint: ds.sky[900], icon: ds.sky[100] };
    case "RCA Submitted":
      return { tint: ds.thunder[1000], icon: ds.thunder[100] };
    default:
      return { tint: ds.flame[1000], icon: ds.flame[100] };
  }
};
