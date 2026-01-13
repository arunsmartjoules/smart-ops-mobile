import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
  ScrollView,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  RefreshCw,
  Trash2,
  Cloud,
  Clock,
  Database,
  CheckCircle,
  Ticket,
  UserCheck,
  HardDrive,
  Wifi,
  WifiOff,
} from "lucide-react-native";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import {
  getSyncStatus,
  getPendingAttendance,
  clearAllOfflineData,
  clearSyncedRecords,
  syncPendingRecords,
  setAutoSyncEnabled,
  SyncStatus,
} from "@/utils/offlineStorage";
import {
  getTicketSyncStatus,
  getPendingTicketUpdates,
  clearAllOfflineTicketData,
  clearSyncedTicketUpdates,
  syncPendingTicketUpdates,
  setTicketAutoSyncEnabled,
  TicketSyncStatus,
} from "@/utils/offlineTicketStorage";
import {
  clearAllCache,
  getCacheSize,
  formatBytes,
} from "@/utils/offlineDataCache";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

const API_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || "http://192.168.31.152:3420";

export default function AppSettings() {
  const { token } = useAuth();
  const { isConnected } = useNetworkStatus();

  // Attendance sync status
  const [attendanceSyncStatus, setAttendanceSyncStatus] = useState<SyncStatus>({
    lastSynced: null,
    pendingCount: 0,
    autoSyncEnabled: true,
  });

  // Ticket sync status
  const [ticketSyncStatus, setTicketSyncStatus] = useState<TicketSyncStatus>({
    lastSynced: null,
    pendingCount: 0,
    autoSyncEnabled: true,
  });

  // Cache info
  const [cacheSize, setCacheSize] = useState({ items: 0, bytes: 0 });

  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAllStatus();
  }, []);

  const loadAllStatus = async () => {
    setIsLoading(true);
    try {
      // Load attendance status
      const attStatus = await getSyncStatus();
      const attPending = await getPendingAttendance();
      setAttendanceSyncStatus({
        ...attStatus,
        pendingCount: attPending.length,
      });

      // Load ticket status
      const ticketStatus = await getTicketSyncStatus();
      const ticketPending = await getPendingTicketUpdates();
      setTicketSyncStatus({
        ...ticketStatus,
        pendingCount: ticketPending.length,
      });

      // Load cache size
      const cache = await getCacheSize();
      setCacheSize(cache);
    } catch (error) {
      console.error("Error loading sync status:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncAll = async () => {
    if (!token) {
      Alert.alert("Error", "Please sign in to sync data");
      return;
    }

    if (!isConnected) {
      Alert.alert("Offline", "You need to be online to sync data");
      return;
    }

    setIsSyncing(true);
    try {
      // Sync attendance
      const attResult = await syncPendingRecords(token, API_URL);

      // Sync tickets
      const ticketResult = await syncPendingTicketUpdates(token, API_URL);

      await loadAllStatus();

      const totalSynced = attResult.synced + ticketResult.synced;
      const totalFailed = attResult.failed + ticketResult.failed;

      if (totalSynced > 0 || totalFailed > 0) {
        Alert.alert(
          "Sync Complete",
          `${totalSynced} record(s) synced successfully.${
            totalFailed > 0 ? ` ${totalFailed} failed.` : ""
          }`
        );
      } else {
        Alert.alert("No Data", "No pending records to sync.");
      }
    } catch (error: any) {
      Alert.alert("Sync Error", error.message || "Failed to sync data");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearAllData = async () => {
    Alert.alert(
      "Clear All Offline Data",
      "This will permanently delete ALL local data including pending records. This cannot be undone!",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            try {
              await clearAllOfflineData();
              await clearAllOfflineTicketData();
              await clearAllCache();
              await loadAllStatus();
              Alert.alert("Success", "All local data cleared");
            } catch (error) {
              Alert.alert("Error", "Failed to clear local data");
            }
          },
        },
      ]
    );
  };

  const handleToggleAutoSync = async (
    module: "attendance" | "tickets",
    enabled: boolean
  ) => {
    try {
      if (module === "attendance") {
        await setAutoSyncEnabled(enabled);
        setAttendanceSyncStatus((prev) => ({
          ...prev,
          autoSyncEnabled: enabled,
        }));
      } else {
        await setTicketAutoSyncEnabled(enabled);
        setTicketSyncStatus((prev) => ({ ...prev, autoSyncEnabled: enabled }));
      }
    } catch (error) {
      Alert.alert("Error", "Failed to update auto-sync setting");
    }
  };

  const formatLastSynced = (dateString: string | null) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const totalPending =
    attendanceSyncStatus.pendingCount + ticketSyncStatus.pendingCount;

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        {/* Header */}
        <View className="px-5 pt-2 pb-3 flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-white dark:bg-slate-900 items-center justify-center mr-4"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 8,
              elevation: 3,
            }}
          >
            <ArrowLeft size={18} color="#64748b" />
          </TouchableOpacity>
          <Text className="text-slate-900 dark:text-slate-50 text-xl font-bold flex-1">
            Offline & Sync
          </Text>
          {/* Network Status */}
          <View
            className={`flex-row items-center px-3 py-1.5 rounded-full ${isConnected ? "bg-green-100 dark:bg-green-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}
          >
            {isConnected ? (
              <Wifi size={14} color="#22c55e" />
            ) : (
              <WifiOff size={14} color="#f59e0b" />
            )}
            <Text
              className={`text-xs font-medium ml-1.5 ${isConnected ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}
            >
              {isConnected ? "Online" : "Offline"}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#dc2626" />
          </View>
        ) : (
          <ScrollView
            className="flex-1 px-5"
            showsVerticalScrollIndicator={false}
          >
            {/* Sync Overview Card */}
            <View
              className="bg-white dark:bg-slate-900 rounded-2xl p-5 mb-4"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 12,
                elevation: 3,
              }}
            >
              <View className="flex-row items-center mb-4">
                <LinearGradient
                  colors={
                    totalPending > 0
                      ? ["#dc2626", "#b91c1c"]
                      : ["#22c55e", "#16a34a"]
                  }
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <RefreshCw size={22} color="white" />
                </LinearGradient>
                <View className="ml-4 flex-1">
                  <Text className="text-slate-900 dark:text-slate-50 font-bold text-base">
                    {totalPending > 0
                      ? `${totalPending} Pending Sync`
                      : "All Synced"}
                  </Text>
                  <Text className="text-slate-400 dark:text-slate-500 text-sm">
                    {totalPending > 0
                      ? "Sync when online"
                      : "Everything is up to date"}
                  </Text>
                </View>
              </View>

              {/* Sync All Button */}
              <TouchableOpacity
                onPress={handleSyncAll}
                disabled={isSyncing || totalPending === 0 || !isConnected}
                className={`flex-row items-center justify-center py-3 rounded-xl ${
                  totalPending === 0 || !isConnected
                    ? "bg-slate-100 dark:bg-slate-800"
                    : "bg-red-50 dark:bg-red-900/20"
                }`}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color="#dc2626" />
                ) : (
                  <>
                    <RefreshCw
                      size={18}
                      color={
                        totalPending === 0 || !isConnected
                          ? "#94a3b8"
                          : "#dc2626"
                      }
                    />
                    <Text
                      className={`font-semibold ml-2 ${
                        totalPending === 0 || !isConnected
                          ? "text-slate-400"
                          : "text-red-600"
                      }`}
                    >
                      Sync All Now
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Attendance Section */}
            <View
              className="bg-white dark:bg-slate-900 rounded-2xl p-5 mb-4"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 12,
                elevation: 3,
              }}
            >
              <View className="flex-row items-center mb-4">
                <View className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 items-center justify-center">
                  <UserCheck size={20} color="#3b82f6" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-slate-900 dark:text-slate-50 font-bold">
                    Attendance
                  </Text>
                  <Text className="text-slate-400 dark:text-slate-500 text-xs">
                    Check-in & check-out records
                  </Text>
                </View>
                <View className="items-end">
                  <Text
                    className={`font-bold ${attendanceSyncStatus.pendingCount > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}
                  >
                    {attendanceSyncStatus.pendingCount}
                  </Text>
                  <Text className="text-slate-400 text-xs">pending</Text>
                </View>
              </View>

              <View className="flex-row items-center justify-between py-3 border-t border-slate-100">
                <View className="flex-row items-center">
                  <Clock size={14} color="#94a3b8" />
                  <Text className="text-slate-500 text-sm ml-2">
                    Last synced
                  </Text>
                </View>
                <Text className="text-slate-700 dark:text-slate-300 font-medium text-sm">
                  {formatLastSynced(attendanceSyncStatus.lastSynced)}
                </Text>
              </View>

              <View className="flex-row items-center justify-between py-3 border-t border-slate-100">
                <View className="flex-row items-center">
                  <Cloud size={14} color="#22c55e" />
                  <Text className="text-slate-500 text-sm ml-2">Auto-sync</Text>
                </View>
                <Switch
                  value={attendanceSyncStatus.autoSyncEnabled}
                  onValueChange={(v) => handleToggleAutoSync("attendance", v)}
                  trackColor={{ false: "#e2e8f0", true: "#bbf7d0" }}
                  thumbColor={
                    attendanceSyncStatus.autoSyncEnabled ? "#22c55e" : "#94a3b8"
                  }
                />
              </View>
            </View>

            {/* Tickets Section */}
            <View
              className="bg-white dark:bg-slate-900 rounded-2xl p-5 mb-4"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 12,
                elevation: 3,
              }}
            >
              <View className="flex-row items-center mb-4">
                <View className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/20 items-center justify-center">
                  <Ticket size={20} color="#dc2626" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-slate-900 dark:text-slate-50 font-bold">
                    Tickets
                  </Text>
                  <Text className="text-slate-400 dark:text-slate-500 text-xs">
                    Status updates & changes
                  </Text>
                </View>
                <View className="items-end">
                  <Text
                    className={`font-bold ${ticketSyncStatus.pendingCount > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}
                  >
                    {ticketSyncStatus.pendingCount}
                  </Text>
                  <Text className="text-slate-400 text-xs">pending</Text>
                </View>
              </View>

              <View className="flex-row items-center justify-between py-3 border-t border-slate-100">
                <View className="flex-row items-center">
                  <Clock size={14} color="#94a3b8" />
                  <Text className="text-slate-500 text-sm ml-2">
                    Last synced
                  </Text>
                </View>
                <Text className="text-slate-700 dark:text-slate-300 font-medium text-sm">
                  {formatLastSynced(ticketSyncStatus.lastSynced)}
                </Text>
              </View>

              <View className="flex-row items-center justify-between py-3 border-t border-slate-100">
                <View className="flex-row items-center">
                  <Cloud size={14} color="#22c55e" />
                  <Text className="text-slate-500 text-sm ml-2">Auto-sync</Text>
                </View>
                <Switch
                  value={ticketSyncStatus.autoSyncEnabled}
                  onValueChange={(v) => handleToggleAutoSync("tickets", v)}
                  trackColor={{ false: "#e2e8f0", true: "#bbf7d0" }}
                  thumbColor={
                    ticketSyncStatus.autoSyncEnabled ? "#22c55e" : "#94a3b8"
                  }
                />
              </View>
            </View>

            {/* Storage Section */}
            <View
              className="bg-white dark:bg-slate-900 rounded-2xl p-5 mb-4"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 12,
                elevation: 3,
              }}
            >
              <View className="flex-row items-center mb-4">
                <View className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 items-center justify-center">
                  <HardDrive size={20} color="#64748b" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-slate-900 dark:text-slate-50 font-bold">
                    Local Storage
                  </Text>
                  <Text className="text-slate-400 dark:text-slate-500 text-xs">
                    Cached data for offline use
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-slate-700 dark:text-slate-300 font-bold">
                    {formatBytes(cacheSize.bytes)}
                  </Text>
                  <Text className="text-slate-400 dark:text-slate-500 text-xs">
                    {cacheSize.items} items
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={handleClearAllData}
                className="flex-row items-center py-3 border-t border-slate-100 dark:border-slate-800"
              >
                <View className="w-9 h-9 rounded-xl bg-red-50 items-center justify-center">
                  <Trash2 size={18} color="#dc2626" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-red-600 dark:text-red-400 font-medium">
                    Clear All Local Data
                  </Text>
                  <Text className="text-slate-400 dark:text-slate-500 text-xs">
                    Delete all cached and pending data
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Info */}
            <View className="mt-2 mb-8 items-center px-4">
              <Text className="text-slate-400 text-xs text-center leading-5">
                This app is designed to work offline. Your attendance and ticket
                updates{"\n"}
                are saved locally and synced automatically when you're online.
              </Text>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
