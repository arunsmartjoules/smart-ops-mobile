import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  ChevronLeft,
  Snowflake,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
} from "lucide-react-native";
import { SiteConfigService, TaskItem } from "@/services/SiteConfigService";
import { useAuth } from "@/contexts/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { format } from "date-fns";

export default function ChillerTaskList() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [siteId, setSiteId] = useState<string | null>(null);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const storageKey = `last_site_${user?.user_id || user?.id}`;
      const savedSiteId = await AsyncStorage.getItem(storageKey);

      if (savedSiteId) {
        setSiteId(savedSiteId);
        const chillerTasks =
          await SiteConfigService.getChillerTasks(savedSiteId);
        setTasks(chillerTasks);
      }
    } catch (error) {
      console.error("Failed to load chiller tasks", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTaskPress = (task: TaskItem) => {
    // Navigate to entry form with pre-filled Chiller ID
    router.push({
      pathname: "/log-forms/chiller-entry",
      params: { chillerId: task.id, siteId: siteId },
    });
  };

  const handleAddChiller = () => {
    // Allow adding a new chiller (e.g. "Chiller 3")
    // For now, valid hack: Navigate to form with no ID, let user type it?
    // Or explicit "New" flow.
    router.push({
      pathname: "/log-forms/chiller-entry",
      params: { siteId: siteId, isNew: "true" },
    });
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" edges={["top"]}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 items-center justify-center"
          >
            <ChevronLeft size={20} color="#0f172a" />
          </TouchableOpacity>
          <View>
            <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg text-center">
              Chiller Units
            </Text>
            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider text-center">
              {format(new Date(), "dd MMM yyyy")}
            </Text>
          </View>
          <View className="w-10" />
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#0d9488" />
          </View>
        ) : tasks.length === 0 ? (
          <View className="flex-1 items-center justify-center p-10">
            <View className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center mb-4">
              <Snowflake size={24} color="#94a3b8" />
            </View>
            <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg text-center">
              No Chillers Found
            </Text>
            <Text className="text-slate-500 text-center mt-2 mb-6">
              No data available.
            </Text>
          </View>
        ) : (
          <FlatList
            data={tasks}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 20 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => handleTaskPress(item)}
                activeOpacity={0.7}
                className="bg-white dark:bg-slate-900 rounded-xl p-4 mb-3 border border-slate-50 dark:border-slate-800 flex-row items-center"
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 2,
                  elevation: 2,
                }}
              >
                <View
                  className={`w-10 h-10 rounded-lg items-center justify-center mr-3 ${item.isCompleted ? "bg-green-50 dark:bg-green-900/20" : "bg-teal-50 dark:bg-teal-900/10"}`}
                >
                  {item.isCompleted ? (
                    <CheckCircle2 size={18} color="#16a34a" />
                  ) : (
                    <Snowflake size={18} color="#0d9488" />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-slate-900 dark:text-slate-50 font-bold text-base">
                    {item.name}
                  </Text>
                  <Text
                    className={`text-xs font-bold uppercase mt-0.5 ${item.isCompleted ? "text-green-600" : "text-amber-500"}`}
                  >
                    {item.isCompleted ? "Completed" : "Pending"}
                  </Text>
                </View>
                <ChevronRight size={18} color="#cbd5e1" />
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}
