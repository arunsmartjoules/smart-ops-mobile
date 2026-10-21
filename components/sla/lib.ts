/**
 * SLA screen helpers — pure formatting, tone and CSV logic.
 *
 * Ported from web/src/app/sla/lib/slaFormat.tsx (+ the CSV builders and the
 * glossary in its page/DrillDownModal/RatingBreakupModal) rather than shared,
 * so the two apps can move independently. Keep the source-module map and the
 * history cutoff in step with web and backend when either changes.
 */
import { bxIcon, type LucideIcon } from "@/components/jo/bxIcons";

// The artboard's category icons (CATS).
const Thermometer = bxIcon("bxs-thermometer");
const BadgeCheck = bxIcon("bx-badge-check");
const Timer = bxIcon("bx-timer");
const ShieldHalf = bxIcon("bx-shield-quarter");
import { JO_DARK, type JoTone } from "@/constants/jo";
import type { JoTheme } from "@/hooks/useJoTheme";
import type {
  SlaCategory,
  SlaCategoryKey,
  SlaCell,
  SlaDeliverable,
  SlaDrillColumn,
  SlaDrillDown,
  SlaDrillStep,
  SlaReport,
} from "@/services/SlaService";

export type SlaTab = "overall" | SlaCategoryKey | "compare";

/* ── Categories ─────────────────────────────────────────────────────────── */

/**
 * KPI category palette from the artboard (CATS). The pastel fills don't read
 * as text on the light page, so light mode takes a deeper step of each hue —
 * the same idea as the accent's `ink`.
 */
export const CATEGORY_META: Record<
  SlaCategoryKey,
  { label: string; short: string; icon: LucideIcon; color: string; ink: string }
> = {
  comfort: { label: "Comfort", short: "Comfort", icon: Thermometer, color: "#6FE0D0", ink: "#0E8C7D" },
  qos: { label: "Quality of Service", short: "QoS", icon: BadgeCheck, color: "#9EC5FF", ink: "#2F6FCB" },
  responsiveness: { label: "Responsiveness", short: "Response", icon: Timer, color: "#F9D976", ink: "#9A7300" },
  resolution: { label: "Resolution", short: "Resolution", icon: ShieldHalf, color: "#FFA98A", ink: "#C2532E" },
};

export const CATEGORY_ORDER: SlaCategoryKey[] = ["comfort", "qos", "responsiveness", "resolution"];

export function catColor(t: JoTheme, key: SlaCategoryKey | string): string {
  const meta = CATEGORY_META[key as SlaCategoryKey];
  if (!meta) return t.ink2;
  return t.isDark ? meta.color : meta.ink;
}

/** Only an explicit `applicable: false` hides a category (older reports lack the flag). */
export function isCategoryApplicable(c: { applicable?: boolean } | null | undefined): boolean {
  return Boolean(c) && c!.applicable !== false;
}

export function applicableCategories(report: SlaReport): SlaCategory[] {
  return CATEGORY_ORDER.map((k) => report.categories.find((c) => c.category === k)).filter(
    (c): c is SlaCategory => isCategoryApplicable(c),
  );
}

/** Every deliverable in category order, numbered 1..N the way the web does. */
export function numberedDeliverables(report: SlaReport): (SlaDeliverable & { no: number })[] {
  let n = 0;
  return applicableCategories(report).flatMap((c) =>
    c.deliverables.map((d) => {
      n += 1;
      return { ...d, no: n };
    }),
  );
}

/* ── Source module (static catalog metadata) ────────────────────────────── */

/**
 * Mirrors web slaFormat SOURCE_MODULE_BY_KEY / backend slaConfig.ts: a stored
 * report embeds the `sourceModule` current when it was materialized, so the
 * catalog wins and the report value only covers keys added since.
 */
