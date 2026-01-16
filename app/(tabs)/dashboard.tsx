import React, { useState, useEffect } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  UserCheck,
  Ticket,
  ListChecks,
  Activity,
  Thermometer,
  User,
  ChevronRight,
  Bell,
  MapPin,
} from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import AttendanceService, {
  type AttendanceLog,
} from "@/services/AttendanceService";
import { format } from "date-fns";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { WifiOff } from "lucide-react-native";

// Quick Stats Data
const quickStats = [
  { label: "Tickets", value: "14", color: "#ef4444", icon: Ticket },
  { label: "PMs Due", value: "3", color: "#3b82f6", icon: ListChecks },
  { label: "Logs", value: "2", color: "#f59e0b", icon: Activity },
];

// Task List Data
const taskListData = [
  {
    id: 1,
    type: "Ticket",
    title: "HVAC Unit 4 Cooling Failure",
    due: "Today",
    color: "#ef4444",
    bgColor: "#fef2f2",
  },
  {
    id: 2,
    type: "PM",
    title: "Quarterly Chiller Inspection",
    due: "Tomorrow",
    color: "#3b82f6",
    bgColor: "#eff6ff",
  },
  {
    id: 3,
    type: "Log",
    title: "Submit 14:00 Chiller Log",
    due: "2:00 PM",
    color: "#f59e0b",
    bgColor: "#fffbeb",
  },
  {
    id: 4,
    type: "Ticket",
    title: "Water Leak in Boiler Room",
    due: "Now",
    color: "#ef4444",
    bgColor: "#fef2f2",
  },
  {
    id: 5,
    type: "PM",
    title: "Fire Extinguisher Check",
    due: "2 Days",
    color: "#3b82f6",
    bgColor: "#eff6ff",
  },
];

