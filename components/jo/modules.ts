/**
 * App navigation map.
 *
 *  Bottom bar:  Home · Ops · Resources · Settings
 *  Ops:         top sub-tabs — Tickets · PM · Site Logs · Incidents · Assets
 *  Resources:   top sub-tabs — SLA · Reports · Client comms
 *  Settings:    the Profile screen, plus a "Modules" group linking the screens
 *               that have no tab of their own (Attendance, Alerts)
 *
 * Every entry carries the role-permission module that gates VIEW
 * (contexts/PermissionsContext); entries without one are always shown.
 */
import type { BxName } from "@/components/jo/Bx";
import type { PermissionModule } from "@/contexts/PermissionsContext";

/* ── Sub-tabs (Ops, Resources) ─────────────────────────────────────────── */

export type OpsTabKey = "tickets" | "pm" | "logs" | "incidents" | "assets";
export type ResourceTabKey = "sla" | "reports" | "comms";
export type SubTabKey = OpsTabKey | ResourceTabKey;
export type SubTabGroup = "ops" | "resources";

export interface OpsTabDef {
  key: SubTabKey;
  label: string;
  /** (tabs) route name. */
  tab: string;
  href: string;
  /** Pathname as usePathname() reports it (groups dropped). */
  path: string;
  perm: PermissionModule;
}

export const OPS_TABS: OpsTabDef[] = [
  { key: "tickets", label: "Tickets", tab: "tickets", href: "/(tabs)/tickets", path: "/tickets", perm: "tickets" },
  { key: "pm", label: "PM", tab: "preventive-maintenance", href: "/(tabs)/preventive-maintenance", path: "/preventive-maintenance", perm: "pm" },
  { key: "logs", label: "Site Logs", tab: "site-logs", href: "/(tabs)/site-logs", path: "/site-logs", perm: "site_logs" },
  { key: "incidents", label: "Incidents", tab: "incidents", href: "/(tabs)/incidents", path: "/incidents", perm: "incidents" },
  { key: "assets", label: "Assets", tab: "asset-mapping", href: "/(tabs)/asset-mapping", path: "/asset-mapping", perm: "asset" },
];

export const RESOURCE_TABS: OpsTabDef[] = [
  { key: "sla", label: "SLA", tab: "sla", href: "/(tabs)/sla", path: "/sla", perm: "sla" },
  { key: "reports", label: "Reports", tab: "reports", href: "/(tabs)/reports", path: "/reports", perm: "reports" },
  { key: "comms", label: "Client comms", tab: "customer-communication", href: "/(tabs)/customer-communication", path: "/customer-communication", perm: "customer_communication" },
];

export const SUB_TABS: Record<SubTabGroup, OpsTabDef[]> = { ops: OPS_TABS, resources: RESOURCE_TABS };

/** The sub-tab last opened per group — the bottom bar item returns to it. */
const lastSubTab: Record<SubTabGroup, SubTabKey> = { ops: "tickets", resources: "sla" };

export function rememberSubTab(group: SubTabGroup, key: SubTabKey) {
  lastSubTab[group] = key;
}

export function getLastSubTab(group: SubTabGroup): SubTabKey {
  return lastSubTab[group];
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
  ["/chiller", "site_logs"],
  ["/water", "site_logs"],
  ["/temp-rh", "site_logs"],
  ["/chemical", "site_logs"],
  ["/history/site-history", "site_logs"],
  ["/preventive-maintenance", "pm"],
  ["/pm-execution", "pm"],
  ["/asset-mapping", "asset"],
  ["/sla", "sla"],
  ["/reports", "reports"],
  ["/customer-communication", "customer_communication"],
  ["/attendance", "attendance"],
];

export function permForPath(pathname: string): PermissionModule | null {
  const hit = ROUTE_PERMS.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/") || pathname.startsWith(prefix + "-"),
  );
  return hit ? hit[1] : null;
}
