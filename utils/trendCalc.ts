/**
 * Consumption Trend Sheet arithmetic: one day's readings in, every stored
 * figure out. Pure: no database, no network, no clock, and NO IMPORTS, because
 * mobile/utils/trendCalc.ts is a byte-for-byte copy of this file (the phone
 * previews a saving offline with the same code the server stores it with).
 *
 * Change a formula here and you must: raise CALC_VERSION, copy the file to
 * mobile, and bump `version` in calc.vectors.json in both repos together.
 *
 * Rounding follows Zoho, checked against the November 2026 export (346 days,
 * 25 sites): the daily baseline arrives already rounded to 2 decimals, and
 * every figure below is computed from rounded stored values and rounded once
 * with `round2`. Block quantities keep 3 decimals, as the Baseline module's
 * `consumptionFromReadings` / `dgKwh` do.
 */

/** Raised whenever a change here can alter a stored result. */
export const CALC_VERSION = 1;

export type TrendCategory =
  | "electricity"
  | "dg"
  | "png"
  | "diesel"
  | "lpg"
  | "biodiesel"
  | "solar"
  | "wind";

export type CategoryKind = "meter" | "dg" | "fuel" | "generation";

/** Categories with their own baseline, target and revenue. */
export const SAVING_CATEGORIES = ["electricity", "png", "diesel", "lpg", "biodiesel"] as const;
export type SavingCategory = (typeof SAVING_CATEGORIES)[number];

/** Categories that only add to Electricity's consumption. */
export const ELECTRICITY_ADDONS = ["dg", "solar", "wind"] as const;
export type ElectricityAddon = (typeof ELECTRICITY_ADDONS)[number];

export type MissingInput = "baseline" | "target_pct" | "unit_rate" | "sjpl_share" | "mcal_factor";

export type DgInputSide = "litres" | "units" | "both";

export function isSavingCategory(category: string): category is SavingCategory {
  return (SAVING_CATEGORIES as readonly string[]).includes(category);
}

export function isElectricityAddon(category: string): category is ElectricityAddon {
  return (ELECTRICITY_ADDONS as readonly string[]).includes(category);
}

export function kindOf(category: TrendCategory): CategoryKind {
  if (category === "electricity") return "meter";
  if (category === "dg") return "dg";
  if (category === "solar" || category === "wind") return "generation";
  return "fuel";
}

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Round to 2 decimals, half away from zero. The value is first trimmed to 12
 * significant digits so binary float noise cannot flip a tie
 * (1.005 * 100 is 100.49999999999999 in floating point).
 */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return value;
  const scaled = Math.abs(value) * 100;
  const cents = Math.round(scaled < 1e11 ? Number(scaled.toPrecision(12)) : scaled);
  const out = cents / 100;
  return value < 0 && out !== 0 ? -out : out;
}

/** Round to 3 decimals: the same expression as Baseline's `roundQty`. */
export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * `part` as a percentage of `whole`, to 2 decimals. Null (shown as a dash,
 * never 0%) when either side is missing or the whole is zero.
 */
export function pct(part: number | null | undefined, whole: number | null | undefined): number | null {
  if (!isNum(part) || !isNum(whole) || whole === 0) return null;
  return round2((part / whole) * 100);
}

/** Zoho's floor: a figure below zero shows as 0. Null stays null. */
export function floorZero(value: number | null | undefined): number | null {
  if (!isNum(value)) return null;
  return value < 0 ? 0 : value;
}

/**
 * One day's saving % (a category's, or the day's all energy Mcal one), as
 * Zoho shows it: 0 when the saving is zero or below. Still null (a dash) when
 * there is no baseline. Period totals (month, financial year) are not floored.
 */
export function dayPct(part: number | null | undefined, whole: number | null | undefined): number | null {
  return floorZero(pct(part, whole));
}

/**
 * Consumption of one metered block: (closing - opening) x multiplying factor.
 * Null when anything is missing, the closing reading is below the opening one,
 * or the factor is not above zero. Equal to Baseline's `consumptionFromReadings`.
 */
export function meterKwh(
  initial: number | null | undefined,
  final: number | null | undefined,
  mf: number | null | undefined,
): number | null {
  if (!isNum(initial) || !isNum(final) || !isNum(mf)) return null;
  if (final < initial || mf <= 0) return null;
  return round3((final - initial) * mf);
}

/**
 * Consumption of a "units typed" block: the number as typed, to 3 decimals.
 * Null when it is missing or below zero (stored consumption is never negative).
 */
export function typedUnits(quantity: number | null | undefined): number | null {
  if (!isNum(quantity) || quantity < 0) return null;
  return round3(quantity);
}

