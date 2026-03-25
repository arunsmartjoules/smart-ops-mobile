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
  ActivityIndicator,
  AppState,
  Alert,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  UserCheck,
  Ticket as TicketIcon,
  ListChecks,
  Activity,
  Thermometer,
  User,
  ChevronRight,
  Bell,
  MapPin,
  Clock,
  Calendar,
  Droplets,
  Beaker,
  ClipboardList,
  ThermometerSun,
  Zap,
  Navigation,
  ShieldCheck,
  History,
  LogIn,
  LogOut,
} from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import AttendanceService, {
  type AttendanceLog,
  getISTDateString,
  type Site,
} from "@/services/AttendanceService";
import { format } from "date-fns";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { WifiOff } from "lucide-react-native";
import { syncManager } from "@/services/SyncManager";
import Skeleton from "@/components/Skeleton";
import TicketsService, { type Ticket } from "@/services/TicketsService";
import { API_BASE_URL } from "@/constants/api";
import TicketItem from "@/components/TicketItem";
import TicketDetailModal from "@/components/TicketDetailModal";
import { type SelectOption } from "@/components/SearchableSelect";
import SiteLogService from "@/services/SiteLogService";
import logger from "@/utils/logger";
import { saveOfflineTicketUpdate } from "@/utils/offlineTicketStorage";
import { getCachedSites } from "@/utils/offlineDataCache";
import { WhatsAppService } from "@/services/WhatsAppService";

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
}

// --- Memoized Skeleton Component ---
const DashboardSkeleton = React.memo(() => {
  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950 px-6 pt-6">
      {/* Header Skeleton */}
      <View className="flex-row items-center justify-between mb-8">
        <View>
          <Skeleton
            width={100}
            height={10}
            borderRadius={2}
            style={{ marginBottom: 8 }}
          />
          <Skeleton width={160} height={28} borderRadius={6} />
        </View>
        <Skeleton width={40} height={40} borderRadius={20} />
      </View>

      {/* Attendance Section Skeleton */}
      <View className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-100 dark:border-slate-800 mb-6">
        <View className="flex-row items-center mb-6">
          <Skeleton
            width={40}
            height={40}
            borderRadius={12}
            style={{ marginRight: 12 }}
          />
          <View>
            <Skeleton
              width={80}
              height={8}
              borderRadius={2}
              style={{ marginBottom: 6 }}
            />
            <Skeleton width={120} height={18} borderRadius={4} />
          </View>
        </View>
        <View className="flex-row items-center justify-between">
          <Skeleton width={120} height={40} borderRadius={12} />
          <View className="items-end">
            <Skeleton
              width={60}
              height={8}
              borderRadius={2}
              style={{ marginBottom: 6 }}
            />
            <Skeleton width={80} height={14} borderRadius={4} />
          </View>
        </View>
      </View>

      {/* Log Counts Header */}
      <Skeleton
        width={140}
        height={20}
        borderRadius={4}
        style={{ marginBottom: 16 }}
      />

      {/* Log Counts Row */}
      <View className="flex-row gap-2 mb-8">
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            className="flex-1 bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-100 dark:border-slate-800"
          >
            <Skeleton
              width={32}
              height={32}
              borderRadius={8}
              style={{ marginBottom: 12 }}
            />
            <Skeleton
              width={40}
              height={24}
              borderRadius={4}
              style={{ marginBottom: 6 }}
            />
            <Skeleton width={60} height={10} borderRadius={2} />
          </View>
        ))}
      </View>

      {/* Pending Tickets Header */}
      <View className="flex-row items-center justify-between mb-4">
        <Skeleton width={130} height={22} borderRadius={4} />
        <Skeleton width={50} height={14} borderRadius={4} />
      </View>

      {/* Ticket List Skeleton */}
      <View className="gap-3">
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 flex-row items-center"
          >
            <Skeleton width={40} height={40} borderRadius={12} />
            <View className="flex-1 ml-3">
              <Skeleton
                width="70%"
                height={16}
                borderRadius={4}
                style={{ marginBottom: 8 }}
              />
              <Skeleton width="40%" height={10} borderRadius={2} />
            </View>
            <Skeleton width={16} height={16} borderRadius={4} />
          </View>
        ))}
      </View>
    </View>
  );
});

