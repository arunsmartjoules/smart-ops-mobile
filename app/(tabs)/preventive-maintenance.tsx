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
  StyleSheet,
  ScrollView,
  RefreshControl,
  TextInput,
  useColorScheme,
  Modal,
  Image,
  Alert,
} from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import EmptyState from "@/components/EmptyState";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import {
  ListChecks,
  Wrench,
  Filter,
  RefreshCw,
  WifiOff,
  MapPin,
  ChevronDown,
  Clock,
  Search,
  ChevronLeft,
  Calendar as CalendarIcon,
  QrCode,
  X,
  Camera,
  Image as ImageIcon,
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
import { addDays, isValid } from "date-fns";
import {
  istDateString,
  istTodayString,
  istParts,
  istDayStartMsFromYmd,
  istDayEndMsFromYmd,
  formatIST,
  toIstDayMs,
} from "@/utils/istDate";
import AdvancedFilterModal from "@/components/AdvancedFilterModal";
import QRScannerModal, { type QRScannerRef } from "@/components/QRScannerModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/utils/logger";
import Skeleton from "@/components/Skeleton";
import { getPmStatusVisual, getInitials } from "@/utils/ticketVisuals";

type PMInstanceRow = typeof pmInstances.$inferSelect;

// Constants
const PAGE_SIZE = 20;

// Display patterns used in this screen, mapped to IST Intl options so dates
// always render as the India calendar day regardless of device timezone.
const IST_PATTERN_OPTS: Record<string, Intl.DateTimeFormatOptions> = {
  "d MMM yyyy": { day: "numeric", month: "short", year: "numeric" },
  "d MMM": { day: "numeric", month: "short" },
};

const safeFormat = (date: any, formatStr: string) => {
  if (date == null || date === "") return "N/A";
  // Route everything through toIstDayMs so a "YYYY-MM-DD" string anchors to IST
  // 00:00 (not device-local midnight). parseISO/new Date on a date-only string
  // is timezone-sensitive and can roll the calendar day backward on devices
  // east of IST — same root cause as the filter-side leak.
  let ms: number | null;
  if (typeof date === "string" && /^\d+$/.test(date)) {
    ms = parseInt(date, 10);
  } else {
    ms = toIstDayMs(date);
  }
  if (ms == null) return "Invalid Date";
  const d = new Date(ms);
  if (!isValid(d)) return "Invalid Date";
  return formatIST(d, IST_PATTERN_OPTS[formatStr] || IST_PATTERN_OPTS["d MMM yyyy"]);
};

const STATUS_OPTIONS = ["Pending", "In-progress", "Completed"];

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
    const status = getPmStatusVisual(instance.status);

    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0 : 0.03,
          shadowRadius: 8,
          elevation: 1,
        }}
      >
        {/* Top: icon · asset/title · status chip */}
        <View className="flex-row items-start">
          <View
            className="w-9 h-9 rounded-[10px] items-center justify-center mr-2.5"
            style={{ backgroundColor: status.tint }}
          >
            <Wrench size={16} color={status.color} />
          </View>

          <View className="flex-1 min-w-0 mr-2">
            <Text
              className="text-slate-900 dark:text-slate-50 font-semibold text-[14px] leading-5"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {instance.title || instance.asset_id || "PM Task"}
            </Text>
            <View className="flex-row items-center mt-1">
              <Text
                className="text-slate-500 dark:text-slate-400 text-[11px] font-medium flex-shrink"
                numberOfLines={1}
              >
                {instance.asset_id || "Unknown Asset"}
              </Text>
              <View className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-2" />
              <Text
                className="text-slate-400 dark:text-slate-500 text-[11px] uppercase flex-shrink-0"
                numberOfLines={1}
              >
                {instance.frequency || "ONCE"}
              </Text>
            </View>
          </View>

          <View
            className="flex-row items-center rounded-md px-2 py-1 flex-shrink-0"
            style={{ backgroundColor: status.tint }}
          >
            <View
              className="w-1.5 h-1.5 rounded-full mr-1.5"
              style={{ backgroundColor: status.color }}
            />
            <Text
              className="text-[9px] font-bold uppercase tracking-wide"
              style={{ color: status.color }}
            >
              {status.label}
            </Text>
          </View>
        </View>

        {/* Foot: due date · assignee */}
        <View className="flex-row items-center justify-between mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
          <View className="flex-row items-center flex-shrink mr-2">
            <Clock size={12} color="#94a3b8" />
            <Text
              className="text-slate-500 dark:text-slate-400 text-[10.5px] font-medium ml-1 flex-shrink"
              numberOfLines={1}
            >
              {`Due ${safeFormat(instance.start_due_date, "d MMM yyyy")}`}
            </Text>
            {showCompletedDate && instance.completed_on ? (
              <Text
                className="text-green-600 dark:text-green-400 text-[10.5px] font-medium ml-1.5 flex-shrink"
                numberOfLines={1}
              >
                {`· Done ${safeFormat(instance.completed_on, "d MMM")}`}
              </Text>
            ) : null}
          </View>

          {instance.assigned_to_name ? (
            <View className="flex-row items-center flex-shrink min-w-0">
              <View
                className="w-[18px] h-[18px] rounded-full items-center justify-center mr-1.5"
                style={{ backgroundColor: status.tint }}
              >
                <Text
                  className="text-[8px] font-bold"
                  style={{ color: status.color }}
                >
                  {getInitials(instance.assigned_to_name)}
                </Text>
              </View>
              <Text
                className="text-slate-500 dark:text-slate-400 text-[10.5px] font-medium flex-shrink"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {instance.assigned_to_name}
              </Text>
            </View>
          ) : (
            <Text className="text-slate-300 dark:text-slate-600 text-[10.5px] italic">
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
    value,
    label,
    color,
    isActive,
    onPress,
  }: {
    value: number;
    label: string;
    color: string;
    isActive: boolean;
    onPress?: () => void;
  }) => {
    const cardClass =
      "flex-1 rounded-xl py-2.5 px-1.5 items-center bg-white dark:bg-slate-900";
    const cardStyle = {
      borderWidth: 1,
      borderColor: isActive ? color : `${color}33`,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    };
    const body = (
      <>
        <Text className="text-[17px] font-bold leading-tight" style={{ color }}>
          {value}
        </Text>
        <Text
          className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-0.5"
          numberOfLines={1}
        >
          {label}
        </Text>
      </>
    );

    if (!onPress) {
      return (
        <View className={cardClass} style={cardStyle}>
          {body}
        </View>
      );
    }

    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        className={cardClass}
        style={cardStyle}
      >
        {body}
      </TouchableOpacity>
    );
  },
);

