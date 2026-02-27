import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  Ticket as TicketIcon,
  Search,
  Filter,
  ArrowUpDown,
  TrendingUp,
  CheckCircle,
  X,
  ChevronRight,
  MapPin,
  Clock,
  Briefcase,
  Layers,
  Layout,
  Calendar,
} from "lucide-react-native";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SearchableSelect, {
  type SelectOption,
} from "@/components/SearchableSelect";
import { TicketsService, type Ticket } from "@/services/TicketsService";
import { AttendanceService, type Site } from "@/services/AttendanceService";
import {
  saveOfflineTicketUpdate,
  syncPendingTicketUpdates,
} from "@/utils/offlineTicketStorage";
import {
  getCachedSites,
  cacheSites,
  cacheAreas,
  getCachedAreas,
  cacheTickets,
  getCachedTickets,
} from "@/utils/offlineDataCache";
import logger from "@/utils/logger";
import TicketDetailModal from "@/components/TicketDetailModal";
import AdvancedFilterModal from "@/components/AdvancedFilterModal";
import Skeleton from "@/components/Skeleton";
import { WhatsAppService } from "@/services/WhatsAppService";
import TicketItem from "@/components/TicketItem";
import TicketStats from "@/components/TicketStats";
import TicketFilters from "@/components/TicketFilters";
import TicketSkeleton from "@/components/TicketSkeleton";

const { width } = Dimensions.get("window");

