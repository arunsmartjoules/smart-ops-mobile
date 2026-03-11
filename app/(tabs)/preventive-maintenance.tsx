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
} from "react-native";
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
import PMService from "@/services/PMService";
import { AttendanceService, type Site } from "@/services/AttendanceService";
import PMInstance from "@/database/models/PMInstance";
import { format, addDays, startOfDay, endOfDay } from "date-fns";
import AdvancedFilterModal from "@/components/AdvancedFilterModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/utils/logger";
import Skeleton from "@/components/Skeleton";

// Constants
const PAGE_SIZE = 20;

const safeFormat = (date: any, formatStr: string) => {
  if (!date || isNaN(new Date(date).getTime())) {
    return "Invalid Date";
  }
  return format(date, formatStr);
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
const PMSkeleton = () => (
  <View style={styles.listContent}>
    {[1, 2, 3, 4].map((i) => (
      <View key={i} style={styles.card}>
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

// ─── Memoized PM Card ──────────────────────────────────────────────────────────
const PMCard = React.memo(
  ({ instance, onPress }: { instance: PMInstance; onPress: () => void }) => {
    const statusInfo =
      STATUS_COLORS[instance.status] || STATUS_COLORS["Pending"];

    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={styles.card}
      >
        <View style={styles.cardTopRow}>
          <View style={styles.freqBadge}>
            <Clock size={12} color="#64748b" />
            <Text style={styles.freqText}>{instance.frequency || "ONCE"}</Text>
          </View>
          <View
            style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}
          >
            <Text style={[styles.statusText, { color: statusInfo.text }]}>
              {instance.status}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View
            style={[styles.iconWrap, { backgroundColor: statusInfo.bg + "40" }]}
          >
            <Wrench size={22} color={statusInfo.dot} />
          </View>
          <View style={styles.cardBodyText}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {instance.assetId || "Unknown Asset"}
            </Text>
            <Text style={styles.cardSubTitle} numberOfLines={1}>
              {instance.title}
            </Text>
            <View style={styles.attrRow}>
              <View style={styles.assetRow}>
                <Briefcase size={12} color="#94a3b8" />
                <Text style={styles.assetText} numberOfLines={1}>
                  {instance.assetType || "General Asset"}
                </Text>
              </View>
              {instance.maintenanceId ? (
                <View style={styles.idBadge}>
                  <Text style={styles.idText}>
                    ID: {instance.maintenanceId}
                  </Text>
                </View>
              ) : null}
              {instance.progress ? (
                <View style={styles.progressBadge}>
                  <Text style={styles.progressText}>{instance.progress}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <ChevronRight size={18} color="#cbd5e1" />
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.footerLeft}>
            <Clock size={12} color="#94a3b8" />
            <Text style={styles.footerText}>
              Due:{" "}
              {instance.startDueDate
                ? format(new Date(instance.startDueDate), "d MMM yyyy")
                : "N/A"}
            </Text>
          </View>
          {instance.assignedToName ? (
            <View style={styles.footerRight}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {instance.assignedToName.charAt(0)}
                </Text>
              </View>
              <Text style={styles.assigneeName} numberOfLines={1}>
                {instance.assignedToName}
              </Text>
            </View>
          ) : (
            <Text style={styles.unassigned}>Unassigned</Text>
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

// ─── Stat Card (non-clickable) ─────────────────────────────────────────────────
const StatCard = React.memo(
  ({
    icon,
    value,
    label,
    bg,
    color,
  }: {
    icon: React.ReactNode;
    value: number;
    label: string;
    bg: string;
    color: string;
  }) => (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>{icon}</View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  ),
);

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function PreventiveMaintenance() {
  const { user } = useAuth();
  const { isConnected } = useNetworkStatus();

  const [allInstances, setAllInstances] = useState<PMInstance[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [siteCode, setSiteCode] = useState("");
  const [sites, setSites] = useState<Site[]>([]);
  const [siteName, setSiteName] = useState("Select Site");
  const [showFiltersModal, setShowFiltersModal] = useState(false);

  // Date handling
  const [currentDate, setCurrentDate] = useState(new Date());

  const [tempSearch, setTempSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [tempFromDate, setTempFromDate] = useState<string | null>(
    format(new Date(), "yyyy-MM-dd"),
  );

  // Guard against re-fetching while server pull is in progress
  const isFetchingRef = useRef(false);
  const [syncing, setSyncing] = useState(false);

  // ── Load Sites ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const userId = user?.user_id || user?.id;
    if (userId) loadSites(userId);
  }, [user]);

  const loadSites = async (userId: string) => {
    try {
      const lastSiteCode = await AsyncStorage.getItem(`last_site_${userId}`);
      const isAdmin = user?.role === "admin" || user?.role === "Admin";
      const userSites = isAdmin
        ? await AttendanceService.getAllSites()
        : await AttendanceService.getUserSites(userId, "JouleCool");

      const finalSites: Site[] = isAdmin
        ? [{ site_code: "all", name: "All Sites" }, ...userSites]
        : userSites;

      setSites(finalSites);

      if (finalSites.length > 0) {
        let siteToSelect = lastSiteCode || finalSites[0].site_code;
        if (!finalSites.find((s) => s.site_code === siteToSelect)) {
          siteToSelect = finalSites[0].site_code;
        }
        setSiteCode(siteToSelect);
        const currentSite = finalSites.find(
          (s) => s.site_code === siteToSelect,
        );
        if (currentSite) {
          setSiteName(
            siteToSelect === "all" ? currentSite.name : currentSite.site_code,
          );
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
      if (resetPage) setLoading(true);
      try {
        const fromTs = startOfDay(currentDate).getTime();
        const toTs = endOfDay(currentDate).getTime();

        // Fetch only for current day
        const data = await PMService.getLocalInstances(
          siteCode,
          undefined,
          undefined,
          undefined,
          fromTs,
          toTs,
        );
        setAllInstances(data);

        if (resetPage) setPage(1);
      } catch (err) {
        logger.error("Error loading PM instances", { error: err });
      } finally {
        setLoading(false);
      }
    },
    [siteCode, currentDate],
  );

  // ── Reload local data when date or site changes ─────────────────────────────
  useEffect(() => {
    if (siteCode) {
      loadLocalData(true);
    }
  }, [currentDate, siteCode, loadLocalData]);

  // ── Focus effect: background pull ───────────────────
  useFocusEffect(
    useCallback(() => {
      if (!siteCode) return;
      loadLocalData(true);

      if (isConnected && !isFetchingRef.current) {
        isFetchingRef.current = true;
        setSyncing(true);
        PMService.pullFromServer(siteCode, currentDate)
          .then(() => loadLocalData(true))
          .catch(() => {})
          .finally(() => {
            isFetchingRef.current = false;
            setSyncing(false);
          });
      }
    }, [loadLocalData, isConnected, siteCode, currentDate]),
  );

  // ── Pull-to-refresh ─────────────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (isConnected && siteCode) {
      try {
        await PMService.pullFromServer(siteCode, currentDate);
      } catch {}
    }
    await loadLocalData(true);
    setRefreshing(false);
  }, [siteCode, isConnected, loadLocalData, currentDate]);

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

  // ── Pagination: visible slice ───────────────────────────────────────────────
  const visibleInstances = useMemo(
    () => filteredInstances.slice(0, page * PAGE_SIZE),
    [filteredInstances, page],
  );

  const hasMore = visibleInstances.length < filteredInstances.length;

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setTimeout(() => {
      setPage((p) => p + 1);
      setLoadingMore(false);
    }, 50);
  }, [loadingMore, hasMore]);

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
    (instance: PMInstance) => {
      if (instance.maintenanceId && isConnected) {
        PMService.pullChecklistItems(instance.maintenanceId).catch(() => {});
      }
      router.push({
        pathname: "/pm-execution",
        params: { instanceId: instance.serverId || instance.id },
      });
    },
    [isConnected],
  );

  const applyAdvancedFilters = useCallback(() => {
    setSearchQuery(tempSearch);
    if (tempFromDate) {
      const d = new Date(tempFromDate.replace(/-/g, "/"));
      if (!isNaN(d.getTime())) {
        setCurrentDate(d);
      }
    }
    setShowFiltersModal(false);
  }, [tempSearch, tempFromDate]);

  const navigateDate = (days: number) => {
    setCurrentDate((prev) => {
      const next = addDays(prev, days);
      return isNaN(next.getTime()) ? prev : next;
    });
  };

  // ── FlatList Render ──────────────────────────────────────────────────────────
  const renderItem: ListRenderItem<PMInstance> = useCallback(
    ({ item }) => (
      <PMCard instance={item} onPress={() => handlePMCardPress(item)} />
    ),
    [handlePMCardPress],
  );

  const keyExtractor = useCallback((item: PMInstance) => item.id, []);

  const ListHeader = useMemo(
    () => (
      <View style={styles.listHeader}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>
            Tasks for {safeFormat(currentDate, "d MMM yyyy")}
          </Text>
          <Text style={styles.sectionCount}>
            {filteredInstances.length} Tasks
          </Text>
        </View>
      </View>
    ),
    [filteredInstances.length, currentDate],
  );

  const ListEmpty = useMemo(
    () => (
      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <Wrench size={32} color="#cbd5e1" />
        </View>
        <Text style={styles.emptyTitle}>No PM tasks found</Text>
        <Text style={styles.emptyBody}>
          No tasks scheduled for {safeFormat(currentDate, "PPPP")}.
        </Text>
      </View>
    ),
    [currentDate],
  );

  const ListFooter = useMemo(
    () =>
      loadingMore ? (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color="#dc2626" />
        </View>
      ) : null,
    [loadingMore],
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.flex} edges={["top"]}>
        {/* Fixed Header & Navigation */}
        <View style={styles.fixedArea}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerSub}>Site Operations</Text>
              <TouchableOpacity
                onPress={() => setShowFiltersModal(true)}
                style={styles.siteRow}
              >
                <MapPin size={20} color="#dc2626" />
                <Text style={styles.siteName} numberOfLines={1}>
                  {siteName}
                </Text>
                <ChevronDown size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.statsRow}>
            <StatCard
              icon={<AlertCircle size={16} color="#f97316" />}
              value={stats.pending}
              label="Pending"
              bg="#fff7ed"
              color="#f97316"
            />
            <StatCard
              icon={<Clock size={16} color="#3b82f6" />}
              value={stats.inProgress}
              label="In Progress"
              bg="#eff6ff"
              color="#3b82f6"
            />
            <StatCard
              icon={<CheckCircle2 size={16} color="#22c55e" />}
              value={stats.completed}
              label="Completed"
              bg="#f0fdf4"
              color="#22c55e"
            />
          </View>

          <View style={styles.actionHeaderRow}>
            {/* Date Navigation Group (Approx 70%) */}
            <View style={styles.navGroup}>
              <TouchableOpacity
                onPress={() => navigateDate(-1)}
                style={styles.navIconBtn}
              >
                <ChevronLeft size={22} color="#64748b" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setShowFiltersModal(true)}
                style={styles.dateDisplayValue}
              >
                <Text style={styles.dateDisplayText}>
                  {safeFormat(currentDate, "eee, d MMM")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigateDate(1)}
                style={styles.navIconBtn}
              >
                <ChevronRight size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Action Group (Approx 30%) */}
            <View style={styles.actionGroup}>
              <TouchableOpacity
                onPress={() => setShowFiltersModal(true)}
                style={styles.actionIconBtn}
              >
                <Filter size={20} color="#dc2626" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Status Filter Row */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.statusFilterRow}
            contentContainerStyle={styles.statusFilterContent}
          >
            {STATUS_OPTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setStatusFilter(s === "All" ? "All" : s)}
                style={[
                  styles.statusPill,
                  statusFilter === s && styles.statusPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    statusFilter === s && styles.statusPillTextActive,
                  ]}
                >
                  {s}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {(loading || syncing) ? (
          <PMSkeleton />
        ) : (
          <FlatList
            data={visibleInstances}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            ListHeaderComponent={ListHeader}
            ListEmptyComponent={ListEmpty}
            ListFooterComponent={ListFooter}
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#dc2626"
              />
            }
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            maxToRenderPerBatch={10}
            initialNumToRender={10}
            windowSize={5}
          />
        )}

        <AdvancedFilterModal
          visible={showFiltersModal}
          onClose={() => setShowFiltersModal(false)}
          title="Filter PM Tasks"
          statusOptions={STATUS_OPTIONS}
          tempSearch={tempSearch}
          setTempSearch={setTempSearch}
          tempFromDate={tempFromDate}
          setTempFromDate={setTempFromDate}
          sites={sites}
          selectedSiteCode={siteCode}
          setSelectedSiteCode={(code) => {
            setSiteCode(code);
            const site = sites.find((s) => s.site_code === code);
            if (site) setSiteName(code === "all" ? site.name : site.site_code);
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
  container: { flex: 1, backgroundColor: "#f8fafc" },
  listHeader: { paddingTop: 8 },
  listContent: { paddingHorizontal: 20, paddingBottom: 120 },

  // Header
  fixedArea: {
    paddingHorizontal: 20,
    backgroundColor: "#f8fafc",
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
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

  // Action Header Row (Date + Icons)
  actionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    gap: 8,
  },
  navGroup: {
    flex: 0.7,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    height: 46,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    paddingHorizontal: 4,
  },
  navIconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  dateDisplayValue: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dateDisplayText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  actionGroup: {
    flex: 0.3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
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

  // Stats
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
    marginTop: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  statValue: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
  },

  // Filter Section
  filterSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    height: 44,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: "#0f172a",
    fontWeight: "500",
  },
  clearText: { fontSize: 12, color: "#dc2626", fontWeight: "600" },
  applyBtn: {
    backgroundColor: "#dc2626",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: "center",
  },
  applyBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  filterIconBtn: {
    width: 44,
    height: 44,
    backgroundColor: "#fff",
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },

  // Section heading
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  sectionCount: { fontSize: 12, fontWeight: "500", color: "#94a3b8" },

  // PM Card
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
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

  // Status Filter Row
  statusFilterRow: {
    marginBottom: 8,
  },
  statusFilterContent: {
    gap: 8,
    paddingVertical: 4,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  statusPillActive: {
    backgroundColor: "#dc2626",
    borderColor: "#dc2626",
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  statusPillTextActive: {
    color: "#fff",
  },
});
