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
  TextInput,
  Platform,
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import NetInfo from "@react-native-community/netinfo";
import {
  ArrowLeft,
  Clock,
  MapPin,
  Calendar,
  ChevronRight,
  LogIn,
  LogOut,
  AlertTriangle,
  Map as LucideMap,
  X,
} from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { useAuth } from "@/contexts/AuthContext";
import AttendanceService, {
  type AttendanceLog,
  type Site,
  type LocationValidationResult,
  getISTDateString,
} from "@/services/AttendanceService";
import { db, userSites } from "@/database";
import { eq } from "drizzle-orm";
import { syncManager } from "@/services/SyncManager";
import logger from "@/utils/logger";
import { format, differenceInMinutes, parseISO } from "date-fns";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { WifiOff } from "lucide-react-native";
import Skeleton from "@/components/Skeleton";

// --- Memoized Components ---

const HistoryItem = React.memo(
  ({
    log,
    currentTime,
    getDuration,
  }: {
    log: AttendanceLog;
    currentTime: Date;
    getDuration: (log: AttendanceLog) => string;
  }) => {
    const hasMissedCheckout = useMemo(() => {
      if (log.check_out_time || log.status === "Leave" || !log.check_in_time)
        return false;
      const checkIn = new Date(log.check_in_time);
      const diffHours =
        (currentTime.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
      return diffHours > 17;
    }, [log.check_out_time, log.status, log.check_in_time, currentTime]);

    return (
      <View
        className="bg-white dark:bg-slate-900 rounded-2xl p-4"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        {/* Top Row: Date + Duration / Missed Checkout */}
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <View className="w-8 h-8 rounded-lg bg-red-50 items-center justify-center mr-2">
              <Calendar size={16} color="#dc2626" />
            </View>
            <Text className="text-slate-900 dark:text-slate-50 font-semibold">
              {format(new Date(log.date), "EEE, d MMM")}
            </Text>
          </View>
          {log.status === "Leave" ? (
            <View className="bg-red-50 px-2.5 py-1 rounded-lg">
              <Text className="text-red-500 text-xs font-bold">LEAVE</Text>
            </View>
          ) : hasMissedCheckout ? (
            <View className="bg-amber-50 px-2.5 py-1 rounded-lg">
              <Text className="text-amber-600 text-xs font-bold">
                Missed Checkout
              </Text>
            </View>
          ) : (
            <View className="bg-slate-100 px-2.5 py-1 rounded-lg">
              <Text className="text-slate-600 text-xs font-medium">
                {getDuration(log)}
              </Text>
            </View>
          )}
        </View>

        {/* Check-in / Check-out in a single row */}
        {log.check_in_time && (
          <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5">
            {/* Check In */}
            <View className="flex-1 flex-row items-center">
              <View
                className={`w-7 h-7 rounded-md ${log.check_in_time ? "bg-green-100 dark:bg-green-900" : "bg-slate-200 dark:bg-slate-700"} items-center justify-center mr-2`}
              >
                <LogIn
                  size={14}
                  color={log.check_in_time ? "#22c55e" : "#94a3b8"}
                />
              </View>
              <View>
                <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-medium uppercase">
                  In
                </Text>
                <Text className="text-slate-800 dark:text-slate-200 text-sm font-semibold">
                  {format(new Date(log.check_in_time), "h:mm a")}
                </Text>
              </View>
            </View>

            {/* Separator */}
            <View className="mx-2">
              <ChevronRight size={14} color="#cbd5e1" />
            </View>

            {/* Check Out */}
            <View className="flex-1 flex-row items-center">
              <View
                className={`w-7 h-7 rounded-md items-center justify-center mr-2 ${log.check_out_time ? "bg-orange-100 dark:bg-orange-900" : "bg-slate-200 dark:bg-slate-700"}`}
              >
                <LogOut
                  size={14}
                  color={log.check_out_time ? "#f97316" : "#94a3b8"}
                />
              </View>
              <View>
                <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-medium uppercase">
                  Out
                </Text>
                <Text
                  className={`text-sm font-semibold ${log.check_out_time ? "text-slate-800 dark:text-slate-200" : "text-slate-400 dark:text-slate-500"}`}
                >
                  {log.check_out_time
                    ? format(new Date(log.check_out_time), "h:mm a")
                    : "--:--"}
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  },
);

const AttendanceHistorySkeleton = React.memo(() => {
  return (
    <View className="gap-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          className="bg-white dark:bg-slate-900 rounded-2xl p-4"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2,
          }}
        >
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center">
              <Skeleton
                width={32}
                height={32}
                borderRadius={8}
                style={{ marginRight: 8 }}
              />
              <Skeleton width={100} height={16} borderRadius={4} />
            </View>
            <Skeleton width={60} height={16} borderRadius={8} />
          </View>
          <View className="gap-2">
            <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
              <Skeleton
                width={32}
                height={32}
                borderRadius={8}
                style={{ marginRight: 12 }}
              />
              <View className="flex-1 gap-1">
                <Skeleton width={80} height={14} borderRadius={4} />
                <Skeleton width={50} height={10} borderRadius={2} />
              </View>
            </View>
            <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
              <Skeleton
                width={32}
                height={32}
                borderRadius={8}
                style={{ marginRight: 12 }}
              />
              <View className="flex-1 gap-1">
                <Skeleton width={80} height={14} borderRadius={4} />
                <Skeleton width={50} height={10} borderRadius={2} />
              </View>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
});

const SiteItem = React.memo(
  ({ site, onSelect }: { site: Site; onSelect: (code: string) => void }) => {
    const handleSelect = useCallback(() => {
      onSelect(site.site_code);
    }, [site.site_code, onSelect]);

    return (
      <TouchableOpacity
        onPress={handleSelect}
        className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4 rounded-xl mb-3 flex-row items-center"
      >
        <View className="w-10 h-10 rounded-full bg-red-100 items-center justify-center mr-3">
          <LucideMap size={20} color="#dc2626" />
        </View>
        <View className="flex-1">
          <Text className="font-bold text-slate-900 dark:text-slate-100">
            {site.name}
          </Text>
          <Text className="text-slate-500 dark:text-slate-400 text-xs">
            {site.address}
          </Text>
        </View>
        {site.distance !== undefined && (
          <View className="bg-green-100 px-2 py-1 rounded">
            <Text className="text-green-700 text-xs font-bold">
              {site.distance}m
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  },
);

export default function AttendancePage() {
  const { isConnected } = useNetworkStatus();
  const { user } = useAuth();
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

  // Safety timer to clear loading no matter what
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading((prev) => {
        if (prev)
          logger.debug("Attendance safety timeout triggered", {
            module: "ATTENDANCE_SCREEN",
          });
        return false;
      });
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  const fetchData = React.useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      // 1. Show cached data immediately (SWR)
      const [cachedToday, cachedHistory] = await Promise.all([
        AttendanceService.getTodayAttendance(user.id).catch(() => null),
        AttendanceService.getAttendanceHistory(user.id, 1, 30).catch(() => ({
          data: [],
          pagination: {},
        })),
      ]);

      if (cachedToday) setTodayAttendance(cachedToday);
      if (cachedHistory.data.length > 0)
        setAttendanceHistory(cachedHistory.data);

      if (cachedToday || cachedHistory.data.length > 0) {
        setLoading(false);
      }

      // 2. Fetch fresh data from API (only if online)
      const netState = await NetInfo.fetch();
      const isActuallyOnline = netState.isConnected === true;

      if (isActuallyOnline) {
        const [today, history] = await Promise.all([
          AttendanceService.getTodayAttendance(user.id, true),
          AttendanceService.getAttendanceHistory(user.id),
        ]);

        setTodayAttendance(today);
        setAttendanceHistory(history.data);
      }
    } catch (error: any) {
      logger.error("Fetch attendance data error", {
        module: "ATTENDANCE_SCREEN",
        error: error.message,
        userId: user?.id,
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, isConnected]);

  // Track when location was last fetched
  const locationTimestampRef = React.useRef<number>(0);
  const LOCATION_FRESHNESS_MS = 5 * 60 * 1000; // 5 minutes

  // Robust location getter — optimized for speed
  const ensureLocation = useCallback(
    async (forceRefresh = false): Promise<Location.LocationObject | null> => {
      // Reuse cached location if fresh (< 5 min old)
      if (
        !forceRefresh &&
        location &&
        Date.now() - locationTimestampRef.current < LOCATION_FRESHNESS_MS
      ) {
        return location;
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

        // 4. Fall back to getCurrentPosition with low accuracy for speed
        const locationResult = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
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
        } catch (e) {}

        Alert.alert(
          "Location Error",
          "Could not fetch current location. Please check your GPS signal.",
        );
        setLocationError("Could not fetch location");
        return null;
      }
    },
    [location, user?.work_location_type],
  );

  useFocusEffect(
    useCallback(() => {
      fetchData();
      // Always request location regardless of work_location_type
      ensureLocation();
    }, [fetchData, ensureLocation]),
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
    } catch (e) {}
    setRefreshing(false);
  }, [fetchData]);

  const handleCheckOutPress = useCallback(async () => {
    if (!todayAttendance) return;

    setValidatingLocation(true);
    try {
      // Skip location fetch when offline
      let currentLoc: Location.LocationObject | null = null;
      const netState = await NetInfo.fetch();
      const isActuallyOnline = netState.isConnected === true;

      if (isActuallyOnline) {
        currentLoc = await ensureLocation();
        if (!currentLoc) {
          setValidatingLocation(false);
          return;
        }
      }

      // Optimistic UI: show checkout immediately
      const previousAttendance = todayAttendance;
      setTodayAttendance({
        ...todayAttendance,
        check_out_time: new Date().toISOString(),
      });
      setValidatingLocation(false);

      // Fire API call (or queue offline)
      const res = await AttendanceService.checkOut(
        todayAttendance.id,
        currentLoc?.coords.latitude,
        currentLoc?.coords.longitude,
      );

      if (res.success) {
        if (res.isOffline) {
          Alert.alert(
            "Checked Out Offline",
            "Your check-out has been saved and will sync when you're back online.",
          );
        } else {
          Alert.alert("Success", "Checked out successfully!");
        }
        fetchData();
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
  }, [todayAttendance, ensureLocation, fetchData]);

  const submitEarlyCheckout = useCallback(async () => {
    if (!checkoutReason.trim()) {
      Alert.alert("Required", "Please provide a reason for early checkout");
      return;
    }

    try {
      const res = await AttendanceService.checkOut(
        todayAttendance!.id,
        location?.coords.latitude,
        location?.coords.longitude,
        undefined,
        checkoutReason,
      );

      if (res.success) {
        setIsCheckoutModalVisible(false);
        Alert.alert("Success", "Checked out successfully!");
        fetchData();
      } else {
        Alert.alert("Failed", res.error || "Check-out failed");
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  }, [todayAttendance, location, checkoutReason, fetchData]);

  const performCheckIn = useCallback(
    async (siteCode: string) => {
      // Offline allowed
      // if (!isConnected) { ... }
      if (!user?.id) {
        Alert.alert(
          "Error",
          "User session not available. Please sign in again.",
        );
        return;
      }
      try {
        // Optimistic UI update
        const optimisticLog: AttendanceLog = {
          id: `opt-${Date.now()}`,
          user_id: user!.id,
          site_code: siteCode,
          date: getISTDateString(),
          check_in_time: new Date().toISOString(),
          status: "Present",
        };
        setTodayAttendance(optimisticLog);

        const res = await AttendanceService.checkIn(
          user!.id,
          siteCode,
          location?.coords.latitude,
          location?.coords.longitude,
        );
        if (res.success) {
          if (res.isOffline) {
            Alert.alert(
              "Checked In Offline",
              "Your check-in has been saved and will sync when you're back online.",
            );
          } else {
            Alert.alert("Success", "Checked in successfully!");
          }
          setIsSiteModalVisible(false);
          fetchData();
        } else {
          // Revert optimistic update on failure
          setTodayAttendance(null);

          // Handle requiresCheckout case
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
                    // Set the existing attendance and trigger checkout
                    if ((res as any).data) {
                      setTodayAttendance((res as any).data);
                      setTimeout(() => handleCheckOutPress(), 500);
                    }
                  },
                },
              ],
            );
          } else {
            Alert.alert("Failed", res.error || "Check-in failed");
          }
        }
      } catch (error: any) {
        setTodayAttendance(null);
        Alert.alert("Error", error.message);
      }
    },
    [user?.id, location, fetchData, isConnected, handleCheckOutPress],
  );

  const handleCheckInPress = useCallback(async () => {
    if (!user?.id) {
      Alert.alert("Error", "User session not available. Please sign in again.");
      return;
    }

    // Offline path — skip location validation, read directly from cache
    if (!isConnected) {
      const localSiteRows = await db
        .select()
        .from(userSites)
        .where(eq(userSites.user_id, user.id))
        .catch(() => []);
      const cached = localSiteRows.map((r: any) => ({
        site_code: r.site_code,
        name: r.site_name || r.site_code,
      }));
      if (cached.length === 1) {
        performCheckIn(cached[0].site_code);
      } else if (cached.length > 1) {
        setAvailableSites(cached);
        setIsSiteModalVisible(true);
      } else {
        // Cache empty — extremely unlikely after first login, but handle gracefully
        Alert.alert(
          "No Sites Available",
          "Site data hasn't loaded yet. Please connect to the internet once to sync your sites.",
        );
      }
      return;
    }

    setValidatingLocation(true);
    try {
      // Reuse cached location if fresh, otherwise fetch quickly
      const locToUse = await ensureLocation();

      if (!locToUse) {
        setValidatingLocation(false);
        return;
      }

      const validation = await AttendanceService.validateLocation(
        user!.id,
        locToUse.coords.latitude,
        locToUse.coords.longitude,
      );

      if (validation.isValid) {
        if (validation.isWFH) {
          Alert.alert(
            "Work From Home",
            "You are checking in as Work From Home. Proceed?",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Check In",
                onPress: () =>
                  performCheckIn(
                    validation.allowedSites[0]?.site_code || "WFH",
                  ),
              },
            ],
          );
        } else if (validation.allowedSites.length === 1) {
          performCheckIn(validation.allowedSites[0].site_code);
        } else {
          setAvailableSites(validation.allowedSites);
          setIsSiteModalVisible(true);
        }
      } else {
        const message = validation.nearestSite
          ? `You are ${validation.nearestSite.distance}m away from ${validation.nearestSite.name}. Max allowed: ${validation.nearestSite.radius || 500}m.`
          : validation.message;
        Alert.alert("Location Validation Failed", message);
      }
    } catch (error: any) {
      logger.error("Check-in validation error", {
        module: "ATTENDANCE_SCREEN",
        error: error.message,
        userId: user?.id,
      });
      Alert.alert("Error", error.message || "Failed to validate location");
    } finally {
      setValidatingLocation(false);
    }
  }, [user, isConnected, ensureLocation, performCheckIn]);

  // Helper to calculate duration
  const getDuration = useCallback(
    (log: AttendanceLog) => {
      if (!log.check_in_time) return "--";

      const start = new Date(log.check_in_time);
      if (isNaN(start.getTime())) return "--";

      let end: Date;

      if (log.check_out_time) {
        end = new Date(log.check_out_time);
      } else {
        const diffMs = currentTime.getTime() - start.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours <= 17) {
          end = currentTime;
        } else {
          // Cap at 17 hours exactly for sessions that exceeded the limit
          end = new Date(start.getTime() + 17 * 60 * 60 * 1000);
        }
      }

      const minutes = Math.floor((end.getTime() - start.getTime()) / 60000);
      if (isNaN(minutes) || minutes < 0) return "0h 0m";

      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}m`;
    },
    [currentTime],
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        {/* Offline Banner */}
        {!isConnected && (
          <View className="bg-amber-500 py-1.5 px-4 flex-row items-center justify-center">
            <WifiOff size={14} color="white" />
            <Text className="text-white text-xs font-bold ml-2">
              Offline — Check-in/out will sync when connected
            </Text>
          </View>
        )}

        {/* Header */}
        <View className="px-5 pt-2 pb-3 flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-white items-center justify-center mr-3"
            style={{ shadowOpacity: 0.1, shadowRadius: 5, elevation: 2 }}
          >
            <ArrowLeft size={18} color="#64748b" />
          </TouchableOpacity>
          <View>
            <Text className="text-slate-900 dark:text-slate-50 text-xl font-bold">
              Attendance
            </Text>
            <Text className="text-slate-400 dark:text-slate-500 text-xs">
              {format(new Date(), "MMMM yyyy")}
            </Text>
          </View>
        </View>

        {/* Today's Status Card - Redesigned as Smart Card */}
        <View
          className="mx-5 mb-6"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.15,
            shadowRadius: 20,
            elevation: 10,
          }}
        >
          <LinearGradient
            colors={
              todayAttendance?.check_out_time
                ? ["#059669", "#064e3b"] // Emerald/Dark Green
                : todayAttendance
                  ? ["#dc2626", "#7f1d1d"] // Red/Dark Red
                  : ["#2563eb", "#1e3a8a"] // Blue/Dark Blue
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 24, padding: 24, minHeight: 220 }}
          >
            {/* Design Elements */}
            <View
              style={{
                position: "absolute",
                top: -20,
                right: -20,
                width: 100,
                height: 100,
                borderRadius: 50,
                backgroundColor: "rgba(255,255,255,0.1)",
              }}
            />
            <View
              style={{
                position: "absolute",
                bottom: 20,
                left: -30,
                width: 120,
                height: 120,
                borderRadius: 60,
                backgroundColor: "rgba(255,255,255,0.05)",
              }}
            />

            {/* Top Row: Brand/Type and Date */}
            <View className="flex-row justify-between items-start mb-6">
              <View>
                <Text className="text-white/60 text-[10px] font-black tracking-[2px] uppercase">
                  SmartOps Identity
                </Text>
                <View className="flex-row items-center mt-1">
                  <View className="w-2 h-2 rounded-full bg-white mr-2" />
                  <Text className="text-white text-lg font-bold">
                    Attendance Card
                  </Text>
                </View>
              </View>
              <View className="items-end">
                <Text className="text-white/70 text-[10px] font-bold uppercase">
                  {format(new Date(), "EEEE")}
                </Text>
                <Text className="text-white text-sm font-black">
                  {format(new Date(), "dd MMM yyyy")}
                </Text>
              </View>
            </View>

            {/* Profile Section */}
            <View className="flex-row items-center mb-6">
              <View className="w-14 h-14 rounded-2xl bg-white/20 items-center justify-center border border-white/30 mr-4">
                <Text className="text-white text-2xl font-black">
                  {user?.name?.charAt(0) || user?.email?.charAt(0) || "U"}
                </Text>
              </View>
              <View className="flex-1">
                <Text
                  className="text-white text-xl font-black"
                  numberOfLines={1}
                >
                  {user?.name || "User"}
                </Text>
                <Text
                  className="text-white/70 text-xs font-medium"
                  numberOfLines={1}
                >
                  {user?.email || ""}
                </Text>
              </View>
              {todayAttendance && (
                <View className="bg-white/20 px-3 py-1.5 rounded-xl border border-white/20">
                  <Text className="text-white text-[11px] font-black">
                    {getDuration(todayAttendance)}
                  </Text>
                </View>
              )}
            </View>

            {/* Stats Row */}
            <View className="flex-row gap-3">
              <View className="flex-1 bg-black/20 rounded-2xl p-3 border border-white/10">
                <View className="flex-row items-center mb-1">
                  <LogIn size={11} color="#4ade80" />
                  <Text className="text-white/60 text-[9px] font-bold uppercase ml-1.5">
                    Check In
                  </Text>
                </View>
                <Text className="text-white text-sm font-black">
                  {todayAttendance?.check_in_time
                    ? format(new Date(todayAttendance.check_in_time), "HH:mm")
                    : "--:--"}
                </Text>
              </View>

              <View className="flex-1 bg-black/20 rounded-2xl p-3 border border-white/10">
                <View className="flex-row items-center mb-1">
                  <LogOut size={11} color="#fb923c" />
                  <Text className="text-white/60 text-[9px] font-bold uppercase ml-1.5">
                    Check Out
                  </Text>
                </View>
                <Text className="text-white text-sm font-black">
                  {todayAttendance?.check_out_time
                    ? format(new Date(todayAttendance.check_out_time), "HH:mm")
                    : "--:--"}
                </Text>
              </View>

              <View className="flex-1 bg-black/20 rounded-2xl p-3 border border-white/10">
                <View className="flex-row items-center mb-1">
                  <Clock size={11} color="#60a5fa" />
                  <Text className="text-white/60 text-[9px] font-bold uppercase ml-1.5">
                    Status
                  </Text>
                </View>
                <Text
                  className="text-white text-[10px] font-black uppercase"
                  numberOfLines={1}
                >
                  {todayAttendance?.check_out_time
                    ? "Complete"
                    : todayAttendance
                      ? "Active"
                      : "Pending"}
                </Text>
              </View>
            </View>

            {/* Action Area */}
            <View className="mt-6">
              {!todayAttendance ? (
                <TouchableOpacity
                  onPress={handleCheckInPress}
                  disabled={validatingLocation}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: "white",
                    borderRadius: 16,
                    height: 50,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.1,
                    shadowRadius: 8,
                  }}
                >
                  {validatingLocation ? (
                    <ActivityIndicator color="#2563eb" size="small" />
                  ) : (
                    <>
                      <MapPin size={18} color="#2563eb" strokeWidth={2.5} />
                      <Text className="text-blue-700 font-black ml-2 tracking-tight">
                        PUNCH IN NOW
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : !todayAttendance.check_out_time ? (
                <TouchableOpacity
                  onPress={handleCheckOutPress}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: "rgba(255,255,255,0.15)",
                    borderRadius: 16,
                    height: 50,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1.5,
                    borderColor: "rgba(255,255,255,0.4)",
                  }}
                >
                  <LogOut size={18} color="white" strokeWidth={2.5} />
                  <Text className="text-white font-black ml-2 tracking-tight">
                    PUNCH OUT
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleCheckInPress}
                  disabled={validatingLocation}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: "rgba(255,255,255,0.2)",
                    borderRadius: 16,
                    height: 50,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.3)",
                  }}
                >
                  {validatingLocation ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <>
                      <MapPin size={18} color="white" strokeWidth={2.5} />
                      <Text className="text-white font-black ml-2 tracking-tight">
                        NEW PUNCH IN
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </LinearGradient>
        </View>

        {/* History Header - Fixed */}
        <Text className="text-slate-900 dark:text-slate-50 text-base font-bold mb-3 px-5">
          History
        </Text>

        {/* History List - Only this scrolls */}
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {loading ? (
            <AttendanceHistorySkeleton />
          ) : attendanceHistory.length === 0 ? (
            <View className="items-center py-10">
              <Text className="text-slate-400">
                No attendance history found
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {attendanceHistory.map((log) => (
                <HistoryItem
                  key={log.id}
                  log={log}
                  currentTime={currentTime}
                  getDuration={getDuration}
                />
              ))}
            </View>
          )}
        </ScrollView>

        {/* Early Checkout Reason Modal */}
        {isCheckoutModalVisible && (
          <Modal
            visible={isCheckoutModalVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setIsCheckoutModalVisible(false)}
          >
            <View className="flex-1 bg-black/50 justify-center px-5">
              <View className="bg-white dark:bg-slate-900 rounded-2xl p-5">
                <View className="flex-row items-center mb-4">
                  <AlertTriangle
                    size={24}
                    color="#f59e0b"
                    style={{ marginRight: 12 }}
                  />
                  <View className="flex-1">
                    <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">
                      Early Checkout
                    </Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                      You worked {earlyCheckoutHours} hours (less than 7h).
                      Please provide a reason.
                    </Text>
                  </View>
                </View>

                <TextInput
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 h-24 text-slate-900 dark:text-slate-100 mb-4"
                  placeholder="Enter reason here..."
                  placeholderTextColor="#94a3b8"
                  multiline
                  textAlignVertical="top"
                  value={checkoutReason}
                  onChangeText={setCheckoutReason}
                />

                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => setIsCheckoutModalVisible(false)}
                    className="flex-1 py-3 items-center"
                  >
                    <Text className="text-slate-500 dark:text-slate-400 font-bold">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={submitEarlyCheckout}
                    className="flex-1 bg-red-600 rounded-xl py-3 items-center"
                  >
                    <Text className="text-white font-bold">Submit</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}

        {/* Site Selection Modal */}
        {isSiteModalVisible && (
          <Modal
            visible={isSiteModalVisible}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setIsSiteModalVisible(false)}
          >
            <View className="flex-1 bg-black/50 justify-end">
              <View className="bg-white dark:bg-slate-900 rounded-t-3xl p-5 max-h-[80%]">
                <View className="flex-row items-center justify-between mb-5">
                  <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">
                    Select Site
                  </Text>
                  <TouchableOpacity
                    onPress={() => setIsSiteModalVisible(false)}
                  >
                    <X size={24} color="#94a3b8" />
                  </TouchableOpacity>
                </View>

                <Text className="text-slate-500 dark:text-slate-400 mb-4">
                  Multiple sites are within range. Please select where you are
                  checking in.
                </Text>

                <ScrollView className="mb-4">
                  {availableSites.map((site) => (
                    <SiteItem
                      key={site.site_code}
                      site={site}
                      onSelect={performCheckIn}
                    />
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}
      </SafeAreaView>
    </View>
  );
}
