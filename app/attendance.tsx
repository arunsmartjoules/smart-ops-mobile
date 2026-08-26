import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  TextInput,
  Platform,
  AppState,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import PressableScale from "@/components/PressableScale";
import NetInfo from "@react-native-community/netinfo";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  Map as LucideMap,
  MapPin,
  WifiOff,
  X,
} from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { useAuth } from "@/contexts/AuthContext";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import {
  AttendanceService,
  type AttendanceLog,
  type Site,
  getISTDateString,
} from "@/services/AttendanceService";
import appLogger from "@/utils/logger";
import { format } from "date-fns";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import Skeleton from "@/components/Skeleton";
import { ds } from "@/constants/ds";
import { soRadius, soShadow } from "@/components/home/SiteOverview";

/** Reuse cached foreground location reads for this long (ms). */
const LOCATION_FRESHNESS_MS = 5 * 60 * 1000;

/**
 * How long an open session may run before it reads as a missed checkout, and
 * the app's own early-checkout threshold (the reason modal fires below it).
 */
const MISSED_CHECKOUT_HOURS = 17;
const EARLY_CHECKOUT_MINUTES = 7 * 60;
/** A runaway open session is capped here rather than accruing forever. */
const MAX_SESSION_HOURS = 20;

export type DayKind = "full" | "short" | "missed" | "leave" | "active";

/** Minutes worked for a log; null when there is no check-in to measure from. */
function durationMinutes(log: AttendanceLog, now: Date): number | null {
  if (!log.check_in_time) return null;
  const start = new Date(log.check_in_time);
  if (Number.isNaN(start.getTime())) return null;

  let end: Date;
  if (log.check_out_time) {
    end = new Date(log.check_out_time);
    if (Number.isNaN(end.getTime())) return null;
  } else {
    const hours = (now.getTime() - start.getTime()) / 3_600_000;
    end =
      hours <= MAX_SESSION_HOURS
        ? now
        : new Date(start.getTime() + MAX_SESSION_HOURS * 3_600_000);
  }

  const mins = Math.floor((end.getTime() - start.getTime()) / 60_000);
  return Number.isNaN(mins) || mins < 0 ? 0 : mins;
}

