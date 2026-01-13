import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  ListChecks,
  Wrench,
  Calendar,
  ChevronRight,
} from "lucide-react-native";

const pmTasks = [
  {
    id: 1,
    title: "Chiller Inspection - Site A",
    due: "Tomorrow",
    priority: "High",
    color: "#ef4444",
  },
  {
    id: 2,
    title: "Fire Extinguisher Check",
    due: "In 2 Days",
    priority: "Medium",
    color: "#3b82f6",
  },
  {
    id: 3,
    title: "AHU Filter Replacement",
    due: "Next Week",
    priority: "Low",
    color: "#22c55e",
  },
  {
    id: 4,
    title: "Electrical Panel Service",
    due: "In 3 Days",
    priority: "Medium",
    color: "#3b82f6",
  },
];

export default function PreventiveMaintenance() {
  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        {/* Fixed Header */}
        <View className="px-5 pt-2 pb-4">
          <Text className="text-slate-400 dark:text-slate-500 text-sm font-medium">
            Scheduled Tasks
          </Text>
          <Text className="text-slate-900 dark:text-slate-50 text-2xl font-bold mt-0.5">
            Preventive Maintenance
          </Text>
        </View>

        {/* Fixed Stats Card */}
        <View className="px-5 mb-4">
          <View
            className="rounded-3xl overflow-hidden"
            style={{
              shadowColor: "#3b82f6",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.2,
              shadowRadius: 24,
              elevation: 10,
            }}
          >
            <LinearGradient
              colors={["#3b82f6", "#1d4ed8"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="p-5"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="w-12 h-12 rounded-2xl bg-white/20 items-center justify-center mr-4">
                    <ListChecks size={24} color="white" />
                  </View>
                  <View>
                    <Text className="text-white/70 text-sm">This Week</Text>
                    <Text className="text-white text-xl font-bold">
                      3 PMs Due
                    </Text>
                  </View>
                </View>
              </View>

              <View className="flex-row mt-4 pt-4 border-t border-white/20">
                <View className="flex-1 items-center">
                  <Text className="text-white/70 text-xs">Completed</Text>
                  <Text className="text-white font-bold text-base">12</Text>
                </View>
                <View className="w-px bg-white/20" />
                <View className="flex-1 items-center">
                  <Text className="text-white/70 text-xs">Pending</Text>
                  <Text className="text-white font-bold text-base">3</Text>
                </View>
                <View className="w-px bg-white/20" />
                <View className="flex-1 items-center">
                  <Text className="text-white/70 text-xs">Overdue</Text>
                  <Text className="text-white font-bold text-base">0</Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        </View>

        {/* Scrollable Content */}
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 20 }}
          showsVerticalScrollIndicator={false}
        >
          <Text className="text-slate-900 dark:text-slate-50 text-lg font-bold mb-4">
            Upcoming Tasks
          </Text>
          <View className="gap-3">
            {pmTasks.map((task) => (
              <TouchableOpacity
                key={task.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 flex-row items-center"
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 10,
                  elevation: 2,
                }}
              >
                <View className="w-12 h-12 rounded-xl bg-blue-50 items-center justify-center mr-4">
                  <Wrench size={22} color="#3b82f6" />
                </View>
                <View className="flex-1">
                  <Text className="text-slate-900 dark:text-slate-50 font-semibold text-base">
                    {task.title}
                  </Text>
                  <View className="flex-row items-center mt-1">
                    <View
                      className="w-2 h-2 rounded-full mr-2"
                      style={{ backgroundColor: task.color }}
                    />
                    <Text className="text-slate-400 dark:text-slate-500 text-xs">
                      {task.priority} • {task.due}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={20} color="#94a3b8" />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
