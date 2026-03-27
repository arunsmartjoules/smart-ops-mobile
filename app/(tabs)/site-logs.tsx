import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Modal,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import NetInfo from "@react-native-community/netinfo";
import SiteLogService from "@/services/SiteLogService";
import LogFilterModal from "@/components/sitelogs/LogFilterModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import {
  Filter,
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
import AttendanceService, { type Site } from "@/services/AttendanceService";
import { useSites } from "@/hooks/useSites";
import { db } from "@/database";
import { eq } from "drizzle-orm";
import logger from "@/utils/logger";
import Skeleton from "@/components/Skeleton";

export default function SiteLogs() {
  const { user } = useAuth();
  const isDark = useColorScheme() === "dark";
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logProgress, setLogProgress] = useState<
    Record<string, { total: number; completed: number }>
  >({});
  const [openCounts, setOpenCounts] = useState<Record<string, number>>({});
  const [filterVisible, setFilterVisible] = useState(false);
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const lastSyncRef = React.useRef<Record<string, number>>({});
  const refreshingRef = useRef(false);
  const fetchLogsRef = useRef<((targetSite: string) => Promise<void>) | null>(null);
  const [shiftModalVisible, setShiftModalVisible] = useState(false);
  const { isConnected } = useNetworkStatus();

  // ── Clean sites hook ──────────────────────────────────────────────────────
  const userId = user?.user_id || user?.id;
  const { sites: availableSites, selectedSite, selectSite } = useSites(userId);
  const siteCode = selectedSite?.site_code ?? null;
  const siteName = selectedSite?.name ?? selectedSite?.site_code ?? "Select Site";

  // Safety timer to clear loading no matter what
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(prev => {
        if (prev) logger.debug("SiteLogs safety timeout triggered", { module: "SITE_LOGS_SCREEN" });
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
          const pullOptions = {
            fromDate: fromDate?.getTime(),
            toDate: toDate?.getTime(),
          };
          await Promise.all([
            SiteLogService.pullSiteLogs(targetSite, pullOptions),
            SiteLogService.pullChillerReadings(targetSite, pullOptions),
            SiteLogService.pullLogMaster(),
          ]);
          lastSyncRef.current = { ...lastSyncRef.current, [targetSite]: now };
        } catch (e) {
          console.log("Sync warning", e);
        }
      }

      // Fetch open/inprogress/pending counts from backend + local progress in parallel
      const [counts, progress] = await Promise.all([
        SiteLogService.getOpenCounts(targetSite),
        SiteLogService.getCategoryProgress(targetSite, fromDate, toDate),
      ]);
      setOpenCounts(counts);
      setLogProgress(progress);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [fromDate, toDate, isConnected]);

  // Keep a stable ref to the latest fetchLogs so useFocusEffect doesn't re-register
  useEffect(() => {
    fetchLogsRef.current = fetchLogs;
  }, [fetchLogs]);

  // Fetch logs whenever siteCode or date filters change
  useEffect(() => {
    if (siteCode) fetchLogs(siteCode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteCode, fromDate, toDate]);

  useFocusEffect(
    useCallback(() => {
      // Don't re-fetch on focus if we synced within the last 30 seconds
      // This prevents count flickering when returning from a log entry screen
      if (siteCode) {
        const lastSync = lastSyncRef.current[siteCode] || 0;
        const age = Date.now() - lastSync;
        if (age > 30_000) {
          fetchLogsRef.current?.(siteCode);
        }
        // Within 30s: keep existing counts — no refresh to avoid flicker from auto-syncs
      }
    }, [siteCode]),
  );

  const onRefresh = () => {
    refreshingRef.current = true;
    setRefreshing(true);
    if (siteCode) fetchLogs(siteCode);
  };

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

          {/* Stats Bar */}
          <View className="flex-row gap-2">
            {loading
              ? [1, 2, 3, 4].map((i) => (
                  <Skeleton
                    key={i}
                    height={80}
                    style={{ flex: 1, borderRadius: 12 }}
                  />
                ))
              : categories.map((cat) => {
                  const progress = logProgress[getLogName(cat.title)] || {
                    total: 0,
                    completed: 0,
                  };
                  // For Temp/Water/Chemical: show open+inprogress+pending count from backend
                  // For Chiller: show completed count from local progress
                  const displayCount = cat.id === "chiller"
                    ? progress.completed
                    : (openCounts[getLogName(cat.title)] ?? Math.max(0, progress.total - progress.completed));
                  return (
                    <View
                      key={cat.id}
                      className="flex-1 bg-white dark:bg-slate-900 rounded-xl p-3"
                      style={{
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.05,
                        shadowRadius: 4,
                        elevation: 2,
                      }}
                    >
                      <View
                        className={`w-8 h-8 rounded-lg items-center justify-center mb-2 ${cat.bg}`}
                      >
                        <cat.icon size={16} color={cat.accent} />
                      </View>
                      <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">
                        {displayCount}
                      </Text>
                      <Text
                        className="text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-tight"
                        numberOfLines={1}
                      >
                        {cat.id === "chiller" ? "Logged" : (cat.shortTitle || cat.title)}
                      </Text>
                    </View>
                  );
                })}
          </View>
        </View>

        <ScrollView
          className="flex-1 px-5 pt-6"
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#dc2626"
            />
          }
        >
          {loading ? (
            <View>
              <Skeleton height={20} width={120} style={{ marginBottom: 20 }} />
              {[1, 2, 3, 4].map((i) => (
                <Skeleton
                  key={i}
                  height={140}
                  style={{ marginBottom: 16, borderRadius: 16 }}
                />
              ))}
            </View>
          ) : (
            <>
              <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg mb-4">
                Log Categories
              </Text>

              {categories.map((item) => {
                const progress = logProgress[getLogName(item.title)] || {
                  total: 0,
                  completed: 0,
                };
                const pending = item.id === "chiller"
                  ? 0
                  : (openCounts[getLogName(item.title)] ?? Math.max(0, progress.total - progress.completed));

                return (
                  <View
                    key={item.id}
                    className="bg-white dark:bg-slate-900 rounded-xl p-4 mb-3"
                    style={{
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.05,
                      shadowRadius: 4,
                      elevation: 2,
                    }}
                  >
                    <View className="flex-row items-center mb-4">
                      <View
                        className={`w-10 h-10 rounded-lg items-center justify-center mr-3 ${item.bg}`}
                      >
                        <item.icon size={20} color={item.accent} />
                      </View>

                      <View className="flex-1">
                        <View className="flex-row justify-between items-center">
                          <Text className="text-slate-900 dark:text-slate-50 font-bold text-base">
                            {item.title}
                          </Text>
                          {item.id === "chiller" ? (
                            progress.completed > 0 && (
                              <View className="px-2 py-0.5 rounded-md bg-teal-100 dark:bg-teal-900/30">
                                <Text className="text-xs font-bold text-teal-700 dark:text-teal-400">
                                  {progress.completed} Logged
                                </Text>
                              </View>
                            )
                          ) : (
                            progress.total > 0 && (
                              <View
                                className={`px-2 py-0.5 rounded-md ${pending === 0 ? "bg-green-100" : "bg-red-50"}`}
                              >
                                <Text
                                  className={`text-xs font-bold ${pending === 0 ? "text-green-700" : "text-red-600"}`}
                                >
                                  {pending === 0
                                    ? "All Done"
                                    : `${pending} Pending`}
                                </Text>
                              </View>
                            )
                          )}
                        </View>
                        <Text className="text-slate-400 text-xs mt-0.5">
                          {item.subtitle}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row gap-3">
                      <TouchableOpacity
                        onPress={() => {
                          if (item.id === "temp-rh") {
                            setShiftModalVisible(true);
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
                          className="py-3 rounded-lg flex-row items-center justify-center"
                          style={{
                            backgroundColor: item.colors[0],
                          }}
                        >
                          <Plus
                            size={16}
                            color="white"
                            strokeWidth={2.5}
                            style={{ marginRight: 6 }}
                          />
                          <Text className="text-white font-bold text-sm">
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
                            },
                          })
                        }
                        className="flex-1 bg-slate-50 dark:bg-slate-800 py-3 rounded-lg flex-row items-center justify-center border border-slate-100 dark:border-slate-700"
                      >
                        <History
                          size={16}
                          color="#64748b"
                          style={{ marginRight: 6 }}
                        />
                        <Text className="text-slate-600 dark:text-slate-300 font-bold text-sm">
                          History
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
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
              ].map((shift) => (
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
                  <View className="w-8 h-8 rounded-full bg-slate-200/50 dark:bg-slate-700 items-center justify-center">
                    <Plus size={16} color="#94a3b8" />
                  </View>
                </TouchableOpacity>
              ))}
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