export type DgPairResult =
  | { ok: true; litres: number | null; units: number; input: DgInputSide }
  | { ok: false; code: "DG_EMPTY" | "DG_FACTOR_MISSING" };

/**
 * One DG block's litres and units. Only litres: units = litres x factor (the
 * same expression as Baseline's `dgKwh`). Only units: litres = units / factor,
 * left empty when the site has no factor. Both: kept as typed.
 */
export function dgPair(
  litres: number | null | undefined,
  units: number | null | undefined,
  factor: number | null | undefined,
): DgPairResult {
  const hasLitres = isNum(litres);
  const hasUnits = isNum(units);
  const hasFactor = isNum(factor) && factor > 0;
  if (hasLitres && hasUnits) return { ok: true, litres, units, input: "both" };
  if (hasLitres) {
    if (!hasFactor) return { ok: false, code: "DG_FACTOR_MISSING" };
    return { ok: true, litres, units: round3(litres * factor), input: "litres" };
  }
  if (hasUnits) {
    return { ok: true, litres: hasFactor ? round3(units / factor) : null, units, input: "units" };
  }
  return { ok: false, code: "DG_EMPTY" };
}

/**
 * Saving with the adjustment taken back out, as a share of the baseline. With
 * no adjustment this equals the plain saving percentage (Zoho showed zero).
 */
export function withoutAdjustmentPct(
  savingMcal: number | null | undefined,
  adjustmentMcal: number | null | undefined,
  baselineMcal: number | null | undefined,
): number | null {
  if (!isNum(savingMcal)) return null;
  return pct(savingMcal - (isNum(adjustmentMcal) ? adjustmentMcal : 0), baselineMcal);
}

// --- Inputs ------------------------------------------------------------------------

export interface BlockInput {
  block_id: string;
  /** Meter blocks. */
  initial_reading?: number | null;
  final_reading?: number | null;
  mf?: number | null;
  /** Meter blocks: two non negative numbers; the field sets the sign. */
  add_adjustment?: number | null;
  deduct_adjustment?: number | null;
  /** DG blocks. */
  litres?: number | null;
  /**
   * DG units, fuel quantity or units generated, in the category's unit. On a
   * meter block with `units_typed`, the day's units.
   */
  quantity?: number | null;
  /**
   * Meter blocks: the site has no readings to give, so `quantity` is the
   * block's consumption as typed and the readings are not looked at.
   */
  units_typed?: boolean;
}

export interface CategoryInput {
  category: TrendCategory;
  /** "None used today" / "DG did not run": consumption is zero. */
  not_used?: boolean;
  blocks: BlockInput[];

  // Stored inputs, saving categories only. Null or absent means missing.
  /** The day's baseline, already rounded to 2 decimals. Ignored when `hourly`. */
  baseline?: number | null;
  target_pct?: number | null;
  unit_rate?: number | null;
  sjpl_share_pct?: number | null;
  mcal_factor?: number | null;
  /** Target revenue switches; absent means on. */
  revenue_uses_target?: boolean | null;
  revenue_uses_rate?: boolean | null;

  /** PNG on a site with hourly consumption: baseline = per hour x run hours. */
  hourly?: boolean;
  baseline_per_hour?: number | null;
  run_hours?: number | null;

  /** Electricity on a site with a hand typed saving; may be negative. */
  manual_saving?: number | null;

  /** DG only: kWh per litre from Baseline. */
  dg_factor?: number | null;
}

export interface DayInput {
  /** The categories saved for the day so far (a "not used" one included). */
  categories: CategoryInput[];
  /** Which of DG, Solar and Wind the site has enabled. */
  enabled_addons: ElectricityAddon[];
  /** Site rule as stored for the day: only Electricity counts towards Mcal. */
  mcal_electricity_only: boolean;
}

// --- Results -----------------------------------------------------------------------

export interface BlockResult {
  block_id: string;
  /** Consumption in the category unit; null when it cannot be worked out. */
  quantity: number | null;
  /** DG only. */
  litres: number | null;
  dg_input: DgInputSide | null;
  /** DG only: why the block has no quantity. */
  error: "DG_EMPTY" | "DG_FACTOR_MISSING" | null;
}

export interface CategoryResult {
  category: TrendCategory;
  kind: CategoryKind;
  not_used: boolean;
  blocks: BlockResult[];
  /** The category's own consumption (Electricity: its meters only). */
  consumption: number | null;
  /** Electricity only: meters + DG + Solar + Wind. */
  used: number | null;
  /** Electricity only: add minus deduct across blocks; zero for a typed saving. */
  adjustment: number;
  // Saving categories only; null on DG, Solar and Wind.
  baseline: number | null;
  saving: number | null;
  saving_pct: number | null;
  target: number | null;
  revenue: number | null;
  target_revenue: number | null;
  baseline_mcal: number | null;
  saving_mcal: number | null;
  target_mcal: number | null;
  adjustment_mcal: number | null;
  saving_is_manual: boolean;
  /** Electricity only: an enabled one of DG, Solar, Wind is not saved yet. */
  provisional: boolean;
  inputs_missing: MissingInput[];
}