export default function Tickets() {
  const { user, isLoading } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteCode, setSelectedSiteCode] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assets, setAssets] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const PAGE_SIZE = 15;

  // Filters
  const [statusFilter, setStatusFilter] = useState("Open");
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

  // Area and Category options for dropdowns
  const [areaOptions, setAreaOptions] = useState<SelectOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<SelectOption[]>([]);
  const [areasLoading, setAreasLoading] = useState(false);

  // Network status for offline support
  const { isConnected } = useNetworkStatus();

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

  useEffect(() => {
    logger.debug("User state update", {
      module: "TICKETS",
      userId: user?.user_id || user?.id,
    });

    // Safety timeout: ensure loading stops after 8 seconds no matter what
    const safetyTimer = setTimeout(() => {
      setLoading((prev) => {
        if (prev)
          logger.debug("Safety timeout triggered - forcing loading to false", {
            module: "TICKETS",
          });
        return false;
      });
    }, 8000);

    const userId = user?.user_id || user?.id;
    if (userId) {
      loadSites(userId);
    } else if (!isLoading) {
      // Auth finished but no user?
      setLoading(false);
    }

    return () => clearTimeout(safetyTimer);
  }, [user?.user_id, user?.id, isLoading]);

  useEffect(() => {
    if (selectedSiteCode) {
      logger.debug("Site ready, triggering fetch", { module: "TICKETS" });
      resetAndFetch();
      fetchStats();
      loadAreasAndCategories();
    }
  }, [selectedSiteCode, statusFilter, searchQuery, fromDate, toDate]);

  // Load areas (from assets table) and categories for the dropdown
  const loadAreasAndCategories = useCallback(async () => {
    if (!selectedSiteCode) return;

    setAreasLoading(true);
    try {
      // Try to get cached areas first
      const cachedAreas = await getCachedAreas(selectedSiteCode);
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

      // If online, fetch fresh data from backend
      if (isConnected) {
        // Fetch assets for area dropdown (using asset_name)
        const assetsResult = await TicketsService.getAssets(selectedSiteCode);
        if (assetsResult?.data && assetsResult.data.length > 0) {
          const areas = assetsResult.data.map((asset: any) => ({
            value: asset.asset_name || asset.asset_id,
            label: asset.asset_name,
            description:
              `${asset.asset_type || ""} ${asset.location ? `- ${asset.location}` : ""}`.trim(),
          }));
          setAreaOptions(areas);
          // Cache for offline use
          await cacheAreas(selectedSiteCode, assetsResult.data);
        }

        // Fetch complaint categories from backend
        const categoriesResult = await TicketsService.getComplaintCategories();
        if (categoriesResult?.data && categoriesResult.data.length > 0) {
          const categories = categoriesResult.data.map((cat: any) => ({
            value: cat.category,
            label: cat.category,
            description: cat.description || "",
          }));
          setCategoryOptions(categories);
        }
      }
    } catch (error) {
      logger.warn("Error loading areas/categories", {
        module: "TICKETS",
        error,
      });
    } finally {
      setAreasLoading(false);
    }
  }, [selectedSiteCode, isConnected]);

  const loadSites = async (userId: string) => {
    setLoading(true);
    try {
      // Load from cache first
      const cachedSites = await getCachedSites(userId);
      const lastSiteCode = await AsyncStorage.getItem(`last_site_${userId}`);

      if (cachedSites.length > 0) {
        setSites(cachedSites);
        if (lastSiteCode) {
          setSelectedSiteCode(lastSiteCode);
        }
      }

      let userSites: Site[] = [];
      const isAdmin = user?.role === "admin" || user?.role === "Admin";

      if (isAdmin) {
        logger.debug("Admin user detected, fetching all sites", {
          module: "TICKETS",
        });
        userSites = await AttendanceService.getAllSites();
      } else {
        logger.debug("Fetching sites for user", { module: "TICKETS", userId });
        userSites = await AttendanceService.getUserSites(userId, "JouleCool");
      }

      logger.debug("Sites response", {
        module: "TICKETS",
        count: userSites.length,
      });

      let finalSites = [];

      if (isAdmin) {
        const allSitesOption: Site = {
          site_code: "all",
          name: "All Sites",
        };
        finalSites = [allSitesOption, ...userSites];
        setSites(finalSites);
        const siteToSelect = lastSiteCode || "all";
        setSelectedSiteCode(siteToSelect);
      } else {
        finalSites = userSites;
        setSites(userSites);
        if (userSites.length > 0) {
          const siteToSelect = lastSiteCode || userSites[0].site_code || "";
          setSelectedSiteCode(siteToSelect);
        } else {
          setLoading(false);
        }
      }

      // Save to cache
      await cacheSites(userId, finalSites);
    } catch (error) {
      logger.warn("loadSites error", { module: "TICKETS", error });
      setLoading(false);
    }
  };

  const fetchStats = useCallback(async () => {
    if (!selectedSiteCode) return;
    try {
      const res = await TicketsService.getStats(selectedSiteCode);
      if (res.success) {
        setStats(res.data);
        await AsyncStorage.setItem(
          `stats_${selectedSiteCode}`,
          JSON.stringify(res.data),
        );
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

      if (reset) {
        setLoading(true);
        // Load from cache first for reset
        const cachedTickets = await getCachedTickets(selectedSiteCode);
        if (cachedTickets.length > 0) {
          setTickets(cachedTickets);
        }
      } else {
        setIsFetchingMore(true);
      }

      try {
        const options: any = {
          page: p,
          limit: PAGE_SIZE,
          search: searchQuery,
          fromDate: fromDate,
          toDate: toDate,
        };
        if (statusFilter !== "All") {
          options.status = statusFilter;
        }
        const res = await TicketsService.getTickets(selectedSiteCode, options);
        if (res.success) {
          const newTickets = res.data || [];
          if (reset) {
            setTickets(newTickets);
            // Cache page 1
            await cacheTickets(selectedSiteCode, newTickets);
          } else {
            setTickets((prev) => {
              // Avoid duplicates
              const existingIds = new Set(prev.map((t) => t.id));
              const uniqueNew = newTickets.filter(
                (t: Ticket) => !existingIds.has(t.id),
              );
              return [...prev, ...uniqueNew];
            });
          }
          setHasMore(newTickets.length === PAGE_SIZE);
        } else {
          // API call failed, stop pagination
          logger.debug("API call failed, stopping pagination", {
            module: "TICKETS",
          });
          setHasMore(false);
        }
      } catch (error) {
        logger.warn("fetchTickets error", { module: "TICKETS", error });
        // On error, stop pagination to prevent infinite loops
        setHasMore(false);
      } finally {
        setLoading(false);
        setIsFetchingMore(false);
        setRefreshing(false);
      }
    },
    [selectedSiteCode, statusFilter, searchQuery, fromDate, toDate],
  );

  const resetAndFetch = useCallback(() => {
    setPage(1);
    setTickets([]);
    setHasMore(true);
    lastRequestedPageRef.current = 0; // Reset ref when resetting pagination
    fetchTickets(1, true);
  }, [fetchTickets]);

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

    if (ticket.status !== "Open" && ticket.status !== "Inprogress") {
      // Still allow viewing some details, but not updates for terminal statuses
      // return;
    }
    setSelectedTicket(ticket);
    setUpdateStatus(ticket.status);
    setUpdateRemarks(ticket.internal_remarks || "");
    setUpdateArea(ticket.area_asset || "");
    setUpdateCategory(ticket.category || "");
    setIsDetailVisible(true);
  }, []);

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

    // If status is Inprogress or Cancelled, assign to current user
    if (updateStatus === "Inprogress" || updateStatus === "Cancelled") {
      payload.assigned_to = user?.full_name || user?.name || "";
    }

    setIsUpdating(true);
    try {
      if (isConnected) {
        // Online: Update directly
        const res = await TicketsService.updateTicket(
          selectedTicket.id || selectedTicket.ticket_no,
          payload,
        );
        if (res.success) {
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
        // Offline: Save to queue
        await saveOfflineTicketUpdate(
          selectedTicket.id,
          selectedTicket.ticket_no,
          "update_details",
          payload,
        );
        Alert.alert(
          "Saved Offline",
          "Your update has been saved and will sync when you're back online.",
          [{ text: "OK" }],
        );
        setIsDetailVisible(false);

        // Update local ticket in list to reflect change
        setTickets((prev) =>
          prev.map((t) =>
            t.id === selectedTicket.id ? { ...t, ...payload } : t,
          ),
        );
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
        {/* Header - matching profile screen */}
        <View className="px-5 pt-2 pb-3 flex-row items-center">
          <Text className="text-slate-900 dark:text-slate-50 text-3xl font-black">
            Tickets
          </Text>
          <View className="flex-1" />
          <TouchableOpacity
            onPress={() => setShowFiltersModal(true)}
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 items-center justify-center"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.05,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <Filter size={20} color="#0f172a" />
            {(searchQuery || fromDate) && (
              <View className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-600 rounded-full" />
            )}
          </TouchableOpacity>
        </View>

        <TicketStats stats={stats} loading={loading} />

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
                <View className="py-6">
                  <ActivityIndicator color="#dc2626" />
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
            tempSearch={tempSearch}
            setTempSearch={setTempSearch}
            tempFromDate={tempFromDate}
            setTempFromDate={setTempFromDate}
            tempToDate={tempToDate}
            setTempToDate={setTempToDate}
            sites={sites}
            selectedSiteCode={selectedSiteCode}
            setSelectedSiteCode={setSelectedSiteCode}
            user={user}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
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
          />
        )}
      </SafeAreaView>
    </View>
  );
}