const SOURCE_MODULE_BY_KEY: Record<string, string> = {
  "comfort.temperature": "Tickets",
  "comfort.rh": "Tickets",
  "comfort.airflow": "PM",
  "qos.tempLog": "Site Logs",
  "qos.rhLog": "Site Logs",
  "qos.otIcuUptime": "Incidents",
  "qos.otherUptime": "Incidents",
  "qos.filterCondition": "PM",
  "qos.criticalSpares": "Inventory",
  "qos.periodicChecklist": "PM",
  "qos.plantRoomLog": "Site Logs",
  "qos.plantRoomUptime": "Incidents",
  "qos.periodicChecklistFlexible": "PM",
  "responsiveness.chwTemperature": "Tickets",
  "responsiveness.chwPressure": "Tickets",
  "resolution.chwTemperature": "Tickets",
  "resolution.chwPressure": "Tickets",
  "responsiveness.temperature": "Tickets",
  "responsiveness.rh": "Tickets",
  "responsiveness.breakdown": "Tickets",
  "responsiveness.filter": "Tickets",
  "resolution.temperature.critical": "Tickets",
  "resolution.temperature.other": "Tickets",
  "resolution.rh.critical": "Tickets",
  "resolution.rh.other": "Tickets",
  "resolution.breakdown.critical": "Tickets",
  "resolution.breakdown.other": "Tickets",
  "resolution.filter": "Tickets",
};

export function sourceModuleOf(d: { key?: string; deliverableKey?: string; sourceModule?: string }): string {
  const key = d.key ?? d.deliverableKey ?? "";
  return SOURCE_MODULE_BY_KEY[key] ?? d.sourceModule ?? "Tickets";
}

/** expo-router path of the mobile module a source opens; null when mobile has none (Inventory). */
export function sourceModuleHref(source: string): string | null {
  switch (source) {
    case "Tickets":
      return "/(tabs)/tickets";
    case "Incidents":
      return "/(tabs)/incidents";
    case "Site Logs":
      return "/(tabs)/site-logs";
    case "PM":
      return "/(tabs)/preventive-maintenance";
    default:
      return null;
  }
}

/* ── Numbers ────────────────────────────────────────────────────────────── */

/** Score → "4.62". */
export function fmtScore(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return (Math.round(v * 100) / 100).toFixed(2);
}

/** Fraction → one-decimal percent number: 0.943 → "94.3". */
export function fmtPct(frac: number): string {
  if (!Number.isFinite(frac)) return "—";
  return (Math.round(frac * 1000) / 10).toFixed(1);
}

/** Fraction → compact percent, trailing ".0" dropped: 0.9 → "90", 0.995 → "99.5". */
export function numPct(frac: number): string {
  if (!Number.isFinite(frac)) return "—";
  return String(Number((frac * 100).toFixed(1)));
}

/** Target score as printed after a slash: 5 → "5.0", 4.5 → "4.5". */
export function fmtTarget(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(1);
}

/** Achieved ÷ target as a fraction, 0 when there is no target. */
export function ratio(achieved: number, target: number): number {
  return target > 0 ? achieved / target : 0;
}

export function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

/* ── Tones ──────────────────────────────────────────────────────────────── */

/** Fee-level tone from a performance rating in percent (0..100). */
export function ratingTone(ratingPct: number): JoTone {
  if (ratingPct >= 90) return "ok";
  if (ratingPct >= 85) return "info";
  if (ratingPct >= 75) return "warn";
  return "bad";
}

/** Band tone by level (bands are 1 = best … 5). */
export function bandTone(level: number): JoTone {
  if (level <= 1) return "ok";
  if (level === 2) return "info";
  if (level === 3) return "warn";
  return "bad";
}

/** Meets → ok; within 10 pts of commitment → warn; else bad. */
export function deliverableTone(actualPct: number, commitmentPct: number): JoTone {
  if (!Number.isFinite(actualPct)) return "mute";
  if (actualPct >= commitmentPct) return "ok";
  if (actualPct >= commitmentPct - 0.1) return "warn";
  return "bad";
}

export function deliverableStatusLabel(actualPct: number, commitmentPct: number): string {
  return actualPct >= commitmentPct ? "Met" : "Below commit";
}

/**
 * Tone colour for text sitting on the near-black pill on the accent hero
 * card. That pill is black in both modes, so it always takes the dark
 * palette's bright tone (the light palette's deep tones vanish on black).
 */
export function onBlackTone(tone: JoTone): string {
  return JO_DARK[tone];
}

/** Tone of a free-text record status from the source module. */
export function recordStatusTone(status: string): JoTone {
  const s = status.toLowerCase();
  if (/(not done|missed|below|overdue|breach|fail|late|never|open\b)/.test(s)) return "bad";
  if (/(hold|waiting|partial|pending|progress)/.test(s)) return "warn";
  if (/(resolved|completed|complete|done|pass|closed)/.test(s)) return "ok";
  return "mute";
}

/** "#RRGGBB" + alpha → "rgba(r,g,b,a)"; any other input is returned as is. */
export function hexAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/* ── Sites ──────────────────────────────────────────────────────────────── */

