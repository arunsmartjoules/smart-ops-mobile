import React, { useState, useEffect, useCallback, useMemo, memo } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  ScrollView,
  Platform,
  Image,
  Modal,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
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
  Maximize2,
} from "lucide-react-native";
import SiteLogService from "@/services/SiteLogService";
import { format } from "date-fns";
import LogFilterModal from "@/components/sitelogs/LogFilterModal";
import AttendanceService, { type Site } from "@/services/AttendanceService";
import { useAuth } from "@/contexts/AuthContext";
import Skeleton from "@/components/Skeleton";
import { syncEngine } from "@/services/SyncEngine";
import UserLookupService from "@/services/UserLookupService";

// Memoized History Item Component
const HistoryItem = memo(
  ({
    item,
    logName,
    resolvedName,
    onPress,
    onLongPress,
    onPreviewImage,
  }: {
    item: any;
    logName: string;
    resolvedName?: string;
    onPress: () => void;
    onLongPress: () => void;
    onPreviewImage: (url: string) => void;
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
        className="bg-white dark:bg-slate-900 rounded-xl mb-2.5 p-3"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 6,
          elevation: 2,
        }}
      >
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-row items-center flex-1 mr-3">
            <View className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 items-center justify-center mr-2.5">
              <IconComp size={14} color="#64748b" />
            </View>
            <View className="flex-1">
              <Text
                className="text-slate-900 dark:text-slate-50 font-bold text-sm"
                numberOfLines={1}
              >
                {logName === "Chiller Logs"
                  ? item.asset_name || item.chiller_id || "Unknown Asset"
                  : item.task_name ||
                    format(
                      new Date(item.created_at || item.createdAt),
                      "dd MMM yyyy",
                    )}
              </Text>
              <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                {logName === "Chiller Logs"
                  ? format(
                      new Date(
                        item.reading_time || item.created_at || item.createdAt,
                      ),
                      "dd MMM, HH:mm",
                    )
                  : format(
                      new Date(item.created_at || item.createdAt),
                      "HH:mm",
                    )}{" "}
                • {resolvedName || item.executor_id || "Unknown"}
              </Text>
            </View>
          </View>
          <View className="items-end">
            <View
              className={`px-1.5 py-0.5 rounded ${item.isSynced !== false ? "bg-green-50" : "bg-amber-50"}`}
            >
              <Text
                className={`text-[10px] font-bold uppercase tracking-wider ${item.isSynced !== false ? "text-green-600" : "text-amber-600"}`}
              >
                {item.isSynced !== false ? "Synced" : "Pending"}
              </Text>
            </View>
          </View>
        </View>

        <View className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 mb-2">
          {item.log_name === "Temp RH" && (
            <View className="flex-row justify-between">
              <View>
                <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-0.5">
                  Temp
                </Text>
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-sm">
                  {item.temperature}°C
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-0.5">
                  RH
                </Text>
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-sm">
                  {item.rh}%
                </Text>
              </View>
            </View>
          )}
          {item.log_name === "Water" && (
            <View className="flex-row flex-wrap gap-y-1">
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
                  Hard
                </Text>
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-xs">
                  {item.hardness}
                </Text>
              </View>
            </View>
          )}
          {item.log_name === "Chemical Dosing" && (
            <View>
              <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-0.5">
                Dosing
              </Text>
              <Text className="text-slate-900 dark:text-slate-50 font-bold text-xs">
                {item.chemical_dosing}
              </Text>
            </View>
          )}
          {(logName === "Chiller Logs" || item.chiller_id) && (
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Activity size={10} color="#0d9488" />
                <Text className="text-xs font-bold text-teal-600 ml-1">
                  {item.compressor_load_percentage}% LOAD
                </Text>
              </View>
              <Text className="text-slate-400 text-[10px] font-bold">
                ID: {item.chiller_id?.slice(-6) || "N/A"}
              </Text>
            </View>
          )}

          {/* New: Image Thumbnail - Made more compact */}
          {(item.attachment || item.attachments) && (
            <View className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <TouchableOpacity 
                onPress={() => onPreviewImage(item.attachment || item.attachments)}
                className="flex-row items-center"
              >
                <View className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 mr-2.5">
                  <Image 
                    source={{ uri: item.attachment || item.attachments }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                  <View className="absolute inset-0 bg-black/10 items-center justify-center">
                    <Maximize2 size={10} color="white" />
                  </View>
                </View>
                <View className="flex-1">
                  <Text className="text-slate-600 dark:text-slate-400 text-xs" numberOfLines={1}>
                    Tap to preview attachment
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View className="flex-row items-center justify-between mt-1 pt-2 border-t border-slate-100 dark:border-slate-800">
          <View className="flex-row items-center">
            <MapPin size={10} color="#94a3b8" />
            <Text className="text-slate-400 text-xs ml-1">
              {item.site_code}
            </Text>
          </View>
          <View
            className={`px-1.5 py-0.5 rounded-full ${logStatus === "Open" || logStatus === "Inprogress" ? "bg-amber-50 dark:bg-amber-900/20" : "bg-green-50 dark:bg-green-900/20"}`}
          >
            <Text
              className={`text-[10px] font-bold ${logStatus === "Open" || logStatus === "Inprogress" ? "text-amber-600" : "text-green-600"}`}
            >
              {logStatus}
            </Text>
          </View>
        </View>
        {item.remarks && (
          <View className="flex-row items-center mt-1.5">
            <Text
              className="text-slate-400 text-xs italic"
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
    status?: string;
  }>();

  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterVisible, setFilterVisible] = useState(false);
  const [selectedShift, setSelectedShift] = useState("");
  const [availableSites, setAvailableSites] = useState<Site[]>([]);

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
        { fromDate: fromDate?.getTime(), toDate: toDate?.getTime() },
      );

      if (data.length > 0) {
        setLogs(data);
        setLoading(false);
        return;
      }

      // Cache empty — pull from API then re-query
      const pullSite = siteCode || "all";
      console.log("[SiteHistory] Cache empty, pulling from API", { pullSite, logName: params.logName });
      try {
        if (params.logName !== "Chiller Logs") {
          await SiteLogService.pullSiteLogs(pullSite, { logName: params.logName });
        } else {
          await SiteLogService.pullChillerReadings(pullSite);
        }
      } catch (e) {
        console.error("[SiteHistory] Pull failed:", e);
      }

      const fresh = await SiteLogService.getLogsByType(
        siteCode,
        params.logName,
        { fromDate: fromDate?.getTime(), toDate: toDate?.getTime() },
      );
      console.log("[SiteHistory] After pull count:", fresh.length);
      setLogs(fresh);
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
      const codes = [...new Set(logs.map((l) => l.executor_id).filter(Boolean))];
      if (codes.length > 0) {
        const names = await UserLookupService.resolveMany(codes);
        setResolvedNames(names);
      }
    };
    resolveCodes();
  }, [logs]);

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const loadSites = async () => {
    if (!user) return;
    try {
      const sites = await AttendanceService.getUserSites(
        user.user_id || user.id,
        "JouleCool",
      );
      setAvailableSites(sites);

      // If no site is selected, or if we just came in and it's empty
      // pick the first one as default (random site requirement)
      if (!siteCode && sites.length > 0) {
        setSiteCode(sites[0].site_code);
      }
    } catch (error) {
      console.error("Error loading sites", error);
    }
  };

  const loadHistory = async () => {
    try {
      setRefreshing(true);
      // Reset TTL for site_logs and chiller_readings so SyncEngine re-fetches them
      await syncEngine.syncNow();

      const requestedSite =
        siteCode === "all" && availableSites.length > 0
          ? availableSites[0].site_code
          : siteCode;

      if (params.logName !== "Chiller Logs") {
        await SiteLogService.pullSiteLogs(requestedSite, {
          logName: params.logName,
          fromDate: fromDate?.getTime(),
          toDate: toDate?.getTime(),
        });
      } else {
        await SiteLogService.pullChillerReadings(requestedSite, {
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
        let logStatus = log.status || "Completed";
        if (logStatus.toLowerCase() === "pending") logStatus = "Open";
        return logStatus.toLowerCase() === selectedStatus.toLowerCase();
      });
    }

    if (selectedShift) {
      filtered = filtered.filter((log) =>
        (log.remarks || "").includes(selectedShift),
      );
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
        const taskStr = (log.task_name || log.taskName || "").toLowerCase();
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
  }, [logs, selectedStatus, searchQuery, selectedShift]);

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
                if (params.logName === "Chiller Logs" || item.chiller_id) {
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
    const name = params.logName?.toLowerCase() || "";
    if (name.includes("temp")) return "/temp-rh"; // Note: changed from temp-rh-entry to match file name if needed
    if (name.includes("water")) return "/water";
    if (name.includes("chemical")) return "/chemical";
    if (name.includes("chiller")) return "/chiller";
    return null;
  }, [params.logName]);

  const renderHistoryItem = useCallback(
    ({ item }: { item: any }) => {
      const route = getRoute();
      const resolvedName = resolvedNames.get(item.executor_id) || item.executor_id;

      return (
        <HistoryItem
          item={item}
          logName={params.logName || "Log"}
          resolvedName={resolvedName}
          onPreviewImage={(url) => setPreviewImage(url)}
          onPress={() => {
            if (route) {
              router.push({
                pathname: route,
                params: {
                  editId: item.id,
                  siteCode: item.site_code || siteCode,
                  areaName: item.task_name || "",
                  chillerId: item.chiller_id || item.equipment_id,
                  mode: "edit",
                },
              });
            }
          }}
          onLongPress={() => handleDelete(item)}
        />
      );
    },
    [getRoute, params.logName, resolvedNames, siteCode, handleDelete, setPreviewImage],
  );


  const handleApplyFilter = useCallback(() => {
    setFilterVisible(false);
    fetchLocalLogs();
  }, [fetchLocalLogs]);

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
              <Text className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
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

          {/* Shift Quick Filters */}
          {params.logName?.toLowerCase()?.includes("temp") && (
            <View className="mt-4">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingRight: 20 }}
              >
                {[
                  { label: "Shift A", value: "1/3" },
                  { label: "Shift B", value: "2/3" },
                  { label: "Shift C", value: "3/3" },
                ].map((shift) => {
                  const isActive = selectedShift === shift.value;
                  return (
                    <TouchableOpacity
                      key={shift.value}
                      onPress={() => {
                        setSelectedShift(isActive ? "" : shift.value);
                      }}
                      className={`mr-2 px-4 py-2 rounded-full border ${
                        isActive
                          ? "bg-red-600 border-red-600"
                          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                      }`}
                    >
                      <Text
                        className={`text-sm font-bold ${
                          isActive ? "text-white" : "text-slate-500"
                        }`}
                      >
                        {shift.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

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
                  }}
                  className={`mr-2 px-4 py-2 rounded-full border ${
                    selectedStatus === status.value
                      ? "bg-red-600 border-red-600"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <Text
                    className={`text-sm font-bold ${
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
          <FlashList
            data={filteredLogs}
            keyExtractor={(item) => item.id}
            renderItem={renderHistoryItem}
            contentContainerStyle={{ padding: 20, paddingBottom: 150 }}
            // @ts-ignore
            estimatedItemSize={120}
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
                    setSelectedShift("");
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
        onApply={handleApplyFilter}
      />
    </View>
  );
}
