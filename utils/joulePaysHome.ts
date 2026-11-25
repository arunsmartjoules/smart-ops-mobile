/**
 * Pure rules for the JoulePays Home (app/(tabs)/dashboard.tsx at a JoulePays
 * site, drawn by components/home/JoulePaysHome). No React, no storage, so the
 * whole file is unit tested (__tests__/joulePaysHome.test.ts).
 *
 * The Home reads the site's BILLING month (for example 8 Nov to 7 Dec): the
 * day list the trend sheet's month screen uses, and for roles that can see
 * the savings dashboard, the site's row of `GET /api/trend-sheet/dashboard`.
 */
import {
  addDaysYmd,
  daysBetweenYmd,
  dayMonthLabel,
  formatTargetPct,
  type TrendDayList,
  type TrendDayListItem,
} from "./trendSheet";

/* ── The billing-cycle strip ───────────────────────────────────────────── */

/**
 * How one day of the billing month is drawn.
 * - `on_target` / `below`: entered, with an Electricity saving above zero.
 * - `no_saving`: entered, saving shown as 0 %. The server floors a day's
 *   saving % at zero, so this may hide a loss: it makes no target claim.
 * - `pending`: entered, but no saving worked out yet (a baseline or target
 *   is missing, or DG is still to come).
 * - `not_entered`: an earlier day with nothing entered.
 * - `today`: today, nothing entered yet (not a miss: the day is still open).
 * - `upcoming`: after today.
 */
export type CycleDayState = "on_target" | "below" | "no_saving" | "pending" | "not_entered" | "today" | "upcoming";

export interface CycleBar {
  date: string;
  state: CycleDayState;
  /** The day's Electricity saving %, when there is one. */
  pct: number | null;
  /** The day's target %, when set. */
  target: number | null;
}

function stateOf(d: TrendDayListItem | undefined, date: string, today: string): CycleDayState {
  if (date > today) return "upcoming";
  if (!d || d.status === "missing") return date === today ? "today" : "not_entered";
  const pct = d.electricity_saving_pct;
  if (pct == null) return "pending";
  if (pct <= 0) return "no_saving";
  const target = d.electricity_target_pct;
  return target != null && pct < target ? "below" : "on_target";
}

/** Longest billing month we draw; a guard against a malformed range, not a business rule. */
const MAX_CYCLE_DAYS = 62;

/**
 * One bar per day from the list's first to last date, whether or not the
 * server sent a row for that day (a day it left out reads as not entered).
 */
export function cycleBars(list: Pick<TrendDayList, "from" | "to" | "days">, today: string): CycleBar[] {
  const span = daysBetweenYmd(list.from, list.to);
  if (!(span >= 0)) return [];
  const byDate = new Map(list.days.map((d) => [d.date, d]));
  const out: CycleBar[] = [];
  for (let i = 0; i <= Math.min(span, MAX_CYCLE_DAYS - 1); i += 1) {
    const date = addDaysYmd(list.from, i);
    const d = byDate.get(date);
    out.push({
      date,
      state: stateOf(d, date, today),
      pct: d?.electricity_saving_pct ?? null,
      target: d?.electricity_target_pct ?? null,
    });
  }
  return out;
}

/**
 * The strip in words, for a screen reader: "2 days on target, 15 days with no
 * saving, today still to enter, 12 days to come". Kinds with no days are left out.
 */
export function stripSummary(bars: readonly CycleBar[]): string {
  const n = (state: CycleDayState) => bars.filter((b) => b.state === state).length;
  const days = (k: number) => `${k} day${k === 1 ? "" : "s"}`;
  const parts = [
    n("on_target") ? `${days(n("on_target"))} on target` : null,
    n("below") ? `${days(n("below"))} below target` : null,
    n("no_saving") + n("pending") ? `${days(n("no_saving") + n("pending"))} with no saving` : null,
    n("not_entered") ? `${days(n("not_entered"))} not entered` : null,
    n("today") ? "today still to enter" : null,
    n("upcoming") ? `${days(n("upcoming"))} to come` : null,
  ].filter((p): p is string => !!p);
  return parts.length ? parts.join(", ") : "No days to show";
}

/** Earlier days of the month with nothing entered, oldest first. */
export function missedDates(bars: readonly CycleBar[]): string[] {
  return bars.filter((b) => b.state === "not_entered").map((b) => b.date);
}

/**
 * Where today sits in the billing month: "day 18 of 30". `day` is 0 before
 * the month starts and `of` once it has ended.
 */
export function cycleProgress(list: Pick<TrendDayList, "from" | "to">, today: string): { day: number; of: number } {
  const of = Math.max(0, daysBetweenYmd(list.from, list.to) + 1);
  const day = Math.max(0, Math.min(of, daysBetweenYmd(list.from, today) + 1));
  return { day, of };
}

/**
 * The top of the strip's scale, in %: the next round step above the highest
 * bar or target, so a month of 2 to 4 % savings still fills the strip. At
 * least 5 %.
 */
