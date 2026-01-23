import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import SiteLogService from "@/services/SiteLogService";
import { format } from "date-fns";

export default function SiteHistory() {
  const params = useLocalSearchParams<{
    siteId: string;
    logName: string; // "Temp RH", "Water", etc.
  }>();

  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.siteId && params.logName) {
      loadHistory();
    }
  }, [params.siteId, params.logName]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const data = await SiteLogService.getLogsByType(
        params.siteId,
        params.logName,
      );
      setLogs(data);
    } catch (error) {
      console.error("Error loading history", error);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <View className="bg-white dark:bg-slate-900 p-4 border-b border-slate-100 dark:border-slate-800">
      <View className="flex-row justify-between mb-2">
        <Text className="font-bold text-slate-900 dark:text-slate-50">
          {format(
            new Date(item.created_at || item.createdAt),
            "dd MMM yyyy, HH:mm",
          )}
        </Text>
        <Text
          className={`text-xs font-bold uppercase ${item.isSynced ? "text-green-600" : "text-amber-500"}`}
        >
          {item.isSynced ? "Synced" : "Pending"}
        </Text>
      </View>
      <View>
        {item.logName === "Temp RH" && (
          <Text className="text-slate-600 dark:text-slate-400">
            {item.taskName}: {item.temperature}°C / {item.rh}% RH
          </Text>
        )}
        {item.logName === "Water" && (
          <Text className="text-slate-600 dark:text-slate-400">
            {item.taskName}: TDS {item.tds}, pH {item.ph}, H {item.hardness}
          </Text>
        )}
        {item.logName === "Chemical Dosing" && (
          <Text className="text-slate-600 dark:text-slate-400">
            {item.taskName}: {item.chemicalDosing}
          </Text>
        )}
        {/* Fallback for others or generic remarks */}
        {item.remarks && (
          <Text className="text-slate-400 text-xs mt-1 italic">
            Note: {item.remarks}
          </Text>
        )}
        <Text className="text-slate-400 text-[10px] mt-2">
          By: {item.executorId}
        </Text>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" edges={["top"]}>
        <View className="flex-row items-center px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 items-center justify-center rounded-full bg-slate-50 dark:bg-slate-800 mr-3"
          >
            <ChevronLeft size={20} color="#0f172a" />
          </TouchableOpacity>
          <View>
            <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">
              {params.logName} History
            </Text>
            <Text className="text-xs text-slate-500">All past records</Text>
          </View>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#0d9488" />
          </View>
        ) : (
          <FlatList
            data={logs}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ListEmptyComponent={
              <View className="p-10 items-center">
                <Text className="text-slate-400">No history found.</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}
