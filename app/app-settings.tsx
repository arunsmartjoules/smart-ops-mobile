import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Clock,
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
} from "lucide-react-native";
import { router } from "expo-router";
import { openDatabaseSync } from "expo-sqlite";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import logger from "@/utils/logger";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TABLE_DEFS = [
  { name: "tickets", label: "Tickets", icon: Ticket, color: "#dc2626" },
  { name: "site_logs", label: "Site Logs", icon: Activity, color: "#f97316" },
  { name: "chiller_readings", label: "Chiller Readings", icon: Database, color: "#0d9488" },
  { name: "pm_instances", label: "PM Instances", icon: CheckCircle, color: "#8b5cf6" },
  { name: "pm_responses", label: "PM Responses", icon: Layers, color: "#6366f1" },
  { name: "attendance_logs", label: "Attendance", icon: HardDrive, color: "#22c55e" },
  { name: "user_sites", label: "User Sites", icon: HardDrive, color: "#64748b" },
  { name: "areas", label: "Assets", icon: HardDrive, color: "#0ea5e9" },
  { name: "categories", label: "Categories", icon: AlertCircle, color: "#f59e0b" },
  { name: "pm_checklist_items", label: "PM Checklists", icon: CheckCircle, color: "#ec4899" },
  { name: "log_master", label: "Log Master", icon: Database, color: "#94a3b8" },
];

export default function AppSettings() {
  const { isConnected } = useNetworkStatus();
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [totalRecords, setTotalRecords] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
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

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
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
          <View
            className={`flex-row items-center px-3 py-1.5 rounded-full border ${
              isConnected !== false
                ? "bg-green-50 dark:bg-green-950/30 border-green-100 dark:border-green-900/50"
                : "bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/50"
            }`}
          >
            {isConnected !== false ? (
              <Wifi size={13} color="#22c55e" />
            ) : (
              <WifiOff size={13} color="#f59e0b" />
            )}
            <Text
              className={`text-xs font-bold ml-1.5 ${
                isConnected !== false
                  ? "text-green-700 dark:text-green-400"
                  : "text-amber-700 dark:text-amber-400"
              }`}
            >
              {isConnected !== false ? "Online" : "Offline"}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#dc2626" />
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#dc2626"
              />
            }
          >
            {/* Status Banner */}
            <View className="bg-white dark:bg-slate-900 rounded-2xl p-4 mb-4 border border-slate-200 dark:border-slate-800 flex-row items-center">
              <View
                className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${
                  isConnected !== false ? "bg-green-50" : "bg-amber-50"
                }`}
              >
                <Zap size={20} color={isConnected !== false ? "#22c55e" : "#f59e0b"} />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center">
                  <View
                    className={`w-2 h-2 rounded-full mr-2 ${
                      isConnected !== false ? "bg-green-500" : "bg-amber-500"
                    }`}
                  />
                  <Text className="text-slate-900 dark:text-slate-50 font-bold text-sm">
                    {isConnected !== false
                      ? "Online — data syncing"
                      : "Offline — using cached data"}
                  </Text>
                </View>
                <Text className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">
                  {totalRecords.toLocaleString()} records cached locally
                </Text>
              </View>
            </View>

            {/* Table Cards */}
            <Text className="text-slate-900 dark:text-slate-50 font-black text-base mb-3">
              Cached Data
            </Text>
            {TABLE_DEFS.map((t) => {
              const Icon = t.icon;
              const count = tableCounts[t.name] ?? 0;
              return (
                <View
                  key={t.name}
                  className="bg-white dark:bg-slate-900 rounded-2xl mb-3 border border-slate-200 dark:border-slate-800 px-4 py-3 flex-row items-center"
                >
                  <View className="w-9 h-9 rounded-xl items-center justify-center mr-3 bg-slate-50 dark:bg-slate-800">
                    <Icon size={18} color={t.color} />
                  </View>
                  <Text className="text-slate-900 dark:text-slate-50 font-semibold flex-1">
                    {t.label}
                  </Text>
                  <Text className="text-slate-400 dark:text-slate-500 text-sm font-bold">
                    {count.toLocaleString()}
                  </Text>
                </View>
              );
            })}

            <Text className="text-slate-400 dark:text-slate-500 text-xs text-center mt-2">
              Pull down to refresh · Data cached on fetch
            </Text>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
