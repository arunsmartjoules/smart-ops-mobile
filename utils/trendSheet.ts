/**
 * Consumption Trend Sheet: the shapes the phone shares with the server, and
 * the pure rules that let it work with no network.
 *
 * The server is the only source of stored figures. What this file produces is
 * a PREVIEW: the cached day context with a save applied on top by the same
 * arithmetic the server runs (`utils/trendCalc.ts`, a copy of its `calc.ts`).
 * When the save reaches the server, its answer replaces the preview.
 *
 * No React, no database, no network, no clock: everything here is unit tested.
 */

import {
  computeDay,
  isElectricityAddon,
  isSavingCategory,
  pct,
  round2,
  round3,
  type BlockInput,
  type CategoryInput,
  type CategoryKind,
  type ElectricityAddon,
  type MissingInput,
  type TrendCategory,
} from "./trendCalc";

// --- Server shapes (GET /entry/..., the save answer) ---------------------------------

export type TrendEntryMode = "readings" | "units";
export type TrendDayStatus = "missing" | "partial" | "complete";

export interface TrendContextBlock {
  block_id: string;
  name: string;
  /** Electricity blocks only: the shape the form must use on this day. */
  entry_mode: TrendEntryMode | null;
  /** How the stored row was entered; null when the day has no row for the block. */
  typed: boolean | null;
  opening_reading: number | null;
  opening_date: string | null;
  final_reading: number | null;
  mf: number | null;
  add_adjustment: number;
  deduct_adjustment: number;
  carried_from: string | null;
  quantity: number | null;
  litres: number | null;
  mismatch: { expected_opening: number } | null;
}

export interface TrendContextCategory {
  category: TrendCategory;
  label: string;
  unit: string;
  kind: CategoryKind;
  entered: boolean;
  entered_by_name: string | null;
  entered_at: string | null;
  pending_inputs: MissingInput[];
  baseline?: number | null;
  baseline_kind?: string | null;
  target_pct?: number | null;
  target?: number | null;
  consumption: number | null;
  adjustment: number;
  saving: number | null;
  saving_pct: number | null;
  not_used: boolean;
  provisional: boolean;
  run_hours?: number | null;
  hourly?: boolean;
  baseline_per_hour?: number | null;
  dg_factor?: number | null;
  saving_is_manual?: boolean;
  manual_allowed?: boolean;
  blocks: TrendContextBlock[];
}

export interface TrendDayContext {
  site_code: string;
  date: string;
  is_sunday: boolean;
  /** "YYYY-MM". */
  cycle_month: string;
  status: TrendDayStatus;
  categories_expected: number;
  categories_entered: number;
  editable: boolean;
  /** The server's CALC_VERSION when this context was built. */
  calc_version: number;
  categories: TrendContextCategory[];
}

export interface TrendSaveBlock {
  block_id: string;
  final_reading?: number | null;
  opening_source?: "carried" | "typed";
  initial_reading?: number | null;
  mf?: number | null;
  add_adjustment?: number | null;
  deduct_adjustment?: number | null;
  quantity?: number | null;
  litres?: number | null;
}

/** The body of PUT /entry/:site/days/:date/categories/:category. */
export interface TrendSaveBody {
  /** ISO instant: the moment the user pressed Save. */
  client_saved_at: string;
  /** This phone's CALC_VERSION. */
  calc_version: number;
  not_used?: boolean;
  run_hours?: number | null;
  manual_saving?: number | null;
  blocks: TrendSaveBlock[];
}

export interface TrendEntrySite {
  site_code: string;
  name: string | null;
  city: string | null;
  categories: { category: TrendCategory; label: string; unit: string; blocks: number }[];
  ready: boolean;
}

export interface TrendDayListItem {
  date: string;
  status: TrendDayStatus;
  provisional: boolean;
  electricity_saving_pct: number | null;
  electricity_target_pct: number | null;
  has_mismatch: boolean;
}

export interface TrendDayList {
  from: string;
  to: string;
  days: TrendDayListItem[];
  summary: {
    saving: number | null;
    baseline: number | null;
    saving_pct: number | null;
    target_pct: number | null;
    days_entered: number;
    days_expected: number;
  };
}

// --- Entries kept on the phone ---------------------------------------------------------

/**
 * `pending`: saved here, not yet answered by the server. `synced`: the server
 * stored it. `failed`: the server refused it (the reason is in `last_error`).
 * `replaced`: the server already held a newer save, so this one changed nothing.
 */
