import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TextInput,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ListChecks,
  Wrench,
  ChevronRight,
  Filter,
  RefreshCw,
  WifiOff,
  MapPin,
  ChevronDown,
  Clock,
  Briefcase,
  AlertCircle,
  CheckCircle2,
  Search,
  ChevronLeft,
  Calendar as CalendarIcon,
  QrCode,
  X,
} from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import NetInfo from "@react-native-community/netinfo";
import PMService from "@/services/PMService";
import { useAutoSync } from "@/hooks/useAutoSync";
import { AttendanceService, type Site } from "@/services/AttendanceService";
import { useSites } from "@/hooks/useSites";
import { db, pmInstances } from "@/database";
import { eq } from "drizzle-orm";
import {
  format,
  addDays,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  parseISO,
  isValid,
} from "date-fns";
import AdvancedFilterModal from "@/components/AdvancedFilterModal";
import QRScannerModal, { type QRScannerRef } from "@/components/QRScannerModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/utils/logger";
import Skeleton from "@/components/Skeleton";

type PMInstanceRow = typeof pmInstances.$inferSelect;

// Constants
const PAGE_SIZE = 20;

const safeFormat = (date: any, formatStr: string) => {
  if (!date) return "N/A";
  let d: Date;
  if (date instanceof Date) {
    d = date;
  } else if (typeof date === "number") {
    d = new Date(date);
  } else if (typeof date === "string") {
    if (/^\d+$/.test(date)) {
      d = new Date(parseInt(date, 10));
    } else {
      d = parseISO(date);
    }
  } else {
    d = new Date(date);
  }

  if (!isValid(d)) return "Invalid Date";
  return format(d, formatStr);
};

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> =
  {
    Pending: { bg: "#fffbeb", text: "#d97706", dot: "#fbbf24" },
    "In-progress": { bg: "#fff7ed", text: "#c2410c", dot: "#f97316" },
    Completed: { bg: "#f0fdf4", text: "#15803d", dot: "#22c55e" },
    Overdue: { bg: "#fef2f2", text: "#dc2626", dot: "#ef4444" },
  };

const STATUS_OPTIONS = ["Pending", "In-progress", "Completed"];

// ─── PMSkeleton ──────────────────────────────────────────────────────────────
const PMSkeleton = () => {
  const isDark = useColorScheme() === "dark";
  const cardBg = isDark ? "#0f172a" : "#fff";
  const cardBorder = isDark ? "#1e293b" : "#f1f5f9";
  return (
    <View style={styles.listContent}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          className="rounded-2xl p-3 mb-2 border"
          style={{ backgroundColor: cardBg, borderColor: cardBorder }}
        >
          <View className="flex-row justify-between mb-2">
            <Skeleton width={60} height={14} borderRadius={6} />
            <Skeleton width={50} height={14} borderRadius={6} />
          </View>
          <View className="flex-row items-center">
            <Skeleton
              width={40}
              height={40}
              borderRadius={10}
              style={{ marginRight: 10 }}
            />
            <View className="flex-1">
              <Skeleton width="50%" height={14} style={{ marginBottom: 4 }} />
              <Skeleton width="40%" height={12} />
            </View>
          </View>
          <View className="mt-2 pt-2 border-t border-slate-50 dark:border-slate-800 flex-row justify-between">
            <Skeleton width={80} height={12} />
            <Skeleton width={60} height={12} />
          </View>
        </View>
      ))}
    </View>
  );
};

