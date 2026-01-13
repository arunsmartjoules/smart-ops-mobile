import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Activity, FileText, Plus, ChevronRight } from "lucide-react-native";

const logEntries = [
  {
    id: 1,
    title: "Temperature & RH",
    time: "Due at 2:00 PM",
    status: "pending",
  },
  {
    id: 2,
    title: "Chiller Readings",
    time: "Completed 10:30 AM",
    status: "done",
  },
  {
    id: 3,
    title: "Water Parameters",
    time: "Due at 4:00 PM",
    status: "pending",
  },
];

export default function SiteLogs() {
  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        {/* Fixed Header */}
        <View className="px-5 pt-2 pb-4">
          <Text className="text-slate-400 dark:text-slate-500 text-sm font-medium">Data Entry</Text>
          <Text className="text-slate-900 dark:text-slate-50 text-2xl font-bold mt-0.5">
            Site Logs
          </Text>
        </View>

        {/* Fixed Stats Card */}
        <View className="px-5 mb-4">
          <View
            className="rounded-3xl overflow-hidden"
            style={{
              shadowColor: "#f59e0b",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.2,
              shadowRadius: 24,
              elevation: 10,
            }}
          >
            <LinearGradient
              colors={["#f59e0b", "#d97706"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="p-5"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="w-12 h-12 rounded-2xl bg-white/20 items-center justify-center mr-4">
                    <Activity size={24} color="white" />
                  </View>
                  <View>
                    <Text className="text-white/70 text-sm">Today's Logs</Text>
                    <Text className="text-white text-xl font-bold">
                      2 Pending
                    </Text>
                  </View>
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
            Today's Entries
          </Text>
          <View className="gap-3">
            {logEntries.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 flex-row items-center"
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 10,
                  elevation: 2,
                }}
              >
                <View
                  className={`w-12 h-12 rounded-xl items-center justify-center mr-4 ${
                    entry.status === "done" ? "bg-green-50" : "bg-amber-50"
                  }`}
                >
                  <FileText
                    size={22}
                    color={entry.status === "done" ? "#22c55e" : "#f59e0b"}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-slate-900 dark:text-slate-50 font-semibold text-base">
                    {entry.title}
                  </Text>
                  <Text
                    className={`text-xs mt-1 ${
                      entry.status === "done"
                        ? "text-green-600"
                        : "text-amber-600"
                    }`}
                  >
                    {entry.time}
                  </Text>
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
