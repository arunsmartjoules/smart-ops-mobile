import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { OpsTabs } from "@/components/jo/OpsTabs";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import Animated, {
  Easing,
  SlideInRight,
  SlideOutRight,
} from "react-native-reanimated";
import { useAuth } from "@/contexts/AuthContext";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import { useAutoSync } from "@/hooks/useAutoSync";
import siteLogService from "@/services/SiteLogService";
import {
  istTodayString,
  istDateString,
  istParts,
  formatIST,
} from "@/utils/istDate";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useSites } from "@/hooks/useSites";
import { setRouteParams } from "@/utils/routeParams";
import { uiShiftToLabel } from "@/services/LogActivityMasterService";
import { startOfDay, endOfDay, addDays } from "date-fns";
import loggerUtil from "@/utils/logger";
import * as Haptics from "expo-haptics";
import { Bx, type BxName } from "@/components/jo/Bx";
import {
  GlossFill,
  EmptyState,
  IconButton,
  JoPage,
  JoSheet,
  PrimaryButton,
  SecondaryButton,
  Shimmer,
  StatusPill,
  f,
  makeJoStyles,
  useJoTheme,
} from "@/components/jo/ui";
import { useNavInsets } from "@/components/jo/navInsets";
import { useHideTabBar } from "@/services/TabBarVisibility";
import {
  LogHistoryCard,
  normaliseLogStatus,
} from "@/components/sitelogs/LogHistoryCard";
import { LogEditSheet } from "@/components/sitelogs/LogEditSheet";
import {
  HistoryCounters,
  LogTypeCard,
  PendingLegend,
} from "@/components/sitelogs/LogsUI";
import { NoticePill, ShiftCells } from "@/components/sitelogs/LogsKit";
import {
  DEFAULT_HISTORY_FILTERS,
  LogHistoryFilterSheet,
  filtersActive,
  type HistoryFilters,
} from "@/components/sitelogs/LogHistoryFilterSheet";
import {
  PRESET_LABEL,
  addDaysIso,
  formatOpsRange,
  useOpsDateRange,
} from "@/services/OpsDateRange";

/** Inverse of uiShiftToLabel: "1/3" → "A". */
const labelToUiShift = (label?: string | null): "A" | "B" | "C" | null => {
  const s = String(label ?? "").trim();
  if (s === "1/3") return "A";
  if (s === "2/3") return "B";
  if (s === "3/3") return "C";
  return null;
};

/** Card order matches the design; `key` is the value the services expect. */
const LOG_TABS = [
  { key: "Temp RH", label: "Temp & RH", route: "/temp-rh", hasShift: true },
  { key: "Chiller Logs", label: "Chiller", route: "/chiller", hasShift: false },
  { key: "Water", label: "Water", route: "/water", hasShift: false },
  {
    key: "Chemical Dosing",
    label: "Chemical",
    route: "/chemical",
    hasShift: false,
  },
] as const;

type LogKey = (typeof LOG_TABS)[number]["key"];
type LogTab = (typeof LOG_TABS)[number];

const tabFor = (key: LogKey): LogTab => LOG_TABS.find((t) => t.key === key)!;

/**
 * Overview window — today back one week. Today drives the counts; the week
 * catches an in-progress log left open to turn Start into Continue. The
 * history panel loads the shared Ops date range (services/OpsDateRange).
 */
const OVERVIEW_DAYS = 7;

const SHIFTS = ["A", "B", "C"] as const;
type ShiftKey = (typeof SHIFTS)[number];

const SHIFT_OPTIONS: readonly {
  value: ShiftKey;
  label: string;
  window: string;
  icon: BxName;
}[] = [
  { value: "A", label: "Shift A · Morning", window: "06:00 – 14:00", icon: "bxs-sun" },
  { value: "B", label: "Shift B · Evening", window: "14:00 – 22:00", icon: "bxs-cloud" },
  { value: "C", label: "Shift C · Night", window: "22:00 – 06:00", icon: "bxs-moon" },
];

/** The shift the IST clock is in now — C wraps midnight. */
const currentIstShift = (): ShiftKey => {
  const h = istParts(new Date()).hour;
  if (h >= 6 && h < 14) return "A";
  if (h >= 14 && h < 22) return "B";
  return "C";
};

/**
 * Chiller readings owed per site per DAY, regardless of how many chillers the
 * site runs — mirrors web `CHILLER_READINGS_PER_DAY(_BY_SITE)` in
 * web/src/app/site-logs/lib.tsx. Keep the two in sync.
 */
