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
import {
  ArrowLeft,
  Clock,
  MapPin,
  Calendar,
  LogIn,
  LogOut,
  AlertTriangle,
  Map as LucideMap,
  X,
} from "lucide-react-native";
import { router } from "expo-router";
import * as Location from "expo-location";
import { useAuth } from "@/contexts/AuthContext";
import AttendanceService, {
  type AttendanceLog,
  type Site,
  type LocationValidationResult,
} from "@/services/AttendanceService";
import logger from "@/utils/logger";
import { format, differenceInMinutes, parseISO } from "date-fns";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { WifiOff } from "lucide-react-native";

// --- Memoized Components ---

const HistoryItem = React.memo(
  ({
    log,
    getDuration,
  }: {
    log: AttendanceLog;
    getDuration: (log: AttendanceLog) => string;
  }) => {
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
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <View className="w-8 h-8 rounded-lg bg-red-50 items-center justify-center mr-2">
              <Calendar size={16} color="#dc2626" />
            </View>
            <View>
              <Text className="text-slate-900 dark:text-slate-50 font-semibold">
                {format(parseISO(log.date), "EEE, d MMM")}
              </Text>
            </View>
          </View>
          <View className="bg-slate-100 px-2 py-1 rounded-lg">
            <Text className="text-slate-600 text-xs font-medium">
              {getDuration(log)}
            </Text>
          </View>
        </View>

        <View className="gap-2">
          <View className="flex-row items-center bg-slate-50 rounded-xl p-3">
            <View className="w-8 h-8 rounded-lg bg-green-100 items-center justify-center mr-3">
              <LogIn size={16} color="#22c55e" />
            </View>
            <View className="flex-1">
              <Text className="text-slate-700 dark:text-slate-300 font-medium text-sm">
                Check In
              </Text>
              <View className="flex-row items-center mt-0.5">
                <Clock size={10} color="#94a3b8" />
                <Text className="text-slate-400 dark:text-slate-500 text-xs ml-1">
                  {format(new Date(log.check_in_time!), "h:mm a")}
                </Text>
              </View>
            </View>
          </View>

          {log.check_out_time && (
            <View className="flex-row items-center bg-slate-50 rounded-xl p-3">
              <View className="w-8 h-8 rounded-lg bg-orange-100 items-center justify-center mr-3">
                <LogOut size={16} color="#f97316" />
              </View>
              <View className="flex-1">
                <Text className="text-slate-700 dark:text-slate-300 font-medium text-sm">
                  Check Out
                </Text>
                <View className="flex-row items-center mt-0.5">
                  <Clock size={10} color="#94a3b8" />
                  <Text className="text-slate-400 dark:text-slate-500 text-xs ml-1">
                    {format(new Date(log.check_out_time), "h:mm a")}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {log.status === "Leave" && (
          <View className="mt-2 bg-red-50 p-2 rounded-lg">
            <Text className="text-red-500 text-xs text-center font-bold">
              LEAVE
            </Text>
          </View>
        )}
      </View>
    );
  },
);

const SiteItem = React.memo(
  ({ site, onSelect }: { site: Site; onSelect: (id: string) => void }) => {
    const handleSelect = useCallback(() => {
      onSelect(site.site_id);
    }, [site.site_id, onSelect]);

    return (
      <TouchableOpacity
        onPress={handleSelect}
        className="bg-slate-50 border border-slate-200 p-4 rounded-xl mb-3 flex-row items-center"
      >
        <View className="w-10 h-10 rounded-full bg-red-100 items-center justify-center mr-3">
          <LucideMap size={20} color="#dc2626" />
        </View>
        <View className="flex-1">
          <Text className="font-bold text-slate-900 dark:text-slate-50 dark:bg-slate-800">
            {site.name}
          </Text>
          <Text className="text-slate-500 text-xs">{site.address}</Text>
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

  const fetchData = React.useCallback(async () => {
    if (!user?.id) return;
    try {
      const [today, history] = await Promise.all([
        AttendanceService.getTodayAttendance(user.id),
        AttendanceService.getAttendanceHistory(user.id),
      ]);

      let finalToday = today;

      // Client-side fallback: if today check fails but history has a record for today, use it.
      if (!finalToday && history.data && history.data.length > 0) {
        const latest = history.data[0];
        const istDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

        if (latest.date === istDate) {
          finalToday = latest;
        }
      }

      setTodayAttendance(finalToday);
      setAttendanceHistory(history.data);
    } catch (error: any) {
      logger.error("Fetch attendance data error", {
        module: "ATTENDANCE_SCREEN",
        error: error.message,
        userId: user?.id,
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
    // Only request location if not WFH
    const isWFH =
      user?.work_location_type === "WHF" || user?.work_location_type === "WFH";
    if (!isWFH) {
      ensureLocation();
    }
  }, [fetchData]);

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

  // Robust location getter
  const ensureLocation =
    useCallback(async (): Promise<Location.LocationObject | null> => {
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
          const isWFH =
            user?.work_location_type === "WHF" ||
            user?.work_location_type === "WFH";
          if (!isWFH) {
            Alert.alert(
              "Permission Required",
              "Location permission is required to mark attendance. Please allow access in settings.",
              [{ text: "OK" }],
            );
          }
          return null;
        }

        // 3. Get Position
        const locationResult = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setLocation(locationResult); // Update state as well
        setLocationError(null);
        return locationResult;
      } catch (error: any) {
        console.log("Location error:", error);
        // Fallback to last known
        try {
          const lastKnown = await Location.getLastKnownPositionAsync({});
          if (lastKnown) {
            setLocation(lastKnown);
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
    }, [user?.work_location_type]);

  useEffect(() => {
    fetchData();
    // Only request location if not WFH
    const isWFH =
      user?.work_location_type === "WHF" || user?.work_location_type === "WFH";
    if (!isWFH) {
      ensureLocation();
    }
  }, [fetchData, ensureLocation]); // Updated dependency

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    // Refresh location too if not WFH
    const isWFH =
      user?.work_location_type === "WHF" || user?.work_location_type === "WFH";
    if (!isWFH) {
      try {
        let location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setLocation(location);
      } catch (e) {}
    }
    setRefreshing(false);
  }, [fetchData, user?.work_location_type]);

  const handleCheckInPress = useCallback(async () => {
    if (!isConnected) {
      Alert.alert(
        "Internet Required",
        "An active internet connection is required to check in. Please check your connection and try again.",
      );
      return;
    }

    const isWFH =
      user?.work_location_type === "WHF" || user?.work_location_type === "WFH";

    if (!location && !isWFH) {
      setValidatingLocation(true); // Show spinner immediately
      try {
        const loc = await ensureLocation();
        if (!loc) {
          setValidatingLocation(false);
          return; // ensureLocation handles alerts
        }
      } catch (e) {}
    }

    setValidatingLocation(true);
    try {
      // Re-check location state (it might have been updated by ensureLocation) or use param
      // Actually ensureLocation returns loc, so use it if available
      const locToUse = location || (await ensureLocation());

      if (!locToUse && !isWFH) {
        setValidatingLocation(false);
        return;
      }

      const validation = await AttendanceService.validateLocation(
        user!.id,
        locToUse?.coords.latitude,
        locToUse?.coords.longitude,
      );

      if (validation.isValid) {
        if (validation.isWFH) {
          // Confirm WFH check-in
          Alert.alert(
            "Work From Home",
            "You are checking in as Work From Home. Proceed?",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Check In",
                onPress: () =>
                  performCheckIn(validation.allowedSites[0]?.site_id || "WFH"),
              },
            ],
          );
        } else if (validation.allowedSites.length === 1) {
          // Auto-select the only available site
          performCheckIn(validation.allowedSites[0].site_id);
        } else {
          // Show site selection modal
          setAvailableSites(validation.allowedSites);
          setIsSiteModalVisible(true);
        }
      } else {
        const message = validation.nearestSite
          ? `You are ${validation.nearestSite.distance}m away from ${validation.nearestSite.name}. Max allowed: ${validation.nearestSite.radius || 500}m.`
          : validation.message;
        Alert.alert("Location Validaton Failed", message);
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
  }, [user, location, ensureLocation]);

  const performCheckIn = useCallback(
    async (siteId: string) => {
      if (!isConnected) {
        Alert.alert(
          "Error",
          "Internet connection lost. Please try again when online.",
        );
        return;
      }
      try {
        const res = await AttendanceService.checkIn(
          user!.id,
          siteId,
          location?.coords.latitude,
          location?.coords.longitude,
        );
        if (res.success) {
          Alert.alert("Success", "Checked in successfully!");
          setIsSiteModalVisible(false);
          fetchData();
        } else {
          Alert.alert("Failed", res.error || "Check-in failed");
        }
      } catch (error: any) {
        Alert.alert("Error", error.message);
      }
    },
    [user?.id, location, fetchData, isConnected],
  );

  const handleCheckOutPress = useCallback(async () => {
    if (!todayAttendance) return;

    if (!isConnected) {
      Alert.alert(
        "Internet Required",
        "An active internet connection is required to check out. Please check your connection and try again.",
      );
      return;
    }

    // Refresh location for checkout
    setValidatingLocation(true);
    let currentLoc = location;
    try {
      // Check if location is stale (older than 1 minute) or null
      // But safer to just ensure location again
      const freshLoc = await ensureLocation();
      if (freshLoc) {
        currentLoc = freshLoc;
      } else {
        // ensureLocation handles alerts, but if it returns null, we stop
        setValidatingLocation(false);
        return;
      }
    } catch (e) {
      // should be handled by ensureLocation
      setValidatingLocation(false);
      return;
    }

    try {
      // Try checking out without reason first to see if it's early
      const res = await AttendanceService.checkOut(
        todayAttendance.id,
        currentLoc?.coords.latitude,
        currentLoc?.coords.longitude,
      );

      if (res.success) {
        Alert.alert("Success", "Checked out successfully!");
        fetchData();
      } else if (res.isEarlyCheckout) {
        // It failed because of early checkout
        setEarlyCheckoutHours(res.hoursWorked || "0");
        setCheckoutReason("");
        setIsCheckoutModalVisible(true);
      } else {
        // Check if the error message is about reason
        if (res.error?.includes("reason") || res.isEarlyCheckout) {
          setEarlyCheckoutHours(res.hoursWorked || "0");
          setIsCheckoutModalVisible(true);
          return;
        }
        Alert.alert("Failed", res.error || "Check-out failed");
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setValidatingLocation(false);
    }
  }, [todayAttendance, location, fetchData]);

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

  // Helper to calculate duration
  const getDuration = useCallback(
    (log: AttendanceLog) => {
      const start = new Date(log.check_in_time!);
      const end = log.check_out_time
        ? new Date(log.check_out_time)
        : currentTime;

      const minutes = differenceInMinutes(end, start);
      if (minutes < 0) return "0h 0m";

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
              Viewing Offline — Internet required for Check-in/out
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

        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Today's Status Card */}
          <View
            className="mb-6 rounded-2xl overflow-hidden"
            style={{
              shadowColor: "#dc2626",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            <LinearGradient
              colors={
                todayAttendance?.check_out_time
                  ? ["#16a34a", "#15803d"] // Green for completed
                  : todayAttendance
                    ? ["#dc2626", "#991b1b"] // Red for checked in
                    : ["#64748b", "#475569"] // Gray for not started
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: 20 }}
            >
              <Text className="text-white/70 text-xs mb-1 font-bold tracking-wider">
                TODAY'S STATUS
              </Text>
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-white text-2xl font-bold">
                  {todayAttendance?.check_out_time
                    ? "Shift Completed"
                    : todayAttendance
                      ? "Checked In"
                      : "Not Checked In"}
                </Text>
                {todayAttendance && (
                  <View className="bg-white/20 px-3 py-1 rounded-full">
                    <Text className="text-white text-xs font-bold">
                      {getDuration(todayAttendance)}
                    </Text>
                  </View>
                )}
              </View>

              <View className="flex-row gap-4">
                {todayAttendance && (
                  <View className="flex-1 bg-black/10 rounded-xl p-3">
                    <View className="flex-row items-center mb-1">
                      <LogIn
                        size={14}
                        color="white"
                        style={{ marginRight: 8 }}
                      />
                      <Text className="text-white/80 text-xs">Checked In</Text>
                    </View>
                    <Text className="text-white font-mono font-bold">
                      {format(
                        new Date(todayAttendance.check_in_time!),
                        "h:mm a",
                      )}
                    </Text>
                  </View>
                )}
                {todayAttendance?.check_out_time && (
                  <View className="flex-1 bg-black/10 rounded-xl p-3">
                    <View className="flex-row items-center mb-1">
                      <LogOut
                        size={14}
                        color="white"
                        style={{ marginRight: 8 }}
                      />
                      <Text className="text-white/80 text-xs">Checked Out</Text>
                    </View>
                    <Text className="text-white font-mono font-bold">
                      {format(
                        new Date(todayAttendance.check_out_time),
                        "h:mm a",
                      )}
                    </Text>
                  </View>
                )}
              </View>

              {/* Action Button */}
              {!todayAttendance ? (
                <TouchableOpacity
                  onPress={handleCheckInPress}
                  disabled={validatingLocation}
                  className="mt-6 bg-white rounded-xl py-3 items-center flex-row justify-center"
                >
                  {validatingLocation ? (
                    <ActivityIndicator color="#dc2626" size="small" />
                  ) : (
                    <>
                      <MapPin
                        size={18}
                        color="#dc2626"
                        style={{ marginRight: 8 }}
                      />
                      <Text className="text-red-600 font-bold">
                        CHECK IN NOW
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : !todayAttendance.check_out_time ? (
                <TouchableOpacity
                  onPress={handleCheckOutPress}
                  className="mt-6 bg-white/20 border border-white/40 rounded-xl py-3 items-center flex-row justify-center"
                >
                  <LogOut size={18} color="white" style={{ marginRight: 8 }} />
                  <Text className="text-white font-bold">CHECK OUT</Text>
                </TouchableOpacity>
              ) : null}
            </LinearGradient>
          </View>

          {/* History List */}
          <Text className="text-slate-900 dark:text-slate-50 text-base font-bold mb-3">
            History
          </Text>

          {loading ? (
            <View style={{ marginTop: 32 }}>
              <ActivityIndicator size="large" color="#dc2626" />
            </View>
          ) : attendanceHistory.length === 0 ? (
            <View className="items-center py-10">
              <Text className="text-slate-400">
                No attendance history found
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {attendanceHistory.map((log) => (
                <HistoryItem key={log.id} log={log} getDuration={getDuration} />
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
                    <Text className="text-lg font-bold text-slate-900 dark:text-slate-50 dark:bg-slate-800">
                      Early Checkout
                    </Text>
                    <Text className="text-slate-500 text-sm mt-1">
                      You worked {earlyCheckoutHours} hours (less than 7h).
                      Please provide a reason.
                    </Text>
                  </View>
                </View>

                <TextInput
                  className="bg-slate-50 border border-slate-200 rounded-xl p-3 h-24 text-slate-900 mb-4"
                  placeholder="Enter reason here..."
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
                    <Text className="text-slate-500 font-bold">Cancel</Text>
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
                  <Text className="text-xl font-bold text-slate-900 dark:text-slate-50 dark:bg-slate-800">
                    Select Site
                  </Text>
                  <TouchableOpacity
                    onPress={() => setIsSiteModalVisible(false)}
                  >
                    <X size={24} color="#94a3b8" />
                  </TouchableOpacity>
                </View>

                <Text className="text-slate-500 mb-4">
                  Multiple sites are within range. Please select where you are
                  checking in.
                </Text>

                <ScrollView className="mb-4">
                  {availableSites.map((site) => (
                    <SiteItem
                      key={site.site_id}
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
