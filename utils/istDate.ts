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
const IST_OFFSET = "+05:30";

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

/** Epoch ms of IST 00:00:00.000 for the IST calendar day containing `input`. */
export const istDayStartMs = (input?: DateInput): number => {
  const ymd = istDateString(input);
  return ymd ? Date.parse(`${ymd}T00:00:00.000${IST_OFFSET}`) : NaN;
};

/** Epoch ms of IST 23:59:59.999 for the IST calendar day containing `input`. */
export const istDayEndMs = (input?: DateInput): number => {
  const ymd = istDateString(input);
  return ymd ? Date.parse(`${ymd}T23:59:59.999${IST_OFFSET}`) : NaN;
};

/** Epoch ms of IST 00:00 for an explicit "YYYY-MM-DD" string. */
export const istDayStartMsFromYmd = (ymd: string | null | undefined): number | null => {
  if (!ymd) return null;
  const ms = Date.parse(`${ymd.slice(0, 10)}T00:00:00.000${IST_OFFSET}`);
  return Number.isNaN(ms) ? null : ms;
};

/** Epoch ms of IST 23:59:59.999 for an explicit "YYYY-MM-DD" string. */
export const istDayEndMsFromYmd = (ymd: string | null | undefined): number | null => {
  if (!ymd) return null;
  const ms = Date.parse(`${ymd.slice(0, 10)}T23:59:59.999${IST_OFFSET}`);
  return Number.isNaN(ms) ? null : ms;
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