export type TrendSyncStatus = "pending" | "synced" | "failed" | "replaced";

export interface TrendLocalEntry {
  site_code: string;
  entry_date: string;
  category: TrendCategory;
  body: TrendSaveBody;
  client_saved_at: string;
  sync_status: TrendSyncStatus;
  last_error: string | null;
}

export const trendEntryId = (siteCode: string, date: string, category: string): string =>
  `${siteCode}|${date}|${category}`;

/** A category as the screens show it: the server's fields plus what the phone knows. */
export interface TrendViewCategory extends TrendContextCategory {
  /** Electricity only: its meters plus DG, Solar and Wind units. */
  used: number | null;
  /**
   * What this phone knows that the server's context does not: `pending` (the
   * figures are a preview of an unsent save), `failed` (the server refused the
   * save; the figures are still the server's) or `replaced` (a newer save by
   * someone else won; the figures are the server's).
   */
  sync: Exclude<TrendSyncStatus, "synced"> | null;
  /** The server's reason when `failed`, the notice when `replaced`. */
  sync_error: string | null;
  /** The body this phone saved, while `pending` or `failed`: what the form reopens with. */
  draft: TrendSaveBody | null;
}

export interface TrendDayView extends Omit<TrendDayContext, "categories"> {
  categories: TrendViewCategory[];
}

// --- Dates -----------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, "0");