StatCard.displayName = "StatCard";

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
  const {
    sites,
    selectedSite,
    selectSite,
    refresh: refreshSites,
  } = useSites(userId);
  const siteCode = selectedSite?.site_code ?? "";
  const siteName =
    selectedSite?.site_name ?? selectedSite?.site_code ?? "Select Site";

  // Date handling — default to the current month (1st → last day)
  const [currentDate, setCurrentDate] = useState(istMonthStart());
  const [toDate, setToDate] = useState(istMonthEnd());

  const [tempSearch, setTempSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
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
    } else if (searchQuery) {
      const q = searchQuery.toLowerCase();
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
      // Requirement: text search should not be constrained by date window.
      return list;
    }

    // 3. Apply Date Filter in normal browsing mode (no text/QR search).
    //    The column compared depends on the selected date field.
    const startRange = istDayStartMsFromYmd(currentDate) ?? 0;
    const endRange = istDayEndMsFromYmd(toDate) ?? Number.MAX_SAFE_INTEGER;
    // TEMP DIAGNOSTIC: log the active range and any item that would be
    // shown but falls outside it. Remove once the Sunshine "June leaking
    // into May filter" bug is root-caused.
    logger.debug("pm-filter range", {
      currentDate,
      toDate,
      dateField,
      startRange,
      endRange,
      preDateCount: list.length,
    });
    list = list.filter((i) => {
      const dateVal =
        dateField === "completed_date" ? i.completed_on : i.start_due_date;
      if (!dateVal) {
        logger.debug("pm-filter drop:null", {
          id: i.id,
          title: i.title,
          dateField,
          raw_start_due_date: i.start_due_date,
          raw_completed_on: i.completed_on,
        });
        return false;
      }
      const ts = new Date(dateVal).getTime();
      const inRange = ts >= startRange && ts <= endRange;
      // Loud log for the actual smoking gun: an item that PASSES the
      // filter while its displayed Due date is outside the chosen range.
      const displayed = safeFormat(i.start_due_date, "d MMM yyyy");
      if (inRange) {
        logger.debug("pm-filter keep", {
          id: i.id,
          title: i.title,
          dateField,
          raw: dateVal,
          rawType: typeof dateVal,
          ts,
          displayed,
        });
      }
      return inRange;
    });
    return list;
  }, [
    allInstances,
    statusFilter,
    searchQuery,
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

    // Server stats are computed against the due-date window only, so they
    // are not comparable when the user filters by completed date.
    if (serverStats && dateField !== "completed_date") {
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

  const renderItem: ListRenderItem<PMInstanceRow> = useCallback(
    ({ item }) => (
      <View style={{ paddingBottom: 10 }}>
        <PMCard
          instance={item}
          onPress={() => handlePMCardPress(item)}
          showCompletedDate={
            statusFilter === "Completed" || dateField === "completed_date"
          }
        />
      </View>
    ),
    [handlePMCardPress, statusFilter, dateField],
  );

  const keyExtractor = useCallback((item: PMInstanceRow) => item.id, []);

  const ListEmpty = useMemo(
    () => (
      <EmptyState
        icon={Wrench}
        title={
          allInstances.length > 0
            ? `Hidden by Filters (${allInstances.length} Tasks)`
            : "No PM tasks found"
        }
        subtitle={
          allInstances.length > 0
            ? "Try adjusting your filters"
            : undefined
        }
        action={
          isConnected && !siteCode
            ? {
                label: "Retry Server Sync",
                onPress: async () => {
                  await refreshSites();
                  if (selectedSite?.site_code) {
                    loadPMData(true, 0, false);
                  }
                },
              }
            : undefined
        }
      />
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

  const dateRangePreview = useMemo(() => {
    const from = safeFormat(currentDate, "d MMM yyyy");
    const to = safeFormat(toDate, "d MMM yyyy");
    const label = dateField === "completed_date" ? "Completed" : "Due";
    return `${label}: ${from} - ${to}`;
  }, [currentDate, toDate, dateField]);

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
                      tempFromDate !== istTodayString() ||
                      tempToDate !== istTodayString()
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

          <View className="mb-2 self-start px-3 py-1 rounded-full bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40">
            <Text className="text-[11px] font-semibold text-red-700 dark:text-red-300">
              {dateRangePreview}
            </Text>
          </View>

          <View className="flex-row gap-1.5 mb-3">
            <StatCard
              value={stats.total}
              label="Total"
              color="#6366f1"
              isActive={false}
            />
            <StatCard
              value={stats.pending}
              label="Pending"
              color="#f97316"
              isActive={statusFilter === "Pending"}
              onPress={() => setStatusFilter("Pending")}
            />
            <StatCard
              value={stats.inProgress}
              label="In Progress"
              color="#3b82f6"
              isActive={statusFilter === "In-progress"}
              onPress={() => setStatusFilter("In-progress")}
            />
            <StatCard
              value={stats.completed}
              label="Completed"
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
          <FlashList
            data={filteredInstances}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            // No getItemType: every card renders the identical layout/height,
            // so a single recycle pool maximizes cell reuse. Splitting into
            // per-status pools just forced fresh cell mounts mid-fling, which
            // showed up as blank space during fast scroll.
            drawDistance={600}
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
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
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
