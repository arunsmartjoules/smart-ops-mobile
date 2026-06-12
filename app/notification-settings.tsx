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
import {
  ArrowLeft,
  Bell,
  BellOff,
  Info,
  Copy,
  CheckCircle,
  XCircle,
  RefreshCw,
  Lock,
} from "lucide-react-native";
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
import { formatISTDateTime } from "@/utils/istDate";
import cacheManager from "@/services/CacheManager";

// Push notifications are MANDATORY for everyone EXCEPT admins/superadmins, who
// may toggle each category from their phone. (Devices are shared and SLA alerts
// must reach the field.) Non-admins see read-only "Always On" cards.
type PrefField =
  | "attendance_notifications_enabled"
  | "ticket_notifications_enabled"
  | "incident_notifications_enabled";

const CATEGORIES: {
  key: string;
  title: string;
  subtitle: string;
  color: string;
  trackOn: string;
  field: PrefField;
}[] = [
  {
    key: "attendance",
    title: "Attendance Notifications",
    subtitle: "Check-in and check-out reminders",
    color: "#dc2626",
    trackOn: "#fca5a5",
    field: "attendance_notifications_enabled",
  },
  {
    key: "ticket",
    title: "Ticket Notifications",
    subtitle: "New tickets and SLA reminders at your site",
    color: "#f59e0b",
    trackOn: "#fed7aa",
    field: "ticket_notifications_enabled",
  },
  {
    key: "incident",
    title: "Incident Notifications",
    subtitle: "Incidents created or status changes",
    color: "#ca8a04",
    trackOn: "#fef08a",
    field: "incident_notifications_enabled",
  },
];

