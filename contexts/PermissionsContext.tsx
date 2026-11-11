/**
 * Role → module permissions for the signed-in user, from
 * `GET /api/role-permissions/me` (configured on the web under Settings ›
 * Roles & Permissions). A module the role can't VIEW is hidden from the app
 * entirely: the tab bar, the "All modules" drawer, Home's links, and a direct
 * navigation to its screen.
 *
 * Also answers per-action checks (`can(module, "delete")` etc.).
 *
 * Mirrors web/src/contexts/permissions-context.tsx: admin / superadmin bypass
 * the matrix, and the gate is presentational — every endpoint still
 * authorizes on the server. Unlike the web, the last good answer is cached per
 * user so an offline launch keeps hiding what it hid online; with no answer
 * at all it fails open rather than locking a field user out of their work.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/utils/apiHelper";
import { API_BASE_URL } from "@/constants/api";
import logger from "@/utils/logger";
import {
  setViewableSiteLogCategories,
  type SiteLogCategoryKey,
} from "@/services/SiteLogCategoryAccess";
import { setOpsDateFloor } from "@/services/OpsDateRange";

/** Backend vocabulary (backend/shared/src/lib/rolePermissions.ts PERMISSION_MODULES). */
export const PERMISSION_MODULES = [
  "tickets",
  "attendance",
  "site_logs",
  // Site log categories. The app has no Activity Master tab, so it decides
  // Site Logs' own visibility from the other four (see applyMobileRules).
  "site_logs_activity_master",
  "site_logs_temp_rh",
  "site_logs_water",
  "site_logs_chiller",
  "site_logs_chemical",
  "incidents",
  "pm",
  // PM tabs. The app's PM screen is the Activity tab.
  "pm_activity",
  "pm_checklist",
  "pm_schedule",
  "dashboard",
  "sla",
  "asset",
  "reports",
  "efficiency",
  "inventory",
  "customer_communication",
] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export type PermissionAction = "view" | "add" | "edit" | "delete" | "export" | "import";
const ACTIONS: PermissionAction[] = ["view", "add", "edit", "delete", "export", "import"];
type Cell = Record<PermissionAction, boolean>;
type ViewMap = Record<PermissionModule, Cell>;

const allCell = (v: boolean): Cell =>
  Object.fromEntries(ACTIONS.map((a) => [a, v])) as Cell;

const ALL_VISIBLE: ViewMap = Object.fromEntries(
  PERMISSION_MODULES.map((m) => [m, allCell(true)]),
) as ViewMap;

const CACHE_PREFIX = "role-perms:v1:";
/** The role's "data visible from" day, cached beside the grants. */
const FLOOR_CACHE_PREFIX = "role-data-from:v1:";

/** A `YYYY-MM-DD` out of an API value, or null. */
const asCalendarDay = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

/** The parent a category falls back to when the payload lacks it. */
const CATEGORY_PARENT: Partial<Record<PermissionModule, PermissionModule>> = {
  site_logs_activity_master: "site_logs",
  site_logs_temp_rh: "site_logs",
  site_logs_water: "site_logs",
  site_logs_chiller: "site_logs",
  site_logs_chemical: "site_logs",
  pm_activity: "pm",
  pm_checklist: "pm",
  pm_schedule: "pm",
};

/** The site log categories the app has screens for. */
export const MOBILE_SITE_LOG_CATEGORIES = [
  "site_logs_temp_rh",
  "site_logs_water",
  "site_logs_chiller",
  "site_logs_chemical",
] as const satisfies readonly PermissionModule[];

/**
 * Mobile's own module rules (the app has no Activity Master tab and its PM
 * screen is PM Activity): Site Logs shows when any of its four categories is
 * viewable, and PM follows `pm_activity`. Applying them to the map keeps the
 * tab bar, Home tiles and route guard on their existing `site_logs` / `pm`
 * checks.
 */
function applyMobileRules(map: ViewMap): ViewMap {
  const anyLog = MOBILE_SITE_LOG_CATEGORIES.some((k) => map[k].view);
  return {
    ...map,
    site_logs: anyLog ? map.site_logs : allCell(false),
    pm: map.pm_activity,
  };
}

/**
 * API `permissions` object → per-action flags; a module or action the server
 * omitted reads as denied, and no view means nothing at all (the backend's
 * view-gate invariant, same as web lib/permissions normalizeCell). A category
 * missing from the payload (cached before categories existed) takes its
 * parent's grant.
 */
