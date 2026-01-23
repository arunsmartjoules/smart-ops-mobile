import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import SiteLogService from "@/services/SiteLogService";
import LogFilterModal from "@/components/sitelogs/LogFilterModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
} from "lucide-react-native";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import AttendanceService, { type Site } from "@/services/AttendanceService";
import logger from "@/utils/logger";
import Skeleton from "@/components/Skeleton";
import { LinearGradient } from "expo-linear-gradient";

export default function SiteLogs() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [siteName, setSiteName] = useState<string>("Select Site");
  const [logProgress, setLogProgress] = useState<
    Record<string, { total: number; completed: number }>
  >({});
  const [availableSites, setAvailableSites] = useState<Site[]>([]);
  const [filterVisible, setFilterVisible] = useState(false);
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const { isConnected } = useNetworkStatus();

  const fetchLogs = useCallback(async () => {
    try {
      if (!refreshing) setLoading(true); // Show skeleton on initial load or site switch
      const storageKey = `last_site_${user?.user_id || user?.id}`;
      const lastSite = await AsyncStorage.getItem(storageKey);

      setSiteId(lastSite);

      if (user?.user_id || user?.id) {
        const sites = await AttendanceService.getUserSites(
          user?.user_id || user?.id || "",
        );
        setAvailableSites(sites);
        const currentSite = sites.find((s) => s.site_code === lastSite);
        if (currentSite) setSiteName(currentSite.name);

        if (!lastSite && sites.length > 0) {
          const firstSite = sites[0].site_code;
          if (firstSite) {
            setSiteId(firstSite);
            setSiteName(sites[0].name);
            await AsyncStorage.setItem(storageKey, firstSite);
            fetchLogs();
            return;
          }
        }
      }

      if (lastSite) {
        // ... fetching logic ...
        if (isConnected) {
          try {
            const pullOptions = {
              fromDate: fromDate?.getTime(),
              toDate: toDate?.getTime(),
            };
            await Promise.all([
              SiteLogService.pullSiteLogs(lastSite, pullOptions),
              SiteLogService.pullChillerReadings(lastSite, pullOptions),
            ]);
          } catch (e) {
            console.log("Sync warning", e);
          }
        }
        // Get rich progress counts
        const progress = await SiteLogService.getCategoryProgress(lastSite);
        setLogProgress(progress);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.user_id, refreshing, fromDate, toDate, isConnected]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLogs();
  };

  const getLogName = (title: string) => {
    // Robust mapping
    if (title.includes("Temp")) return "Temp RH";
    if (title.includes("Water")) return "Water";
    if (title.includes("Chemical")) return "Chemical Dosing";
    if (title.includes("Chiller")) return "Chiller Logs";
    return title;
  };

  const categories = [
    {
      id: "temp-rh",
      title: "Temp & Humidity",
      shortTitle: "Temp",
      route: "/log-forms/temp-rh",
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
      route: "/log-forms/chiller",
      subtitle: "Performance Logs",
      icon: Snowflake,
      colors: ["#0d9488", "#14b8a6"],
      bg: "bg-teal-50 dark:bg-teal-900/20",
      accent: "#0d9488",
    },
    {
      id: "water",
      title: "Water Quality",
      shortTitle: "Water",
      route: "/log-forms/water",
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
      route: "/log-forms/chemical",
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
                <MapPin size={22} color="#dc2626" />
                <Text
                  className="text-slate-900 dark:text-slate-50 text-2xl font-bold ml-2 mr-1"
                  numberOfLines={1}
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
              <Filter size={20} color={fromDate ? "#dc2626" : "#64748b"} />
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
                  const pending = Math.max(
                    0,
                    progress.total - progress.completed,
                  );
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
                        {pending}
                      </Text>
                      <Text
                        className="text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-tight"
                        numberOfLines={1}
                      >
                        {cat.shortTitle || cat.title}
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
                const pending = Math.max(
                  0,
                  progress.total - progress.completed,
                );

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
                          {progress.total > 0 && (
                            <View
                              className={`px-2 py-0.5 rounded-md ${pending === 0 ? "bg-green-100" : "bg-red-50"}`}
                            >
                              <Text
                                className={`text-xs font-bold ${pending === 0 ? "text-green-700" : "text-red-600"}`}
                              >
                                {pending === 0
                                  ? "All Done"
                                  : `${pending}/${progress.total} Pending`}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-slate-400 text-xs mt-0.5">
                          {item.subtitle}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row gap-3">
                      <TouchableOpacity
                        onPress={() => router.push(item.route as any)}
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
                            params: { siteId, logName: getLogName(item.title) },
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
        selectedSiteId={siteId}
        onSiteSelect={async (id) => {
          setSiteId(id);
          const s = availableSites.find((site) => site.site_code === id);
          if (s) setSiteName(s.name);
          await AsyncStorage.setItem(
            `last_site_${user?.id || user?.user_id}`,
            id,
          );
          fetchLogs();
        }}
        onApply={() => {
          fetchLogs();
          setFilterVisible(false);
        }}
      />
    </View>
  );
}
