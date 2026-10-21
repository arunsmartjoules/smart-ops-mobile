/**
 * App modules as the floating bar and the "All modules" drawer know them
 * (artboard MODULES / MORE_GROUPS). Inventory and Efficiency are in the
 * artboard's drawer but have no mobile screen, so they are left out.
 */
import type { BxName } from "@/components/jo/Bx";

import type { PermissionModule } from "@/contexts/PermissionsContext";

export type ModuleKey =
  | "tickets"
  | "incidents"
  | "logs"
  | "pm"
  | "assets"
  | "sla"
  | "reports"
  | "comms"
  | "attendance"
  | "notifications"
  | "profile"
  | "settings";

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  /** Boxicons class name, as the artboard (MODULES) names it. */
  icon: BxName;
  /** expo-router path to open. */
  href: string;
  /** Route name inside the (tabs) navigator, when the module is a tab. */
  tab?: string;
  /** Role-permission module gating VIEW (contexts/PermissionsContext); none = always shown. */
  perm?: PermissionModule;
}

export const MODULES: Record<ModuleKey, ModuleDef> = {
  tickets: { key: "tickets", label: "Tickets", icon: "bx-receipt", href: "/(tabs)/tickets", tab: "tickets", perm: "tickets" },
  incidents: { key: "incidents", label: "Incidents", icon: "bx-error-alt", href: "/(tabs)/incidents", tab: "incidents", perm: "incidents" },
  logs: { key: "logs", label: "Site logs", icon: "bx-clipboard", href: "/(tabs)/site-logs", tab: "site-logs", perm: "site_logs" },
  pm: { key: "pm", label: "PM", icon: "bx-calendar-check", href: "/(tabs)/preventive-maintenance", tab: "preventive-maintenance", perm: "pm" },
  assets: { key: "assets", label: "Assets", icon: "bx-qr-scan", href: "/(tabs)/asset-mapping", tab: "asset-mapping", perm: "asset" },
  sla: { key: "sla", label: "SLA", icon: "bx-medal", href: "/(tabs)/sla", tab: "sla", perm: "sla" },
  reports: { key: "reports", label: "Reports", icon: "bx-bar-chart-alt-2", href: "/(tabs)/reports", tab: "reports", perm: "reports" },
  comms: { key: "comms", label: "Comms", icon: "bx-conversation", href: "/(tabs)/customer-communication", tab: "customer-communication", perm: "customer_communication" },
  attendance: { key: "attendance", label: "Attendance", icon: "bx-time-five", href: "/(tabs)/attendance", tab: "attendance", perm: "attendance" },
  notifications: { key: "notifications", label: "Alerts", icon: "bx-bell", href: "/notifications" },
  profile: { key: "profile", label: "Profile", icon: "bx-user", href: "/(tabs)/profile", tab: "profile" },
  settings: { key: "settings", label: "Settings", icon: "bx-cog", href: "/appearance" },
};

export const MORE_GROUPS: { label: string; keys: ModuleKey[] }[] = [
  { label: "Operations", keys: ["tickets", "incidents", "logs", "pm", "assets"] },
  { label: "Insights", keys: ["sla", "reports", "comms"] },
  { label: "Team & account", keys: ["attendance", "notifications", "profile", "settings"] },
];

export const HOME = { label: "Home", icon: "bx-home-alt-2" as BxName, tab: "dashboard", href: "/(tabs)/dashboard" } as const;
export const MORE_ICON: BxName = "bx-dots-horizontal-rounded";

export const DEFAULT_PINS: ModuleKey[] = ["tickets", "pm"];
/**
 * Two pins: the bar is Home · pin · Quick create (+) · pin · More, so the
 * "+" sits in the true centre. (The artboard had three pins and no "+".)
 */
export const MAX_PINS = 2;

/** (tabs) route name → the module that owns it (detail tabs map to their parent). */
export function moduleForTab(routeName: string): ModuleKey | "home" | null {
  if (routeName === "dashboard" || routeName === "index") return "home";
  const hit = (Object.values(MODULES) as ModuleDef[]).find((m) => m.tab === routeName);
  return hit ? hit.key : null;
}

export function isModuleKey(v: unknown): v is ModuleKey {
  return typeof v === "string" && v in MODULES;
}

/** Path prefixes owned by each permission module — the route guard's map. */
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
  const hit = ROUTE_PERMS.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/") || pathname.startsWith(prefix + "-"));
  return hit ? hit[1] : null;
}
