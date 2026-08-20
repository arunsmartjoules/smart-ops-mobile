import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetView,
} from "@expo/ui/community/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated from "react-native-reanimated";
import { useAuth } from "@/contexts/AuthContext";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import { useAutoSync } from "@/hooks/useAutoSync";
import siteLogService from "@/services/SiteLogService";
import { SiteConfigService } from "@/services/SiteConfigService";
import { istTodayString, istDateString, formatIST } from "@/utils/istDate";
import { Check, Clock, MapPin, Plus } from "lucide-react-native";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useSites } from "@/hooks/useSites";
import { setRouteParams } from "@/utils/routeParams";
import { uiShiftToLabel } from "@/services/LogActivityMasterService";
import { startOfDay, endOfDay, addDays } from "date-fns";
import loggerUtil from "@/utils/logger";
import Skeleton from "@/components/Skeleton";
import * as Haptics from "expo-haptics";
import { ds } from "@/constants/ds";
import {
  ModuleListHeader,
  useListSlide,
  type StatusChip,
} from "@/components/shared/ListChrome";
import { LogHistoryCard } from "@/components/sitelogs/LogHistoryCard";
import { LogEditSheet } from "@/components/sitelogs/LogEditSheet";
import {
  HistoryHeading,
  LogFab,
  LogFilterPopover,
  LogSummaryCards,
  ShiftChips,
  soRadius,
  type LogStatusFilter,
} from "@/components/sitelogs/LogsUI";

/** Inverse of uiShiftToLabel: "1/3" → "A". */
const labelToUiShift = (label?: string | null): "A" | "B" | "C" | null => {
  const s = String(label ?? "").trim();
  if (s === "1/3") return "A";
  if (s === "2/3") return "B";
  if (s === "3/3") return "C";
  return null;
};

/** Tab order matches the design; `logName` is the value the services expect. */
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

/** History window — today back one week, so the list has real history in it. */
const HISTORY_DAYS = 7;

const SHIFT_OPTIONS = [
  { value: "A", label: "Shift A · Morning", window: "06:00 – 14:00" },
  { value: "B", label: "Shift B · Evening", window: "14:00 – 22:00" },
  { value: "C", label: "Shift C · Night", window: "22:00 – 06:00" },
] as const;

