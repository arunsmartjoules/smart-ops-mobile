import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  RefreshCw,
  MapPin,
  ChevronDown,
} from "lucide-react-native";
import { useLocalSearchParams, useFocusEffect, router } from "expo-router";
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
import { v4 as uuidv4 } from "uuid";
import TicketDetailModal from "@/components/TicketDetailModal";
import { isTempMandatoryCategory } from "@/components/TicketDetailStatusUpdate";
import {
  DEFAULT_TICKET_INCIDENT_DRAFT,
  type TicketIncidentDraft,
} from "@/constants/incidentFormOptions";
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

const formatPreviewDate = (dateStr: string | null) => {
  if (!dateStr) return "Any";
  const [year, month, day] = dateStr.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "Any";
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const toApiStartDate = (dateStr: string | null) => {
  const ms = getLocalDayStartMs(dateStr);
  return ms == null ? undefined : new Date(ms).toISOString();
};

const toApiEndDate = (dateStr: string | null) => {
  const ms = getLocalDayEndMs(dateStr);
  return ms == null ? undefined : new Date(ms).toISOString();
};

const toLocalYmd = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const AREA_PAGE_SIZE = 50;

const mapAssetToOption = (asset: any): SelectOption => ({
  value: asset.asset_name || asset.asset_id,
  label: asset.asset_name,
  description:
    `${asset.asset_type || ""} ${asset.location ? `- ${asset.location}` : ""}`.trim(),
});

const getDefaultUpdateStatus = (ticket: Ticket) => {
  if (ticket.status === "Open") return "Inprogress";
  if (ticket.status === "Inprogress") return "Resolved";
  return ticket.status;
};

const getInitialUpdateRemarks = (ticket: Ticket, status: string) => {
  return status === ticket.status ? ticket.internal_remarks || "" : "";
};

const firstParam = (v: string | string[] | undefined): string | undefined => {
  if (v == null) return undefined;
  if (Array.isArray(v)) return v[0];
  return v;
};

export default function Tickets() {
  const { user, isLoading } = useAuth();
  const isDark = useColorScheme() === "dark";
  const { isConnected } = useNetworkStatus();

  // ── Clean sites hook ──────────────────────────────────────────────────────
  const userId = user?.user_id || user?.id;
  const { sites, selectedSite, selectSite, loading: sitesLoading, refresh: refreshSites } = useSites(userId);
  const selectedSiteCode = selectedSite?.site_code ?? "";
  const siteName = selectedSite?.site_name ?? selectedSite?.site_code ?? "Select Site";

  const today = useMemo(() => new Date(), []);
  const thisMonthStart = useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
    [today],
  );
  const defaultFromDate = useMemo(() => toLocalYmd(thisMonthStart), [thisMonthStart]);
  const defaultToDate = useMemo(() => toLocalYmd(today), [today]);

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
  const [fromDate, setFromDate] = useState<string | null>(defaultFromDate);
  const [toDate, setToDate] = useState<string | null>(defaultToDate);
  const [tempFromDate, setTempFromDate] = useState<string | null>(defaultFromDate);
  const [tempToDate, setTempToDate] = useState<string | null>(defaultToDate);
  const dateRangePreview = useMemo(
    () => `Date: ${formatPreviewDate(fromDate)} - ${formatPreviewDate(toDate)}`,
    [fromDate, toDate],
  );

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
  const [attachmentUri, setAttachmentUri] = useState("");
  const [createIncidentFromTicket, setCreateIncidentFromTicket] = useState(false);
  const [incidentDraft, setIncidentDraft] = useState<TicketIncidentDraft>(DEFAULT_TICKET_INCIDENT_DRAFT);

  const resetIncidentDraft = useCallback(() => {
    setIncidentDraft({ ...DEFAULT_TICKET_INCIDENT_DRAFT });
  }, []);

  const onCreateIncidentFromTicketChange = useCallback((v: boolean) => {
    setCreateIncidentFromTicket(v);
    if (!v) resetIncidentDraft();
  }, [resetIncidentDraft]);

  // Area and Category options for dropdowns
  const [areaOptions, setAreaOptions] = useState<SelectOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<SelectOption[]>([]);
  const [areasLoading, setAreasLoading] = useState(false);
  const [areaSearchQuery, setAreaSearchQuery] = useState("");
  const [debouncedAreaSearchQuery, setDebouncedAreaSearchQuery] = useState("");
  const [areaPage, setAreaPage] = useState(1);
  const [hasMoreAreas, setHasMoreAreas] = useState(false);
  const [loadingMoreAreas, setLoadingMoreAreas] = useState(false);

  // Memoized callbacks to prevent unnecessary re-renders
  const handleCloseDetail = useCallback(() => {
    setIsDetailVisible(false);
    setCreateIncidentFromTicket(false);
    resetIncidentDraft();
  }, [resetIncidentDraft]);

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
      const res = await TicketsService.getStats(selectedSiteCode, {
        fromDate: toApiStartDate(fromDate),
        toDate: toApiEndDate(toDate),
        search: searchQuery,
        priority:
          priorityFilter === "All" ? undefined : priorityFilter,
      });
      if (res.success) {
        setStats(res.data);
      }
    } catch (e) {}
  }, [
    selectedSiteCode,
    fromDate,
    toDate,
    searchQuery,
    priorityFilter,
  ]);

  const loadAreaOptions = useCallback(async (
    nextPage = 1,
    search = "",
    append = false,
  ) => {
    if (!selectedSiteCode) return;

    if (append) {
      setLoadingMoreAreas(true);
    } else {
      setAreasLoading(true);
      setAreaOptions([]);
    }

    try {
      const netState = await NetInfo.fetch();
      const normalizedSearch = search.trim();

      if (netState.isConnected) {
        const assetsResult = await TicketsService.getAssets(selectedSiteCode, {
          page: nextPage,
          limit: AREA_PAGE_SIZE,
          search: normalizedSearch || undefined,
        });

        if (assetsResult?.success) {
          const nextOptions = (assetsResult.data || []).map(mapAssetToOption);
          setAreaOptions((prev) => {
            if (!append) return nextOptions;
            const merged = [...prev];
            for (const option of nextOptions) {
              if (!merged.some((item) => item.value === option.value)) {
                merged.push(option);
              }
            }
            return merged;
          });
          setAreaPage(nextPage);
          const totalPages = assetsResult.pagination?.totalPages || 1;
          setHasMoreAreas(nextPage < totalPages);
          return;
        }
      }

      const localAreas = await db
        .select()
        .from(areas)
        .where(eq(areas.site_code, selectedSiteCode))
        .catch(() => []);
      const filteredLocalAreas = localAreas.filter((asset: any) => {
        if (!normalizedSearch) return true;
        return [
          asset.asset_name,
          asset.asset_id,
          asset.location,
          asset.asset_type,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch.toLowerCase());
      });
      const pagedLocalAreas = filteredLocalAreas.slice(
        (nextPage - 1) * AREA_PAGE_SIZE,
        nextPage * AREA_PAGE_SIZE,
      );
      const nextOptions = pagedLocalAreas.map(mapAssetToOption);
      setAreaOptions((prev) => {
        if (!append) return nextOptions;
        const merged = [...prev];
        for (const option of nextOptions) {
          if (!merged.some((item) => item.value === option.value)) {
            merged.push(option);
          }
        }
        return merged;
      });
      setAreaPage(nextPage);
      setHasMoreAreas(nextPage * AREA_PAGE_SIZE < filteredLocalAreas.length);
    } catch (error) {
      logger.warn("Error loading areas", {
        module: "TICKETS",
        error,
      });
      if (!append) {
        setAreaOptions([]);
        setHasMoreAreas(false);
      }
    } finally {
      setAreasLoading(false);
      setLoadingMoreAreas(false);
    }
  }, [selectedSiteCode]);

  const loadCategories = useCallback(async () => {
    try {
      const cachedCategories = await TicketsService.getComplaintCategories();
      if (cachedCategories?.data && cachedCategories.data.length > 0) {
        const categories = cachedCategories.data.map((cat: any) => ({
          value: cat.category,
          label: cat.category,
          description: cat.description || "",
        }));
        setCategoryOptions(categories);
      } else {
        setCategoryOptions([]);
      }
    } catch (error) {
      logger.warn("Error loading categories", {
        module: "TICKETS",
        error,
      });
    }
  }, []);

  const fetchTickets = useCallback(
    async (p: number, reset = false) => {
      if (!selectedSiteCode) {
        setLoading(false);
        return;
      }

      let hasLocalData = false;
      const hasRenderedTickets = tickets.length > 0;

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

        if (!hasLocalData && !refreshing && !hasRenderedTickets) {
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
        
        const res = await TicketsService.getTickets(selectedSiteCode, { ...options, refresh: reset });
        
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
      tickets.length,
    ],
  );

  const resetAndFetch = useCallback(() => {
    setPage(1);
    // Removed setTickets([]) to preserve Optimistic UI during background pull
    setHasMore(true);
    lastRequestedPageRef.current = 0;
    fetchTickets(1, true);
  }, [fetchTickets]);

  // Sync Logic - triggered on filter changes
  useEffect(() => {
    if (selectedSiteCode) {
      resetAndFetch();
      fetchStats();
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
  ]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedAreaSearchQuery(areaSearchQuery.trim());
    }, 300);

    return () => clearTimeout(timeout);
  }, [areaSearchQuery]);

  useEffect(() => {
    if (!selectedSiteCode) return;
    setAreaPage(1);
    loadAreaOptions(1, debouncedAreaSearchQuery, false);
  }, [selectedSiteCode, debouncedAreaSearchQuery, loadAreaOptions]);

  useEffect(() => {
    if (selectedSiteCode) {
      loadCategories();
    }
  }, [selectedSiteCode, loadCategories]);

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
    loadAreaOptions(1, debouncedAreaSearchQuery, false);
  };

  const handleLoadMoreAreas = useCallback(() => {
    if (areasLoading || loadingMoreAreas || !hasMoreAreas || !selectedSiteCode) return;
    const nextPage = areaPage + 1;
    loadAreaOptions(nextPage, debouncedAreaSearchQuery, true);
  }, [
    areasLoading,
    loadingMoreAreas,
    hasMoreAreas,
    selectedSiteCode,
    areaPage,
    debouncedAreaSearchQuery,
    loadAreaOptions,
  ]);

  const handleTicketPress = useCallback((ticket: Ticket) => {
    const defaultStatus = getDefaultUpdateStatus(ticket);
    setSelectedTicket(ticket);
    setUpdateStatus(defaultStatus);
    setUpdateRemarks(getInitialUpdateRemarks(ticket, defaultStatus));
    setUpdateArea(ticket.area_asset || "");
    setUpdateCategory(ticket.category || "");
    setBeforeTemp(
      ticket.before_temp != null && !Number.isNaN(Number(ticket.before_temp))
        ? String(ticket.before_temp)
        : "",
    );
    setAfterTemp(
      ticket.after_temp != null && !Number.isNaN(Number(ticket.after_temp))
        ? String(ticket.after_temp)
        : "",
    );
    setAttachmentUri("");
    setAreaSearchQuery("");
    setCreateIncidentFromTicket(false);
    resetIncidentDraft();
    setIsDetailVisible(true);
  }, [resetIncidentDraft]);

  const params = useLocalSearchParams<{
    ticketId?: string | string[];
    siteCode?: string | string[];
  }>();
  const ticketIdNorm = firstParam(params.ticketId);
  const siteCodeNorm = firstParam(params.siteCode);
  const deepLinkFetchGen = useRef(0);
  const deepLinkAttemptedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!ticketIdNorm) {
      deepLinkAttemptedFor.current = null;
      return;
    }

    if (
      siteCodeNorm &&
      selectedSiteCode !== siteCodeNorm &&
      sites.length > 0
    ) {
      const targetSite = sites.find((s) => s.site_code === siteCodeNorm);
      if (targetSite) {
        void selectSite(targetSite);
      }
      return;
    }

    if (siteCodeNorm && sites.length === 0 && sitesLoading) {
      return;
    }

    const ticket = tickets.find(
      (t) =>
        t.id?.toString() === ticketIdNorm ||
        t.ticket_no === ticketIdNorm,
    );

    if (ticket) {
      handleTicketPress(ticket);
      router.setParams({ ticketId: undefined, siteCode: undefined });
      return;
    }

    if (!selectedSiteCode || sitesLoading) {
      return;
    }

    if (deepLinkAttemptedFor.current === ticketIdNorm) {
      return;
    }
    deepLinkAttemptedFor.current = ticketIdNorm;
    const gen = ++deepLinkFetchGen.current;

    TicketsService.getTickets(selectedSiteCode, {
      ticket_no: ticketIdNorm,
      limit: 10,
      refresh: true,
    })
      .then((res) => {
        if (gen !== deepLinkFetchGen.current) return;
        if (res.success && res.data?.length) {
          const matched = res.data.find(
            (t: Ticket) =>
              t.id?.toString() === ticketIdNorm ||
              t.ticket_no === ticketIdNorm,
          );
          if (matched) {
            handleTicketPress(matched);
            router.setParams({ ticketId: undefined, siteCode: undefined });
          } else {
            deepLinkAttemptedFor.current = null;
          }
        } else {
          deepLinkAttemptedFor.current = null;
        }
      })
      .catch((err) => {
        deepLinkAttemptedFor.current = null;
        logger.warn("Failed to fetch ticket from deep link", { err });
      });
  }, [
    ticketIdNorm,
    siteCodeNorm,
    tickets,
    handleTicketPress,
    selectedSiteCode,
    sites,
    sitesLoading,
    selectSite,
  ]);

  const handleTicketLongPress = useCallback((ticket: Ticket) => {
    if (ticket.status !== "Open") return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedTicket(ticket);
    setUpdateStatus("Cancelled");
    setUpdateRemarks("");
    setUpdateArea(ticket.area_asset || "");
    setUpdateCategory(ticket.category || "");
    setBeforeTemp(
      ticket.before_temp != null && !Number.isNaN(Number(ticket.before_temp))
        ? String(ticket.before_temp)
        : "",
    );
    setAfterTemp(
      ticket.after_temp != null && !Number.isNaN(Number(ticket.after_temp))
        ? String(ticket.after_temp)
        : "",
    );
    setAttachmentUri("");
    setAreaSearchQuery("");
    setCreateIncidentFromTicket(false);
    resetIncidentDraft();
    setIsDetailVisible(true);
  }, [resetIncidentDraft]);

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
    const needsAreaAndCategory =
      updateStatus === "Inprogress" || updateStatus === "Resolved";
    if (needsRemarks && !updateRemarks.trim()) {
      Alert.alert("Required", "Please provide remarks for this status update.");
      return;
    }
    if (needsAreaAndCategory && !updateArea.trim()) {
      Alert.alert("Required", "Please select an area before updating the ticket.");
      return;
    }
    if (needsAreaAndCategory && !updateCategory.trim()) {
      Alert.alert("Required", "Please select a category before updating the ticket.");
      return;
    }
    if (needsAreaAndCategory) {
      const effectiveCategory = (
        updateCategory.trim() ||
        selectedTicket.category ||
        ""
      ).trim();
      if (isTempMandatoryCategory(effectiveCategory)) {
        const bt = beforeTemp.trim();
        const at = afterTemp.trim();
        if (!bt || !at) {
          Alert.alert(
            "Required",
            "Please enter before and after temperature for this category.",
          );
          return;
        }
        if (Number.isNaN(parseFloat(bt)) || Number.isNaN(parseFloat(at))) {
          Alert.alert(
            "Required",
            "Before and after temperature must be valid numbers.",
          );
          return;
        }
      }
    }

    if (createIncidentFromTicket) {
      if (!incidentDraft.fault_type) {
        Alert.alert("Required", "Please select fault type for the incident.");
        return;
      }
      if (!incidentDraft.operating_condition) {
        Alert.alert("Required", "Please select operating condition for the incident.");
        return;
      }
    }

    const payload: any = {
      status: updateStatus,
      internal_remarks: updateRemarks,
      area_asset: updateArea || selectedTicket.area_asset,
      category: updateCategory || selectedTicket.category,
    };
    if (createIncidentFromTicket) {
      payload.create_incident = true;
      payload.incident_payload = {
        source: "Tickets",
        asset_location: updateArea || selectedTicket.area_asset || "",
        fault_symptom: selectedTicket.title || "",
        fault_type: incidentDraft.fault_type,
        severity: incidentDraft.severity,
        operating_condition: incidentDraft.operating_condition,
        immediate_action_taken:
          incidentDraft.immediate_action_taken.trim() || updateRemarks.trim() || "",
        attachments: incidentDraft.incidentAttachments,
        remarks: incidentDraft.incidentRemarks.trim() || undefined,
        client_request_id: uuidv4(),
      };
    }

    if (beforeTemp.trim() !== "") payload.before_temp = parseFloat(beforeTemp);
    if (afterTemp.trim() !== "") payload.after_temp = parseFloat(afterTemp);

    if (updateStatus === "Inprogress" || updateStatus === "Cancelled") {
      payload.assigned_to = user?.full_name || user?.name || "";
    }

    setIsUpdating(true);
    try {
      const nowIso = new Date().toISOString();
      const optimisticTicket = {
        ...selectedTicket,
        ...payload,
        responded_at:
          updateStatus === "Inprogress" || updateStatus === "Resolved"
            ? selectedTicket.responded_at || nowIso
            : selectedTicket.responded_at,
        resolved_at:
          updateStatus === "Resolved" ? nowIso : selectedTicket.resolved_at,
      };

      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        const res = await TicketsService.updateTicket(selectedTicket.id || selectedTicket.ticket_no, payload);
        if (res.success) {
          WhatsAppService.sendStatusUpdate(optimisticTicket, updateStatus, updateRemarks).catch((e: any) =>
            logger.warn("Failed WhatsApp notification", { error: e })
          );

          if (attachmentUri) {
            const uploadRes = await TicketsService.uploadImage(
              attachmentUri,
              selectedTicket.id || selectedTicket.ticket_no,
            );

            if (uploadRes.success && uploadRes.url) {
              const lineItemRes = await TicketsService.addLineItem(
                selectedTicket.id || selectedTicket.ticket_no,
                { image_url: uploadRes.url },
              );

              if (!lineItemRes.success && !lineItemRes.queued) {
                Alert.alert(
                  "Partial Success",
                  "Ticket updated, but the image attachment could not be added.",
                );
              }
            } else {
              Alert.alert(
                "Partial Success",
                "Ticket updated, but the image attachment could not be uploaded.",
              );
            }
          }

          Alert.alert("Success", "Ticket updated successfully");
          if (createIncidentFromTicket) {
            setCreateIncidentFromTicket(false);
            resetIncidentDraft();
            router.push({
              pathname: "/(tabs)/incidents",
              params: { status: "Inprogress" },
            });
          }
          if (updateStatus === "Resolved") setIsDetailVisible(false);
          
          setSelectedTicket(optimisticTicket);
          setUpdateRemarks("");
          setBeforeTemp("");
          setAfterTemp("");
          setAttachmentUri("");
          fetchStats();
          resetAndFetch();
        } else {
          Alert.alert("Error", res.error || "Failed to update ticket");
        }
      } else {
        await TicketsService.updateTicket(selectedTicket.id || selectedTicket.ticket_no, payload);

        if (attachmentUri) {
          const uploadRes = await TicketsService.uploadImage(
            attachmentUri,
            selectedTicket.id || selectedTicket.ticket_no,
          );

          if (uploadRes.success && uploadRes.url) {
            await TicketsService.addLineItem(selectedTicket.id || selectedTicket.ticket_no, {
              image_url: uploadRes.url,
            });
          }
        }

        Alert.alert("Saved Offline", "Update saved and will sync when online.");
        if (createIncidentFromTicket) {
          setCreateIncidentFromTicket(false);
          resetIncidentDraft();
          router.push({
            pathname: "/(tabs)/incidents",
            params: { status: "Inprogress" },
          });
        }
        if (updateStatus === "Resolved") setIsDetailVisible(false);
        setSelectedTicket(optimisticTicket);
        setUpdateRemarks("");
        setBeforeTemp("");
        setAfterTemp("");
        setAttachmentUri("");
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
            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                disabled={!isConnected || !selectedSiteCode}
                onPress={() => {
                  if (!isConnected || !selectedSiteCode) return;
                  onRefresh();
                }}
                className="w-11 h-11 rounded-xl bg-white dark:bg-slate-900 items-center justify-center"
                style={{ opacity: !isConnected || !selectedSiteCode ? 0.4 : 1 }}
              >
                <RefreshCw
                  size={20}
                  color={!isConnected || !selectedSiteCode ? "#94a3b8" : "#dc2626"}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setShowFiltersModal(true)}
                className="w-11 h-11 rounded-xl bg-white dark:bg-slate-900 items-center justify-center"
              >
                <Filter size={20} color={fromDate ? "#dc2626" : (isDark ? "#dc2626" : "#64748b")} />
              </TouchableOpacity>
            </View>
          </View>
          <View className="mb-2 self-start px-3 py-1 rounded-full bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40">
            <Text className="text-[11px] font-semibold text-red-700 dark:text-red-300">
              {dateRangePreview}
            </Text>
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
                {isConnected && !sitesLoading && sites.length === 0 && (
                  <TouchableOpacity
                    onPress={async () => {
                      await refreshSites();
                      resetAndFetch();
                    }}
                    className="mt-4 bg-red-600 px-4 py-2 rounded-xl"
                  >
                    <Text className="text-white font-bold">Retry Server Sync</Text>
                  </TouchableOpacity>
                )}
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
            attachmentUri={attachmentUri}
            setAttachmentUri={setAttachmentUri}
            areaSearchQuery={areaSearchQuery}
            setAreaSearchQuery={setAreaSearchQuery}
            loadMoreAreas={handleLoadMoreAreas}
            hasMoreAreas={hasMoreAreas}
            loadingMoreAreas={loadingMoreAreas}
            createIncidentFromTicket={createIncidentFromTicket}
            setCreateIncidentFromTicket={onCreateIncidentFromTicketChange}
            incidentDraft={incidentDraft}
            setIncidentDraft={setIncidentDraft}
          />
        )}
      </SafeAreaView>
    </View>
  );
}
