import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetView,
} from "@expo/ui/community/bottom-sheet";
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
import {
  Check,
  ChevronLeft,
  SlidersHorizontal,
  CloudSun,
  MapPin,
  Moon,
  PlayCircle,
  Sun,
} from "lucide-react-native";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useSites } from "@/hooks/useSites";
import { setRouteParams } from "@/utils/routeParams";
import { uiShiftToLabel } from "@/services/LogActivityMasterService";
import { startOfDay, endOfDay, addDays } from "date-fns";
import loggerUtil from "@/utils/logger";
import Skeleton from "@/components/Skeleton";
import * as Haptics from "expo-haptics";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { ModuleListHeader } from "@/components/shared/ListChrome";
import {
  LogHistoryCard,
  normaliseLogStatus,
} from "@/components/sitelogs/LogHistoryCard";
import { LogEditSheet } from "@/components/sitelogs/LogEditSheet";
import {
  HistoryCounters,
  LogTypeCard,
  ShiftCountStrip,
  soRadius,
} from "@/components/sitelogs/LogsUI";
import {
  DEFAULT_HISTORY_FILTERS,
  LogHistoryFilterSheet,
  filtersActive,
  rangeLabel,
  type HistoryFilters,
  type HistoryRange,
} from "@/components/sitelogs/LogHistoryFilterSheet";

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
 * history panel loads its own window from its date filter.
 */
const OVERVIEW_DAYS = 7;

const SHIFTS = ["A", "B", "C"] as const;
type ShiftKey = (typeof SHIFTS)[number];