const formatHm = (mins: number) =>
  `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;

function dayKind(log: AttendanceLog, now: Date): DayKind {
  if (log.status === "Leave") return "leave";
  if (!log.check_in_time) return "missed";
  if (!log.check_out_time) {
    const start = new Date(log.check_in_time);
    const hours = (now.getTime() - start.getTime()) / 3_600_000;
    return hours > MISSED_CHECKOUT_HOURS ? "missed" : "active";
  }
  const mins = durationMinutes(log, now) ?? 0;
  return mins < EARLY_CHECKOUT_MINUTES ? "short" : "full";
}

/** The artboard tones a row by whether the day needs attention. */
const isClean = (kind: DayKind) => kind === "full" || kind === "active";

const safeTime = (value: string | undefined, pattern: string) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : format(d, pattern);
};

// --- Memoized Components ---

/**
 * One hairline history row — Claude Design "JouleOps Attendance.dc.html":
 * the day on the left, what happened in the middle, duration on the right.
 */
const HistoryRow = React.memo(function HistoryRow({
  log,
  kind,
  now,
  last,
}: {
  log: AttendanceLog;
  kind: DayKind;
  now: Date;
  last: boolean;
}) {
  const clean = isClean(kind);
  const mins = durationMinutes(log, now);

  const line =
    kind === "leave"
      ? "Leave"
      : kind === "missed"
        ? "Missed checkout · auto-closed"
        : kind === "active"
          ? `${safeTime(log.check_in_time, "HH:mm")} → in progress`
          : `${safeTime(log.check_in_time, "HH:mm")} → ${safeTime(log.check_out_time, "HH:mm")}${
              kind === "short" ? " · early checkout" : ""
            }`;

  const parsed = log.date ? new Date(log.date) : null;
  const valid = parsed && !Number.isNaN(parsed.getTime());

  return (
    <View style={[styles.historyRow, last && styles.historyRowLast]}>
      <Text
        style={[
          styles.historyDay,
          { color: clean ? ds.carbon[100] : ds.flame[100] },
        ]}
      >
        {valid ? format(parsed as Date, "d EEE") : "—"}
      </Text>

      <View style={styles.historyBody}>
        <Text
          style={[
            styles.historyLine,
            { color: clean ? ds.carbon[400] : ds.flame[100] },
          ]}
          numberOfLines={1}
        >
          {line}
        </Text>
        <Text style={styles.historySite} numberOfLines={1}>
          {log.site_name || log.site_code || "—"}
        </Text>
      </View>

      <Text
        style={[
          styles.historyDur,
          { color: clean ? ds.carbon[100] : ds.carbon[500] },
        ]}
      >
        {kind === "leave" || mins == null ? "—" : formatHm(mins)}
      </Text>
    </View>
  );
});

const AttendanceHistorySkeleton = React.memo(function AttendanceHistorySkeleton() {
  return (
    <View style={styles.historyCard}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <View
          key={i}
          style={[styles.historyRow, i === 6 && styles.historyRowLast]}
        >
          <Skeleton width={44} height={14} borderRadius={4} />
          <View style={styles.historyBody}>
            <Skeleton width={140} height={12} borderRadius={4} />
            <Skeleton
              width={90}
              height={10}
              borderRadius={4}
              style={{ marginTop: 4 }}
            />
          </View>
          <Skeleton width={46} height={14} borderRadius={4} />
        </View>
      ))}
    </View>
  );
});

const SiteItem = React.memo(function SiteItem({
  site,
  onSelect,
}: {
  site: Site;
  onSelect: (code: string) => void | Promise<void>;
}) {
  const handleSelect = useCallback(() => {
    onSelect(site.site_code);
  }, [site.site_code, onSelect]);
  const distance = site.distanceMeters ?? site.distance;

  return (
    <TouchableOpacity
      onPress={handleSelect}
      activeOpacity={0.85}
      style={styles.siteRow}
    >
      <View style={styles.siteIcon}>
        <LucideMap size={18} color={ds.sky[100]} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.siteName} numberOfLines={1}>
          {site.name}
        </Text>
        {site.address ? (
          <Text style={styles.siteAddress} numberOfLines={1}>
            {site.address}
          </Text>
        ) : null}
      </View>
      {distance !== undefined ? (
        <View style={styles.siteDistance}>
          <Text style={styles.siteDistanceText}>{distance}m</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
});

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

const HISTORY_FILTERS = ["All", "Short", "Missed"] as const;

export default function AttendancePage() {
  const insets = useSafeAreaInsets();
  const { isConnected } = useNetworkStatus();
  const { user, refreshProfile } = useAuth();
  const {
    refresh: refreshAttendanceGate,
    markPunchedIn: markGatePunchedIn,
    markPunchedOut: markGatePunchedOut,
  } = useAttendanceGate();
  const userId = user?.user_id || user?.id;
  const candidateUserIds = useMemo(
    () => Array.from(new Set([user?.user_id, user?.id].filter(Boolean))) as string[],
    [user?.user_id, user?.id],
  );
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceLog[]>(
    [],
  );
  const [todayAttendance, setTodayAttendance] = useState<AttendanceLog | null>(
    null,
  );
  const [location, setLocation] = useState<Location.LocationObject | null>(
    null,
  );
  const [locationError, setLocationError] = useState<string | null>(null);

  // Modal States
  const [isCheckoutModalVisible, setIsCheckoutModalVisible] = useState(false);
  const [isSiteModalVisible, setIsSiteModalVisible] = useState(false);
  const [checkoutReason, setCheckoutReason] = useState("");
  const [availableSites, setAvailableSites] = useState<Site[]>([]);
  const [validatingLocation, setValidatingLocation] = useState(false);
  const [earlyCheckoutHours, setEarlyCheckoutHours] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  /** 0 = newest month present in the fetched history; higher steps back. */
  const [monthOffset, setMonthOffset] = useState(0);
  const [historyFilter, setHistoryFilter] =
    useState<(typeof HISTORY_FILTERS)[number]>("All");
  const locationRef = React.useRef<Location.LocationObject | null>(null);
  const pendingPunchCoordsRef = React.useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Safety timer to clear loading no matter what
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading((prev) => {
        if (prev)
          appLogger.debug("Attendance safety timeout triggered", {
            module: "ATTENDANCE_SCREEN",
          });
        return false;
      });
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  const fetchData = React.useCallback(async () => {
    if (candidateUserIds.length === 0) {
      setLoading(false);
      return;
    }

    try {
      // 1. Show cached data immediately (SWR)
      let cachedToday: AttendanceLog | null = null;
      let cachedHistory: { data: AttendanceLog[]; pagination: any } = {
        data: [],
        pagination: {},
      };

      for (const id of candidateUserIds) {
        const [todayForId, historyForId] = await Promise.all([
          AttendanceService.getTodayAttendance(id).catch(() => null),
          AttendanceService.getAttendanceHistory(id, 1, 30).catch(() => ({
            data: [],
            pagination: {},
          })),
        ]);

        if (!cachedToday && todayForId) cachedToday = todayForId;
        if (cachedHistory.data.length === 0 && historyForId.data.length > 0) {
          cachedHistory = historyForId;
        }

        if (cachedToday) break;
      }

      if (cachedToday) setTodayAttendance(cachedToday);
      if (cachedHistory.data.length > 0)
        setAttendanceHistory(cachedHistory.data);

      if (cachedToday || cachedHistory.data.length > 0) {
        setLoading(false);
      }
      // Keep screen responsive even when cache is empty; fresh API data can hydrate in background.
      if (!cachedToday && cachedHistory.data.length === 0) {
        setLoading(false);
      }

      // 2. Fetch fresh data from API (only if online)
      const netState = await NetInfo.fetch();
      const isActuallyOnline = netState.isConnected === true;

      if (isActuallyOnline) {
        let today: AttendanceLog | null = null;
        let history: { data: AttendanceLog[]; pagination: any } = {
          data: [],
          pagination: {},
        };

        for (const id of candidateUserIds) {
          const [todayForId, historyForId] = await Promise.all([
            AttendanceService.getTodayAttendance(id, true).catch(() => null),
            AttendanceService.getAttendanceHistory(id).catch(() => ({
              data: [],
              pagination: {},
            })),
          ]);

          if (!today && todayForId) today = todayForId;
          if (history.data.length === 0 && historyForId.data.length > 0) {
            history = historyForId;
          }

          if (today) break;
        }

        setTodayAttendance(today);
        setAttendanceHistory(history.data);
      }
    } catch (error: any) {
      appLogger.error("Fetch attendance data error", {
        module: "ATTENDANCE_SCREEN",
        error: error.message,
        userId: userId || candidateUserIds.join(","),
      });
    } finally {
      setLoading(false);
    }
  }, [userId, candidateUserIds]);

  // Track when location was last fetched
  const locationTimestampRef = React.useRef<number>(0);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  // Robust location getter — optimized for speed
  const ensureLocation = useCallback(
    async (forceRefresh = false): Promise<Location.LocationObject | null> => {
      // Reuse cached location if fresh (< 5 min old)
      if (
        !forceRefresh &&
        locationRef.current &&
        Date.now() - locationTimestampRef.current < LOCATION_FRESHNESS_MS
      ) {
        return locationRef.current;
      }

      try {
        // 1. Check services
        const enabled = await Location.hasServicesEnabledAsync();
        if (!enabled) {
          setLocationError("Location services are disabled");
          Alert.alert(
            "GPS Disabled",
            "Please enable GPS/Location services in your device settings.",
            [{ text: "OK" }],
          );
          return null;
        }

        // 2. Check & Request Permissions
        let { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") {
          const permissionResponse =
            await Location.requestForegroundPermissionsAsync();
          status = permissionResponse.status;
        }

        if (status !== "granted") {
          setLocationError("Permission to access location was denied");
          Alert.alert(
            "Permission Required",
            "Location permission is required to mark attendance. Please allow access in settings.",
            [{ text: "OK" }],
          );
          return null;
        }

        // 3. Try last-known first for instant response
        const lastKnown = await Location.getLastKnownPositionAsync({});
        if (
          lastKnown &&
          Date.now() - lastKnown.timestamp < LOCATION_FRESHNESS_MS
        ) {
          setLocation(lastKnown);
          locationTimestampRef.current = Date.now();
          setLocationError(null);
          return lastKnown;
        }

        // 4. Fall back to getCurrentPosition (balanced for speed when previewing)
        const locationResult = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setLocation(locationResult);
        locationTimestampRef.current = Date.now();
        setLocationError(null);
        return locationResult;
      } catch (error: any) {
        console.log("Location error:", error);
        // Fallback to last known
        try {
          const lastKnown = await Location.getLastKnownPositionAsync({});
          if (lastKnown) {
            setLocation(lastKnown);
            locationTimestampRef.current = Date.now();
            return lastKnown;
          }
        } catch {
          /* ignore last-known fallback errors */
        }

        Alert.alert(
          "Location Error",
          "Could not fetch current location. Please check your GPS signal.",
        );
        setLocationError("Could not fetch location");
        return null;
      }
    },
    [],
  );

  /** Fresh, higher-accuracy fix for punch in/out (requires network on caller side). */
  const ensureLocationForPunch = useCallback(async (): Promise<
    Location.LocationObject | null
  > => {
    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        setLocationError("Location services are disabled");
        Alert.alert(
          "GPS Disabled",
          "Please enable GPS/Location services in your device settings.",
          [{ text: "OK" }],
        );
        return null;
      }

      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        const permissionResponse =
          await Location.requestForegroundPermissionsAsync();
        status = permissionResponse.status;
      }

      if (status !== "granted") {
        setLocationError("Permission to access location was denied");
        Alert.alert(
          "Permission Required",
          "Location permission is required to mark attendance. Please allow access in settings.",
          [{ text: "OK" }],
        );
        return null;
      }

      const accuracy =
        Platform.OS === "android"
          ? Location.Accuracy.High
          : Location.Accuracy.BestForNavigation;

      const locationResult = await Location.getCurrentPositionAsync({
        accuracy,
      });
      setLocation(locationResult);
      locationTimestampRef.current = Date.now();
      locationRef.current = locationResult;
      setLocationError(null);
      return locationResult;
    } catch (error: any) {
      console.log("Location error (punch):", error);
      Alert.alert(
        "Location Error",
        "Could not fetch an accurate location for attendance. Please try again in an open area.",
      );
      setLocationError("Could not fetch location");
      return null;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Preview builds may carry stale cached auth user shape; refresh profile silently.
      if (!user?.user_id && user?.id) {
        refreshProfile().catch(() => {});
      }
      fetchData();
      // Always request location regardless of work_location_type
      ensureLocation();
    }, [user?.user_id, user?.id, refreshProfile, fetchData, ensureLocation]),
  );

  // Update current time every minute for the live timer with AppState handling
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    // Always refresh location on pull-to-refresh
    try {
      let location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation(location);
    } catch {
      /* ignore refresh location errors */
    }
    setRefreshing(false);
  }, [fetchData]);

  const handleCheckOutPress = useCallback(async () => {
    if (!todayAttendance) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

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
    try {
      const currentLoc = await ensureLocationForPunch();
      if (!currentLoc) {
        setValidatingLocation(false);
        return;
      }

      // Optimistic UI: show checkout immediately
      const previousAttendance = todayAttendance;
      setTodayAttendance({
        ...todayAttendance,
        check_out_time: new Date().toISOString(),
      });
      setValidatingLocation(false);

      const res = await AttendanceService.checkOut(
        todayAttendance.id,
        currentLoc.coords.latitude,
        currentLoc.coords.longitude,
      );

      if (res.success && res.queued) {
        // Saved locally + queued — silently confirm without alarming the user.
        Alert.alert(
          "Saved",
          "Checked out. It will sync automatically when your connection is stable.",
        );
        fetchData();
        markGatePunchedOut();
        refreshAttendanceGate();
        router.replace("/(tabs)/dashboard");
      } else if (res.success) {
        Alert.alert("Success", "Checked out successfully!");
        fetchData();
        markGatePunchedOut();
        refreshAttendanceGate();
        router.replace("/(tabs)/dashboard");
      } else if (res.isEarlyCheckout) {
        // Revert optimistic update — need reason
        setTodayAttendance(previousAttendance);
        setEarlyCheckoutHours(res.hoursWorked || "0");
        setCheckoutReason("");
        setIsCheckoutModalVisible(true);
      } else {
        // Revert optimistic update
        setTodayAttendance(previousAttendance);
        if (res.error?.includes("reason") || res.isEarlyCheckout) {
          setEarlyCheckoutHours(res.hoursWorked || "0");
          setIsCheckoutModalVisible(true);
          return;
        }
        Alert.alert("Failed", res.error || "Check-out failed");
      }
    } catch (error: any) {
      // Revert on error
      fetchData();
      Alert.alert("Error", error.message);
      setValidatingLocation(false);
    }
  }, [
    todayAttendance,
    user?.role,
    ensureLocationForPunch,
    fetchData,
    refreshAttendanceGate,
    markGatePunchedOut,
  ]);

  const submitEarlyCheckout = useCallback(async () => {
    if (!checkoutReason.trim()) {
      Alert.alert("Required", "Please provide a reason for early checkout");
      return;
    }

    try {
      const loc = await ensureLocationForPunch();
      if (!loc) return;

      const res = await AttendanceService.checkOut(
        todayAttendance!.id,
        loc.coords.latitude,
        loc.coords.longitude,
        undefined,
        checkoutReason,
      );

      if (res.success && res.queued) {
        setIsCheckoutModalVisible(false);
        Alert.alert(
          "Saved",
          "Checked out. It will sync automatically when your connection is stable.",
        );
        fetchData();
        markGatePunchedOut();
        refreshAttendanceGate();
        router.replace("/(tabs)/dashboard");
      } else if (res.success) {
        setIsCheckoutModalVisible(false);
        Alert.alert("Success", "Checked out successfully!");
        fetchData();
        markGatePunchedOut();
        refreshAttendanceGate();
        router.replace("/(tabs)/dashboard");
      } else {
        Alert.alert("Failed", res.error || "Check-out failed");
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  }, [todayAttendance, checkoutReason, fetchData, ensureLocationForPunch, refreshAttendanceGate, markGatePunchedOut]);

  const performCheckIn = useCallback(
    async (
      siteCode: string | null,
      coords?: { latitude: number; longitude: number } | null,
    ) => {
      if (!userId) {
        Alert.alert(
          "Error",
          "User session not available. Please sign in again.",
        );
        return;
      }

      const c = coords ?? pendingPunchCoordsRef.current;
      if (!c) {
        Alert.alert(
          "Location missing",
          "Could not determine your location for check-in. Please try again.",
        );
        return;
      }

      try {
        const optimisticLog: AttendanceLog = {
          id: `opt-${Date.now()}`,
          user_id: userId,
          site_code: siteCode ?? "",
          date: getISTDateString(),
          check_in_time: new Date().toISOString(),
          status: "Present",
        };
        setTodayAttendance(optimisticLog);

        const res = await AttendanceService.checkIn(
          userId,
          siteCode,
          c.latitude,
          c.longitude,
        );
        if (res.success && res.queued) {
          // Saved locally + queued — silently confirm without alarming the user.
          Alert.alert(
            "Saved",
            "Checked in. It will sync automatically when your connection is stable.",
          );
          setIsSiteModalVisible(false);
          pendingPunchCoordsRef.current = null;
          fetchData();
          markGatePunchedIn();
          refreshAttendanceGate();
          router.replace("/(tabs)/dashboard");
        } else if (res.success) {
          Alert.alert("Success", "Checked in successfully!");
          setIsSiteModalVisible(false);
          pendingPunchCoordsRef.current = null;
          fetchData();
          markGatePunchedIn();
          refreshAttendanceGate();
          router.replace("/(tabs)/dashboard");
        } else {
          setTodayAttendance(null);

          if ((res as any).requiresCheckout) {
            Alert.alert(
              "Checkout Required",
              res.error ||
                "Please check out from your current session before checking in again.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Checkout Now",
                  onPress: () => {
                    if ((res as any).data) {
                      setTodayAttendance((res as any).data);
                      setTimeout(() => handleCheckOutPress(), 500);
                    }
                  },
                },
              ],
            );
          } else {
            const ext = res as any;
            const msg = formatLocationFailureMessage(
              ext.error || "Check-in failed",
              ext.userLocation,
              ext.nearestSite,
            );
            Alert.alert("Failed", msg);
          }
        }
      } catch (error: any) {
        setTodayAttendance(null);
        Alert.alert("Error", error.message);
      }
    },
    [userId, fetchData, handleCheckOutPress, refreshAttendanceGate, markGatePunchedIn],
  );

  const handleCheckInPress = useCallback(async () => {
    if (!userId) {
      Alert.alert("Error", "User session not available. Please sign in again.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    setValidatingLocation(true);
    try {
      const locToUse = await ensureLocationForPunch();

      if (!locToUse) {
        setValidatingLocation(false);
        return;
      }

      const punchCoords = {
        latitude: locToUse.coords.latitude,
        longitude: locToUse.coords.longitude,
      };
      pendingPunchCoordsRef.current = punchCoords;

      const validation = await AttendanceService.validateLocation(
        userId,
        punchCoords.latitude,
        punchCoords.longitude,
      );

      if (validation.isValid) {
        if (validation.isWFH) {
          Alert.alert(
            "Work From Home",
            validation.resolvedSiteCode
              ? `You are within site "${validation.allowedSites.find((s) => s.site_code === validation.resolvedSiteCode)?.name ?? validation.resolvedSiteCode}". Your attendance will record this site. Proceed?`
              : "You are checking in as Work From Home (no site will be stored unless you are on a site geofence). Proceed?",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Start Day",
                onPress: () =>
                  performCheckIn(validation.resolvedSiteCode ?? null, punchCoords),
              },
            ],
          );
        } else if (validation.allowedSites.length === 1) {
          performCheckIn(validation.allowedSites[0].site_code, punchCoords);
        } else {
          setAvailableSites(validation.allowedSites);
          setIsSiteModalVisible(true);
        }
      } else {
        Alert.alert(
          "Location Validation Failed",
          formatLocationFailureMessage(
            validation.message,
            validation.userLocation,
            validation.nearestSite,
          ),
        );
      }
    } catch (error: any) {
      appLogger.error("Check-in validation error", {
        module: "ATTENDANCE_SCREEN",
        error: error.message,
        userId,
      });
      Alert.alert("Error", error.message || "Failed to validate location");
    } finally {
      setValidatingLocation(false);
    }
  }, [userId, ensureLocationForPunch, performCheckIn]);


  // ── Derived view state (Claude Design "JouleOps Attendance.dc.html") ──────

  const punchedIn = !!todayAttendance && !todayAttendance.check_out_time;
  const dayComplete = !!todayAttendance?.check_out_time;

  const todayMinutes = todayAttendance
    ? (durationMinutes(todayAttendance, currentTime) ?? 0)
    : 0;
  const heroHours = String(Math.floor(todayMinutes / 60));
  const heroMins = String(todayMinutes % 60).padStart(2, "0");

  const pillLabel = punchedIn
    ? "On shift"
    : dayComplete
      ? "Day complete"
      : "Not checked in";

  const todaySite =
    todayAttendance?.site_name || todayAttendance?.site_code || null;

  const geoNote = locationError
    ? locationError
    : punchedIn
      ? `Checked in${todaySite ? ` at ${todaySite}` : ""}`
      : "You must be on site to check in";

  /** History grouped into months, newest first — the month stepper walks these. */
  const months = useMemo(() => {
    const map = new Map<string, AttendanceLog[]>();
    for (const log of attendanceHistory) {
      const key = String(log.date || "").slice(0, 7);
      if (key.length !== 7) continue;
      const bucket = map.get(key);
      if (bucket) bucket.push(log);
      else map.set(key, [log]);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [attendanceHistory]);

  // Clamp when the fetched window changes under us (e.g. a refresh).
  const monthIndex = Math.min(monthOffset, Math.max(0, months.length - 1));
  const activeMonth = months[monthIndex];
  const monthLogs = useMemo(() => activeMonth?.[1] ?? [], [activeMonth]);

  const monthLabel = useMemo(() => {
    if (!activeMonth) return format(new Date(), "MMM yyyy");
    const [y, m] = activeMonth[0].split("-").map(Number);
    return format(new Date(y as number, (m as number) - 1, 1), "MMM yyyy");
  }, [activeMonth]);

  const monthSummary = useMemo(() => {
    const worked = monthLogs.filter(
      (l) => l.status !== "Leave" && l.check_in_time,
    );
    if (worked.length === 0) return "No days logged";
    const total = worked.reduce(
      (sum, l) => sum + (durationMinutes(l, currentTime) ?? 0),
      0,
    );
    return `${worked.length} days · avg ${formatHm(Math.round(total / worked.length))}`;
  }, [monthLogs, currentTime]);

  /** Kind is computed once per log, then drives both filtering and row tone. */
  const monthRows = useMemo(
    () =>
      monthLogs
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map((log) => ({ log, kind: dayKind(log, currentTime) })),
    [monthLogs, currentTime],
  );

  const visibleRows = useMemo(() => {
    if (historyFilter === "Short") {
      return monthRows.filter((r) => r.kind === "short");
    }
    if (historyFilter === "Missed") {
      return monthRows.filter((r) => r.kind === "missed");
    }
    return monthRows;
  }, [monthRows, historyFilter]);

  const hasOlder = monthIndex < months.length - 1;
  const hasNewer = monthIndex > 0;

  return (
    <View style={styles.screen}>
      {/* ── Thunder header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.8}
            hitSlop={8}
            style={styles.headerTile}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={20} color={ds.white} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Attendance</Text>
          <Text style={styles.headerDate}>{format(new Date(), "EEE d MMM")}</Text>
        </View>

        <View style={styles.hero}>
          <View
            style={[
              styles.heroPill,
              {
                backgroundColor: punchedIn
                  ? MOCK.pillOnBg
                  : MOCK.pillOffBg,
              },
            ]}
          >
            <View
              style={[
                styles.heroPillDot,
                { backgroundColor: punchedIn ? MOCK.pillOnDot : ds.sky[500] },
              ]}
            />
            <Text
              style={[
                styles.heroPillLabel,
                { color: punchedIn ? MOCK.pillOnFg : MOCK.pillOffFg },
              ]}
            >
              {pillLabel}
            </Text>
          </View>

          <Text style={styles.heroDuration}>
            {heroHours}
            <Text style={styles.heroUnit}>h</Text> {heroMins}
            <Text style={styles.heroUnit}>m</Text>
          </Text>

          <View style={styles.heroTimes}>
            <View>
              <Text style={styles.heroEyebrow}>In</Text>
              <Text
                style={[
                  styles.heroTime,
                  { color: todayAttendance ? ds.white : MOCK.heroMuted },
                ]}
              >
                {safeTime(todayAttendance?.check_in_time, "hh:mm a")}
              </Text>
            </View>
            <View style={styles.heroDivider} />
            <View>
              <Text style={styles.heroEyebrow}>Out</Text>
              <Text
                style={[
                  styles.heroTime,
                  { color: dayComplete ? ds.white : MOCK.heroMuted },
                ]}
              >
                {safeTime(todayAttendance?.check_out_time, "hh:mm a")}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── Punch ── */}
      <View style={styles.punchWrap}>
        <PressableScale
          onPress={punchedIn ? handleCheckOutPress : handleCheckInPress}
          disabled={validatingLocation}
          style={[
            styles.punch,
            {
              backgroundColor: punchedIn ? ds.thunder[100] : ds.flame[100],
              opacity: validatingLocation ? 0.7 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={punchedIn ? "End day" : "Start day"}
        >
          {validatingLocation ? (
            <ActivityIndicator size="small" color={ds.white} />
          ) : (
            <>
              {punchedIn ? (
                <LogOut size={19} color={ds.white} strokeWidth={2.2} />
              ) : (
                <LogIn size={19} color={ds.white} strokeWidth={2.2} />
              )}
              <Text style={styles.punchLabel}>
                {punchedIn ? "End day" : "Start day"}
              </Text>
            </>
          )}
        </PressableScale>

        <View style={styles.geoRow}>
          {locationError ? (
            <AlertTriangle size={14} color={ds.flame[100]} strokeWidth={2} />
          ) : (
            <MapPin size={14} color={ds.sky[100]} strokeWidth={2} />
          )}
          <Text
            style={[
              styles.geoNote,
              locationError ? { color: ds.flame[100] } : null,
            ]}
            numberOfLines={2}
          >
            {geoNote}
          </Text>
        </View>

        {!isConnected ? (
          <View style={styles.offlineRow}>
            <WifiOff size={13} color={ds.carbon[500]} strokeWidth={2} />
            <Text style={styles.offlineText}>
              Offline — punches sync when the connection returns
            </Text>
          </View>
        ) : null}
      </View>

      {/* ── History ── */}
      <ScrollView
        style={{ flex: 1 }}
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
        <View style={styles.monthRow}>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <View style={styles.monthNav}>
            <TouchableOpacity
              onPress={() => setMonthOffset((i) => i + 1)}
              disabled={!hasOlder}
              activeOpacity={0.7}
              hitSlop={6}
              style={[styles.monthBtn, styles.monthBtnFilled]}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <ChevronLeft
                size={16}
                color={hasOlder ? ds.carbon[400] : MOCK.navDisabled}
                strokeWidth={2.2}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMonthOffset((i) => Math.max(0, i - 1))}
              disabled={!hasNewer}
              activeOpacity={0.7}
              hitSlop={6}
              style={styles.monthBtn}
              accessibilityRole="button"
              accessibilityLabel="Next month"
            >
              <ChevronRight
                size={16}
                color={hasNewer ? ds.carbon[400] : MOCK.navDisabled}
                strokeWidth={2.2}
              />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }} />
          <Text style={styles.monthSummary}>{monthSummary}</Text>
        </View>

        <View style={styles.filterRow}>
          {HISTORY_FILTERS.map((f) => {
            const on = historyFilter === f;
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setHistoryFilter(f)}
                activeOpacity={0.75}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: on ? ds.thunder[100] : ds.white,
                    borderColor: on ? ds.thunder[100] : ds.carbon[900],
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text
                  style={[
                    styles.filterLabel,
                    { color: on ? ds.white : ds.carbon[400] },
                  ]}
                >
                  {f}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <AttendanceHistorySkeleton />
        ) : (
          <View style={styles.historyCard}>
            {visibleRows.length === 0 ? (
              <View style={styles.historyEmpty}>
                <CalendarCheck
                  size={24}
                  color={ds.carbon[800]}
                  strokeWidth={1.9}
                />
                <Text style={styles.historyEmptyText}>
                  {months.length === 0
                    ? "No attendance history yet"
                    : historyFilter === "All"
                      ? "No days logged this month"
                      : `No ${historyFilter.toLowerCase()} days this month`}
                </Text>
              </View>
            ) : (
              visibleRows.map((row, i) => (
                <HistoryRow
                  key={row.log.id}
                  log={row.log}
                  kind={row.kind}
                  now={currentTime}
                  last={i === visibleRows.length - 1}
                />
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Early-checkout reason ── */}
      {isCheckoutModalVisible && (
        <Modal
          visible={isCheckoutModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIsCheckoutModalVisible(false)}
        >
          <View style={styles.modalScrim}>
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <AlertTriangle
                  size={22}
                  color={ds.flame[100]}
                  strokeWidth={2.1}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.modalTitle}>Early checkout</Text>
                  <Text style={styles.modalSub}>
                    You worked {earlyCheckoutHours} hours (less than 7h). Please
                    give a reason.
                  </Text>
                </View>
              </View>

              <TextInput
                style={styles.modalInput}
                placeholder="Enter reason here…"
                placeholderTextColor={ds.carbon[700]}
                multiline
                textAlignVertical="top"
                value={checkoutReason}
                onChangeText={setCheckoutReason}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => setIsCheckoutModalVisible(false)}
                  activeOpacity={0.8}
                  style={[styles.modalBtn, styles.modalBtnGhost]}
                >
                  <Text style={styles.modalBtnGhostText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={submitEarlyCheckout}
                  activeOpacity={0.85}
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                >
                  <Text style={styles.modalBtnPrimaryText}>Submit</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Site picker ── */}
      {isSiteModalVisible && (
        <Modal
          visible={isSiteModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setIsSiteModalVisible(false)}
        >
          <View style={styles.sheetScrim}>
            <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>Select site</Text>
                <TouchableOpacity
                  onPress={() => setIsSiteModalVisible(false)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <X size={22} color={ds.carbon[500]} strokeWidth={2} />
                </TouchableOpacity>
              </View>
              <Text style={styles.sheetSub}>
                More than one site is in range — pick where you are checking in.
              </Text>
              <ScrollView style={{ marginTop: 4 }}>
                {availableSites.map((site) => (
                  <SiteItem
                    key={site.site_code}
                    site={site}
                    onSelect={(code) => performCheckIn(code)}
                  />
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

/** Mock-only tints from the artboard with no design-system token. */
const MOCK = {
  /** On-shift pill: sky wash, mint dot, mint label. */
  pillOnBg: "rgba(40,147,157,0.28)",
  pillOnFg: "#A9E3CC",
  pillOnDot: "#6FD3A8",
  /** Off-shift pill: a plain white wash on thunder. */
  pillOffBg: "rgba(255,255,255,0.12)",
  pillOffFg: "#C7D4D6",
  /** A time that hasn't happened yet. */
  heroMuted: "rgba(255,255,255,0.45)",
  heroDivider: "rgba(255,255,255,0.16)",
  /** Month stepper at the end of its range. */
  navDisabled: "#D6D4D3",
  /** Hairline between history rows. */
  divider: "#F0EFEF",
} as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ds.pageBg },

  /* ── Thunder header ── */
  header: {
    backgroundColor: ds.thunder[100],
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  headerTile: {
    width: 34,
    height: 34,
    borderRadius: soRadius.pill,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -4,
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: ds.white },
  headerDate: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.sky[500],
  },

  hero: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 4 },
  heroPill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: soRadius.pill,
    marginBottom: 14,
  },
  heroPillDot: { width: 6, height: 6, borderRadius: soRadius.pill },
  heroPillLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
  },
  heroDuration: {
    textAlign: "center",
    fontSize: 62,
    lineHeight: 66,
    fontWeight: "300",
    letterSpacing: -1.24,
    color: ds.white,
  },
  heroUnit: { fontSize: 26, fontWeight: "600" },
  heroTimes: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 26,
    marginTop: 16,
  },
  heroDivider: { width: 1, backgroundColor: MOCK.heroDivider },
  heroEyebrow: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.sky[500],
    marginBottom: 4,
  },
  heroTime: { fontSize: 15, fontWeight: "600" },

  /* ── Punch ── */
  punchWrap: { paddingHorizontal: 20, paddingTop: 16 },
  punch: {
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  punchLabel: { fontSize: 16, fontWeight: "700", color: ds.white },
  geoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
  },
  geoNote: { flexShrink: 1, fontSize: 11, color: ds.carbon[500] },
  offlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
  },
  offlineText: { flexShrink: 1, fontSize: 11, color: ds.carbon[500] },

  /* ── History ── */
  body: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28 },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  monthLabel: { fontSize: 13, fontWeight: "700", color: ds.carbon[100] },
  monthNav: { flexDirection: "row", gap: 2 },
  monthBtn: {
    width: 26,
    height: 26,
    borderRadius: soRadius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  monthBtnFilled: { backgroundColor: ds.carbon[1000] },
  monthSummary: { fontSize: 11.5, color: ds.carbon[600] },

  filterRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  filterChip: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 13,
    borderRadius: soRadius.pill,
    borderWidth: 1,
  },
  filterLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.22 },

  historyCard: {
    backgroundColor: ds.white,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 2,
    ...soShadow,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: MOCK.divider,
  },
  historyRowLast: { borderBottomWidth: 0 },
  historyDay: { width: 44, fontSize: 12, fontWeight: "600" },
  historyBody: { flex: 1, minWidth: 0 },
  historyLine: { fontSize: 12 },
  historySite: { fontSize: 10.5, color: ds.carbon[600], marginTop: 2 },
  historyDur: { fontSize: 12.5, fontWeight: "600" },
  historyEmpty: { paddingVertical: 24, alignItems: "center", gap: 8 },
  historyEmptyText: { fontSize: 12.5, color: ds.carbon[500] },

  /* ── Early-checkout modal ── */
  modalScrim: {
    flex: 1,
    backgroundColor: "rgba(25,19,18,0.5)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: ds.white,
    borderRadius: 18,
    padding: 18,
  },
  modalHead: { flexDirection: "row", gap: 12, marginBottom: 14 },
  modalTitle: { fontSize: 16, fontWeight: "700", color: ds.carbon[100] },
  modalSub: {
    fontSize: 12.5,
    lineHeight: 18,
    color: ds.carbon[400],
    marginTop: 3,
  },
  modalInput: {
    backgroundColor: ds.pageBg,
    borderWidth: 1,
    borderColor: ds.carbon[900],
    borderRadius: soRadius.sm,
    padding: 12,
    minHeight: 92,
    fontSize: 13,
    color: ds.carbon[100],
    marginBottom: 14,
  },
  modalActions: { flexDirection: "row", gap: 10 },
  modalBtn: {
    flex: 1,
    borderRadius: soRadius.sm,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnGhost: { borderWidth: 1, borderColor: ds.carbon[900] },
  modalBtnGhostText: { fontSize: 13.5, fontWeight: "600", color: ds.carbon[400] },
  modalBtnPrimary: { backgroundColor: ds.thunder[100] },
  modalBtnPrimaryText: { fontSize: 13.5, fontWeight: "700", color: ds.white },

  /* ── Site picker sheet ── */
  sheetScrim: {
    flex: 1,
    backgroundColor: "rgba(25,19,18,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: ds.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 18,
    maxHeight: "80%",
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: ds.carbon[100] },
  sheetSub: { fontSize: 12.5, lineHeight: 18, color: ds.carbon[400] },

  siteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: ds.pageBg,
    borderWidth: 1,
    borderColor: ds.carbon[900],
    borderRadius: soRadius.card,
    padding: 13,
    marginTop: 8,
  },
  siteIcon: {
    width: 36,
    height: 36,
    borderRadius: soRadius.pill,
    backgroundColor: ds.sky[1000],
    alignItems: "center",
    justifyContent: "center",
  },
  siteName: { fontSize: 13.5, fontWeight: "600", color: ds.carbon[100] },
  siteAddress: { fontSize: 11, color: ds.carbon[500], marginTop: 2 },
  siteDistance: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: ds.sky[1000],
  },
  siteDistanceText: { fontSize: 10, fontWeight: "700", color: ds.sky[100] },
});
