import React, { useState, useEffect, useCallback, useMemo, memo } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  ScrollView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import {
  ChevronLeft,
  Search,
  Filter,
  MapPin,
  Clock,
  User,
  History as HistoryIcon,
  X,
  Plus,
  Activity,
  Thermometer,
  Droplets,
  FlaskRound,
  Snowflake,
} from "lucide-react-native";
import SiteLogService from "@/services/SiteLogService";
import { format } from "date-fns";
import LogFilterModal from "@/components/sitelogs/LogFilterModal";
import AttendanceService, { type Site } from "@/services/AttendanceService";
import { useAuth } from "@/contexts/AuthContext";
import Skeleton from "@/components/Skeleton";
import { syncManager } from "@/services/SyncManager";
import UserLookupService from "@/services/UserLookupService";

// Memoized History Item Component
const HistoryItem = memo(
  ({
    item,
    logName,
    resolvedName,
    onPress,
    onLongPress,
  }: {
    item: any;
    logName: string;
    resolvedName?: string;
    onPress: () => void;
    onLongPress: () => void;
  }) => {
    const getLogIcon = () => {
      if (logName === "Temp RH") return Thermometer;
      if (logName === "Water") return Droplets;
      if (logName === "Chemical Dosing") return FlaskRound;
      if (logName === "Chiller Logs") return Snowflake;
      return HistoryIcon;
    };

    const IconComp = getLogIcon();
    const logStatus = item.status || "Completed";

    return (
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.7}
        className="bg-white dark:bg-slate-900 rounded-2xl mb-4 p-4"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.04,
          shadowRadius: 10,
          elevation: 3,
        }}
      >
        <View className="flex-row justify-between items-start mb-3">
          <View className="flex-row items-center flex-1 mr-3">
            <View className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 items-center justify-center mr-3">
              <IconComp size={16} color="#64748b" />
            </View>
            <View className="flex-1">
              <Text
                className="text-slate-900 dark:text-slate-50 font-bold text-sm"
                numberOfLines={2}
              >
                {logName === "Chiller Logs"
                  ? item.assetName || item.chillerId || "Unknown Asset"
                  : item.taskName ||
                    format(
                      new Date(item.created_at || item.createdAt),
                      "dd MMM yyyy",
                    )}
              </Text>
              <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                {logName === "Chiller Logs"
                  ? format(
                      new Date(
                        item.reading_time || item.created_at || item.createdAt,
                      ),
                      "dd MMM yyyy, HH:mm",
                    )
                  : format(
                      new Date(item.created_at || item.createdAt),
                      "HH:mm",
                    )}{" "}
                • {resolvedName || item.executorId || "Unknown"}
              </Text>
            </View>
          </View>
          <View className="items-end">
            <View
              className={`px-2 py-1 rounded-md ${item.isSynced ? "bg-green-50" : "bg-amber-50"}`}
            >
              <Text
                className={`text-[9px] font-bold uppercase tracking-wider ${item.isSynced ? "text-green-600" : "text-amber-600"}`}
              >
                {item.isSynced ? "Synced" : "Pending Sync"}
              </Text>
            </View>
          </View>
        </View>

        <View className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 mb-3">
          {item.logName === "Temp RH" && (
            <View className="flex-row justify-between">
              <View>
                <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-1">
                  Temperature
                </Text>
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-sm">
                  {item.temperature}°C
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-1">
                  Humidity
                </Text>
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-sm">
                  {item.rh}% RH
                </Text>
              </View>
            </View>
          )}
          {item.logName === "Water" && (
            <View className="flex-row flex-wrap gap-y-2">
              <View className="w-1/3">
                <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-0.5">
                  TDS
                </Text>
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-xs">
                  {item.tds}
                </Text>
              </View>
              <View className="w-1/3">
                <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-0.5">
                  pH
                </Text>
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-xs">
                  {item.ph}
                </Text>
              </View>
              <View className="w-1/3 items-end">
                <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-0.5">
                  Hardness
                </Text>
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-xs">
                  {item.hardness}
                </Text>
              </View>
            </View>
          )}
          {item.logName === "Chemical Dosing" && (
            <View>
              <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-1">
                Chemical Dosing
              </Text>
              <Text className="text-slate-900 dark:text-slate-50 font-bold text-sm">
                {item.chemicalDosing}
              </Text>
            </View>
          )}
          {(logName === "Chiller Logs" || item.chillerId) && (
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Activity size={12} color="#0d9488" />
                <Text className="text-[11px] font-bold text-teal-600 ml-1.5">
                  {item.compressorLoadPercentage}% LOAD
                </Text>
              </View>
              <Text className="text-slate-400 text-[10px] font-bold">
                ID: {item.chillerId}
              </Text>
            </View>
          )}
        </View>

        <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-slate-50 dark:border-slate-800">
          <View className="flex-row items-center">
            <MapPin size={12} color="#94a3b8" />
            <Text className="text-slate-400 text-[10px] ml-1">
              {item.siteCode}
            </Text>
            {item.assignedTo && (
              <>
                <Text className="text-slate-300 dark:text-slate-600 mx-2">
                  |
                </Text>
                <User size={12} color="#94a3b8" />
                <Text className="text-slate-400 text-[10px] ml-1">
                  {item.assignedTo}
                </Text>
              </>
            )}
          </View>
          <View
            className={`px-2 py-0.5 rounded-full ${logStatus === "Open" || logStatus === "Inprogress" ? "bg-amber-100 dark:bg-amber-900/30" : "bg-green-100 dark:bg-green-900/30"}`}
          >
            <Text
              className={`text-[10px] font-bold ${logStatus === "Open" || logStatus === "Inprogress" ? "text-amber-600" : "text-green-600"}`}
            >
              {logStatus}
            </Text>
          </View>
        </View>
        {item.remarks && (
          <View className="flex-row items-center mt-2">
            <Text
              className="text-slate-400 text-[10px] italic"
              numberOfLines={1}
            >
              "{item.remarks}"
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.isSynced === nextProps.item.isSynced &&
      prevProps.item.status === nextProps.item.status &&
      prevProps.resolvedName === nextProps.resolvedName
    );
  },
);

