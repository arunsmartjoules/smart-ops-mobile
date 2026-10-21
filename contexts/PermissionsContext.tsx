/**
 * Role → module permissions for the signed-in user, from
 * `GET /api/role-permissions/me` (configured on the web under Settings ›
 * Roles & Permissions). A module the role can't VIEW is hidden from the app
 * entirely: the tab bar, the "All modules" drawer, Home's links, and a direct
 * navigation to its screen.
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

/** Backend vocabulary (backend/shared/src/lib/rolePermissions.ts PERMISSION_MODULES). */
export const PERMISSION_MODULES = [
  "tickets",
  "attendance",
  "site_logs",
  "incidents",
  "pm",
  "dashboard",
  "sla",
  "asset",
  "reports",
  "efficiency",
  "inventory",
  "customer_communication",
] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

type Cell = { view: boolean; add: boolean };
type ViewMap = Record<PermissionModule, Cell>;

const ALL_VISIBLE: ViewMap = Object.fromEntries(
  PERMISSION_MODULES.map((m) => [m, { view: true, add: true }]),
) as ViewMap;

const CACHE_PREFIX = "role-perms:v1:";

/**
 * API `permissions` object → view/add flags; a module the server omitted reads
 * as hidden, and no view means no add (the backend's view-gate invariant).
 */
export function parseViewMap(raw: unknown): ViewMap {
  const src = (raw ?? {}) as Record<string, { view?: unknown; add?: unknown } | undefined>;
  return Object.fromEntries(
    PERMISSION_MODULES.map((m) => {
      const view = src[m]?.view === true;
      return [m, { view, add: view && src[m]?.add === true }];
    }),
  ) as ViewMap;
}

function bypassesMatrix(role: unknown, isSuperadmin: unknown) {
  const r = String(role || "").toLowerCase().trim();
  return Boolean(isSuperadmin) || r === "admin" || r === "superadmin" || r === "super_admin";
}

interface PermissionsValue {
  canView: (module: PermissionModule) => boolean;
  /** May create records in the module (drives the quick-create menu). */
  canAdd: (module: PermissionModule) => boolean;
  /** True once a real (or cached) answer is in. */
  resolved: boolean;
}

const PermissionsContext = createContext<PermissionsValue>({
  canView: () => true,
  canAdd: () => true,
  resolved: false,
});

export const usePermissions = () => useContext(PermissionsContext);

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const userId = String(user?.user_id || user?.id || "");
  const bypass = bypassesMatrix(user?.role, user?.is_superadmin);
  const [state, setState] = useState<{ userId: string; map: ViewMap } | null>(null);
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

  const canView = useCallback((m: PermissionModule) => map[m]?.view !== false, [map]);
  const canAdd = useCallback((m: PermissionModule) => map[m]?.add !== false, [map]);
  const value = useMemo(() => ({ canView, canAdd, resolved }), [canView, canAdd, resolved]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}