const isCompleted = (row: any) => {
  const s = String(row?.status ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  return s === "completed" || s === "";
};

export default function SiteLogs() {
  const { user } = useAuth();
  const { canEdit } = useAttendanceGate();
  const { isConnected } = useNetworkStatus();
  const insets = useSafeAreaInsets();

  const [activeKey, setActiveKey] = useState<LogKey>("Temp RH");
  const [statusFilter, setStatusFilter] = useState<LogStatusFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [shift, setShift] = useState("A");
  const [slide, setSlide] = useState({ seq: 0, dir: 1 });
  const listSlideStyle = useListSlide(slide.seq, slide.dir);

  // One bucket per log type. A type that has never been opened has no entry
  // here and no request has been made for it.
  const [rowsByType, setRowsByType] = useState<Partial<Record<LogKey, any[]>>>(
    {},
  );
  const [loadingType, setLoadingType] = useState<LogKey | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlightRef = useRef<Partial<Record<LogKey, boolean>>>({});
  const lastSyncRef = useRef<Partial<Record<string, number>>>({});

  const [editRow, setEditRow] = useState<any | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [sitePickerVisible, setSitePickerVisible] = useState(false);
  const [shiftModalVisible, setShiftModalVisible] = useState(false);
  const [shiftCounts, setShiftCounts] = useState<Record<string, number>>({
    A: 0,
    B: 0,
    C: 0,
  });

  const userId = user?.user_id || user?.id;
  const { sites: availableSites, selectedSite, selectSite } = useSites(userId);
  const siteCode = selectedSite?.site_code ?? null;
  const siteName =
    selectedSite?.site_name ?? selectedSite?.site_code ?? "Select Site";

  const activeTab = LOG_TABS.find((t) => t.key === activeKey)!;
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
   * Loads ONE log type: local cache first so the list paints immediately, then
   * a background pull for just that type and a silent re-read. Nothing is
   * fetched for a tab the operator hasn't opened.
   */
  const loadType = useCallback(
    async (key: LogKey, opts?: { showSpinner?: boolean; force?: boolean }) => {
      if (!siteCode) return;
      if (inFlightRef.current[key]) return;
      inFlightRef.current[key] = true;

      const from = startOfDay(addDays(new Date(), -HISTORY_DAYS));
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
        if (opts?.showSpinner) setLoadingType(key);

        const local = await siteLogService
          .getLogsByType(siteCode, key, range)
          .catch(() => [] as any[]);
        setRowsByType((prev) => ({ ...prev, [key]: local }));
        setLoadingType((cur) => (cur === key ? null : cur));

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
        setLoadingType((cur) => (cur === key ? null : cur));
      }
    },
    [siteCode, isConnected],
  );

  // Load the active tab only — on mount, on tab change, and on site change.
  useEffect(() => {
    if (!siteCode) return;
    const seen = rowsByType[activeKey] !== undefined;
    loadType(activeKey, { showSpinner: !seen });
    // rowsByType is intentionally out of the deps: we want this to fire on
    // tab/site change, not every time a bucket is filled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, siteCode, loadType]);

  // Focus / foreground / poll refresh — still only the visible tab.
  useAutoSync(() => {
    if (siteCode) loadType(activeKey);
  }, [siteCode, activeKey]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadType(activeKey, { force: true });
    setRefreshing(false);
  }, [loadType, activeKey]);

  const selectTab = useCallback(
    (key: string) => {
      if (key === activeKey) return;
      const order = LOG_TABS.map((t) => t.key);
      const dir =
        order.indexOf(key as LogKey) >= order.indexOf(activeKey) ? 1 : -1;
      setSlide((prev) => ({ seq: prev.seq + 1, dir }));
      setActiveKey(key as LogKey);
      setShift("A");
      setStatusFilter("all");
    },
    [activeKey],
  );

  // ── Derived view data ────────────────────────────────────────────────────
  const scopedRows = useMemo(() => {
    const rows = rowsByType[activeKey] ?? [];
    if (!activeTab.hasShift) return rows;
    // shift_label is persisted as "1/3" | "2/3" | "3/3" (see uiShiftToLabel),
    // not "Shift A" — go through the same mapper the entry screen writes with.
    const wanted = uiShiftToLabel(shift);
    return rows.filter((r) => {
      const label = r.shift_label ? String(r.shift_label).trim() : "";
      // Legacy rows saved without a shift stay visible on every tab.
      return !label || label === wanted;
    });
  }, [rowsByType, activeKey, activeTab.hasShift, shift]);

  const pendingCount = useMemo(
    () => scopedRows.filter((r) => !isCompleted(r)).length,
    [scopedRows],
  );
  const completedCount = scopedRows.length - pendingCount;

  const visibleRows = useMemo(() => {
    if (statusFilter === "pending") return scopedRows.filter((r) => !isCompleted(r));
    if (statusFilter === "completed") return scopedRows.filter(isCompleted);
    return scopedRows;
  }, [scopedRows, statusFilter]);

  const historyLabel = useMemo(() => {
    const prefix = activeTab.hasShift ? `Shift ${shift} · ` : "";
    if (statusFilter === "all") return `${prefix}${scopedRows.length} entries`;
    return `${prefix}${visibleRows.length} of ${scopedRows.length}`;
  }, [activeTab.hasShift, shift, statusFilter, scopedRows.length, visibleRows.length]);

  const tabs = useMemo<StatusChip[]>(
    () => LOG_TABS.map((t) => ({ key: t.key, label: t.label })),
    [],
  );

  const hasInProgress = useMemo(
    () =>
      (rowsByType[activeKey] ?? []).some((r) => {
        const s = String(r?.status ?? "").toLowerCase().replace(/[\s_-]+/g, "");
        return s === "inprogress";
      }),
    [rowsByType, activeKey],
  );

  // ── Start flow ───────────────────────────────────────────────────────────
  const onStart = useCallback(() => {
    if (!siteCode) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    void siteLogService
      .prefetchPendingForCategory(siteCode, activeKey)
      .then(() => loadType(activeKey, { force: true }))
      .catch(() => {});

    if (activeTab.hasShift) {
      setShiftModalVisible(true);
      const today = istTodayString();
      Promise.all(
        (["A", "B", "C"] as const).map((sh) =>
          SiteConfigService.getPendingCountForDate(siteCode, "Temp RH", today, sh),
        ),
      )
        .then(([a, b, c]) => setShiftCounts({ A: a, B: b, C: c }))
        .catch(() => {});
      return;
    }

    setRouteParams(activeTab.route, { siteCode });
    router.push(activeTab.route as never);
  }, [siteCode, activeKey, activeTab, loadType]);

  /**
   * Opens one existing record for editing. The entry screens key edit mode off
   * `editId` — passing anything else (or nothing) drops them into a fresh
   * entry for today, which is not what tapping a history row means. The shift
   * comes from the record itself, not the tab that happens to be selected.
   */
  const saveEdit = useCallback(
    async (patch: Record<string, any>) => {
      if (!editRow?.id) return;
      setSavingEdit(true);
      try {
        await siteLogService.updateSiteLog(String(editRow.id), patch);
        // Reflect the change locally straight away, then re-read from cache.
        setRowsByType((prev) => {
          const rows = prev[activeKey];
          if (!rows) return prev;
          return {
            ...prev,
            [activeKey]: rows.map((r) =>
              r.id === editRow.id ? { ...r, ...patch } : r,
            ),
          };
        });
        setEditRow(null);
        void loadType(activeKey, { force: true });
      } catch (e) {
        loggerUtil.warn("Site log update failed", {
          module: "SITE_LOGS_SCREEN",
          error: e,
        });
      } finally {
        setSavingEdit(false);
      }
    },
    [editRow, activeKey, loadType],
  );

  const openEntry = useCallback(
    (row: any) => {
      if (!siteCode || !row?.id) return;
      const rowShift = labelToUiShift(row.shift_label) ?? shift;
      setRouteParams(activeTab.route, {
        siteCode,
        editId: String(row.id),
        ...(activeTab.hasShift ? { shift: rowShift } : {}),
        ...(activeKey === "Chiller Logs" && row.chiller_id
          ? { chillerId: String(row.chiller_id) }
          : {}),
      });
      router.push(activeTab.route as never);
    },
    [siteCode, activeTab, activeKey, shift],
  );

  const openRow = useCallback(
    (row: any) => {
      if (!row?.id) return;
      // Chiller readings are a full form of their own — the sheet covers the
      // reading-style logs only.
      if (activeKey !== "Chiller Logs") {
        setEditRow(row);
        return;
      }
      openEntry(row);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeKey],
  );

  const isLoading = loadingType === activeKey;

  return (
    <View style={{ flex: 1, backgroundColor: ds.pageBg }}>
      <ModuleListHeader
        topInset={insets.top}
        siteName={siteName}
        dateLabel={todayLabel}
        onPressSite={() => setSitePickerVisible(true)}
        onRefresh={() => {
          if (!isConnected || !siteCode) return;
          onRefresh();
        }}
        refreshDisabled={!isConnected || !siteCode}
        onFilter={() => setFilterOpen((v) => !v)}
        filterActive={statusFilter !== "all" || filterOpen}
        chips={tabs}
        activeChip={activeKey}
        onSelectChip={selectTab}
      />

      <Animated.View style={[{ flex: 1 }, listSlideStyle]}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 96,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={ds.thunder[100]}
            />
          }
        >
          <LogSummaryCards
            pending={pendingCount}
            completed={completedCount}
            filter={statusFilter}
            onToggle={setStatusFilter}
          />

          {activeTab.hasShift ? (
            <ShiftChips value={shift} onChange={setShift} />
          ) : null}

          <HistoryHeading label={historyLabel} />

          {isLoading ? (
            <View>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton
                  key={i}
                  width="100%"
                  height={92}
                  borderRadius={soRadius.card}
                  style={{ marginBottom: 10 }}
                />
              ))}
            </View>
          ) : visibleRows.length === 0 ? (
            <View style={{ paddingVertical: 28, alignItems: "center" }}>
              <Text style={{ fontSize: 12.5, color: ds.carbon[400] }}>
                No {activeTab.label.toLowerCase()} entries in this window
              </Text>
            </View>
          ) : (
            visibleRows.map((row) => (
              <LogHistoryCard
                key={row.id}
                item={row}
                logName={activeKey}
                onPress={() => openRow(row)}
              />
            ))
          )}
        </ScrollView>
      </Animated.View>

      {canEdit ? (
        <LogFab
          label={hasInProgress ? "Continue" : "Start log"}
          continuing={hasInProgress}
          onPress={onStart}
          bottom={20}
        />
      ) : null}

      {filterOpen ? (
        <LogFilterPopover
          top={insets.top + 54}
          value={statusFilter}
          onSelect={(next) => {
            setStatusFilter(next);
            setFilterOpen(false);
          }}
          onDismiss={() => setFilterOpen(false)}
        />
      ) : null}

      {editRow ? (
        <LogEditSheet
          row={editRow}
          logName={activeKey}
          saving={savingEdit}
          onClose={() => setEditRow(null)}
          onSave={saveEdit}
        />
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
                  }}
                  activeOpacity={0.85}
                  style={[
                    sheetStyles.row,
                    { backgroundColor: on ? ds.thunder[100] : ds.pageBg },
                  ]}
                >
                  <MapPin
                    size={15}
                    color={on ? ds.white : ds.carbon[500]}
                    strokeWidth={2}
                  />
                  <Text
                    style={[
                      sheetStyles.rowLabel,
                      { color: on ? ds.white : ds.carbon[100] },
                    ]}
                  >
                    {s2.site_name || s2.site_code}
                  </Text>
                  {on ? <Check size={16} color={ds.white} /> : null}
                </TouchableOpacity>
              );
            })}
          </BottomSheetScrollView>
        </BottomSheet>
      ) : null}

      {/* Shift chooser — native sheet, sized to its content */}
      {shiftModalVisible ? (
        <BottomSheet
          enableDynamicSizing
          enablePanDownToClose
          onClose={() => setShiftModalVisible(false)}
          backgroundStyle={{ backgroundColor: ds.white }}
        >
          <BottomSheetView
            style={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: 30 }}
          >
            <Text style={sheetStyles.heading}>Which shift?</Text>
            <Text style={sheetStyles.sub}>
              Choose the shift you&apos;re logging Temperature &amp; RH for.
            </Text>

            <View style={{ gap: 8 }}>
              {SHIFT_OPTIONS.map((sh) => {
                const pending = shiftCounts[sh.value] ?? 0;
                return (
                  <TouchableOpacity
                    key={sh.value}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setShiftModalVisible(false);
                      setRouteParams("/temp-rh", { siteCode, shift: sh.value });
                      router.push("/temp-rh");
                    }}
                    activeOpacity={0.85}
                    style={sheetStyles.shiftRow}
                  >
                    <View style={sheetStyles.shiftIcon}>
                      <Clock size={17} color={ds.flame[100]} strokeWidth={2.1} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={sheetStyles.shiftLabel}>{sh.label}</Text>
                      <Text style={sheetStyles.shiftWindow}>{sh.window}</Text>
                    </View>
                    {pending > 0 ? (
                      <View style={sheetStyles.dueBadge}>
                        <Text style={sheetStyles.dueBadgeText}>
                          {pending > 99 ? "99+" : pending} due
                        </Text>
                      </View>
                    ) : (
                      <Plus size={16} color={ds.carbon[700]} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </BottomSheetView>
        </BottomSheet>
      ) : null}

      {isLoading && !refreshing ? (
        <View style={{ position: "absolute", top: insets.top + 120, right: 22 }}>
          <ActivityIndicator size="small" color={ds.thunder[100]} />
        </View>
      ) : null}
    </View>
  );
}

/* Sheet content styling only — the sheet's own chrome (grabber, corner radius,
   scrim, swipe-to-dismiss) is native and not ours to draw. */
const sheetStyles = StyleSheet.create({
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
    backgroundColor: ds.flame[1000],
  },
  shiftLabel: { fontSize: 14, fontWeight: "600", color: ds.carbon[100] },
  shiftWindow: { fontSize: 11, color: ds.carbon[500] },
  dueBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: ds.flame[1000],
  },
  dueBadgeText: {
    fontSize: 8.5,
    fontWeight: "600",
    letterSpacing: 0.68,
    textTransform: "uppercase",
    color: ds.flame[100],
  },
});
