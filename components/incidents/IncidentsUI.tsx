/**
 * Incident colour + label rules in the JouleOps App artboard's vocabulary
 * (app.dc.html: TK_ST status colours, TINT washes, the RCA stage bar).
 *
 * Lifecycle: In progress → Resolved → RCA Submitted. A legacy "Open" row is
 * treated like In progress. The RCA is only due once the incident is
 * Resolved; filing it moves the status on to "RCA Submitted".
 */
import { toneBg, toneFg, type JoTheme, type JoTone } from "@/constants/jo";

export const INCIDENT_STATUS_LABEL: Record<string, string> = {
  Open: "Open",
  Inprogress: "In progress",
  Resolved: "Resolved",
  "RCA Submitted": "RCA Submitted",
};

/** Artboard TK_ST: Open = BAD, In progress = INFO, Resolved = OK. */
export function incidentStatusTone(status: string | undefined): JoTone {
  switch (status) {
    case "Open":
      return "bad";
    case "Resolved":
    case "RCA Submitted":
      return "ok";
    case "Inprogress":
    default:
      return "info";
  }
}

export function getIncidentStatus(status: string | undefined, t: JoTheme) {
  const tone = incidentStatusTone(status);
  return {
    label: INCIDENT_STATUS_LABEL[status || "Inprogress"] ?? status ?? "In progress",
    tone,
    bg: toneBg(t, tone),
    fg: toneFg(t, tone),
  };
}

/** Still being worked — the age reads as urgent (artboard ageColor). */
export const isIncidentOpen = (status: string | undefined) =>
  status === "Inprogress" || status === "Open";

/**
 * The artboard's RCA stage bar (RCA not started 8% / in review 55% /
 * submitted 100%), mapped onto the real rca_status + status pair.
 */
export function rcaStage(
  item: { status?: string; rca_status?: string },
  t: JoTheme,
): { label: string; pct: number; color: string } {
  if (item.status === "RCA Submitted" || item.rca_status === "RCA Submitted") {
    return { label: "RCA submitted", pct: 100, color: t.ok };
  }
  if (item.rca_status === "RCA Under Review") {
    return { label: "RCA in review", pct: 55, color: t.info };
  }
  if (item.status === "Resolved") {
    // Work done, RCA owed — the one gap the status pill cannot show.
    return { label: "RCA pending", pct: 8, color: t.bad };
  }
  // In progress: the RCA is not due until the incident is resolved.
  return { label: "RCA not started", pct: 8, color: t.faint };
}

/** Severity → tone (Critical = bad, Moderate = warn, Low = info). */
export function severityTone(severity: string | null | undefined): JoTone {
  switch (severity) {
    case "Critical":
      return "bad";
    case "Moderate":
      return "warn";
    case "Low":
      return "info";
    default:
      return "mute";
  }
}

export const toMs = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const ms = typeof v === "number" ? v : Date.parse(String(v));
  return Number.isNaN(ms) ? null : ms;
};

/** "1h 29m" / "2d 8h" / "5d" — the compact age format the ticket rows use. */
export function formatAge(value?: string | number | null, until: number = Date.now()): string {
  const started = toMs(value);
  if (started == null) return "—";
  const mins = Math.max(0, Math.floor((until - started) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${String(mins % 60).padStart(2, "0")}m`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  if (days >= 3 || restHours === 0) return `${days}d`;
  return `${days}d ${restHours}h`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A raw user id (not a name) — show a neutral avatar instead of its "initials". */
export const looksLikeId = (s: string) => UUID_RE.test(s.trim());