// ─── Memoized PM Card ──────────────────────────────────────────────────────────
const PMCard = React.memo(
  ({
    instance,
    onPress,
    showCompletedDate,
  }: {
    instance: PMInstanceRow;
    onPress: () => void;
    showCompletedDate?: boolean;
  }) => {
    const isDark = useColorScheme() === "dark";
    const statusInfo =
      STATUS_COLORS[instance.status] || STATUS_COLORS["Pending"];

    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        className="bg-white dark:bg-slate-900 mb-2 border border-slate-100 dark:border-slate-800 rounded-2xl p-3"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0 : 0.04,
          shadowRadius: 6,
          elevation: 2,
        }}
      >
        <View className="flex-row items-center justify-between mb-1.5">
          <View className="bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex-row items-center px-1.5 py-0.5 rounded-lg gap-1">
            <Clock size={10} color={isDark ? "#94a3b8" : "#64748b"} />
            <Text className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase">
              {instance.frequency || "ONCE"}
            </Text>
          </View>
          <View
            className="px-2 py-0.5 rounded-md"
            style={{
              backgroundColor: isDark ? statusInfo.bg + "20" : statusInfo.bg,
            }}
          >
            <Text
              style={{
                fontSize: 9,
                fontWeight: "700",
                color: isDark ? statusInfo.dot : statusInfo.text,
              }}
            >
              {instance.status}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center">
          <View
            className="w-10 h-10 rounded-xl items-center justify-center mr-3"
            style={{
              backgroundColor: isDark
                ? statusInfo.dot + "20"
                : statusInfo.bg + "40",
            }}
          >
            <Wrench size={18} color={statusInfo.dot} />
          </View>
          <View className="flex-1">
            <Text
              className="text-slate-900 dark:text-slate-50 text-[13px] font-bold"
              numberOfLines={1}
            >
              {instance.asset_id || "Unknown Asset"}
            </Text>
            <Text
              className="text-slate-500 dark:text-slate-400 text-[11px]"
              numberOfLines={1}
            >
              {instance.title}
            </Text>
          </View>
          <ChevronRight size={14} color="#cbd5e1" />
        </View>

        <View className="mt-2 pt-2 border-t border-slate-50 dark:border-slate-800 flex-row items-center justify-between flex-wrap gap-y-1">
          <View className="flex-row items-center gap-1.5 flex-shrink max-w-[65%]">
            <Clock size={10} color="#94a3b8" />
            <Text
              className="text-slate-400 dark:text-slate-500 text-[10px] font-medium flex-shrink"
              numberOfLines={1}
            >
              {`Due: ${safeFormat(instance.start_due_date, "d MMM yyyy")}`}
            </Text>
            {showCompletedDate && instance.completed_on ? (
              <Text
                className="text-green-600 dark:text-green-400 text-[10px] font-medium flex-shrink"
                numberOfLines={1}
              >
                {`• Done: ${safeFormat(instance.completed_on, "d MMM")}`}
              </Text>
            ) : null}
          </View>

          {instance.assigned_to_name ? (
            <View className="flex-row items-center gap-1.5 flex-1 justify-end ml-2 max-w-[35%]">
              <View className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center">
                <Text className="text-slate-500 text-[8px] font-bold">
                  {instance.assigned_to_name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text
                className="text-slate-600 dark:text-slate-300 text-[10px] font-bold flex-1"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {instance.assigned_to_name}
              </Text>
            </View>
          ) : (
            <Text className="text-slate-300 dark:text-slate-600 text-[10px] italic">
              Unassigned
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  },
  (prev, next) =>
    prev.instance.id === next.instance.id &&
    prev.instance.status === next.instance.status &&
    prev.instance.progress === next.instance.progress &&
    prev.instance.assigned_to_name === next.instance.assigned_to_name &&
    prev.showCompletedDate === next.showCompletedDate,
);

PMCard.displayName = "PMCard";

// ─── Stat Card ─────────────────────────────────────────────────────────────────
const StatCard = React.memo(
  ({
    icon,
    value,
    label,
    bg,
    color,
    isActive,
    onPress,
  }: {
    icon: React.ReactNode;
    value: number;
    label: string;
    bg: string;
    color: string;
    isActive: boolean;
    onPress: () => void;
  }) => {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        className="flex-1 rounded-xl p-3 bg-white dark:bg-slate-900"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 2,
          borderWidth: isActive ? 1 : 0,
          borderColor: isActive ? color : "transparent",
        }}
      >
        <View
          className="w-8 h-8 rounded-lg items-center justify-center mb-2"
          style={{ backgroundColor: bg }}
        >
          {icon}
        </View>
        <Text className="text-slate-900 dark:text-slate-50 text-xl font-bold">
          {value}
        </Text>
        <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {label}
        </Text>
      </TouchableOpacity>
    );
  },
);

