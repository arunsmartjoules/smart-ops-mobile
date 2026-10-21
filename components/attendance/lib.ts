/**
 * Pure helpers for the Attendance tab — how long a session ran, how a day
 * reads (full / short / missed …), calendar-date keys and the week strip.
 * Moved verbatim from app/(tabs)/attendance.tsx where they already existed;
 * the week/date-key helpers are new and only feed presentation.
 */
import { format } from "date-fns";
import { getISTDateString, type AttendanceLog, type Site } from "@/services/AttendanceService";

/** Reuse cached foreground location reads for this long (ms). */
export const LOCATION_FRESHNESS_MS = 5 * 60 * 1000;

/**
 * How long an open session may run before it reads as a missed checkout, and
 * the app's own early-checkout threshold (the reason sheet fires below it).
 */
export const MISSED_CHECKOUT_HOURS = 17;
export const EARLY_CHECKOUT_MINUTES = 7 * 60;
/** A runaway open session is capped here rather than accruing forever. */
const MAX_SESSION_HOURS = 20;

export type DayKind = "full" | "short" | "missed" | "leave" | "active";

/** Minutes worked for a log; null when there is no check-in to measure from. */
export function durationMinutes(log: AttendanceLog, now: Date): number | null {
  if (!log.check_in_time) return null;
  const start = new Date(log.check_in_time);
  if (Number.isNaN(start.getTime())) return null;

  let end: Date;
  if (log.check_out_time) {
    end = new Date(log.check_out_time);
    if (Number.isNaN(end.getTime())) return null;
  } else {
    const hours = (now.getTime() - start.getTime()) / 3_600_000;
    end = hours <= MAX_SESSION_HOURS ? now : new Date(start.getTime() + MAX_SESSION_HOURS * 3_600_000);
  }

  const mins = Math.floor((end.getTime() - start.getTime()) / 60_000);
  return Number.isNaN(mins) || mins < 0 ? 0 : mins;
}

export const formatHm = (mins: number) => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;

export function dayKind(log: AttendanceLog, now: Date): DayKind {
  if (log.status === "Leave") return "leave";
  if (!log.check_in_time) return "missed";
  if (!log.check_out_time) {
    const start = new Date(log.check_in_time);
    const hours = (now.getTime() - start.getTime()) / 3_600_000;
    return hours > MISSED_CHECKOUT_HOURS ? "missed" : "active";
  }
  const mins = durationMinutes(log, now) ?? 0;
  return mins < EARLY_CHECKOUT_MINUTES ? "short" : "full";
}

/** A day that needs a second look — the artboard's "Flagged" filter. */
export const isFlagged = (kind: DayKind) => kind === "short" || kind === "missed";

export const safeTime = (value: string | undefined, pattern: string) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : format(d, pattern);
};

export function formatLocationFailureMessage(
  message: string,
  userLocation?: { latitude: number; longitude: number } | null,
  nearestSite?: Site,
) {
  const parts = [message];
  if (userLocation) {
    parts.push(`\nYour location: ${userLocation.latitude.toFixed(6)}, ${userLocation.longitude.toFixed(6)}`);
  }
  if (nearestSite) {
    const d = nearestSite.distanceMeters ?? nearestSite.distance ?? "?";
    const r = nearestSite.radius ?? 200;
    parts.push(`\nNearest site "${nearestSite.name}": about ${d}m away (allowed radius: ${r}m).`);
  }
  return parts.join("");
}

/* ── Calendar dates ─────────────────────────────────────────────────────── */

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})/;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * The log's IST calendar day as "YYYY-MM-DD". `date` is a calendar-date column
 * (never `new Date()` it — that shifts the day outside IST); fall back to the
 * check-in instant rendered in IST.
 */
export function logDateKey(log: AttendanceLog): string | null {
  const m = DATE_KEY.exec(String(log.date || ""));
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (log.check_in_time) {
    const d = new Date(log.check_in_time);
    if (!Number.isNaN(d.getTime())) return getISTDateString(d) || null;
  }
  return null;
}

/** "2026-08-16" → { day: "16", dow: "Sun" } without any timezone conversion. */
export function dateKeyParts(key: string | null): { day: string; dow: string } {
  const m = key ? DATE_KEY.exec(key) : null;
  if (!m) return { day: "—", dow: "" };
  const utc = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return { day: String(Number(m[3])), dow: DOW[utc.getUTCDay()] ?? "" };
}

/** `key` stepped back `n` calendar days (pure date arithmetic, no tz). */
function shiftDateKey(key: string, n: number): string | null {
  const m = DATE_KEY.exec(key);
  if (!m) return null;
  const utc = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - n));
  return utc.toISOString().slice(0, 10);
}

export type WeekCellKind = DayKind | "today" | "none";

export interface WeekCell {
  key: string;
  day: string;
  dow: string;
  kind: WeekCellKind;
}

/**
 * The 7 calendar days ending today (IST). A day with several sessions takes
 * its latest check-in; today is always the accent cell, as on the artboard.
 */
export function buildWeek(logs: AttendanceLog[], todayKey: string, now: Date): WeekCell[] {
  const latest = new Map<string, AttendanceLog>();
  for (const log of logs) {
    const key = logDateKey(log);
    if (!key) continue;
    const prev = latest.get(key);
    if (!prev || String(log.check_in_time || "") > String(prev.check_in_time || "")) latest.set(key, log);
  }
  const cells: WeekCell[] = [];
  for (let back = 6; back >= 0; back--) {
    const key = shiftDateKey(todayKey, back);
    if (!key) continue;
    const { day, dow } = dateKeyParts(key);
    const log = latest.get(key);
    cells.push({
      key,
      day,
      dow,
      kind: back === 0 ? "today" : log ? dayKind(log, now) : "none",
    });
  }
  return cells;
}
