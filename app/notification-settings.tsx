import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  Clipboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Bell, BellOff, Info, Copy, CheckCircle, XCircle, RefreshCw } from "lucide-react-native";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  getNotificationPermissionStatus,
  requestNotificationPermissions,
} from "@/services/NotificationService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/utils/logger";
import cacheManager from "@/services/CacheManager";

export default function NotificationSettingsPage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attendanceNotificationsEnabled, setAttendanceNotificationsEnabled] =
    useState(true);
  const [ticketNotificationsEnabled, setTicketNotificationsEnabled] =
    useState(true);
  const [incidentNotificationsEnabled, setIncidentNotificationsEnabled] =
    useState(true);
  const [hasSystemPermission, setHasSystemPermission] = useState(false);
  const [debugToken, setDebugToken] = useState<string | null>(null);
  const [regStatus, setRegStatus] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);

  const loadDebugInfo = useCallback(async () => {
    const token = await AsyncStorage.getItem("last_expo_push_token");
    const status = await AsyncStorage.getItem("last_push_registration_status");
    const time = await AsyncStorage.getItem("last_push_registration_time");
    const error = await AsyncStorage.getItem("last_push_registration_error");
    const pending = await cacheManager.getPendingQueueItemsByType(
      "notification_token_registration",
    );
    
    setDebugToken(token);
    setRegStatus({ status, time, error, pendingCount: pending.length });
  }, []);

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text);
    Alert.alert("Copied", "Token copied to clipboard");
  };

  const checkSystemPermissions = useCallback(async () => {
    const permission = await getNotificationPermissionStatus();
    setHasSystemPermission(permission.granted);
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
        setTicketNotificationsEnabled(
          result.data.ticket_notifications_enabled ?? true
        );
        setIncidentNotificationsEnabled(
          result.data.incident_notifications_enabled ?? true
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

  useEffect(() => {
    loadPreferences();
    checkSystemPermissions();
    loadDebugInfo();
  }, [checkSystemPermissions, loadDebugInfo, loadPreferences]);

  const handleToggleAttendanceNotifications = useCallback(
    async (value: boolean) => {
      if (!hasSystemPermission && value) {
        const granted = await requestNotificationPermissions();
        setHasSystemPermission(granted);
        if (!granted) {
          Alert.alert(
            "Permission Required",
            "Enable notifications to receive attendance reminders.",
            [{ text: "OK" }]
          );
          return;
        }
      }

      const previousValue = attendanceNotificationsEnabled;
      setAttendanceNotificationsEnabled(value);

      if (!token) return;

      try {
        setSaving(true);
        const result = await updateNotificationPreferences(token, {
          attendance_notifications_enabled: value,
        });

        if (!result.success) {
          setAttendanceNotificationsEnabled(previousValue);
          logger.warn("Attendance notification preference update failed", {
            module: "NOTIFICATION_SETTINGS",
            error: result.error,
          });
          Alert.alert(
            "Update Failed",
            result.error || "Could not update attendance notification preference.",
          );
        } else if (result.data) {
          setAttendanceNotificationsEnabled(
            result.data.attendance_notifications_enabled ?? value,
          );
          setTicketNotificationsEnabled(
            result.data.ticket_notifications_enabled ?? ticketNotificationsEnabled,
          );
          setIncidentNotificationsEnabled(
            result.data.incident_notifications_enabled ?? incidentNotificationsEnabled,
          );
        }
      } catch (error: any) {
        setAttendanceNotificationsEnabled(previousValue);
        logger.error("Update notification preferences error", {
          module: "NOTIFICATION_SETTINGS",
          error: error.message,
        });
        Alert.alert(
          "Update Failed",
          error.message || "Could not update attendance notification preference.",
        );
      } finally {
        setSaving(false);
      }
    },
    [attendanceNotificationsEnabled, hasSystemPermission, ticketNotificationsEnabled, incidentNotificationsEnabled, token]
  );

  const handleToggleTicketNotifications = useCallback(
    async (value: boolean) => {
      if (!hasSystemPermission && value) {
        const granted = await requestNotificationPermissions();
        setHasSystemPermission(granted);
        if (!granted) {
          Alert.alert(
            "Permission Required",
            "Enable notifications to receive ticket alerts.",
            [{ text: "OK" }]
          );
          return;
        }
      }

      const previousValue = ticketNotificationsEnabled;
      setTicketNotificationsEnabled(value);

      if (!token) return;

      try {
        setSaving(true);
        const result = await updateNotificationPreferences(token, {
          ticket_notifications_enabled: value,
        });

        if (!result.success) {
          setTicketNotificationsEnabled(previousValue);
          logger.warn("Ticket notification preference update failed", {
            module: "NOTIFICATION_SETTINGS",
            error: result.error,
          });
          Alert.alert(
            "Update Failed",
            result.error || "Could not update ticket notification preference.",
          );
        } else if (result.data) {
          setAttendanceNotificationsEnabled(
            result.data.attendance_notifications_enabled ?? attendanceNotificationsEnabled,
          );
          setTicketNotificationsEnabled(
            result.data.ticket_notifications_enabled ?? value,
          );
          setIncidentNotificationsEnabled(
            result.data.incident_notifications_enabled ?? incidentNotificationsEnabled,
          );
        }
      } catch (error: any) {
        setTicketNotificationsEnabled(previousValue);
        logger.error("Update ticket notification preferences error", {
          module: "NOTIFICATION_SETTINGS",
          error: error.message,
        });
        Alert.alert(
          "Update Failed",
          error.message || "Could not update ticket notification preference.",
        );
      } finally {
        setSaving(false);
      }
    },
    [attendanceNotificationsEnabled, hasSystemPermission, ticketNotificationsEnabled, incidentNotificationsEnabled, token]
  );

  const handleToggleIncidentNotifications = useCallback(
    async (value: boolean) => {
      if (!hasSystemPermission && value) {
        const granted = await requestNotificationPermissions();
        setHasSystemPermission(granted);
        if (!granted) {
          Alert.alert(
            "Permission Required",
            "Enable notifications to receive incident alerts.",
            [{ text: "OK" }]
          );
          return;
        }
      }

      const previousValue = incidentNotificationsEnabled;
      setIncidentNotificationsEnabled(value);
      if (!token) return;

      try {
        setSaving(true);
        const result = await updateNotificationPreferences(token, {
          incident_notifications_enabled: value,
        });
        if (!result.success) {
          setIncidentNotificationsEnabled(previousValue);
          Alert.alert(
            "Update Failed",
            result.error || "Could not update incident notification preference.",
          );
        } else if (result.data) {
          setAttendanceNotificationsEnabled(
            result.data.attendance_notifications_enabled ?? attendanceNotificationsEnabled,
          );
          setTicketNotificationsEnabled(
            result.data.ticket_notifications_enabled ?? ticketNotificationsEnabled,
          );
          setIncidentNotificationsEnabled(
            result.data.incident_notifications_enabled ?? value,
          );
        }
      } catch (error: any) {
        setIncidentNotificationsEnabled(previousValue);
        Alert.alert(
          "Update Failed",
          error.message || "Could not update incident notification preference.",
        );
      } finally {
        setSaving(false);
      }
    },
    [attendanceNotificationsEnabled, hasSystemPermission, incidentNotificationsEnabled, ticketNotificationsEnabled, token]
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
                      You&apos;ll receive notifications when:
                    </Text>
                    <Text className="text-slate-600 dark:text-slate-400 text-xs mt-1">
                      • You haven&apos;t checked in by the scheduled time
                    </Text>
                    <Text className="text-slate-600 dark:text-slate-400 text-xs">
                      • You haven&apos;t checked out by the scheduled time
                    </Text>
                  </View>
                )}
              </View>

              {/* Ticket Notifications */}
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
                <View className="flex-row items-center">
                  <View className="w-10 h-10 rounded-full bg-orange-50 dark:bg-orange-900/20 items-center justify-center mr-3">
                    <Bell size={20} color="#f59e0b" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-900 dark:text-slate-50 font-semibold text-base">
                      Ticket Notifications
                    </Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-sm">
                      Get notified when a new ticket is raised at your site
                    </Text>
                  </View>
                  <Switch
                    value={ticketNotificationsEnabled}
                    onValueChange={handleToggleTicketNotifications}
                    disabled={saving}
                    trackColor={{ false: "#cbd5e1", true: "#fed7aa" }}
                    thumbColor={
                      ticketNotificationsEnabled ? "#f59e0b" : "#f1f5f9"
                    }
                  />
                </View>
              </View>

              {/* Incident Notifications */}
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
                <View className="flex-row items-center">
                  <View className="w-10 h-10 rounded-full bg-yellow-50 dark:bg-yellow-900/20 items-center justify-center mr-3">
                    <Bell size={20} color="#ca8a04" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-900 dark:text-slate-50 font-semibold text-base">
                      Incident Notifications
                    </Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-sm">
                      Get notified when incidents are created or status changes
                    </Text>
                  </View>
                  <Switch
                    value={incidentNotificationsEnabled}
                    onValueChange={handleToggleIncidentNotifications}
                    disabled={saving}
                    trackColor={{ false: "#cbd5e1", true: "#fef08a" }}
                    thumbColor={
                      incidentNotificationsEnabled ? "#ca8a04" : "#f1f5f9"
                    }
                  />
                </View>
              </View>

              {/* Info Section */}
              <View className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 mb-4">
                <Text className="text-blue-900 dark:text-blue-200 font-semibold mb-2">
                  ℹ️ About Notifications
                </Text>
                <Text className="text-blue-700 dark:text-blue-300 text-sm">
                  Notification times are configured by your administrator. You
                  will receive reminders based on your work schedule and
                  assigned sites.
                </Text>
              </View>

              {/* Debug Tools Label (Hidden toggle) */}
              <TouchableOpacity 
                onLongPress={() => setShowDebug(!showDebug)}
                className="py-4 items-center"
                activeOpacity={1}
              >
                <Text className="text-slate-300 dark:text-slate-700 text-[10px]">
                  Version 1.0.3 • Long press for diagnostics
                </Text>
              </TouchableOpacity>

              {/* Diagnostic Section */}
              {showDebug && (
                <View className="mb-8 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-row items-center">
                      <Info size={16} color="#64748b" style={{ marginRight: 8 }} />
                      <Text className="text-slate-900 dark:text-slate-50 font-bold">
                        Diagnostics
                      </Text>
                    </View>
                    <TouchableOpacity onPress={loadDebugInfo}>
                      <RefreshCw size={14} color="#64748b" />
                    </TouchableOpacity>
                  </View>

                  {/* Token Status */}
                  <View className="mb-4">
                    <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold mb-1">
                      EXPO PUSH TOKEN
                    </Text>
                    {debugToken ? (
                      <TouchableOpacity 
                        onPress={() => copyToClipboard(debugToken)}
                        className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex-row items-center justify-between"
                      >
                        <Text className="text-slate-700 dark:text-slate-300 text-[10px] flex-1 mr-2" numberOfLines={1}>
                          {debugToken}
                        </Text>
                        <Copy size={12} color="#64748b" />
                      </TouchableOpacity>
                    ) : (
                      <View className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                        <Text className="text-slate-400 italic text-[10px]">Not generated yet</Text>
                      </View>
                    )}
                  </View>

                  {/* Backend Status */}
                  <View>
                    <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold mb-1">
                      BACKEND REGISTRATION
                    </Text>
                    <View className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                      <View className="flex-row items-center mb-1">
                        {regStatus?.status === 'success' ? (
                          <CheckCircle size={12} color="#22c55e" style={{ marginRight: 6 }} />
                        ) : regStatus?.status ? (
                          <XCircle size={12} color="#ef4444" style={{ marginRight: 6 }} />
                        ) : (
                          <View className="w-3 h-3 rounded-full bg-slate-300 mr-[6px]" />
                        )}
                        <Text className={`text-[10px] font-bold ${
                          regStatus?.status === 'success' ? 'text-green-600' : 
                          regStatus?.status ? 'text-red-500' : 'text-slate-500'
                        }`}>
                          {regStatus?.status?.toUpperCase() || 'UNKNOWN'}
                        </Text>
                      </View>
                      {regStatus?.time && (
                        <Text className="text-slate-400 text-[10px]">
                          Last attempt: {new Date(regStatus.time).toLocaleString()}
                        </Text>
                      )}
                      {regStatus?.error && (
                        <Text className="text-red-400 text-[9px] mt-1 italic">
                          Error: {regStatus.error}
                        </Text>
                      )}
                      {typeof regStatus?.pendingCount === "number" &&
                        regStatus.pendingCount > 0 && (
                          <Text className="text-amber-500 text-[9px] mt-1 italic">
                            Pending retry jobs: {regStatus.pendingCount}
                          </Text>
                        )}
                    </View>
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
