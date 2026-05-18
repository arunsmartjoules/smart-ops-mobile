import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useAutoSync } from "@/hooks/useAutoSync";
import siteLogService from "@/services/SiteLogService";
import { SiteConfigService } from "@/services/SiteConfigService";
import { istTodayString, formatISTDate } from "@/utils/istDate";
import LogFilterModal from "@/components/sitelogs/LogFilterModal";
import {
  Filter,
  RefreshCw,
  MapPin,
  ChevronDown,
  Thermometer,
  Droplets,
  FlaskRound,
  Snowflake,
  History,
  Plus,
  Clock,
  X,
} from "lucide-react-native";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useSites } from "@/hooks/useSites";
import { startOfDay, endOfDay, addDays, startOfMonth, endOfMonth } from "date-fns";
import loggerUtil from "@/utils/logger";
import Skeleton from "@/components/Skeleton";

export default function SiteLogs() {
  const { user } = useAuth();
  const isDark = useColorScheme() === "dark";
  const [loading, setLoading] = useState(true);
  const [logProgress, setLogProgress] = useState<
    Record<string, { total: number; completed: number }>
  >({});
  // Today's due count per category. Intentionally NOT driven by the date
  // filter — the filter only affects history/progress, never the due count.
  const [todayDueCounts, setTodayDueCounts] = useState<Record<string, number>>({});
  // Today's Temp & RH due count broken down by shift.
  const [tempRhShiftDue, setTempRhShiftDue] = useState<Record<"A" | "B" | "C", number>>({
    A: 0,
    B: 0,
    C: 0,
  });
  // Distinct chillers logged TODAY. Filter-range independent — the chiller
  // card must always reflect today, not the selected date range.
  const [chillerLoggedToday, setChillerLoggedToday] = useState(0);
  const [filterVisible, setFilterVisible] = useState(false);
  // Main Logs screen defaults to "this month". Entry screens still default
  // to today (they don't read these state values — they use today directly).
  const [fromDate, setFromDate] = useState<Date | null>(startOfMonth(new Date()));
  const [toDate, setToDate] = useState<Date | null>(endOfMonth(new Date()));
  const lastSyncRef = React.useRef<Record<string, number>>({});
  const refreshingRef = useRef(false);
  const fetchLogsRef = useRef<((targetSite: string) => Promise<void>) | null>(null);
  const [shiftModalVisible, setShiftModalVisible] = useState(false);
  const [shiftCounts, setShiftCounts] = useState<Record<string, number>>({ A: 0, B: 0, C: 0 });
  const { isConnected } = useNetworkStatus();
  const prePullInFlightRef = useRef(false);

  // ── Clean sites hook ──────────────────────────────────────────────────────
  const userId = user?.user_id || user?.id;
  const { sites: availableSites, selectedSite, selectSite, refresh: refreshSites } = useSites(userId);
  const siteCode = selectedSite?.site_code ?? null;
  const siteName = selectedSite?.site_name ?? selectedSite?.site_code ?? "Select Site";
  const dateRangePreview = useMemo(() => {
    const fmt = (d: Date | null) => (d ? formatISTDate(d) : "Any");
    return `${fmt(fromDate)} – ${fmt(toDate)}`;
  }, [fromDate, toDate]);

  // Safety timer to clear loading no matter what
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(prev => {
        if (prev) loggerUtil.debug("SiteLogs safety timeout triggered", { module: "SITE_LOGS_SCREEN" });
        return false;
      });
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  // Fetch log progress for the currently active siteCode
  const fetchLogs = useCallback(async (targetSite: string) => {
    if (!targetSite) return;
    try {
      const now = Date.now();
      const lastSyncTime = lastSyncRef.current[targetSite] || 0;
      const shouldSync =
        isConnected && (refreshingRef.current || lastSyncTime === 0 || now - lastSyncTime > 1000 * 60 * 10);

      if (shouldSync) {
        try {
          // Prefetch covers the user's selected filter range, with a ±7-day
          // minimum so the cache stays useful even when the filter is narrow.
          const minFrom = startOfDay(addDays(new Date(), -7));
          const minTo = endOfDay(addDays(new Date(), 7));
          const fromDateObj = fromDate && fromDate < minFrom ? fromDate : minFrom;
          const toDateObj = toDate && toDate > minTo ? toDate : minTo;

          await Promise.all([
            siteLogService.pullSiteLogs(targetSite, {
              fromDate: fromDateObj.getTime(),
              toDate: toDateObj.getTime()
            }),
            siteLogService.pullChillerReadings(targetSite, {
              fromDate: fromDateObj.getTime(),
              toDate: toDateObj.getTime()
            }),
            siteLogService.pullLogMaster(),
          ]);
          lastSyncRef.current = { ...lastSyncRef.current, [targetSite]: now };
        } catch (e) {
          console.log("Sync warning", e);
        }
      }

      // Progress is filter-range based; due counts are today-only and must
      // ignore fromDate/toDate entirely. "Today" is the IST calendar day —
      // toISOString() is UTC, which rolls over a day early between IST
      // 00:00–05:30 and made the due count show the previous day.
      const today = istTodayString();
      const dueTypes = ["Temp RH", "Water", "Chemical Dosing"];
      const [progress, dueEntries, tempA, tempB, tempC, chillerCompletedToday] =
        await Promise.all([
          // Card progress is TODAY-only, independent of the date filter.
          // (getCategoryProgress keys off a single day = istDateString of the
          // passed date; the filter only scopes pull range / history nav.)
          siteLogService.getCategoryProgress(targetSite, new Date(), new Date()),
          Promise.all(
            dueTypes.map(
              async (t) =>
                [
                  t,
                  await SiteConfigService.getPendingCountForDate(targetSite, t, today),
                ] as const,
            ),
          ),
          SiteConfigService.getPendingCountForDate(targetSite, "Temp RH", today, "A"),
          SiteConfigService.getPendingCountForDate(targetSite, "Temp RH", today, "B"),
          SiteConfigService.getPendingCountForDate(targetSite, "Temp RH", today, "C"),
          // Total completed chiller readings for today (NOT deduped per
          // chiller), pinned to today so it ignores the filter date range.
          SiteConfigService.getChillerCompletedCountForDate(
            targetSite,
            new Date(),
          ),
        ]);
      setLogProgress(progress);
      setTodayDueCounts(Object.fromEntries(dueEntries));
      setTempRhShiftDue({ A: tempA, B: tempB, C: tempC });
      setChillerLoggedToday(chillerCompletedToday);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      refreshingRef.current = false;
    }
  }, [fromDate, toDate, isConnected]);

  // Full online pull set used by Start flow to ensure destination screens have fresh local data.
  const pullLatestForSite = useCallback(
    async (targetSite: string, opts?: { force?: boolean }) => {
      if (!targetSite) return;
      if (!isConnected) return;
      if (prePullInFlightRef.current) return;

      const force = opts?.force ?? false;
      const now = Date.now();
      const lastSyncTime = lastSyncRef.current[targetSite] || 0;
      const shouldSync =
        force || refreshingRef.current || lastSyncTime === 0 || now - lastSyncTime > 1000 * 60 * 10;

      if (!shouldSync) return;

      prePullInFlightRef.current = true;
      try {
        const minFrom = startOfDay(addDays(new Date(), -7));
        const minTo = endOfDay(addDays(new Date(), 7));
        const fromDateObj = fromDate && fromDate < minFrom ? fromDate : minFrom;
        const toDateObj = toDate && toDate > minTo ? toDate : minTo;
        await Promise.all([
          siteLogService.pullSiteLogs(targetSite, {
            fromDate: fromDateObj.getTime(),
            toDate: toDateObj.getTime(),
          }),
          siteLogService.pullChillerReadings(targetSite, {
            fromDate: fromDateObj.getTime(),
            toDate: toDateObj.getTime(),
          }),
          siteLogService.pullLogMaster(),
        ]);
        lastSyncRef.current = { ...lastSyncRef.current, [targetSite]: now };
      } finally {
        prePullInFlightRef.current = false;
      }
    },
    [isConnected, fromDate, toDate],
  );

  const handleHeaderManualRefresh = useCallback(async () => {
    if (!isConnected || !siteCode) return;
    await pullLatestForSite(siteCode, { force: true });
    await fetchLogs(siteCode);
  }, [fetchLogs, isConnected, pullLatestForSite, siteCode]);

  // Keep a stable ref to the latest fetchLogs so useFocusEffect doesn't re-register
  useEffect(() => {
    fetchLogsRef.current = fetchLogs;
  }, [fetchLogs]);

  // Fetch logs whenever siteCode or date filters change
  useEffect(() => {
    if (siteCode) fetchLogs(siteCode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteCode, fromDate, toDate]);

  // Auto-sync for Site Logs (Handles Focus, AppState, and 60s Polling)
  useAutoSync(() => {
    if (siteCode) fetchLogs(siteCode);
  }, [siteCode, fromDate, toDate]);


  // Manual pull-to-refresh removed to guarantee no vertical scrolling on small screens.

  const getLogName = (title: string) => {
    // Robust mapping
    if (title.includes("Temp")) return "Temp RH";
    if (title === "Water") return "Water";
    if (title.includes("Water")) return "Water";
    if (title.includes("Chemical")) return "Chemical Dosing";
    if (title.includes("Chiller")) return "Chiller Logs";
    return title;
  };

  const categories = [
    {
      id: "temp-rh",
      title: "Temp & RH",
      shortTitle: "Temp",
      route: "/temp-rh",
      subtitle: "Monitoring Points",
      icon: Thermometer,
      colors: ["#ef4444", "#f87171"],
      bg: "bg-red-50 dark:bg-red-900/20",
      accent: "#ef4444",
    },
    {
      id: "chiller",
      title: "Chiller Readings",
      shortTitle: "Chiller",
      route: "/chiller",
      subtitle: "Performance Logs",
      icon: Snowflake,
      colors: ["#0d9488", "#14b8a6"],
      bg: "bg-teal-50 dark:bg-teal-900/20",
      accent: "#0d9488",
    },
    {
      id: "water",
      title: "Water",
      shortTitle: "Water",
      route: "/water",
      subtitle: "TDS, pH, Hardness",
      icon: Droplets,
      colors: ["#3b82f6", "#60a5fa"],
      bg: "bg-blue-50 dark:bg-blue-900/20",
      accent: "#3b82f6",
    },
    {
      id: "chemical",
      title: "Chemical Dosing",
      shortTitle: "Chemical",
      route: "/chemical",
      subtitle: "Consumption Logs",
      icon: FlaskRound,
      colors: ["#8b5cf6", "#a78bfa"],
      bg: "bg-violet-50 dark:bg-violet-900/20",
      accent: "#8b5cf6",
    },
  ];

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" edges={["top"]}>
        {/* Header */}
        <View className="px-5 pt-2 pb-3">
          <View className="flex-row items-center justify-between mb-6">
            <View className="flex-1">
              <Text className="text-slate-400 dark:text-slate-500 text-sm font-medium mb-1">
                Site Operations
              </Text>
              <TouchableOpacity
                onPress={() => setFilterVisible(true)}
                className="flex-row items-center"
              >
                <MapPin size={20} color="#dc2626" />
                <Text
                  className="text-slate-900 dark:text-slate-50 text-xl font-bold ml-2 mr-1 flex-shrink"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {siteName}
                </Text>
                <ChevronDown size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                disabled={!isConnected || !siteCode}
                onPress={handleHeaderManualRefresh}
                className="w-11 h-11 rounded-xl bg-white dark:bg-slate-900 items-center justify-center"
                style={{
                  opacity: !isConnected || !siteCode ? 0.4 : 1,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.08,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                <RefreshCw
                  size={20}
                  color={!isConnected || !siteCode ? "#94a3b8" : "#dc2626"}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setFilterVisible(true)}
                className="w-11 h-11 rounded-xl bg-white dark:bg-slate-900 items-center justify-center"
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.08,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                <Filter size={20} color={fromDate ? "#dc2626" : isDark ? "#dc2626" : "#64748b"} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => setFilterVisible(true)}
            className="mb-4 self-start flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40"
          >
            <Clock size={12} color="#dc2626" />
            <Text className="text-[11px] font-semibold text-red-700 dark:text-red-300">
              {dateRangePreview}
            </Text>
          </TouchableOpacity>

        </View>

        <View className="flex-1 px-5 pt-6 pb-6">
          {!loading && isConnected && !siteCode && (
            <View className="mb-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 items-center">
              <Text className="text-slate-900 dark:text-slate-50 font-bold">
                No sites synced yet
              </Text>
              <TouchableOpacity
                onPress={async () => {
                  await refreshSites();
                  if (selectedSite?.site_code) fetchLogs(selectedSite.site_code);
                }}
                className="mt-3 bg-red-600 px-4 py-2 rounded-xl"
              >
                <Text className="text-white font-bold">Retry Server Sync</Text>
              </TouchableOpacity>
            </View>
          )}
          {loading ? (
            <View className="flex-1">
              <Text className="text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-widest mb-2">
                Log categories
              </Text>
              <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: 10, paddingBottom: 8 }}
              >
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton
                    key={i}
                    height={100}
                    style={{ borderRadius: 16 }}
                  />
                ))}
              </ScrollView>
            </View>
          ) : (
            <View className="flex-1">
              <Text className="text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-widest mb-2">
                Log categories
              </Text>

              <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: 10, paddingBottom: 8 }}
              >
                {categories.map((item) => {
                  const progress = logProgress[getLogName(item.title)] || {
                    total: 0,
                    completed: 0,
                  };
                  const isChiller = item.id === "chiller";
                  const isTempRh = item.id === "temp-rh";
                  // Due count is always "today" — never the filter range.
                  const pending = isChiller
                    ? 0
                    : todayDueCounts[getLogName(item.title)] ?? 0;

                  // Status pill: done / partial / pending.
                  let pillTone: "done" | "partial" | "pending" | null = null;
                  let pillText = "";
                  if (isChiller) {
                    if (chillerLoggedToday > 0) {
                      pillTone = "done";
                      pillText = `${chillerLoggedToday} logged`;
                    } else {
                      pillTone = "pending";
                      pillText = "Due";
                    }
                  } else if (progress.total > 0) {
                    if (pending === 0) {
                      pillTone = "done";
                      pillText = "Done";
                    } else if (progress.completed > 0) {
                      pillTone = "partial";
                      pillText = "Partial";
                    } else {
                      pillTone = "pending";
                      pillText = `${pending} due`;
                    }
                  }

                  const pct = isChiller
                    ? chillerLoggedToday > 0
                      ? 100
                      : 0
                    : progress.total > 0
                      ? Math.round((progress.completed / progress.total) * 100)
                      : 0;

                  const footInfo = isChiller
                    ? chillerLoggedToday > 0
                      ? "All shifts complete"
                      : item.subtitle
                    : progress.total > 0
                      ? pending === 0
                        ? "All areas done"
                        : `${progress.completed} of ${progress.total} areas done`
                      : item.subtitle;

                  const pillCls =
                    pillTone === "done"
                      ? "bg-emerald-100 dark:bg-emerald-900/25"
                      : pillTone === "partial"
                        ? "bg-amber-100 dark:bg-amber-900/25"
                        : "bg-red-50 dark:bg-red-950/40";
                  const pillTxtCls =
                    pillTone === "done"
                      ? "text-emerald-700 dark:text-emerald-400"
                      : pillTone === "partial"
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-red-600 dark:text-red-400";

                  const onStart = () => {
                    if (!siteCode) return;

                    // Non-blocking targeted prefetch for Start flow.
                    void siteLogService
                      .prefetchPendingForCategory(siteCode, getLogName(item.title))
                      .then(() => {
                        void fetchLogs(siteCode);
                      })
                      .catch(() => {});

                    if (item.id === "temp-rh") {
                      setShiftModalVisible(true);
                      const today = istTodayString();
                      Promise.all([
                        SiteConfigService.getPendingCountForDate(siteCode, "Temp RH", today, "A"),
                        SiteConfigService.getPendingCountForDate(siteCode, "Temp RH", today, "B"),
                        SiteConfigService.getPendingCountForDate(siteCode, "Temp RH", today, "C"),
                      ])
                        .then(([a, b, c]) => setShiftCounts({ A: a, B: b, C: c }))
                        .catch(() => {});
                    } else {
                      router.push({
                        pathname: item.route,
                        params: { siteCode, isNew: "true" },
                      });
                    }
                  };

                  return (
                    <View
                      key={item.id}
                      className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-100 dark:border-slate-800"
                      style={{
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.06,
                        shadowRadius: 6,
                        elevation: 2,
                      }}
                    >
                      <View className="flex-row items-center mb-3">
                        <View
                          className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${item.bg}`}
                        >
                          <item.icon size={20} color={item.accent} />
                        </View>

                        <View className="flex-1 min-w-0">
                          <Text
                            className="text-slate-900 dark:text-slate-50 font-bold text-[15px]"
                            numberOfLines={1}
                          >
                            {item.title}
                          </Text>
                          <Text
                            className="text-slate-400 dark:text-slate-500 text-xs mt-0.5"
                            numberOfLines={1}
                          >
                            {item.subtitle}
                          </Text>
                        </View>

                        {isTempRh ? (
                          <View className="flex-row gap-1 shrink-0">
                            {(["A", "B", "C"] as const).map((sh) => {
                              const c = tempRhShiftDue[sh];
                              const due = c > 0;
                              return (
                                <View
                                  key={sh}
                                  className={`px-1.5 py-1 rounded-md ${
                                    due
                                      ? "bg-red-50 dark:bg-red-950/40"
                                      : "bg-emerald-100 dark:bg-emerald-900/25"
                                  }`}
                                >
                                  <Text
                                    className={`text-[10px] font-bold ${
                                      due
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-emerald-700 dark:text-emerald-400"
                                    }`}
                                  >
                                    {sh} {c}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        ) : (
                          pillTone && (
                            <View className={`px-2 py-1 rounded-md shrink-0 ${pillCls}`}>
                              <Text
                                className={`text-[10px] font-bold ${pillTxtCls}`}
                                numberOfLines={1}
                              >
                                {pillText}
                              </Text>
                            </View>
                          )
                        )}
                      </View>

                      <View className="h-[3px] rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-3">
                        <View
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            backgroundColor: item.accent,
                            borderRadius: 2,
                          }}
                        />
                      </View>

                      <View className="flex-row items-center gap-2">
                        <Text
                          className="flex-1 text-slate-400 dark:text-slate-500 text-[11px]"
                          numberOfLines={1}
                        >
                          {footInfo}
                        </Text>

                        <TouchableOpacity
                          onPress={() =>
                            router.push({
                              pathname: "/history/site-history",
                              params: {
                                siteCode,
                                logName: getLogName(item.title),
                                fromDate: fromDate ? String(fromDate.getTime()) : "",
                                toDate: toDate ? String(toDate.getTime()) : "",
                              },
                            })
                          }
                          className="h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-800 flex-row items-center justify-center border border-slate-100 dark:border-slate-700"
                        >
                          <History size={15} color="#94a3b8" />
                          <Text className="ml-1.5 text-slate-500 dark:text-slate-400 text-xs font-semibold">
                            View
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={onStart} activeOpacity={0.85}>
                          <View
                            className="px-3.5 py-2 rounded-lg flex-row items-center justify-center"
                            style={{ backgroundColor: item.colors[0] }}
                          >
                            <Plus
                              size={13}
                              color="white"
                              strokeWidth={2.5}
                              style={{ marginRight: 4 }}
                            />
                            <Text className="text-white font-bold text-xs">
                              Start
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      </SafeAreaView>
      <LogFilterModal
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        fromDate={fromDate}
        setFromDate={setFromDate}
        toDate={toDate}
        setToDate={setToDate}
        availableSites={availableSites}
        selectedSiteCode={siteCode}
      onSiteSelect={async (id) => {
          const s = availableSites.find((site) => site.site_code === id);
          if (s) await selectSite(s);
          setTodayDueCounts({});
          setTempRhShiftDue({ A: 0, B: 0, C: 0 });
          setChillerLoggedToday(0);
          setLogProgress({});
          fetchLogs(id);
        }}
        onApply={() => {
          setFilterVisible(false);
        }}
      />

      {/* Shift Selection Modal */}
      <Modal
        visible={shiftModalVisible}
        transparent={true}
        animationType="fade"
        statusBarTranslucent={true}
      >
        <View className="flex-1 bg-black/60 justify-center items-center px-6">
          <View className="bg-white dark:bg-slate-900 rounded-[32px] w-full p-6 shadow-2xl">
            <View className="flex-row items-center justify-between mb-6">
              <View>
                <Text className="text-slate-900 dark:text-slate-100 text-xl font-bold">
                  Select Shift
                </Text>
                <Text className="text-slate-400 text-sm mt-0.5">
                  Choose current reading window
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShiftModalVisible(false)}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center"
              >
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <View className="gap-3">
              {[
                { label: "Shift A (1/3)", value: "A", time: "Morning" },
                { label: "Shift B (2/3)", value: "B", time: "Evening" },
                { label: "Shift C (3/3)", value: "C", time: "Night" },
              ].map((shift) => {
                const pendingCount = shiftCounts[shift.value] ?? 0;
                return (
                  <TouchableOpacity
                    key={shift.value}
                    onPress={() => {
                      setShiftModalVisible(false);
                      router.push({
                        pathname: "/temp-rh",
                        params: { siteCode, isNew: "true", shift: shift.value },
                      });
                    }}
                    className="flex-row items-center p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700"
                  >
                    <View className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-xl items-center justify-center mr-4">
                      <Clock size={20} color="#ef4444" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-slate-900 dark:text-slate-100 font-bold text-base">
                        {shift.label}
                      </Text>
                      <Text className="text-slate-400 text-xs">
                        {shift.time} Observations
                      </Text>
                    </View>
                    {pendingCount > 0 ? (
                      <View className="min-w-[20px] h-5 bg-red-600 rounded-full items-center justify-center px-1.5">
                        <Text className="text-white text-[10px] font-black leading-none">
                          {pendingCount > 99 ? "99+" : pendingCount}
                        </Text>
                      </View>
                    ) : (
                      <View className="w-8 h-8 rounded-full bg-slate-200/50 dark:bg-slate-700 items-center justify-center">
                        <Plus size={16} color="#94a3b8" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={() => setShiftModalVisible(false)}
              className="mt-8 py-4 bg-slate-900 dark:bg-slate-50 rounded-2xl items-center"
            >
              <Text className="text-white dark:text-slate-900 font-bold">
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
