import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
  AppState,
  Alert,
  Modal,
  Platform,
  InteractionManager,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Bell,
  CalendarCheck,
  Droplets,
  FileText,
  LogIn,
  LogOut,
  Thermometer,
  Wrench,
  WifiOff,
  Zap,
} from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import { useAutoSync } from "@/hooks/useAutoSync";
import AttendanceService, {
  type AttendanceLog,
  getISTDateString,
  type Site,
} from "@/services/AttendanceService";
import { addDays, format } from "date-fns";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import Skeleton from "@/components/Skeleton";
import TicketsService, { type Ticket } from "@/services/TicketsService";
import TicketDetailModal from "@/components/TicketDetailModal";
import {
  isTempMandatoryCategory,
  isBreakdownTypeCategory,
} from "@/components/TicketDetailStatusUpdate";
import { type SelectOption } from "@/components/SearchableSelect";
import SiteLogService from "@/services/SiteLogService";
import logger from "@/utils/logger";
import { db, userSites } from "@/database";
import { eq } from "drizzle-orm";
import { WhatsAppService } from "@/services/WhatsAppService";
import { ReportPickerModal } from "@/components/ReportPickerModal";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { soRadius, soShadow } from "@/components/home/SiteOverview";
import {
  type DayBar,
  HomeEmpty,
  HomeHero,
  HomeSectionHeading,
  HomeTicketCard,
  HoursWeekCard,
  TicketStatusCard,
} from "@/components/home/HomeUI";
import { istDayEndIso, istDayStartIso } from "@/utils/istDate";

function formatLocationFailureMessage(
  message: string,
  userLocation?: { latitude: number; longitude: number } | null,
  nearestSite?: Site,
) {
  const parts = [message];
  if (userLocation) {
    parts.push(
      `\nYour location: ${userLocation.latitude.toFixed(6)}, ${userLocation.longitude.toFixed(6)}`,
    );
  }
  if (nearestSite) {
    const d = nearestSite.distanceMeters ?? nearestSite.distance ?? "?";
    const r = nearestSite.radius ?? 200;
    parts.push(
      `\nNearest site "${nearestSite.name}": about ${d}m away (allowed radius: ${r}m).`,
    );
  }
  return parts.join("");
}

interface PendingItem {
  id: string;
  title: string;
  subtitle: string;
  category: "Ticket" | "Temp RH" | "Chiller" | "Water" | "Chemical";
  status: string;
  route: string;
  params?: Record<string, string>;
  timestamp: string;
  priority?: string;
  priorityOrder?: number;
  /** The complaint category (picks the row icon) — distinct from `category`. */
  ticketCategory?: string;
  location?: string;
  assignedTo?: string;
}

/** How many tickets the Home feed shows before deferring to "See all". */
const HOME_TICKET_LIMIT = 6;

const PRIORITY_ORDER: Record<string, number> = {
  "Very High": 1,
  High: 2,
  Medium: 3,
  Low: 4,
};

/** Ticket rows → the Home feed's shape, highest priority / newest first. */
function toPendingItems(list: Ticket[]): PendingItem[] {
  return list
    .slice(0, 50)
    .map((t) => ({
      id: t.id,
      title: t.title,
      subtitle: t.ticket_no,
      category: "Ticket" as const,
      status: t.status,
      priority: t.priority,
      route: "/(tabs)/tickets",
      timestamp: t.created_at,
      ticketCategory: t.category,
      location: t.area_asset || t.location,
      assignedTo: t.assigned_to,
    }))
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority || ""] || 5;
      const pb = PRIORITY_ORDER[b.priority || ""] || 5;
      if (pa !== pb) return pa - pb;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
}

const getDefaultUpdateStatus = (ticket: Ticket) => {
  if (ticket.status === "Open") return "Inprogress";
  if (ticket.status === "Inprogress") return "Resolved";
  return ticket.status;
};

const getInitialUpdateRemarks = (ticket: Ticket, status: string) => {
  return status === ticket.status ? ticket.internal_remarks || "" : "";
};

/** Hero greeting — the mock's "Good afternoon, Pakshep". */
function timeGreeting(now: Date) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** "Inprogress" → "In progress" for the status chip. */
function prettyStatus(status?: string) {
  if (!status) return undefined;
  return status.toLowerCase() === "inprogress" ? "In progress" : status;
}