/** "KIMS Manavata …, Nashik" → "Nashik" (last comma segment, else first two words). */
export function shortSiteName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "—";
  const parts = n.split(",");
  if (parts.length > 1) return parts[parts.length - 1]!.trim();
  return n.split(/\s+/).slice(0, 2).join(" ");
}

/** Test sites kept out of the cross-site Compare ranking (web siteFilter.ts). */
const NON_OPERATIONAL_SLA_SITE_CODES = new Set<string>(["site_000002"]);

export function excludeDevOnlySlaSites<T extends { site_code: string }>(sites: T[]): T[] {
  return sites.filter((s) => !NON_OPERATIONAL_SLA_SITE_CODES.has(s.site_code));
}

/* ── Months + history cutoff ────────────────────────────────────────────── */

/**
 * First month non-admins may see. Mirrors backend sla/lib/slaAccess.ts
 * SLA_OPEN_FROM_MONTH and web lib/data-cutoff.ts — the backend 403s earlier
 * months for them, so the picker and trend never ask.
 */
export const SLA_OPEN_FROM_MONTH = "2026-06";

/** Same rule as backend canSeeAllSlaHistory (minus the API-key branch). */
export function canSeeAllSlaHistory(
  user: { role?: string | null; is_superadmin?: boolean | null } | null | undefined,
): boolean {
  const role = (user?.role ?? "").toLowerCase().replace(/[\s-]/g, "_");
  return user?.is_superadmin === true || role === "admin" || role === "super_admin" || role === "superadmin";
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function splitKey(key: string): [number, number] {
  const [y, m] = key.split("-").map((s) => parseInt(s, 10));
  return [y || 1970, m || 1];
}

function keyOf(y: number, m: number): string {
  // m may be out of 1..12 after arithmetic; normalise.
  const idx = y * 12 + (m - 1);
  const yy = Math.floor(idx / 12);
  const mm = (idx % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}`;
}

/** "2026-09" → "Sep 2026". */
export function monthLabel(key: string): string {
  const [y, m] = splitKey(key);
  return `${MONTH_SHORT[m - 1] ?? "?"} ${y}`;
}

/** "2026-09" → "Sep 26" (trend column header). */
export function monthShortLabel(key: string): string {
  const [y, m] = splitKey(key);
  return `${MONTH_SHORT[m - 1] ?? "?"} ${String(y).slice(-2)}`;
}

/** `count` months ending at `endKey`, oldest first. */
export function monthWindow(endKey: string, count: number): string[] {
  const [y, m] = splitKey(endKey);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(keyOf(y, m - i));
  return out;
}

/** `count` months ending at `currentKey`, newest first (the month picker). */
export function recentMonths(currentKey: string, count: number): string[] {
  return monthWindow(currentKey, count).reverse();
}

/* ── Glossary (web DrillDownModal buildDefs) ────────────────────────────── */

export function buildDefs(d: SlaDeliverable): { term: string; text: string }[] {
  const commit = numPct(d.commitmentPct);
  const out: { term: string; text: string }[] = [
    {
      term: "Commitment",
      text: `The contracted level Smart Joules has promised for this deliverable — ${commit}%. Anything below this is an SLA breach.`,
    },
    {
      term: "Actual %",
      text: "What was really achieved this month, computed from the source records above using the formula below.",
    },
    {
      term: "Score",
      text: "Actual ÷ Commitment × 5.0, capped at 5.0. This number rolls up into the KPI and finally the Performance Rating.",
    },
    {
      term: "Review system",
      text: `${d.reviewSystem} — the module where these records are captured. Every figure here is traceable back to it.`,
    },
  ];
  const insert = (items: { term: string; text: string }[]) => out.splice(1, 0, ...items);

  if (d.key === "comfort.temperature" || d.key === "comfort.rh") {
    insert([
      {
        term: "Area Days",
        text: "One monitored area counted for one day. 40 areas under scope across a 30-day month = 1,200 Area Days — the total opportunity to stay in range.",
      },
      {
        term: "Complaint Days",
        text: "Area Days where a complaint was open for that area. One area with a complaint open for 3 days = 3 Complaint Days. Multiple complaints for the same area on the same day count once.",
      },
      {
        term: "Compliant Area Days",
        text: "Area Days − Complaint Days. The days an area held its temperature / humidity band with no complaint raised.",
      },
    ]);
  } else if (d.key === "qos.tempLog" || d.key === "qos.rhLog") {
    insert([
      {
        term: "Scheduled Logs",
        text: "Every reading the roster expects for the month — each log type × each shift × each day under scope.",
      },
      {
        term: "Completed Logs",
        text: "Scheduled logs actually recorded on time. Logs recorded after the shift window count as missed.",
      },
      {
        term: "Adherence %",
        text: "Completed Logs ÷ Scheduled Logs × 100 — how reliably the site captured its readings.",
      },
    ]);
  } else if (d.key === "qos.otIcuUptime" || d.key === "qos.otherUptime") {
    insert([
      {
        term: "Available Hours",
        text: "Total hours the asset was expected to run in the month (assets under scope × hours in the month).",
      },
      {
        term: "Downtime Hours",
        text: "Hours the asset was unavailable due to a breakdown, counted from the incident being raised until it was restored. Planned maintenance is excluded.",
      },
      { term: "Uptime %", text: "(Available Hours − Downtime Hours) ÷ Available Hours × 100." },
    ]);
  } else if (d.key === "comfort.airflow" || d.key === "qos.filterCondition") {
    insert([
      {
        term: "Design CFM",
        text: "The airflow the unit was designed to deliver, taken from the commissioning data sheet.",
      },
      {
        term: "Actual CFM",
        text: "The airflow measured during the PM visit. Readings below 90% of Design CFM are treated as a fail.",
      },
      {
        term: "PM Instances",
        text: "Each scheduled preventive-maintenance visit for an asset in the month. A visit passes only when every checklist item is completed.",
      },
    ]);
  }
  return out;
}

/**
 * Worked calculation. The backend supplies the real intermediate steps; an
 * older payload without them falls back to the bare ratio (web does the same).
 */
export function drillSteps(drill: SlaDrillDown, d: SlaDeliverable): SlaDrillStep[] {
  if (drill.steps && drill.steps.length > 0) return drill.steps;
  return [
    {
      label: "Actual %",
      detail:
        drill.denominator.value !== 0
          ? `( ${drill.numerator.value.toLocaleString("en-IN")} ÷ ${drill.denominator.value.toLocaleString("en-IN")} ) × 100`
          : undefined,
      value: `${fmtPct(d.actualPct)}%`,
      accent: true,
    },
    {
      label: "Score",
      detail: `5.0 × ( ${fmtPct(d.actualPct)} ÷ ${numPct(d.commitmentPct)} )`,
      value: `${fmtScore(d.actualScore)} / 5.0`,
      accent: true,
    },
  ];
}

/* ── Record cards ───────────────────────────────────────────────────────── */

export function cellText(v: SlaCell | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

export interface RecordShape {
  primary: string;
  title: string | null;
  status: string | null;
  keys: { label: string; value: string }[];
  fields: { label: string; value: string }[];
}

const TITLE_KEYS = ["title", "task_name", "log_name", "fault_type", "asset_location", "location"];

/**
 * Card view of one source record. Columns differ per deliverable (tickets,
 * PM, incidents, logs), so the card is derived from the column list: first
 * column = identifier, a "status"-like column = the pill, the first title-ish
 * column = the headline, the next four = the key grid; "Show all fields" lists
 * every column.
 */
export function recordShape(columns: SlaDrillColumn[], row: Record<string, SlaCell>): RecordShape {
  const first = columns[0];
  const statusCol = columns.find((c) => c.key === "status" || c.key === "pm_status");
  const titleCol =
    columns.find((c) => c !== first && TITLE_KEYS.includes(c.key)) ??
    columns.find((c) => c !== first && c !== statusCol);
  const used = new Set([first?.key, statusCol?.key, titleCol?.key]);
  const keys = columns
    .filter((c) => !used.has(c.key))
    .slice(0, 4)
    .map((c) => ({ label: c.label, value: cellText(row[c.key]) }));
  const status = statusCol ? cellText(row[statusCol.key]) : null;
  return {
    primary: first ? cellText(row[first.key]) : "—",
    title: titleCol ? cellText(row[titleCol.key]) : null,
    status: status && status !== "—" ? status : null,
    keys,
    fields: columns.map((c) => ({ label: c.label, value: cellText(row[c.key]) })),
  };
}

/* ── CSV rows (fed to utils/fileExport toCsv) ───────────────────────────── */

type Row = (string | number | null | undefined)[];

/** Web page.tsx exportDeliverableCsv — one line per deliverable + KPI totals. */
export function reportCsvRows(report: SlaReport): Row[] {
  const rows: Row[] = [
    ["#", "KPI", "Deliverable", "Unit", "Commit %", "Weight %", "Target Score", "Actual %", "Actual Score"],
  ];
  let n = 0;
  report.categories.forEach((c) =>
    c.deliverables.forEach((d) => {
      n += 1;
      rows.push([
        n,
        c.label,
        d.deliverable,
        d.unit,
        numPct(d.commitmentPct),
        numPct(d.weight),
        d.targetScore.toFixed(1),
        fmtPct(d.actualPct),
        fmtScore(d.actualScore),
      ]);
    }),
  );
  rows.push([]);
  report.categories.forEach((c) => rows.push([`${c.label} KPI Score`, fmtScore(c.achievedScore)]));
  rows.push(["Overall Score", fmtScore(report.totals.achievedScore)]);
  rows.push(["Performance Rating", `${fmtPct(report.totals.performanceRating)}%`]);
  return rows;
}

/** Web DrillDownModal downloadCsv. */
export function drillCsvRows(args: {
  no: number;
  deliverable: SlaDeliverable;
  drill: SlaDrillDown | null;
  siteName: string;
  monthKey: string;
}): Row[] {
  const { no, deliverable, drill, siteName, monthKey } = args;
  const rows: Row[] = [
    ["Deliverable", `#${no} ${deliverable.deliverable}`],
    ["KPI", CATEGORY_META[deliverable.category]?.label ?? deliverable.category],
    ["Site", siteName],
    ["Report Period", monthKey],
    ["Source module", sourceModuleOf(deliverable)],
    ["Review System", deliverable.reviewSystem],
    [],
  ];
  if (drill && drill.columns.length) {
    rows.push(drill.columns.map((c) => c.label));
    drill.rows.forEach((r) => rows.push(drill.columns.map((c) => r[c.key] ?? "")));
    rows.push([]);
  }
  const steps = drill ? drillSteps(drill, deliverable) : [];
  if (steps.length) {
    rows.push(["Worked calculation", "", ""]);
    steps.forEach((s) => rows.push([s.label, s.detail ?? "", s.value]));
    rows.push([]);
  }
  if (drill) rows.push(["Formula", drill.formula]);
  rows.push(["Commitment %", numPct(deliverable.commitmentPct)]);
  return rows;
}