const CHILLER_READINGS_PER_DAY = 12;
const CHILLER_READINGS_PER_DAY_BY_SITE: Record<string, number> = {
  "JCL-KIMSVALLIYATH": 5,
};
const chillerTargetFor = (siteCode: string | null) =>
  (siteCode && CHILLER_READINGS_PER_DAY_BY_SITE[siteCode]) ||
  CHILLER_READINGS_PER_DAY;

/**
 * "YYYY-MM-DD" → epoch ms of that day's device-local 00:00 / 23:59:59.999,
 * built from the parts (never `new Date("YYYY-MM-DD")`, which is UTC). The
 * local site-log read turns epoch bounds back into a calendar day with local
 * date parts, so local bounds round-trip to exactly these days; this matches
 * the startOfDay/endOfDay window the history panel used before.
 */
const localDayStartMs = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getTime();
};
const localDayEndMs = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999).getTime();
};

const isCompleted = (row: any) => normaliseLogStatus(row?.status) === "Completed";

/**
 * The row's IST calendar day. Site logs carry `scheduled_date` ("YYYY-MM-DD");
 * chiller readings only have an instant, so it comes off `reading_time`.
 */
const rowDay = (row: any): string => {
  if (row?.scheduled_date) return String(row.scheduled_date).slice(0, 10);
  const ms = row?.reading_time ?? row?.created_at;
  return ms ? istDateString(new Date(ms)) : "";
};

/** Rows for one Temp & RH shift. Legacy rows saved without a shift match every shift. */
const inShift = (row: any, sh: string) => {
  const label = row.shift_label ? String(row.shift_label).trim() : "";
  return !label || label === uiShiftToLabel(sh);
};

/** The start flow: which log, which step, and (Temp & RH) which shift. */
type StartSheet = {
  key: LogKey;
  step: "shift" | "confirm";
  shift?: ShiftKey;
} | null;

