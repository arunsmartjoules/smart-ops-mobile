/**
 * Pages by project type (web Settings › Pages by Project Type): which pages a
 * kind of site has. A page that is off for the selected site's project type is
 * hidden on the phone: its sub-tab, its Site Logs category, the Settings ›
 * Modules link, and a direct navigation to its screens. It applies to
 * everyone, admins included, and never grants anything: the role still
 * decides first.
 *
 * Rows with sub pages (Site Logs, PM, Documents, Trend Sheet) are derived: on
 * while any sub page is on. Mirrors backend
 * services/rbac/src/lib/projectTypePages.ts (vocabulary, inheritance,
 * defaults). The defaults are what an older backend, a failed fetch or a first
 * offline launch fall back to, so they equal the rules from before this
 * setting: SLA, Efficiency and the Chiller log off at a JoulePays site (spec
 * 0002, AC-56 and AC-57), everything else on.
 *
 * Kept free of imports with side effects so tests can load it bare.
 */
import type { PermissionModule } from "@/contexts/PermissionsContext";

export type ProjectTypeKey = "joulecool" | "joulepays";
const PROJECT_TYPES: ProjectTypeKey[] = ["joulecool", "joulepays"];

const DERIVED = {
  site_logs: [
    "site_logs_activity_master",
    "site_logs_temp_rh",
    "site_logs_water",
    "site_logs_chiller",
    "site_logs_chemical",
  ],
  pm: ["pm_activity", "pm_checklist", "pm_schedule"],
  site_hub: ["site_hub_details", "site_hub_documents", "site_hub_escalation"],
  trend_sheet: ["trend_sheet_entry", "trend_sheet_dashboard", "trend_sheet_config"],
} as const;
type DerivedPage = keyof typeof DERIVED;

export const PROJECT_TYPE_PAGES = [
  "tickets",
  ...DERIVED.site_logs,
  ...DERIVED.pm,
  "incidents",
  "customer_communication",
  "attendance",
  "shift_master",
  "asset",
  "inventory",
  ...DERIVED.site_hub,
  "dashboard",
  "sla",
  "activity",
  "client_dashboard",
  "efficiency",
  "reports",
  "baseline",
  ...DERIVED.trend_sheet,
] as const;
export type ProjectTypePage = (typeof PROJECT_TYPE_PAGES)[number];
type MatrixKey = ProjectTypePage | DerivedPage;

export type ProjectTypePageMatrix = Record<ProjectTypeKey, Record<MatrixKey, boolean>>;

const DEFAULT_OFF = new Set(["joulepays:sla", "joulepays:efficiency", "joulepays:site_logs_chiller"]);

/** A sub page with no value of its own takes its row's (a save from before the split). */
const INHERITS_FROM: Partial<Record<ProjectTypePage, string>> = {
  shift_master: "attendance",
  ...Object.fromEntries(
    (Object.keys(DERIVED) as DerivedPage[]).flatMap((parent) =>
      DERIVED[parent].map((child) => [child, parent]),
    ),
  ),
};

/**
 * API `matrix` → a complete matrix. A page the server omitted takes its row's
 * value, else the default; derived rows are recomputed, never trusted.
 */
export function parseProjectTypePages(raw: unknown): ProjectTypePageMatrix {
  const src = (raw ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const out = {} as ProjectTypePageMatrix;
  for (const type of PROJECT_TYPES) {
    const row = {} as Record<MatrixKey, boolean>;
    for (const page of PROJECT_TYPE_PAGES) {
      const own = src[type]?.[page];
      const from = INHERITS_FROM[page];
      const inherited = from === undefined ? undefined : src[type]?.[from];
      row[page] =
        typeof own === "boolean"
          ? own
          : typeof inherited === "boolean"
            ? inherited
            : !DEFAULT_OFF.has(`${type}:${page}`);
    }
    for (const parent of Object.keys(DERIVED) as DerivedPage[]) {
      row[parent] = DERIVED[parent].some((child) => row[child]);
    }
    out[type] = row;
  }
  return out;
}

export const DEFAULT_PROJECT_TYPE_PAGES: ProjectTypePageMatrix = parseProjectTypePages(null);

/**
 * The column a site follows. The phone's site list holds every mapped site;
 * anything not JouleCool follows JoulePays, as the SLA, Efficiency and Chiller
 * rules did before this setting. Same test as SiteResolver `isJouleCoolSite`
 * (null project type = JouleCool, AC-54), inlined so this module stays free of
 * SiteResolver's storage imports.
 */
export function projectTypeOfSite(site: { project_type?: string | null }): ProjectTypeKey {
  return !site.project_type || site.project_type === "JouleCool" ? "joulecool" : "joulepays";
}

/**
 * Whether `module`'s page is on for `type`. No project type (no site selected
 * yet) means no rule, so nothing flickers away or bounces while the stored
 * selection is restored. A module that is not a page here is always on.
 */
export function isModuleOnFor(
  matrix: ProjectTypePageMatrix,
  type: ProjectTypeKey | null,
  module: PermissionModule,
): boolean {
  if (!type) return true;
  return matrix[type][module as MatrixKey] ?? true;
}
