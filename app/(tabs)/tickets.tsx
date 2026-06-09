import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Alert,
  useColorScheme,
  InteractionManager,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import EmptyState from "@/components/EmptyState";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import * as Haptics from "expo-haptics";
import {
  Ticket as TicketIcon,
  Filter,
  RefreshCw,
  MapPin,
  ChevronDown,
  Search,
  X,
} from "lucide-react-native";
import { useLocalSearchParams, useFocusEffect, router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useAutoSync } from "@/hooks/useAutoSync";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import NetInfo from "@react-native-community/netinfo";
import { type SelectOption } from "@/components/SearchableSelect";
import { TicketsService, type Ticket } from "@/services/TicketsService";
import { ticketsRealtimeService, type TicketRealtimeEvent } from "@/services/TicketsRealtimeService";
import { useSites } from "@/hooks/useSites";
import { db, tickets as ticketsTable, areas } from "@/database";
import { eq, desc } from "drizzle-orm";
import logger from "@/utils/logger";
import {
  istTodayString,
  istParts,
  istDayStartMsFromYmd,
  istDayEndMsFromYmd,
  istDayStartIso,
  istDayEndIso,
  formatISTDate,
} from "@/utils/istDate";
import cacheManager from "@/services/CacheManager";
import { v4 as uuidv4 } from "uuid";
import TicketDetailModal from "@/components/TicketDetailModal";
import {
  isTempMandatoryCategory,
  isBreakdownTypeCategory,
} from "@/components/TicketDetailStatusUpdate";
import {
  makeTicketIncidentDraft,
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

const parseCreatedAtMs = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

// Day-window boundaries are pinned to the IST calendar day, not the device
// timezone, so filtering "1–19 May" means 1–19 May in India everywhere.
const getLocalDayStartMs = (dateStr: string | null) =>
  istDayStartMsFromYmd(dateStr);

const getLocalDayEndMs = (dateStr: string | null) =>
  istDayEndMsFromYmd(dateStr);

const formatPreviewDate = (dateStr: string | null) => {
  if (!dateStr) return "Any";
  const ms = istDayStartMsFromYmd(dateStr);
  return ms == null ? "Any" : formatISTDate(ms);
};

const toApiStartDate = (dateStr: string | null) => istDayStartIso(dateStr);

const toApiEndDate = (dateStr: string | null) => istDayEndIso(dateStr);

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

const normalizeRealtimeTicket = (source: any): Ticket => ({
  id: source.id,
  ticket_no: source.ticket_no || source.ticket_number || "",
  title: source.title || "",
  description: source.description || source.internal_remarks || "",
  status: source.status || "Open",
  site_code: source.site_code || "",
  site_name: source.site_name || source.site || undefined,
  created_at: source.created_at
    ? new Date(source.created_at).toISOString()
    : new Date().toISOString(),
  due_date: source.due_date || undefined,
  location: source.location || source.area_asset || source.area || "",
  area_asset: source.area_asset || source.area || "",
  category: source.category || "",
  breakdown_type: source.breakdown_type || "",
  internal_remarks: source.internal_remarks || source.description || "",
  customer_inputs: source.customer_inputs || undefined,
  assigned_to: source.assigned_to || "",
  created_user: source.created_user || source.created_by || "",
  priority: source.priority || "",
  responded_at: source.responded_at || undefined,
  resolved_at: source.resolved_at || undefined,
  contact_number: source.contact_number || undefined,
  before_temp: source.before_temp ?? null,
  after_temp: source.after_temp ?? null,
});

export default function Tickets() {
  const { canEdit } = useAttendanceGate();
  const { user } = useAuth();
  const isDark = useColorScheme() === "dark";
  const { isConnected } = useNetworkStatus();

  // ── Clean sites hook ──────────────────────────────────────────────────────
  const userId = user?.user_id || user?.id;
  const { sites, selectedSite, selectSite, loading: sitesLoading, refresh: refreshSites } = useSites(userId);
  const selectedSiteCode = selectedSite?.site_code ?? "";
  const siteName = selectedSite?.site_name ?? selectedSite?.site_code ?? "Select Site";

  // Default range = 1st of the current IST month → today (IST).
  const defaultToDate = useMemo(() => istTodayString(), []);
  const defaultFromDate = useMemo(() => {
    const { year, month } = istParts(new Date());
    return `${year}-${String(month).padStart(2, "0")}-01`;
  }, []);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Safety net: never let the skeleton outlive a slow/stalled fetch.
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 6000);
    return () => clearTimeout(t);
  }, []);
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
  const [searchInput, setSearchInput] = useState("");
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
  const [updateBreakdownType, setUpdateBreakdownType] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  // Synchronous double-submit guard. `isUpdating` is React state set well
  // after validation; rapid taps re-enter handleUpdateStatus before the
  // disabled button re-renders, which would spam updateTicket + WhatsApp.
  const isSubmittingRef = useRef(false);
  const [beforeTemp, setBeforeTemp] = useState("");
  const [afterTemp, setAfterTemp] = useState("");
  const [attachmentUri, setAttachmentUri] = useState("");
  const [createIncidentFromTicket, setCreateIncidentFromTicket] = useState(false);
  const [incidentDraft, setIncidentDraft] = useState<TicketIncidentDraft>(() =>
    makeTicketIncidentDraft(uuidv4),
  );

  const resetIncidentDraft = useCallback(() => {
    // New idempotency key per fresh draft so a *different* logical incident
    // doesn't reuse a key (which would make the backend dedupe return the
    // previous incident).
    setIncidentDraft(makeTicketIncidentDraft(uuidv4));
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
  const ticketsRef = useRef<Ticket[]>(tickets);
  ticketsRef.current = tickets;
  const refreshingRef = useRef(refreshing);
  refreshingRef.current = refreshing;
  const resetInFlightRef = useRef(false);

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

  // Build the stat counts from the local SQLite mirror so the cards still
  // populate with no/low network — the operator should not be able to tell
  // they're offline. Mirrors the same site/date/priority/search filtering
  // used for the offline ticket list.
  const computeLocalStats = useCallback(async () => {
    try {
      const localTickets = await db
        .select()
        .from(ticketsTable)
        .where(
          selectedSiteCode !== "all"
            ? eq(ticketsTable.site_code, selectedSiteCode)
            : undefined,
        );

      const normalizedSearch = searchQuery.trim().toLowerCase();
      const fromDateMs = getLocalDayStartMs(fromDate);
      const toDateMs = getLocalDayEndMs(toDate);

      const byStatus: Record<string, number> = {};
      let total = 0;

      for (const t of localTickets) {
        if (priorityFilter && priorityFilter !== "All" && t.priority !== priorityFilter) {
          continue;
        }
        const createdAtMs = parseCreatedAtMs(t.created_at);
        if ((fromDateMs != null || toDateMs != null) && createdAtMs == null) continue;
        if (fromDateMs != null && createdAtMs != null && createdAtMs < fromDateMs) continue;
        if (toDateMs != null && createdAtMs != null && createdAtMs > toDateMs) continue;

        if (normalizedSearch) {
          const haystack = [
            t.ticket_number,
            t.title,
            t.description,
            t.category,
            t.area,
            t.status,
            t.priority,
            t.assigned_to,
            t.created_by,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(normalizedSearch)) continue;
        }

        total += 1;
        if (t.status) byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      }

      return { total, byStatus };
    } catch {
      return null;
    }
  }, [selectedSiteCode, fromDate, toDate, searchQuery, priorityFilter]);

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
        return;
      }
      // Server unreachable (offline) — fall back to the local mirror so the
      // cards render real counts instead of a perpetual skeleton.
      const local = await computeLocalStats();
      if (local) setStats(local);
    } catch {
      const local = await computeLocalStats();
      if (local) setStats(local);
    }
  }, [
    selectedSiteCode,
    fromDate,
    toDate,
    searchQuery,
    priorityFilter,
    computeLocalStats,
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
    async (p: number, reset = false, opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!selectedSiteCode) {
        if (!silent) setLoading(false);
        return;
      }

      let hasLocalData = false;
      const hasRenderedTickets = ticketsRef.current.length > 0;

      if (reset) {
        resetInFlightRef.current = true;
        if (!silent) {
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

          if (!hasLocalData && !refreshingRef.current && !hasRenderedTickets) {
            setLoading(true);
          }
        }
      } else {
        setIsFetchingMore(true);
      }

      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        if (!silent) setLoading(false);
        setIsFetchingMore(false);
        setRefreshing(false);
        setHasMore(false);
        if (reset) resetInFlightRef.current = false;
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
            // A successful server response is authoritative for the active
            // filter: refresh=true bypasses the local cache, and a network
            // failure sets res.success=false (handled in the else below,
            // which preserves the optimistic local preview). So always
            // reflect the server result here — even when it's empty.
            // Skipping the empty case left stale local rows on screen
            // (e.g. tickets resolved on the server but not yet reconciled
            // locally still showing under the "Open" tab while the
            // server-driven count correctly read 0).
            setTickets(newTickets);
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
        if (!silent) {
          setLoading(false);
        }
        setIsFetchingMore(false);
        setRefreshing(false);
        if (reset) resetInFlightRef.current = false;
      }
    },
    [
      selectedSiteCode,
      statusFilter,
      priorityFilter,
      searchQuery,
      fromDate,
      toDate,
    ],
  );

  const resetAndFetch = useCallback(() => {
    setPage(1);
    // Removed setTickets([]) to preserve Optimistic UI during background pull
    setHasMore(true);
    lastRequestedPageRef.current = 0;
    fetchTickets(1, true);
  }, [fetchTickets]);

  /** Background refresh: no loading skeleton / list flash (realtime + filters handle primary UX). */
  const silentRefreshTickets = useCallback(() => {
    setPage(1);
    setHasMore(true);
    lastRequestedPageRef.current = 0;
    void fetchTickets(1, true, { silent: true });
    void fetchStats();
  }, [fetchTickets, fetchStats]);

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

  // Inline search box → debounced searchQuery (triggers the filter effect).
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchInput.trim() !== searchQuery) setSearchQuery(searchInput.trim());
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchInput, searchQuery]);

  // Keep the box in sync when search is changed elsewhere (clear / advanced).
  useEffect(() => {
    setSearchInput((prev) => (prev.trim() === searchQuery ? prev : searchQuery));
  }, [searchQuery]);

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

  // Periodic catch-up only: avoid focus + filter effect double-fetch and loading flicker (SSE + manual pull refresh).
  useAutoSync(silentRefreshTickets, [selectedSiteCode], {
    interval: 120000,
    throttle: 45000,
    syncOnFocus: false,
  });

  useEffect(() => {
    return () => {
      if (statsRefreshTimerRef.current) {
        clearTimeout(statsRefreshTimerRef.current);
        statsRefreshTimerRef.current = null;
      }
      ticketsRealtimeService.disconnect();
    };
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || isFetchingMore || loading || refreshing) return;
    if (resetInFlightRef.current) return;

    const nextPage = page + 1;
    if (nextPage <= lastRequestedPageRef.current) return;

    lastRequestedPageRef.current = nextPage;
    setPage(nextPage);
    fetchTickets(nextPage);
  }, [hasMore, isFetchingMore, loading, refreshing, page, fetchTickets]);

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
    // Category must be chosen by the operator on each update — don't carry
    // over the ticket's existing category as a pre-selection.
    setUpdateCategory("");
    setUpdateBreakdownType("");
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
  const latestFiltersRef = useRef({
    statusFilter,
    priorityFilter,
    searchQuery,
    fromDate,
    toDate,
    selectedSiteCode,
  });
  const recentEventIdsRef = useRef<string[]>([]);
  const statsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latestFiltersRef.current = {
      statusFilter,
      priorityFilter,
      searchQuery,
      fromDate,
      toDate,
      selectedSiteCode,
    };
  }, [statusFilter, priorityFilter, searchQuery, fromDate, toDate, selectedSiteCode]);

  const matchesCurrentFilters = useCallback((ticket: Ticket) => {
    const current = latestFiltersRef.current;
    if (!ticket?.id) return false;
    if (current.selectedSiteCode && current.selectedSiteCode !== "all" && ticket.site_code !== current.selectedSiteCode) {
      return false;
    }
    if (current.statusFilter && current.statusFilter !== "All" && ticket.status !== current.statusFilter) {
      return false;
    }
    if (current.priorityFilter && current.priorityFilter !== "All" && ticket.priority !== current.priorityFilter) {
      return false;
    }
    const createdAtMs = parseCreatedAtMs(ticket.created_at);
    const fromMs = getLocalDayStartMs(current.fromDate);
    const toMs = getLocalDayEndMs(current.toDate);
    if ((fromMs != null || toMs != null) && createdAtMs == null) return false;
    if (fromMs != null && createdAtMs != null && createdAtMs < fromMs) return false;
    if (toMs != null && createdAtMs != null && createdAtMs > toMs) return false;
    const normalizedSearch = current.searchQuery.trim().toLowerCase();
    if (!normalizedSearch) return true;
    const hay = [
      ticket.ticket_no,
      ticket.title,
      ticket.description,
      ticket.category,
      ticket.location,
      ticket.status,
      ticket.priority,
      ticket.assigned_to,
      ticket.created_user,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(normalizedSearch);
  }, []);

  const mergeRealtimeTicket = useCallback((incoming: Ticket) => {
    setTickets((prev) => {
      const idx = prev.findIndex((t) => t.id === incoming.id);
      const shouldShow = matchesCurrentFilters(incoming);
      if (idx === -1) {
        if (!shouldShow) return prev;
        return [incoming, ...prev];
      }
      if (!shouldShow) {
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      }
      const existing = prev[idx];
      const existingUpdated = Date.parse(existing.responded_at || existing.resolved_at || existing.created_at || "");
      const incomingUpdated = Date.parse(incoming.responded_at || incoming.resolved_at || incoming.created_at || "");
      if (!Number.isNaN(existingUpdated) && !Number.isNaN(incomingUpdated) && incomingUpdated < existingUpdated) {
        return prev;
      }
      const next = [...prev];
      next[idx] = { ...existing, ...incoming };
      return next;
    });
  }, [matchesCurrentFilters]);

  const handleRealtimeEvent = useCallback(async (event: TicketRealtimeEvent) => {
    if (!event?.event_id || !event?.ticket_id) return;
    if (event.site_code !== latestFiltersRef.current.selectedSiteCode) return;

    if (recentEventIdsRef.current.includes(event.event_id)) return;
    recentEventIdsRef.current.push(event.event_id);
    if (recentEventIdsRef.current.length > 200) {
      recentEventIdsRef.current = recentEventIdsRef.current.slice(-150);
    }

    // Avoid stomping optimistic/offline local changes that are still queued.
    const pending = await cacheManager.getPendingQueueItemsByType("ticket_update");
    const hasPendingForTicket = pending.some((row) => {
      const queuedId = String(row.payload?.ticket_id || "");
      return queuedId === event.ticket_id;
    });
    if (hasPendingForTicket) return;

    const ticketRes = await TicketsService.getTicketById(event.ticket_id);
    if (ticketRes?.success && ticketRes?.data) {
      mergeRealtimeTicket(normalizeRealtimeTicket(ticketRes.data));
      if (statsRefreshTimerRef.current) clearTimeout(statsRefreshTimerRef.current);
      statsRefreshTimerRef.current = setTimeout(() => {
        void fetchStats();
      }, 300);
    }
  }, [fetchStats, mergeRealtimeTicket]);

  useFocusEffect(
    useCallback(() => {
      if (!selectedSiteCode || !ticketsRealtimeService.isEnabled()) {
        return () => {};
      }
      // Defer the websocket connect past the tab-switch transition so its
      // synchronous setup doesn't compete with the frame painting this tab.
      const handle = InteractionManager.runAfterInteractions(() => {
        void ticketsRealtimeService.connect({
          siteCode: selectedSiteCode,
          onEvent: handleRealtimeEvent,
          onStateChange: (state) => {
            logger.debug("Tickets realtime connection state", {
              module: "TICKETS",
              state,
              siteCode: selectedSiteCode,
            });
          },
        });
      });

      return () => {
        handle.cancel?.();
        ticketsRealtimeService.disconnect();
      };
    }, [selectedSiteCode, handleRealtimeEvent]),
  );

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
    // Category must be chosen by the operator on each update — don't carry
    // over the ticket's existing category as a pre-selection.
    setUpdateCategory("");
    setUpdateBreakdownType("");
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
    // Block concurrent/rapid re-entry synchronously. Validation below is
    // fully synchronous, so a double-tap can only race at the first await
    // (TicketsService.updateTicket); setting this before it is sufficient
    // and avoids having to reset on every early validation return.
    if (isSubmittingRef.current) return;

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
    if (
      needsAreaAndCategory &&
      isBreakdownTypeCategory(updateCategory.trim() || selectedTicket.category || "") &&
      !updateBreakdownType.trim()
    ) {
      Alert.alert(
        "Required",
        "Please select Electrical or Mechanical for this breakdown.",
      );
      return;
    }
    if (needsAreaAndCategory) {
      const effectiveCategory = (
        updateCategory.trim() ||
        selectedTicket.category ||
        ""
      ).trim();
      if (isTempMandatoryCategory(effectiveCategory)) {
        // Which temps are captured tracks the current ticket status (see
        // TicketDetailStatusUpdate): Before only while Open; both Before and
        // After while Inprogress. Validate exactly what's shown.
        const isOpen = selectedTicket.status === "Open";
        const isInprogress = selectedTicket.status === "Inprogress";
        const bt = beforeTemp.trim();
        const at = afterTemp.trim();
        if (isOpen && !bt) {
          Alert.alert(
            "Required",
            "Please enter before temperature for this category.",
          );
          return;
        }
        if (isInprogress && (!bt || !at)) {
          Alert.alert(
            "Required",
            "Please enter before and after temperature for this category.",
          );
          return;
        }
        if (bt && Number.isNaN(parseFloat(bt))) {
          Alert.alert("Required", "Before temperature must be a valid number.");
          return;
        }
        if (isInprogress && at && Number.isNaN(parseFloat(at))) {
          Alert.alert("Required", "After temperature must be a valid number.");
          return;
        }
      }
    }

    if (createIncidentFromTicket) {
      if (!incidentDraft.fault_type) {
        Alert.alert("Required", "Please select fault type for the incident.");
        return;
      }
      if (!incidentDraft.severity) {
        Alert.alert("Required", "Please select severity for the incident.");
        return;
      }
      if (!incidentDraft.operating_condition) {
        Alert.alert("Required", "Please select operating condition for the incident.");
        return;
      }
    }

    const effectivePayloadCategory = updateCategory || selectedTicket.category;
    const payload: any = {
      status: updateStatus,
      internal_remarks: updateRemarks,
      area_asset: updateArea || selectedTicket.area_asset,
      category: effectivePayloadCategory,
    };
    // Only the Inprogress/Resolved flow shows the category + breakdown-type
    // pickers, so only then do we set breakdown_type — set it for a breakdown
    // category, clear it otherwise so a re-categorised ticket sheds a stale
    // Electrical/Mechanical tag. Other transitions leave the column untouched.
    if (needsAreaAndCategory) {
      payload.breakdown_type = isBreakdownTypeCategory(
        effectivePayloadCategory || "",
      )
        ? updateBreakdownType || null
        : null;
    }
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
        // Stable across re-submits / offline-queue replays of this same draft
        // so the backend collapses them into one incident.
        client_request_id: incidentDraft.client_request_id,
      };
    }

    if (beforeTemp.trim() !== "") payload.before_temp = parseFloat(beforeTemp);
    if (afterTemp.trim() !== "") payload.after_temp = parseFloat(afterTemp);

    if (updateStatus === "Inprogress" || updateStatus === "Cancelled") {
      payload.assigned_to = user?.full_name || user?.name || "";
    }

    // Capture the moment the operator actually performs the action, on-device.
    // We send these to the backend (which honors them only when the field is
    // still unset and never overwrites them) so that a ticket actioned offline
    // keeps its true action time instead of being stamped whenever the offline
    // queue eventually flushes. See backend updateComplaint idempotency guard.
    const nowIso = new Date().toISOString();
    if (
      (updateStatus === "Inprogress" || updateStatus === "Resolved") &&
      !selectedTicket.responded_at
    ) {
      payload.responded_at = nowIso;
    }
    if (updateStatus === "Resolved" && !selectedTicket.resolved_at) {
      payload.resolved_at = nowIso;
    }

    isSubmittingRef.current = true;
    setIsUpdating(true);
    try {
      const optimisticTicket = {
        ...selectedTicket,
        ...payload,
        responded_at:
          updateStatus === "Inprogress" || updateStatus === "Resolved"
            ? selectedTicket.responded_at || nowIso
            : selectedTicket.responded_at,
        resolved_at:
          updateStatus === "Resolved"
            ? selectedTicket.resolved_at || nowIso
            : selectedTicket.resolved_at,
      };

      // Always call updateTicket — it writes to local DB + enqueues + attempts
      // API. The result tells us whether the API confirmed; on network failure
      // the local write is already done so we must NOT show an error to the user.
      const res = await TicketsService.updateTicket(
        selectedTicket.id || selectedTicket.ticket_no,
        payload,
      );

      const apiConfirmed = res.success === true;
      const queuedOffline =
        !apiConfirmed && (res.isNetworkError === true || res.queued === true);

      if (apiConfirmed) {
        WhatsAppService.sendStatusUpdate(
          optimisticTicket,
          updateStatus,
          updateRemarks,
        ).catch((e: any) =>
          logger.warn("Failed WhatsApp notification", { error: e }),
        );
      }

      if (attachmentUri && (apiConfirmed || queuedOffline)) {
        const uploadRes = await TicketsService.uploadImage(
          attachmentUri,
          selectedTicket.id || selectedTicket.ticket_no,
        );

        if (uploadRes.success && uploadRes.url) {
          await TicketsService.addLineItem(
            selectedTicket.id || selectedTicket.ticket_no,
            { image_url: uploadRes.url },
          ).catch(() => {});
        }
      }

      if (apiConfirmed || queuedOffline) {
        // Whether the API confirmed or the write was persisted locally and
        // queued, the operator's change is safe and already reflected in the
        // UI. Show the exact same confirmation so low/no-network feels
        // identical to being online — no "offline"/"queued" wording.
        Alert.alert("Success", "Ticket updated successfully");
      } else {
        // Genuine server/validation rejection (happens regardless of
        // connectivity) — surface it so the operator can correct the input.
        Alert.alert("Error", res.error || "Failed to update ticket");
        return;
      }

      if (createIncidentFromTicket) {
        setCreateIncidentFromTicket(false);
        resetIncidentDraft();
        router.push({
          pathname: "/(tabs)/incidents",
          params: { status: "Inprogress" },
        });
      }
      // Inprogress (and other non-terminal) updates leave the modal open for
      // a follow-up transition; only Resolved closes it, and create-incident
      // navigates away.
      const modalStaysOpen =
        updateStatus !== "Resolved" && !createIncidentFromTicket;
      if (updateStatus === "Resolved") setIsDetailVisible(false);

      setSelectedTicket(optimisticTicket);
      setAttachmentUri("");

      if (modalStaysOpen) {
        // Re-seed the editable fields from the just-saved ticket — same as
        // opening it fresh — so the operator's entered temperatures/remarks
        // carry over into the next transition (e.g. Inprogress → Resolved)
        // instead of blanking out. Also moves the status selection forward,
        // since the old updateStatus is now filtered out of the chip list.
        const nextStatus = getDefaultUpdateStatus(optimisticTicket);
        setUpdateStatus(nextStatus);
        setUpdateRemarks(getInitialUpdateRemarks(optimisticTicket, nextStatus));
        setBeforeTemp(
          optimisticTicket.before_temp != null &&
            !Number.isNaN(Number(optimisticTicket.before_temp))
            ? String(optimisticTicket.before_temp)
            : "",
        );
        setAfterTemp(
          optimisticTicket.after_temp != null &&
            !Number.isNaN(Number(optimisticTicket.after_temp))
            ? String(optimisticTicket.after_temp)
            : "",
        );
      } else {
        setUpdateRemarks("");
        setBeforeTemp("");
        setAfterTemp("");
      }
      // Only re-sync from server when the API confirmed our write. When the
      // update was queued offline, the server still holds the stale row — a
      // refetch here would upsert the cache and stomp the optimistic status
      // (e.g. revert a freshly-set "Resolved" back to "Open"). The SyncEngine
      // flush will trigger a refetch once the queue drains.
      if (apiConfirmed) {
        fetchStats();
        resetAndFetch();
      }
    } catch {
      // updateTicket already persisted the change locally and enqueued it;
      // a throw here means the network attempt failed, which is invisible to
      // the operator. Show the same success confirmation as the online path.
      Alert.alert("Success", "Ticket updated successfully");
    } finally {
      isSubmittingRef.current = false;
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
          <View className="mb-3 self-start px-3 py-1 rounded-full bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40">
            <Text className="text-[11px] font-semibold text-red-700 dark:text-red-300">
              {dateRangePreview}
            </Text>
          </View>

          <View className="flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5">
            <Search size={16} color="#94a3b8" />
            <TextInput
              value={searchInput}
              onChangeText={setSearchInput}
              placeholder="Search by ID, area, category…"
              placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
              className="flex-1 ml-2 text-sm text-slate-900 dark:text-slate-50"
              style={{ paddingVertical: 0 }}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchInput.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearchInput("")}
                hitSlop={8}
                className="ml-1"
              >
                <X size={16} color="#94a3b8" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <TicketStats
          stats={stats}
          loading={loading && tickets.length === 0}
          currentStatus={statusFilter}
          onStatusChange={setStatusFilter}
        />
        <TicketFilters
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          stats={stats}
        />

        <View className="flex-1">
          <FlashList
            data={enrichedTickets}
            renderItem={renderTicketItem}
            keyExtractor={keyExtractor}
            // Uniform-height cards (single recycle pool, no getItemType) + a
            // wider draw distance so fast flings don't outrun cell rendering
            // and reveal blank space. See PM list for the same config.
            drawDistance={600}
            ListEmptyComponent={loading ? <TicketSkeleton /> : (
              <EmptyState
                icon={TicketIcon}
                title="No tickets found"
                action={
                  isConnected && !sitesLoading && sites.length === 0
                    ? {
                        label: "Retry Server Sync",
                        onPress: async () => {
                          await refreshSites();
                          resetAndFetch();
                        },
                      }
                    : undefined
                }
              />
            )}
            ListFooterComponent={isFetchingMore ? <TicketSkeletonItem /> : null}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.1}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#dc2626" />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 100 }}
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
            updateBreakdownType={updateBreakdownType}
            setUpdateBreakdownType={setUpdateBreakdownType}
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
            canEdit={canEdit}
          />
        )}
      </SafeAreaView>
    </View>
  );
}
