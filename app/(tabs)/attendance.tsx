/**
 * Attendance tab — Claude Design "JouleOps App" artboard, attendance section.
 * Presentation lives in components/attendance/AttendanceUI; this screen keeps
 * the punch logic (location validation, WFH, site picker, offline queue,
 * early-checkout reason, technician shift sign-off) and the history state.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Alert, AppState, Platform, RefreshControl, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import NetInfo from "@react-native-community/netinfo";
import { router, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import {
  AttendanceService,
  type AttendanceLog,
  type Site,
  getISTDateString,
} from "@/services/AttendanceService";
import appLogger from "@/utils/logger";
import { JoPage, ScreenTitle, useJoTheme } from "@/components/jo/ui";
import { useNavInsets } from "@/components/jo/navInsets";
import {
  AttendanceHero,
  EarlyCheckoutSheet,
  MonthCard,
  OfflineNote,
  SiteSheet,
  WeekStrip,
  type HistoryFilter,
} from "@/components/attendance/AttendanceUI";
import {
  LOCATION_FRESHNESS_MS,
  buildWeek,
  dayKind,
  durationMinutes,
  formatHm,
  formatLocationFailureMessage,
  isFlagged,
  logDateKey,
  safeTime,
} from "@/components/attendance/lib";

export default function AttendancePage() {
  const t = useJoTheme();
  const { clearance } = useNavInsets();
  const { user, refreshProfile } = useAuth();
  const {
    isPrivileged,
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
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("All");
  /** Set when fetchData throws outside the per-call catches (shown with Retry). */
  const [loadError, setLoadError] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  /** Guards the early-checkout submit against a double tap while it is in flight. */
  const [submittingEarly, setSubmittingEarly] = useState(false);
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
      setLoadError(false);
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
      setLoadError(true);
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
    if (submittingEarly) return;
    if (!checkoutReason.trim()) {
      Alert.alert("Required", "Please provide a reason for early checkout");
      return;
    }

    setSubmittingEarly(true);
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
    } finally {
      setSubmittingEarly(false);
    }
  }, [submittingEarly, todayAttendance, checkoutReason, fetchData, ensureLocationForPunch, refreshAttendanceGate, markGatePunchedOut]);

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



  // Connectivity for the offline note only — punches already queue offline
  // through AttendanceService, this just tells the user what they're seeing.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(state.isConnected === false);
    });
    return unsubscribe;
  }, []);

  // ── Derived view state ───────────────────────────────────────────────────

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
      : isPrivileged
        ? "No punch needed"
        : "Not checked in";

  const todaySite =
    todayAttendance?.site_name || todayAttendance?.site_code || null;

  const geoNote = locationError
    ? locationError
    : punchedIn
      ? `Checked in${todaySite ? ` at ${todaySite}` : ""}`
      : "You must be on site to check in";

  /** Last 7 IST calendar days, today last. */
  const week = useMemo(() => {
    const logs = todayAttendance
      ? [...attendanceHistory, todayAttendance]
      : attendanceHistory;
    return buildWeek(logs, getISTDateString(), currentTime);
  }, [attendanceHistory, todayAttendance, currentTime]);

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

  /** Kind is computed once per log, then drives filtering, summary and row tone. */
  const monthRows = useMemo(
    () =>
      monthLogs
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map((log) => ({ log, kind: dayKind(log, currentTime) })),
    [monthLogs, currentTime],
  );

  /** Artboard: "16 days · 142h 30m · 2 flagged". */
  const monthSummary = useMemo(() => {
    const worked = monthRows.filter(
      (r) => r.log.status !== "Leave" && r.log.check_in_time,
    );
    if (worked.length === 0) return "No days logged";
    const days = new Set(worked.map((r) => logDateKey(r.log) ?? r.log.id)).size;
    const total = worked.reduce(
      (sum, r) => sum + (durationMinutes(r.log, currentTime) ?? 0),
      0,
    );
    const flagged = monthRows.filter((r) => isFlagged(r.kind)).length;
    return `${days} day${days === 1 ? "" : "s"} · ${formatHm(total)} · ${flagged} flagged`;
  }, [monthRows, currentTime]);

  /** Flagged = early checkout or missed (the old Short + Missed filters); Full = full shifts. */
  const visibleRows = useMemo(() => {
    if (historyFilter === "Flagged") {
      return monthRows.filter((r) => isFlagged(r.kind));
    }
    if (historyFilter === "Full") {
      return monthRows.filter((r) => r.kind === "full");
    }
    return monthRows;
  }, [monthRows, historyFilter]);

  const hasOlder = monthIndex < months.length - 1;
  const hasNewer = monthIndex > 0;

  const emptyText =
    months.length === 0
      ? "No attendance history yet"
      : historyFilter === "All"
        ? "No days logged this month"
        : historyFilter === "Flagged"
          ? "No flagged days this month"
          : "No full shifts this month";

  return (
    <JoPage>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: clearance }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={t.muted}
            colors={[t.accent]}
          />
        }
      >
        <ScreenTitle kicker={format(new Date(), "EEE d MMM")} title="Attendance" />

        {isOffline ? <OfflineNote /> : null}

        {/* Managers, regional managers and admins never punch in — no button,
            today's status and history only. */}
        <AttendanceHero
          pillLabel={pillLabel}
          pillOn={punchedIn}
          hours={heroHours}
          mins={heroMins}
          inTime={safeTime(todayAttendance?.check_in_time, "h:mm a")}
          outTime={safeTime(todayAttendance?.check_out_time, "h:mm a")}
          punch={
            isPrivileged
              ? null
              : {
                  label: punchedIn ? "Punch out" : "Punch in",
                  icon: punchedIn ? "bx-log-out-circle" : "bx-log-in-circle",
                  onPress: punchedIn ? handleCheckOutPress : handleCheckInPress,
                  busy: validatingLocation,
                }
          }
          geoNote={geoNote}
          geoError={!!locationError}
          roleNote="Your role doesn't punch in · history only"
        />

        <WeekStrip cells={week} />

        <MonthCard
          label={monthLabel}
          summary={monthSummary}
          hasOlder={hasOlder}
          hasNewer={hasNewer}
          onOlder={() => setMonthOffset((i) => i + 1)}
          onNewer={() => setMonthOffset((i) => Math.max(0, i - 1))}
          filter={historyFilter}
          onFilter={setHistoryFilter}
          loading={loading}
          error={loadError && attendanceHistory.length === 0}
          onRetry={fetchData}
          rows={visibleRows}
          emptyText={emptyText}
          now={currentTime}
        />
      </ScrollView>

      {/* ── Early-checkout reason ── */}
      <EarlyCheckoutSheet
        visible={isCheckoutModalVisible}
        hoursWorked={earlyCheckoutHours}
        reason={checkoutReason}
        onChangeReason={setCheckoutReason}
        onCancel={() => setIsCheckoutModalVisible(false)}
        onSubmit={submitEarlyCheckout}
        busy={submittingEarly}
      />

      {/* ── Site picker ── */}
      <SiteSheet
        visible={isSiteModalVisible}
        sites={availableSites}
        onClose={() => setIsSiteModalVisible(false)}
        onSelect={(code) => performCheckIn(code)}
      />
    </JoPage>
  );
}
