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
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
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
import { eq, desc, and, like } from "drizzle-orm";
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

export default function Tickets() {
  const { user, isLoading } = useAuth();
  const isDark = useColorScheme() === "dark";
  const { isConnected } = useNetworkStatus();

  // ── Clean sites hook ──────────────────────────────────────────────────────
  const userId = user?.user_id || user?.id;
  const { sites, selectedSite, selectSite, loading: sitesLoading } = useSites(userId);
  const selectedSiteCode = selectedSite?.site_code ?? "";
  const siteName = selectedSite?.name ?? selectedSite?.site_code ?? "Select Site";

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

  // Memoized callback for closing filters modal
  const handleCloseFilters = useCallback(() => {
    setShowFiltersModal(false);
  }, []);

  // Memoized keyExtractor for FlatList
  const keyExtractor = useCallback((item: Ticket) => {
    return item.id?.toString() || item.ticket_no || Math.random().toString();
  }, []);

  // Track the last requested page to prevent duplicate requests
  const lastRequestedPageRef = React.useRef(0);

  // Enrich tickets with site name and code from the sites array (useful for cached data)
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
          site_name:
            site.name || (site as any).siteName || (site as any).site_name,
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

  // Trigger fetch when site or filters change
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
  ]);

  // Load areas (from assets table) and categories for the dropdown
  // Uses cache-first strategy with 24-hour expiration
  const loadAreasAndCategories = useCallback(async () => {
    if (!selectedSiteCode) return;

    setAreasLoading(true);
    try {
      // Always load from local DB first for instant UI
      const [localAreas, cachedCategories] = await Promise.all([
        db.select().from(areas).where(eq(areas.site_code, selectedSiteCode)).catch(() => []),
        TicketsService.getComplaintCategories(),
      ]);
      const cachedAreas = localAreas;

      // Set cached areas immediately
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

      // Set cached categories immediately
      if (cachedCategories?.data && cachedCategories.data.length > 0) {
        const categories = cachedCategories.data.map((cat: any) => ({
          value: cat.category,
          label: cat.category,
          description: cat.description || "",
        }));
        setCategoryOptions(categories);
      }

      // Check if we need to refresh from API (only if online)
      const netState = await NetInfo.fetch();
      const isActuallyOnline = netState.isConnected === true;

      if (isActuallyOnline) {
        // Fetch fresh assets in background (will update cache automatically via TicketsService)
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

        // Categories are already fetched above and cached automatically
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

  const fetchTickets = useCallback(
    async (p: number, reset = false) => {
      if (!selectedSiteCode) {
        setLoading(false);
        return;
      }

      let hasLocalData = false;

      if (reset) {
        // ALWAYS load from local Drizzle/PowerSync DB first for instant content
        try {
          const conditions: any[] = [];

          // Apply the same filters as the API call
          if (selectedSiteCode !== "all") {
            conditions.push(eq(ticketsTable.site_code, selectedSiteCode));
          }
          if (statusFilter) {
            conditions.push(eq(ticketsTable.status, statusFilter));
          }
          if (priorityFilter && priorityFilter !== "All") {
            conditions.push(eq(ticketsTable.priority, priorityFilter));
          }
          if (searchQuery) {
            conditions.push(like(ticketsTable.title, `%${searchQuery}%`));
          }

          const whereClause = conditions.length > 1
            ? and(...conditions)
            : conditions[0] ?? undefined;

          const localTickets = await db
            .select()
            .from(ticketsTable)
            .where(whereClause)
            .orderBy(desc(ticketsTable.created_at));

          logger.info("Loaded tickets from local DB", {
            module: "TICKETS",
            count: localTickets.length,
            siteCode: selectedSiteCode,
            filters: { statusFilter, priorityFilter, searchQuery },
          });

          if (localTickets.length > 0) {
            hasLocalData = true;
            const formattedTickets = localTickets.map((t) => ({
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
              created_at: t.created_at
                ? new Date(t.created_at).toISOString()
                : new Date().toISOString(),
            }));

            setTickets(formattedTickets);
            setLoading(false);
          }
        } catch (err) {
          logger.warn("Error loading tickets from local DB", {
            module: "TICKETS",
            error: err,
          });
        }

        // Show skeleton only if we don't have local data and not refreshing
        if (!hasLocalData && !refreshing) {
          setLoading(true);
        }
      } else {
        setIsFetchingMore(true);
      }

      // Only call API if online
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        // Offline - keep local data, don't overwrite
        setLoading(false);
        setIsFetchingMore(false);
        setRefreshing(false);
        setHasMore(false); // No pagination when offline
        logger.info("Offline mode - using cached tickets", {
          module: "TICKETS",
          count: tickets.length,
        });
        return;
      }

      // Online - fetch from API
      try {
        const options: any = {
          page: p,
          limit: PAGE_SIZE,
          status: statusFilter,
          priority: priorityFilter === "All" ? undefined : priorityFilter,
          search: searchQuery,
          fromDate: fromDate,
          toDate: toDate,
        };
        
        const res = await TicketsService.getTickets(selectedSiteCode, options);
        
        if (res.success) {
          const newTickets = res.data || [];
          if (reset) {
            // Only update if we got data from API
            if (newTickets.length > 0 || !hasLocalData) {
              setTickets(newTickets);
            }
          } else {
            setTickets((prev) => {
              const existingIds = new Set(prev.map((t) => t.id));
              const uniqueNew = newTickets.filter(
                (t: Ticket) => !existingIds.has(t.id),
              );
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
    // Only proceed if we're not already fetching and there's more data
    if (!hasMore || isFetchingMore || loading) {
      return;
    }

    const nextPage = page + 1;

    // Additional safeguard: check if we've already requested this page
    if (nextPage <= lastRequestedPageRef.current) {
      logger.debug("Skipping duplicate request for page", {
        module: "TICKETS",
        nextPage,
      });
      return;
    }

    logger.debug("handleLoadMore triggered", {
      module: "TICKETS",
      page: nextPage,
    });
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
    logger.debug("Ticket pressed", {
      module: "TICKETS",
      ticketId: ticket.id,
      status: ticket.status,
    });

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

  // Handle opening ticket from dashboard/params
  useEffect(() => {
    if (ticketId && tickets.length > 0) {
      const ticket = tickets.find(
        (t) => t.id.toString() === ticketId.toString(),
      );
      if (ticket) {
        logger.debug("Opening ticket from params", {
          module: "TICKETS",
          ticketId,
        });
        handleTicketPress(ticket);
      }
    }
  }, [ticketId, tickets, handleTicketPress]);

  const handleTicketLongPress = useCallback((ticket: Ticket) => {
    if (ticket.status !== "Open") return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    logger.debug("Ticket long pressed", {
      module: "TICKETS",
      ticketId: ticket.id,
    });

    setSelectedTicket(ticket);
    setUpdateStatus("Cancelled");
    setUpdateRemarks(""); // Clear remarks to force user input
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
    if (selectedTicket.site_name && selectedTicket.site_name !== "N/A")
      return selectedTicket;

    const siteId = String(selectedTicket.site_code || "")
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
        ...selectedTicket,
        site_name:
          site.name || (site as any).siteName || (site as any).site_name,
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

    const needsRemarks = ["Hold", "Cancelled", "Waiting", "Resolved"].includes(
      updateStatus,
    );
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

    // Include temp readings if provided
    if (beforeTemp.trim() !== "") {
      payload.before_temp = parseFloat(beforeTemp);
    }
    if (afterTemp.trim() !== "") {
      payload.after_temp = parseFloat(afterTemp);
    }

    // If status is Inprogress or Cancelled, assign to current user
    if (updateStatus === "Inprogress" || updateStatus === "Cancelled") {
      payload.assigned_to = user?.full_name || user?.name || "";
    }

    setIsUpdating(true);
    try {
      const netState = await NetInfo.fetch();
      const isActuallyOnline = netState.isConnected === true;

      if (isActuallyOnline) {
        // Online: Update directly
        const res = await TicketsService.updateTicket(
          selectedTicket.id || selectedTicket.ticket_no,
          payload,
        );
        if (res.success) {
          logger.activity("TICKET_UPDATE", "TICKETS", "Ticket updated", {
            ticketId: selectedTicket.id,
            ticketNo: selectedTicket.ticket_no,
            ...payload,
            offline: false,
          });
          // Trigger WhatsApp template resolution and sending
          // Use updated ticket data for notification
          const updatedTicketForWA = {
            ...selectedTicket,
            ...payload,
          };
          WhatsAppService.sendStatusUpdate(
            updatedTicketForWA,
            updateStatus,
            updateRemarks,
          ).catch((e: any) =>
            logger.warn("Failed WhatsApp notification in background", {
              error: e,
            }),
          );

          Alert.alert("Success", "Ticket updated successfully");
          setIsDetailVisible(false);
          fetchStats();
          resetAndFetch();
        } else {
          Alert.alert("Error", res.error || "Failed to update ticket");
        }
      } else {
        // Offline: Update via service (which updates local DB)
        const res = await TicketsService.updateTicket(
          selectedTicket.id || selectedTicket.ticket_no,
          payload,
        );
        
        logger.activity("TICKET_UPDATE", "TICKETS", "Ticket updated offline", {
          ticketId: selectedTicket.id,
          ticketNo: selectedTicket.ticket_no,
          ...payload,
          offline: true,
        });
        
        Alert.alert(
          "Saved Offline",
          "Your update has been saved and will sync when you're back online.",
          [{ text: "OK" }],
        );
        setIsDetailVisible(false);

        // Reload tickets from local DB to reflect the persisted change
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
        {/* Header - matching dashboard/logs screen */}
        <View className="px-5 pt-2 pb-3">
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
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {siteName}
                </Text>
                <ChevronDown size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setShowFiltersModal(true)}
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
        </View>

        <TicketStats
          stats={stats}
          loading={loading}
          currentStatus={statusFilter}
          onStatusChange={setStatusFilter}
        />

        <TicketFilters
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
        />

        {/* Tickets List */}
        <View className="flex-1">
          <FlatList
            data={enrichedTickets}
            renderItem={renderTicketItem}
            keyExtractor={(item, index) =>
              item.id || item.ticket_no || `ticket-${index}`
            }
            ListEmptyComponent={
              loading ? (
                <TicketSkeleton />
              ) : (
                <View className="py-20 items-center justify-center">
                  <View className="w-20 h-20 bg-slate-100 rounded-full items-center justify-center mb-4">
                    <TicketIcon size={36} color="#cbd5e1" />
                  </View>
                  <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg">
                    No tickets found
                  </Text>
                  <Text className="text-slate-400 dark:text-slate-500 text-sm mt-1 text-center px-10">
                    Try adjusting your filters or search keywords.
                  </Text>
                </View>
              )
            }
            ListFooterComponent={
              isFetchingMore ? (
                <View className="pb-6">
                  <TicketSkeletonItem />
                </View>
              ) : null
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.1}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#dc2626"
              />
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: 100,
            }}
          />
        </View>

        {/* Skeletons render via ListEmptyComponent + stats placeholders */}

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