export interface DayRollup {
  baseline_mcal: number | null;
  saving_mcal: number | null;
  target_mcal: number | null;
  adjustment_mcal: number | null;
  revenue: number | null;
  target_revenue: number | null;
  /** A saving category was left out of a total because an input is missing. */
  incomplete: boolean;
}

export interface DayResult {
  categories: CategoryResult[];
  rollup: DayRollup;
}

// --- Calculation -------------------------------------------------------------------

function computeBlocks(input: CategoryInput, kind: CategoryKind): BlockResult[] {
  return input.blocks.map((b) => {
    const base: BlockResult = { block_id: b.block_id, quantity: null, litres: null, dg_input: null, error: null };
    if (input.not_used) return { ...base, quantity: 0, litres: kind === "dg" ? 0 : null };
    if (kind === "meter") {
      const quantity = b.units_typed ? typedUnits(b.quantity) : meterKwh(b.initial_reading, b.final_reading, b.mf);
      return { ...base, quantity };
    }
    if (kind === "dg") {
      const pair = dgPair(b.litres, b.quantity, input.dg_factor);
      if (!pair.ok) return { ...base, error: pair.code };
      return { ...base, quantity: pair.units, litres: pair.litres, dg_input: pair.input };
    }
    return { ...base, quantity: isNum(b.quantity) ? round3(b.quantity) : null };
  });
}

/** Sum of the block quantities; null when a block has none, zero when not used. */
function sumBlocks(blocks: readonly BlockResult[], notUsed: boolean): number | null {
  if (notUsed) return 0;
  if (!blocks.length) return null;
  let sum = 0;
  for (const b of blocks) {
    if (b.quantity == null) return null;
    sum += b.quantity;
  }
  return round2(sum);
}

function netAdjustment(blocks: readonly BlockInput[]): number {
  let sum = 0;
  for (const b of blocks) {
    sum += (isNum(b.add_adjustment) ? b.add_adjustment : 0) - (isNum(b.deduct_adjustment) ? b.deduct_adjustment : 0);
  }
  return round2(sum);
}

/** The day's baseline for a saving category, and whether it is missing. */
function resolveBaseline(input: CategoryInput): number | null {
  if (!input.hourly) return isNum(input.baseline) ? round2(input.baseline) : null;
  if (!isNum(input.baseline_per_hour) || !isNum(input.run_hours)) return null;
  return round2(input.baseline_per_hour * input.run_hours);
}

/**
 * One category on its own. `addonUnits` is the day's DG + Solar + Wind units
 * and `provisional` whether one of them is still to come; both matter to
 * Electricity only.
 */