export function parseViewMap(raw: unknown): ViewMap {
  const src = (raw ?? {}) as Record<string, Partial<Record<PermissionAction, unknown>> | undefined>;
  const parsed = Object.fromEntries(
    PERMISSION_MODULES.map((m) => {
      const parent = CATEGORY_PARENT[m];
      const row = (src[m] === undefined && parent ? src[parent] : src[m]) ?? {};
      if (row.view !== true) return [m, allCell(false)];
      return [m, Object.fromEntries(ACTIONS.map((a) => [a, row[a] === true])) as Cell];
    }),
  ) as ViewMap;
  // Schedule is view-only, whatever its parent grants.
  parsed.pm_schedule = { ...allCell(false), view: parsed.pm_schedule.view };
  return applyMobileRules(parsed);
}

function bypassesMatrix(role: unknown, isSuperadmin: unknown) {
  const r = String(role || "").toLowerCase().trim();
  return Boolean(isSuperadmin) || r === "admin" || r === "superadmin" || r === "super_admin";
}

interface PermissionsValue {
  canView: (module: PermissionModule) => boolean;
  /** Any action on a module (add / edit / delete / export / import). */
  can: (module: PermissionModule, action: PermissionAction) => boolean;
  /** True once a real (or cached) answer is in. */
  resolved: boolean;
}

const PermissionsContext = createContext<PermissionsValue>({
  canView: () => true,
  can: () => true,
  resolved: false,
});

export const usePermissions = () => useContext(PermissionsContext);

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const userId = String(user?.user_id || user?.id || "");
  const bypass = bypassesMatrix(user?.role, user?.is_superadmin);
  const [state, setState] = useState<{ userId: string; map: ViewMap } | null>(null);
  const [floor, setFloor] = useState<{ userId: string; day: string | null } | null>(null);
  const [tick, setTick] = useState(0);

  // Re-check when the app returns to the foreground (an admin may have
  // changed the matrix).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") setTick((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!token || !userId || bypass) return;
    let cancelled = false;
    const key = CACHE_PREFIX + userId;
    const floorKey = FLOOR_CACHE_PREFIX + userId;

    // The date floor survives an offline launch like the grants do.
    AsyncStorage.getItem(floorKey)
      .then((raw) => {
        if (cancelled || raw === null) return;
        setFloor((cur) => (cur?.userId === userId ? cur : { userId, day: asCalendarDay(raw) }));
      })
      .catch(() => {});

    AsyncStorage.getItem(key)
      .then((raw) => {
        if (cancelled || !raw) return;
        setState((cur) => (cur?.userId === userId ? cur : { userId, map: parseViewMap(JSON.parse(raw)) }));
      })
      .catch(() => {});

    apiFetch(`${API_BASE_URL}/api/role-permissions/me`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && body?.success && body.data?.permissions) {
          setState({ userId, map: parseViewMap(body.data.permissions) });
          AsyncStorage.setItem(key, JSON.stringify(body.data.permissions)).catch(() => {});
          // Absent (an older backend) reads as "no limit".
          const day = asCalendarDay(body.data.data_from_date);
          setFloor({ userId, day });
          AsyncStorage.setItem(floorKey, day ?? "").catch(() => {});
        } else {
          logger.warn("Role permissions fetch unsuccessful", { status: res.status });
        }
      })
      .catch((error) => {
        logger.warn("Role permissions fetch failed", { error: String(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [token, userId, bypass, tick]);

  const map = bypass || !state || state.userId !== userId ? ALL_VISIBLE : state.map;
  const resolved = bypass || (!!state && state.userId === userId);

  // The role's earliest viewable day locks the shared Ops date range. Never
  // applies to admins, and clears on sign-out / user switch.
  const dataFloor = !bypass && floor?.userId === userId ? floor.day : null;
  useEffect(() => {
    setOpsDateFloor(dataFloor);
  }, [dataFloor]);

  // Let background pulls skip categories this role can't view.
  useEffect(() => {
    setViewableSiteLogCategories(
      resolved && !bypass
        ? new Set<SiteLogCategoryKey>(MOBILE_SITE_LOG_CATEGORIES.filter((k) => map[k].view))
        : null,
    );
  }, [map, resolved, bypass]);

  const canView = useCallback((m: PermissionModule) => map[m]?.view !== false, [map]);
  const can = useCallback(
    (m: PermissionModule, a: PermissionAction) => map[m]?.[a] !== false,
    [map],
  );
  const value = useMemo(() => ({ canView, can, resolved }), [canView, can, resolved]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}
