/**
 * Efficiency — model, formatters and per-side configuration for the mobile
 * Resources › Efficiency screen. Ported from the web page's
 * web/src/app/efficiency/lib/efficiency.ts so both read the same numbers:
 * same counters (sum of kWh / TRh, mean of daily SEC), same columns, same
 * 0.85 kWh/TRh plant target on the high side and no target on the low side.
 *
 * `report_date` arrives as a plain "YYYY-MM-DD" string (the backend parses
 * Postgres DATE as text) and the numeric columns arrive as strings (node-pg
 * returns `numeric` as text), so every helper here coerces and never builds a
 * local `Date` from a calendar string.
 */
import type { BxName } from "@/components/jo/Bx";
import { addMonths, monthEnd } from "@/components/reports/dates";
import type { EffRow, EffSide } from "@/services/EfficiencyService";

export type { EffRow, EffSide };

/**
 * Plant SEC target in kWh/TRh — the web page's SEC_TARGET
 * (web/src/app/efficiency/lib/efficiency.ts) and the value the Home screen's
 * "Plant efficiency" card flags against.
 */
export const SEC_TARGET = 0.85;

export type NumKind = "kwh" | "trh" | "sec";
type NumField = Exclude<keyof EffRow, "id" | "report_date" | "day" | "site_id" | "source_id" | "created_at" | "updated_at" | "last_synced_at">;

export interface CounterDef {
  label: string;
  unit: string;
  field: NumField;
  agg: "sum" | "mean";
  kind: NumKind;
  icon: BxName;
}

export interface MetricColumn {
  key: NumField;
  label: string;
  unit: string;
  kind: NumKind;
}

export interface SideConfig {
  key: EffSide;
  label: string;
  icon: BxName;
  /** Field the chart plots and the hero averages. */
  secField: NumField;
  secLabel: string;
  /** SEC target (kWh/TRh); null = no target for this side (web: low side). */
  target: number | null;
  /** The two sum counters shown beside the SEC hero. */
  counters: CounterDef[];
  columns: MetricColumn[];
  chartTitle: string;
  tableTitle: string;
  tableNote: string;
}

export const SIDES: Record<EffSide, SideConfig> = {
  high: {
    key: "high",
    label: "High side",
    icon: "bxs-zap",
    secField: "plant_sec",
    secLabel: "Plant SEC",
    target: SEC_TARGET,
    counters: [
      { label: "HVAC consumption", unit: "kWh", field: "plant_consumption", agg: "sum", kind: "kwh", icon: "bxs-plug" },
      { label: "Tonnage delivered", unit: "TRh", field: "trh_delivered", agg: "sum", kind: "trh", icon: "bxs-thermometer" },
    ],
    columns: [
      { key: "plant_sec", label: "Plant SEC", unit: "kWh/TRh", kind: "sec" },
      { key: "plant_consumption", label: "HVAC total", unit: "kWh", kind: "kwh" },
      { key: "trh_delivered", label: "Tonnage", unit: "TRh", kind: "trh" },
      { key: "chiller_consumption", label: "Chiller", unit: "kWh", kind: "kwh" },
      { key: "chwp_consumption", label: "CHWP", unit: "kWh", kind: "kwh" },
      { key: "cndp_consumption", label: "CNDP", unit: "kWh", kind: "kwh" },
      { key: "ct_consumption", label: "CT", unit: "kWh", kind: "kwh" },
    ],
    chartTitle: "Plant SEC — daily",
    tableTitle: "High side — day wise",
    tableNote: `Days above the ${SEC_TARGET.toFixed(2)} SEC target are flagged`,
  },
  low: {
    key: "low",
    label: "Low side",
    icon: "bx-cloud-snow",
    secField: "low_side_sec",
    secLabel: "Low side SEC",
    target: null,
    counters: [
      { label: "Tonnage", unit: "TRh", field: "tonnage", agg: "sum", kind: "trh", icon: "bxs-thermometer" },
      { label: "Total consumption", unit: "kWh", field: "total_consumption", agg: "sum", kind: "kwh", icon: "bxs-plug" },
    ],
    columns: [
      { key: "low_side_sec", label: "Low side SEC", unit: "kWh/TRh", kind: "sec" },
      { key: "low_side_with_heater_sec", label: "w/ heater SEC", unit: "kWh/TRh", kind: "sec" },
      { key: "tonnage", label: "Tonnage", unit: "TRh", kind: "trh" },
      { key: "total_consumption", label: "Total", unit: "kWh", kind: "kwh" },
    ],
    chartTitle: "Low side SEC — daily",
    tableTitle: "Low side — day wise",
    tableNote: "Low side SEC is the standard (without-heater) metric",
  },
};