/** Web RatingBreakupModal downloadRaw. */
export function ratingCsvRows(report: SlaReport, siteName: string, siteCode: string, monthKey: string): Row[] {
  const cats = applicableCategories(report);
  const rows: Row[] = [
    ["Site", siteName],
    ["Site Code", siteCode],
    ["Report Period", monthKey],
    [],
    ["KPI", "Deliverable", "Numerator", "Denominator", "Commit %", "Actual %", "Score"],
  ];
  cats.forEach((c) =>
    c.deliverables.forEach((d) =>
      rows.push([
        c.label,
        d.deliverable,
        d.numerator,
        d.denominator,
        numPct(d.commitmentPct),
        fmtPct(d.actualPct),
        fmtScore(d.actualScore),
      ]),
    ),
  );
  rows.push([]);
  rows.push(["KPI", "KPI Score", "KPI %", "Weight", "Weighted"]);
  cats.forEach((c) =>
    rows.push([
      c.label,
      fmtScore(c.achievedScore),
      fmtPct(ratio(c.achievedScore, c.targetScore)),
      c.weight.toFixed(2),
      c.weightedAchieved.toFixed(2),
    ]),
  );
  rows.push([]);
  rows.push(["Overall Score", fmtScore(report.totals.achievedScore)]);
  rows.push(["Performance Rating", `${fmtPct(report.totals.performanceRating)}%`]);
  rows.push(["Fee Level", report.band.label]);
  return rows;
}

/**
 * Backend fee implications are sometimes a bare share ("80%"); the artboard
 * reads "80% of O&M fee". Longer phrasings pass through untouched.
 */
export function feeLabel(fee: string): string {
  return /^\s*\d+(\.\d+)?\s*%\s*$/.test(fee) ? `${fee.trim()} of O&M fee` : fee;
}

/** Calculation-step text from the backend carries raw month keys ("2026-10") — show "Oct 2026". */
export function prettyMonthKeys(text: string): string {
  return text.replace(/\b(\d{4})-(0[1-9]|1[0-2])\b(?!-\d)/g, (k) => monthLabel(k));
}
