import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Dimensions,
  Alert,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  Ticket as TicketIcon,
  Filter,
  MapPin,
  ChevronDown,
} from "lucide-react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useAutoSync } from "@/hooks/useAutoSync";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SearchableSelect, {
  type SelectOption,
} from "@/components/SearchableSelect";
import { TicketsService, type Ticket } from "@/services/TicketsService";
import { AttendanceService, type Site } from "@/services/AttendanceService";
import { useSites } from "@/hooks/useSites";
import { db, tickets as ticketsTable, areas, categories } from "@/database";
import { eq, desc } from "drizzle-orm";
import logger from "@/utils/logger";
import TicketDetailModal from "@/components/TicketDetailModal";
import AdvancedFilterModal from "@/components/AdvancedFilterModal";
import { WhatsAppService } from "@/services/WhatsAppService";
import TicketItem from "@/components/TicketItem";
import TicketStats from "@/components/TicketStats";
import TicketFilters from "@/components/TicketFilters";
import TicketSkeleton, {
  TicketSkeletonItem,
} from "@/components/TicketSkeleton";

const { width } = Dimensions.get("window");

const parseCreatedAtMs = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const getLocalDayStartMs = (dateStr: string | null) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
};

const getLocalDayEndMs = (dateStr: string | null) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
};

const toApiStartDate = (dateStr: string | null) => {
  const ms = getLocalDayStartMs(dateStr);
  return ms == null ? undefined : new Date(ms).toISOString();
};

const toApiEndDate = (dateStr: string | null) => {
  const ms = getLocalDayEndMs(dateStr);
  return ms == null ? undefined : new Date(ms).toISOString();
};