export default function NotificationSettingsPage() {
  const { user, token } = useAuth();
  const isAdmin =
    !!user?.is_superadmin ||
    ["admin", "superadmin"].includes((user?.role || "").toLowerCase());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [hasSystemPermission, setHasSystemPermission] = useState(false);
  // Per-category enabled flags — only meaningful (and editable) for admins.
  const [prefs, setPrefs] = useState<Record<PrefField, boolean>>({
    attendance_notifications_enabled: true,
    ticket_notifications_enabled: true,
    incident_notifications_enabled: true,
  });
  const [debugToken, setDebugToken] = useState<string | null>(null);
  const [regStatus, setRegStatus] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);

  const loadDebugInfo = useCallback(async () => {
    const t = await AsyncStorage.getItem("last_expo_push_token");
    const status = await AsyncStorage.getItem("last_push_registration_status");
    const time = await AsyncStorage.getItem("last_push_registration_time");
    const error = await AsyncStorage.getItem("last_push_registration_error");
    const pending = await cacheManager.getPendingQueueItemsByType(
      "notification_token_registration",
    );
    setDebugToken(t);
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
      // Only admins can change preferences, so only they need them loaded.
      if (!isAdmin || !token) return;
      const result = await getNotificationPreferences(token);
      if (result.success && result.data) {
        setPrefs({
          attendance_notifications_enabled:
            result.data.attendance_notifications_enabled ?? true,
          ticket_notifications_enabled:
            result.data.ticket_notifications_enabled ?? true,
          incident_notifications_enabled:
            result.data.incident_notifications_enabled ?? true,
        });
      }
    } catch (error: any) {
      logger.error("Load notification preferences error", {
        module: "NOTIFICATION_SETTINGS",
        error: error.message,
      });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, token]);

  useEffect(() => {
    loadPreferences();
    checkSystemPermissions();
    loadDebugInfo();
  }, [checkSystemPermissions, loadDebugInfo, loadPreferences]);

  const handleEnablePermission = useCallback(async () => {
    setRequesting(true);
    try {
      const granted = await requestNotificationPermissions();
      setHasSystemPermission(granted);
      if (!granted) {
        Alert.alert(
          "Permission Required",
          "Notifications are required for this app. Please enable them for JouleOps in your device settings.",
        );
      }
    } finally {
      setRequesting(false);
    }
  }, []);

  // Admin-only: toggle a single preference with optimistic update + rollback.
  const togglePreference = useCallback(
    async (field: PrefField, value: boolean) => {
      if (!hasSystemPermission && value) {
        const granted = await requestNotificationPermissions();
        setHasSystemPermission(granted);
        if (!granted) {
          Alert.alert(
            "Permission Required",
            "Enable notifications for JouleOps in your device settings.",
          );
          return;
        }
      }

      const previous = prefs[field];
      setPrefs((p) => ({ ...p, [field]: value }));
      if (!token) return;

      try {
        setSaving(true);
        const result = await updateNotificationPreferences(token, {
          [field]: value,
        });
        if (!result.success) {
          setPrefs((p) => ({ ...p, [field]: previous }));
          Alert.alert(
            "Update Failed",
            result.error || "Could not update notification preference.",
          );
        } else if (result.data) {
          setPrefs({
            attendance_notifications_enabled:
              result.data.attendance_notifications_enabled ?? value,
            ticket_notifications_enabled:
              result.data.ticket_notifications_enabled ?? value,
            incident_notifications_enabled:
              result.data.incident_notifications_enabled ?? value,
          });
        }
      } catch (error: any) {
        setPrefs((p) => ({ ...p, [field]: previous }));
        logger.error("Update notification preferences error", {
          module: "NOTIFICATION_SETTINGS",
          error: error.message,
        });
        Alert.alert(
          "Update Failed",
          error.message || "Could not update notification preference.",
        );
      } finally {
        setSaving(false);
      }
    },
    [hasSystemPermission, prefs, token],
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
              {isAdmin
                ? "Manage your notification preferences"
                : "Notifications are required and always on"}
            </Text>
          </View>
        </View>

        <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
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
                    <BellOff size={20} color="#f59e0b" style={{ marginRight: 12 }} />
                    <View className="flex-1">
                      <Text className="text-amber-900 dark:text-amber-200 font-semibold mb-1">
                        Notifications Disabled at Device Level
                      </Text>
                      <Text className="text-amber-700 dark:text-amber-300 text-sm mb-3">
                        Push notifications are required for JouleOps. Please
                        enable them to receive attendance, ticket and incident
                        alerts.
                      </Text>
                      <TouchableOpacity
                        onPress={handleEnablePermission}
                        disabled={requesting}
                        className="bg-amber-500 rounded-xl px-4 py-2.5 self-start"
                      >
                        <Text className="text-white font-semibold text-sm">
                          {requesting ? "Requesting…" : "Enable Notifications"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

              {/* Category cards — toggles for admins, "Always On" for everyone else */}
              {CATEGORIES.map((cat) => (
                <View
                  key={cat.key}
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
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: `${cat.color}1a` }}
                    >
                      <Bell size={20} color={cat.color} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-slate-900 dark:text-slate-50 font-semibold text-base">
                        {cat.title}
                      </Text>
                      <Text className="text-slate-500 dark:text-slate-400 text-sm">
                        {cat.subtitle}
                      </Text>
                    </View>
                    {isAdmin ? (
                      <Switch
                        value={prefs[cat.field]}
                        onValueChange={(v) => togglePreference(cat.field, v)}
                        disabled={saving}
                        trackColor={{ false: "#cbd5e1", true: cat.trackOn }}
                        thumbColor={prefs[cat.field] ? cat.color : "#f1f5f9"}
                      />
                    ) : (
                      <View className="flex-row items-center bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-1">
                        <Lock
                          size={11}
                          color="#64748b"
                          style={{ marginRight: 4 }}
                        />
                        <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                          Always On
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}

              {/* Info Section */}
              <View className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 mb-4">
                <Text className="text-blue-900 dark:text-blue-200 font-semibold mb-2">
                  ℹ️ About Notifications
                </Text>
                <Text className="text-blue-700 dark:text-blue-300 text-sm">
                  {isAdmin
                    ? "Timings and message content are configured by your administrator. You will receive alerts based on your assigned sites."
                    : "Notifications are mandatory and cannot be turned off in the app. Timings and message content are configured by your administrator."}
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
                        <Text
                          className="text-slate-700 dark:text-slate-300 text-[10px] flex-1 mr-2"
                          numberOfLines={1}
                        >
                          {debugToken}
                        </Text>
                        <Copy size={12} color="#64748b" />
                      </TouchableOpacity>
                    ) : (
                      <View className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                        <Text className="text-slate-400 italic text-[10px]">
                          Not generated yet
                        </Text>
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
                        {regStatus?.status === "success" ? (
                          <CheckCircle
                            size={12}
                            color="#22c55e"
                            style={{ marginRight: 6 }}
                          />
                        ) : regStatus?.status ? (
                          <XCircle
                            size={12}
                            color="#ef4444"
                            style={{ marginRight: 6 }}
                          />
                        ) : (
                          <View className="w-3 h-3 rounded-full bg-slate-300 mr-[6px]" />
                        )}
                        <Text
                          className={`text-[10px] font-bold ${
                            regStatus?.status === "success"
                              ? "text-green-600"
                              : regStatus?.status
                                ? "text-red-500"
                                : "text-slate-500"
                          }`}
                        >
                          {regStatus?.status?.toUpperCase() || "UNKNOWN"}
                        </Text>
                      </View>
                      {regStatus?.time && (
                        <Text className="text-slate-400 text-[10px]">
                          Last attempt: {formatISTDateTime(regStatus.time)}
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
