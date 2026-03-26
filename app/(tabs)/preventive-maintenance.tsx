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
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ListChecks,
  Wrench,
  ChevronRight,
  Filter,
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
} from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import NetInfo from "@react-native-community/netinfo";
import PMService from "@/services/PMService";
import { AttendanceService, type Site } from "@/services/AttendanceService";
import { db, pmInstances, userSites } from "@/database";
import { eq } from "drizzle-orm";

type PMInstanceRow = typeof pmInstances.$inferSelect;
import {
  format,
  addDays,
  startOfDay,
  endOfDay,
  parseISO,
  isValid,
} from "date-fns";
import AdvancedFilterModal from "@/components/AdvancedFilterModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/utils/logger";
import Skeleton from "@/components/Skeleton";

// Constants
const PAGE_SIZE = 20;

const safeFormat = (date: any, formatStr: string) => {
  if (!date) return "N/A";
  const d =
    date instanceof Date
      ? date
      : typeof date === "string"
        ? parseISO(date)
        : new Date(date);
  if (!isValid(d)) {
    return "Invalid Date";
  }
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
          style={[
            styles.card,
            { backgroundColor: cardBg, borderColor: cardBorder },
          ]}
        >
          <View style={styles.cardTopRow}>
            <Skeleton width={80} height={18} borderRadius={8} />
            <Skeleton width={70} height={18} borderRadius={8} />
          </View>
          <View style={styles.cardBody}>
            <Skeleton
              width={48}
              height={48}
              borderRadius={16}
              style={{ marginRight: 12 }}
            />
            <View style={{ flex: 1 }}>
              <Skeleton width="60%" height={16} style={{ marginBottom: 6 }} />
              <Skeleton width="40%" height={14} style={{ marginBottom: 10 }} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Skeleton width={60} height={14} />
                <Skeleton width={40} height={14} />
              </View>
            </View>
          </View>
          <View style={styles.cardFooter}>
            <Skeleton width={100} height={14} />
            <Skeleton width={80} height={14} />
          </View>
        </View>
      ))}
    </View>
  );
};