export function computeCategory(
  input: CategoryInput,
  addonUnits = 0,
  provisional = false,
): CategoryResult {
  const kind = kindOf(input.category);
  const notUsed = input.not_used === true;
  const blocks = computeBlocks(input, kind);
  const consumption = sumBlocks(blocks, notUsed);

  const result: CategoryResult = {
    category: input.category,
    kind,
    not_used: notUsed,
    blocks,
    consumption,
    used: null,
    adjustment: 0,
    baseline: null,
    saving: null,
    saving_pct: null,
    target: null,
    revenue: null,
    target_revenue: null,
    baseline_mcal: null,
    saving_mcal: null,
    target_mcal: null,
    adjustment_mcal: null,
    saving_is_manual: false,
    provisional: false,
    inputs_missing: [],
  };
  // DG, Solar and Wind hold consumption only.
  if (!isSavingCategory(input.category)) return result;

  const baseline = resolveBaseline(input);
  const targetPct = isNum(input.target_pct) ? input.target_pct : null;
  const unitRate = isNum(input.unit_rate) ? input.unit_rate : null;
  const share = isNum(input.sjpl_share_pct) ? input.sjpl_share_pct : null;
  const factor = isNum(input.mcal_factor) ? input.mcal_factor : null;
  const usesTarget = input.revenue_uses_target !== false;
  const usesRate = input.revenue_uses_rate !== false;

  if (baseline == null) result.inputs_missing.push("baseline");
  if (targetPct == null) result.inputs_missing.push("target_pct");
  if (unitRate == null) result.inputs_missing.push("unit_rate");
  if (share == null) result.inputs_missing.push("sjpl_share");
  if (factor == null) result.inputs_missing.push("mcal_factor");
  result.baseline = baseline;

  if (input.category === "electricity") {
    const manual = isNum(input.manual_saving);
    result.used = consumption == null ? null : round2(consumption + addonUnits);
    if (manual) {
      // A typed saving is final: no adjustment is added and nothing recomputes it.
      result.saving = round2(input.manual_saving as number);
      result.saving_is_manual = true;
    } else {
      result.adjustment = netAdjustment(input.blocks);
      result.provisional = provisional;
      if (baseline != null && result.used != null) {
        result.saving = round2(baseline - result.used + result.adjustment);
      }
    }
  } else if (input.hourly && input.run_hours === 0) {
    // PNG by the hour: a boiler that did not run has no baseline and no saving.
    result.saving = baseline == null ? null : 0;
  } else if (baseline != null && consumption != null) {
    result.saving = round2(baseline - consumption);
  }

  const { saving } = result;
  // Zoho floors, followed by the user's decision of 24 Nov 2026: a day's
  // saving % and revenue never go below zero; the saving itself stays
  // negative. The target is NOT floored (user, 25 Nov 2026): a site sets a
  // negative Electricity target % on purpose so that its all energy Mcal
  // target comes to the contracted figure (APLINDR: -2.9 % gives 20 %).
  result.saving_pct = dayPct(saving, baseline);
  if (baseline != null && targetPct != null) result.target = round2((baseline * targetPct) / 100);
  if (saving != null && unitRate != null && share != null) {
    result.revenue = floorZero(round2((saving * unitRate * share) / 100));
  }
  if (baseline != null && share != null && (!usesTarget || targetPct != null) && (!usesRate || unitRate != null)) {
    const targetPart = usesTarget ? (targetPct as number) / 100 : 1;
    const ratePart = usesRate ? (unitRate as number) : 1;
    result.target_revenue = round2((baseline * targetPart * ratePart * share) / 100);
  }
  if (factor != null) {
    if (baseline != null) result.baseline_mcal = round2(baseline * factor);
    if (saving != null) result.saving_mcal = round2(saving * factor);
    if (result.target != null) result.target_mcal = round2(result.target * factor);
    result.adjustment_mcal = round2(result.adjustment * factor);
  }
  return result;
}

/** Add up the values that exist; null when none does. */
function sumPresent(values: readonly (number | null)[]): number | null {
  let sum = 0;
  let any = false;
  for (const v of values) {
    if (v == null) continue;
    sum += v;
    any = true;
  }
  return any ? round2(sum) : null;
}

/**
 * The whole day: every saved category, Electricity's group saving (its meters
 * plus DG, Solar and Wind), and the day's Mcal and revenue totals. A category
 * that lacks an input is left out of the totals it cannot join and the day is
 * flagged incomplete.
 */
export function computeDay(input: DayInput): DayResult {
  const saved = new Map<TrendCategory, CategoryInput>();
  for (const c of input.categories) saved.set(c.category, c);

  let addonUnits = 0;
  let provisional = false;
  const addonResults = new Map<TrendCategory, CategoryResult>();
  for (const addon of ELECTRICITY_ADDONS) {
    const row = saved.get(addon);
    if (!row) {
      // Not saved yet counts as zero; Electricity stays provisional if it is expected.
      if (input.enabled_addons.includes(addon)) provisional = true;
      continue;
    }
    const res = computeCategory(row);
    addonResults.set(addon, res);
    addonUnits += res.consumption ?? 0;
  }

  const categories: CategoryResult[] = input.categories.map((c) =>
    isElectricityAddon(c.category)
      ? (addonResults.get(c.category) as CategoryResult)
      : c.category === "electricity"
        ? computeCategory(c, addonUnits, provisional)
        : computeCategory(c),
  );

  const savers = categories.filter((c) => isSavingCategory(c.category));
  const mcalRows = input.mcal_electricity_only ? savers.filter((c) => c.category === "electricity") : savers;
  const rollup: DayRollup = {
    baseline_mcal: sumPresent(mcalRows.map((c) => c.baseline_mcal)),
    saving_mcal: sumPresent(mcalRows.map((c) => c.saving_mcal)),
    target_mcal: sumPresent(mcalRows.map((c) => c.target_mcal)),
    adjustment_mcal: sumPresent(mcalRows.map((c) => c.adjustment_mcal)),
    revenue: sumPresent(savers.map((c) => c.revenue)),
    target_revenue: sumPresent(savers.map((c) => c.target_revenue)),
    incomplete: savers.some((c) => c.inputs_missing.length > 0),
  };
  return { categories, rollup };
}
