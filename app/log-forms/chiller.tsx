import { useFocusEffect } from "expo-router";
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  ChevronLeft,
  Snowflake,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Filter,
  ArrowUpDown,
  Clock,
  Thermometer,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SiteConfigService, TaskItem } from "@/services/SiteConfigService";
import SiteLogService from "@/services/SiteLogService";
import { useAuth } from "@/contexts/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { format, isBefore } from "date-fns";

type ScheduleItem = {
  timeLabel: string;
  items: {
    chillerId: string;
    isCompleted: boolean;
    readingTime: number;
    compressorLoad?: number; // Optional: if we want to show preview data
  }[];
};

export default function ChillerTaskList() {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [siteCode, setSiteCode] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<
    "All" | "Pending" | "Completed"
  >("All");
  const [sortOrder, setSortOrder] = useState<"Desc" | "Asc">("Desc"); // Desc = Newest First

  useFocusEffect(
    useCallback(() => {
      loadSchedule();
    }, []),
  );

  const loadSchedule = async () => {
    try {
      setLoading(true);
      const storageKey = `last_site_${user?.user_id || user?.id}`;
      const savedSiteCode = await AsyncStorage.getItem(storageKey);

      if (savedSiteCode) {
        setSiteCode(savedSiteCode);

        const chillerTasks =
          await SiteConfigService.getChillerTasks(savedSiteCode);
        const chillerIds = chillerTasks.map((t) => t.id);

        if (chillerIds.length === 0) {
          setSchedule([]);
          setLoading(false);
          return;
        }

        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);

        const todaysReadings = await SiteLogService.getLogsByType(
          savedSiteCode,
          "Chiller Logs",
          { fromDate: start.getTime(), toDate: end.getTime() },
        );

        // Generate Slots
        const slots = [];
        // Generate for 24 hours first, then we sort later
        for (let i = 0; i < 24; i += 2) {
          const slotTime = new Date();
          slotTime.setHours(i, 0, 0, 0);

          const slotItems = chillerIds.map((chillerId) => {
            const found = todaysReadings.find((r: any) => {
              const rTime = new Date(r.reading_time || r.createdAt);
              const rHours = rTime.getHours();
              return r.chillerId === chillerId && rHours >= i && rHours < i + 2;
            });

            return {
              chillerId,
              isCompleted: !!found,
              readingTime: slotTime.getTime(),
            };
          });

          slots.push({
            timeLabel: `${i.toString().padStart(2, "0")}:00`,
            items: slotItems,
          });
        }
        setSchedule(slots);
      }
    } catch (error) {
      console.error("Failed to load chiller schedule", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSlotPress = (chillerId: string, readingTime: number) => {
    router.push({
      pathname: "/log-forms/chiller-entry",
      params: {
        chillerId: chillerId,
        siteCode: siteCode,
        readingTime: readingTime.toString(),
      },
    });
  };

  // --- Derived Data Logic ---

  const now = new Date();

  // Flatten for Priority Analysis
  const allItems = schedule.flatMap((s) =>
    s.items.map((i) => ({ ...i, timeLabel: s.timeLabel })),
  );

  // Missed: Time < Now (with buffer) AND Pending
  const missedItems = allItems.filter((i) => {
    const slotTime = new Date(i.readingTime);
    // Consider missed if more than 30 mins past slot start? Or just strictly past.
    // Let's say strictly past slot time for simplicity
    return isBefore(slotTime, now) && !i.isCompleted;
  });

  // Next: Top 1 upcoming (or current slot)
  const currentOrNextItems = allItems.filter((i) => {
    // Find the slot that wraps NOW (e.g., now is 10:30, slot is 10:00)
    const slotTime = new Date(i.readingTime);
    const slotEnd = new Date(i.readingTime);
    slotEnd.setHours(slotEnd.getHours() + 2);
    return now >= slotTime && now < slotEnd && !i.isCompleted;
  });
  // If no "current" active slot, find absolute next
  const upcomingItems =
    currentOrNextItems.length > 0
      ? currentOrNextItems
      : allItems.filter((i) => new Date(i.readingTime) > now && !i.isCompleted);

  // Priority List: Missed + Immediate Next (max 5 to keep UI clean)
  const priorityList = [...missedItems, ...upcomingItems]
    .sort((a, b) => a.readingTime - b.readingTime)
    .slice(0, 5);

  // --- Filter & Sort Main List ---
  let processedSchedule = [...schedule];

  // 1. Sort
  processedSchedule.sort((a, b) => {
    // Parse timeLabel "HH:mm" to compare
    const timeA = parseInt(a.timeLabel.split(":")[0]);
    const timeB = parseInt(b.timeLabel.split(":")[0]);
    return sortOrder === "Desc" ? timeB - timeA : timeA - timeB;
  });

  // 2. Filter
  const finalDisplay = processedSchedule
    .map((slot) => ({
      ...slot,
      items: slot.items.filter((item) => {
        if (filterStatus === "All") return true;
        if (filterStatus === "Pending") return !item.isCompleted;
        if (filterStatus === "Completed") return item.isCompleted;
        return true;
      }),
    }))
    .filter((slot) => slot.items.length > 0);

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" edges={["top"]}>
        {/* Header */}
        <View className="px-5 pt-2 pb-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          <View className="flex-row items-center justify-between mb-4">
            <TouchableOpacity
              onPress={() => router.back()}
              className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center"
            >
              <ChevronLeft size={20} color="#0f172a" />
            </TouchableOpacity>
            <View className="items-center">
              <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg">
                Chiller Log
              </Text>
              <Text className="text-slate-500 text-xs font-semibold">
                {format(new Date(), "EEEE, dd MMMM")}
              </Text>
            </View>
            <TouchableOpacity className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center">
              {/* Placeholder for future action or just balance */}
              <Thermometer size={18} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Filter & Sort Bar */}
          <View className="flex-row items-center justify-between">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="flex-row"
            >
              {(["All", "Pending", "Completed"] as const).map((status) => (
                <TouchableOpacity
                  key={status}
                  onPress={() => setFilterStatus(status)}
                  className={`px-4 py-2 rounded-full mr-2 ${filterStatus === status ? "bg-slate-900 dark:bg-slate-50" : "bg-slate-100 dark:bg-slate-800"}`}
                >
                  <Text
                    className={`text-xs font-bold ${filterStatus === status ? "text-white dark:text-slate-900" : "text-slate-600 dark:text-slate-400"}`}
                  >
                    {status}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              onPress={() =>
                setSortOrder((prev) => (prev === "Desc" ? "Asc" : "Desc"))
              }
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center"
            >
              <ArrowUpDown size={14} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#0d9488" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Priority Section */}
            {priorityList.length > 0 && (
              <View className="mt-5">
                <Text className="px-5 text-slate-900 dark:text-slate-50 font-bold text-base mb-3">
                  Priority Actions
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20 }}
                >
                  {priorityList.map((item, idx) => {
                    const isMissed =
                      isBefore(new Date(item.readingTime), now) &&
                      !item.isCompleted;
                    const gradientColors = isMissed
                      ? ["#ef4444", "#b91c1c"] // Red for Missed
                      : ["#3b82f6", "#1d4ed8"]; // Blue for Next/Upcoming

                    return (
                      <TouchableOpacity
                        key={`priority-${idx}-${item.chillerId}`}
                        onPress={() =>
                          handleSlotPress(item.chillerId, item.readingTime)
                        }
                        activeOpacity={0.9}
                        className="mr-3"
                      >
                        <LinearGradient
                          colors={gradientColors as any}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          className="w-40 p-4 rounded-2xl h-32 justify-between"
                          style={{
                            shadowColor: gradientColors[0],
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.3,
                            shadowRadius: 8,
                            elevation: 5,
                          }}
                        >
                          <View className="flex-row justify-between items-start">
                            <View className="bg-white/20 p-1.5 rounded-lg">
                              <Clock size={14} color="white" />
                            </View>
                            <View className="bg-white/20 px-2 py-0.5 rounded text-xs">
                              <Text className="text-white text-[10px] font-bold uppercase">
                                {isMissed ? "Overdue" : "Upcoming"}
                              </Text>
                            </View>
                          </View>

                          <View>
                            <Text className="text-white/80 text-xs font-bold mb-0.5">
                              {item.timeLabel} • {siteCode}
                            </Text>
                            <Text className="text-white font-bold text-lg leading-6">
                              {item.chillerId}
                            </Text>
                          </View>
                        </LinearGradient>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Main List */}
            <View className="px-5 pt-6">
              <Text className="text-slate-900 dark:text-slate-50 font-bold text-base mb-3">
                Schedule
              </Text>
              {finalDisplay.length === 0 ? (
                <View className="items-center justify-center p-10 bg-white dark:bg-slate-900 rounded-2xl mx-5 border border-dashed border-slate-200 dark:border-slate-800">
                  <Text className="text-slate-400 font-medium">
                    No logs found.
                  </Text>
                </View>
              ) : (
                finalDisplay.map((item) => (
                  <View key={item.timeLabel} className="mb-6">
                    <View className="flex-row items-center mb-3">
                      <Text className="text-slate-400 dark:text-slate-500 font-bold text-xs uppercase tracking-wider">
                        {item.timeLabel}
                      </Text>
                      <View className="h-[1px] bg-slate-100 dark:bg-slate-800 flex-1 ml-3" />
                    </View>

                    <View className="gap-3">
                      {item.items.map((task, idx) => (
                        <TouchableOpacity
                          key={`${item.timeLabel}-${task.chillerId}`}
                          onPress={() =>
                            handleSlotPress(task.chillerId, task.readingTime)
                          }
                          activeOpacity={0.7}
                          className="bg-white dark:bg-slate-900 rounded-2xl p-4 flex-row items-center"
                          style={{
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.03,
                            shadowRadius: 8,
                            elevation: 2,
                          }}
                        >
                          <View
                            className={`w-12 h-12 rounded-xl items-center justify-center mr-4 ${task.isCompleted ? "bg-green-50 dark:bg-green-900/20" : "bg-slate-50 dark:bg-slate-800"}`}
                          >
                            {task.isCompleted ? (
                              <CheckCircle2 size={22} color="#16a34a" />
                            ) : (
                              <Snowflake
                                size={22}
                                color={task.isCompleted ? "#16a34a" : "#94a3b8"}
                              />
                            )}
                          </View>
                          <View className="flex-1">
                            <Text className="font-bold text-base text-slate-900 dark:text-slate-50">
                              {task.chillerId}
                            </Text>
                            <Text className="text-xs text-slate-400 dark:text-slate-500 font-medium mb-1">
                              {siteCode}
                            </Text>
                            <View className="flex-row items-center mt-1">
                              <View
                                className={`w-2 h-2 rounded-full mr-2 ${task.isCompleted ? "bg-green-500" : "bg-amber-500"}`}
                              />
                              <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {task.isCompleted
                                  ? "Completed"
                                  : "Pending Entry"}
                              </Text>
                            </View>
                          </View>
                          <View className="bg-slate-50 dark:bg-slate-800 w-8 h-8 rounded-full items-center justify-center">
                            <ChevronRight size={16} color="#94a3b8" />
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
