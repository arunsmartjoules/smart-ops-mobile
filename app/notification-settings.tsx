import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Bell, BellOff } from "lucide-react-native";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  requestPermissions,
} from "@/services/NotificationService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/utils/logger";

export default function NotificationSettingsPage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attendanceNotificationsEnabled, setAttendanceNotificationsEnabled] =
    useState(true);
  const [hasSystemPermission, setHasSystemPermission] = useState(false);

  useEffect(() => {
    loadPreferences();
    checkSystemPermissions();
  }, []);

  const checkSystemPermissions = useCallback(async () => {
    // This doesn't request permissions, just checks current status
    const hasPermission = await requestPermissions();
    setHasSystemPermission(hasPermission);
  }, []);

  const loadPreferences = useCallback(async () => {
    try {
      setLoading(true);

      // Only attempt to fetch if token exists
      if (!token) {
        return;
      }

      const result = await getNotificationPreferences(token);

      if (result.success && result.data) {
        setAttendanceNotificationsEnabled(
          result.data.attendance_notifications_enabled ?? true
        );
      }
    } catch (error: any) {
      logger.error("Load notification preferences error", {
        module: "NOTIFICATION_SETTINGS",
        error: error.message,
      });
      // Set defaults
      setAttendanceNotificationsEnabled(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const handleToggleAttendanceNotifications = useCallback(
    async (value: boolean) => {
      if (!hasSystemPermission && value) {
        // User is trying to enable, but no system permission
        Alert.alert(
          "Permission Required",
          "Please enable notifications in your device settings first.",
          [{ text: "OK" }]
        );
        return;
      }

      // If no token, only update local state
      if (!token) {
        setAttendanceNotificationsEnabled(value);
        return;
      }

      try {
        setSaving(true);
        setAttendanceNotificationsEnabled(value);

        const result = await updateNotificationPreferences(token, {
          attendance_notifications_enabled: value,
        });

        if (!result.success) {
          logger.warn("Update notification preferences failed on server", {
            module: "NOTIFICATION_SETTINGS",
            token: token.substring(0, 10),
          });
          // Revert on failure
          setAttendanceNotificationsEnabled(!value);
          Alert.alert("Info", "Preference saved locally (backend offline)");
        }
      } catch (error: any) {
        logger.error("Update notification preferences error", {
          module: "NOTIFICATION_SETTINGS",
          error: error.message,
        });
        // Don't revert - keep the toggle state the user selected
      } finally {
        setSaving(false);
      }
    },
    [hasSystemPermission, token]
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        {/* Header */}
        <View className="px-5 pt-2 pb-3 flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-white dark:bg-slate-900 items-center justify-center mr-3"
            style={{ shadowOpacity: 0.1, shadowRadius: 5, elevation: 2 }}
          >
            <ArrowLeft size={18} color="#64748b" />
          </TouchableOpacity>
          <View>
            <Text className="text-slate-900 dark:text-slate-50 text-xl font-bold">
              Notification Settings
            </Text>
            <Text className="text-slate-400 dark:text-slate-500 text-xs">
              Manage your notification preferences
            </Text>
          </View>
        </View>

        <ScrollView
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View className="py-10 items-center">
              <ActivityIndicator size="large" color="#dc2626" />
            </View>
          ) : (
            <>
              {/* System Permission Status */}
              {!hasSystemPermission && (
                <View className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
                  <View className="flex-row items-start">
                    <BellOff
                      size={20}
                      color="#f59e0b"
                      style={{ marginRight: 12 }}
                    />
                    <View className="flex-1">
                      <Text className="text-amber-900 dark:text-amber-200 font-semibold mb-1">
                        Notifications Disabled
                      </Text>
                      <Text className="text-amber-700 dark:text-amber-300 text-sm">
                        Please enable notifications in your device settings to
                        receive attendance reminders.
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Attendance Notifications */}
              <View
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 mb-4"
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 8,
                  elevation: 2,
                }}
              >
                <View className="flex-row items-center mb-3">
                  <View className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/20 items-center justify-center mr-3">
                    <Bell size={20} color="#dc2626" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-900 dark:text-slate-50 font-semibold text-base">
                      Attendance Notifications
                    </Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-sm">
                      Get reminders for check-in and check-out
                    </Text>
                  </View>
                  <Switch
                    value={attendanceNotificationsEnabled}
                    onValueChange={handleToggleAttendanceNotifications}
                    disabled={saving}
                    trackColor={{ false: "#cbd5e1", true: "#fca5a5" }}
                    thumbColor={
                      attendanceNotificationsEnabled ? "#dc2626" : "#f1f5f9"
                    }
                  />
                </View>

                {attendanceNotificationsEnabled && hasSystemPermission && (
                  <View className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                    <Text className="text-slate-600 dark:text-slate-400 text-xs">
                      You'll receive notifications when:
                    </Text>
                    <Text className="text-slate-600 dark:text-slate-400 text-xs mt-1">
                      • You haven't checked in by the scheduled time
                    </Text>
                    <Text className="text-slate-600 dark:text-slate-400 text-xs">
                      • You haven't checked out by the scheduled time
                    </Text>
                  </View>
                )}
              </View>

              {/* Info Section */}
              <View className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
                <Text className="text-blue-900 dark:text-blue-200 font-semibold mb-2">
                  ℹ️ About Notifications
                </Text>
                <Text className="text-blue-700 dark:text-blue-300 text-sm">
                  Notification times are configured by your administrator. You
                  will receive reminders based on your work schedule and
                  assigned sites.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