/** A calendar date moved by whole days. Works on the date string, never on local time. */
export function addDaysYmd(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** 0 for Sunday to 6 for Saturday. */
export function weekdayOfYmd(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "YYYY-MM" moved by whole months. */
export function addMonthsYm(month: string, months: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const weekdayShort = (date: string): string => WEEKDAYS[weekdayOfYmd(date)];

/** "15 Nov". */
export function dayMonthLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "Sun, 15 Nov". */
export const dateLabel = (date: string): string => `${weekdayShort(date)}, ${dayMonthLabel(date)}`;

/** "November 2026" from "YYYY-MM". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

/** The seven dates ending on `today`, oldest first. */
export function lastSevenDays(today: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysYmd(today, i - 6));
}

// --- Numbers ---------------------------------------------------------------------------

/**
 * Indian digit grouping (12,21,571.90) without Intl: building or calling an
 * Intl formatter per row is slow on Hermes, and these run on every keystroke.
 */
export function formatIndian(value: number, minDecimals = 2, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  const fixed = Math.abs(value).toFixed(maxDecimals);
  let [whole, frac = ""] = fixed.split(".");
  while (frac.length > minDecimals && frac.endsWith("0")) frac = frac.slice(0, -1);
  if (whole.length > 3) {
    const last3 = whole.slice(-3);
    const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    whole = `${rest},${last3}`;
  }
  const sign = value < 0 && Number(fixed) !== 0 ? "−" : "";
  return `${sign}${whole}${frac ? `.${frac}` : ""}`;
}

/** "+2,751.30" / "−132.00": an adjustment always shows its sign. */
export function formatSigned(value: number): string {
  return `${value < 0 ? "−" : "+"}${formatIndian(Math.abs(value))}`;
}

/** "25.97%", or a dash when there is no percentage (never 0%). */
export function formatPct(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const fixed = Math.abs(value).toFixed(decimals);
  // The same minus sign as formatIndian, so "−1,011.83 kVAh · −2.84%" reads as one.
  const sign = value < 0 && Number(fixed) !== 0 ? "−" : "";
  return `${sign}${fixed}%`;
}

/** A percentage with no trailing zeros: 21 -> "21%", 4.5 -> "4.5%". */
export function formatTargetPct(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : `${formatIndian(value, 0, 2)}%`;
}

export type ParsedNumber =
  | { state: "empty" }
  | { state: "invalid" }
  | { state: "ok"; value: number };

/**
 * A number as typed in a field. Commas are allowed as separators; a minus sign
 * only when `allowNegative` (a hand typed saving). Anything else is invalid.
 */
export function parseTyped(raw: string | null | undefined, allowNegative = false): ParsedNumber {
  const text = String(raw ?? "").trim();
  if (text === "") return { state: "empty" };
  const pattern = allowNegative ? /^[-−]?[0-9][0-9,]*(\.[0-9]*)?$|^[-−]?\.[0-9]+$/ : /^[0-9][0-9,]*(\.[0-9]*)?$|^\.[0-9]+$/;
  if (!pattern.test(text)) return { state: "invalid" };
  const value = Number(text.replace(/,/g, "").replace("−", "-"));
  return Number.isFinite(value) ? { state: "ok", value } : { state: "invalid" };
}

/** The value of a typed number, or null when it is empty or invalid. */
export function typedValue(raw: string | null | undefined, allowNegative = false): number | null {
  const parsed = parseTyped(raw, allowNegative);
  return parsed.state === "ok" ? parsed.value : null;
}

/** A stored number as the text a field starts with. */
export const fieldText = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value) ? "" : String(value);

// --- Applying a save on the phone ------------------------------------------------------

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

const firstNum = (...values: (number | null | undefined)[]): number | null => {
  for (const v of values) if (isNum(v)) return v;
  return null;
};

/** Which of DG, Solar and Wind the site enters, read off the day's categories. */
export function enabledAddonsOf(day: Pick<TrendDayContext, "categories">): ElectricityAddon[] {
  return day.categories.map((c) => c.category).filter(isElectricityAddon);
}

/** An entered category as `trendCalc` input, rebuilt from what the context shows. */
function inputFromCategory(c: TrendContextCategory): CategoryInput {
  const blocks: BlockInput[] = c.blocks.map((b) => {
    if (c.kind === "meter") {
      return {
        block_id: b.block_id,
        initial_reading: b.opening_reading,
        final_reading: b.final_reading,
        mf: b.mf,
        add_adjustment: b.add_adjustment,
        deduct_adjustment: b.deduct_adjustment,
        quantity: b.quantity,
        units_typed: b.entry_mode === "units",
      };
    }
    return { block_id: b.block_id, litres: b.litres, quantity: b.quantity };
  });
  return {
    category: c.category,
    not_used: c.not_used,
    // A hand typed day may hold no readings at all: only the blocks that have some count.
    blocks:
      c.kind === "meter" && c.saving_is_manual
        ? blocks.filter((b) => (b.units_typed ? isNum(b.quantity) : isNum(b.final_reading)))
        : blocks,
    baseline: c.hourly ? null : c.baseline,
    target_pct: c.target_pct,
    hourly: c.hourly === true,
    baseline_per_hour: c.baseline_per_hour,
    run_hours: c.run_hours,
    manual_saving: c.saving_is_manual ? c.saving : null,
    dg_factor: c.dg_factor,
  };
}

/**
 * The category's blocks with a save body laid over them, following the
 * server's rules: a carried opening is the context's own, an omitted factor or
 * adjustment keeps the carried one, and a units block takes only its units.
 */
function blocksAfterSave(c: TrendContextCategory, body: TrendSaveBody): TrendContextBlock[] {
  const sent = new Map(body.blocks.map((b) => [b.block_id, b]));
  const notUsed = c.kind !== "meter" && body.not_used === true;
  return c.blocks.map((block): TrendContextBlock => {
    const s = sent.get(block.block_id);
    if (c.kind === "meter") {
      const add = firstNum(s?.add_adjustment, block.add_adjustment) ?? 0;
      const deduct = firstNum(s?.deduct_adjustment, block.deduct_adjustment) ?? 0;
      if (block.entry_mode === "units") {
        return {
          ...block,
          typed: isNum(s?.quantity) ? true : block.typed,
          quantity: isNum(s?.quantity) ? round3(s.quantity) : block.quantity,
          add_adjustment: add,
          deduct_adjustment: deduct,
        };
      }
      if (!s || !isNum(s.final_reading)) return { ...block, add_adjustment: add, deduct_adjustment: deduct };
      const typedOpening = s.opening_source === "typed";
      return {
        ...block,
        typed: false,
        opening_reading: typedOpening ? (isNum(s.initial_reading) ? s.initial_reading : null) : block.opening_reading,
        opening_date: typedOpening ? null : block.opening_date,
        final_reading: s.final_reading,
        mf: firstNum(s.mf, block.mf),
        add_adjustment: add,
        deduct_adjustment: deduct,
        mismatch: null,
      };
    }
    if (notUsed) return { ...block, quantity: 0, litres: c.kind === "dg" ? 0 : null };
    if (c.kind === "dg") {
      return {
        ...block,
        quantity: isNum(s?.quantity) ? round3(s.quantity) : null,
        litres: isNum(s?.litres) ? round3(s.litres) : null,
      };
    }
    return { ...block, quantity: isNum(s?.quantity) ? round3(s.quantity) : null };
  });
}

/** The context's category as it would read once `body` is saved (figures not yet recomputed). */
function categoryAfterSave(c: TrendContextCategory, body: TrendSaveBody): TrendContextCategory {
  const manual = c.category === "electricity" && c.manual_allowed === true && isNum(body.manual_saving);
  return {
    ...c,
    entered: true,
    not_used: c.kind !== "meter" && body.not_used === true,
    blocks: blocksAfterSave(c, body),
    run_hours: c.hourly ? (isNum(body.run_hours) ? body.run_hours : 0) : (c.run_hours ?? null),
    // Only Electricity carries the typed saving flag, as in the server's context.
    ...(c.category === "electricity" ? { saving_is_manual: manual } : {}),
    saving: manual ? (body.manual_saving as number) : c.saving,
  };
}

/** Electricity's meters plus the DG, Solar and Wind units entered so far that day. */
function usedOf(categories: readonly TrendContextCategory[]): number | null {
  const electricity = categories.find((c) => c.category === "electricity");
  if (!electricity?.entered || electricity.consumption == null) return null;
  let addons = 0;
  for (const c of categories) {
    if (c.entered && isElectricityAddon(c.category)) addons += c.consumption ?? 0;
  }
  return round2(electricity.consumption + addons);
}

/**
 * The server's day as the screens read it, with nothing of the phone's laid
 * over it. Stored figures are shown as the server sent them, never recomputed
 * here; only "used" (which the server does not send) is added up.
 */
export function viewOfContext(day: TrendDayContext): TrendDayView {
  const used = usedOf(day.categories);
  return {
    ...day,
    categories: day.categories.map(
      (c): TrendViewCategory => ({
        ...c,
        used: c.category === "electricity" ? used : null,
        sync: null,
        sync_error: null,
        draft: null,
      }),
    ),
  };
}

/**
 * The day with one save applied on the phone: the offline twin of the
 * server's preview route. Only the saved category is recomputed, plus
 * Electricity, whose saving moves when DG, Solar or Wind does. Every other
 * category keeps the figures the server stored.
 */
export function previewSave(day: TrendDayView, category: TrendCategory, body: TrendSaveBody): TrendDayView {
  const categories = day.categories.map(
    (c): TrendViewCategory => (c.category === category ? { ...c, ...categoryAfterSave(c, body) } : c),
  );
  const result = computeDay({
    categories: categories.filter((c) => c.entered).map(inputFromCategory),
    enabled_addons: enabledAddonsOf(day),
    // Mcal is never shown on the phone, so the site rule does not matter here.
    mcal_electricity_only: false,
  });
  const byCategory = new Map(result.categories.map((r) => [r.category, r]));
  const touched = (id: TrendCategory) =>
    id === category || (id === "electricity" && isElectricityAddon(category));

  const out = categories.map((c): TrendViewCategory => {
    const r = byCategory.get(c.category);
    if (!r || !touched(c.category)) return c;
    const quantities = new Map(r.blocks.map((b) => [b.block_id, b]));
    return {
      ...c,
      consumption: r.consumption,
      used: r.used,
      adjustment: r.adjustment,
      saving: r.saving,
      saving_pct: r.saving_pct,
      provisional: r.provisional,
      ...(isSavingCategory(c.category) ? { baseline: r.baseline, target: r.target } : {}),
      blocks: c.blocks.map((b) => {
        const q = quantities.get(b.block_id);
        if (!q) return b;
        return { ...b, quantity: q.quantity, litres: c.kind === "dg" ? q.litres : b.litres };
      }),
    };
  });
  const entered = out.filter((c) => c.entered).length;
  return {
    ...day,
    categories: out,
    categories_entered: entered,
    status: entered <= 0 ? "missing" : entered < day.categories_expected ? "partial" : "complete",
  };
}

/**
 * The cached day with this phone's own entries laid over it, oldest save
 * first. A `pending` entry is previewed (its figures replace the stored ones
 * until the server answers). A `failed` entry changes no figure: the server
 * refused it, so the day still reads as the server stored it, and the entry
 * rides along as the draft to fix. A `replaced` entry only leaves its notice.
 * A `synced` entry adds nothing: the server's context already holds it.
 */
export function mergeDay(day: TrendDayContext, entries: readonly TrendLocalEntry[]): TrendDayView {
  let view = viewOfContext(day);
  const mine = entries
    .filter((e) => e.site_code === day.site_code && e.entry_date === day.date && e.sync_status !== "synced")
    .sort((a, b) => a.client_saved_at.localeCompare(b.client_saved_at));
  for (const entry of mine) {
    if (!view.categories.some((c) => c.category === entry.category)) continue;
    if (entry.sync_status === "pending") view = previewSave(view, entry.category, entry.body);
    view = {
      ...view,
      categories: view.categories.map((c) =>
        c.category === entry.category
          ? {
              ...c,
              sync: entry.sync_status as TrendViewCategory["sync"],
              sync_error: entry.last_error,
              draft: entry.sync_status === "replaced" ? null : entry.body,
            }
          : c,
      ),
    };
  }
  return view;
}

/**
 * Tomorrow's opening reading from an entry still on the phone (AC-44). The
 * cached context for a day was pulled before the day before it was entered
 * here, so its opening reading is one day stale until that entry syncs. For
 * each Electricity block with no row of its own on this day, the latest unsent
 * earlier entry supplies the opening reading, factor and adjustments. An
 * earlier entry of typed units breaks the chain, as it does on the server.
 */
export function carryFromPhone(day: TrendDayContext, entries: readonly TrendLocalEntry[]): TrendDayContext {
  const earlier = entries
    .filter(
      (e) =>
        e.site_code === day.site_code &&
        e.category === "electricity" &&
        e.sync_status === "pending" &&
        e.entry_date < day.date,
    )
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  if (!earlier.length) return day;

  return {
    ...day,
    categories: day.categories.map((c) => {
      if (c.category !== "electricity") return c;
      return {
        ...c,
        blocks: c.blocks.map((block) => {
          // A block that already has a row on this day keeps what was stored.
          if (block.typed !== null) return block;
          for (const entry of earlier) {
            // The server's carry is as new as, or newer than, this entry.
            if (block.carried_from != null && block.carried_from >= entry.entry_date) break;
            const sent = entry.body.blocks.find((b) => b.block_id === block.block_id);
            if (!sent) continue;
            const add = firstNum(sent.add_adjustment, block.add_adjustment) ?? 0;
            const deduct = firstNum(sent.deduct_adjustment, block.deduct_adjustment) ?? 0;
            if (isNum(sent.final_reading)) {
              if (block.entry_mode !== "readings") {
                return { ...block, add_adjustment: add, deduct_adjustment: deduct, carried_from: entry.entry_date };
              }
              return {
                ...block,
                opening_reading: sent.final_reading,
                opening_date: entry.entry_date,
                mf: firstNum(sent.mf, block.mf),
                add_adjustment: add,
                deduct_adjustment: deduct,
                carried_from: entry.entry_date,
              };
            }
            if (isNum(sent.quantity)) {
              // Typed units the day before: no reading to start from.
              return {
                ...block,
                opening_reading: null,
                opening_date: null,
                add_adjustment: add,
                deduct_adjustment: deduct,
                carried_from: entry.entry_date,
              };
            }
          }
          return block;
        }),
      };
    }),
  };
}

// --- What the footer says (AC-42) ------------------------------------------------------

export type TrendTone = "idle" | "ok" | "warn" | "bad";

export interface SavingSummary {
  /** Every value the saving needs is in. */
  ready: boolean;
  tone: TrendTone;
  saving: number | null;
  saving_pct: number | null;
  baseline: number | null;
  target_pct: number | null;
  /** 0 to 100: the share of the bar the saving fills. */
  bar_pct: number;
  /** 0 to 100 from the right edge, or null when there is no target to mark. */
  target_mark_pct: number | null;
  /** The line under the bar. */
  note: string;
}

/**
 * A figure is on target when the saved % is at or above the target %,
 * negative targets included. With no target, any saving at or above zero is fine.
 */
export function toneOf(saving: number | null, savingPct: number | null, targetPct: number | null | undefined): TrendTone {
  if (saving == null) return "idle";
  if (saving < 0) return "bad";
  if (targetPct == null || savingPct == null) return "ok";
  return savingPct >= targetPct ? "ok" : "warn";
}

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

/**
 * The saving line of a saving category: figures, colour and the message under
 * the bar. `missing` is how many values the user still has to enter (0 when
 * the form is complete); `fixing` says the gap is a wrong value, not an empty one.
 */
export function savingSummary(
  c: Pick<TrendContextCategory, "saving" | "saving_pct" | "baseline" | "target_pct" | "target" | "unit">,
  opts: { missing?: number; fixing?: boolean; noun?: string } = {},
): SavingSummary {
  const missing = opts.missing ?? 0;
  const noun = opts.noun ?? "reading";
  const targetPct = c.target_pct ?? null;
  const baseline = c.baseline ?? null;
  const base = {
    baseline,
    target_pct: targetPct,
    target_mark_pct: targetPct != null && targetPct > 0 && targetPct <= 100 ? targetPct : null,
  };
  if (missing > 0) {
    const verb = opts.fixing && missing === 1 ? "Fix" : "Enter";
    return {
      ...base,
      ready: false,
      tone: "idle",
      saving: null,
      saving_pct: null,
      bar_pct: 0,
      note: `${verb} ${missing} ${noun}${missing === 1 ? "" : "s"} to see savings`,
    };
  }
  if (baseline == null) {
    return {
      ...base,
      ready: false,
      tone: "idle",
      saving: null,
      saving_pct: null,
      bar_pct: 0,
      note: "No baseline for this month yet. The saving fills in once it is set.",
    };
  }
  const saving = c.saving;
  const savingPct = c.saving_pct ?? pct(saving, baseline);
  const tone = toneOf(saving, savingPct, targetPct);
  let note = "";
  if (saving != null && saving < 0) {
    note = `${formatIndian(Math.abs(saving))} ${c.unit} over baseline`;
  } else if (saving != null && targetPct != null) {
    const target = c.target ?? round2((baseline * targetPct) / 100);
    const gap = round2(saving - target);
    note = `${formatIndian(Math.abs(gap))} ${c.unit} ${gap >= 0 ? "above" : "below"} the ${formatTargetPct(targetPct)} target`;
  } else if (saving != null) {
    note = "No target set for this month";
  }
  return {
    ...base,
    ready: saving != null,
    tone,
    saving,
    saving_pct: savingPct,
    bar_pct: savingPct == null ? 0 : clampPct(savingPct),
    note,
  };
}

/** "Lower than yesterday's 53,064.46. Check the meter." */
export function lowerThanOpeningMessage(opening: number, openingDate: string | null, date: string): string {
  const when = openingDate && openingDate === addDaysYmd(date, -1) ? "yesterday’s" : "the opening reading";
  return `Lower than ${when} ${formatIndian(opening)}. Check the meter.`;
}

/** The label of a block's opening reading: "Yesterday", or the date it was carried from. */
export function openingLabel(openingDate: string | null, date: string): string {
  if (!openingDate) return "Opening";
  return openingDate === addDaysYmd(date, -1) ? "Yesterday" : dayMonthLabel(openingDate);
}

/** "× 3,000, adjustment +2,751.30" / "× 800, no adjustment": the line that opens the sheet. */
export function factorLine(block: Pick<TrendContextBlock, "mf" | "add_adjustment" | "deduct_adjustment" | "entry_mode">): string {
  const net = round2(block.add_adjustment - block.deduct_adjustment);
  const adjustment = net !== 0 ? `adjustment ${formatSigned(net)}` : "no adjustment";
  if (block.entry_mode === "units") return net !== 0 ? `Adjustment ${formatSigned(net)}` : "No adjustment";
  if (block.mf == null) return `Set factor, ${adjustment}`;
  return `× ${formatIndian(block.mf, 0, 3)}, ${adjustment}`;
}

/** A category label inside a sentence: "diesel", "bio-diesel", but "DG", "PNG" and "LPG" as they are. */
export function inSentence(label: string): string {
  return label === label.toUpperCase() ? label : label.toLowerCase();
}

/** What a category's row on the hub says under its name. */
export function categorySubtitle(c: TrendViewCategory): string {
  if (!c.entered) return c.blocks.map((b) => b.name).join(", ") || "No blocks set up";
  if (c.kind === "meter") {
    if (c.saving_is_manual && c.consumption == null) return "Saving typed by hand";
    const n = c.blocks.length;
    return `${formatIndian(c.consumption ?? 0, 0, 2)} ${c.unit} from ${n} meter${n === 1 ? "" : "s"}`;
  }
  if (c.not_used) return c.kind === "dg" ? "Did not run" : "None today";
  return `${formatIndian(c.consumption ?? 0, 0, 2)} ${c.unit}`;
}
