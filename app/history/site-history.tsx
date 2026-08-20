import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useDeferredValue,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  ScrollView,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import EmptyState from "@/components/EmptyState";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import {
  ChevronLeft,
  Search,
  Filter,
  History as HistoryIcon,
  X,
  Plus,
} from "lucide-react-native";
import { HistoryLogCard as HistoryItem } from "@/components/sitelogs/HistoryLogCard";
import SiteLogService from "@/services/SiteLogService";
import { format } from "date-fns";
import LogFilterModal from "@/components/sitelogs/LogFilterModal";
import AttendanceService, { type Site } from "@/services/AttendanceService";
import { useAuth } from "@/contexts/AuthContext";
import Skeleton from "@/components/Skeleton";
import UserLookupService from "@/services/UserLookupService";
import { formatAssignee } from "@/utils/assignee";
import { setRouteParams } from "@/utils/routeParams";

// Parse YYYY-MM-DD as a local-calendar date (no UTC shift) and format it.

export default function SiteHistory() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    siteCode: string;
    logName: string; // "Temp RH", "Water", etc.
    status?: string;
    fromDate?: string;
    toDate?: string;
  }>();

  const parseDateParam = useCallback((value?: string) => {
    if (!value) return null;
    const ms = Number(value);
    if (!Number.isFinite(ms)) return null;
    const parsed = new Date(ms);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, []);

  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Deferred copy so the TextInput stays responsive: filteredLogs runs a
  // per-log toLowerCase sweep (and previously a date format) over every log in
  // memory, which lagged typing when the search ran synchronously per keystroke.
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [filterVisible, setFilterVisible] = useState(false);
  const [selectedShift, setSelectedShift] = useState("");
  const [availableSites, setAvailableSites] = useState<Site[]>([]);

  // Filtering states
  const [siteCode, setSiteCode] = useState<string>(params.siteCode || "");
  const [fromDate, setFromDate] = useState<Date | null>(() => parseDateParam(params.fromDate));
  const [toDate, setToDate] = useState<Date | null>(() => parseDateParam(params.toDate));
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [resolvedNames, setResolvedNames] = useState<Map<string, string>>(
    new Map(),
  );

  useEffect(() => {
    loadSites();
    // Mount-only load; loadSites is recreated each render and would loop if included.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSiteCode(params.siteCode || "");
    setFromDate(parseDateParam(params.fromDate));
    setToDate(parseDateParam(params.toDate));
    setSelectedStatus("all");
    setSelectedShift("");
    setSearchQuery("");
  }, [params.siteCode, params.fromDate, params.toDate, parseDateParam]);

  const fetchLocalLogs = useCallback(async (showLoadingSpinner = true) => {
    try {
      if (showLoadingSpinner) setLoading(true);
      
      const data = await SiteLogService.getLogsByType(
        siteCode,
        params.logName,
        { fromDate: fromDate?.getTime(), toDate: toDate?.getTime() },
      );

      if (data.length > 0) {
        setLogs(data);
        if (showLoadingSpinner) setLoading(false);
      }

      // 2. BACKGROUND SYNC: Pull from API
      const pullSite = siteCode || "all";
      console.log("[SiteHistory] Pulling from API in background", { pullSite, logName: params.logName });
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
      setLogs(fresh);
    } catch (error) {
      console.error("Fetch local logs error:", error);
    } finally {
      if (showLoadingSpinner) setLoading(false);
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

  const [, setPreviewImage] = useState<string | null>(null);

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
      await fetchLocalLogs(false);
    } catch (error) {
      console.error("Error refreshing history", error);
    } finally {
      setRefreshing(false);
    }
  };

  const filteredLogs = useMemo(() => {
    let filtered = logs;
    if (selectedShift) {
      filtered = filtered.filter((log) =>
        (log.remarks || "").includes(selectedShift),
      );
    }

    if (deferredSearchQuery.trim()) {
      const q = deferredSearchQuery.toLowerCase();
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
  }, [logs, deferredSearchQuery, selectedShift]);

  const statusSummary = useMemo(() => {
    return filteredLogs.reduce(
      (acc, log) => {
        // Strip [\s_-] so legacy "In-progress" buckets as inprogress, not
        // resolved (otherwise the summary cards over-count Resolved).
        let logStatus = (log.status || "Completed")
          .toLowerCase()
          .replace(/[\s_-]+/g, "");
        if (logStatus === "pending") logStatus = "open";

        if (logStatus === "open") acc.open += 1;
        else if (logStatus === "inprogress") acc.inprogress += 1;
        else acc.resolved += 1;
        return acc;
      },
      { open: 0, inprogress: 0, resolved: 0 },
    );
  }, [filteredLogs]);

  const displayLogs = useMemo(() => {
    if (selectedStatus === "all") return filteredLogs;
    return filteredLogs.filter((log) => {
      let logStatus = (log.status || "Completed")
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
      if (logStatus === "pending") logStatus = "open";
      return logStatus === selectedStatus.toLowerCase().replace(/[\s_-]+/g, "");
    });
  }, [filteredLogs, selectedStatus]);

  const selectedPreviewItems = useMemo(() => {
    const items: string[] = [];
    if (siteCode) items.push(`Site: ${siteCode}`);
    if (fromDate) items.push(`From: ${format(fromDate, "dd MMM yyyy")}`);
    if (toDate) items.push(`To: ${format(toDate, "dd MMM yyyy")}`);
    if (selectedShift) items.push(`Shift: ${selectedShift}`);
    return items;
  }, [siteCode, fromDate, toDate, selectedShift]);

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
              } catch {
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
    // loadHistory is recreated each render; the deps below are its real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Prefer the operator NAME (assigned_to). executor_id is a code and
      // pull-sync injects "system" for rows the server has no executor for —
      // formatAssignee filters those sentinels so we show the resolved name
      // or "Unknown" instead of "SYSTEM".
      const resolvedExecutor =
        resolvedNames.get(item.executor_id) || item.executor_id;
      const resolvedName = formatAssignee(
        item.assigned_to,
        resolvedExecutor,
        "Unknown",
      );

      return (
        <HistoryItem
          item={item}
          logName={params.logName || "Log"}
          resolvedName={resolvedName}
          onPreviewImage={(url) => setPreviewImage(url)}
          onPress={() => {
            if (route) {
              const isChillerRoute = route === "/chiller";
              // /temp-rh, /water, /chemical now read params from the
              // routeParams store (no nav hooks → no teardown crash). The
              // chiller screen still uses URL params, so push as before.
              if (isChillerRoute) {
                router.push({
                  pathname: route,
                  params: {
                    editId: item.id,
                    siteCode: item.site_code || siteCode,
                    chillerId: item.equipment_id || item.chiller_id,
                    mode: "edit",
                  },
                });
              } else {
                setRouteParams(route, {
                  editId: item.id,
                  siteCode: item.site_code || siteCode,
                  mode: "edit",
                });
                router.push(route);
              }
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

          {/* Selected Filters Preview (modal filters: site, dates, shift) */}
          {selectedPreviewItems.length > 0 && (
            <View className="mt-2 flex-row flex-wrap gap-2">
              {selectedPreviewItems.map((item) => (
                <View
                  key={item}
                  className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800"
                >
                  <Text className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                    {item}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Status summary cards — tap to filter; tap again to show all */}
          <View className="mt-3 flex-row gap-2">
            {(
              [
                {
                  key: "open",
                  label: "Open",
                  filterValue: "Open" as const,
                  value: statusSummary.open,
                },
                {
                  key: "inprogress",
                  label: "In progress",
                  filterValue: "Inprogress" as const,
                  value: statusSummary.inprogress,
                },
                {
                  key: "resolved",
                  label: "Resolved",
                  filterValue: "Completed" as const,
                  value: statusSummary.resolved,
                },
              ] as const
            ).map((card) => {
              const isActive = selectedStatus === card.filterValue;
              return (
                <TouchableOpacity
                  key={card.key}
                  activeOpacity={0.85}
                  onPress={() => {
                    setSelectedStatus((prev) =>
                      prev === card.filterValue ? "all" : card.filterValue,
                    );
                  }}
                  className={`flex-1 rounded-xl px-3 py-2.5 border ${
                    isActive
                      ? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60"
                      : "bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700"
                  }`}
                >
                  <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">
                    {card.value}
                  </Text>
                  <Text
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      isActive
                        ? "text-red-700 dark:text-red-400"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {card.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Search — below status cards */}
          <View className="mt-3 flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-2 border border-slate-100 dark:border-slate-800">
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
            <View className="mt-3">
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
            data={displayLogs}
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
              <EmptyState
                icon={HistoryIcon}
                title="No records found"
                subtitle={
                  searchQuery
                    ? "Try a different search term"
                    : "Try adjusting your filters"
                }
                action={{
                  label: "Clear All Filters",
                  onPress: () => {
                    setSearchQuery("");
                    setSelectedShift("");
                    setSelectedStatus("all");
                    setFromDate(null);
                    setToDate(null);
                    setSiteCode(params.siteCode || "");
                  },
                }}
              />
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
