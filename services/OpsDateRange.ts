/**
 * The Ops date range — one range shared by every Ops sub-tab (Tickets, PM,
 * Site Logs history, Incidents), set from the header above the sub-tabs.
 * In memory: survives switching tabs, resets to "This month" on app restart.
 *
 * Dates are IST calendar dates as "YYYY-MM-DD" strings (never `new Date()`
 * a calendar date — see CLAUDE.md).
 */
import { useSyncExternalStore } from "react";
import { istTodayString } from "@/utils/istDate";

export type OpsDatePreset = "today" | "week" | "month" | "lastMonth" | "last3" | "custom";

export interface OpsDateRange {
  preset: OpsDatePreset;
  /** Inclusive IST calendar dates. */
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Days in a 1-based month. */
function daysIn(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Shift a "YYYY-MM-DD" by whole days, in UTC so no timezone can move it. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Range for a preset, relative to IST `today`. */
export function rangeForPreset(preset: Exclude<OpsDatePreset, "custom">, today = istTodayString()): OpsDateRange {
  const [y, m] = today.split("-").map(Number) as [number, number];
  switch (preset) {
    case "today":
      return { preset, from: today, to: today };
    case "week": {
      // Monday-based week containing today.
      const [, , d] = today.split("-").map(Number) as [number, number, number];
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
      const from = addDaysIso(today, dow === 0 ? -6 : 1 - dow);
      return { preset, from, to: addDaysIso(from, 6) };
    }
    case "month":
      // Whole month: PM due dates run past today; tickets/incidents simply
      // have none after it.
      return { preset, from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(daysIn(y, m))}` };
    case "lastMonth": {
      const ly = m === 1 ? y - 1 : y;
      const lm = m === 1 ? 12 : m - 1;
      return { preset, from: `${ly}-${pad(lm)}-01`, to: `${ly}-${pad(lm)}-${pad(daysIn(ly, lm))}` };
    }
    case "last3": {
      // This month and the two before it.
      const sm = ((m - 3 + 12) % 12) + 1;
      const sy = m <= 2 ? y - 1 : y;
      return { preset, from: `${sy}-${pad(sm)}-01`, to: `${y}-${pad(m)}-${pad(daysIn(y, m))}` };
    }
  }
}

let state: OpsDateRange = rangeForPreset("month");
const listeners = new Set<() => void>();

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const snapshot = () => state;

export function setOpsDateRange(next: OpsDateRange) {
  // Keep the range ordered whichever end moved.
  const ordered = next.from <= next.to ? next : { ...next, from: next.to, to: next.from };
  if (ordered.from === state.from && ordered.to === state.to && ordered.preset === state.preset) return;
  state = ordered;
  listeners.forEach((l) => l());
}

export function useOpsDateRange(): OpsDateRange {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export const PRESET_LABEL: Record<OpsDatePreset, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  lastMonth: "Last month",
  last3: "Last 3 months",
  custom: "Custom",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "07 Oct" / "01–31 Oct" / "28 Sep–03 Oct" / with year when outside the current one. */
export function formatOpsRange(from: string, to: string, today = istTodayString()): string {
  const dm = (iso: string, withYear: boolean) => {
    const [y, m, d] = iso.split("-");
    return `${d} ${MONTHS[Number(m) - 1] ?? ""}${withYear ? ` ${y}` : ""}`;
  };
  const year = today.slice(0, 4);
  const showYear = from.slice(0, 4) !== year || to.slice(0, 4) !== year;
  if (from === to) return dm(from, showYear);
  if (from.slice(0, 7) === to.slice(0, 7)) return `${from.slice(8, 10)}–${dm(to, showYear)}`;
  return `${dm(from, showYear && from.slice(0, 4) !== to.slice(0, 4))}–${dm(to, showYear)}`;
}
