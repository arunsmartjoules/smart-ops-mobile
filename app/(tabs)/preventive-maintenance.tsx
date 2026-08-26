import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useDeferredValue,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  RefreshControl,
  useColorScheme,
  Modal,
  Image,
  Alert,
} from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import {
  ListChecks,
  WifiOff,
  ChevronLeft,
  Calendar as CalendarIcon,
  CalendarCheck,
  QrCode,
  X,
  Camera,
  Image as ImageIcon,
} from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import Animated from "react-native-reanimated";
import PMItem from "@/components/PMItem";
import { getPmStatus } from "@/components/pm/PMUI";
import { ds } from "@/constants/ds";
import {
  ListCountLine,
  ListEmptyCard,
  ModuleListHeader,
  useListSlide,
  type StatusChip,
} from "@/components/shared/ListChrome";
import { useAuth } from "@/contexts/AuthContext";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import NetInfo from "@react-native-community/netinfo";
import PMService from "@/services/PMService";
import { useAutoSync } from "@/hooks/useAutoSync";
import { AttendanceService, type Site } from "@/services/AttendanceService";
import { useSites } from "@/hooks/useSites";
import { db, pmInstances } from "@/database";
import { eq } from "drizzle-orm";
import { addDays } from "date-fns";
import {
  istDateString,
  istTodayString,
  istParts,
  istDayStartMsFromYmd,
  istDayEndMsFromYmd,
  formatIST,
} from "@/utils/istDate";
import AdvancedFilterModal from "@/components/AdvancedFilterModal";
import QRScannerModal, { type QRScannerRef } from "@/components/QRScannerModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/utils/logger";
import Skeleton from "@/components/Skeleton";

type PMInstanceRow = typeof pmInstances.$inferSelect;

// Constants
const PAGE_SIZE = 20;

// Display patterns used in this screen, mapped to IST Intl options so dates
// always render as the India calendar day regardless of device timezone.


const STATUS_OPTIONS = ["Pending", "In-progress", "Completed"];

const DMY: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

// The PM list date-range filter can target either the due date (default)
// or the completed date — the advanced filter exposes this as a selector.
const PM_DATE_FIELD_OPTIONS = [
  { value: "due_date", label: "Due Date" },
  { value: "completed_date", label: "Completed Date" },
];

// IST month bounds as "YYYY-MM-DD" (timezone-pure arithmetic — no DST in IST).
const istMonthStart = () => {
  const { year, month } = istParts(new Date());
  return `${year}-${String(month).padStart(2, "0")}-01`;
};
const istMonthEnd = () => {
  const { year, month } = istParts(new Date());
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
};

// ─── PMSkeleton ──────────────────────────────────────────────────────────────
// Fills the list area (flex: 1) so a slow cold load reads as "loading" rather
// than leaving dead space under a few placeholder cards, and mirrors PMItem's
// four-line body so the handoff to real rows doesn't jump.
const PMSkeleton = () => (
  <View style={styles.skeletonArea}>
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <View key={i} style={styles.skeletonCard}>
        <View style={styles.skeletonRow}>
          <Skeleton width={64} height={10} borderRadius={3} />
          <Skeleton width={54} height={12} borderRadius={4} />
          <Skeleton width={48} height={12} borderRadius={4} />
        </View>
        <Skeleton
          width="72%"
          height={14}
          borderRadius={4}
          style={{ marginBottom: 8 }}
        />
        <Skeleton
          width="46%"
          height={10}
          borderRadius={3}
          style={{ marginBottom: 7 }}
        />
        <View style={styles.skeletonRow}>
          <Skeleton width={92} height={10} borderRadius={3} />
          <View style={{ flex: 1 }} />
          <Skeleton width={20} height={20} borderRadius={10} />
          <Skeleton width={62} height={10} borderRadius={3} />
        </View>
      </View>
    ))}
  </View>
);

