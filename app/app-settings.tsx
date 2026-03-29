import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Switch,
  Alert,
} from "react-native";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import syncEngine from "@/services/SyncEngine";
import cacheManager from "@/services/CacheManager";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Database,
  CheckCircle,
  HardDrive,
  Wifi,
  WifiOff,
  Activity,
  AlertCircle,
  Layers,
  Zap,
  Ticket,
  Trash2,
} from "lucide-react-native";
import { router } from "expo-router";
import { openDatabaseSync } from "expo-sqlite";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import logger from "@/utils/logger";

const CACHE_PREFS_KEY = "cache_prefs";

const TABLE_DEFS = [
  { name: "tickets",            label: "Tickets",           icon: Ticket,       color: "#dc2626" },
  { name: "site_logs",          label: "Site Logs",         icon: Activity,     color: "#f97316" },
  { name: "chiller_readings",   label: "Chiller Readings",  icon: Database,     color: "#0d9488" },
  { name: "pm_instances",       label: "PM Instances",      icon: CheckCircle,  color: "#8b5cf6" },
  { name: "pm_responses",       label: "PM Responses",      icon: Layers,       color: "#6366f1" },
  { name: "attendance_logs",    label: "Attendance",        icon: HardDrive,    color: "#22c55e" },
  { name: "user_sites",         label: "User Sites",        icon: HardDrive,    color: "#64748b" },
  { name: "areas",              label: "Assets",            icon: HardDrive,    color: "#0ea5e9" },
  { name: "categories",         label: "Categories",        icon: AlertCircle,  color: "#f59e0b" },
  { name: "pm_checklist_items", label: "PM Checklists",     icon: CheckCircle,  color: "#ec4899" },
  { name: "log_master",         label: "Log Master",        icon: Database,     color: "#94a3b8" },
];

// Default all tables enabled
const defaultPrefs = () =>
  Object.fromEntries(TABLE_DEFS.map((t) => [t.name, true]));

function formatRelativeTime(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "Never";
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export async function getCachePrefs(): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFS_KEY);
    if (!raw) return defaultPrefs();
    return { ...defaultPrefs(), ...JSON.parse(raw) };
  } catch {
    return defaultPrefs();
  }
}

export async function isCacheEnabled(tableName: string): Promise<boolean> {
  const prefs = await getCachePrefs();
  return prefs[tableName] !== false;
}

