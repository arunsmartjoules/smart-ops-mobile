/**
 * Calendar-date helpers for the Reports tab. Every value is an IST calendar
 * string ("YYYY-MM-DD" / "YYYY-MM"); arithmetic runs on UTC midnights so the
 * device timezone never shifts a day.
 */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split("-").map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
}

function utc(ymd: string): Date {
  const [y, m, d] = parts(ymd);
  return new Date(Date.UTC(y, m - 1, d));
}

const iso = (dt: Date) => dt.toISOString().slice(0, 10);

export function addDays(ymd: string, days: number): string {
  const dt = utc(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  return iso(dt);
}

/** "YYYY-MM" shifted by `months`. */
export function addMonths(ym: string, months: number): string {
  const [y, m] = parts(`${ym}-01`);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  return iso(dt).slice(0, 7);
}

/** Last calendar day of the "YYYY-MM" month. */
export function monthEnd(ym: string): string {
  const [y, m] = parts(`${ym}-01`);
  return iso(new Date(Date.UTC(y, m, 0)));
}

export const weekdayShort = (ymd: string) => WD[utc(ymd).getUTCDay()] ?? "";
export const dayNum = (ymd: string) => String(parts(ymd)[2]);
export const monShort = (ym: string) => MON[parts(`${ym}-01`)[1] - 1] ?? "";
export const yearOf = (ym: string) => String(parts(`${ym}-01`)[0]);

/** "Tue 20 Oct 2026". */
export function fmtLongDay(ymd: string): string {
  const [y, m, d] = parts(ymd);
  return `${weekdayShort(ymd)} ${d} ${MON[m - 1]} ${y}`;
}

/**
 * "1–19 Aug 2026" · "28 Sep – 4 Oct 2026" · "28 Dec 2025 – 3 Jan 2026";
 * `year: false` drops the trailing year ("1–19 Aug").
 */
export function fmtRange(from: string, to: string, year = true): string {
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  const tail = year ? ` ${ty}` : "";
  if (from === to) return `${td} ${MON[tm - 1]}${tail}`;
  if (fy === ty && fm === tm) return `${fd}–${td} ${MON[tm - 1]}${tail}`;
  if (fy === ty) return `${fd} ${MON[fm - 1]} – ${td} ${MON[tm - 1]}${tail}`;
  return `${fd} ${MON[fm - 1]} ${fy} – ${td} ${MON[tm - 1]} ${ty}`;
}

/** `count` consecutive days ending on `end`, oldest first. */
export function daysEnding(end: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(end, i - (count - 1)));
}

/** `count` consecutive "YYYY-MM" months ending on `endYm`, oldest first. */
export function monthsEnding(endYm: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(endYm, i - (count - 1)));
}

export type RangePreset = "month" | "week" | "lastMonth" | "today";

export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "week", label: "Last 7 days" },
  { key: "lastMonth", label: "Last month" },
  { key: "today", label: "Today" },
];

export function presetRange(key: RangePreset, today: string): { from: string; to: string } {
  switch (key) {
    case "today":
      return { from: today, to: today };
    case "week":
      return { from: addDays(today, -6), to: today };
    case "lastMonth": {
      const ym = addMonths(today.slice(0, 7), -1);
      return { from: `${ym}-01`, to: monthEnd(ym) };
    }
    case "month":
    default:
      return { from: `${today.slice(0, 7)}-01`, to: today };
  }
}