// ─── Memoized PM Card ──────────────────────────────────────────────────────────

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function PreventiveMaintenance() {
  const { user } = useAuth();
  const { canEdit } = useAttendanceGate();
  const { isConnected } = useNetworkStatus();
  const isDark = useColorScheme() === "dark";

  const [allInstances, setAllInstances] = useState<PMInstanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Pre-execution Start modal: capture the before-image, stamp the start
  // time, then move to the execution screen.
  const [startModalInstance, setStartModalInstance] =
    useState<PMInstanceRow | null>(null);
  const [startBeforeImage, setStartBeforeImage] = useState<string>("");
  const [starting, setStarting] = useState(false);
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [sortMode, setSortMode] = useState<"Due date" | "Status">("Due date");
  const [slide, setSlide] = useState({ seq: 0, dir: 1 });
  const insets = useSafeAreaInsets();
  const listSlideStyle = useListSlide(slide.seq, slide.dir);
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [serverStats, setServerStats] = useState<any>(null);

  // Safety net: never let the skeleton outlive a slow/stalled fetch.
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 6000);
    return () => clearTimeout(t);
  }, []);

  // Pagination State
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 200;

  // ── Clean sites hook ──────────────────────────────────────────────────────
  const userId = user?.user_id || user?.id;
  const { sites, selectedSite, selectSite } = useSites(userId);
  const siteCode = selectedSite?.site_code ?? "";
  const siteName =
    selectedSite?.site_name ?? selectedSite?.site_code ?? "Select Site";

  // Date handling — default to the current month (1st → last day)
  const [currentDate, setCurrentDate] = useState(istMonthStart());
  const [toDate, setToDate] = useState(istMonthEnd());

  const [tempSearch, setTempSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  // Deferred copy for the expensive per-row filter below. The TextInput stays
  // bound to searchQuery (instant echo), but filteredInstances — which runs an
  // O(n) toLowerCase + IST date-format sweep over every cached PM per keystroke
  // — reads the deferred value, so typing no longer stutters on mid-range
  // Android with a few hundred instances cached.
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [tempFromDate, setTempFromDate] = useState<string | null>(
    istMonthStart(),
  );
  const [tempToDate, setTempToDate] = useState<string | null>(istMonthEnd());

  // Which date column the date-range filter applies to. `dateField` is the
  // applied value; `tempDateField` is the pending choice inside the modal.
  const [dateField, setDateField] = useState("due_date");
  const [tempDateField, setTempDateField] = useState("due_date");

  // QR filter state
  const qrScannerRef = useRef<QRScannerRef>(null);
  const [qrAssetFilter, setQrAssetFilter] = useState<string | null>(null);

  // Guard against re-fetching while server pull is in progress
  const isFetchingRef = useRef(false);
  const [syncing, setSyncing] = useState(false);

  // Mirror allInstances into a ref so loadPMData can check "do we already
  // have rendered data?" without putting allInstances.length in its deps.
  // Closing over the length there created a re-entry cascade: setAllInstances
  // → length changes → useCallback recomputes → useEffect re-fires →
  // loadPMData(true) again → setAllInstances again → flicker + bouncing
  // counts in the In-progress tab.
  const allInstancesRef = useRef<PMInstanceRow[]>([]);
  useEffect(() => {
    allInstancesRef.current = allInstances;
  }, [allInstances]);

  // Sync temp dates when modal opens
  useEffect(() => {
    if (showFiltersModal) {
      setTempFromDate(currentDate);
      setTempToDate(toDate);
      setTempDateField(dateField);
    }
  }, [showFiltersModal, currentDate, toDate, dateField]);

  // ── High-Performance Data Loader ──────────────────────────────────────────
  const loadPMData = useCallback(
    async (isInitial = false, currentOffset = 0, showLoadingSpinner = true) => {
      if (!siteCode || siteCode === "all") return;
      const hasRenderedData = allInstancesRef.current.length > 0;

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

            // Prune orphaned instances the server no longer has for this window
            // (e.g. a re-imported month gets new ids) so stale rows can't
            // inflate the counts or 404 on completion. Safe: only prunes a
            // provably-complete window and never a row with pending edits.
            await PMService.reconcilePmWindow(siteCode, currentDate, toDate);

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
    // PAGE_SIZE is a stable in-component const (200); allInstances.length is
    // tracked via allInstancesRef so it doesn't churn the callback identity.
    [siteCode, currentDate, toDate, isConnected],
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
    } else if (deferredSearchQuery) {
      const q = deferredSearchQuery.toLowerCase();
      list = list.filter((i) => {
        const dateObj = i.start_due_date ? new Date(i.start_due_date) : null;
        const dueDateStr = dateObj
          ? formatIST(dateObj, { day: "numeric", month: "short", year: "numeric" })
          : "";
        const dueDateISO = dateObj ? istDateString(dateObj) : "";
        const dueDateShort = dateObj
          ? (() => {
              const p = istParts(dateObj);
              return `${p.day}/${p.month}`;
            })()
          : "";

        return (
          (i.title && i.title.toLowerCase().includes(q)) ||
          (i.asset_id && i.asset_id.toLowerCase().includes(q)) ||
          (i.asset_type && i.asset_type.toLowerCase().includes(q)) ||
          (dueDateStr && dueDateStr.toLowerCase().includes(q)) ||
          (dueDateISO && dueDateISO.includes(q)) ||
          (dueDateShort && dueDateShort.includes(q))
        );
      });
      // Fall through to the date-range filter below: a text search narrows
      // the list but must still stay inside the selected window, so the
      // list matches the (date-windowed) Total/Pending/Completed counts.
      // Users reported May PMs surfacing under a July filter when search
      // returned early here and skipped the date predicate entirely.
    }

    // 3. Apply Date Filter. Runs for every mode now — normal browsing, text
    //    search, and QR asset scan (QR resets the window to the current month
    //    in handleQRAssetFound, so this keeps it scoped to that month).
    //    The column compared depends on the selected date field.
    const startRange = istDayStartMsFromYmd(currentDate) ?? 0;
    const endRange = istDayEndMsFromYmd(toDate) ?? Number.MAX_SAFE_INTEGER;
    list = list.filter((i) => {
      const dateVal =
        dateField === "completed_date" ? i.completed_on : i.start_due_date;
      if (!dateVal) return false;
      const ts = new Date(dateVal).getTime();
      return ts >= startRange && ts <= endRange;
    });
    return list;
  }, [
    allInstances,
    statusFilter,
    deferredSearchQuery,
    qrAssetFilter,
    currentDate,
    toDate,
    dateField,
  ]);

  const stats = useMemo(() => {
    const startRange = istDayStartMsFromYmd(currentDate) ?? 0;
    const endRange = istDayEndMsFromYmd(toDate) ?? Number.MAX_SAFE_INTEGER;

    const rangeInstances = allInstances.filter((i) => {
      const dateVal =
        dateField === "completed_date" ? i.completed_on : i.start_due_date;
      if (!dateVal) return false;
      const ts = new Date(dateVal).getTime();
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

    // Counts come from ONE source — never a per-field Math.max of two. Mixing
    // server and local (each windowed/complete differently, and each device's
    // cache in a different state) made the per-status maxes stop summing to the
    // total, so the tallies disagreed across devices/screens and drifted as the
    // cache filled or orphans were pruned. Server stats are computed over the
    // full DB for the exact due-date window: authoritative, identical on every
    // device, and internally consistent (buckets partition the total). Use them
    // when online; fall back to the local windowed aggregation only when
    // offline, before stats arrive, or when filtering by completed date (the
    // server stat is due-date-only). The local fallback still reflects
    // optimistic pending updates, and the list below always renders from local.
    if (serverStats && dateField !== "completed_date") {
      const inProgress =
        (serverStats.byStatus?.["In-progress"] || 0) +
        (serverStats.byStatus?.["In Progress"] || 0) +
        (serverStats.byStatus?.Inprogress || 0);
      const completed = serverStats.byStatus?.Completed || 0;
      const total = serverStats.total ?? 0;
      const pending = Math.max(0, total - inProgress - completed);

      return { total, pending, inProgress, completed };
    }

    return localCount;
  }, [allInstances, currentDate, toDate, serverStats, dateField]);

  const handlePMCardPress = useCallback((instance: PMInstanceRow) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const normalizedStatus = (instance.status || "").toLowerCase();
    const isNotStarted =
      normalizedStatus === "pending" ||
      normalizedStatus === "open" ||
      normalizedStatus === "";
    if (isNotStarted) {
      if (!canEdit) {
        // Read-only mode: nothing to view yet for an un-started PM.
        Alert.alert(
          "Read-only mode",
          "This PM hasn't been started. Start your day to begin it.",
        );
        return;
      }
      // Not started yet: capture the before-image and stamp the start time
      // in a modal before entering the execution screen. Assignment is
      // stamped there, on confirm — see handleConfirmStart.
      setStartBeforeImage("");
      setStartModalInstance(instance);
      return;
    }

    // Already In-progress or Completed — open execution directly so the
    // original start time is preserved (no re-start). Assignment is
    // intentionally left untouched here, so reopening a PM from the
    // In-progress tab never reassigns it away from whoever started it.
    router.push({
      pathname: "/pm-execution",
      params: { instanceId: instance.id },
    });
  }, [canEdit]);

  const pickStartBeforeImage = useCallback(
    async (source: "camera" | "library") => {
      try {
        const options: ImagePicker.ImagePickerOptions = {
          mediaTypes: ["images"],
          allowsEditing: true,
          quality: 0.7,
        };
        if (source === "camera") {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert(
              "Permission Required",
              "Camera access is required to capture the before photo.",
            );
            return;
          }
          const result = await ImagePicker.launchCameraAsync(options);
          if (!result.canceled && result.assets[0]?.uri) {
            setStartBeforeImage(result.assets[0].uri);
          }
        } else {
          const perm =
            await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert(
              "Permission Required",
              "Photo library access is required to choose the before photo.",
            );
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync(options);
          if (!result.canceled && result.assets[0]?.uri) {
            setStartBeforeImage(result.assets[0].uri);
          }
        }
      } catch (err) {
        logger.error("PM start before-image picker error", { error: err });
        Alert.alert("Error", "Failed to pick image.");
      }
    },
    [],
  );

  const promptStartBeforeImage = useCallback(() => {
    Alert.alert("Before photo", "Choose an option", [
      { text: "Take photo", onPress: () => void pickStartBeforeImage("camera") },
      {
        text: "Choose from gallery",
        onPress: () => void pickStartBeforeImage("library"),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [pickStartBeforeImage]);

  const closeStartModal = useCallback(() => {
    if (starting) return;
    setStartModalInstance(null);
    setStartBeforeImage("");
  }, [starting]);

  const handleConfirmStart = useCallback(async () => {
    if (!startModalInstance || starting) return;
    setStarting(true);
    try {
      // The operator who starts the PM becomes its assignee. This is the
      // only point where assigned_to is stamped from the list screen.
      const userName =
        (user?.full_name && user.full_name.trim()) ||
        (user?.name && user.name.trim()) ||
        user?.email ||
        "User";
      await PMService.startExecution(startModalInstance.id, {
        beforeImage: startBeforeImage,
        startDatetime: new Date().toISOString(),
        assignedToName: userName,
      });
      // Optimistic: reflect In-progress + before_image + assignee locally.
      setAllInstances((prev) =>
        prev.map((inst) =>
          inst.id === startModalInstance.id
            ? {
                ...inst,
                status: "In-progress",
                before_image: startBeforeImage,
                assigned_to_name: userName,
              }
            : inst,
        ),
      );
      const instanceId = startModalInstance.id;
      setStartModalInstance(null);
      setStartBeforeImage("");
      router.push({ pathname: "/pm-execution", params: { instanceId } });
    } catch (err) {
      logger.error("Failed to start PM", { error: err });
      Alert.alert("Error", "Could not start this PM. Please try again.");
    } finally {
      setStarting(false);
    }
  }, [startModalInstance, startBeforeImage, starting, user]);

  const applyAdvancedFilters = useCallback(() => {
    setSearchQuery(tempSearch);
    if (tempFromDate) setCurrentDate(tempFromDate);
    if (tempToDate) setToDate(tempToDate);
    setDateField(tempDateField);
    setShowFiltersModal(false);
  }, [tempSearch, tempFromDate, tempToDate, tempDateField]);

  const handleQRAssetFound = useCallback((assetName: string) => {
    setCurrentDate(istMonthStart());
    setToDate(istMonthEnd());
    setQrAssetFilter(assetName);
    setSearchQuery("");
  }, []);

  const clearQRFilter = useCallback(() => {
    setQrAssetFilter(null);
    // ±30 days around today, expressed as IST calendar days.
    setCurrentDate(istDateString(addDays(new Date(), -30)));
    setToDate(istDateString(addDays(new Date(), 30)));
  }, []);

  const statusChips = useMemo<StatusChip[]>(
    () => [
      { key: "All", label: "All", count: stats.total },
      { key: "Pending", label: "Open", count: stats.pending },
      { key: "In-progress", label: "In progress", count: stats.inProgress },
      { key: "Completed", label: "Completed", count: stats.completed },
    ],
    [stats],
  );

  const visibleCount = useMemo(() => {
    switch (statusFilter) {
      case "Pending":
        return stats.pending;
      case "In-progress":
        return stats.inProgress;
      case "Completed":
        return stats.completed;
      default:
        return stats.total;
    }
  }, [statusFilter, stats]);

  const countLabel = useMemo(() => {
    if (statusFilter === "All") return "PMs this period";
    const label =
      statusChips.find((c) => c.key === statusFilter)?.label ?? statusFilter;
    return `${label.toLowerCase()} PMs`;
  }, [statusFilter, statusChips]);

  const selectStatusChip = useCallback(
    (key: string) => {
      if (key === statusFilter) return;
      const order = statusChips.map((c) => c.key);
      const dir = order.indexOf(key) >= order.indexOf(statusFilter) ? 1 : -1;
      setSlide((prev) => ({ seq: prev.seq + 1, dir }));
      setStatusFilter(key);
    },
    [statusFilter, statusChips],
  );

  const cycleSort = useCallback(() => {
    setSortMode((m) => (m === "Due date" ? "Status" : "Due date"));
  }, []);

  const STATUS_RANK: Record<string, number> = {
    overdue: 1,
    pending: 2,
    "in-progress": 3,
    "in progress": 3,
    inprogress: 3,
    completed: 4,
  };

  const sortedInstances = useMemo(() => {
    const rows = [...filteredInstances];
    const due = (i: PMInstanceRow) => Number(i.start_due_date ?? 0);
    if (sortMode === "Status") {
      rows.sort((a, b) => {
        const ra = STATUS_RANK[(a.status || "").toLowerCase()] ?? 9;
        const rb = STATUS_RANK[(b.status || "").toLowerCase()] ?? 9;
        return ra !== rb ? ra - rb : due(a) - due(b);
      });
      return rows;
    }
    rows.sort((a, b) => due(a) - due(b));
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredInstances, sortMode]);

  const renderItem: ListRenderItem<PMInstanceRow> = useCallback(
    ({ item }) => (
      <PMItem
        instance={item}
        onPress={() => handlePMCardPress(item)}
        showCompletedDate={
          statusFilter === "Completed" || dateField === "completed_date"
        }
      />
    ),
    [handlePMCardPress, statusFilter, dateField],
  );

  const keyExtractor = useCallback((item: PMInstanceRow) => item.id, []);

  const getItemType = useCallback(
    (item: PMInstanceRow) =>
      getPmStatus(item.status).label === "In progress" ? "progress" : "plain",
    [],
  );

  const ListEmpty = useMemo(
    () => (
      <ListEmptyCard
        icon={CalendarCheck}
        label={
          allInstances.length > 0
            ? `No PMs match this filter (${allInstances.length} in range)`
            : "No PM tasks found"
        }
      />
    ),
    [allInstances.length],
  );

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#dc2626" />
      </View>
    );
  }, [loadingMore]);

  const dateRangeLabel = useMemo(() => {
    const prefix = dateField === "completed_date" ? "Completed " : "";
    const fromMs = istDayStartMsFromYmd(currentDate);
    const toMs = istDayStartMsFromYmd(toDate);
    if (fromMs == null || toMs == null) return `${prefix}All dates`;
    const a = istParts(fromMs);
    const b = istParts(toMs);
    if (a.year === b.year && a.month === b.month) {
      return `${prefix}${formatIST(fromMs, { day: "numeric" })}\u2013${formatIST(toMs, DMY)}`;
    }
    if (a.year === b.year) {
      return `${prefix}${formatIST(fromMs, { day: "numeric", month: "short" })} \u2013 ${formatIST(toMs, DMY)}`;
    }
    return `${prefix}${formatIST(fromMs, DMY)} \u2013 ${formatIST(toMs, DMY)}`;
  }, [currentDate, toDate, dateField]);

  return (
    <View style={{ flex: 1, backgroundColor: ds.pageBg }}>
      <ModuleListHeader
        topInset={insets.top}
        siteName={siteName}
        dateLabel={dateRangeLabel}
        onPressSite={() => setShowFiltersModal(true)}
        onRefresh={() => {
          if (!isConnected) return;
          handleHeaderManualRefresh();
        }}
        refreshDisabled={!isConnected}
        onFilter={() => setShowFiltersModal(true)}
        filterActive={
          tempFromDate !== istTodayString() || tempToDate !== istTodayString()
        }
        search={searchQuery}
        onChangeSearch={setSearchQuery}
        searchPlaceholder="Search asset, PM type or area"
        chips={statusChips}
        activeChip={statusFilter}
        onSelectChip={selectStatusChip}
        // Same list layout as tickets and incidents: the site name is the
        // title (no pin) and the status tabs sit on the canvas below a
        // rounded thunder header.
        showSiteIcon={false}
        tabPlacement="canvas"
      />

      <ListCountLine
        count={visibleCount}
        label={countLabel}
        sortLabel={sortMode}
        onSort={cycleSort}
      />

      {/* QR scan narrows the list to a single asset. */}
      <View style={styles.qrRow}>
        {qrAssetFilter ? (
          <View style={styles.qrChip}>
            <QrCode size={12} color={ds.flame[100]} />
            <Text style={styles.qrChipText} numberOfLines={1}>
              {qrAssetFilter}
            </Text>
            <TouchableOpacity onPress={clearQRFilter} hitSlop={8}>
              <X size={14} color={ds.flame[100]} />
            </TouchableOpacity>
          </View>
        ) : null}
        <TouchableOpacity
          onPress={() => qrScannerRef.current?.open()}
          style={styles.qrScanBtn}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Scan asset QR code"
        >
          <QrCode size={15} color={ds.thunder[100]} />
          <Text style={styles.qrScanLabel}>
            {qrAssetFilter ? "Rescan" : "Scan asset"}
          </Text>
        </TouchableOpacity>
      </View>

      {loading && allInstances.length === 0 ? (
        <PMSkeleton />
      ) : (
        <Animated.View style={[{ flex: 1 }, listSlideStyle]}>
          <FlashList
            data={sortedInstances}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            // Two card heights exist: in-progress rows carry a progress bar,
            // everything else doesn't. Giving each its own recycle pool stops
            // a recycled short cell being re-measured as a tall one mid-fling,
            // which showed up as blank space on the mixed "All" tab.
            getItemType={getItemType}
            drawDistance={600}
            ListEmptyComponent={ListEmpty}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={renderFooter}
            refreshControl={
              <RefreshControl
                refreshing={refreshing || (syncing && allInstances.length > 0)}
                onRefresh={onRefresh}
                tintColor={ds.thunder[100]}
              />
            }
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          />
        </Animated.View>
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
          dateFieldOptions={PM_DATE_FIELD_OPTIONS}
          selectedDateField={tempDateField}
          setSelectedDateField={setTempDateField}
          applyAdvancedFilters={applyAdvancedFilters}
        />

        <QRScannerModal
          ref={qrScannerRef}
          siteCode={siteCode}
          onClose={() => {}}
          onAssetFound={handleQRAssetFound}
        />
        <Modal
          visible={!!startModalInstance}
          transparent
          animationType="fade"
          onRequestClose={closeStartModal}
        >
          <View style={styles.startModalOverlay}>
            <View
              style={[
                styles.startModalCard,
                { backgroundColor: isDark ? "#0f172a" : "#ffffff" },
              ]}
            >
              <View style={styles.startModalHeader}>
                <Text
                  style={[
                    styles.startModalTitle,
                    { color: isDark ? "#f1f5f9" : "#0f172a" },
                  ]}
                >
                  Start PM
                </Text>
                <TouchableOpacity
                  onPress={closeStartModal}
                  disabled={starting}
                  hitSlop={10}
                >
                  <X size={20} color={isDark ? "#94a3b8" : "#64748b"} />
                </TouchableOpacity>
              </View>

              <Text
                style={[
                  styles.startModalSubtitle,
                  { color: isDark ? "#94a3b8" : "#64748b" },
                ]}
                numberOfLines={2}
              >
                {startModalInstance?.title || ""}
              </Text>

              <Text
                style={[
                  styles.startModalLabel,
                  { color: isDark ? "#cbd5e1" : "#475569" },
                ]}
              >
                Before Photo
              </Text>

              <TouchableOpacity
                onPress={promptStartBeforeImage}
                disabled={starting}
                style={[
                  styles.startBeforeBox,
                  {
                    borderColor: startBeforeImage
                      ? "#3b82f6"
                      : isDark
                        ? "#334155"
                        : "#cbd5e1",
                    backgroundColor: isDark ? "#1e293b" : "#f8fafc",
                  },
                ]}
              >
                {startBeforeImage ? (
                  <Image
                    source={{ uri: startBeforeImage }}
                    style={styles.startBeforePreview}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.startBeforePlaceholder}>
                    <Camera size={22} color={isDark ? "#64748b" : "#94a3b8"} />
                    <Text
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        fontWeight: "600",
                        color: isDark ? "#64748b" : "#94a3b8",
                      }}
                    >
                      Tap to capture before photo
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {startBeforeImage ? (
                <TouchableOpacity
                  onPress={promptStartBeforeImage}
                  disabled={starting}
                  style={styles.startRetakeBtn}
                >
                  <ImageIcon size={14} color="#3b82f6" />
                  <Text style={styles.startRetakeText}>Change photo</Text>
                </TouchableOpacity>
              ) : (
                <Text
                  style={{
                    fontSize: 11,
                    color: isDark ? "#64748b" : "#94a3b8",
                    marginTop: 6,
                  }}
                >
                  Optional — you can add a before photo now or skip and start the PM.
                </Text>
              )}

              <View style={styles.startModalActions}>
                <TouchableOpacity
                  onPress={closeStartModal}
                  disabled={starting}
                  style={[
                    styles.startBtn,
                    {
                      backgroundColor: "transparent",
                      borderWidth: 1,
                      borderColor: isDark ? "#334155" : "#e2e8f0",
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontWeight: "700",
                      color: isDark ? "#cbd5e1" : "#475569",
                    }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleConfirmStart}
                  disabled={starting}
                  style={[
                    styles.startBtn,
                    {
                      backgroundColor: starting ? "#93c5fd" : "#2563eb",
                    },
                  ]}
                >
                  {starting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={{ fontWeight: "700", color: "#ffffff" }}>
                      Start
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  skeletonArea: { flex: 1, paddingHorizontal: 16 },
  skeletonCard: {
    backgroundColor: ds.white,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 7,
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 8,
  },
  qrRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  qrScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#DCDBDA",
    backgroundColor: "#FFFFFF",
  },
  qrScanLabel: { fontSize: 11, fontWeight: "600", color: "#072B31" },
  flex: { flex: 1 },
  container: { flex: 1 },
  listHeader: { paddingTop: 2, paddingHorizontal: 20, paddingBottom: 8 },
  listContent: { paddingHorizontal: 12, paddingBottom: 60 },

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
  startModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.6)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  startModalCard: {
    borderRadius: 20,
    padding: 20,
  },
  startModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  startModalTitle: { fontSize: 18, fontWeight: "800" },
  startModalSubtitle: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  startModalLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 18,
    marginBottom: 8,
  },
  startBeforeBox: {
    height: 160,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  startBeforePreview: { width: "100%", height: "100%" },
  startBeforePlaceholder: { alignItems: "center", justifyContent: "center" },
  startRetakeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    alignSelf: "flex-start",
  },
  startRetakeText: { color: "#3b82f6", fontSize: 12, fontWeight: "700" },
  startModalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 22,
  },
  startBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