/** "Pankaj Gupta" → "PG"; undefined when there is no assignee yet. */
function initials(name?: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return undefined;
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Row icon, guessed from the complaint category then the title. */
function ticketIcon(category?: string, title?: string) {
  const s = `${category || ""} ${title || ""}`.toLowerCase();
  if (/temp|cool|humid|comfort|\brh\b|\bac\b|a\/c/.test(s)) return Thermometer;
  if (/water|leak|drain|plumb|condensate/.test(s)) return Droplets;
  if (/chiller|electric|power|motor|pump|compressor|panel|vfd|breaker/.test(s))
    return Zap;
  return Wrench;
}

/** "39h 20m" — the mock's duration format. */
function formatHm(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  return `${Math.floor(safe / 60)}h ${String(safe % 60).padStart(2, "0")}m`;
}

/** Age of a ticket, coarsened the way the mock shows it. */
function elapsedSince(iso: string | undefined, now: Date) {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return undefined;
  const mins = Math.max(0, Math.floor((now.getTime() - t) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${String(mins % 60).padStart(2, "0")}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/** Minutes worked in one attendance log; an open shift runs to `now`. */
function logMinutes(log: AttendanceLog, now: Date) {
  if (!log.check_in_time) return 0;
  const start = new Date(log.check_in_time);
  if (Number.isNaN(start.getTime())) return 0;
  const parsedEnd = log.check_out_time ? new Date(log.check_out_time) : now;
  const end = Number.isNaN(parsedEnd.getTime()) ? now : parsedEnd;
  const mins = Math.floor((end.getTime() - start.getTime()) / 60000);
  // A shift left open overnight would otherwise run away with the chart.
  return Math.max(0, Math.min(mins, 24 * 60));
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * Bucket attendance into the Mon–Sun IST week that `now` falls in.
 * Keys are IST calendar dates, so a late-evening shift lands on the right bar.
 */
function buildWeek(logs: AttendanceLog[], now: Date) {
  const todayIso = getISTDateString(now);
  const [y, m, d] = todayIso.split("-").map(Number);
  // Noon keeps the arithmetic clear of DST/midnight edges.
  const todayLocal = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
  const dow = todayLocal.getDay(); // 0 = Sunday
  const monday = addDays(todayLocal, dow === 0 ? -6 : 1 - dow);

  const byDate = new Map<string, number>();
  for (const log of logs) {
    const key =
      log.date ||
      (log.check_in_time ? getISTDateString(new Date(log.check_in_time)) : "");
    if (!key) continue;
    byDate.set(key, (byDate.get(key) || 0) + logMinutes(log, now));
  }

  let totalMinutes = 0;
  const days: DayBar[] = DAY_LABELS.map((label, i) => {
    const iso = format(addDays(monday, i), "yyyy-MM-dd");
    const minutes = byDate.get(iso) || 0;
    totalMinutes += minutes;
    return { label, minutes, isToday: iso === todayIso };
  });

  return { days, totalMinutes };
}

/** Collapse the backend's per-status map onto the mock's three segments. */
function readStatusCounts(byStatus: Record<string, number>) {
  const sum = (...keys: string[]) =>
    keys.reduce((acc, k) => acc + (byStatus[k] || 0), 0);
  return {
    open: sum("Open"),
    inProgress: sum("Inprogress", "In Progress", "In progress"),
    resolved: sum("Resolved", "Closed"),
  };
}

// --- Memoized Skeleton Component ---
const DashboardSkeleton = React.memo(() => {
  const ds = useDs();
  return (
  <View style={{ flex: 1, backgroundColor: ds.pageBg }}>
    <View
      style={{
        height: 252,
        backgroundColor: ds.thunder[100],
        borderBottomLeftRadius: 26,
        borderBottomRightRadius: 26,
      }}
    />
    <View style={{ paddingHorizontal: 18, paddingTop: 16 }}>
      <Skeleton
        width="100%"
        height={148}
        borderRadius={18}
        style={{ marginBottom: 14 }}
      />
      <Skeleton
        width="100%"
        height={116}
        borderRadius={18}
        style={{ marginBottom: 28 }}
      />
      {[1, 2, 3].map((i) => (
        <Skeleton
          key={i}
          width="100%"
          height={92}
          borderRadius={14}
          style={{ marginBottom: 7 }}
        />
      ))}
    </View>
  </View>
  );
});

DashboardSkeleton.displayName = "DashboardSkeleton";

export default function Dashboard() {
  const styles = useStyles();
  const ds = useDs();
  const { isConnected } = useNetworkStatus();
  const [refreshing, setRefreshing] = useState(false);
  const { user, signOut } = useAuth();
  const {
    isPrivileged,
    isPunchedIn,
    markPunchedIn: markGatePunchedIn,
    markPunchedOut: markGatePunchedOut,
  } = useAttendanceGate();
  const isLocked = !isPrivileged && !isPunchedIn;
  const [reportPickerOpen, setReportPickerOpen] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceLog | null>(
    null,
  );
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [pendingTickets, setPendingTickets] = useState<PendingItem[]>([]);
  const [selectedSiteCode, setSelectedSiteCode] = useState<string | null>(null);
  const [sitePickerOpen, setSitePickerOpen] = useState(false);
  const [loadingPending, setLoadingPending] = useState(true);
  const [validatingLocation, setValidatingLocation] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sites, setSites] = useState<Site[]>([]);
  const [currentSiteLabel, setCurrentSiteLabel] = useState<string>("");
  const [week, setWeek] = useState<{ days: DayBar[]; totalMinutes: number }>(
    () => buildWeek([], new Date()),
  );
  const [statusCounts, setStatusCounts] = useState<{
    open: number;
    inProgress: number;
    resolved: number;
  } | null>(null);
  const insets = useSafeAreaInsets();

  /** Site the page is reporting on — the header switcher's pick, else the first. */
  const activeSite = useMemo(
    () =>
      sites.find((x) => x.site_code === selectedSiteCode) ?? sites[0] ?? null,
    [sites, selectedSiteCode],
  );

  // Ticket Detail Modal State
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isDetailVisible, setIsDetailVisible] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("");
  const [updateRemarks, setUpdateRemarks] = useState("");
  const [updateArea, setUpdateArea] = useState("");
  const [updateCategory, setUpdateCategory] = useState("");
  const [updateBreakdownType, setUpdateBreakdownType] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [areaOptions, setAreaOptions] = useState<SelectOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<SelectOption[]>([]);
  const [areasLoading, setAreasLoading] = useState(false);
  const [beforeTemp, setBeforeTemp] = useState("");
  const [afterTemp, setAfterTemp] = useState("");
  const [attachmentUri, setAttachmentUri] = useState("");

  // Ref for timeout cleanup
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Safety timer to ensure loading icons are never stuck
  useEffect(() => {
    // RUN DB CLEANUP: Best place to trigger periodic maintenance
    SiteLogService.runCleanup();

    const timer = setTimeout(() => {
      setLoadingPending((prev) => {
        if (prev) console.log("[Dashboard] Pending safety timeout triggered");
        return false;
      });
      setLoadingAttendance((prev) => {
        if (prev)
          console.log("[Dashboard] Attendance safety timeout triggered");
        return false;
      });
    }, 8000); // 8 seconds safety
    return () => clearTimeout(timer);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

  // Live timer for attendance duration
  useEffect(() => {
    let interval: any = null;

    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === "active") {
        if (todayAttendance && !todayAttendance.check_out_time) {
          if (!interval) {
            setCurrentTime(new Date());
            interval = setInterval(() => {
              setCurrentTime(new Date());
            }, 60000);
          }
        }
      } else {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    if (todayAttendance && !todayAttendance.check_out_time) {
      setCurrentTime(new Date());
      interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 60000);
    }

    return () => {
      subscription.remove();
      if (interval) clearInterval(interval);
    };
  }, [todayAttendance]);

  /**
   * The two summary cards. Both degrade offline: attendance history falls back
   * to the SQLite mirror inside the service, and the stats endpoint falls back
   * to counting the locally cached tickets here.
   */
  const loadInsights = useCallback(async (userId: string, siteCode: string) => {
    const now = new Date();

    AttendanceService.getAttendanceHistory(userId, 1, 60)
      .then((res) => setWeek(buildWeek(res?.data || [], now)))
      .catch((error) =>
        logger.warn("Dashboard weekly hours failed", { error }),
      );

    // Ticket mix over the trailing 30 days — all-time would drown Open in a
    // wall of Resolved and flatten the meter.
    const fromDate = istDayStartIso(getISTDateString(addDays(now, -29)));
    const toDate = istDayEndIso(getISTDateString(now));
    try {
      const res = await TicketsService.getStats(siteCode, {
        fromDate,
        toDate,
      });
      if (res?.success && res.data?.byStatus) {
        setStatusCounts(readStatusCounts(res.data.byStatus));
        return;
      }
    } catch (error) {
      logger.warn("Dashboard ticket stats failed", { error });
    }

    const local = await TicketsService.getTickets(siteCode, {
      limit: 200,
    }).catch(() => null);
    if (local?.success && Array.isArray(local.data)) {
      const byStatus: Record<string, number> = {};
      for (const t of local.data as Ticket[]) {
        if (t.status) byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      }
      setStatusCounts(readStatusCounts(byStatus));
    }
  }, []);

  const fetchData = React.useCallback(async () => {
    // Safety exit if no user — keep loading state as-is, auth will trigger re-fetch
    if (!user?.user_id && !user?.id) {
      return;
    }

    const userId = user.user_id || user.id;
    // Keep the hero date and the ticket "age" labels honest across the 60s
    // auto-sync — the live-timer effect above only ticks while on shift.
    setCurrentTime(new Date());
    const hasRenderedData = !!todayAttendance || pendingTickets.length > 0;
    // Honour the header's site switcher; fall back to the first allowed site.
    const resolveSiteCode = (list: Site[]) =>
      selectedSiteCode && list.some((x) => x.site_code === selectedSiteCode)
        ? selectedSiteCode
        : list[0].site_code;

    try {
      // Only show skeleton on true cold start; keep existing data visible on refreshes
      if (!hasRenderedData) {
        setLoadingPending(true);
        setLoadingAttendance(true);
      }

      // 1. Load cached data FIRST for instant UI (Drizzle/PowerSync local query)
      const localSiteRows = await db
        .select()
        .from(userSites)
        .where(eq(userSites.user_id, userId))
        .catch(
          () =>
            [] as {
              id: string;
              user_id: string;
              site_id: string | null;
              site_code: string;
              site_name: string;
            }[],
        );

      // Map local userSites rows to the Site shape expected by the rest of the component
      const cachedSitesList: Site[] = localSiteRows.map(
        (row: { site_code: string; site_name: string }) => ({
          site_code: row.site_code,
          name: row.site_name,
        }),
      );

      if (cachedSitesList.length > 0) {
        setSites(cachedSitesList);
      }

      // Show cached attendance immediately
      const cachedAtt = await AttendanceService.getTodayAttendance(
        userId,
      ).catch(() => null);
      if (cachedAtt) setTodayAttendance(cachedAtt);
      setLoadingAttendance(false);

      // Load cached tickets and logs immediately for instant UI
      if (cachedSitesList.length > 0) {
        const siteCode = resolveSiteCode(cachedSitesList);

        // Load cached tickets
        const cachedTicketResult = await TicketsService.getTickets(siteCode, {
          status: "Open",
          limit: 50,
        }).catch(() => ({ success: false, data: [] }));

        if (cachedTicketResult?.success && cachedTicketResult.data) {
          setPendingTickets(toPendingItems(cachedTicketResult.data));
        }

        void loadInsights(userId, siteCode);

        // Show cached data immediately
        setLoadingPending(false);
      }

      // 2. Fetch network state directly instead of relying on state (which is null on cold-boot)
      const netState = await NetInfo.fetch();
      const isActuallyOnline = netState.isConnected === true;

      // 3. If online, fetch fresh data from API in background
      if (isActuallyOnline) {
        logger.info("[Dashboard] Fetching fresh data in background", {
          isActuallyOnline,
          userId,
        });

        const [attData, freshSites] = await Promise.all([
          AttendanceService.getTodayAttendance(userId, true).catch((e) => {
            console.error("[Dashboard] Attendance fetch failed:", e);
            return null;
          }),
          AttendanceService.getUserSites(userId, "JouleCool").catch((e) => {
            console.error("[Dashboard] Sites fetch failed:", e);
            return [] as Site[];
          }),
        ]);

        if (attData) setTodayAttendance(attData);
        if (freshSites.length > 0) setSites(freshSites);

        const effectiveSites =
          freshSites.length > 0 ? freshSites : cachedSitesList;

        if (effectiveSites.length === 0) {
          console.warn("[Dashboard] No sites found, skipping further fetches");
          return;
        }

        // Fetch fresh tickets
        const fetchSiteCode = resolveSiteCode(effectiveSites);
        const ticketResult = await TicketsService.getTickets(fetchSiteCode, {
          status: "Open",
          limit: 50,
        }).catch((e) => {
          console.error("[Dashboard] Tickets fetch failed:", e);
          return { success: false, data: [] };
        });

        setPendingTickets(
          ticketResult?.success && ticketResult.data
            ? toPendingItems(ticketResult.data)
            : [],
        );

        void loadInsights(userId, fetchSiteCode);

      }
    } catch (error) {
      console.error("Dashboard fetchData critical error:", error);
    } finally {
      setLoadingAttendance(false);
      setLoadingPending(false);
    }
  }, [
    user,
    todayAttendance,
    pendingTickets.length,
    selectedSiteCode,
    loadInsights,
  ]); // Keep refresh behavior while avoiding cold-start skeleton on every fetch

  const loadAreasAndCategories = useCallback(async () => {
    if (sites.length === 0) return;
    const siteCode = activeSite?.site_code ?? sites[0].site_code;

    setAreasLoading(true);
    try {
      // CACHE-FIRST: Load from cache immediately
      const [cachedAreas, cachedCategories] = await Promise.all([
        TicketsService.getAssets(siteCode),
        TicketsService.getComplaintCategories(),
      ]);

      // Set cached data immediately for instant UI
      if (cachedAreas?.data && cachedAreas.data.length > 0) {
        const areas = cachedAreas.data.map((asset: any) => ({
          value: asset.asset_name || asset.asset_id,
          label: asset.asset_name,
          description:
            `${asset.asset_type || ""} ${asset.location ? `- ${asset.location}` : ""}`.trim(),
        }));
        setAreaOptions(areas);
      }

      if (cachedCategories?.data && cachedCategories.data.length > 0) {
        const categories = cachedCategories.data.map((cat: any) => ({
          value: cat.category,
          label: cat.category,
          description: cat.description || "",
        }));
        setCategoryOptions(categories);
      }
    } catch (error) {
      logger.warn("Error loading areas/categories in dashboard", { error });
    } finally {
      setAreasLoading(false);
    }
  }, [sites, activeSite]);

  useEffect(() => {
    if (sites.length > 0) {
      loadAreasAndCategories();
    }
  }, [sites, loadAreasAndCategories]);

  const handleTicketPress = useCallback(
    (item: any) => {
      // Only handle actual tickets
      if (item.category !== "Ticket") return;

      // We need the full ticket object for the modal
      // Since pendingTickets only has PendingItem, we might need to fetch full details or map it
      // But getTickets already gave us basic info. Let's try to pass what we have first
      // If we need full details, we should fetch them here.

      // For now, let's assume we can use the item data or fetch if needed
      const siteCode = activeSite?.site_code ?? sites[0]?.site_code;
      if (!siteCode) return;
      TicketsService.getTickets(siteCode, {
        ticket_no: item.subtitle,
      }).then((res) => {
        if (res.success && res.data && res.data.length > 0) {
          const ticket = res.data[0];
          const defaultStatus = getDefaultUpdateStatus(ticket);
          setSelectedTicket(ticket);
          setUpdateStatus(defaultStatus);
          setUpdateRemarks(getInitialUpdateRemarks(ticket, defaultStatus));
          setUpdateArea(ticket.area_asset || "");
          setUpdateCategory(ticket.category || "");
          setUpdateBreakdownType(ticket.breakdown_type || "");
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
          setIsDetailVisible(true);
        }
      });
    },
    [sites, activeSite],
  );

  const handleUpdateStatus = async () => {
    if (!selectedTicket || !user?.id) return;

    const needsRemarks = ["Hold", "Cancelled", "Waiting", "Resolved"].includes(
      updateStatus,
    );
    const needsAreaAndCategory =
      updateStatus === "Inprogress" || updateStatus === "Resolved";
    if (needsRemarks && !updateRemarks.trim()) {
      Alert.alert("Required", "Please provide remarks for this status update.");
      return;
    }
    if (needsAreaAndCategory && !updateArea.trim()) {
      Alert.alert(
        "Required",
        "Please select an area before updating the ticket.",
      );
      return;
    }
    if (needsAreaAndCategory && !updateCategory.trim()) {
      Alert.alert(
        "Required",
        "Please select a category before updating the ticket.",
      );
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

    const effectiveArea = updateArea || selectedTicket.area_asset;
    const effectivePayloadCategory = updateCategory || selectedTicket.category;
    const payload: any = {
      status: updateStatus,
      internal_remarks: updateRemarks,
    };
    // Omit area/category when empty rather than sending null — the backend
    // types them as optional strings, so a null 400s and blocked cancelling an
    // Open ticket (which has no area yet). Mirrors the tickets screen.
    if (effectiveArea) payload.area_asset = effectiveArea;
    if (effectivePayloadCategory) payload.category = effectivePayloadCategory;
    // Only the Inprogress/Resolved flow shows the breakdown-type picker — set it
    // for a breakdown category, clear it otherwise, and leave it untouched on
    // other transitions. Mirrors the tickets screen.
    if (needsAreaAndCategory) {
      payload.breakdown_type = isBreakdownTypeCategory(
        effectivePayloadCategory || "",
      )
        ? updateBreakdownType || null
        : null;
    }

    if (beforeTemp.trim() !== "") payload.before_temp = parseFloat(beforeTemp);
    if (afterTemp.trim() !== "") payload.after_temp = parseFloat(afterTemp);

    if (updateStatus === "Inprogress" || updateStatus === "Cancelled") {
      payload.assigned_to = user.full_name || user.name || "";
    }

    // Send the on-device action time so a ticket actioned offline keeps its true
    // responded/resolved time. The backend honors these only when the field is
    // still unset and never overwrites them on a later offline-queue replay.
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
        ).catch((e) =>
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

      if (apiConfirmed) {
        Alert.alert("Success", "Ticket updated successfully");
      } else if (queuedOffline) {
        Alert.alert(
          "Saved",
          "Update saved. It will sync automatically when your connection is stable.",
        );
      } else {
        Alert.alert("Error", res.error || "Failed to update ticket");
        return;
      }

      setSelectedTicket(optimisticTicket);
      setUpdateRemarks("");
      setBeforeTemp("");
      setAfterTemp("");
      setAttachmentUri("");
      setIsDetailVisible(false);
      // Only refetch when the server confirmed; a queued-offline update would
      // otherwise be overwritten by the stale server row on upsert.
      if (apiConfirmed) fetchData();
    } catch {
      // Local DB write already happened — surface as a queued save, not an error.
      Alert.alert(
        "Saved",
        "Update saved. It will sync automatically when your connection is stable.",
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const navigateToAttendance = useCallback(
    () => router.push("/attendance"),
    [],
  );

  // Detect which site the user is currently near (or WFH / Away)
  const detectCurrentSite = useCallback(async () => {
    const uid = user?.user_id || user?.id;
    if (!uid) return;
    const updateSiteLabel = (nextLabel: string) => {
      setCurrentSiteLabel((prev) => (prev === nextLabel ? prev : nextLabel));
    };
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        const permissionResponse =
          await Location.requestForegroundPermissionsAsync();
        status = permissionResponse.status;
      }

      let latitude: number | undefined;
      let longitude: number | undefined;

      if (status === "granted") {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown) {
          latitude = lastKnown.coords.latitude;
          longitude = lastKnown.coords.longitude;
        } else {
          try {
            const accuracy =
              Platform.OS === "android"
                ? Location.Accuracy.High
                : Location.Accuracy.BestForNavigation;
            const current = await Location.getCurrentPositionAsync({
              accuracy,
            });
            latitude = current.coords.latitude;
            longitude = current.coords.longitude;
          } catch (locationError) {
            logger.warn(
              "Dashboard site detection: current location unavailable",
              {
                module: "DASHBOARD",
                error: locationError,
                userId: uid,
              },
            );
          }
        }
      }

      const validation = await AttendanceService.validateLocation(
        uid,
        latitude,
        longitude,
      );
      if (validation.isWFH) {
        // WFH user who is also on-site
        if (validation.resolvedSiteCode && validation.allowedSites.length > 0) {
          const site = validation.allowedSites.find(
            (s) => s.site_code === validation.resolvedSiteCode,
          );
          updateSiteLabel(site?.name || validation.resolvedSiteCode);
        } else {
          updateSiteLabel("WFH");
        }
      } else if (validation.isValid && validation.allowedSites.length > 0) {
        updateSiteLabel(
          validation.allowedSites[0]?.name ||
            validation.allowedSites[0]?.site_code ||
            "",
        );
      } else if (latitude == null || longitude == null) {
        updateSiteLabel("Location unavailable");
      } else {
        updateSiteLabel("Away from site");
      }
    } catch (error) {
      logger.warn("Dashboard site detection failed", {
        module: "DASHBOARD",
        error,
        userId: uid,
      });
      updateSiteLabel("Could not load site");
    }
  }, [user?.user_id, user?.id]);

  // Run site detection on mount + focus
  useEffect(() => {
    detectCurrentSite();
  }, [detectCurrentSite]);

  // Detect the current site on focus and poll every 15s — but ONLY while the
  // Dashboard is the focused tab. Previously the interval ran unconditionally,
  // so its setState kept re-rendering a hidden Dashboard while the user was on
  // another tab, stealing JS-thread time from the active screen. The focus
  // call is deferred past the tab-switch transition so the switch stays smooth.
  useFocusEffect(
    useCallback(() => {
      const handle = InteractionManager.runAfterInteractions(() => {
        detectCurrentSite();
      });
      // Poll every 60s, not 15s. detectCurrentSite does a GPS fix + a
      // validateLocation network round-trip; at 15s that was ~240 geo+network
      // hits/hour of dwell (battery + mobile-data drain in plant rooms) for a
      // header label that only changes when the operator physically moves
      // between sites — minutes-scale, not seconds. Foreground/focus + the
      // mount effect still refresh it promptly on open.
      const interval = setInterval(() => {
        detectCurrentSite();
      }, 60000);
      return () => {
        handle.cancel?.();
        clearInterval(interval);
      };
    }, [detectCurrentSite]),
  );

  const handleQuickCheckIn = async () => {
    const uid = user?.user_id || user?.id;
    if (!uid) return;
    setValidatingLocation(true);
    try {
      const accuracy =
        Platform.OS === "android"
          ? Location.Accuracy.High
          : Location.Accuracy.BestForNavigation;
      const loc = await Location.getCurrentPositionAsync({
        accuracy,
      });

      const validation = await AttendanceService.validateLocation(
        uid,
        loc.coords.latitude,
        loc.coords.longitude,
      );

      if (!validation.isValid) {
        Alert.alert(
          "Location Failed",
          formatLocationFailureMessage(
            validation.message,
            validation.userLocation,
            validation.nearestSite,
          ),
        );
        return;
      }

      const siteCode = validation.isWFH
        ? (validation.resolvedSiteCode ?? null)
        : (validation.allowedSites[0]?.site_code ?? null);

      if (!validation.isWFH && !siteCode) {
        Alert.alert(
          "Location Failed",
          "You are not within range of any active site. Open Attendance for details.",
        );
        return;
      }

      const res = await AttendanceService.checkIn(
        uid,
        siteCode,
        loc.coords.latitude,
        loc.coords.longitude,
      );
      if (res.success && res.queued) {
        Alert.alert(
          "Saved",
          "Checked in. It will sync automatically when your connection is stable.",
        );
        fetchData();
        markGatePunchedIn();
      } else if (res.success) {
        Alert.alert("Success", "Checked in successfully!");
        fetchData();
        markGatePunchedIn();
      } else {
        const ext = res as any;
        Alert.alert(
          "Failed",
          formatLocationFailureMessage(
            ext.error || "Check-in failed",
            ext.userLocation,
            ext.nearestSite,
          ),
        );
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setValidatingLocation(false);
    }
  };

  const handleQuickCheckOut = async () => {
    if (!todayAttendance?.id) return;

    // Technicians must complete the mandatory shift sign-off before punching
    // out — route to the sign-off screen, which performs the check-out itself.
    // Admins / managers / regional managers keep the direct check-out below.
    const role = String(user?.role || "").toLowerCase();
    if (role === "technician") {
      router.push({
        pathname: "/shift-signoff",
        params: {
          attendanceId: todayAttendance.id,
          siteCode: todayAttendance.site_code || "",
          checkInTime: todayAttendance.check_in_time || "",
        },
      });
      return;
    }

    setValidatingLocation(true);

    const performCheckOut = async (remarks?: string) => {
      try {
        const accuracy =
          Platform.OS === "android"
            ? Location.Accuracy.High
            : Location.Accuracy.BestForNavigation;
        const loc = await Location.getCurrentPositionAsync({
          accuracy,
        });
        const res = await AttendanceService.checkOut(
          todayAttendance.id,
          loc.coords.latitude,
          loc.coords.longitude,
          undefined,
          remarks,
        );

        if (res.success && res.queued) {
          Alert.alert(
            "Saved",
            "Checked out. It will sync automatically when your connection is stable.",
          );
          fetchData();
          markGatePunchedOut();
        } else if (res.success) {
          Alert.alert("Success", "Checked out successfully!");
          fetchData();
          markGatePunchedOut();
        } else if (res.error?.includes("Early checkout")) {
          // Backend requires a reason; auto-provide a default reason so
          // users can complete checkout directly from the dashboard.
          await performCheckOut("Checked out from dashboard");
        } else {
          Alert.alert(
            "Check-out Failed",
            res.error || "Unable to check out. Please check your connection.",
            [
              { text: "OK", style: "cancel" },
              {
                text: "Go to Attendance",
                onPress: () => router.push("/attendance"),
              },
            ],
          );
        }
      } catch (e: any) {
        Alert.alert("Error", e.message);
      } finally {
        setValidatingLocation(false);
      }
    };

    await performCheckOut();
  };

  const lastFetchRef = useRef<number>(0);

  // Unified Auto-Sync for Dashboard (Handles Focus, AppState, and 60s Polling)
  useAutoSync(fetchData, [user?.id]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    lastFetchRef.current = Date.now();
    await fetchData();
    // Simulate other API calls (with cleanup)
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    refreshTimeoutRef.current = setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, [fetchData]);

  const getStatusSubtext = useMemo(() => {
    if (!todayAttendance) return "--";
    if (todayAttendance.check_out_time) {
      // Show total duration for completed shifts
      if (!todayAttendance.check_in_time) return "--";
      const start = new Date(todayAttendance.check_in_time);
      const end = new Date(todayAttendance.check_out_time);
      const minutes = Math.floor((end.getTime() - start.getTime()) / 60000);
      if (isNaN(minutes) || minutes < 0) return "0h 0m";
      return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    }

    if (!todayAttendance.check_in_time) return "--";
    const start = new Date(todayAttendance.check_in_time);
    if (isNaN(start.getTime())) return "--";

    let end: Date;
    const todayStr = getISTDateString(currentTime);
    const logDateIST = getISTDateString(new Date(todayAttendance.date));

    if (logDateIST === todayStr) {
      end = currentTime;
    } else {
      const [y, m, d] = logDateIST.split("-").map(Number);
      end = new Date(y, m - 1, d, 23, 59, 59);
    }

    const minutes = Math.floor((end.getTime() - start.getTime()) / 60000);
    if (isNaN(minutes) || minutes < 0) return "0h 0m";

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }, [todayAttendance, currentTime]);

  // ── Derived view data ───────────────────────────────────────────────────
  const punchedIn = !!todayAttendance && !todayAttendance.check_out_time;
  const shiftComplete = !!todayAttendance?.check_out_time;

  const ticketCards = useMemo(
    () =>
      pendingTickets.slice(0, HOME_TICKET_LIMIT).map((t) => {
        const open = (t.status || "").toLowerCase() === "open";
        return {
          id: t.id,
          icon: ticketIcon(t.ticketCategory, t.title),
          iconTint: open ? ds.flame[1000] : ds.sky[1000],
          iconColor: open ? ds.flame[100] : ds.sky[100],
          ticketNo: t.subtitle,
          status: prettyStatus(t.status),
          priority: t.priority,
          title: t.title,
          location: t.location,
          elapsed: elapsedSince(t.timestamp, currentTime),
          // The mock reddens only its most urgent row. Priority is the honest
          // stand-in — the ticket record carries no SLA clock to breach.
          elapsedUrgent: (t.priority || "").toLowerCase().includes("very high"),
          assignee: initials(t.assignedTo),
          onPress: () => handleTicketPress(t),
        };
      }),
    [pendingTickets, handleTicketPress, currentTime, ds],
  );

  const displayName = user?.full_name || user?.name || "JouleOps user";
  const avatarInitial = (displayName.trim()[0] || "J").toUpperCase();
  const firstName = displayName.trim().split(/\s+/)[0] || "there";
  const siteLabel = activeSite?.name || currentSiteLabel || "JouleOps";
  const canSwitchSite = !isLocked && sites.length > 1;

  /** Punch CTA — flame invites, translucent-white confirms, muted closes out. */
  const cta = punchedIn
    ? {
        label: "End Day",
        icon: LogOut,
        bg: "rgba(255,255,255,0.14)",
        fg: ds.onChrome,
        onPress: handleQuickCheckOut,
      }
    : shiftComplete
      ? {
          label: "Shift complete",
          icon: CalendarCheck,
          bg: "rgba(255,255,255,0.10)",
          fg: ds.sky[500],
          onPress: navigateToAttendance,
        }
      : {
          label: "Start Day",
          icon: LogIn,
          bg: ds.flame[100],
          fg: ds.onAccent,
          onPress: handleQuickCheckIn,
        };

  const counts = statusCounts ?? { open: 0, inProgress: 0, resolved: 0 };
  const countsTotal = counts.open + counts.inProgress + counts.resolved;

  const confirmSignOut = () =>
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          void signOut();
        },
      },
    ]);

  if (loadingAttendance) {
    return <DashboardSkeleton />;
  }

  return (
    <View style={styles.screen}>
      <HomeHero
        topInset={insets.top}
        eyebrow={`${siteLabel} \u00b7 ${format(currentTime, "EEE dd MMM")}`}
        onPressEyebrow={
          canSwitchSite ? () => setSitePickerOpen(true) : undefined
        }
        greeting={`${timeGreeting(currentTime)}, ${firstName}`}
        avatarInitial={avatarInitial}
        avatarUri={user?.profile_photo_url}
        avatarLabel={isLocked ? "Sign out" : "Profile"}
        onAvatar={() =>
          isLocked ? confirmSignOut() : router.push("/(tabs)/profile")
        }
        bellIcon={isLocked ? FileText : Bell}
        bellLabel={isLocked ? "Reports" : "Notifications"}
        onBell={() =>
          isLocked ? setReportPickerOpen(true) : router.push("/notifications")
        }
        shiftValue={todayAttendance ? getStatusSubtext : "0h 00m"}
        shiftLabel={punchedIn ? "On shift today" : "Hours today"}
        ticketValue={String(pendingTickets.length)}
        ticketUnit="open"
        ticketLabel="Open at this site"
        ctaLabel={cta.label}
        ctaIcon={cta.icon}
        ctaBg={cta.bg}
        ctaFg={cta.fg}
        ctaBusy={validatingLocation}
        onPressCta={cta.onPress}
      />

      {!isConnected && (
        <View style={styles.offline}>
          <WifiOff size={13} color={ds.onAccent} />
          <Text style={styles.offlineText}>Offline — showing cached data</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={ds.thunder[100]}
          />
        }
      >
        <HoursWeekCard
          total={formatHm(week.totalMinutes)}
          days={week.days}
          onPress={navigateToAttendance}
        />

        <TicketStatusCard
          caption={statusCounts ? `${countsTotal} in 30 days` : "Loading"}
          open={counts.open}
          inProgress={counts.inProgress}
          resolved={counts.resolved}
        />

        <HomeSectionHeading
          title="Open tickets"
          actionLabel={isLocked ? undefined : "See all"}
          onAction={isLocked ? undefined : () => router.push("/(tabs)/tickets")}
        />

        {loadingPending ? (
          <View>
            {[1, 2, 3].map((i) => (
              <Skeleton
                key={i}
                width="100%"
                height={92}
                borderRadius={14}
                style={{ marginBottom: 7 }}
              />
            ))}
          </View>
        ) : ticketCards.length > 0 ? (
          ticketCards.map((item) => (
            <HomeTicketCard
              key={item.id}
              icon={item.icon}
              iconTint={item.iconTint}
              iconColor={item.iconColor}
              ticketNo={item.ticketNo}
              status={item.status}
              priority={item.priority}
              title={item.title}
              location={item.location}
              elapsed={item.elapsed}
              elapsedUrgent={item.elapsedUrgent}
              assignee={item.assignee}
              onPress={item.onPress}
            />
          ))
        ) : (
          <HomeEmpty label="No open tickets" />
        )}
      </ScrollView>

      {/* Site switcher — only offered when the user is mapped to more than one */}
      <Modal
        visible={sitePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSitePickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setSitePickerOpen(false)}
        >
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Switch site</Text>
            {sites.map((site) => {
              const on = site.site_code === activeSite?.site_code;
              return (
                <TouchableOpacity
                  key={site.site_code}
                  activeOpacity={0.85}
                  onPress={() => {
                    setSelectedSiteCode(site.site_code);
                    setSitePickerOpen(false);
                  }}
                  style={[
                    styles.sheetRow,
                    on && { backgroundColor: ds.controlOn },
                  ]}
                >
                  <Text
                    style={[
                      styles.sheetRowText,
                      { color: on ? ds.onControl : ds.carbon[100] },
                    ]}
                  >
                    {site.name || site.site_code}
                  </Text>
                  <Text
                    style={[
                      styles.sheetRowCode,
                      { color: on ? "rgba(255,255,255,0.72)" : ds.carbon[600] },
                    ]}
                  >
                    {site.site_code}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      <TicketDetailModal
        visible={isDetailVisible}
        onClose={() => setIsDetailVisible(false)}
        ticket={selectedTicket}
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
      />

      <ReportPickerModal
        visible={reportPickerOpen}
        onClose={() => setReportPickerOpen(false)}
      />
    </View>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  screen: { flex: 1, backgroundColor: ds.pageBg },
  offline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 6,
    backgroundColor: ds.flame[100],
  },
  offlineText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
    color: ds.onAccent,
  },
  body: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 28 },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(25,19,18,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: ds.white,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: 34,
    gap: 8,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.15,
    color: ds.carbon[100],
    marginBottom: 4,
  },
  sheetRow: {
    borderRadius: soRadius.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: ds.pageBg,
    ...soShadow,
  },
  sheetRowText: { fontSize: 14, fontWeight: "600" },
  sheetRowCode: { fontSize: 10.5, marginTop: 2 },
}));
