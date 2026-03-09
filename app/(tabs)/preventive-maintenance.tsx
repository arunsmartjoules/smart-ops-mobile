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
} from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import PMService from "@/services/PMService";
import { AttendanceService, type Site } from "@/services/AttendanceService";
import PMInstance from "@/database/models/PMInstance";
import { format } from "date-fns";
import AdvancedFilterModal from "@/components/AdvancedFilterModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/utils/logger";

// Constants
const PAGE_SIZE = 50;

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> =
  {
    Pending: { bg: "#fffbeb", text: "#d97706", dot: "#fbbf24" },
    "In-progress": { bg: "#fff7ed", text: "#c2410c", dot: "#f97316" },
    Completed: { bg: "#f0fdf4", text: "#15803d", dot: "#22c55e" },
    Overdue: { bg: "#fef2f2", text: "#dc2626", dot: "#ef4444" },
  };

const STATUS_OPTIONS = ["All", "Pending", "In-progress", "Completed"];

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

// ─── Stat Card ─────────────────────────────────────────────────────────────────
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
      <Text style={styles.statValue}>{value}</Text>
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
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [tempSearch, setTempSearch] = useState("");
  const [tempFromDate, setTempFromDate] = useState<string | null>(null);
  const [tempToDate, setTempToDate] = useState<string | null>(null);

  // Guard against re-fetching while server pull is in progress
  const isFetchingRef = useRef(false);

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
        // Always fetch all site instances once to calculate dashboard stats
        const allData = await PMService.getLocalInstances(siteCode);
        setAllInstances(allData);

        if (resetPage) setPage(1);
      } catch (err) {
        logger.error("Error loading PM instances", { error: err });
      } finally {
        setLoading(false);
      }
    },
    [siteCode],
  );

  // ── Focus effect: load local first, then background pull ───────────────────
  useFocusEffect(
    useCallback(() => {
      if (!siteCode) return;
      loadLocalData(true);

      if (isConnected && !isFetchingRef.current) {
        isFetchingRef.current = true;
        PMService.pullFromServer(siteCode)
          .then(() => loadLocalData(true))
          .catch(() => {})
          .finally(() => {
            isFetchingRef.current = false;
          });
      }
    }, [loadLocalData, isConnected, siteCode]),
  );

  // ── Pull-to-refresh ─────────────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (isConnected && siteCode) {
      try {
        await PMService.pullFromServer(siteCode);
      } catch {}
    }
    await loadLocalData(true);
    setRefreshing(false);
  }, [siteCode, isConnected, loadLocalData]);

  // ── Filtered Data for List ────────────────────────────────────────────────
  const filteredInstances = useMemo(() => {
    let list = allInstances;
    if (statusFilter !== "All") {
      list = list.filter((i) => i.status === statusFilter);
    }
    return list;
  }, [allInstances, statusFilter]);

  // ── Pagination: visible slice ───────────────────────────────────────────────
  const visibleInstances = useMemo(
    () => filteredInstances.slice(0, page * PAGE_SIZE),
    [filteredInstances, page],
  );

  const hasMore = visibleInstances.length < filteredInstances.length;

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    // Defer slice extension to next tick so the loading indicator renders first
    setTimeout(() => {
      setPage((p) => p + 1);
      setLoadingMore(false);
    }, 50);
  }, [loadingMore, hasMore]);

  // ── Statistics ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    // Show stats for the entire site (allInstances as loaded from server/local)
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
      // Pre-fetch checklist items in background before navigating
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
    setFromDate(tempFromDate);
    setToDate(tempToDate);
    setShowFiltersModal(false);
    loadLocalData(true);
  }, [tempFromDate, tempToDate, loadLocalData]);

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
          <Text style={styles.sectionTitle}>Upcoming Maintenance</Text>
          <Text style={styles.sectionCount}>
            {filteredInstances.length} Tasks
          </Text>
        </View>
      </View>
    ),
    [filteredInstances.length],
  );

  const ListEmpty = useMemo(
    () =>
      loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#3b82f6" />
          <Text style={styles.loadingText}>Fetching PM schedule...</Text>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Wrench size={32} color="#cbd5e1" />
          </View>
          <Text style={styles.emptyTitle}>No PM tasks found</Text>
          <Text style={styles.emptyBody}>
            Try adjusting your filters or site selection.
          </Text>
        </View>
      ),
    [loading],
  );

  const ListFooter = useMemo(
    () =>
      loadingMore ? (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color="#3b82f6" />
        </View>
      ) : null,
    [loadingMore],
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.flex} edges={["top"]}>
        {/* Fixed Header & Stats */}
        <View style={styles.fixedArea}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerSub}>Site Operations</Text>
              <TouchableOpacity
                onPress={() => setShowFiltersModal(true)}
                style={styles.siteRow}
              >
                <MapPin size={20} color="#3b82f6" />
                <Text style={styles.siteName} numberOfLines={1}>
                  {siteName}
                </Text>
                <ChevronDown size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => setShowFiltersModal(true)}
              style={[
                styles.filterBtn,
                fromDate ? styles.filterBtnActive : null,
              ]}
            >
              <Filter size={20} color={fromDate ? "#3b82f6" : "#64748b"} />
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            <StatCard
              icon={<ListChecks size={16} color="#3b82f6" />}
              value={stats.total}
              label="Total"
              bg="#eff6ff"
              color="#3b82f6"
            />
            <StatCard
              icon={<AlertCircle size={16} color="#f97316" />}
              value={stats.pending}
              label="Pending"
              bg="#fff7ed"
              color="#f97316"
            />
            <StatCard
              icon={<Clock size={16} color="#fbbf24" />}
              value={stats.inProgress}
              label="Active"
              bg="#fffbeb"
              color="#fbbf24"
            />
            <StatCard
              icon={<CheckCircle2 size={16} color="#22c55e" />}
              value={stats.completed}
              label="Done"
              bg="#f0fdf4"
              color="#22c55e"
            />
          </View>

          <View style={styles.quickFilters}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.filterChipRow}>
                {STATUS_OPTIONS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setStatusFilter(s)}
                    style={[
                      styles.filterChip,
                      statusFilter === s ? styles.filterChipActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        statusFilter === s ? styles.filterChipTextActive : null,
                      ]}
                    >
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>

        <FlatList
          data={visibleInstances}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          ListFooterComponent={ListFooter}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={10}
          initialNumToRender={10}
          windowSize={5}
        />

        <AdvancedFilterModal
          visible={showFiltersModal}
          onClose={() => setShowFiltersModal(false)}
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
  headerSub: {
    fontSize: 13,
    color: "#94a3b8",
    fontWeight: "500",
    marginBottom: 2,
  },
  siteRow: { flexDirection: "row", alignItems: "center" },
  siteName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    marginLeft: 8,
    marginRight: 4,
    flexShrink: 1,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#f1f5f9",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  filterBtnActive: { borderColor: "#3b82f6" },

  // Stats
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
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
  statValue: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
  },

  // Quick Filters
  quickFilters: {
    marginBottom: 12,
  },
  filterChipRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  filterChipActive: { backgroundColor: "#3b82f6", borderColor: "#3b82f6" },
  filterChipText: { fontSize: 11, fontWeight: "700", color: "#64748b" },
  filterChipTextActive: { color: "#fff" },

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
  center: { alignItems: "center", paddingTop: 48 },
  loadingText: { color: "#94a3b8", fontSize: 13, marginTop: 8 },
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
