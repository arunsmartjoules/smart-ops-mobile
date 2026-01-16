import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  ChevronRight,
  Filter,
  X,
  Ticket,
  ListChecks,
  Activity,
  Calendar,
} from "lucide-react-native";
import { router } from "expo-router";

// All tasks combined
const allTasks = [
  {
    id: 1,
    type: "Ticket",
    title: "HVAC Unit 4 Cooling Failure",
    due: "Today",
    date: "2024-12-16",
    color: "#ef4444",
    bgColor: "#fef2f2",
  },
  {
    id: 2,
    type: "PM",
    title: "Quarterly Chiller Inspection",
    due: "Tomorrow",
    date: "2024-12-17",
    color: "#3b82f6",
    bgColor: "#eff6ff",
  },
  {
    id: 3,
    type: "Log",
    title: "Submit 14:00 Chiller Log",
    due: "2:00 PM",
    date: "2024-12-16",
    color: "#f59e0b",
    bgColor: "#fffbeb",
  },
  {
    id: 4,
    type: "Ticket",
    title: "Water Leak in Boiler Room",
    due: "Now",
    date: "2024-12-16",
    color: "#ef4444",
    bgColor: "#fef2f2",
  },
  {
    id: 5,
    type: "PM",
    title: "Fire Extinguisher Check",
    due: "2 Days",
    date: "2024-12-18",
    color: "#3b82f6",
    bgColor: "#eff6ff",
  },
  {
    id: 6,
    type: "Log",
    title: "Energy Meter Reading",
    due: "4:00 PM",
    date: "2024-12-16",
    color: "#f59e0b",
    bgColor: "#fffbeb",
  },
  {
    id: 7,
    type: "Ticket",
    title: "AC Not Working Room 401",
    due: "Today",
    date: "2024-12-16",
    color: "#ef4444",
    bgColor: "#fef2f2",
  },
  {
    id: 8,
    type: "PM",
    title: "AHU Filter Replacement",
    due: "Next Week",
    date: "2024-12-23",
    color: "#3b82f6",
    bgColor: "#eff6ff",
  },
  {
    id: 9,
    type: "Log",
    title: "Cooling Tower Log",
    due: "6:00 PM",
    date: "2024-12-16",
    color: "#f59e0b",
    bgColor: "#fffbeb",
  },
  {
    id: 10,
    type: "Ticket",
    title: "Lighting Issue Floor 3",
    due: "Tomorrow",
    date: "2024-12-17",
    color: "#ef4444",
    bgColor: "#fef2f2",
  },
];

const taskTypes = [
  { label: "All", value: "all", icon: Filter },
  { label: "Tickets", value: "Ticket", icon: Ticket },
  { label: "PM", value: "PM", icon: ListChecks },
  { label: "Logs", value: "Log", icon: Activity },
];

const dateFilters = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
];

interface Task {
  id: number;
  type: string;
  title: string;
  due: string;
  date: string;
  color: string;
  bgColor: string;
}