const SHIFT_OPTIONS = [
  { value: "A", label: "Shift A · Morning", window: "06:00 – 14:00", icon: Sun },
  { value: "B", label: "Shift B · Evening", window: "14:00 – 22:00", icon: CloudSun },
  { value: "C", label: "Shift C · Night", window: "22:00 – 06:00", icon: Moon },
] as const;

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
  const ds = useDs();
  const sheetStyles = useSheetStyles();
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
  const [filterOpen, setFilterOpen] = useState(false);
  // The panel's own rows for its date window — null while the first read runs.
  const [historyRows, setHistoryRows] = useState<any[] | null>(null);
  const historyReqRef = useRef(0);

  const [startSheet, setStartSheet] = useState<StartSheet>(null);
  const [editRow, setEditRow] = useState<any | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [sitePickerVisible, setSitePickerVisible] = useState(false);

  const userId = user?.user_id || user?.id;
  const { sites: availableSites, selectedSite, selectSite } = useSites(userId);
  const siteCode = selectedSite?.site_code ?? null;
  const siteName =
    selectedSite?.site_name ?? selectedSite?.site_code ?? "Select Site";

  const todayLabel = useMemo(
    () =>
      formatIST(new Date(), {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
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
    async (key: LogKey, range: HistoryRange, opts?: { force?: boolean }) => {
      if (!siteCode) return;
      const req = ++historyReqRef.current;
      const from = startOfDay(range.from);
      const to = endOfDay(range.to);
      const localRange = { fromDate: from.getTime(), toDate: to.getTime() };
      const read = () =>
        siteLogService
          .getLogsByType(siteCode, key, localRange)
          .catch(() => [] as any[]);

      try {
        const local = await read();
        if (req === historyReqRef.current) setHistoryRows(local);

        const cacheKey = `${siteCode}:${key}:${from.getTime()}:${to.getTime()}`;
        const now = Date.now();
        const last = lastSyncRef.current[cacheKey] ?? 0;
        const stale = opts?.force || now - last > 1000 * 60 * 5;
        if (!isConnected || !stale) return;

        if (key === "Chiller Logs") {
          await siteLogService.pullChillerReadings(siteCode, localRange);
        } else {
          await siteLogService.pullSiteLogs(siteCode, {
            fromDate: istDateString(from),
            toDate: istDateString(to),
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
    if (historyKey) void loadHistory(historyKey, filters.range);
  }, [siteCode, historyKey, filters.range]);

  // Coming back from an entry screen: re-read every bucket so the counts
  // reflect what was just submitted. useAutoSync's focus hook is throttled
  // (15s) and can skip a quick round-trip; local reads are cheap and the
  // network pulls behind them stay throttled per type.
  useFocusEffect(
    useCallback(() => {
      if (!siteCode) return;
      void loadAll();
      if (historyKey) void loadHistory(historyKey, filters.range);
    }, [siteCode, historyKey, filters.range, loadAll, loadHistory]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // In the history panel only its own type + window needs the forced pull.
    if (historyKey) await loadHistory(historyKey, filters.range, { force: true });
    else await loadAll({ force: true });
    setRefreshing(false);
  }, [historyKey, filters.range, loadHistory, loadAll]);

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
    setFilters(DEFAULT_HISTORY_FILTERS());
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
      for (
        let d = startOfDay(filters.range.from);
        d.getTime() <= filters.range.to.getTime();
        d = addDays(d, 1)
      ) {
        const noon = new Date(d);
        noon.setHours(12);
        const ymd = istDateString(noon);
        if (ymd > today) break;
        days.push(ymd);
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
  }, [historyKey, siteCode, filters.range, shiftScopedRows, today]);

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

  const historyLabel = useMemo(() => {
    if (!historyKey) return "";
    const n = visibleRows.length;
    return `${rangeLabel(filters.range)} · ${n} ${n === 1 ? "entry" : "entries"}`;
  }, [historyKey, filters.range, visibleRows.length]);

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
        void loadHistory(key, filters.range, { force: true });
      } catch (e) {
        loggerUtil.warn("Site log update failed", {
          module: "SITE_LOGS_SCREEN",
          error: e,
        });
      } finally {
        setSavingEdit(false);
      }
    },
    [editRow, historyKey, loadType, loadHistory, filters.range],
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

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={ds.carbon[500]}
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

  return (
    <View style={{ flex: 1, backgroundColor: ds.pageBg }}>
      <ModuleListHeader
        topInset={insets.top}
        eyebrow="SITE LOGS"
        siteName={siteName}
        dateLabel={todayLabel}
        onPressSite={() => setSitePickerVisible(true)}
        onRefresh={() => {
          if (!isConnected || !siteCode) return;
          onRefresh();
        }}
        refreshDisabled={!isConnected || !siteCode}
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 22,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {!siteCode ? (
          <View style={{ paddingVertical: 28, alignItems: "center" }}>
            <Text style={{ fontSize: 12.5, color: ds.carbon[400] }}>
              Select a site to see its logs
            </Text>
          </View>
        ) : !anyLoaded ? (
          LOG_TABS.map((t) => (
            <Skeleton
              key={t.key}
              width="100%"
              height={t.hasShift ? 136 : 104}
              borderRadius={soRadius.card}
              style={{ marginBottom: 9 }}
            />
          ))
        ) : (
          overview.map((o) => (
            <LogTypeCard
              key={o.tab.key}
              logName={o.tab.key}
              label={o.tab.label}
              sub={o.sub}
              pending={o.pending}
              completed={o.completed}
              shiftCounts={o.shiftCounts}
              continuing={o.continuing}
              done={o.done}
              canStart={canEdit}
              onStart={() => onStart(o.tab.key)}
              onHistory={() => openHistory(o.tab.key)}
            />
          ))
        )}
      </ScrollView>

      {/* History panel — slides over the overview */}
      {historyTab ? (
        <Animated.View
          entering={SlideInRight.duration(240).easing(Easing.bezier(0.4, 0, 0.2, 1))}
          exiting={SlideOutRight.duration(200)}
          style={[
            sheetStyles.panel,
            { backgroundColor: ds.pageBg, paddingTop: insets.top + 2 },
          ]}
        >
          <View style={sheetStyles.panelHeader}>
            <TouchableOpacity
              onPress={closeHistory}
              activeOpacity={0.8}
              hitSlop={6}
              style={sheetStyles.backTile}
              accessibilityRole="button"
              accessibilityLabel="Back to site logs"
            >
              <ChevronLeft size={20} color={ds.carbon[100]} strokeWidth={2.2} />
            </TouchableOpacity>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={sheetStyles.panelTitle} numberOfLines={1}>
                {historyTab.label} log
              </Text>
              <Text style={sheetStyles.panelSub} numberOfLines={1}>
                {historyLabel}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setFilterOpen(true)}
              activeOpacity={0.8}
              hitSlop={6}
              style={[
                sheetStyles.backTile,
                filtersActive(filters) && {
                  backgroundColor: ds.controlOn,
                  borderColor: ds.controlOn,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Filter history"
              accessibilityState={{ selected: filtersActive(filters) }}
            >
              <SlidersHorizontal
                size={17}
                color={filtersActive(filters) ? ds.onControl : ds.carbon[100]}
                strokeWidth={2}
              />
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 8 }}>
            <HistoryCounters
              total={historyCounts.total}
              pending={historyCounts.pending}
              completed={historyCounts.completed}
              totalLabel={historyKey === "Chiller Logs" ? "Target" : "Total"}
              completedLabel={historyKey === "Chiller Logs" ? "Logged" : "Completed"}
              status={filters.status}
              onStatus={(status) => setFilters((f) => ({ ...f, status }))}
            />
            {historyShiftCounts ? (
              <ShiftCountStrip
                counts={historyShiftCounts}
                selected={historyShift === "all" ? null : `Shift ${historyShift}`}
                onSelect={(label) => {
                  const sh = label.slice(-1) as ShiftKey;
                  setFilters((f) => ({
                    ...f,
                    shift: f.shift === sh ? "all" : sh,
                  }));
                }}
              />
            ) : null}
          </View>

          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 24,
            }}
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
          >
            {historyLoading ? (
              [1, 2, 3, 4].map((i) => (
                <Skeleton
                  key={i}
                  width="100%"
                  height={92}
                  borderRadius={soRadius.card}
                  style={{ marginBottom: 7 }}
                />
              ))
            ) : visibleRows.length === 0 ? (
              <View style={{ paddingVertical: 28, alignItems: "center" }}>
                <Text style={{ fontSize: 12.5, color: ds.carbon[400] }}>
                  No {historyTab.label.toLowerCase()} entries in this window
                </Text>
              </View>
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
            if (next.range !== filters.range) setHistoryRows(null);
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
      {startSheet && startTab ? (
        <BottomSheet
          key={startSheet.step}
          enableDynamicSizing
          enablePanDownToClose
          onClose={() => setStartSheet(null)}
          backgroundStyle={{ backgroundColor: ds.white }}
        >
          <BottomSheetView
            style={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: 30 }}
          >
            {startSheet.step === "shift" ? (
              <>
                <Text style={sheetStyles.heading}>Which shift?</Text>
                <Text style={sheetStyles.sub}>
                  Choose the shift you&apos;re logging Temperature &amp; RH for.
                </Text>

                <View style={{ gap: 8 }}>
                  {SHIFT_OPTIONS.map((sh) => {
                    const tag = shiftTags[sh.value];
                    const Icon = sh.icon;
                    const tone =
                      tag.kind === "logged"
                        ? { tint: ds.sky[900], fg: ds.sky[100], text: "Logged" }
                        : tag.kind === "due"
                          ? {
                              tint: ds.flame[1000],
                              fg: ds.flame[100],
                              text: tag.pending > 0 ? `${tag.pending > 99 ? "99+" : tag.pending} due` : "Due",
                            }
                          : { tint: ds.carbon[1000], fg: ds.carbon[500], text: "Upcoming" };
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
                        activeOpacity={0.85}
                        style={sheetStyles.shiftRow}
                      >
                        <View
                          style={[
                            sheetStyles.shiftIcon,
                            { backgroundColor: tone.tint },
                          ]}
                        >
                          <Icon size={17} color={tone.fg} strokeWidth={2.1} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={sheetStyles.shiftLabel}>{sh.label}</Text>
                          <Text style={sheetStyles.shiftWindow}>{sh.window}</Text>
                        </View>
                        <View
                          style={[sheetStyles.tag, { backgroundColor: tone.tint }]}
                        >
                          <Text style={[sheetStyles.tagText, { color: tone.fg }]}>
                            {tone.text}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                <View style={sheetStyles.confirmIcon}>
                  <PlayCircle size={24} color={ds.flame[100]} strokeWidth={2} />
                </View>
                <Text style={sheetStyles.confirmTitle}>
                  {startContinuing
                    ? "Continue this log?"
                    : `Start ${startTab.label} log?`}
                </Text>
                <Text style={sheetStyles.confirmBody}>
                  {startShiftLabel ? `${startShiftLabel} · ` : ""}
                  A new entry will open for {siteName} for today,{" "}
                  {formatIST(new Date(), { day: "numeric", month: "short" })}.
                  Readings save to the log sheet once complete.
                </Text>
                <View style={{ flexDirection: "row", gap: 9 }}>
                  <TouchableOpacity
                    onPress={() => setStartSheet(null)}
                    activeOpacity={0.85}
                    style={sheetStyles.cancelBtn}
                    accessibilityRole="button"
                  >
                    <Text style={sheetStyles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={confirmStart}
                    activeOpacity={0.85}
                    style={sheetStyles.primaryBtn}
                    accessibilityRole="button"
                  >
                    <Check size={17} color={ds.onControl} strokeWidth={2.4} />
                    <Text style={sheetStyles.primaryText}>
                      {startContinuing ? "Continue" : "Start now"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </BottomSheetView>
        </BottomSheet>
      ) : null}

      {/* Site picker — native sheet (SwiftUI / Material3) */}
      {sitePickerVisible ? (
        <BottomSheet
          snapPoints={["55%"]}
          enablePanDownToClose
          onClose={() => setSitePickerVisible(false)}
          backgroundStyle={{ backgroundColor: ds.white }}
        >
          <BottomSheetView style={{ paddingHorizontal: 22, paddingTop: 6 }}>
            <Text style={sheetStyles.title}>Switch site</Text>
          </BottomSheetView>
          <BottomSheetScrollView
            contentContainerStyle={{
              paddingHorizontal: 22,
              paddingBottom: 30,
            }}
          >
            {availableSites.map((s2) => {
              const on = s2.site_code === siteCode;
              return (
                <TouchableOpacity
                  key={s2.site_code}
                  onPress={() => {
                    selectSite(s2);
                    setSitePickerVisible(false);
                    // Drop every cached bucket — they belong to the old site.
                    setRowsByType({});
                    setHistoryKey(null);
                  }}
                  activeOpacity={0.85}
                  style={[
                    sheetStyles.row,
                    { backgroundColor: on ? ds.controlOn : ds.pageBg },
                  ]}
                >
                  <MapPin
                    size={15}
                    color={on ? ds.onControl : ds.carbon[500]}
                    strokeWidth={2}
                  />
                  <Text
                    style={[
                      sheetStyles.rowLabel,
                      { color: on ? ds.onControl : ds.carbon[100] },
                    ]}
                  >
                    {s2.site_name || s2.site_code}
                  </Text>
                  {on ? <Check size={16} color={ds.onChrome} /> : null}
                </TouchableOpacity>
              );
            })}
          </BottomSheetScrollView>
        </BottomSheet>
      ) : null}

      {refreshing ? null : historyLoading ? (
        <View style={{ position: "absolute", top: insets.top + 20, right: 22 }}>
          <ActivityIndicator size="small" color={ds.carbon[500]} />
        </View>
      ) : null}
    </View>
  );
}

/* Sheet + panel content styling only — the native sheets' own chrome
   (grabber, corner radius, scrim, swipe-to-dismiss) is not ours to draw. */
const useSheetStyles = makeThemedStyles((ds) => ({
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: ds.carbon[100],
    marginBottom: 12,
  },
  heading: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.36,
    color: ds.carbon[100],
    marginBottom: 4,
  },
  sub: { fontSize: 12.5, color: ds.carbon[500], marginBottom: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: soRadius.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: "600" },
  shiftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: soRadius.sm,
    borderWidth: 1.5,
    borderColor: ds.carbon[900],
    backgroundColor: ds.white,
  },
  shiftIcon: {
    width: 34,
    height: 34,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
  },
  shiftLabel: { fontSize: 14, fontWeight: "600", color: ds.carbon[100] },
  shiftWindow: { fontSize: 11, color: ds.carbon[500] },
  tag: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 8.5,
    fontWeight: "600",
    letterSpacing: 0.68,
    textTransform: "uppercase",
  },

  confirmIcon: {
    width: 46,
    height: 46,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ds.flame[1000],
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
    letterSpacing: 0.36,
    color: ds.carbon[100],
    marginBottom: 6,
  },
  confirmBody: {
    fontSize: 12.5,
    lineHeight: 19,
    color: ds.carbon[500],
    marginBottom: 20,
  },
  cancelBtn: {
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: soRadius.sm,
    borderWidth: 1,
    borderColor: ds.carbon[800],
    backgroundColor: ds.white,
  },
  cancelText: { fontSize: 14, fontWeight: "500", color: ds.carbon[400] },
  primaryBtn: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: soRadius.sm,
    backgroundColor: ds.controlOn,
  },
  primaryText: {
    fontSize: 14.5,
    fontWeight: "600",
    letterSpacing: 0.15,
    color: ds.onControl,
  },

  panel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6,
  },
  backTile: {
    width: 36,
    height: 36,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ds.white,
    borderWidth: 1,
    borderColor: ds.carbon[900],
  },
  panelTitle: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "700",
    letterSpacing: 0.34,
    color: ds.carbon[100],
  },
  panelSub: { fontSize: 11.5, color: ds.carbon[500], marginTop: 3 },
}));
