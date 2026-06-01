import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import { useAutoSync } from "@/hooks/useAutoSync";
import siteLogService from "@/services/SiteLogService";
import { SiteConfigService } from "@/services/SiteConfigService";
import { istTodayString, formatISTDate, istDateString } from "@/utils/istDate";
import {
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
  Check,
  ListChecks,
} from "lucide-react-native";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useSites } from "@/hooks/useSites";
import { setRouteParams } from "@/utils/routeParams";
import { startOfDay, endOfDay, addDays } from "date-fns";
import loggerUtil from "@/utils/logger";
import Skeleton from "@/components/Skeleton";
import * as Haptics from "expo-haptics";
import PressableScale from "@/components/PressableScale";

export default function SiteLogs() {
  const { user } = useAuth();
  const { canEdit } = useAttendanceGate();
  const [loading, setLoading] = useState(true);
  const [logProgress, setLogProgress] = useState<
    Record<string, { total: number; completed: number; inProgress?: number }>
  >({});
  // Today's Temp & RH progress broken down by shift (completed / total).
  const [tempRhShiftProgress, setTempRhShiftProgress] = useState<
    Record<"A" | "B" | "C", { completed: number; total: number }>
  >({
    A: { completed: 0, total: 0 },
    B: { completed: 0, total: 0 },
    C: { completed: 0, total: 0 },
  });
  // Site-only picker (the main Logs screen has no date filter — date
  // filtering lives in the entry and history screens).
  const [sitePickerVisible, setSitePickerVisible] = useState(false);
  // Main Logs screen is always "today". These are kept only to scope the
  // background pull range and to seed the history screen's initial range.
  const [fromDate] = useState<Date | null>(startOfDay(new Date()));
  const [toDate] = useState<Date | null>(endOfDay(new Date()));
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
  // Main screen is always today; shown as a static, non-interactive chip.
  const todayLabel = useMemo(() => `Today · ${formatISTDate(new Date())}`, []);

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

  // Fetch log progress for the currently active siteCode.
  // Cache-first: render from local SQLite immediately, then sync in the
  // background and silently re-read once fresh rows have been written.
  const fetchLogs = useCallback(async (targetSite: string) => {
    if (!targetSite) return;

    // "Today" is the IST calendar day — toISOString() is UTC, which rolls
    // over a day early between IST 00:00–05:30.
    const td = new Date();
    const shiftProgress = async (sh: "A" | "B" | "C") => {
      const tasks = await SiteConfigService.getLogTasks(
        targetSite,
        "Temp RH",
        td,
        td,
        sh,
        true,
      );
      return {
        completed: tasks.filter((t: { isCompleted?: boolean }) => t.isCompleted)
          .length,
        total: tasks.length,
      };
    };

    const readCache = async () => {
      try {
        const [progress, shA, shB, shC] = await Promise.all([
          siteLogService.getCategoryProgress(targetSite, td, td),
          shiftProgress("A"),
          shiftProgress("B"),
          shiftProgress("C"),
        ]);
        setLogProgress(progress);
        setTempRhShiftProgress({ A: shA, B: shB, C: shC });
      } catch (e) {
        loggerUtil.warn("Site logs cache read failed", { module: "SITE_LOGS_SCREEN", error: e });
      }
    };

    // Capture sync gate BEFORE we clear refreshingRef below — otherwise a
    // manual refresh racing with the cache read would lose its flag.
    const now = Date.now();
    const lastSyncTime = lastSyncRef.current[targetSite] || 0;
    const shouldSync =
      isConnected && (refreshingRef.current || lastSyncTime === 0 || now - lastSyncTime > 1000 * 60 * 10);

    // 1) Render whatever the local cache has, immediately.
    await readCache();
    setLoading(false);
    refreshingRef.current = false;

    // 2) When online, ask the server for today's pre-aggregated tile counts.
    // This replaces the legacy "pull every row for the last 14 days just to
    // count them" path on this screen. ~200 bytes instead of MBs. Falls
    // back silently to the local cache read above on offline / non-OK.
    if (isConnected) {
      siteLogService
        .fetchProgress(targetSite, istDateString(td))
        .then((srv) => {
          if (!srv) return;
          setLogProgress((prev) => ({
            ...prev,
            "Temp RH": { ...srv.categories["Temp RH"] },
            Water: { ...srv.categories.Water },
            "Chemical Dosing": { ...srv.categories["Chemical Dosing"] },
            // Chiller "total" still comes from local config (configured
            // chiller slots) — server only gives us the dynamic counts, so
            // merge into whatever local readCache produced.
            "Chiller Logs": {
              total: prev["Chiller Logs"]?.total ?? srv.chiller.completed + srv.chiller.inProgress,
              completed: srv.chiller.completed,
              inProgress: srv.chiller.inProgress,
            },
          }));
          const shifts = srv.categories["Temp RH"].byShift;
          if (shifts) {
            setTempRhShiftProgress({
              A: { ...shifts.A },
              B: { ...shifts.B },
              C: { ...shifts.C },
            });
          }
        })
        .catch((e) => {
          loggerUtil.warn("Site logs progress fetch failed", { module: "SITE_LOGS_SCREEN", error: e });
        });
    }

    // 3) Background row pre-warm for offline category browsing. Narrowed
    // from ±7 days to TODAY only — the tile screen no longer depends on
    // these rows (handled by /progress above), so we just keep enough
    // cached for the operator to enter a category offline. The dedicated
    // `pullLatestForSite` path used by the Start flow still uses the wider
    // ±7-day window for the history screen.
    if (shouldSync) {
      const fromDateObj = startOfDay(new Date());
      const toDateObj = endOfDay(new Date());

      Promise.all([
        siteLogService.pullSiteLogs(targetSite, {
          fromDate: fromDateObj.getTime(),
          toDate: toDateObj.getTime(),
        }),
        siteLogService.pullChillerReadings(targetSite, {
          fromDate: fromDateObj.getTime(),
          toDate: toDateObj.getTime(),
        }),
        siteLogService.pullLogMaster(),
      ])
        .then(() => {
          lastSyncRef.current = { ...lastSyncRef.current, [targetSite]: now };
          // Silent local re-read so offline-mode tile counts catch up if
          // /progress was unreachable but the row pull succeeded.
          return readCache();
        })
        .catch((e) => {
          loggerUtil.warn("Site logs background sync failed", { module: "SITE_LOGS_SCREEN", error: e });
        });
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

  // Overall progress — sum of completed/total across all log categories for today.
  const overallProgress = useMemo(() => {
    let total = 0;
    let completed = 0;
    for (const cat of categories) {
      const p = logProgress[getLogName(cat.title)];
      if (!p) continue;
      total += p.total;
      completed += p.completed;
    }
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pct, allDone: total > 0 && completed >= total };
    // `categories` is a static config array (stable contents); only logProgress varies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logProgress]);

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
                onPress={() => setSitePickerVisible(true)}
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
            </View>
          </View>

        </View>

        <View className="flex-1 px-5 pt-3 pb-6">
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
              {/* Overall progress for today across all log categories */}
              <View
                className="bg-white dark:bg-slate-900 rounded-xl px-3 py-2 mb-3 border border-slate-100 dark:border-slate-800"
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 6,
                  elevation: 2,
                }}
              >
                <View className="flex-row items-center justify-between mb-1">
                  <View className="flex-row items-center flex-1 min-w-0">
                    <Clock size={11} color="#dc2626" />
                    <Text
                      className="ml-1 text-[11px] font-bold text-red-700 dark:text-red-300"
                      numberOfLines={1}
                    >
                      {todayLabel}
                    </Text>
                  </View>
                  <Text
                    className="text-sm font-extrabold ml-2"
                    style={{
                      color: overallProgress.allDone ? "#10b981" : "#6366f1",
                    }}
                  >
                    {overallProgress.pct}%
                  </Text>
                </View>
                <View className="flex-row items-center mb-1.5">
                  <Check size={11} color="#059669" strokeWidth={3} />
                  <Text className="ml-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    {overallProgress.completed}
                  </Text>
                  <Text className="ml-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                    of
                  </Text>
                  <Text className="ml-1 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                    {overallProgress.total}
                  </Text>
                  <Text className="ml-1 text-[10px] text-slate-400 dark:text-slate-500">
                    logs done today
                  </Text>
                </View>
                <View className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <View
                    style={{
                      width: `${overallProgress.pct}%`,
                      height: "100%",
                      backgroundColor: overallProgress.allDone
                        ? "#10b981"
                        : "#6366f1",
                      borderRadius: 999,
                    }}
                  />
                </View>
              </View>

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
                  const isTempRh = item.id === "temp-rh";
                  const isChiller = item.id === "chiller";

                  // Completed / pending out of today's total. (Chiller's
                  // `completed` is the RAW count of completed readings — not
                  // deduped by chiller_id — so logging the same chiller twice
                  // counts as two.)
                  const completed = progress.completed;
                  const totalCount = progress.total;
                  const inProgress = progress.inProgress ?? 0;
                  const pending = Math.max(0, totalCount - completed);
                  const pct =
                    totalCount > 0
                      ? Math.min(100, Math.round((completed / totalCount) * 100))
                      : 0;
                  const allDone = totalCount > 0 && completed >= totalCount;

                  const onStart = () => {
                    if (!siteCode) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

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
                      // Pass params via the routeParams store instead of the
                      // URL so the entry screen never needs a navigation hook
                      // to read them (see utils/routeParams).
                      setRouteParams(item.route, { siteCode });
                      router.push(item.route);
                    }
                  };

                  return (
                    <View
                      key={item.id}
                      className="bg-white dark:bg-slate-900 rounded-2xl px-3.5 py-3 border border-slate-100 dark:border-slate-800"
                      style={{
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.05,
                        shadowRadius: 6,
                        elevation: 2,
                      }}
                    >
                      {/* Row 1: icon · title + counts · % */}
                      <View className="flex-row items-center">
                        <View
                          className={`w-9 h-9 rounded-xl items-center justify-center mr-3 ${item.bg}`}
                        >
                          <item.icon size={18} color={item.accent} />
                        </View>

                        <View className="flex-1 min-w-0">
                          <Text
                            className="text-slate-900 dark:text-slate-50 font-bold text-[14px]"
                            numberOfLines={1}
                          >
                            {item.title}
                          </Text>
                          <View className="flex-row items-center mt-1">
                            <Check size={12} color="#059669" strokeWidth={3} />
                            <Text className="ml-1 text-[12px] font-bold text-emerald-600 dark:text-emerald-400">
                              {completed}
                            </Text>
                            <Text className="ml-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                              done
                            </Text>
                            {isChiller && (
                              <>
                                <Text className="mx-1.5 text-slate-300 dark:text-slate-600">
                                  ·
                                </Text>
                                <Clock
                                  size={12}
                                  color={inProgress > 0 ? "#3b82f6" : "#94a3b8"}
                                  strokeWidth={3}
                                />
                                <Text
                                  className={`ml-1 text-[12px] font-bold ${
                                    inProgress > 0
                                      ? "text-blue-600 dark:text-blue-400"
                                      : "text-slate-400 dark:text-slate-500"
                                  }`}
                                >
                                  {inProgress}
                                </Text>
                                <Text className="ml-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                                  in progress
                                </Text>
                              </>
                            )}
                            {item.id !== "chiller" && (
                              <>
                                <Text className="mx-1.5 text-slate-300 dark:text-slate-600">
                                  ·
                                </Text>
                                <Clock
                                  size={12}
                                  color={pending > 0 ? "#dc2626" : "#94a3b8"}
                                  strokeWidth={3}
                                />
                                <Text
                                  className={`ml-1 text-[12px] font-bold ${
                                    pending > 0
                                      ? "text-red-600 dark:text-red-400"
                                      : "text-slate-400 dark:text-slate-500"
                                  }`}
                                >
                                  {pending}
                                </Text>
                                <Text className="ml-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                                  pending
                                </Text>
                                <Text className="mx-1.5 text-slate-300 dark:text-slate-600">
                                  ·
                                </Text>
                                <ListChecks
                                  size={12}
                                  color="#6366f1"
                                  strokeWidth={3}
                                />
                                <Text className="ml-1 text-[12px] font-bold text-indigo-600 dark:text-indigo-400">
                                  {totalCount}
                                </Text>
                                <Text className="ml-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                                  total
                                </Text>
                              </>
                            )}
                          </View>
                        </View>

                        <Text
                          className="text-base font-extrabold ml-2"
                          style={{
                            color: allDone ? "#10b981" : item.accent,
                          }}
                        >
                          {pct}%
                        </Text>
                      </View>

                      {/* Temp & RH: per-shift breakdown (compact) */}
                      {isTempRh && (
                        <View className="flex-row gap-1.5 mt-2.5">
                          {(["A", "B", "C"] as const).map((sh) => {
                            const sp = tempRhShiftProgress[sh];
                            const shDone =
                              sp.total > 0 && sp.completed >= sp.total;
                            return (
                              <View
                                key={sh}
                                className={`flex-1 flex-row items-center justify-center rounded-md py-1 ${
                                  shDone
                                    ? "bg-emerald-50 dark:bg-emerald-900/15"
                                    : "bg-slate-50 dark:bg-slate-800"
                                }`}
                              >
                                <Text className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                                  {sh}
                                </Text>
                                <Text
                                  className={`ml-1 text-[11px] font-extrabold ${
                                    shDone
                                      ? "text-emerald-700 dark:text-emerald-400"
                                      : "text-slate-700 dark:text-slate-300"
                                  }`}
                                >
                                  {sp.completed}/{sp.total}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {/* Progress bar */}
                      <View className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-2.5">
                        <View
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            backgroundColor: allDone ? "#10b981" : item.accent,
                            borderRadius: 999,
                          }}
                        />
                      </View>

                      {/* Actions */}
                      <View className="flex-row gap-2 mt-2.5">
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
                          className="flex-1 h-9 rounded-lg bg-slate-50 dark:bg-slate-800 flex-row items-center justify-center border border-slate-100 dark:border-slate-700"
                          activeOpacity={0.85}
                        >
                          <History size={14} color="#94a3b8" />
                          <Text className="ml-1.5 text-slate-500 dark:text-slate-400 text-xs font-bold">
                            History
                          </Text>
                        </TouchableOpacity>

                        {canEdit && (
                          <PressableScale
                            onPress={onStart}
                            className="flex-1 h-9 rounded-lg flex-row items-center justify-center"
                            style={{ backgroundColor: item.colors[0] }}
                          >
                            <Plus
                              size={13}
                              color="white"
                              strokeWidth={2.6}
                              style={{ marginRight: 5 }}
                            />
                            <Text className="text-white font-bold text-xs">
                              {completed > 0 ? "Continue" : "Start"}
                            </Text>
                          </PressableScale>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      </SafeAreaView>

      {/* Site-only picker — changes the site, nothing else. Date filtering
          lives in the entry and history screens. */}
      <Modal
        visible={sitePickerVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSitePickerVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-center items-center px-6">
          <View className="bg-white dark:bg-slate-900 rounded-[32px] w-full p-6 shadow-2xl max-h-[75%]">
            <View className="flex-row items-center justify-between mb-5">
              <View>
                <Text className="text-slate-900 dark:text-slate-100 text-xl font-bold">
                  Select Site
                </Text>
                <Text className="text-slate-400 text-sm mt-0.5">
                  Switch the site you&apos;re logging for
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSitePickerVisible(false)}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center"
              >
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView
              className="max-h-[420px]"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 10 }}
            >
              {availableSites.length === 0 ? (
                <Text className="text-slate-500 dark:text-slate-400 text-sm py-6 text-center">
                  No sites available.
                </Text>
              ) : (
                availableSites.map((site) => {
                  const active = site.site_code === siteCode;
                  return (
                    <TouchableOpacity
                      key={site.site_code}
                      onPress={async () => {
                        setSitePickerVisible(false);
                        if (active) return;
                        await selectSite(site);
                        setTempRhShiftProgress({
                          A: { completed: 0, total: 0 },
                          B: { completed: 0, total: 0 },
                          C: { completed: 0, total: 0 },
                        });
                        setLogProgress({});
                        fetchLogs(site.site_code);
                      }}
                      className={`flex-row items-center p-4 rounded-2xl border ${
                        active
                          ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/40"
                          : "bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700"
                      }`}
                    >
                      <View
                        className={`w-11 h-11 rounded-xl items-center justify-center mr-4 ${
                          active
                            ? "bg-red-100 dark:bg-red-900/30"
                            : "bg-slate-200/60 dark:bg-slate-700"
                        }`}
                      >
                        <MapPin
                          size={18}
                          color={active ? "#dc2626" : "#94a3b8"}
                        />
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text
                          className="text-slate-900 dark:text-slate-100 font-bold text-base"
                          numberOfLines={1}
                        >
                          {site.site_name || site.site_code}
                        </Text>
                        <Text
                          className="text-slate-400 text-xs"
                          numberOfLines={1}
                        >
                          {site.site_code}
                        </Text>
                      </View>
                      {active && <Check size={20} color="#dc2626" />}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
                      Haptics.selectionAsync().catch(() => {});
                      setShiftModalVisible(false);
                      setRouteParams("/temp-rh", {
                        siteCode,
                        shift: shift.value,
                      });
                      router.push("/temp-rh");
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