export default function SiteHistory() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    siteCode: string;
    logName: string; // "Temp RH", "Water", etc.
  }>();

  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterVisible, setFilterVisible] = useState(false);
  const [availableSites, setAvailableSites] = useState<Site[]>([]);

  // Pagination state
  const [visibleCount, setVisibleCount] = useState(50);
  const PAGE_SIZE = 50;

  // Filtering states
  const [siteCode, setSiteCode] = useState<string>(params.siteCode || "");
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [resolvedNames, setResolvedNames] = useState<Map<string, string>>(
    new Map(),
  );

  useEffect(() => {
    loadSites();
  }, []);

  const fetchLocalLogs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await SiteLogService.getLogsByType(
        siteCode,
        params.logName,
        {
          fromDate: fromDate?.getTime(),
          toDate: toDate?.getTime(),
        },
      );
      setLogs(data);
    } catch (error) {
      console.error("Fetch local logs error:", error);
    } finally {
      setLoading(false);
    }
  }, [siteCode, params.logName, fromDate, toDate]);

  // Reload data every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchLocalLogs();
    }, [fetchLocalLogs]),
  );

  // Resolve employee codes to names
  useEffect(() => {
    const resolveCodes = async () => {
      const codes = [...new Set(logs.map((l) => l.executorId).filter(Boolean))];
      if (codes.length > 0) {
        const names = await UserLookupService.resolveMany(codes);
        setResolvedNames(names);
      }
    };
    resolveCodes();
  }, [logs]);

  const loadSites = async () => {
    if (!user) return;
    try {
      const sites = await AttendanceService.getUserSites(
        user.user_id || user.id,
        "JouleCool",
      );
      setAvailableSites(sites);
    } catch (error) {
      console.error("Error loading sites", error);
    }
  };

  const loadHistory = async () => {
    try {
      setRefreshing(true);
      await syncManager.triggerSync("manual");
      await SiteLogService.pullChillerReadings(siteCode, {
        fromDate: fromDate?.getTime(),
        toDate: toDate?.getTime(),
      });
      if (params.logName !== "Chiller Logs") {
        await SiteLogService.pullSiteLogs(siteCode, {
          logName: params.logName,
          fromDate: fromDate?.getTime(),
          toDate: toDate?.getTime(),
        });
      }
      await fetchLocalLogs();
    } catch (error) {
      console.error("Error refreshing history", error);
    } finally {
      setRefreshing(false);
    }
  };

  const filteredLogs = useMemo(() => {
    let filtered = logs;

    if (selectedStatus !== "all") {
      filtered = filtered.filter((log) => {
        const logStatus = log.status || "Completed";
        return logStatus.toLowerCase() === selectedStatus.toLowerCase();
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((log) => {
        const dateStr = format(
          new Date(log.created_at || log.createdAt),
          "dd MMM yyyy",
        ).toLowerCase();
        const userStr = (log.executorId || "").toLowerCase();
        const remarksStr = (log.remarks || "").toLowerCase();
        const taskStr = (log.taskName || "").toLowerCase();
        const chillerStr = (log.chillerId || "").toLowerCase();

        return (
          dateStr.includes(q) ||
          userStr.includes(q) ||
          remarksStr.includes(q) ||
          taskStr.includes(q) ||
          chillerStr.includes(q)
        );
      });
    }

    return filtered;
  }, [logs, selectedStatus, searchQuery]);

  const paginatedLogs = useMemo(() => {
    return filteredLogs.slice(0, visibleCount);
  }, [filteredLogs, visibleCount]);

  const loadMore = useCallback(() => {
    if (visibleCount < filteredLogs.length) {
      setVisibleCount((prev) => prev + PAGE_SIZE);
    }
  }, [visibleCount, filteredLogs.length]);

  const handleDelete = useCallback(
    async (item: any) => {
      Alert.alert(
        "Delete Record",
        "Are you sure you want to delete this record? This action cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                if (params.logName === "Chiller Logs" || item.chillerId) {
                  await SiteLogService.deleteChillerReading(item.id);
                } else {
                  await SiteLogService.deleteSiteLog(item.id);
                }
                setLogs((prev) => prev.filter((l) => l.id !== item.id));
                Alert.alert("Success", "Record deleted successfully");
              } catch (e) {
                Alert.alert("Error", "Failed to delete record");
              }
            },
          },
        ],
      );
    },
    [params.logName],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHistory();
  }, [siteCode, fromDate, toDate]);

  const getRoute = useCallback(() => {
    if (params.logName === "Temp RH") return "/temp-rh-entry";
    if (params.logName === "Water") return "/water-entry";
    if (params.logName === "Chemical Dosing") return "/chemical-entry";
    if (params.logName === "Chiller Logs") return "/chiller";
    return null;
  }, [params.logName]);

  const renderHistoryItem = useCallback(
    ({ item }: { item: any }) => {
      const route = getRoute();
      const resolvedName = resolvedNames.get(item.executorId);

      return (
        <HistoryItem
          item={item}
          logName={params.logName}
          resolvedName={resolvedName}
          onPress={() => {
            if (route) {
              router.push({
                pathname: route,
                params: {
                  id: item.id,
                  siteCode: item.siteCode || siteCode,
                  areaName: item.taskName || "",
                  chillerId: item.chillerId || item.equipmentId,
                  mode: "edit",
                },
              });
            }
          }}
          onLongPress={() => handleDelete(item)}
        />
      );
    },
    [getRoute, params.logName, resolvedNames, siteCode, handleDelete],
  );

  const renderFooter = () => (
    <View className="pb-10">
      {visibleCount < filteredLogs.length && (
        <ActivityIndicator size="small" color="#dc2626" className="py-4" />
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" edges={["top"]}>
        {/* Header content ... (same as before) */}
        <View className="bg-white dark:bg-slate-900 px-5 pt-2 pb-4 border-b border-slate-100 dark:border-slate-800">
          <View className="flex-row items-center justify-between mb-4">
            <TouchableOpacity
              onPress={() => router.back()}
              className="w-10 h-10 items-center justify-center rounded-full bg-slate-50 dark:bg-slate-800"
            >
              <ChevronLeft size={20} color="#0f172a" />
            </TouchableOpacity>
            <View className="items-center">
              <Text className="text-lg font-bold text-slate-900 dark:text-slate-50 text-center">
                {params.logName} History
              </Text>
              <Text className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
                {siteCode} Logs
              </Text>
            </View>
            <View className="flex-row items-center">
              {params.logName === "Chiller Logs" && (
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: "/chiller",
                      params: { siteCode, isNew: "true" },
                    })
                  }
                  className="w-10 h-10 items-center justify-center rounded-xl bg-teal-50 dark:bg-teal-900/30 mr-2"
                >
                  <Plus size={20} color="#0d9488" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setFilterVisible(true)}
                className={`w-10 h-10 items-center justify-center rounded-xl ${fromDate || siteCode !== params.siteCode ? "bg-red-50" : "bg-slate-50 dark:bg-slate-800"}`}
              >
                <Filter
                  size={18}
                  color={
                    fromDate || siteCode !== params.siteCode
                      ? "#dc2626"
                      : "#64748b"
                  }
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Search Bar */}
          <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-2 border border-slate-100 dark:border-slate-800">
            <Search size={18} color="#94a3b8" />
            <TextInput
              placeholder="Search by date, user, or remarks..."
              value={searchQuery}
              onChangeText={(t) => {
                setSearchQuery(t);
                setVisibleCount(PAGE_SIZE);
              }}
              className="flex-1 ml-3 h-10 text-sm font-medium text-slate-900 dark:text-slate-50"
              placeholderTextColor="#94a3b8"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <X size={16} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Quick Status Filters */}
          <View className="mt-4">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: 20 }}
            >
              {[
                { label: "All", value: "all" },
                { label: "Open", value: "Open" },
                { label: "In Progress", value: "Inprogress" },
                { label: "Completed", value: "Completed" },
              ].map((status) => (
                <TouchableOpacity
                  key={status.value}
                  onPress={() => {
                    setSelectedStatus(status.value);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  className={`mr-2 px-4 py-2 rounded-full border ${
                    selectedStatus === status.value
                      ? "bg-red-600 border-red-600"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      selectedStatus === status.value
                        ? "text-white"
                        : "text-slate-500"
                    }`}
                  >
                    {status.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        {loading ? (
          <View className="flex-1 px-5 pt-6">
            {[1, 2, 3, 4].map((i) => (
              <View
                key={i}
                className="mb-4 bg-white dark:bg-slate-900 rounded-2xl p-4"
              >
                <View className="flex-row justify-between mb-4">
                  <Skeleton width={120} height={15} />
                  <Skeleton width={60} height={15} />
                </View>
                <Skeleton width="100%" height={80} borderRadius={12} />
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            data={paginatedLogs}
            keyExtractor={(item) => item.id}
            renderItem={renderHistoryItem}
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            removeClippedSubviews={Platform.OS === "android"}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            ListFooterComponent={renderFooter}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={["#dc2626"]}
              />
            }
            ListEmptyComponent={
              <View className="py-20 items-center justify-center">
                <View className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center mb-4">
                  <HistoryIcon size={36} color="#cbd5e1" />
                </View>
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg text-center">
                  No records found
                </Text>
                <Text className="text-slate-400 dark:text-slate-500 text-sm mt-1 text-center px-10">
                  {searchQuery
                    ? "Try a different search term"
                    : "Try adjusting your filters"}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setSearchQuery("");
                    setFromDate(null);
                    setToDate(null);
                    setSiteCode(params.siteCode || "");
                  }}
                  className="mt-6 px-6 py-3 bg-red-600 rounded-xl"
                >
                  <Text className="text-white font-bold">
                    Clear All Filters
                  </Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
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
        onSiteSelect={(id) => setSiteCode(id)}
        onApply={() => setFilterVisible(false)}
      />
    </View>
  );
}