export default function SiteLogs() {
  const t = useJoTheme();
  const s = useStyles();
  const { clearance } = useNavInsets();
  const { user } = useAuth();
  const { canEdit } = useAttendanceGate();
  const { isConnected } = useNetworkStatus();
  const insets = useSafeAreaInsets();

  // One bucket per log type. The overview needs today's counts for every
  // type, so all four are loaded; each is local-cache first, network behind.
  const [rowsByType, setRowsByType] = useState<Partial<Record<LogKey, any[]>>>(
    {},
  );
  const [refreshing, setRefreshing] = useState(false);
  const inFlightRef = useRef<Partial<Record<LogKey, boolean>>>({});
  const lastSyncRef = useRef<Partial<Record<string, number>>>({});

  // History panel — null while the overview is showing.
  const [historyKey, setHistoryKey] = useState<LogKey | null>(null);
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_HISTORY_FILTERS);
  // The panel's date window is the shared Ops range (inclusive IST days).
  const { from: rangeFrom, to: rangeTo, preset: rangePreset } = useOpsDateRange();
  const [filterOpen, setFilterOpen] = useState(false);
  // The panel's own rows for its date window — null while the first read runs.
  const [historyRows, setHistoryRows] = useState<any[] | null>(null);
  const historyReqRef = useRef(0);

  const [startSheet, setStartSheet] = useState<StartSheet>(null);
  const [editRow, setEditRow] = useState<any | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // The site is picked in the Ops header (app-wide); this screen only reads it.
  const userId = user?.user_id || user?.id;
  const { selectedSite } = useSites(userId);
  const siteCode = selectedSite?.site_code ?? null;
  const siteName =
    selectedSite?.site_name ?? selectedSite?.site_code ?? "Select Site";

  // Site switched (from the header): drop every cached bucket — they belong
  // to the old site — and close the history panel. Adjusted during render so
  // the old site's counts never paint under the new site.
  const [rowsSite, setRowsSite] = useState(siteCode);
  if (rowsSite !== siteCode) {
    setRowsSite(siteCode);
    setRowsByType({});
    setHistoryKey(null);
  }

  const todayLabel = useMemo(
    () =>
      formatIST(new Date(), {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
    [],
  );

  /**
   * Loads ONE log type: local cache first so the view paints immediately,
   * then a throttled background pull for just that type and a silent re-read.
   */
  const loadType = useCallback(
    async (key: LogKey, opts?: { force?: boolean }) => {
      if (!siteCode) return;
      if (inFlightRef.current[key]) return;
      inFlightRef.current[key] = true;

      const from = startOfDay(addDays(new Date(), -OVERVIEW_DAYS));
      const to = endOfDay(new Date());
      // Local reads take epoch ms (they derive the calendar day themselves);
      // the API maps fromDate/toDate onto scheduled_date_from/_to, which are
      // YYYY-MM-DD strings — sending ms there silently drops the filter.
      const range = { fromDate: from.getTime(), toDate: to.getTime() };
      const apiRange = {
        fromDate: istDateString(from),
        toDate: istDateString(to),
      };

      try {
        const local = await siteLogService
          .getLogsByType(siteCode, key, range)
          .catch(() => [] as any[]);
        setRowsByType((prev) => ({ ...prev, [key]: local }));

        // Background refresh — throttled per site+type unless forced.
        const cacheKey = `${siteCode}:${key}`;
        const now = Date.now();
        const last = lastSyncRef.current[cacheKey] ?? 0;
        const stale = opts?.force || now - last > 1000 * 60 * 5;
        if (!isConnected || !stale) return;

        if (key === "Chiller Logs") {
          // chiller_readings filters on created_at (epoch), not scheduled_date.
          await siteLogService.pullChillerReadings(siteCode, range);
        } else {
          await siteLogService.pullSiteLogs(siteCode, {
            ...apiRange,
            logName: key,
          });
        }
        lastSyncRef.current[cacheKey] = now;

        const fresh = await siteLogService
          .getLogsByType(siteCode, key, range)
          .catch(() => null);
        if (fresh) setRowsByType((prev) => ({ ...prev, [key]: fresh }));
      } catch (e) {
        loggerUtil.warn("Site logs load failed", {
          module: "SITE_LOGS_SCREEN",
          logName: key,
          error: e,
        });
      } finally {
        inFlightRef.current[key] = false;
      }
    },
    [siteCode, isConnected],
  );

  const loadAll = useCallback(
    (opts?: { force?: boolean }) =>
      Promise.all(LOG_TABS.map((t) => loadType(t.key, opts))),
    [loadType],
  );

  /**
   * Loads the history panel's window for one type: local first, then a
   * throttled pull for exactly that window. Stale responses (the filter or
   * type changed meanwhile) are dropped.
   */
  const loadHistory = useCallback(
    async (
      key: LogKey,
      range: { from: string; to: string },
      opts?: { force?: boolean },
    ) => {
      if (!siteCode) return;
      const req = ++historyReqRef.current;
      const localRange = {
        fromDate: localDayStartMs(range.from),
        toDate: localDayEndMs(range.to),
      };
      const read = () =>
        siteLogService
          .getLogsByType(siteCode, key, localRange)
          .catch(() => [] as any[]);

      try {
        const local = await read();
        if (req === historyReqRef.current) setHistoryRows(local);

        const cacheKey = `${siteCode}:${key}:${range.from}:${range.to}`;
        const now = Date.now();
        const last = lastSyncRef.current[cacheKey] ?? 0;
        const stale = opts?.force || now - last > 1000 * 60 * 5;
        if (!isConnected || !stale) return;

        if (key === "Chiller Logs") {
          await siteLogService.pullChillerReadings(siteCode, localRange);
        } else {
          await siteLogService.pullSiteLogs(siteCode, {
            fromDate: range.from,
            toDate: range.to,
            logName: key,
          });
        }
        lastSyncRef.current[cacheKey] = now;

        const fresh = await read();
        if (req === historyReqRef.current) setHistoryRows(fresh);
      } catch (e) {
        loggerUtil.warn("Site logs history load failed", {
          module: "SITE_LOGS_SCREEN",
          logName: key,
          error: e,
        });
      }
    },
    [siteCode, isConnected],
  );

  // Every type on mount and on site change.
  useEffect(() => {
    if (siteCode) void loadAll();
  }, [siteCode, loadAll]);

  // Focus / foreground / poll refresh — pulls stay throttled per type.
  useAutoSync(() => {
    if (!siteCode) return;
    void loadAll();
    if (historyKey) void loadHistory(historyKey, { from: rangeFrom, to: rangeTo });
  }, [siteCode, historyKey, rangeFrom, rangeTo]);

  // Coming back from an entry screen: re-read every bucket so the counts
  // reflect what was just submitted. useAutoSync's focus hook is throttled
  // (15s) and can skip a quick round-trip; local reads are cheap and the
  // network pulls behind them stay throttled per type.
  useFocusEffect(
    useCallback(() => {
      if (!siteCode) return;
      void loadAll();
      if (historyKey) void loadHistory(historyKey, { from: rangeFrom, to: rangeTo });
    }, [siteCode, historyKey, rangeFrom, rangeTo, loadAll, loadHistory]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // In the history panel only its own type + window needs the forced pull.
    if (historyKey)
      await loadHistory(historyKey, { from: rangeFrom, to: rangeTo }, { force: true });
    else await loadAll({ force: true });
    setRefreshing(false);
  }, [historyKey, rangeFrom, rangeTo, loadHistory, loadAll]);

  // ── Overview: today's counts per type ────────────────────────────────────
  const today = istTodayString();

  const overview = useMemo(
    () =>
      LOG_TABS.map((t) => {
        const rows = rowsByType[t.key];
        const todays = (rows ?? []).filter((r) => rowDay(r) === today);
        const logged = todays.filter(isCompleted).length;
        // Chiller has no scheduled rows — it scores against a fixed daily
        // target, with extra readings capped at it; pending is the shortfall.
        const target =
          t.key === "Chiller Logs" ? chillerTargetFor(siteCode) : null;
        const completed = target !== null ? Math.min(logged, target) : logged;
        const pending =
          target !== null ? target - completed : todays.length - logged;
        const total = target !== null ? target : todays.length;
        const shiftCounts = t.hasShift
          ? SHIFTS.map((sh) => {
              const shiftRows = todays.filter((r) => inShift(r, sh));
              const done = shiftRows.filter(isCompleted).length;
              return {
                label: `Shift ${sh}`,
                pending: shiftRows.length - done,
                completed: done,
              };
            })
          : undefined;
        const continuing = (rows ?? []).some(
          (r) => normaliseLogStatus(r?.status) === "Inprogress",
        );
        const sub =
          rows === undefined
            ? "Loading…"
            : target !== null
              ? `${completed} of ${target} readings today`
              : todays.length === 0
              ? "Nothing scheduled or logged today"
                : `${todays.length} entries today`;
        // Done for today: nothing left owed and something was logged. Never
        // for Chiller — the target is a scoring floor, not a cap, so operators
        // can keep adding readings past it and Start must stay available.
        const done =
          target === null && pending === 0 && completed > 0;
        return {
          tab: t,
          loaded: rows !== undefined,
          done,
          pending,
          completed,
          total,
          shiftCounts,
          continuing,
          sub: t.hasShift && todays.length > 0 ? `3 shifts · ${sub}` : sub,
        };
      }),
    [rowsByType, today, siteCode],
  );

  const anyLoaded = overview.some((o) => o.loaded);

  // ── History panel ────────────────────────────────────────────────────────
  const historyTab = historyKey ? tabFor(historyKey) : null;

  // The focus effect above loads the panel whenever its type or window changes.
  const openHistory = useCallback((key: LogKey) => {
    Haptics.selectionAsync().catch(() => {});
    setFilters(DEFAULT_HISTORY_FILTERS);
    setHistoryRows(null);
    setHistoryKey(key);
  }, []);

  const closeHistory = useCallback(() => {
    setHistoryKey(null);
    setFilterOpen(false);
  }, []);

  // Android back closes the panel before it leaves the tab.
  useEffect(() => {
    if (!historyKey) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setHistoryKey(null);
      return true;
    });
    return () => sub.remove();
  }, [historyKey]);

  const historyShift = historyTab?.hasShift ? filters.shift : "all";

  const shiftScopedRows = useMemo(() => {
    const rows = historyRows ?? [];
    if (historyShift === "all") return rows;
    return rows.filter((r) => inShift(r, historyShift));
  }, [historyRows, historyShift]);

  const visibleRows = useMemo(() => {
    if (filters.status === "pending")
      return shiftScopedRows.filter((r) => !isCompleted(r));
    if (filters.status === "completed")
      return shiftScopedRows.filter(isCompleted);
    return shiftScopedRows;
  }, [shiftScopedRows, filters.status]);

  /**
   * Top counters for the window (and shift). Site logs count their rows.
   * Chiller has no scheduled rows, so it scores against the daily target:
   * total = target × days elapsed in the window, completed = readings capped
   * per day, pending = the shortfall.
   */
  const historyCounts = useMemo(() => {
    if (historyKey === "Chiller Logs") {
      const target = chillerTargetFor(siteCode);
      // Days in the window up to today — future days owe nothing yet.
      const days: string[] = [];
      for (let d = rangeFrom; d <= rangeTo && d <= today; d = addDaysIso(d, 1)) {
        days.push(d);
      }
      const perDay: Record<string, number> = {};
      for (const r of shiftScopedRows) {
        if (!isCompleted(r)) continue;
        const day = rowDay(r);
        perDay[day] = (perDay[day] ?? 0) + 1;
      }
      const completed = days.reduce(
        (sum, day) => sum + Math.min(perDay[day] ?? 0, target),
        0,
      );
      const total = target * days.length;
      return { total, completed, pending: total - completed };
    }
    const completed = shiftScopedRows.filter(isCompleted).length;
    return {
      total: shiftScopedRows.length,
      completed,
      pending: shiftScopedRows.length - completed,
    };
  }, [historyKey, siteCode, rangeFrom, rangeTo, shiftScopedRows, today]);

  /** Temp & RH: pending/done per shift over the window (status-agnostic). */
  const historyShiftCounts = useMemo(() => {
    if (!historyTab?.hasShift) return null;
    const rows = historyRows ?? [];
    return SHIFTS.map((sh) => {
      const shiftRows = rows.filter((r) => inShift(r, sh));
      const done = shiftRows.filter(isCompleted).length;
      return {
        label: `Shift ${sh}`,
        pending: shiftRows.length - done,
        completed: done,
      };
    });
  }, [historyTab, historyRows]);

  // The Ops header (where the range is set) is covered by the panel, so the
  // panel names the window it shows: "This month · 01–31 Oct · 12 entries".
  const historyLabel = useMemo(() => {
    if (!historyKey) return "";
    const n = visibleRows.length;
    const range = formatOpsRange(rangeFrom, rangeTo);
    const windowLabel =
      rangePreset === "custom" ? range : `${PRESET_LABEL[rangePreset]} · ${range}`;
    return `${windowLabel} · ${n} ${n === 1 ? "entry" : "entries"}`;
  }, [historyKey, rangeFrom, rangeTo, rangePreset, visibleRows.length]);

  const historyLoading = historyKey !== null && historyRows === null;

  // ── Start flow ───────────────────────────────────────────────────────────
  const onStart = useCallback(
    (key: LogKey) => {
      if (!siteCode) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      void siteLogService
        .prefetchPendingForCategory(siteCode, key)
        .then(() => loadType(key, { force: true }))
        .catch(() => {});

      setStartSheet({ key, step: tabFor(key).hasShift ? "shift" : "confirm" });
    },
    [siteCode, loadType],
  );

  const confirmStart = useCallback(() => {
    if (!startSheet || !siteCode) return;
    const tab = tabFor(startSheet.key);
    setStartSheet(null);
    setRouteParams(tab.route, {
      siteCode,
      ...(tab.hasShift && startSheet.shift ? { shift: startSheet.shift } : {}),
    });
    router.push(tab.route as never);
  }, [startSheet, siteCode]);

  /** Today's Temp & RH state per shift, for the shift sheet's tags. */
  const shiftTags = useMemo(() => {
    const now = currentIstShift();
    const todays = (rowsByType["Temp RH"] ?? []).filter(
      (r) => rowDay(r) === today,
    );
    const tags = {} as Record<ShiftKey, { kind: "logged" | "due" | "upcoming"; pending: number }>;
    for (const sh of SHIFTS) {
      const rows = todays.filter((r) => inShift(r, sh));
      const pending = rows.filter((r) => !isCompleted(r)).length;
      const upcoming = SHIFTS.indexOf(sh) > SHIFTS.indexOf(now);
      tags[sh] = {
        kind: upcoming ? "upcoming" : pending === 0 && rows.length > 0 ? "logged" : "due",
        pending,
      };
    }
    return tags;
  }, [rowsByType, today]);

  // ── Editing a history row ────────────────────────────────────────────────
  const saveEdit = useCallback(
    async (patch: Record<string, any>) => {
      if (!editRow?.id || !historyKey) return;
      const key = historyKey;
      setSavingEdit(true);
      try {
        await siteLogService.updateSiteLog(String(editRow.id), patch);
        // Reflect the change locally straight away, then re-read from cache.
        setRowsByType((prev) => {
          const rows = prev[key];
          if (!rows) return prev;
          return {
            ...prev,
            [key]: rows.map((r) =>
              r.id === editRow.id ? { ...r, ...patch } : r,
            ),
          };
        });
        setHistoryRows((rows) =>
          rows
            ? rows.map((r) => (r.id === editRow.id ? { ...r, ...patch } : r))
            : rows,
        );
        setEditRow(null);
        void loadType(key, { force: true });
        void loadHistory(key, { from: rangeFrom, to: rangeTo }, { force: true });
      } catch (e) {
        loggerUtil.warn("Site log update failed", {
          module: "SITE_LOGS_SCREEN",
          error: e,
        });
      } finally {
        setSavingEdit(false);
      }
    },
    [editRow, historyKey, loadType, loadHistory, rangeFrom, rangeTo],
  );

  /**
   * Opens one existing record in its entry screen. The entry screens key edit
   * mode off `editId` — passing anything else (or nothing) drops them into a
   * fresh entry for today, which is not what tapping a history row means. The
   * shift comes from the record itself, not the chip that happens to be set.
   */
  const openEntry = useCallback(
    (row: any) => {
      if (!siteCode || !row?.id || !historyTab) return;
      const rowShift = labelToUiShift(row.shift_label) ?? currentIstShift();
      setRouteParams(historyTab.route, {
        siteCode,
        editId: String(row.id),
        ...(historyTab.hasShift ? { shift: rowShift } : {}),
        ...(historyTab.key === "Chiller Logs" && row.chiller_id
          ? { chillerId: String(row.chiller_id) }
          : {}),
      });
      router.push(historyTab.route as never);
    },
    [siteCode, historyTab],
  );

  const openRow = useCallback(
    (row: any) => {
      if (!row?.id) return;
      // Chiller readings are a full form of their own — the sheet covers the
      // reading-style logs only.
      if (historyKey !== "Chiller Logs") {
        setEditRow(row);
        return;
      }
      openEntry(row);
    },
    [historyKey, openEntry],
  );

  // The history panel draws full-screen over the tab, like the artboard's
  // detail views — the floating bar steps aside while it is open.
  useHideTabBar(historyKey !== null);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={t.muted}
      colors={[t.accent]}
    />
  );

  const startTab = startSheet ? tabFor(startSheet.key) : null;
  const startContinuing = startSheet
    ? (rowsByType[startSheet.key] ?? []).some(
        (r) => normaliseLogStatus(r?.status) === "Inprogress",
      )
    : false;
  const startShiftLabel = startSheet?.shift
    ? SHIFT_OPTIONS.find((o) => o.value === startSheet.shift)?.label
    : null;

  const totalPending = overview.reduce((sum, o) => sum + (o.loaded ? o.pending : 0), 0);
  const canRefresh = isConnected && !!siteCode;

  return (
    <JoPage>
      {/* Ops sub-tabs: Tickets · PM · Site Logs · Incidents · Assets */}
      <OpsTabs />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: clearance }}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {/* Caption — the cards below are TODAY's to-do (the Ops header's
            date range only drives the history panel). Refresh stays here. */}
        <View style={s.captionRow}>
          <View style={s.captionText}>
            <Text style={[f.t(13, 600), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
              Today · {todayLabel}
            </Text>
            {siteCode && anyLoaded ? (
              <NoticePill
                tone={totalPending > 0 ? "bad" : "ok"}
                text={totalPending > 0 ? `${totalPending} pending` : "Nothing pending"}
                style={s.captionPill}
              />
            ) : null}
          </View>
          <View style={{ opacity: canRefresh ? 1 : 0.45 }}>
            <IconButton
              icon="bx-refresh"
              size={38}
              iconSize={19}
              label={canRefresh ? "Refresh logs" : "Refresh unavailable offline"}
              onPress={canRefresh ? () => void onRefresh() : undefined}
            />
          </View>
        </View>

        {!siteCode ? (
          <View style={{ marginTop: 16 }}>
            <EmptyState
              icon="bx-buildings"
              title="Select a site"
              sub="Pick a site from the header above to see today's logs."
            />
          </View>
        ) : (
          <>
            {!canEdit || !isConnected ? (
              <View style={{ gap: 8, marginTop: 10, marginLeft: 4 }}>
                {!canEdit ? (
                  <NoticePill
                    tone="warn"
                    icon="bx-lock-alt"
                    text="View only — start your day to log readings"
                  />
                ) : null}
                {!isConnected ? (
                  <NoticePill tone="mute" icon="bx-wifi-off" text="Offline — showing logs saved on this device" />
                ) : null}
              </View>
            ) : null}

            <View style={{ gap: 10, marginTop: 10 }}>
              {!anyLoaded
                ? LOG_TABS.map((tab) => (
                    <Shimmer key={tab.key} height={tab.hasShift ? 190 : 140} radius={26} />
                  ))
                : overview.map((o) => (
                    <LogTypeCard
                      key={o.tab.key}
                      logName={o.tab.key}
                      label={o.tab.label}
                      sub={o.sub}
                      pending={o.pending}
                      completed={o.completed}
                      total={o.total}
                      shiftCounts={o.shiftCounts}
                      continuing={o.continuing}
                      done={o.done}
                      canStart={canEdit}
                      onStart={() => onStart(o.tab.key)}
                      onHistory={() => openHistory(o.tab.key)}
                    />
                  ))}
            </View>
            {anyLoaded ? <PendingLegend /> : null}
          </>
        )}
      </ScrollView>

      {/* History panel — slides over the overview */}
      {historyTab ? (
        <Animated.View
          entering={SlideInRight.duration(240).easing(Easing.bezier(0.4, 0, 0.2, 1))}
          exiting={SlideOutRight.duration(200)}
          style={[s.panel, { paddingTop: insets.top }]}
        >
          <View style={s.panelHeader}>
            <IconButton icon="bx-chevron-left" iconSize={24} label="Back to site logs" onPress={closeHistory} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[f.t(15, 600), { color: t.ink }]} numberOfLines={1}>
                {historyTab.label} log
              </Text>
              {/* Read-only: the range is set in the Ops header, which this
                  full-screen panel covers. */}
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}
                accessible
                accessibilityLabel={`Showing ${historyLabel}`}
              >
                <Bx name="bx-calendar" size={12} color={t.muted} />
                <Text style={[f.t(11.5), { color: t.muted, flexShrink: 1 }]} numberOfLines={1}>
                  {historyLabel}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setFilterOpen(true)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Filter history"
              accessibilityState={{ selected: filtersActive(filters) }}
              style={[s.roundBtn, filtersActive(filters) && { backgroundColor: t.selBg, borderColor: t.selBg }]}
            >
              {filtersActive(filters) ? <GlossFill color={t.selBg} fg={t.selFg} radius={22} bleed={1} /> : null}
              <Bx name="bx-slider-alt" size={19} color={filtersActive(filters) ? t.selFg : t.ink} />
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: 16, paddingTop: 4, gap: 8 }}>
            <HistoryCounters
              total={historyCounts.total}
              pending={historyCounts.pending}
              completed={historyCounts.completed}
              totalLabel={historyKey === "Chiller Logs" ? "Target" : "Total"}
              completedLabel={historyKey === "Chiller Logs" ? "Logged" : "Completed"}
              status={filters.status}
              onStatus={(status) => setFilters((fl) => ({ ...fl, status }))}
            />
            {historyShiftCounts ? (
              <ShiftCells
                counts={historyShiftCounts}
                showCounts
                selected={historyShift === "all" ? null : `Shift ${historyShift}`}
                onSelect={(label) => {
                  const sh = label.slice(-1) as ShiftKey;
                  setFilters((fl) => ({
                    ...fl,
                    shift: fl.shift === sh ? "all" : sh,
                  }));
                }}
              />
            ) : null}
          </View>

          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: insets.bottom + 24,
            }}
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
          >
            {historyLoading ? (
              <View style={{ gap: 8 }}>
                {[1, 2, 3, 4].map((i) => (
                  <Shimmer key={i} height={124} radius={22} />
                ))}
              </View>
            ) : visibleRows.length === 0 ? (
              <EmptyState
                icon="bx-history"
                title={`No ${historyTab.label.toLowerCase()} entries`}
                sub={
                  filtersActive(filters)
                    ? "Nothing matches these filters in this window."
                    : "Nothing was scheduled or logged in this window."
                }
                action={
                  filtersActive(filters)
                    ? {
                        label: "Reset filters",
                        onPress: () => setFilters(DEFAULT_HISTORY_FILTERS),
                      }
                    : undefined
                }
              />
            ) : (
              visibleRows.map((row) => (
                <LogHistoryCard
                  key={row.id}
                  item={row}
                  logName={historyTab.key}
                  onPress={() => openRow(row)}
                />
              ))
            )}
          </ScrollView>

          {refreshing ? null : historyLoading ? (
            <View style={{ position: "absolute", top: insets.top + 22, right: 76 }}>
              <ActivityIndicator size="small" color={t.muted} />
            </View>
          ) : null}
        </Animated.View>
      ) : null}

      {filterOpen && historyTab ? (
        <LogHistoryFilterSheet
          value={filters}
          hasShift={historyTab.hasShift}
          onClose={() => setFilterOpen(false)}
          onApply={(next) => {
            setFilterOpen(false);
            setFilters(next);
          }}
        />
      ) : null}

      {editRow && historyKey ? (
        <LogEditSheet
          row={editRow}
          logName={historyKey}
          saving={savingEdit}
          onClose={() => setEditRow(null)}
          onSave={saveEdit}
        />
      ) : null}

      {/* Start flow — shift choice (Temp & RH), then confirm */}
      <JoSheet
        visible={!!(startSheet && startTab)}
        onClose={() => setStartSheet(null)}
        title={startSheet?.step === "shift" ? "Which shift?" : undefined}
        subtitle={
          startSheet?.step === "shift"
            ? "Choose the shift you're logging Temperature & RH for."
            : undefined
        }
      >
        {startSheet && startTab ? (
          startSheet.step === "shift" ? (
            <View style={{ gap: 6, marginTop: 16 }}>
              {SHIFT_OPTIONS.map((sh) => {
                const tag = shiftTags[sh.value];
                const tone =
                  tag.kind === "logged"
                    ? { tone: "ok" as const, text: "Logged" }
                    : tag.kind === "due"
                      ? {
                          tone: "bad" as const,
                          text: tag.pending > 0 ? `${tag.pending > 99 ? "99+" : tag.pending} due` : "Due",
                        }
                      : { tone: "mute" as const, text: "Upcoming" };
                return (
                  <TouchableOpacity
                    key={sh.value}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setStartSheet({
                        key: startSheet.key,
                        step: "confirm",
                        shift: sh.value,
                      });
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`${sh.label}, ${sh.window}, ${tone.text}`}
                    style={s.shiftRow}
                  >
                    <View style={[s.shiftIcon, { backgroundColor: t[`${tone.tone}Tint` as const] }]}>
                      <Bx name={sh.icon} size={18} color={t[tone.tone]} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[f.t(14.5, 600), { color: t.ink }]} numberOfLines={1}>
                        {sh.label}
                      </Text>
                      <Text style={[f.t(12), { color: t.muted, marginTop: 2 }]}>{sh.window}</Text>
                    </View>
                    <StatusPill label={tone.text} tone={tone.tone} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View>
              <View style={s.confirmIcon}>
                <Bx name="bx-play-circle" size={24} color={t.accentInk} />
              </View>
              <Text style={[f.d(22, -0.02), { color: t.ink }]}>
                {startContinuing ? "Continue this log?" : `Start ${startTab.label} log?`}
              </Text>
              <Text style={[f.t(13), { color: t.muted, lineHeight: 19, marginTop: 6 }]}>
                {startShiftLabel ? `${startShiftLabel} · ` : ""}
                A new entry will open for {siteName} for today,{" "}
                {formatIST(new Date(), { day: "numeric", month: "short" })}.
                Readings save to the log sheet once complete.
              </Text>
              <View style={{ flexDirection: "row", gap: 9, marginTop: 20 }}>
                <SecondaryButton label="Cancel" onPress={() => setStartSheet(null)} style={{ paddingHorizontal: 22 }} />
                <PrimaryButton
                  label={startContinuing ? "Continue" : "Start now"}
                  icon="bx-check"
                  height={52}
                  onPress={confirmStart}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          )
        ) : null}
      </JoSheet>

    </JoPage>
  );
}

const useStyles = makeJoStyles((t) => ({
  captionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: 4,
  },
  captionText: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  captionPill: { alignSelf: "center", minHeight: 26, paddingVertical: 3, paddingHorizontal: 10 },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.input,
    borderWidth: 1,
    borderColor: t.lineMid,
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    backgroundColor: t.page,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  shiftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: t.line,
  },
  shiftIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.accentTint,
    marginBottom: 14,
  },
}));
