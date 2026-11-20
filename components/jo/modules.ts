/**
 * App navigation map.
 *
 *  Bottom bar:  Home · Ops · Resources · Settings
 *  Ops:         top sub-tabs — Tickets · PM · Site Logs · Incidents · Assets ·
 *               Trend Sheet (JoulePays sites only)
 *  Resources:   top sub-tabs — SLA · Efficiency · Reports · Client comms
 *  Settings:    the Profile screen, plus a "Modules" group linking the screens
 *               that have no tab of their own (Attendance, Alerts)
 *
 * Every entry carries the role-permission module that gates VIEW
 * (contexts/PermissionsContext); entries without one are always shown. A
 * sub-tab may also depend on the selected site (`visible`).
 */
import type { BxName } from "@/components/jo/Bx";
import type { PermissionModule } from "@/contexts/PermissionsContext";

/* ── Sub-tabs (Ops, Resources) ─────────────────────────────────────────── */

export type OpsTabKey = "tickets" | "pm" | "logs" | "incidents" | "assets" | "trend";
export type ResourceTabKey = "sla" | "efficiency" | "reports" | "comms";
export type SubTabKey = OpsTabKey | ResourceTabKey;
export type SubTabGroup = "ops" | "resources";

/** What a sub-tab may look at, besides the role, to decide whether it shows. */
export interface SubTabContext {
  /** The app-wide selected site. */
  siteCode: string | null;
  /** The selected site is a JoulePays site this user enters trend sheet readings for. */
  trendSite: boolean;
  /**
   * The selected site is a JouleCool site (services/SiteResolver
   * `isJouleCoolSite`; no site yet, or no stored project type, counts as
   * JouleCool). SLA and Efficiency exist only there (spec 0002, AC-56).
   */
  jouleCoolSite: boolean;
}

export interface OpsTabDef {
  key: SubTabKey;
  label: string;
  /** (tabs) route name. */
  tab: string;
  href: string;
  /** Pathname as usePathname() reports it (groups dropped). */
  path: string;
  perm: PermissionModule;
  /**
   * A second condition on top of the role's view grant, for a module that
   * exists only at some sites. Absent means the grant alone decides.
   */
  visible?: (ctx: SubTabContext) => boolean;
  /** Shows a "New" badge on the sub-tab — drop the flag once it's no longer new. */
  isNew?: boolean;
}

export const OPS_TABS: OpsTabDef[] = [
  { key: "tickets", label: "Tickets", tab: "tickets", href: "/(tabs)/tickets", path: "/tickets", perm: "tickets" },
  { key: "pm", label: "PM", tab: "preventive-maintenance", href: "/(tabs)/preventive-maintenance", path: "/preventive-maintenance", perm: "pm" },
  { key: "logs", label: "Site Logs", tab: "site-logs", href: "/(tabs)/site-logs", path: "/site-logs", perm: "site_logs" },
  { key: "incidents", label: "Incidents", tab: "incidents", href: "/(tabs)/incidents", path: "/incidents", perm: "incidents" },
  { key: "assets", label: "Assets", tab: "asset-mapping", href: "/(tabs)/asset-mapping", path: "/asset-mapping", perm: "asset" },
  // Only at JoulePays sites the user enters readings for (services/TrendSheetSites).
  { key: "trend", label: "Trend Sheet", tab: "trend-sheet", href: "/(tabs)/trend-sheet", path: "/trend-sheet", perm: "trend_sheet_entry", visible: (ctx) => ctx.trendSite },
];

export const RESOURCE_TABS: OpsTabDef[] = [
  // JouleCool only: hidden while a JoulePays site is selected.
  { key: "sla", label: "SLA", tab: "sla", href: "/(tabs)/sla", path: "/sla", perm: "sla", isNew: true, visible: (ctx) => ctx.jouleCoolSite },
  { key: "efficiency", label: "Efficiency", tab: "efficiency", href: "/(tabs)/efficiency", path: "/efficiency", perm: "efficiency", isNew: true, visible: (ctx) => ctx.jouleCoolSite },
  { key: "reports", label: "Reports", tab: "reports", href: "/(tabs)/reports", path: "/reports", perm: "reports", isNew: true },
  { key: "comms", label: "Client comms", tab: "customer-communication", href: "/(tabs)/customer-communication", path: "/customer-communication", perm: "customer_communication", isNew: true },
];

export const SUB_TABS: Record<SubTabGroup, OpsTabDef[]> = { ops: OPS_TABS, resources: RESOURCE_TABS };

/** The sub-tabs of a group this role sees at the selected site, in order. */
export function visibleSubTabs(
  group: SubTabGroup,
  canView: (module: PermissionModule) => boolean,
  ctx: SubTabContext,
): OpsTabDef[] {
  return SUB_TABS[group].filter((o) => canView(o.perm) && (o.visible ? o.visible(ctx) : true));
}