export default function AllTasks() {
  const [selectedType, setSelectedType] = useState("all");
  const [selectedDate, setSelectedDate] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Simulate API call
    setTimeout(() => {
      setRefreshing(false);
    }, 2000);
  }, []);

  const filteredTasks = useMemo(() => {
    return allTasks.filter((task) => {
      if (selectedType !== "all" && task.type !== selectedType) return false;
      if (selectedDate === "today") {
        return task.date === "2024-12-16";
      } else if (selectedDate === "week") {
        return ["2024-12-16", "2024-12-17", "2024-12-18"].includes(task.date);
      }
      return true;
    });
  }, [selectedType, selectedDate]);

  const activeFiltersCount = useMemo(
    () => (selectedType !== "all" ? 1 : 0) + (selectedDate !== "all" ? 1 : 0),
    [selectedType, selectedDate]
  );

  const handleTypeSelect = useCallback((type: string) => {
    setSelectedType(type);
  }, []);

  const handleDateSelect = useCallback((date: string) => {
    setSelectedDate(date);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSelectedType("all");
    setSelectedDate("all");
  }, []);

  const handleToggleFilters = useCallback(() => {
    setShowFilters((prev) => !prev);
  }, []);

  const keyExtractor = useCallback((item: Task) => item.id.toString(), []);

  const renderItem = useCallback(
    ({ item }: { item: Task }) => (
      <TouchableOpacity
        className="bg-white dark:bg-slate-900 rounded-xl p-3 flex-row items-center"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 2,
        }}
      >
        <View
          className="w-10 h-10 rounded-lg items-center justify-center mr-3"
          style={{ backgroundColor: item.bgColor }}
        >
          <View
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: item.color }}
          />
        </View>
        <View className="flex-1">
          <Text
            className="text-slate-900 dark:text-slate-50 font-semibold text-sm"
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <View className="flex-row items-center mt-0.5">
            <View
              className="px-1.5 py-0.5 rounded mr-2"
              style={{ backgroundColor: item.bgColor }}
            >
              <Text
                style={{ color: item.color }}
                className="text-xs font-medium"
              >
                {item.type}
              </Text>
            </View>
            <Text className="text-slate-400 dark:text-slate-500 text-xs">
              Due: {item.due}
            </Text>
          </View>
        </View>
        <ChevronRight size={18} color="#94a3b8" />
      </TouchableOpacity>
    ),
    []
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        {/* Header */}
        <View className="px-5 pt-2 pb-3 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={() => router.back()}
              className="w-10 h-10 rounded-full bg-white items-center justify-center mr-3"
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
            <View>
              <Text className="text-slate-900 dark:text-slate-50 text-xl font-bold">
                All Tasks
              </Text>
              <Text className="text-slate-400 dark:text-slate-500 text-xs">
                {filteredTasks.length} tasks
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={handleToggleFilters}
            style={{
              shadowColor: activeFiltersCount > 0 ? "#dc2626" : "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: activeFiltersCount > 0 ? 0.2 : 0.08,
              shadowRadius: 8,
              elevation: 3,
            }}
          >
            <LinearGradient
              colors={
                activeFiltersCount > 0
                  ? ["#dc2626", "#b91c1c"]
                  : ["#ffffff", "#ffffff"]
              }
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Filter
                size={18}
                color={activeFiltersCount > 0 ? "#ffffff" : "#64748b"}
              />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Filter Panel */}
        {showFilters && (
          <View className="px-5 pb-4">
            <View
              className="bg-white dark:bg-slate-900 rounded-2xl p-4"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 12,
                elevation: 3,
              }}
            >
              {/* Task Type Filter */}
              <Text className="text-slate-500 text-xs font-semibold mb-2">
                TASK TYPE
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mb-4"
              >
                <View className="flex-row gap-2">
                  {taskTypes.map((type) => (
                    <TouchableOpacity
                      key={type.value}
                      onPress={() => handleTypeSelect(type.value)}
                    >
                      {selectedType === type.value ? (
                        <LinearGradient
                          colors={["#dc2626", "#b91c1c"]}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 12,
                          }}
                        >
                          <type.icon size={14} color="#ffffff" />
                          <Text className="ml-1.5 text-sm font-medium text-white">
                            {type.label}
                          </Text>
                        </LinearGradient>
                      ) : (
                        <View className="flex-row items-center px-3 py-2 rounded-xl bg-slate-100">
                          <type.icon size={14} color="#64748b" />
                          <Text className="ml-1.5 text-sm font-medium text-slate-700">
                            {type.label}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* Date Filter */}
              <Text className="text-slate-500 text-xs font-semibold mb-2">
                DATE
              </Text>
              <View className="flex-row gap-2">
                {dateFilters.map((date) => (
                  <TouchableOpacity
                    key={date.value}
                    onPress={() => handleDateSelect(date.value)}
                  >
                    {selectedDate === date.value ? (
                      <LinearGradient
                        colors={["#dc2626", "#b91c1c"]}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 12,
                        }}
                      >
                        <Calendar size={14} color="#ffffff" />
                        <Text className="ml-1.5 text-sm font-medium text-white">
                          {date.label}
                        </Text>
                      </LinearGradient>
                    ) : (
                      <View className="flex-row items-center px-3 py-2 rounded-xl bg-slate-100">
                        <Calendar size={14} color="#64748b" />
                        <Text className="ml-1.5 text-sm font-medium text-slate-700">
                          {date.label}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Clear Filters */}
              {activeFiltersCount > 0 && (
                <TouchableOpacity
                  onPress={handleClearFilters}
                  className="flex-row items-center justify-center mt-4 py-2"
                >
                  <X size={14} color="#dc2626" />
                  <Text className="text-red-600 text-sm font-medium ml-1">
                    Clear Filters
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Task List */}
        <FlatList
          data={filteredTasks}
          keyExtractor={keyExtractor}
          refreshing={refreshing}
          onRefresh={onRefresh}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="items-center py-12">
              <Text className="text-slate-400 dark:text-slate-500 text-base">
                No tasks found
              </Text>
              <Text className="text-slate-300 text-sm mt-1">
                Try adjusting your filters
              </Text>
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
}
