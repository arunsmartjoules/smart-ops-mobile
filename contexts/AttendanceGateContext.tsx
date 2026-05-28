import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import { useAuth } from "./AuthContext";
import { AttendanceService, AttendanceLog } from "../services/AttendanceService";
import logger from "../utils/logger";

export type ReadOnlyDomain = "tickets" | "incidents" | "pm" | "site-logs";
export type GateDomain = "dashboard" | ReadOnlyDomain;

const PRIVILEGED_ROLES = new Set(["admin", "manager"]);

interface AttendanceGateContextValue {
  /** True if the user has an open attendance session (checked in, not yet checked out). */
  isPunchedIn: boolean;
  /** True if role is admin/manager or is_superadmin is set — these users bypass the gate. */
  isPrivileged: boolean;
  /** True when no gate applies AND no read-only mode is active. Every write surface should check this. */
  canEdit: boolean;
  /** True if the user has consented to view a domain read-only without punching in. */
  isReadOnlyMode: boolean;
  /** Which domain the user picked in the View Reports flow. Only that domain is unlocked. */
  readOnlyDomain: ReadOnlyDomain | null;
  /** Initial attendance fetch in flight — gate consumers can show a spinner. */
  loading: boolean;
  /** Enable read-only access to a single domain. */
  enableReadOnly: (domain: ReadOnlyDomain) => void;
  /** Exit read-only mode. Called automatically on punch-in and sign-out. */
  disableReadOnly: () => void;
  /** Re-pull today's attendance. Call after a successful check-in. */
  refresh: () => Promise<void>;
  /**
   * Optimistically mark the user as punched in. Use right after a successful
   * check-in — bypasses the SQLite re-read so the UI flips immediately, even
   * if the CacheManager write hasn't settled yet.
   */
  markPunchedIn: () => void;
  /** Optimistically mark the user as punched out (after a successful check-out). */
  markPunchedOut: () => void;
}

const defaultValue: AttendanceGateContextValue = {
  isPunchedIn: false,
  isPrivileged: false,
  canEdit: false,
  isReadOnlyMode: false,
  readOnlyDomain: null,
  loading: true,
  enableReadOnly: () => {},
  disableReadOnly: () => {},
  refresh: async () => {},
  markPunchedIn: () => {},
  markPunchedOut: () => {},
};

const AttendanceGateContext =
  createContext<AttendanceGateContextValue>(defaultValue);

export const useAttendanceGate = () => useContext(AttendanceGateContext);

function isOpenSession(log: AttendanceLog | null): boolean {
  if (!log) return false;
  if (!log.check_in_time) return false;
  if (log.check_out_time) return false;
  return true;
}

export const AttendanceGateProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || "";
  const role = String(user?.role || "").toLowerCase();
  const isPrivileged =
    PRIVILEGED_ROLES.has(role) || Boolean(user?.is_superadmin);

  const [isPunchedIn, setIsPunchedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [readOnlyDomain, setReadOnlyDomain] =
    useState<ReadOnlyDomain | null>(null);
  const lastUserIdRef = useRef<string>("");

  const refresh = useCallback(async () => {
    if (!userId) {
      setIsPunchedIn(false);
      setLoading(false);
      return;
    }
    try {
      const log = await AttendanceService.getTodayAttendance(userId);
      const open = isOpenSession(log);
      setIsPunchedIn(open);
      // Punching in clears any prior read-only intent — full edit returns.
      if (open) {
        setReadOnlyDomain(null);
      }
    } catch (err: any) {
      logger.warn("AttendanceGate: failed to read today's attendance", {
        module: "ATTENDANCE_GATE",
        error: err?.message || String(err),
      });
      setIsPunchedIn(false);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Reset on user change / sign-out.
  useEffect(() => {
    if (userId !== lastUserIdRef.current) {
      lastUserIdRef.current = userId;
      setReadOnlyDomain(null);
      if (!userId) {
        setIsPunchedIn(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      refresh();
    }
  }, [userId, refresh]);

  // Re-pull when the app comes back to the foreground — a punch-in done in a
  // background sync or another device should update the gate.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") {
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const enableReadOnly = useCallback((domain: ReadOnlyDomain) => {
    setReadOnlyDomain(domain);
  }, []);

  const disableReadOnly = useCallback(() => {
    setReadOnlyDomain(null);
  }, []);

  const markPunchedIn = useCallback(() => {
    setIsPunchedIn(true);
    setReadOnlyDomain(null);
    setLoading(false);
  }, []);

  const markPunchedOut = useCallback(() => {
    setIsPunchedIn(false);
    setLoading(false);
  }, []);

  const isReadOnlyMode = readOnlyDomain !== null;
  const canEdit = isPrivileged || (isPunchedIn && !isReadOnlyMode);

  const value = useMemo<AttendanceGateContextValue>(
    () => ({
      isPunchedIn,
      isPrivileged,
      canEdit,
      isReadOnlyMode,
      readOnlyDomain,
      loading,
      enableReadOnly,
      disableReadOnly,
      refresh,
      markPunchedIn,
      markPunchedOut,
    }),
    [
      isPunchedIn,
      isPrivileged,
      canEdit,
      isReadOnlyMode,
      readOnlyDomain,
      loading,
      enableReadOnly,
      disableReadOnly,
      refresh,
      markPunchedIn,
      markPunchedOut,
    ],
  );

  return (
    <AttendanceGateContext.Provider value={value}>
      {children}
    </AttendanceGateContext.Provider>
  );
};

export default AttendanceGateProvider;