export function stripScale(bars: readonly CycleBar[], monthTarget: number | null | undefined): number {
  const values = bars.flatMap((b) => [b.pct, b.target]).concat(monthTarget ?? null);
  const top = Math.max(0, ...values.filter((v): v is number => v != null && Number.isFinite(v)));
  const steps = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];
  return steps.find((s) => s >= top) ?? 100;
}

/* ── Words ──────────────────────────────────────────────────────────────── */

const MINUS = "−";

/**
 * "1.40 pts above the 20% target", "On the 20% target", or null with no
 * target. `short` leaves the target's figure out ("1.40 pts above target")
 * for a place that already prints it.
 */
export function targetGapWords(
  pct: number | null | undefined,
  target: number | null | undefined,
  short = false,
): string | null {
  if (pct == null || target == null || !Number.isFinite(pct) || !Number.isFinite(target)) return null;
  const gap = Math.round((pct - target) * 100) / 100;
  const t = short ? "" : `the ${formatTargetPct(target)} `;
  if (gap === 0) return short ? "On target" : `On ${t}target`;
  return `${Math.abs(gap).toFixed(2)} pts ${gap > 0 ? "above" : "below"} ${t}target`;
}

/**
 * Dates as a short list in one month's words: "12 Nov", "12 and 14 Nov",
 * "12, 14 Nov and 3 more". Dates from two months keep each month name.
 */
export function datesInWords(dates: readonly string[], max = 3): string {
  if (dates.length === 0) return "";
  const shown = dates.slice(0, max);
  const sameMonth = shown.every((d) => d.slice(0, 7) === shown[0]!.slice(0, 7));
  const words = shown.map((d, i) => (sameMonth && i < shown.length - 1 ? String(Number(d.slice(8, 10))) : dayMonthLabel(d)));
  const rest = dates.length - shown.length;
  if (rest > 0) return `${words.join(", ")} and ${rest} more`;
  if (words.length === 1) return words[0]!;
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** Rupees in lakh, as on the web dashboard: "₹4.21 L", "−₹0.39 L"; a dash for none. */
export function formatLakh(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? MINUS : "";
  return `${sign}₹${(Math.abs(value) / 100000).toFixed(2)} L`;
}

/** "+₹0.42 L" / "−₹0.89 L": a deviation always shows its sign. */
export function formatLakhSigned(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value < 0 ? MINUS : "+"}${formatLakh(Math.abs(value))}`;
}

/* ── The savings dashboard's row for one site ──────────────────────────── */

/**
 * The fields of a `GET /api/trend-sheet/dashboard` site row the Home shows.
 * Figures cover the site's billing month up to yesterday.
 */
export interface JoulePaysContractSite {
  site_code: string;
  from: string;
  to: string;
  started: boolean;
  electricity_saving_pct: number | null;
  electricity_target_pct: number | null;
  electricity_yesterday_pct: number | null;
  energy_saving_pct: number | null;
  energy_target_pct: number | null;
  saving_mcal: number | null;
  revenue: number | null;
  target_revenue: number | null;
  revenue_deviation: number | null;
  provisional_days: number;
  incomplete_days: number;
}

export interface JoulePaysContract {
  /** The day the dashboard counts up to (IST yesterday). */
  yesterday: string;
  site: JoulePaysContractSite;
}

const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/**
 * The site's row from a dashboard answer, checked field by field (an older
 * server may lack a field: it reads as "none", never as zero). Null when the
 * answer has no row for the site.
 */
export function pickContractSite(body: unknown, siteCode: string): JoulePaysContract | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { yesterday?: unknown; sites?: unknown };
  if (!Array.isArray(b.sites)) return null;
  const row = b.sites.find((s) => s && typeof s === "object" && (s as { site_code?: unknown }).site_code === siteCode) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    yesterday: typeof b.yesterday === "string" ? b.yesterday : "",
    site: {
      site_code: siteCode,
      from: typeof row.from === "string" ? row.from : "",
      to: typeof row.to === "string" ? row.to : "",
      started: row.started !== false,
      electricity_saving_pct: numOrNull(row.electricity_saving_pct),
      electricity_target_pct: numOrNull(row.electricity_target_pct),
      electricity_yesterday_pct: numOrNull(row.electricity_yesterday_pct),
      energy_saving_pct: numOrNull(row.energy_saving_pct),
      energy_target_pct: numOrNull(row.energy_target_pct),
      saving_mcal: numOrNull(row.saving_mcal),
      revenue: numOrNull(row.revenue),
      target_revenue: numOrNull(row.target_revenue),
      revenue_deviation: numOrNull(row.revenue_deviation),
      provisional_days: count(row.provisional_days),
      incomplete_days: count(row.incomplete_days),
    },
  };
}

/** How far a figure reached its target, 0 to 100, for a bar; null with no positive target. */
export function shareOfTarget(actual: number | null | undefined, target: number | null | undefined): number | null {
  if (actual == null || target == null || !Number.isFinite(actual) || !Number.isFinite(target) || target <= 0) return null;
  return Math.max(0, Math.min(100, (actual / target) * 100));
}
