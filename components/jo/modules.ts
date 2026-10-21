/**
 * App modules as the floating bar and the "All modules" drawer know them
 * (artboard MODULES / MORE_GROUPS). Inventory and Efficiency are in the
 * artboard's drawer but have no mobile screen, so they are left out.
 */
import {
  ChartColumn,
  Bell,
  CalendarCheck,
  ClipboardList,
  Clock,
  House,
  Medal,
  MessagesSquare,
  Receipt,
  ScanQrCode,
  Settings,
  TriangleAlert,
  User,
  type LucideIcon,
} from "lucide-react-native";

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
  icon: LucideIcon;
  /** expo-router path to open. */
  href: string;
  /** Route name inside the (tabs) navigator, when the module is a tab. */
  tab?: string;
}

export const MODULES: Record<ModuleKey, ModuleDef> = {
  tickets: { key: "tickets", label: "Tickets", icon: Receipt, href: "/(tabs)/tickets", tab: "tickets" },
  incidents: { key: "incidents", label: "Incidents", icon: TriangleAlert, href: "/(tabs)/incidents", tab: "incidents" },
  logs: { key: "logs", label: "Site logs", icon: ClipboardList, href: "/(tabs)/site-logs", tab: "site-logs" },
  pm: { key: "pm", label: "PM", icon: CalendarCheck, href: "/(tabs)/preventive-maintenance", tab: "preventive-maintenance" },
  assets: { key: "assets", label: "Assets", icon: ScanQrCode, href: "/(tabs)/asset-mapping", tab: "asset-mapping" },
  sla: { key: "sla", label: "SLA", icon: Medal, href: "/(tabs)/sla", tab: "sla" },
  reports: { key: "reports", label: "Reports", icon: ChartColumn, href: "/(tabs)/reports", tab: "reports" },
  comms: { key: "comms", label: "Comms", icon: MessagesSquare, href: "/(tabs)/customer-communication", tab: "customer-communication" },
  attendance: { key: "attendance", label: "Attendance", icon: Clock, href: "/attendance" },
  notifications: { key: "notifications", label: "Alerts", icon: Bell, href: "/notifications" },
  profile: { key: "profile", label: "Profile", icon: User, href: "/(tabs)/profile", tab: "profile" },
  settings: { key: "settings", label: "Settings", icon: Settings, href: "/appearance" },
};

export const MORE_GROUPS: { label: string; keys: ModuleKey[] }[] = [
  { label: "Operations", keys: ["tickets", "incidents", "logs", "pm", "assets"] },
  { label: "Insights", keys: ["sla", "reports", "comms"] },
  { label: "Team & account", keys: ["attendance", "notifications", "profile", "settings"] },
];

export const HOME = { label: "Home", icon: House, tab: "dashboard", href: "/(tabs)/dashboard" } as const;

export const DEFAULT_PINS: ModuleKey[] = ["tickets", "pm", "logs"];
export const MAX_PINS = 3;

/** (tabs) route name → the module that owns it (detail tabs map to their parent). */
export function moduleForTab(routeName: string): ModuleKey | "home" | null {
  if (routeName === "dashboard" || routeName === "index") return "home";
  const hit = (Object.values(MODULES) as ModuleDef[]).find((m) => m.tab === routeName);
  return hit ? hit.key : null;
}

export function isModuleKey(v: unknown): v is ModuleKey {
  return typeof v === "string" && v in MODULES;
}