// ─── Memoized PM Card ──────────────────────────────────────────────────────────
const PMCard = React.memo(
  ({ instance, onPress }: { instance: PMInstanceRow; onPress: () => void }) => {
    const isDark = useColorScheme() === "dark";
    const statusInfo =
      STATUS_COLORS[instance.status] || STATUS_COLORS["Pending"];

    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        className="bg-white dark:bg-slate-900 mb-3 border border-slate-100 dark:border-slate-800 rounded-2xl p-4"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0 : 0.04,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <View style={styles.cardTopRow}>
          <View className="bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex-row items-center px-2 py-1 rounded-lg gap-1.5">
            <Clock size={12} color={isDark ? "#94a3b8" : "#64748b"} />
            <Text className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
              {instance.frequency || "ONCE"}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: isDark ? statusInfo.bg + "20" : statusInfo.bg,
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: isDark ? statusInfo.dot : statusInfo.text },
              ]}
            >
              {instance.status}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: isDark
                  ? statusInfo.dot + "20"
                  : statusInfo.bg + "40",
              },
            ]}
          >
            <Wrench size={22} color={statusInfo.dot} />
          </View>
          <View style={styles.cardBodyText}>
            <Text
              className="text-slate-900 dark:text-slate-50 text-base font-bold mb-0.5"
              numberOfLines={1}
            >
              {instance.asset_id || "Unknown Asset"}
            </Text>
            <Text
              className="text-slate-500 dark:text-slate-400 text-sm mb-2"
              numberOfLines={1}
            >
              {instance.title}
            </Text>
            <View className="flex-row items-center gap-2">
              <View className="flex-row items-center gap-1">
                <Briefcase size={12} color="#94a3b8" />
                <Text
                  className="text-slate-400 dark:text-slate-500 text-xs font-medium"
                  numberOfLines={1}
                >
                  {instance.asset_type || "General Asset"}
                </Text>
              </View>
              {instance.maintenance_id ? (
                <View className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                  <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold">
                    ID: {instance.maintenance_id}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <ChevronRight size={18} color="#cbd5e1" />
        </View>

        <View className="mt-4 pt-3 border-t border-slate-50 dark:border-slate-800 flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <Clock size={12} color="#94a3b8" />
            <Text className="text-slate-400 dark:text-slate-500 text-xs font-medium">
              Due:{" "}
              <Text className="text-slate-600 dark:text-slate-300 font-bold">
                {instance.start_due_date
                  ? format(new Date(instance.start_due_date), "d MMM yyyy")
                  : "N/A"}
              </Text>
            </Text>
          </View>
          {instance.assigned_to_name ? (
            <View className="flex-row items-center gap-2">
              <View className="w-6 h-6 rounded-full bg-red-100 items-center justify-center">
                <Text className="text-red-700 text-[10px] font-bold">
                  {instance.assigned_to_name.charAt(0)}
                </Text>
              </View>
              <Text
                className="text-slate-600 dark:text-slate-300 text-xs font-bold"
                numberOfLines={1}
              >
                {instance.assigned_to_name}
              </Text>
            </View>
          ) : (
            <Text className="text-slate-400 dark:text-slate-500 text-xs italic">
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
    prev.instance.progress === next.instance.progress,
);

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

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function PreventiveMaintenance() {
  const { user } = useAuth();
  const { isConnected } = useNetworkStatus();
  const isDark = useColorScheme() === "dark";

  const [allInstances, setAllInstances] = useState<PMInstanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [siteCode, setSiteCode] = useState("");
  const [sites, setSites] = useState<Site[]>([]);
  const [siteName, setSiteName] = useState("Select Site");
  const [showFiltersModal, setShowFiltersModal] = useState(false);

  // Date handling (using strings for consistency and to avoid stale closures)
  const [currentDate, setCurrentDate] = useState(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const [tempSearch, setTempSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [tempFromDate, setTempFromDate] = useState<string | null>(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [tempToDate, setTempToDate] = useState<string | null>(
    format(new Date(), "yyyy-MM-dd"),
  );

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

  // ── Load Sites ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const userId = user?.user_id || user?.id;
    if (userId) loadSites(userId);
  }, [user]);

  const loadSites = async (userId: string) => {
    try {
      const rawLastSiteCode = await AsyncStorage.getItem(`last_site_${userId}`);
      const lastSiteCode = rawLastSiteCode === "all" ? null : rawLastSiteCode;

      // Load sites from local PowerSync-synced DB
      const cachedSiteRows = await db
        .select()
        .from(userSites)
        .where(eq(userSites.user_id, userId))
        .catch(() => []);
      const cachedSites: Site[] = cachedSiteRows.map((r) => ({
        site_code: r.site_code,
        name: r.site_name,
        id: r.site_id || r.id,
      })) as Site[];

      // Only call API when online
      let fetchedUserSites: Site[] = [];
      const netState = await NetInfo.fetch();
      const isActuallyOnline = netState.isConnected === true;

      if (isActuallyOnline) {
        fetchedUserSites = await AttendanceService.getUserSites(
          userId,
          "JouleCool",
        ).catch(() => [] as Site[]);
      }

      const finalSites: Site[] = fetchedUserSites.length > 0 ? fetchedUserSites : cachedSites;

      setSites(finalSites);

      if (finalSites.length > 0) {
        let siteToSelect = lastSiteCode || finalSites[0].site_code;
        if (!finalSites.find((s) => s.site_code === siteToSelect)) {
          siteToSelect = finalSites[0].site_code;
        }
        await AsyncStorage.setItem(`last_site_${userId}`, siteToSelect);
        setSiteCode(siteToSelect);
        const currentSite = finalSites.find(
          (s) => s.site_code === siteToSelect,
        );
        if (currentSite) {
          setSiteName(currentSite.name || currentSite.site_code);
        }
      }
    } catch (error) {
      logger.error("Error loading sites for PM", { error });
    }
  };

  // ── Load Local Data (paginated) ─────────────────────────────────────────────
  const loadLocalData = useCallback(
    async (resetPage = true) => {
      if (!siteCode) return;
      if (resetPage && allInstances.length === 0) setLoading(true);
      try {
        // Fetch for date range
        const fromDateObj = parseISO(currentDate);
        const toDateObj = parseISO(toDate);
        if (!isValid(fromDateObj) || !isValid(toDateObj)) return;
        const fromTs = startOfDay(fromDateObj).getTime();
        const toTs = endOfDay(toDateObj).getTime();

        logger.debug("Loading PM instances", {
          module: "PM",
          siteCode,
          fromDate: currentDate,
          toDate,
          fromTs,
          toTs,
        });

        const data = await PMService.getLocalInstances(
          siteCode,
          undefined,
          undefined,
          undefined,
          fromTs,
          toTs,
        );
        
        logger.info("Loaded PM instances from local DB", {
          module: "PM",
          count: data.length,
          siteCode,
        });
        
        // If no local data and we're online, try fetching from API
        if (data.length === 0 && isConnected) {
          logger.info("No local PM data, fetching from API", {
            module: "PM",
            siteCode,
          });
          
          const apiData = await PMService.fetchFromAPI(
            siteCode,
            fromDateObj,
            toDateObj,
          );
          
          if (apiData.length > 0) {
            logger.info("Loaded PM instances from API", {
              module: "PM",
              count: apiData.length,
              siteCode,
            });
            setAllInstances(apiData);
          } else {
            setAllInstances(data);
          }
        } else {
          setAllInstances(data);
        }
      } catch (err) {
        logger.error("Error loading PM instances", { error: err });
      } finally {
        setLoading(false);
      }
    },
    [siteCode, currentDate, toDate, isConnected],
  );

  // ── Reload local data when date or site changes ─────────────────────────────
  useEffect(() => {
    if (siteCode) {
      loadLocalData(true);
    }
  }, [currentDate, toDate, siteCode, loadLocalData]);

  // ── Focus effect: background pull ───────────────────
  useFocusEffect(
    useCallback(() => {
      if (!siteCode) return;
      loadLocalData(true);

      // PowerSync handles syncing automatically in the background
      // Just reload local data which will show synced data
      if (isConnected && !isFetchingRef.current) {
        isFetchingRef.current = true;
        setSyncing(true);
        // Wait a moment for PowerSync to sync, then reload
        setTimeout(() => {
          loadLocalData(true);
          isFetchingRef.current = false;
          setSyncing(false);
        }, 1000);
      }
    }, [loadLocalData, isConnected, siteCode]),
  );

  // ── Pull-to-refresh ─────────────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // PowerSync handles syncing automatically
    // Just reload local data which will show synced data
    await loadLocalData(true);
    setRefreshing(false);
  }, [loadLocalData]);

  // ── Filtered Data for List ────────────────────────────────────────────────
  const filteredInstances = useMemo(() => {
    let list = allInstances;
    if (statusFilter !== "All") {
      list = list.filter((i) => i.status === statusFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          (i.title && i.title.toLowerCase().includes(q)) ||
          (i.assetId && i.assetId.toLowerCase().includes(q)) ||
          (i.maintenanceId && i.maintenanceId.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [allInstances, statusFilter, searchQuery]);

  // ── Statistics ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    return {
      total: allInstances.length,
      pending: allInstances.filter((i) => i.status === "Pending").length,
      inProgress: allInstances.filter((i) => i.status === "In-progress").length,
      completed: allInstances.filter((i) => i.status === "Completed").length,
    };
  }, [allInstances]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handlePMCardPress = useCallback(
    (instance: PMInstanceRow) => {
      // PowerSync automatically syncs checklist items — no manual pull needed
      router.push({
        pathname: "/pm-execution",
        params: { instanceId: instance.id },
      });
    },
    [],
  );

  const applyAdvancedFilters = useCallback(() => {
    setSearchQuery(tempSearch);
    if (tempFromDate) {
      setCurrentDate(tempFromDate);
    }
    if (tempToDate) {
      setToDate(tempToDate);
    }
    setShowFiltersModal(false);
  }, [tempSearch, tempFromDate, tempToDate]);

  // ── FlatList Render ──────────────────────────────────────────────────────────
  const renderItem: ListRenderItem<PMInstanceRow> = useCallback(
    ({ item }) => (
      <PMCard instance={item} onPress={() => handlePMCardPress(item)} />
    ),
    [handlePMCardPress],
  );

  const keyExtractor = useCallback((item: PMInstanceRow) => item.id, []);

  const ListEmpty = useMemo(
    () => (
      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <Wrench size={32} color="#cbd5e1" />
        </View>
        <Text style={styles.emptyTitle}>No PM tasks found</Text>
        <Text style={styles.emptyBody}>
          No tasks scheduled for the selected date range.
        </Text>
      </View>
    ),
    [],
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView style={styles.flex} edges={["top"]}>
        {/* Fixed Header & Navigation */}
        <View className="px-5 pt-2 pb-3 bg-slate-50 dark:bg-slate-950">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-1">
              <Text className="text-slate-400 dark:text-slate-500 text-sm font-medium mb-1">
                Site Operations
              </Text>
              <TouchableOpacity
                onPress={() => setShowFiltersModal(true)}
                className="flex-row items-center"
              >
                <MapPin size={20} color="#dc2626" />
                <Text
                  className="text-slate-900 dark:text-slate-50 text-xl font-bold ml-2 mr-1 flex-shrink"
                  numberOfLines={1}
                >
                  {siteName}
                </Text>
                <ChevronDown size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setShowFiltersModal(true)}
              className="flex-shrink-0"
            >
              <View className="items-end">
                <View className="flex-row items-center bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg mb-1">
                  <CalendarIcon size={12} color="#64748b" />
                  <Text className="text-[10px] font-bold text-slate-500 ml-1">
                    {safeFormat(currentDate, "d MMM")}
                    {currentDate !== toDate
                      ? ` - ${safeFormat(toDate, "d MMM")}`
                      : ""}
                  </Text>
                </View>
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
              </View>
            </TouchableOpacity>
          </View>

          {/* Stats Row */}
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

          {/* Search Row - Moved Down */}
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
          </View>
        </View>

        <View style={styles.listHeader}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Maintenance Tasks</Text>
            <Text style={styles.sectionCount}>
              {filteredInstances.length} Tasks
            </Text>
          </View>
        </View>

        {loading || syncing ? (
          <PMSkeleton />
        ) : (
          <FlashList
            data={filteredInstances}
            // @ts-ignore
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            ListEmptyComponent={ListEmpty}
            // @ts-ignore
            estimatedItemSize={160}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#dc2626"
              />
            }
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
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
            setSiteCode(code);
            const site = sites.find((s) => s.site_code === code);
            if (site) setSiteName(site.name || site.site_code);
            AsyncStorage.setItem(
              `last_site_${user?.user_id || user?.id}`,
              code,
            );
          }}
          user={user}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          applyAdvancedFilters={applyAdvancedFilters}
        />
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  listHeader: { paddingTop: 2, paddingHorizontal: 20 },
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