/** The sub-tab last opened per group — the bottom bar item returns to it. */
const lastSubTab: Record<SubTabGroup, SubTabKey> = { ops: "tickets", resources: "sla" };

export function rememberSubTab(group: SubTabGroup, key: SubTabKey) {
  lastSubTab[group] = key;
}

export function getLastSubTab(group: SubTabGroup): SubTabKey {
  return lastSubTab[group];
}

/**
 * The sub-tab the bottom bar item opens: the last one used when it is still
 * visible, else the first visible one, so a sub-tab hidden since (SLA at a
 * JoulePays site) is never opened.
 */
export function subTabToOpen(group: SubTabGroup, visible: OpsTabDef[]): OpsTabDef | undefined {
  return visible.find((o) => o.key === getLastSubTab(group)) ?? visible[0];
}

/**
 * Where a Resources screen moves to when the site changes under it and its own
 * sub-tab is now hidden by the site rule (`visible`), e.g. SLA open and a
 * JoulePays site picked: the first visible sub-tab. Null when the open screen
 * is still visible, is not a sub-tab of the group, or nothing is visible.
 *
 * Resources only: the Ops Trend Sheet tab depends on a site list that loads
 * after the screen, so applying this there would bounce a cold start away.
 */
export function hiddenSubTabRedirect(
  group: SubTabGroup,
  pathname: string,
  canView: (module: PermissionModule) => boolean,
  ctx: SubTabContext,
): OpsTabDef | null {
  if (group !== "resources") return null;
  const open = SUB_TABS[group].find((o) => pathname === o.path || pathname.startsWith(`${o.path}/`));
  if (!open?.visible || open.visible(ctx)) return null;
  return visibleSubTabs(group, canView, ctx)[0] ?? null;
}

/* ── Bottom bar ────────────────────────────────────────────────────────── */

export type BottomKey = "home" | "ops" | "resources" | "settings";

export interface BottomDef {
  key: BottomKey;
  label: string;
  icon: BxName;
  /** (tabs) route it opens — Ops / Resources resolve to their last sub-tab instead. */
  tab: string;
  perm?: PermissionModule;
}

export const BOTTOM_TABS: BottomDef[] = [
  { key: "home", label: "Home", icon: "bx-home-alt-2", tab: "dashboard" },
  { key: "ops", label: "Ops", icon: "bx-grid-alt", tab: "tickets" },
  { key: "resources", label: "Resources", icon: "bx-collection", tab: "sla" },
  { key: "settings", label: "Settings", icon: "bx-cog", tab: "profile" },
];

/** (tabs) route name → the bottom item that owns it. */
export function bottomKeyForRoute(routeName: string): BottomKey {
  if (OPS_TABS.some((o) => o.tab === routeName)) return "ops";
  if (RESOURCE_TABS.some((o) => o.tab === routeName)) return "resources";
  if (routeName === "profile" || routeName === "attendance") return "settings";
  // dashboard, index
  return "home";
}

/* ── Settings › Modules ────────────────────────────────────────────────── */

export interface LinkDef {
  key: string;
  label: string;
  sub: string;
  icon: BxName;
  href: string;
  perm?: PermissionModule;
}

export const SETTINGS_MODULES: LinkDef[] = [
  { key: "attendance", label: "Attendance", sub: "Shift history and punch status", icon: "bx-time-five", href: "/(tabs)/attendance", perm: "attendance" },
  { key: "alerts", label: "Alerts", sub: "Notifications feed", icon: "bx-bell", href: "/notifications" },
];

/* ── Route guard ───────────────────────────────────────────────────────── */

/** Path prefixes owned by each permission module. */
export const ROUTE_PERMS: ReadonlyArray<readonly [string, PermissionModule]> = [
  ["/tickets", "tickets"],
  ["/incidents", "incidents"],
  ["/site-logs", "site_logs"],
  ["/sitelog-detail", "site_logs"],
  ["/chiller", "site_logs_chiller"],
  ["/water", "site_logs_water"],
  ["/temp-rh", "site_logs_temp_rh"],
  ["/chemical", "site_logs_chemical"],
  ["/history/site-history", "site_logs"],
  ["/preventive-maintenance", "pm"],
  ["/pm-execution", "pm"],
  ["/asset-mapping", "asset"],
  ["/sla", "sla"],
  ["/efficiency", "efficiency"],
  ["/reports", "reports"],
  ["/customer-communication", "customer_communication"],
  ["/attendance", "attendance"],
  // The tab (/trend-sheet) and its entry screens (/trend-electricity, /trend-dg,
  // /trend-fuel, /trend-summary, /trend-month): the "-" rule below covers them all.
  ["/trend", "trend_sheet_entry"],
];

export function permForPath(pathname: string): PermissionModule | null {
  const hit = ROUTE_PERMS.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/") || pathname.startsWith(prefix + "-"),
  );
  return hit ? hit[1] : null;
}