// --- Pending Item Row Component ---
const PendingItemRow = React.memo(
  ({
    item,
    onPress,
    showPriority = true,
  }: {
    item: PendingItem;
    onPress: () => void;
    showPriority?: boolean;
  }) => {
    const Icon = useMemo(() => {
      switch (item.category) {
        case "Ticket":
          return TicketIcon;
        case "Temp RH":
          return ThermometerSun;
        case "Chiller":
          return Thermometer;
        case "Water":
          return Droplets;
        case "Chemical":
          return Beaker;
        default:
          return ClipboardList;
      }
    }, [item.category]);

    const priorityColors = useMemo(() => {
      if (item.category !== "Ticket" || !item.priority) return null;
      const p = item.priority.toLowerCase();
      if (p.includes("very high"))
        return { accent: "#ec4899", bg: "bg-pink-50", text: "text-pink-600" };
      if (p.includes("high"))
        return { accent: "#dc2626", bg: "bg-red-50", text: "text-red-600" };
      if (p.includes("medium"))
        return {
          accent: "#f97316",
          bg: "bg-orange-50",
          text: "text-orange-600",
        };
      if (p.includes("low"))
        return { accent: "#3b82f6", bg: "bg-blue-50", text: "text-blue-600" };
      return null;
    }, [item.category, item.priority]);

    const color = useMemo(() => {
      if (priorityColors && item.category === "Ticket")
        return priorityColors.accent;
      switch (item.category) {
        case "Temp RH":
          return "#f59e0b";
        case "Chiller":
          return "#ef4444";
        case "Water":
          return "#3b82f6";
        case "Chemical":
          return "#ec4899";
        default:
          return "#64748b";
      }
    }, [item.category, priorityColors]);

    const bgColor = useMemo(() => {
      switch (item.category) {
        case "Ticket":
          return "bg-slate-50 dark:bg-slate-900"; // Neutral background for tickets
        case "Temp RH":
          return "bg-amber-50 dark:bg-amber-950/20";
        case "Chiller":
          return "bg-red-50 dark:bg-red-950/20";
        case "Water":
          return "bg-blue-50 dark:bg-blue-950/20";
        case "Chemical":
          return "bg-pink-50 dark:bg-pink-950/20";
        default:
          return "bg-slate-50 dark:bg-slate-900";
      }
    }, [item.category]);

    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        className="bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl mb-3 flex-row items-center border border-slate-200 dark:border-slate-800 relative overflow-hidden"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.03,
          shadowRadius: 8,
          elevation: 1,
        }}
      >
        {/* Priority Accent Bar */}
        {priorityColors && showPriority && (
          <View
            className="absolute left-0 top-0 bottom-0 w-[4px]"
            style={{ backgroundColor: priorityColors.accent }}
          />
        )}

        <View
          className={`w-10 h-10 rounded-xl items-center justify-center ${bgColor} ${priorityColors && showPriority ? "ml-1" : ""}`}
        >
          <Icon size={18} color={color} />
        </View>

        <View className="flex-1 ml-3 mr-2">
          <View className="flex-row items-center justify-between mb-0.5">
            <Text
              className="text-slate-900 dark:text-slate-50 font-bold text-sm"
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {priorityColors && showPriority && (
              <View
                className={`${priorityColors.bg} px-1.5 py-0.5 rounded-md border border-slate-100 dark:border-slate-800`}
              >
                <Text
                  className={`${priorityColors.text} text-[8px] font-black uppercase tracking-tighter`}
                >
                  {item.priority}
                </Text>
              </View>
            )}
          </View>
          <Text
            className="text-slate-400 dark:text-slate-500 text-[10px] font-bold"
            numberOfLines={1}
          >
            {item.subtitle} • {item.status}
          </Text>
        </View>

        <ChevronRight size={14} color="#cbd5e1" />
      </TouchableOpacity>
    );
  },
);