StatCard.displayName = "StatCard";

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function PreventiveMaintenance() {
  const { user } = useAuth();
  const { isConnected } = useNetworkStatus();
  const isDark = useColorScheme() === "dark";

  const [allInstances, setAllInstances] = useState<PMInstanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [serverStats, setServerStats] = useState<any>(null);

  // Pagination State
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 200;

  // ── Clean sites hook ──────────────────────────────────────────────────────
  const userId = user?.user_id || user?.id;
  const {
    sites,
    selectedSite,
    selectSite,
    refresh: refreshSites,
  } = useSites(userId);
  const siteCode = selectedSite?.site_code ?? "";
  const siteName =
    selectedSite?.site_name ?? selectedSite?.site_code ?? "Select Site";

  // Date handling — default to "This Week" (Monday to Sunday)
  const [currentDate, setCurrentDate] = useState(
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
  );
  const [toDate, setToDate] = useState(
    format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
  );

  const [tempSearch, setTempSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [tempFromDate, setTempFromDate] = useState<string | null>(
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
  );
  const [tempToDate, setTempToDate] = useState<string | null>(
    format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
  );

  // QR filter state
  const qrScannerRef = useRef<QRScannerRef>(null);
  const [qrAssetFilter, setQrAssetFilter] = useState<string | null>(null);

  // Guard against re-fetching while server pull is in progress
  const isFetchingRef = useRef(false);
  const [syncing, setSyncing] = useState(false);

  // Sync temp dates when modal opens
  useEffect(() => {
    if (showFiltersModal) {
      setTempFromDate(currentDate);
      setTempToDate(toDate);
    }
  }, [showFiltersModal, currentDate, toDate]);

  // ── High-Performance Data Loader ──────────────────────────────────────────
  const loadPMData = useCallback(
    async (isInitial = false, currentOffset = 0, showLoadingSpinner = true) => {
      if (!siteCode || siteCode === "all") return;
      const hasRenderedData = allInstances.length > 0;

      // Avoid skeleton flash when data already exists on screen.
      if (isInitial && showLoadingSpinner && !hasRenderedData) {
        setLoading(true);
      }
      if (isInitial) {
        setOffset(0);
        setHasMore(true);
      }

      try {
        // 1. Fetch local cached data
        let local = await PMService.getLocalInstances(siteCode);

        // 2. Fetch pending updates from sync queue to ensure "Self-Healing" UI
        const pendingUpdates = await PMService.getPendingUpdatesMap();
        if (Object.keys(pendingUpdates).length > 0) {
          local = local.map((inst) => {
            const update = pendingUpdates[inst.id];
            if (update) return { ...inst, ...update };
            return inst;
          });
        }

        setAllInstances(local);

        // Fetch Global Stats for the date range
        if (isConnected) {
          PMService.getStats(siteCode, currentDate, toDate)
            .then((data) => {
              if (data) setServerStats(data);
            })
            .catch(() => {});
        }
        setLoading(false);

        // 2. BACKGROUND SYNC: Pull latest from API if online
        // (Now triggered on ANY load from the top, including auto-sync)
        if (isConnected && currentOffset === 0) {
          if (isFetchingRef.current) return;
          isFetchingRef.current = true;

          try {
            const apiData = await PMService.fetchFromAPI(
              siteCode,
              PAGE_SIZE,
              0,
              currentDate,
              toDate,
            );

            if (apiData && apiData.length > 0) {
              // Refresh local state after sync, re-applying any pending updates
              // so locally-completed PMs aren't overwritten by stale server data.
              let freshLocal = await PMService.getLocalInstances(siteCode);
              const freshPending = await PMService.getPendingUpdatesMap();
              if (Object.keys(freshPending).length > 0) {
                freshLocal = freshLocal.map((inst) => {
                  const upd = freshPending[inst.id];
                  return upd ? { ...inst, ...upd } : inst;
                });
              }
              setAllInstances(freshLocal);
              setHasMore(apiData.length === PAGE_SIZE);
            } else {
              let freshLocal = await PMService.getLocalInstances(siteCode);
              const freshPending = await PMService.getPendingUpdatesMap();
              if (Object.keys(freshPending).length > 0) {
                freshLocal = freshLocal.map((inst) => {
                  const upd = freshPending[inst.id];
                  return upd ? { ...inst, ...upd } : inst;
                });
              }
              setAllInstances(freshLocal);
              setHasMore(false);
            }
          } catch (apiErr) {
            // Silently handle sync errors
          } finally {
            isFetchingRef.current = false;
            setRefreshing(false);
          }
        } else if (!isInitial && currentOffset > 0 && isConnected) {
          // Pagination loading
          setLoadingMore(true);
          try {
            const apiData = await PMService.fetchFromAPI(
              siteCode,
              PAGE_SIZE,
              currentOffset,
              currentDate,
              toDate,
            );
            if (apiData) {
              let freshLocal = await PMService.getLocalInstances(siteCode);
              const freshPending = await PMService.getPendingUpdatesMap();
              if (Object.keys(freshPending).length > 0) {
                freshLocal = freshLocal.map((inst) => {
                  const upd = freshPending[inst.id];
                  return upd ? { ...inst, ...upd } : inst;
                });
              }
              setAllInstances(freshLocal);
              setHasMore(apiData.length === PAGE_SIZE);
            }
          } catch (err) {
            // Silently handle
          } finally {
            setLoadingMore(false);
          }
        }
      } catch (err) {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      siteCode,
      currentDate,
      toDate,
      isConnected,
      PAGE_SIZE,
      allInstances.length,
    ],
  );

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || isFetchingRef.current || !isConnected)
      return;
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    loadPMData(false, nextOffset);
  }, [hasMore, loadingMore, offset, loadPMData, isConnected]);

  // Reload when site or filters change
  useEffect(() => {
    if (siteCode) {
      loadPMData(true);
    } else {
      setLoading(false);
      setAllInstances([]);
    }
  }, [siteCode, currentDate, toDate, loadPMData]);

  // Auto-sync for PM tasks (Handles Focus, AppState, and 60s Polling)
  useAutoSync(() => {
    if (siteCode) loadPMData(true, 0, false);
  }, [siteCode, currentDate, toDate]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPMData(true, 0, false);
    setRefreshing(false);
  }, [loadPMData]);

  const handleHeaderManualRefresh = useCallback(async () => {
    if (!isConnected) return;
    // Reload from API (only runs when online) and keep UI stable (no spinner).
    await loadPMData(true, 0, false);
  }, [isConnected, loadPMData]);

  const filteredInstances = useMemo(() => {
    let list = [...allInstances];

    // 1. Apply Status Filter
    if (statusFilter !== "All") {
      list = list.filter((i) => {
        const s = i.status;
        if (statusFilter === "Pending") {
          return s === "Pending" || s === "Overdue";
        }
        if (statusFilter === "In-progress") {
          return (
            s === "In-progress" || s === "In Progress" || s === "Inprogress"
          );
        }
        return s === statusFilter;
      });
    }

    // 2. Apply Search or QR Filter
    if (qrAssetFilter) {
      list = list.filter((i) => i.asset_id === qrAssetFilter);
    } else if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((i) => {
        const dateObj = i.start_due_date ? new Date(i.start_due_date) : null;
        const dueDateStr = dateObj ? format(dateObj, "d MMM yyyy") : "";
        const dueDateISO = dateObj ? format(dateObj, "yyyy-MM-dd") : "";
        const dueDateShort = dateObj ? format(dateObj, "d/M") : "";

        return (
          (i.title && i.title.toLowerCase().includes(q)) ||
          (i.asset_id && i.asset_id.toLowerCase().includes(q)) ||
          (i.asset_type && i.asset_type.toLowerCase().includes(q)) ||
          (dueDateStr && dueDateStr.toLowerCase().includes(q)) ||
          (dueDateISO && dueDateISO.includes(q)) ||
          (dueDateShort && dueDateShort.includes(q))
        );
      });
      // Requirement: text search should not be constrained by date window.
      return list;
    }

    // 3. Apply Date Filter in normal browsing mode (no text/QR search)
    const startRange = startOfDay(parseISO(currentDate)).getTime();
    const endRange = endOfDay(parseISO(toDate)).getTime();
    list = list.filter((i) => {
      if (!i.start_due_date) return false;
      const ts = new Date(i.start_due_date).getTime();
      return ts >= startRange && ts <= endRange;
    });
    return list;
  }, [
    allInstances,
    statusFilter,
    searchQuery,
    qrAssetFilter,
    currentDate,
    toDate,
  ]);

  const stats = useMemo(() => {
    const startRange = startOfDay(parseISO(currentDate)).getTime();
    const endRange = endOfDay(parseISO(toDate)).getTime();

    const rangeInstances = allInstances.filter((i) => {
      if (!i.start_due_date) return false;
      const ts = new Date(i.start_due_date).getTime();
      return ts >= startRange && ts <= endRange;
    });

    const localCount = {
      total: rangeInstances.length,
      pending: rangeInstances.filter((i) => {
        const s = i.status?.toLowerCase() || "";
        return s === "pending" || s === "overdue";
      }).length,
      inProgress: rangeInstances.filter((i) => {
        const s = i.status?.toLowerCase() || "";
        return s === "in-progress" || s === "in progress" || s === "inprogress";
      }).length,
      completed: rangeInstances.filter(
        (i) => i.status?.toLowerCase() === "completed",
      ).length,
    };

    if (serverStats) {
      const serverInProgress =
        (serverStats.byStatus?.["In-progress"] || 0) +
        (serverStats.byStatus?.["In Progress"] || 0) +
        (serverStats.byStatus?.Inprogress || 0);
      const serverCompleted = serverStats.byStatus?.Completed || 0;

      const total = Math.max(serverStats.total, localCount.total);
      const inProgress = Math.max(localCount.inProgress, serverInProgress);
      const completed = Math.max(localCount.completed, serverCompleted);
      const pending = Math.max(0, total - inProgress - completed);

      return { total, pending, inProgress, completed };
    }

    return localCount;
  }, [allInstances, currentDate, toDate, serverStats]);

  const handlePMCardPress = useCallback(
    async (instance: PMInstanceRow) => {
      const normalizedStatus = (instance.status || "").toLowerCase();
      const shouldAutoAssign =
        normalizedStatus === "pending" ||
        normalizedStatus === "open" ||
        normalizedStatus === "in-progress" ||
        normalizedStatus === "in progress" ||
        normalizedStatus === "inprogress";

      // Auto-assign only for active PMs, not completed ones.
      const userName =
        (user?.full_name && user.full_name.trim()) ||
        (user?.name && user.name.trim()) ||
        user?.email ||
        "User";
      if (shouldAutoAssign && instance.assigned_to_name !== userName) {
        await PMService.updateAssignment(instance.id, userName);
        // Optimistic update
        setAllInstances((prev) =>
          prev.map((inst) =>
            inst.id === instance.id
              ? { ...inst, assigned_to_name: userName }
              : inst,
          ),
        );
      }

      router.push({
        pathname: "/pm-execution",
        params: { instanceId: instance.id },
      });
    },
    [user],
  );

  const applyAdvancedFilters = useCallback(() => {
    setSearchQuery(tempSearch);
    if (tempFromDate) setCurrentDate(tempFromDate);
    if (tempToDate) setToDate(tempToDate);
    setShowFiltersModal(false);
  }, [tempSearch, tempFromDate, tempToDate]);

  const handleQRAssetFound = useCallback((assetName: string) => {
    const now = new Date();
    const monthStart = format(
      new Date(now.getFullYear(), now.getMonth(), 1),
      "yyyy-MM-dd",
    );
    const monthEnd = format(
      new Date(now.getFullYear(), now.getMonth() + 1, 0),
      "yyyy-MM-dd",
    );
    setCurrentDate(monthStart);
    setToDate(monthEnd);
    setQrAssetFilter(assetName);
    setSearchQuery("");
  }, []);

  const clearQRFilter = useCallback(() => {
    setQrAssetFilter(null);
    const today = format(new Date(), "yyyy-MM-dd");
    setCurrentDate(addDays(new Date(), -30).toISOString().split("T")[0]);
    setToDate(addDays(new Date(), 30).toISOString().split("T")[0]);
  }, []);

  const renderItem: ListRenderItem<PMInstanceRow> = useCallback(
    ({ item }) => (
      <PMCard
        instance={item}
        onPress={() => handlePMCardPress(item)}
        showCompletedDate={statusFilter === "Completed"}
      />
    ),
    [handlePMCardPress, statusFilter],
  );

  const keyExtractor = useCallback((item: PMInstanceRow) => item.id, []);

  const ListEmpty = useMemo(
    () => (
      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <Wrench size={32} color="#cbd5e1" />
        </View>
        <Text style={styles.emptyTitle}>
          {allInstances.length > 0
            ? `Hidden by Filters (${allInstances.length} Tasks)`
            : "No PM tasks found"}
        </Text>
        <Text style={styles.emptyBody}>
          {allInstances.length > 0
            ? "Try adjusting your filters"
            : "No PM tasks found"}
        </Text>
        {isConnected && !siteCode && (
          <TouchableOpacity
            onPress={async () => {
              await refreshSites();
              if (selectedSite?.site_code) {
                loadPMData(true, 0, false);
              }
            }}
            className="mt-3 bg-red-600 px-4 py-2 rounded-xl"
          >
            <Text className="text-white font-bold">Retry Server Sync</Text>
          </TouchableOpacity>
        )}
      </View>
    ),
    [
      allInstances.length,
      isConnected,
      siteCode,
      refreshSites,
      selectedSite?.site_code,
      loadPMData,
    ],
  );

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#dc2626" />
      </View>
    );
  }, [loadingMore]);

  const renderListHeader = useCallback(
    () => (
      <View style={styles.listHeader}>
        <View style={styles.sectionRow}>
          <View className="flex-row items-center gap-2">
            <Text style={styles.sectionTitle}>Maintenance Tasks</Text>
          </View>
        </View>
      </View>
    ),
    [],
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <View className="px-5 pt-2 pb-2 bg-slate-50 dark:bg-slate-950">
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-1">
              <TouchableOpacity
                onPress={() => setShowFiltersModal(true)}
                className="flex-row items-center"
              >
                <MapPin size={20} color="#dc2626" />
                <Text
                  className="text-slate-900 dark:text-slate-50 text-base font-bold ml-2 mr-1 flex-shrink"
                  numberOfLines={1}
                >
                  {siteName}
                </Text>
                <ChevronDown size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <View className="flex-row items-center gap-2 flex-shrink-0">
              <TouchableOpacity
                disabled={!isConnected}
                onPress={handleHeaderManualRefresh}
                className="w-11 h-11 rounded-xl bg-white dark:bg-slate-900 items-center justify-center"
                style={{
                  opacity: !isConnected ? 0.4 : 1,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.08,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                <RefreshCw
                  size={20}
                  color={!isConnected ? "#94a3b8" : "#dc2626"}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setShowFiltersModal(true)}
                className="flex-shrink-0"
              >
                <View
                  className="w-11 h-11 rounded-xl bg-white dark:bg-slate-900 items-center justify-center"
                  style={{
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.08,
                    shadowRadius: 8,
                    elevation: 3,
                  }}
                >
                  <Filter
                    size={20}
                    color={
                      tempFromDate !== format(new Date(), "yyyy-MM-dd") ||
                      tempToDate !== format(new Date(), "yyyy-MM-dd")
                        ? "#dc2626"
                        : isDark
                          ? "#dc2626"
                          : "#64748b"
                    }
                  />
                </View>
              </TouchableOpacity>
            </View>
          </View>

          <View className="flex-row gap-2 mb-3">
            <StatCard
              icon={<AlertCircle size={14} color="#f97316" />}
              value={stats.pending}
              label="Pending"
              bg="#fff7ed"
              color="#f97316"
              isActive={statusFilter === "Pending"}
              onPress={() => setStatusFilter("Pending")}
            />
            <StatCard
              icon={<Clock size={14} color="#3b82f6" />}
              value={stats.inProgress}
              label="In Progress"
              bg="#eff6ff"
              color="#3b82f6"
              isActive={statusFilter === "In-progress"}
              onPress={() => setStatusFilter("In-progress")}
            />
            <StatCard
              icon={<CheckCircle2 size={14} color="#22c55e" />}
              value={stats.completed}
              label="Completed"
              bg="#f0fdf4"
              color="#22c55e"
              isActive={statusFilter === "Completed"}
              onPress={() => setStatusFilter("Completed")}
            />
          </View>

          <View
            style={styles.searchBarContainer}
            className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
          >
            <Search size={18} color="#94a3b8" />
            <TextInput
              placeholder="Search by ID, asset or name..."
              className="text-slate-900 dark:text-slate-50 font-medium ml-2 flex-1"
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <TouchableOpacity
              onPress={() => qrScannerRef.current?.open()}
              style={[
                styles.qrBtn,
                qrAssetFilter
                  ? { backgroundColor: "#dc2626" }
                  : { backgroundColor: isDark ? "#1e293b" : "#f1f5f9" },
              ]}
            >
              <QrCode size={18} color={qrAssetFilter ? "#fff" : "#64748b"} />
            </TouchableOpacity>
          </View>

          {qrAssetFilter ? (
            <View style={styles.qrChip}>
              <QrCode size={12} color="#dc2626" />
              <Text style={styles.qrChipText} numberOfLines={1}>
                {qrAssetFilter}
              </Text>
              <TouchableOpacity onPress={clearQRFilter} hitSlop={8}>
                <X size={14} color="#dc2626" />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {loading && allInstances.length === 0 ? (
          <PMSkeleton />
        ) : (
          <FlatList
            data={filteredInstances}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            ListEmptyComponent={ListEmpty}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListHeaderComponent={renderListHeader}
            ListFooterComponent={renderFooter}
            refreshControl={
              <RefreshControl
                refreshing={refreshing || (syncing && allInstances.length > 0)}
                onRefresh={onRefresh}
                tintColor="#dc2626"
              />
            }
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={false}
          />
        )}

        <AdvancedFilterModal
          visible={showFiltersModal}
          onClose={() => setShowFiltersModal(false)}
          title="Filter PM Tasks"
          dateMode="date-range"
          statusOptions={STATUS_OPTIONS}
          tempSearch={tempSearch}
          setTempSearch={setTempSearch}
          tempFromDate={tempFromDate}
          setTempFromDate={setTempFromDate}
          tempToDate={tempToDate}
          setTempToDate={setTempToDate}
          sites={sites}
          selectedSiteCode={siteCode}
          setSelectedSiteCode={(code) => {
            const site = sites.find((s) => s.site_code === code);
            if (site) selectSite(site);
          }}
          user={user}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          applyAdvancedFilters={applyAdvancedFilters}
        />

        <QRScannerModal
          ref={qrScannerRef}
          siteCode={siteCode}
          onClose={() => {}}
          onAssetFound={handleQRAssetFound}
        />
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  listHeader: { paddingTop: 2, paddingHorizontal: 20, paddingBottom: 8 },
  listContent: { paddingHorizontal: 20, paddingBottom: 60 },

  // Header
  fixedArea: {
    paddingHorizontal: 20,
    backgroundColor: "transparent",
    paddingBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: "row", alignItems: "center" },
  headerSub: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
    marginBottom: 4,
  },
  siteRow: { flexDirection: "row", alignItems: "center" },
  siteName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
    marginLeft: 8,
    marginRight: 4,
    marginHorizontal: 4,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
  },
  searchBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    height: 46,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  actionIconBtn: {
    width: 46,
    height: 46,
    backgroundColor: "#fff",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  qrBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  qrChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  qrChipText: {
    color: "#dc2626",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
    maxWidth: 200,
  },

  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  sectionCount: { fontSize: 12, fontWeight: "500", color: "#94a3b8" },

  // PM Card
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  freqBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  freqText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    marginLeft: 4,
  },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },

  cardBody: { flexDirection: "row", alignItems: "flex-start" },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  cardBodyText: { flex: 1 },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 2,
  },
  cardSubTitle: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 6,
  },
  attrRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  assetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  assetText: { fontSize: 12, color: "#94a3b8", marginLeft: 4, flexShrink: 1 },
  idBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  idText: { fontSize: 10, color: "#64748b", fontWeight: "600" },
  progressBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  progressText: { fontSize: 10, fontWeight: "700", color: "#64748b" },

  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f8fafc",
  },
  footerLeft: { flexDirection: "row", alignItems: "center", gap: 4 },
  footerText: { fontSize: 12, color: "#94a3b8", marginLeft: 4 },
  footerRight: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  avatarText: { fontSize: 10, fontWeight: "700", color: "#64748b" },
  assigneeName: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "500",
    maxWidth: 100,
  },
  unassigned: { fontSize: 10, color: "#cbd5e1", fontStyle: "italic" },

  // States
  emptyState: { alignItems: "center", paddingTop: 80 },
  emptyIcon: {
    width: 80,
    height: 80,
    backgroundColor: "#f1f5f9",
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  emptyBody: {
    fontSize: 14,
    color: "#94a3b8",
    marginTop: 4,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  footerLoader: { paddingVertical: 20, alignItems: "center" },
});