/* ── Numbers ───────────────────────────────────────────────────────────── */

/** A finite number or null — `numeric` columns come over the wire as strings. */
export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const DASH = "—";

/** Indian digit grouping without relying on Hermes' Intl locale data. */
function groupIN(int: number): string {
  const neg = int < 0;
  const s = String(Math.abs(int));
  if (s.length <= 3) return (neg ? "-" : "") + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${rest},${last3}`;
}

/** 2-decimal SEC (headline / chart), or an em dash. */
export function n2(v: unknown): string {
  const n = toNum(v);
  return n === null ? DASH : (Math.round(n * 100) / 100).toFixed(2);
}

/** 3-decimal SEC (table cells, footer average), or an em dash. */
export function n3(v: unknown): string {
  const n = toNum(v);
  return n === null ? DASH : (Math.round(n * 1000) / 1000).toFixed(3);
}

/** Whole kWh / TRh with Indian grouping, or an em dash. */
export function whole(v: unknown): string {
  const n = toNum(v);
  return n === null ? DASH : groupIN(Math.round(n));
}

/** Compact counter headline: Cr / L above a lakh (web `big`). */
export function big(v: unknown): string {
  const n = toNum(v);
  if (n === null) return DASH;
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  if (n >= 1e3) return groupIN(Math.round(n));
  return String(Math.round(n * 10) / 10);
}

export function formatCell(v: unknown, kind: NumKind): string {
  return kind === "sec" ? n3(v) : whole(v);
}

export function sum(list: unknown[]): number | null {
  const v = list.map(toNum).filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
}

export function mean(list: unknown[]): number | null {
  const v = list.map(toNum).filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function aggregate(rows: EffRow[], field: NumField, agg: "sum" | "mean"): number | null {
  const vals = rows.map((r) => r[field]);
  return agg === "sum" ? sum(vals) : mean(vals);
}

/** Over the side's target? (false when there is no target or no value.) */
export function overTarget(v: unknown, target: number | null): boolean {
  const n = toNum(v);
  return target !== null && n !== null && n > target;
}

/**
 * Y-axis ticks in 0.2 steps (web `niceStepTicks`), widened by whole steps
 * when the range would need more than `maxTicks` gridlines.
 */
export function niceStepTicks(maxVal: number, unit = 0.2, maxTicks = 6): number[] {
  const safeMax = Number.isFinite(maxVal) && maxVal > 0 ? maxVal : unit;
  let step = unit;
  while (Math.ceil(safeMax / step - 1e-9) > maxTicks) step += unit;
  const top = Math.ceil(safeMax / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/* ── Calendar dates (string in / string out, UTC-anchored) ─────────────── */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymdParts(d: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function nextDay(d: string): string {
  const p = ymdParts(d);
  if (!p) return d;
  const t = new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1));
  return t.toISOString().slice(0, 10);
}

/** Every calendar day from `from` to `to`, inclusive (guarded). */
export function allDates(from: string, to: string, guard = 400): string[] {
  const out: string[] = [];
  let cur = from;
  for (let i = 0; cur <= to && i < guard; i++) {
    out.push(cur);
    const nxt = nextDay(cur);
    if (nxt === cur) break;
    cur = nxt;
  }
  return out;
}

/** "2026-10-04" → "4 Oct". */
export function shortDate(d: string | null | undefined): string {
  const p = d ? ymdParts(d) : null;
  return p ? `${p[2]} ${MON[p[1] - 1] ?? ""}` : "";
}

/** "2026-10-04" → "Sun". */
export function weekday(d: string | null | undefined): string {
  const p = d ? ymdParts(d) : null;
  return p ? WD[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] ?? "" : "";
}

/** "2026-10" → "Oct 2026". */
export function monthLabel(ym: string): string {
  const p = ymdParts(`${ym}-01`);
  return p ? `${MON[p[1] - 1] ?? ""} ${p[0]}` : ym;
}

/** `count` months ending at `endYm`, newest first. */
export function recentMonths(endYm: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(endYm, -i));
}

/**
 * The period a month pick covers: the whole month, except the current month,
 * which runs to `today` (the web's "This Month" preset).
 */
export function monthRange(ym: string, today: string): { from: string; to: string } {
  const end = monthEnd(ym);
  return { from: `${ym}-01`, to: end > today ? today : end };
}