const LogCountCard = React.memo(
  ({
    count,
    label,
    icon: Icon,
    color,
    bgColor,
    onPress,
  }: {
    count: number;
    label: string;
    icon: any;
    color: string;
    bgColor: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="flex-1 rounded-2xl p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 1,
      }}
    >
      <View
        className="w-8 h-8 rounded-lg items-center justify-center mb-2"
        style={{ backgroundColor: bgColor }}
      >
        <Icon size={16} color={color} />
      </View>
      <Text className="text-slate-900 dark:text-slate-50 text-xl font-bold leading-tight">
        {count}
      </Text>
      <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </Text>
    </TouchableOpacity>
  ),
);

export default function Dashboard() {
  const { isConnected } = useNetworkStatus();
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const [todayAttendance, setTodayAttendance] = useState<AttendanceLog | null>(
    null,
  );
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [pendingTickets, setPendingTickets] = useState<PendingItem[]>([]);
  const [pendingTempRH, setPendingTempRH] = useState<PendingItem[]>([]);
  const [pendingWater, setPendingWater] = useState<PendingItem[]>([]);
  const [pendingChemical, setPendingChemical] = useState<PendingItem[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [validatingLocation, setValidatingLocation] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [earlyCheckoutReason, setEarlyCheckoutReason] = useState("");
  const [showEarlyCheckoutModal, setShowEarlyCheckoutModal] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);

  // Ticket Detail Modal State
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isDetailVisible, setIsDetailVisible] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("");
  const [updateRemarks, setUpdateRemarks] = useState("");
  const [updateArea, setUpdateArea] = useState("");
  const [updateCategory, setUpdateCategory] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [areaOptions, setAreaOptions] = useState<SelectOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<SelectOption[]>([]);
  const [areasLoading, setAreasLoading] = useState(false);

  // Ref for timeout cleanup
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Safety timer to ensure loading icons are never stuck
  useEffect(() => {
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

  const fetchData = React.useCallback(async () => {
    // Safety exit if no user — keep loading state as-is, auth will trigger re-fetch
    if (!user?.user_id && !user?.id) {
      return;
    }

    const userId = user.user_id || user.id;

    try {
      // Always show loading on fresh fetch
      setLoadingPending(true);
      if (!todayAttendance) {
        setLoadingAttendance(true);
      }

      // 1. Load cached data FIRST for instant UI
      const [cachedSitesList, lastSiteCode] = await Promise.all([
        getCachedSites(userId).catch(() => [] as Site[]),
        AsyncStorage.getItem(`last_site_${userId}`).catch(() => null),
      ]);

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
        const siteCode = cachedSitesList[0].site_code;
        
        // Load cached tickets
        const cachedTicketResult = await TicketsService.getTickets(siteCode, {
          status: "Open",
          limit: 10,
        }).catch(() => ({ success: false, data: [] }));

        if (cachedTicketResult?.success && cachedTicketResult.data) {
          const allTickets: PendingItem[] = [];
          cachedTicketResult.data.slice(0, 5).forEach((t: Ticket) => {
            allTickets.push({
              id: t.id,
              title: t.title,
              subtitle: t.ticket_no,
              category: "Ticket",
              status: t.status,
              priority: t.priority,
              route: "/(tabs)/tickets",
              timestamp: t.created_at,
            });
          });

          const priorityOrder: Record<string, number> = {
            "Very High": 1,
            High: 2,
            Medium: 3,
            Low: 4,
          };

          allTickets.sort((a, b) => {
            const pa = priorityOrder[a.priority || ""] || 5;
            const pb = priorityOrder[b.priority || ""] || 5;
            if (pa !== pb) return pa - pb;
            return (
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
          });
          
          setPendingTickets(allTickets);
        }

        // Load cached log counts
        const cachedCounts = await SiteLogService.getOpenCounts(siteCode).catch(
          (): Record<string, number> => ({
            "Temp RH": 0,
            Water: 0,
            "Chemical Dosing": 0,
          }),
        );

        const toItems = (
          logName: string,
          route: string,
          category: "Temp RH" | "Water" | "Chemical",
        ): PendingItem[] =>
          Array.from(
            { length: (cachedCounts as Record<string, number>)[logName] ?? 0 },
            (_, i) => ({
              id: `${siteCode}-${logName}-${i}`,
              title: logName,
              subtitle: cachedSitesList[0].name || siteCode,
              category,
              status: "Open",
              route,
              timestamp: new Date().toISOString(),
            }),
          );

        setPendingTempRH(toItems("Temp RH", "/temp-rh", "Temp RH"));
        setPendingWater(toItems("Water", "/water", "Water"));
        setPendingChemical(toItems("Chemical Dosing", "/chemical", "Chemical"));
        
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
        const fetchSiteCode = effectiveSites[0].site_code;
        const ticketResult = await TicketsService.getTickets(fetchSiteCode, {
          status: "Open",
          limit: 10,
        }).catch((e) => {
          console.error("[Dashboard] Tickets fetch failed:", e);
          return { success: false, data: [] };
        });

        const allTickets: PendingItem[] = [];
        if (ticketResult?.success && ticketResult.data) {
          ticketResult.data.slice(0, 5).forEach((t: Ticket) => {
            allTickets.push({
              id: t.id,
              title: t.title,
              subtitle: t.ticket_no,
              category: "Ticket",
              status: t.status,
              priority: t.priority,
              route: "/(tabs)/tickets",
              timestamp: t.created_at,
            });
          });

          const priorityOrder: Record<string, number> = {
            "Very High": 1,
            High: 2,
            Medium: 3,
            Low: 4,
          };

          allTickets.sort((a, b) => {
            const pa = priorityOrder[a.priority || ""] || 5;
            const pb = priorityOrder[b.priority || ""] || 5;
            if (pa !== pb) return pa - pb;
            return (
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
          });
        }
        setPendingTickets(allTickets);

        // Fetch fresh log counts
        const primarySiteCode = effectiveSites[0].site_code;
        const counts = await SiteLogService.getOpenCounts(
          primarySiteCode,
        ).catch(
          (): Record<string, number> => ({
            "Temp RH": 0,
            Water: 0,
            "Chemical Dosing": 0,
          }),
        );

        const toItems = (
          logName: string,
          route: string,
          category: "Temp RH" | "Water" | "Chemical",
        ): PendingItem[] =>
          Array.from(
            { length: (counts as Record<string, number>)[logName] ?? 0 },
            (_, i) => ({
              id: `${primarySiteCode}-${logName}-${i}`,
              title: logName,
              subtitle: effectiveSites[0].name || primarySiteCode,
              category,
              status: "Open",
              route,
              timestamp: new Date().toISOString(),
            }),
          );

        setPendingTempRH(toItems("Temp RH", "/temp-rh", "Temp RH"));
        setPendingWater(toItems("Water", "/water", "Water"));
        setPendingChemical(toItems("Chemical Dosing", "/chemical", "Chemical"));
      }
    } catch (error) {
      console.error("Dashboard fetchData critical error:", error);
    } finally {
      setLoadingAttendance(false);
      setLoadingPending(false);
    }
  }, [user, todayAttendance]);

  const loadAreasAndCategories = useCallback(async () => {
    if (sites.length === 0) return;
    const selectedSiteCode = sites[0].site_code;

    setAreasLoading(true);
    try {
      // CACHE-FIRST: Load from cache immediately
      const [cachedAreas, cachedCategories] = await Promise.all([
        TicketsService.getAssets(selectedSiteCode),
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
  }, [sites]);

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
      TicketsService.getTickets(sites[0].site_code, {
        ticket_no: item.subtitle,
      }).then((res) => {
        if (res.success && res.data && res.data.length > 0) {
          const ticket = res.data[0];
          setSelectedTicket(ticket);
          setUpdateStatus(ticket.status);
          setUpdateRemarks(ticket.internal_remarks || "");
          setUpdateArea(ticket.area_asset || "");
          setUpdateCategory(ticket.category || "");
          setIsDetailVisible(true);
        }
      });
    },
    [sites],
  );

  const handleUpdateStatus = async () => {
    if (!selectedTicket || !user?.id) return;

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

    if (updateStatus === "Inprogress" || updateStatus === "Cancelled") {
      payload.assigned_to = user.full_name || user.name || "";
    }

    setIsUpdating(true);
    try {
      const res = await TicketsService.updateTicket(
        selectedTicket.id || selectedTicket.ticket_no,
        payload,
      );
      if (res.success) {
        const updatedTicketForWA = { ...selectedTicket, ...payload };
        WhatsAppService.sendStatusUpdate(
          updatedTicketForWA,
          updateStatus,
          updateRemarks,
        ).catch((e) =>
          logger.warn("Failed WhatsApp notification", { error: e }),
        );

        Alert.alert("Success", "Ticket updated successfully");
        setIsDetailVisible(false);
        fetchData(); // Refresh dashboard list
      } else {
        Alert.alert("Error", res.error || "Failed to update ticket");
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const navigateToAttendance = useCallback(
    () => router.push("/attendance"),
    [],
  );
  const navigateToNotifications = useCallback(
    () => router.push("/notifications" as any),
    [],
  );
  const navigateToProfile = useCallback(() => router.push("/app-settings"), []);

  const handleQuickCheckIn = async () => {
    if (!user?.id) return;
    setValidatingLocation(true);
    try {
      // 1. Get site code (from last site)
      const lastSiteCode = await AsyncStorage.getItem(`last_site_${user.id}`);
      let siteToUse = lastSiteCode;
      if (!siteToUse || siteToUse === "all") {
        siteToUse = sites.length > 0 ? sites[0].site_code : null;
      }
      if (!siteToUse) {
        router.push("/attendance");
        return;
      }

      // 2. Get location
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // 3. Validate
      const validation = await AttendanceService.validateLocation(
        user.id,
        loc.coords.latitude,
        loc.coords.longitude,
      );

      if (validation.isValid) {
        // Find matching site
        const siteToJoin =
          validation.allowedSites.find((s) => s.site_code === lastSiteCode) ||
          validation.allowedSites[0];

        const res = await AttendanceService.checkIn(
          user.id,
          siteToJoin.site_code,
          loc.coords.latitude,
          loc.coords.longitude,
        );
        if (res.success) {
          Alert.alert("Success", "Checked in successfully!");
          fetchData();
        } else {
          Alert.alert("Failed", res.error || "Check-in failed");
        }
      } else {
        Alert.alert(
          "Location Failed",
          "You are too far from the site. Please go to the Attendance screen for details.",
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
    setValidatingLocation(true);

    const performCheckOut = async (remarks?: string) => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const res = await AttendanceService.checkOut(
          todayAttendance.id,
          loc.coords.latitude,
          loc.coords.longitude,
          undefined,
          remarks,
        );

        if (res.success) {
          Alert.alert("Success", "Checked out successfully!");
          fetchData();
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

  const navigateToAllTasks = useCallback(() => {
    router.push("/all-tasks");
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      syncManager.prefetchAll();
    }, [fetchData]),
  );

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    // Simulate other API calls (with cleanup)
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    refreshTimeoutRef.current = setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, [fetchData]);

  const getStatusBgColor = useMemo(() => {
    if (!todayAttendance) return "bg-slate-50 dark:bg-slate-900"; // Neutral
    if (todayAttendance.check_out_time) return "bg-blue-50 dark:bg-blue-950/20"; // Completed
    return "bg-emerald-50 dark:bg-emerald-950/20"; // Active
  }, [todayAttendance]);

  const getStatusBorderColor = useMemo(() => {
    if (!todayAttendance) return "border-slate-100 dark:border-slate-800";
    if (todayAttendance.check_out_time)
      return "border-blue-100 dark:border-blue-900/50";
    return "border-emerald-100 dark:border-emerald-900/50";
  }, [todayAttendance]);

  const getStatusText = useMemo(() => {
    if (!todayAttendance) return "Not Checked In";
    if (todayAttendance.check_out_time) return "Shift Completed";
    return "Checked In";
  }, [todayAttendance]);

  const getStatusSubtext = useMemo(() => {
    if (!todayAttendance) return "Tap To Start Shift";
    if (todayAttendance.check_out_time) {
      return `Out: ${format(new Date(todayAttendance.check_out_time), "h:mm a")}`;
    }

    if (!todayAttendance.check_in_time) return "In: --";
    const start = new Date(todayAttendance.check_in_time);
    if (isNaN(start.getTime())) return "In: --";

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
    if (isNaN(minutes) || minutes < 0) return "In: 0h 0m";

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }, [todayAttendance, currentTime]);

  if (loadingAttendance) {
    return <DashboardSkeleton />;
  }

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        {/* Offline Banner */}
        {!isConnected && (
          <View className="bg-amber-500 py-1.5 px-4 flex-row items-center justify-center">
            <WifiOff size={14} color="white" />
            <Text className="text-white text-xs font-bold ml-2">
              Offline Mode — Using cached data
            </Text>
          </View>
        )}

        {/* Header Section */}
        <View className="px-6 pt-6 pb-4 flex-row items-center justify-between">
          <View>
            <Text className="text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-1">
              JouleOps • Dashboard
            </Text>
            <Text className="text-slate-900 dark:text-slate-50 text-2xl font-black tracking-tight">
              Site Overview
            </Text>
          </View>
          <TouchableOpacity className="w-10 h-10 rounded-full bg-white dark:bg-slate-900 items-center justify-center border border-slate-200 dark:border-slate-800">
            <Activity size={18} color="#dc2626" />
          </TouchableOpacity>
        </View>

        {/* Premium Attendance Section */}
        <View className="px-6 mb-4">
          <TouchableOpacity
            onPress={navigateToAttendance}
            activeOpacity={0.9}
            className="overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.04,
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            {/* Top Bar: Site Identity */}
            <View className="p-4 flex-row items-center justify-between border-b border-slate-50 dark:border-slate-800/50">
              <View className="flex-row items-center flex-1 pr-4">
                <View className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/20 items-center justify-center border border-red-100 dark:border-red-900/50 mr-3">
                  <Zap size={20} color="#dc2626" />
                </View>
                <View className="flex-1">
                  <Text className="text-slate-400 dark:text-slate-500 text-[8px] font-bold uppercase tracking-[0.1em] mb-0.5">
                    Welcome back
                  </Text>
                  <Text
                    className="text-slate-900 dark:text-slate-50 text-base font-black leading-tight"
                    numberOfLines={1}
                  >
                    {user?.full_name || user?.name || "Shift Operational"}
                  </Text>
                </View>
              </View>

              {/* Glassmorphism Status Pill */}
              <View
                className={`flex-row items-center px-3 py-1.5 rounded-full border ${getStatusBorderColor}`}
                style={{
                  backgroundColor: todayAttendance
                    ? todayAttendance.check_out_time
                      ? "rgba(59, 130, 246, 0.08)"
                      : "rgba(5, 150, 105, 0.08)"
                    : "rgba(148, 163, 184, 0.08)",
                }}
              >
                <View
                  className={`w-1.5 h-1.5 rounded-full mr-2 ${
                    todayAttendance
                      ? todayAttendance.check_out_time
                        ? "bg-blue-500"
                        : "bg-emerald-500"
                      : "bg-slate-400"
                  }`}
                />
                <Text
                  className={`text-[9px] font-black uppercase tracking-widest ${
                    todayAttendance
                      ? todayAttendance.check_out_time
                        ? "text-blue-600"
                        : "text-emerald-600"
                      : "text-slate-500"
                  }`}
                >
                  {getStatusText}
                </Text>
              </View>
            </View>

            {/* Bottom Bar: Action & Time */}
            <View className="p-3 bg-slate-50/50 dark:bg-white/5 flex-row items-center justify-between">
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  if (!todayAttendance || todayAttendance.check_out_time) {
                    handleQuickCheckIn();
                  } else {
                    handleQuickCheckOut();
                  }
                }}
                className="px-6 py-2.5 rounded-xl flex-row items-center shadow-sm bg-red-600"
              >
                {validatingLocation ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    {!todayAttendance || todayAttendance.check_out_time ? (
                      <LogIn size={14} color="white" />
                    ) : (
                      <LogOut size={14} color="white" />
                    )}
                    <Text className="text-white text-[11px] font-black uppercase ml-2 tracking-wide">
                      {!todayAttendance || todayAttendance.check_out_time
                        ? "Punch In"
                        : "Punch Out"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <View className="items-end">
                <Text className="text-slate-400 dark:text-slate-500 text-[8px] font-bold uppercase mb-0.5">
                  Shift Duration
                </Text>
                <View className="flex-row items-center">
                  <ShieldCheck size={12} color="#64748b" className="mr-1" />
                  <Text className="text-slate-700 dark:text-slate-200 font-black text-xs">
                    {getStatusSubtext}
                  </Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {sites.length > 0 && (
          <>
            <View className="px-6 mb-3">
              <Text className="text-slate-900 dark:text-slate-50 text-base font-black">
                Pending Site logs
              </Text>
            </View>

            <View className="px-6 mb-6 flex-row gap-2">
              {loadingPending
                ? // Skeletons while loading
                  [1, 2, 3].map((i) => (
                    <View
                      key={i}
                      className="flex-1 bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-100 dark:border-slate-800"
                    >
                      <Skeleton
                        width={32}
                        height={32}
                        borderRadius={8}
                        style={{ marginBottom: 16 }}
                      />
                      <Skeleton
                        width={40}
                        height={20}
                        borderRadius={4}
                        style={{ marginBottom: 6 }}
                      />
                      <Skeleton width={60} height={10} borderRadius={2} />
                    </View>
                  ))
                : // Actual data once loaded
                  (() => {
                    const navSiteCode =
                      sites.length > 0 ? sites[0].site_code : "";
                    return (
                      <>
                        <LogCountCard
                          icon={ThermometerSun}
                          count={pendingTempRH.length}
                          label="Temp & RH"
                          color="#f59e0b"
                          bgColor="rgba(245, 158, 11, 0.1)"
                          onPress={() =>
                            router.push({
                              pathname: "/history/site-history",
                              params: {
                                logName: "Temp RH",
                                siteCode: navSiteCode,
                                status: "Open",
                              },
                            } as any)
                          }
                        />
                        <LogCountCard
                          icon={Droplets}
                          count={pendingWater.length}
                          label="Water"
                          color="#3b82f6"
                          bgColor="rgba(59, 130, 246, 0.1)"
                          onPress={() =>
                            router.push({
                              pathname: "/history/site-history",
                              params: {
                                logName: "Water",
                                siteCode: navSiteCode,
                                status: "Open",
                              },
                            } as any)
                          }
                        />
                        <LogCountCard
                          icon={Beaker}
                          count={pendingChemical.length}
                          label="Chemical"
                          color="#ec4899"
                          bgColor="rgba(236, 72, 153, 0.1)"
                          onPress={() =>
                            router.push({
                              pathname: "/history/site-history",
                              params: {
                                logName: "Chemical Dosing",
                                siteCode: navSiteCode,
                                status: "Open",
                              },
                            } as any)
                          }
                        />
                      </>
                    );
                  })()}
            </View>
          </>
        )}
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#dc2626"
            />
          }
        >
          {/* Pending Tickets Section */}
          <View className="px-6 mb-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-slate-900 dark:text-slate-50 text-base font-black">
                Pending Tickets
              </Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/tickets")}>
                <Text className="text-red-600 text-[10px] font-black uppercase tracking-wider">
                  View All
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Pending Tickets List Section */}
          <View className="px-6 mb-6">
            {loadingPending ? (
              <View className="gap-2">
                {[1, 2].map((i) => (
                  <View
                    key={i}
                    className="h-14 bg-white dark:bg-slate-900 rounded-2xl border border-slate-50 dark:border-slate-800 flex-row items-center px-4"
                  >
                    <Skeleton width={32} height={32} borderRadius={8} />
                    <View className="ml-3 flex-1">
                      <Skeleton
                        width="60%"
                        height={12}
                        borderRadius={4}
                        style={{ marginBottom: 6 }}
                      />
                      <Skeleton width="40%" height={8} borderRadius={2} />
                    </View>
                  </View>
                ))}
              </View>
            ) : pendingTickets.length > 0 ? (
              pendingTickets.map((item) => (
                <PendingItemRow
                  key={item.id}
                  item={item}
                  onPress={() => handleTicketPress(item)}
                  showPriority={false}
                />
              ))
            ) : (
              <View className="py-2 items-center">
                <Text className="text-slate-400 text-[10px] font-bold">
                  No pending tickets
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

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
          isUpdating={isUpdating}
          handleUpdateStatus={handleUpdateStatus}
          areaOptions={areaOptions}
          categoryOptions={categoryOptions}
          areasLoading={areasLoading}
        />
      </SafeAreaView>
    </View>
  );
}
