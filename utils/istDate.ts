/**
 * Centralised India Standard Time (IST) date helpers.
 *
 * The app is operated entirely in India. All *calendar-day* logic ("today",
 * date filters, day grouping) and all *on-screen* date/time formatting must be
 * IST, never the device timezone and never a UTC slice of an ISO string
 * (`toISOString().slice(0,10)` rolls the day over 5.5h early).
 *
 * Instants stored in / sent to the backend stay UTC ISO — only their
 * interpretation for day-bucketing and display is pinned to IST here.
 *
 * India has no DST, so IST is a fixed +05:30 offset; that lets us build exact
 * day boundaries by appending the literal "+05:30" offset.
 */

export const IST_TZ = "Asia/Kolkata";
// IST is a fixed UTC+05:30 (no DST). We do boundary math with this offset
// rather than Date.parse("...+05:30"): Hermes (React Native's JS engine)
// does NOT reliably parse non-Z timezone offsets and returns Invalid Date,
// which would silently collapse every date filter.
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const DAY_MS = 24 * 60 * 60_000;

type DateInput = Date | number | string | null | undefined;

const toDate = (input?: DateInput): Date => {
  if (input == null) return new Date();
  if (input instanceof Date) return input;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? new Date(NaN) : d;
};

/** IST calendar date as "YYYY-MM-DD" (en-CA gives that exact shape). */
export const istDateString = (input?: DateInput): string => {
  const d = toDate(input);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
};

/** Today's IST calendar date as "YYYY-MM-DD". */
export const istTodayString = (): string => istDateString(new Date());

export interface ISTParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
}

/** Numeric IST clock/calendar parts for a given instant. */
export const istParts = (input?: DateInput): ISTParts => {
  const d = toDate(input);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl can emit "24" for midnight in some engines; normalise to 0.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
};

/** Epoch ms of IST 00:00 for an explicit "YYYY-MM-DD" string. */
export const istDayStartMsFromYmd = (
  ymd: string | null | undefined,
): number | null => {
  if (!ymd) return null;
  const m = String(ymd).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  // UTC midnight of that calendar date, shifted back by the IST offset →
  // the exact instant of 00:00 IST on that day.
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - IST_OFFSET_MS;
};

/** Epoch ms of IST 23:59:59.999 for an explicit "YYYY-MM-DD" string. */
export const istDayEndMsFromYmd = (
  ymd: string | null | undefined,
): number | null => {
  const start = istDayStartMsFromYmd(ymd);
  return start == null ? null : start + DAY_MS - 1;
};

/** Epoch ms of IST 00:00:00.000 for the IST calendar day containing `input`. */
export const istDayStartMs = (input?: DateInput): number =>
  istDayStartMsFromYmd(istDateString(input)) ?? NaN;

/** Epoch ms of IST 23:59:59.999 for the IST calendar day containing `input`. */
export const istDayEndMs = (input?: DateInput): number =>
  istDayEndMsFromYmd(istDateString(input)) ?? NaN;

/**
 * Parse a server-shaped date value to an epoch ms anchored to IST.
 *
 * Use this in place of `new Date(value).getTime()` whenever the server sends a
 * calendar date (Postgres DATE → "YYYY-MM-DD" string). `new Date("2026-06-01")`
 * is engine- and timezone-sensitive: spec says UTC midnight, Hermes has
 * historically parsed date-only strings as *local* midnight, and even
 * spec-compliant engines collapse to the wrong IST calendar day on devices
 * whose offset is ahead of UTC+05:30 — landing the resulting epoch ms inside
 * the previous IST day's [start, end] window. That is the failure mode behind
 * the Sunshine "Jun 1 leaking into May filter, displayed as May 31" PM bug.
 *
 * - "YYYY-MM-DD" → IST 00:00 ms of that calendar day (no `new Date` round-trip)
 * - ISO timestamp / number / Date → as parsed (already an instant, not a date)
 * - null / undefined / empty / invalid → null
 */
export const toIstDayMs = (input?: DateInput): number | null => {
  if (input == null || input === "") return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (input instanceof Date) {
    const t = input.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof input === "string") {
    const ymd = istDayStartMsFromYmd(input);
    if (ymd != null) return ymd;
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  return null;
};

/**
 * Coerce a server-shaped date value to a "YYYY-MM-DD" IST calendar day string.
 *
 * Companion to {@link toIstDayMs} for stored-as-string columns (site_logs
 * `scheduled_date`, etc.). Same reason: never round-trip a date-only string
 * through `new Date(string)`, which on Hermes / non-IST devices can roll the
 * calendar day backward and produce e.g. "2026-05-31" for a server value of
 * "2026-06-01".
 *
 * - "YYYY-MM-DD" → returned verbatim (fast path)
 * - ISO timestamp / number / Date → converted to the IST calendar day
 * - null / undefined / empty / invalid → null
 */
export const toIstYmd = (input?: DateInput): string | null => {
  if (input == null || input === "") return null;
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  if (typeof input === "string" || typeof input === "number" || input instanceof Date) {
    const d = input instanceof Date ? input : new Date(input);
    return Number.isNaN(d.getTime()) ? null : istDateString(d);
  }
  return null;
};

/** ISO instant (UTC, for the wire) at IST 00:00 of the given day. */
export const istDayStartIso = (ymd: string | null | undefined): string | undefined => {
  const ms = istDayStartMsFromYmd(ymd);
  return ms == null ? undefined : new Date(ms).toISOString();
};

/** ISO instant (UTC, for the wire) at IST 23:59:59.999 of the given day. */
export const istDayEndIso = (ymd: string | null | undefined): string | undefined => {
  const ms = istDayEndMsFromYmd(ymd);
  return ms == null ? undefined : new Date(ms).toISOString();
};

/**
 * Format an instant for display in IST. Pass `Intl.DateTimeFormat` options;
 * `timeZone` is forced to IST so it never follows the device clock.
 */
export const formatIST = (
  input: DateInput,
  options: Intl.DateTimeFormatOptions,
  locale = "en-GB",
): string => {
  const d = toDate(input);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: IST_TZ }).format(d);
};

/** "12 May 2026" style date in IST. */
export const formatISTDate = (input?: DateInput): string =>
  formatIST(input, { day: "numeric", month: "short", year: "numeric" });

/** "12 May 2026, 14:30" style date-time in IST (24h). */
export const formatISTDateTime = (input?: DateInput): string =>
  formatIST(input, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/** "2:30 PM" style time in IST. */
export const formatISTTime = (input?: DateInput): string =>
  formatIST(input, { hour: "numeric", minute: "2-digit", hour12: true }, "en-US");