export default function Dashboard() {
  const { isConnected } = useNetworkStatus();
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const [todayAttendance, setTodayAttendance] = useState<AttendanceLog | null>(
    null
  );
  const [loadingAttendance, setLoadingAttendance] = useState(true);

  const fetchAttendance = React.useCallback(async () => {
    if (user?.id) {
      try {
        const data = await AttendanceService.getTodayAttendance(user.id);

        if (data) {
          setTodayAttendance(data);
        } else {
          // Fallback: check history
          const history = await AttendanceService.getAttendanceHistory(
            user.id,
            1,
            5
          );
          if (history.data && history.data.length > 0) {
            const latest = history.data[0];
            const istDate = new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Kolkata",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date());

            if (latest.date === istDate) {
              setTodayAttendance(latest);
            } else {
              setTodayAttendance(null);
            }
          } else {
            setTodayAttendance(null);
          }
        }
      } catch (error) {
        console.error("Failed to fetch attendance:", error);
      } finally {
        setLoadingAttendance(false);
      }
    }
  }, [user?.id]);

  useFocusEffect(
    React.useCallback(() => {
      fetchAttendance();
    }, [fetchAttendance])
  );

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchAttendance();
    // Simulate other API calls
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, [fetchAttendance]);

  const getStatusColor = () => {
    if (!todayAttendance) return ["#64748b", "#475569"]; // Neutral gray for not checked in
    if (todayAttendance.check_out_time) return ["#16a34a", "#15803d"]; // Green for completed
    return ["#dc2626", "#991b1b"]; // Red for currently checked in
  };

  const getStatusText = () => {
    if (!todayAttendance) return "Not Checked In";
    if (todayAttendance.check_out_time) return "Shift Completed";
    return "Checked In";
  };

  const getStatusSubtext = () => {
    if (!todayAttendance) return "Tap to start shift";
    if (todayAttendance.check_out_time)
      return `Out: ${format(new Date(todayAttendance.check_out_time), "h:mm a")}`;
    return `In: ${format(new Date(todayAttendance.check_in_time!), "h:mm a")}`;
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        {/* Offline Banner */}
        {!isConnected && (
          <View className="bg-amber-500 py-1.5 px-4 flex-row items-center justify-center">
            <WifiOff size={14} color="white" />
            <Text className="text-white text-xs font-bold ml-2">
              Offline Mode — Using cached data
            </Text>
          </View>
        )}

        {/* Header */}
        <View className="px-5 pt-2 pb-3">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-slate-400 dark:text-slate-500 text-sm font-medium">
                Welcome back
              </Text>
              <Text className="text-slate-900 dark:text-slate-50 text-2xl font-bold mt-0.5">
                {user?.full_name || user?.name || "Smart Ops"}
              </Text>
            </View>
            <View className="flex-row items-center gap-3">
              <TouchableOpacity
                onPress={() => router.push("/notifications")}
                className="w-10 h-10 rounded-full bg-white dark:bg-slate-900 items-center justify-center"
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.08,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                <Bell size={18} color="#64748b" />
                <View className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/profile")}>
                <LinearGradient
                  colors={["#dc2626", "#b91c1c"]}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <User size={18} color="white" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Status Card */}
        <TouchableOpacity
          className="px-5 mb-3"
          onPress={() => router.push("/attendance")}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={getStatusColor() as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="rounded-2xl p-4"
            style={{
              shadowColor: getStatusColor()[0],
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-xl bg-white/20 items-center justify-center mr-3">
                  {loadingAttendance ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <UserCheck size={20} color="white" />
                  )}
                </View>
                <View>
                  <Text className="text-white/70 text-xs uppercase font-bold tracking-wider">
                    Today's Status
                  </Text>
                  <Text className="text-white text-lg font-bold">
                    {getStatusText()}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center">
                <View className="bg-white/20 px-3 py-2 rounded-xl mr-2">
                  <Text className="text-white font-semibold text-xs">
                    {getStatusSubtext()}
                  </Text>
                </View>
                <ChevronRight size={18} color="rgba(255,255,255,0.7)" />
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Quick Stats */}
        <View className="px-5 mb-3">
          <View className="flex-row gap-2">
            {quickStats.map((stat, index) => {
              let bgClass = "bg-slate-50 dark:bg-slate-800";
              let iconColor = "#94a3b8";

              if (stat.label === "Tickets") {
                bgClass = "bg-red-50 dark:bg-red-900/20";
                iconColor = "#ef4444";
              } else if (stat.label === "PMs Due") {
                bgClass = "bg-blue-50 dark:bg-blue-900/20";
                iconColor = "#3b82f6";
              } else if (stat.label === "Logs") {
                bgClass = "bg-amber-50 dark:bg-amber-900/20";
                iconColor = "#f59e0b";
              }

              return (
                <TouchableOpacity
                  key={index}
                  className="flex-1 bg-white dark:bg-slate-900 rounded-xl p-3"
                  style={{
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05,
                    shadowRadius: 4,
                    elevation: 2,
                  }}
                >
                  <View
                    className={`w-8 h-8 rounded-lg items-center justify-center mb-2 ${bgClass}`}
                  >
                    <stat.icon size={16} color={iconColor} />
                  </View>
                  <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">
                    {stat.value}
                  </Text>
                  <Text className="text-slate-400 dark:text-slate-500 text-xs">
                    {stat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View className="px-5">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-slate-900 dark:text-slate-50 text-base font-bold">
                Pending Tasks
              </Text>
              <TouchableOpacity
                className="flex-row items-center"
                onPress={() => router.push("/all-tasks")}
              >
                <Text className="text-red-600 text-xs font-semibold mr-1">
                  View All
                </Text>
                <ChevronRight size={14} color="#dc2626" />
              </TouchableOpacity>
            </View>

            {/* Task Items */}
            <View className="gap-2">
              {taskListData.map((task) => {
                let bgClass = "bg-slate-50 dark:bg-slate-800";
                let textClass = "text-slate-600 dark:text-slate-400";
                let indicatorColor = "#94a3b8";

                if (task.type === "Ticket") {
                  bgClass = "bg-red-50 dark:bg-red-900/20";
                  textClass = "text-red-700 dark:text-red-400";
                  indicatorColor = "#ef4444";
                } else if (task.type === "PM") {
                  bgClass = "bg-blue-50 dark:bg-blue-900/20";
                  textClass = "text-blue-700 dark:text-blue-400";
                  indicatorColor = "#3b82f6";
                } else if (task.type === "Log") {
                  bgClass = "bg-amber-50 dark:bg-amber-900/20";
                  textClass = "text-amber-700 dark:text-amber-400";
                  indicatorColor = "#f59e0b";
                }

                return (
                  <TouchableOpacity
                    key={task.id}
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
                      className={`w-10 h-10 rounded-lg items-center justify-center mr-3 ${bgClass}`}
                    >
                      <View
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: indicatorColor }}
                      />
                    </View>
                    <View className="flex-1">
                      <Text
                        className="text-slate-900 dark:text-slate-50 font-semibold text-sm"
                        numberOfLines={1}
                      >
                        {task.title}
                      </Text>
                      <View className="flex-row items-center mt-0.5">
                        <View
                          className={`px-1.5 py-0.5 rounded mr-2 ${bgClass}`}
                        >
                          <Text className={`text-xs font-medium ${textClass}`}>
                            {task.type}
                          </Text>
                        </View>
                        <Text className="text-slate-400 dark:text-slate-500 text-xs">
                          Due: {task.due}
                        </Text>
                      </View>
                    </View>
                    <ChevronRight size={18} color="#94a3b8" />
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Quick Actions */}
            <Text className="text-slate-900 dark:text-slate-50 text-base font-bold mt-4 mb-3">
              Quick Actions
            </Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                className="flex-1 bg-white dark:bg-slate-900 rounded-xl p-3 flex-row items-center"
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 2,
                }}
              >
                <View className="w-8 h-8 rounded-lg bg-red-50 items-center justify-center mr-2">
                  <Thermometer size={16} color="#dc2626" />
                </View>
                <Text className="text-slate-700 dark:text-slate-300 font-semibold text-sm">
                  Log Data
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 bg-white dark:bg-slate-900 rounded-xl p-3 flex-row items-center"
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 2,
                }}
              >
                <View className="w-8 h-8 rounded-lg bg-blue-50 items-center justify-center mr-2">
                  <Ticket size={16} color="#3b82f6" />
                </View>
                <Text className="text-slate-700 dark:text-slate-300 font-semibold text-sm">
                  New Ticket
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
