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
import { startOfDay, endOfDay, addDays } from "date-fns";
import loggerUtil from "@/utils/logger";
import Skeleton from "@/components/Skeleton";

export default function SiteLogs() {
  const { user } = useAuth();
  const isDark = useColorScheme() === "dark";
  const [loading, setLoading] = useState(true);
  const [logProgress, setLogProgress] = useState<
    Record<string, { total: number; completed: number }>
  >({});
  const [openCounts, setOpenCounts] = useState<Record<string, number>>({});
  const [filterVisible, setFilterVisible] = useState(false);
  const [fromDate, setFromDate] = useState<Date | null>(startOfDay(new Date()));
  const [toDate, setToDate] = useState<Date | null>(endOfDay(new Date()));
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
    const fmt = (d: Date | null) =>
      d
        ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : "Any";
    return `Date: ${fmt(fromDate)} - ${fmt(toDate)}`;
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
          const fromDateObj = startOfDay(addDays(new Date(), -7));
          const toDateObj = endOfDay(addDays(new Date(), 7));
          
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

      // Fetch open/inprogress/pending counts from backend + local progress in parallel
      const [counts, progress] = await Promise.all([
        siteLogService.getOpenCounts(targetSite),
        siteLogService.getCategoryProgress(targetSite, fromDate, toDate),
      ]);
      setOpenCounts(counts);
      setLogProgress(progress);
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
        const fromDateObj = startOfDay(addDays(new Date(), -7));
        const toDateObj = endOfDay(addDays(new Date(), 7));
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
    [isConnected],
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

          <View className="mb-2 self-start px-3 py-1 rounded-full bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40">
            <Text className="text-[11px] font-semibold text-red-700 dark:text-red-300">
              {dateRangePreview}
            </Text>
          </View>

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
                  const pending =
                    item.id === "chiller"
                      ? 0
                      : openCounts[getLogName(item.title)] ??
                        Math.max(0, progress.total - progress.completed);

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
                      <View className="flex-row items-center">
                        <View
                          className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${item.bg}`}
                        >
                          <item.icon size={20} color={item.accent} />
                        </View>

                        <View className="flex-1 min-w-0">
                          <View className="flex-row justify-between items-start gap-2">
                            <Text
                              className="text-slate-900 dark:text-slate-50 font-bold text-[15px] flex-shrink"
                              numberOfLines={2}
                            >
                              {item.title}
                            </Text>
                            {item.id === "chiller" ? (
                              progress.completed > 0 && (
                                <View className="px-2 py-0.5 rounded-lg bg-teal-100 dark:bg-teal-900/30 shrink-0">
                                  <Text className="text-[10px] font-bold text-teal-700 dark:text-teal-400">
                                    {progress.completed} logged
                                  </Text>
                                </View>
                              )
                            ) : (
                              progress.total > 0 && (
                                <View
                                  className={`px-2 py-0.5 rounded-lg shrink-0 ${
                                    pending === 0
                                      ? "bg-emerald-100 dark:bg-emerald-900/25"
                                      : "bg-red-50 dark:bg-red-950/40"
                                  }`}
                                >
                                  <Text
                                    className={`text-[10px] font-bold ${
                                      pending === 0
                                        ? "text-emerald-800 dark:text-emerald-400"
                                        : "text-red-600 dark:text-red-400"
                                    }`}
                                    numberOfLines={1}
                                  >
                                    {pending === 0
                                      ? "All done"
                                      : `${pending} pending`}
                                  </Text>
                                </View>
                              )
                            )}
                          </View>
                          <Text
                            className="text-slate-400 dark:text-slate-500 text-xs mt-1"
                            numberOfLines={1}
                          >
                            {item.subtitle}
                          </Text>
                        </View>
                      </View>

                      <View className="flex-row gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <TouchableOpacity
                          onPress={() => {
                            if (!siteCode) return;

                            // Non-blocking targeted prefetch for Start flow.
                            void siteLogService
                              .prefetchPendingForCategory(siteCode, getLogName(item.title))
                              .then(() => {
                                // Refresh top counters after prefetch completes.
                                void fetchLogs(siteCode);
                              })
                              .catch(() => {});

                            if (item.id === "temp-rh") {
                              setShiftModalVisible(true);
                              // Load pending counts for each shift
                              const today = new Date().toISOString().slice(0, 10);
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
                          }}
                          activeOpacity={0.8}
                          className="flex-1"
                        >
                          <View
                            className="py-2 rounded-md flex-row items-center justify-center"
                            style={{
                              backgroundColor: item.colors[0],
                            }}
                          >
                            <Plus
                              size={14}
                              color="white"
                              strokeWidth={2.5}
                              style={{ marginRight: 5 }}
                            />
                            <Text className="text-white font-bold text-xs">
                              Start
                            </Text>
                          </View>
                        </TouchableOpacity>

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
                          className="flex-1 bg-slate-50 dark:bg-slate-800 py-2 rounded-md flex-row items-center justify-center border border-slate-100 dark:border-slate-700"
                        >
                          <History
                            size={14}
                            color="#64748b"
                            style={{ marginRight: 5 }}
                          />
                          <Text className="text-slate-600 dark:text-slate-300 font-bold text-xs">
                            History
                          </Text>
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
          setOpenCounts({});
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