export default function AppSettings() {
  const { isConnected } = useNetworkStatus();
  const { lastSyncedAt, pendingQueueCount, downloading } = useSyncStatus();
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalDbSize, setTotalDbSize] = useState(0);
  const [attachmentSize, setAttachmentSize] = useState(0);
  const [cachePrefs, setCachePrefs] = useState<Record<string, boolean>>(defaultPrefs());
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [prefs, usage] = await Promise.all([
        getCachePrefs(),
        cacheManager.getCacheUsage()
      ]);
      setCachePrefs(prefs);
      setTotalDbSize(usage.totalDbSize);
      setAttachmentSize(usage.attachmentSize);

      const sqlite = openDatabaseSync("smartops.db");
      const counts: Record<string, number> = {};
      let total = 0;
      for (const t of TABLE_DEFS) {
        try {
          const result = sqlite.getFirstSync<{ count: number }>(
            `SELECT COUNT(*) as count FROM ${t.name}`
          );
          const count = result?.count ?? 0;
          counts[t.name] = count;
          total += count;
        } catch {
          counts[t.name] = 0;
        }
      }
      setTableCounts(counts);
      setTotalRecords(total);
    } catch (err: any) {
      logger.error("Failed to load cache stats", { module: "APP_SETTINGS", error: err.message });
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

  const toggleCache = useCallback(async (tableName: string, enabled: boolean) => {
    const updated = { ...cachePrefs, [tableName]: enabled };
    setCachePrefs(updated);
    await AsyncStorage.setItem(CACHE_PREFS_KEY, JSON.stringify(updated));

    // If disabling, clear the table data
    if (!enabled) {
      try {
        const sqlite = openDatabaseSync("smartops.db");
        sqlite.runSync(`DELETE FROM ${tableName}`);
        setTableCounts((prev) => ({ ...prev, [tableName]: 0 }));
        setTotalRecords((prev) => prev - (tableCounts[tableName] ?? 0));
        logger.info(`Cache cleared for ${tableName}`, { module: "APP_SETTINGS" });
      } catch (err: any) {
        logger.error(`Failed to clear ${tableName}`, { module: "APP_SETTINGS", error: err.message });
      }
    }
  }, [cachePrefs, tableCounts]);

  const clearAll = useCallback(() => {
    Alert.alert(
      "Clear All Cache",
      "This will delete all locally cached data. You'll need to be online to reload it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            try {
              const sqlite = openDatabaseSync("smartops.db");
              for (const t of TABLE_DEFS) {
                try { sqlite.runSync(`DELETE FROM ${t.name}`); } catch {}
              }
              setTableCounts(Object.fromEntries(TABLE_DEFS.map((t) => [t.name, 0])));
              setTotalRecords(0);
              syncEngine.syncNow().catch(() => {});
            } catch (err: any) {
              logger.error("Failed to clear all cache", { module: "APP_SETTINGS", error: err.message });
            }
          },
        },
      ]
    );
  }, []);

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        {/* Header */}
        <View className="px-5 pt-2 pb-3 flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <TouchableOpacity
              onPress={() => router.back()}
              className="w-10 h-10 rounded-full bg-white dark:bg-slate-900 items-center justify-center mr-3 border border-slate-200 dark:border-slate-800"
            >
              <ArrowLeft size={18} color="#64748b" />
            </TouchableOpacity>
            <View>
              <Text className="text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
                Settings
              </Text>
              <Text className="text-slate-900 dark:text-slate-50 text-xl font-black tracking-tight">
                Offline & Cache
              </Text>
            </View>
          </View>
          <View className={`flex-row items-center px-3 py-1.5 rounded-full border ${
            isConnected !== false
              ? "bg-green-50 dark:bg-green-950/30 border-green-100 dark:border-green-900/50"
              : "bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/50"
          }`}>
            {isConnected !== false
              ? <Wifi size={13} color="#22c55e" />
              : <WifiOff size={13} color="#f59e0b" />}
            <Text className={`text-xs font-bold ml-1.5 ${
              isConnected !== false ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"
            }`}>
              {isConnected !== false ? "Online" : "Offline"}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#dc2626" />
          </View>
        ) : (
          <View className="flex-1">
            {/* Fixed Status Banner & Header */}
            <View className="px-5 mb-4">
              <View className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 flex-row items-center">
                <View className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${isConnected !== false ? "bg-green-50" : "bg-amber-50"}`}>
                  <Zap size={20} color={isConnected !== false ? "#22c55e" : "#f59e0b"} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <View className={`w-2 h-2 rounded-full mr-2 ${isConnected !== false ? "bg-green-500" : "bg-amber-500"}`} />
                    <Text className="text-slate-900 dark:text-slate-50 font-bold text-sm">
                      {isConnected !== false ? "Online — data syncing" : "Offline — using cached data"}
                    </Text>
                    {downloading && (
                      <ActivityIndicator size="small" color="#dc2626" style={{ marginLeft: 6 }} />
                    )}
                  </View>
                  <Text className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">
                    {totalRecords.toLocaleString()} records cached
                  </Text>
                  <View className="flex-row items-center gap-4 mt-1.5">
                    <View>
                      <Text className="text-slate-400 dark:text-slate-500 text-[9px] uppercase font-black tracking-widest opacity-60">
                        Database
                      </Text>
                      <Text className="text-slate-900 dark:text-slate-50 text-sm font-black">
                        {formatBytes(totalDbSize)}
                      </Text>
                    </View>
                    <View className="w-px h-6 bg-slate-200 dark:bg-slate-800" />
                    <View>
                      <Text className="text-slate-400 dark:text-slate-500 text-[9px] uppercase font-black tracking-widest opacity-60">
                        Files
                      </Text>
                      <Text className="text-slate-900 dark:text-slate-50 text-sm font-black">
                        {formatBytes(attachmentSize)}
                      </Text>
                    </View>
                    <View className="w-px h-6 bg-slate-200 dark:bg-slate-800" />
                    <View>
                      <Text className="text-slate-400 dark:text-slate-500 text-[9px] uppercase font-black tracking-widest opacity-60">
                        Total
                      </Text>
                      <Text className="text-slate-900 dark:text-slate-50 text-sm font-black">
                        {formatBytes(totalDbSize + attachmentSize)}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-slate-400 dark:text-slate-500 text-[10px] mt-2 font-bold">
                    Last synced: {formatRelativeTime(lastSyncedAt)}
                  </Text>
                  {pendingQueueCount > 0 && (
                    <View className="flex-row items-center mt-1">
                      <View className="bg-amber-100 dark:bg-amber-900/40 rounded-full px-2 py-0.5">
                        <Text className="text-amber-700 dark:text-amber-400 text-xs font-semibold">
                          {pendingQueueCount} pending {pendingQueueCount === 1 ? "change" : "changes"}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  onPress={clearAll}
                  className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/30 items-center justify-center ml-2"
                >
                  <Trash2 size={16} color="#dc2626" />
                </TouchableOpacity>
              </View>

              {/* Table List Header */}
              <View className="flex-row items-center justify-between mt-5 mb-1">
                <Text className="text-slate-900 dark:text-slate-50 font-black text-base">
                  Cached Data
                </Text>
                <Text className="text-slate-400 dark:text-slate-500 text-xs text-right">
                  Enable/Disable
                </Text>
              </View>
            </View>

            {/* Scrollable List */}
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#dc2626" />}
            >
              {TABLE_DEFS.map((t) => {
                const Icon = t.icon;
                const count = tableCounts[t.name] ?? 0;
                const enabled = cachePrefs[t.name] !== false;
                return (
                  <View
                    key={t.name}
                    className="bg-white dark:bg-slate-900 rounded-2xl mb-3 border border-slate-200 dark:border-slate-800 px-4 py-3 flex-row items-center"
                  >
                    <View className={`w-9 h-9 rounded-xl items-center justify-center mr-3 ${enabled ? "bg-slate-50 dark:bg-slate-800" : "bg-slate-100 dark:bg-slate-800/50"}`}>
                      <Icon size={18} color={enabled ? t.color : "#94a3b8"} />
                    </View>
                    <View className="flex-1">
                      <Text className={`font-semibold text-sm ${enabled ? "text-slate-900 dark:text-slate-50" : "text-slate-400 dark:text-slate-500"}`}>
                        {t.label}
                      </Text>
                      <Text className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">
                        {enabled ? `${count.toLocaleString()} records` : "Caching disabled"}
                      </Text>
                    </View>
                    <Switch
                      value={enabled}
                      onValueChange={(val) => toggleCache(t.name, val)}
                      trackColor={{ false: "#e2e8f0", true: "#fca5a5" }}
                      thumbColor={enabled ? "#dc2626" : "#94a3b8"}
                    />
                  </View>
                );
              })}

              <Text className="text-slate-400 dark:text-slate-500 text-xs text-center mt-2">
                Pull down to refresh · Disabling clears data
              </Text>
            </ScrollView>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}