export default function Tickets() {
  const { user, isLoading } = useAuth();
  const isDark = useColorScheme() === "dark";
  const { isConnected } = useNetworkStatus();

  // ── Clean sites hook ──────────────────────────────────────────────────────
  const userId = user?.user_id || user?.id;
  const { sites, selectedSite, selectSite, loading: sitesLoading } = useSites(userId);
  const selectedSiteCode = selectedSite?.site_code ?? "";
  const siteName = selectedSite?.site_name ?? selectedSite?.site_code ?? "Select Site";

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assets, setAssets] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const PAGE_SIZE = 50;

  // Filters
  const [statusFilter, setStatusFilter] = useState("Open");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [tempSearch, setTempSearch] = useState("");
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [tempFromDate, setTempFromDate] = useState<string | null>(null);
  const [tempToDate, setTempToDate] = useState<string | null>(null);

  // Detail Modal
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isDetailVisible, setIsDetailVisible] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("");
  const [updateRemarks, setUpdateRemarks] = useState("");
  const [updateArea, setUpdateArea] = useState("");
  const [updateCategory, setUpdateCategory] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [beforeTemp, setBeforeTemp] = useState("");
  const [afterTemp, setAfterTemp] = useState("");

  // Area and Category options for dropdowns
  const [areaOptions, setAreaOptions] = useState<SelectOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<SelectOption[]>([]);
  const [areasLoading, setAreasLoading] = useState(false);

  // Memoized callbacks to prevent unnecessary re-renders
  const handleCloseDetail = useCallback(() => {
    setIsDetailVisible(false);
  }, []);

  const handleCloseFilters = useCallback(() => {
    setShowFiltersModal(false);
  }, []);

  const keyExtractor = useCallback((item: Ticket) => {
    return item.id?.toString() || item.ticket_no || Math.random().toString();
  }, []);

  const lastRequestedPageRef = React.useRef(0);

  // Enrich tickets with site name and code
  const enrichedTickets = useMemo(() => {
    return tickets.map((t) => {
      if (t.site_name && t.site_name !== "N/A") return t;

      const siteId = String(t.site_code || "")
        .trim()
        .toLowerCase();
      const site = sites.find((s) => {
        const sCode = String(s.site_code || "")
          .trim()
          .toLowerCase();

        return sCode === siteId;
      });

      if (site) {
        return {
          ...t,
          site_name: site.site_name,
          site_code: site.site_code || t.site_code,
        };
      }
      return {
        ...t,
        site_name: t.site_name || "N/A",
        site_code: t.site_code || "N/A",
      };
    });
  }, [tickets, sites]);

  useEffect(() => {
    logger.debug("Modal Visible State", {
      module: "TICKETS",
      isDetailVisible,
      ticketId: selectedTicket?.id,
    });
  }, [isDetailVisible, selectedTicket]);

  // ── Data Fetching Logic ──────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    if (!selectedSiteCode) return;
    try {
      const res = await TicketsService.getStats(selectedSiteCode);
      if (res.success) {
        setStats(res.data);
      }
    } catch (e) {}
  }, [selectedSiteCode]);

  const fetchAssets = useCallback(async () => {
    if (!selectedSiteCode) return;
    try {
      const res = await TicketsService.getAssets(selectedSiteCode);
      if (res.success) {
        setAssets(res.data);
        await AsyncStorage.setItem(
          `assets_${selectedSiteCode}`,
          JSON.stringify(res.data),
        );
      }
    } catch (e) {}
  }, [selectedSiteCode]);

  const loadAreasAndCategories = useCallback(async () => {
    if (!selectedSiteCode) return;

    setAreasLoading(true);
    try {
      const [localAreas, cachedCategories] = await Promise.all([
        db.select().from(areas).where(eq(areas.site_code, selectedSiteCode)).catch(() => []),
        TicketsService.getComplaintCategories(),
      ]);
      const cachedAreas = localAreas;

      if (cachedAreas.length > 0) {
        setAreaOptions(
          cachedAreas.map((a: any) => ({
            value: a.asset_name || a.asset_id,
            label: a.asset_name,
            description:
              `${a.asset_type || ""} ${a.location ? `- ${a.location}` : ""}`.trim(),
          })),
        );
      }

      if (cachedCategories?.data && cachedCategories.data.length > 0) {
        const categories = cachedCategories.data.map((cat: any) => ({
          value: cat.category,
          label: cat.category,
          description: cat.description || "",
        }));
        setCategoryOptions(categories);
      }

      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        TicketsService.getAssets(selectedSiteCode)
          .then((assetsResult) => {
            if (assetsResult?.data && assetsResult.data.length > 0) {
              const areas = assetsResult.data.map((asset: any) => ({
                value: asset.asset_name || asset.asset_id,
                label: asset.asset_name,
                description:
                  `${asset.asset_type || ""} ${asset.location ? `- ${asset.location}` : ""}`.trim(),
              }));
              setAreaOptions(areas);
            }
          })
          .catch((error) => {
            logger.warn("Background assets refresh failed", {
              module: "TICKETS",
              error,
            });
          });
      }
    } catch (error) {
      logger.warn("Error loading areas/categories", {
        module: "TICKETS",
        error,
      });
    } finally {
      setAreasLoading(false);
    }
  }, [selectedSiteCode]);

  const fetchTickets = useCallback(
    async (p: number, reset = false) => {
      if (!selectedSiteCode) {
        setLoading(false);
        return;
      }

      let hasLocalData = false;

      if (reset) {
        try {
          const localTickets = await db
            .select()
            .from(ticketsTable)
            .where(
              selectedSiteCode !== "all"
                ? eq(ticketsTable.site_code, selectedSiteCode)
                : undefined,
            )
            .orderBy(desc(ticketsTable.created_at));

          const normalizedSearch = searchQuery.trim().toLowerCase();
          const fromDateMs = getLocalDayStartMs(fromDate);
          const toDateMs = getLocalDayEndMs(toDate);
          const filteredLocalTickets = localTickets.filter((t) => {
            if (statusFilter && statusFilter !== "All" && t.status !== statusFilter) {
              return false;
            }

            if (priorityFilter && priorityFilter !== "All" && t.priority !== priorityFilter) {
              return false;
            }

            const createdAtMs = parseCreatedAtMs(t.created_at);
            if ((fromDateMs != null || toDateMs != null) && createdAtMs == null) return false;
            if (fromDateMs != null && createdAtMs != null && createdAtMs < fromDateMs) return false;
            if (toDateMs != null && createdAtMs != null && createdAtMs > toDateMs) return false;

            if (!normalizedSearch) return true;

            const searchHaystack = [
              t.ticket_number,
              t.title,
              t.description,
              t.category,
              t.area,
              t.status,
              t.priority,
              t.assigned_to,
              t.created_by,
            ].filter(Boolean).join(" ").toLowerCase();

            return searchHaystack.includes(normalizedSearch);
          });

          if (filteredLocalTickets.length > 0) {
            hasLocalData = true;
            const formattedTickets = filteredLocalTickets.map((t) => {
              let isoDate = new Date().toISOString();
              try {
                if (t.created_at) {
                  const d = new Date(Number(t.created_at));
                  if (!isNaN(d.getTime())) isoDate = d.toISOString();
                }
              } catch {}

              return {
                id: t.id,
                ticket_no: t.ticket_number,
                title: t.title,
                description: t.description || "",
                status: t.status,
                priority: t.priority,
                category: t.category || "",
                location: t.area || "",
                area_asset: t.area || "",
                internal_remarks: t.description || "",
                assigned_to: t.assigned_to || "",
                created_user: t.created_by,
                site_code: t.site_code,
                created_at: isoDate,
              };
            });

            setTickets(formattedTickets);
            setLoading(false);
          }
        } catch (err: any) {
          logger.warn("Error loading tickets from local DB", {
            module: "TICKETS",
            error: err.message || String(err),
          });
        }

        if (!hasLocalData && !refreshing) {
          setLoading(true);
        }
      } else {
        setIsFetchingMore(true);
      }

      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        setLoading(false);
        setIsFetchingMore(false);
        setRefreshing(false);
        setHasMore(false);
        return;
      }

      try {
        const options: any = {
          page: p,
          limit: PAGE_SIZE,
          status: statusFilter,
          priority: priorityFilter === "All" ? undefined : priorityFilter,
          search: searchQuery,
          fromDate: toApiStartDate(fromDate),
          toDate: toApiEndDate(toDate),
        };
        
        const res = await TicketsService.getTickets(selectedSiteCode, options);
        
        if (res.success) {
          const newTickets = res.data || [];
          if (reset) {
            if (newTickets.length > 0 || !hasLocalData) {
              setTickets(newTickets);
            }
          } else {
            setTickets((prev) => {
              const existingIds = new Set(prev.map((t) => t.id));
              const uniqueNew = newTickets.filter((t: Ticket) => !existingIds.has(t.id));
              return [...prev, ...uniqueNew];
            });
          }
          setHasMore(newTickets.length === PAGE_SIZE);
        } else {
          setHasMore(false);
        }
      } catch (error) {
        logger.warn("fetchTickets error", { module: "TICKETS", error });
        setHasMore(false);
      } finally {
        setLoading(false);
        setIsFetchingMore(false);
        setRefreshing(false);
      }
    },
    [
      selectedSiteCode,
      statusFilter,
      priorityFilter,
      searchQuery,
      fromDate,
      toDate,
      refreshing,
    ],
  );

  const resetAndFetch = useCallback(() => {
    setPage(1);
    setTickets([]);
    setHasMore(true);
    lastRequestedPageRef.current = 0;
    fetchTickets(1, true);
  }, [fetchTickets]);

  // Sync Logic - triggered on filter changes
  useEffect(() => {
    if (selectedSiteCode) {
      resetAndFetch();
      fetchStats();
      loadAreasAndCategories();
    }
  }, [
    selectedSiteCode,
    statusFilter,
    priorityFilter,
    searchQuery,
    fromDate,
    toDate,
    resetAndFetch,
    fetchStats,
    loadAreasAndCategories,
  ]);

  // Auto-sync for tickets (Handles Focus, AppState, and 60s Polling)
  // This ensures data is fresh when returning to focus or every 60s
  useAutoSync(resetAndFetch, [selectedSiteCode]);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setTempSearch("");
    setFromDate(null);
    setToDate(null);
    setTempFromDate(null);
    setTempToDate(null);
    setStatusFilter("Open");
    setPriorityFilter("All");
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || isFetchingMore || loading) return;

    const nextPage = page + 1;
    if (nextPage <= lastRequestedPageRef.current) return;

    lastRequestedPageRef.current = nextPage;
    setPage(nextPage);
    fetchTickets(nextPage);
  }, [hasMore, isFetchingMore, loading, page, fetchTickets]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
    resetAndFetch();
  };

  const handleTicketPress = useCallback((ticket: Ticket) => {
    setSelectedTicket(ticket);
    setUpdateStatus(ticket.status);
    setUpdateRemarks(ticket.internal_remarks || "");
    setUpdateArea(ticket.area_asset || "");
    setUpdateCategory(ticket.category || "");
    setBeforeTemp("");
    setAfterTemp("");
    setIsDetailVisible(true);
  }, []);

  const params = useLocalSearchParams<{ ticketId: string }>();
  const { ticketId } = params;

  useEffect(() => {
    if (ticketId && tickets.length > 0) {
      const ticket = tickets.find((t) => t.id.toString() === ticketId.toString());
      if (ticket) handleTicketPress(ticket);
    }
  }, [ticketId, tickets, handleTicketPress]);

  const handleTicketLongPress = useCallback((ticket: Ticket) => {
    if (ticket.status !== "Open") return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedTicket(ticket);
    setUpdateStatus("Cancelled");
    setUpdateRemarks("");
    setIsDetailVisible(true);
  }, []);

  const renderTicketItem = useCallback(
    ({ item }: { item: Ticket }) => (
      <TicketItem
        item={item}
        isCompact={true}
        onPress={handleTicketPress}
        onLongPress={handleTicketLongPress}
      />
    ),
    [handleTicketPress, handleTicketLongPress],
  );

  const enrichedSelectedTicket = useMemo(() => {
    if (!selectedTicket) return null;
    if (selectedTicket.site_name && selectedTicket.site_name !== "N/A") return selectedTicket;

    const siteId = String(selectedTicket.site_code || "").trim().toLowerCase();
    const site = sites.find((s) => String(s.site_code || "").trim().toLowerCase() === siteId);

    if (site) {
      return {
        ...selectedTicket,
        site_name: site.site_name,
        site_code: site.site_code || selectedTicket.site_code,
      };
    }
    return {
      ...selectedTicket,
      site_name: selectedTicket.site_name || "N/A",
      site_code: selectedTicket.site_code || "N/A",
    };
  }, [selectedTicket, sites]);

  const handleUpdateStatus = async () => {
    if (!selectedTicket) return;

    const needsRemarks = ["Hold", "Cancelled", "Waiting", "Resolved"].includes(updateStatus);
    if (needsRemarks && !updateRemarks.trim()) {
      Alert.alert("Required", "Please provide remarks for this status update.");
      return;
    }

    const payload: any = {
      status: updateStatus,
      internal_remarks: updateRemarks,
      area_asset: updateArea || selectedTicket.area_asset,
      category: updateCategory || selectedTicket.category,
    };

    if (beforeTemp.trim() !== "") payload.before_temp = parseFloat(beforeTemp);
    if (afterTemp.trim() !== "") payload.after_temp = parseFloat(afterTemp);

    if (updateStatus === "Inprogress" || updateStatus === "Cancelled") {
      payload.assigned_to = user?.full_name || user?.name || "";
    }

    setIsUpdating(true);
    try {
      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        const res = await TicketsService.updateTicket(selectedTicket.id || selectedTicket.ticket_no, payload);
        if (res.success) {
          const updatedTicketForWA = { ...selectedTicket, ...payload };
          WhatsAppService.sendStatusUpdate(updatedTicketForWA, updateStatus, updateRemarks).catch((e: any) =>
            logger.warn("Failed WhatsApp notification", { error: e })
          );

          Alert.alert("Success", "Ticket updated successfully");
          if (updateStatus === "Resolved") setIsDetailVisible(false);
          
          setSelectedTicket({ ...selectedTicket, ...payload });
          setUpdateRemarks("");
          setBeforeTemp("");
          setAfterTemp("");
          fetchStats();
          resetAndFetch();
        } else {
          Alert.alert("Error", res.error || "Failed to update ticket");
        }
      } else {
        await TicketsService.updateTicket(selectedTicket.id || selectedTicket.ticket_no, payload);
        Alert.alert("Saved Offline", "Update saved and will sync when online.");
        if (updateStatus === "Resolved") setIsDetailVisible(false);
        setSelectedTicket({ ...selectedTicket, ...payload });
        setUpdateRemarks("");
        setBeforeTemp("");
        setAfterTemp("");
        resetAndFetch();
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const applyAdvancedFilters = () => {
    setSearchQuery(tempSearch);
    setFromDate(tempFromDate);
    setToDate(tempToDate);
    setShowFiltersModal(false);
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        <View className="px-5 pt-2 pb-3">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-1">
              <Text className="text-slate-400 dark:text-slate-500 text-sm font-medium mb-1">
                Site Operations
              </Text>
              <TouchableOpacity onPress={() => setShowFiltersModal(true)} className="flex-row items-center">
                <MapPin size={20} color="#dc2626" />
                <Text className="text-slate-900 dark:text-slate-50 text-xl font-bold ml-2 mr-1 flex-shrink" numberOfLines={1}>
                  {siteName}
                </Text>
                <ChevronDown size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setShowFiltersModal(true)} className="w-11 h-11 rounded-xl bg-white dark:bg-slate-900 items-center justify-center">
              <Filter size={20} color={fromDate ? "#dc2626" : (isDark ? "#dc2626" : "#64748b")} />
            </TouchableOpacity>
          </View>
        </View>

        <TicketStats stats={stats} loading={loading} currentStatus={statusFilter} onStatusChange={setStatusFilter} />
        <TicketFilters statusFilter={statusFilter} setStatusFilter={setStatusFilter} />

        <View className="flex-1">
          <FlatList
            data={enrichedTickets}
            renderItem={renderTicketItem}
            keyExtractor={keyExtractor}
            ListEmptyComponent={loading ? <TicketSkeleton /> : (
              <View className="py-20 items-center justify-center">
                <View className="w-20 h-20 bg-slate-100 rounded-full items-center justify-center mb-4">
                  <TicketIcon size={36} color="#cbd5e1" />
                </View>
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg">No tickets found</Text>
              </View>
            )}
            ListFooterComponent={isFetchingMore ? <TicketSkeletonItem /> : null}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.1}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#dc2626" />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          />
        </View>

        {showFiltersModal && (
          <AdvancedFilterModal
            visible={showFiltersModal}
            onClose={handleCloseFilters}
            dateMode="date-range"
            tempSearch={tempSearch}
            setTempSearch={setTempSearch}
            tempFromDate={tempFromDate}
            setTempFromDate={setTempFromDate}
            tempToDate={tempToDate}
            setTempToDate={setTempToDate}
            sites={sites}
            selectedSiteCode={selectedSiteCode}
            setSelectedSiteCode={(code: string) => {
              const site = sites.find((s) => s.site_code === code);
              if (site) selectSite(site);
            }}
            user={user}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            priorityFilter={priorityFilter}
            setPriorityFilter={setPriorityFilter}
            statusOptions={["All", "Open", "Inprogress", "Resolved", "Hold", "Waiting", "Cancelled"]}
            applyAdvancedFilters={applyAdvancedFilters}
          />
        )}

        {isDetailVisible && (
          <TicketDetailModal
            visible={isDetailVisible}
            ticket={enrichedSelectedTicket}
            onClose={handleCloseDetail}
            updateStatus={updateStatus}
            setUpdateStatus={setUpdateStatus}
            updateRemarks={updateRemarks}
            setUpdateRemarks={setUpdateRemarks}
            updateArea={updateArea}
            setUpdateArea={setUpdateArea}
            updateCategory={updateCategory}
            setUpdateCategory={setUpdateCategory}
            isUpdating={isUpdating}
            handleUpdateStatus={handleUpdateStatus}
            areaOptions={areaOptions}
            categoryOptions={categoryOptions}
            areasLoading={areasLoading}
            beforeTemp={beforeTemp}
            setBeforeTemp={setBeforeTemp}
            afterTemp={afterTemp}
            setAfterTemp={setAfterTemp}
          />
        )}
      </SafeAreaView>
    </View>
  );
}
