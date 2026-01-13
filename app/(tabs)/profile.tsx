import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  Mail,
  User as UserIcon,
  Calendar,
  LogOut,
  ChevronRight,
  Settings,
  Bell,
  Shield,
  HelpCircle,
  Moon,
  Sun,
  Monitor,
} from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";

const menuItems = [
  { icon: Bell, label: "Notifications", color: "#3b82f6" },
  { icon: Shield, label: "Privacy & Security", color: "#22c55e" },
  { icon: Settings, label: "Offline & Sync", color: "#64748b" },
  { icon: HelpCircle, label: "Help & Support", color: "#f59e0b" },
];

export default function Profile() {
  const { user, signOut, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();

  // Refresh profile data when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      refreshProfile();
    }, [refreshProfile])
  );

  const handleLogout = async () => {
    await signOut();
    router.replace("/sign-in");
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        {/* Header */}
        <View className="px-5 pt-2 pb-3 flex-row items-center">
          <Text className="text-slate-900 dark:text-slate-50 text-3xl font-black">
            Profile
          </Text>
        </View>

        {/* Profile Card */}
        <View className="px-5 mb-4">
          <View
            className="bg-white dark:bg-slate-900 rounded-2xl p-5"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06,
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <View className="flex-row items-center">
              <LinearGradient
                colors={["#dc2626", "#b91c1c"]}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <UserIcon size={28} color="white" />
              </LinearGradient>
              <View className="ml-4 flex-1">
                <Text className="text-slate-900 dark:text-slate-50 text-lg font-bold">
                  {user?.full_name || user?.name || "Team Member"}
                </Text>
                <Text className="text-slate-400 dark:text-slate-500 text-sm">
                  {user?.designation || "Staff"}
                </Text>
                {user?.work_location_type && (
                  <View className="bg-red-50 self-start px-2 py-0.5 rounded mt-1">
                    <Text className="text-red-600 text-xs font-bold">
                      {user.work_location_type}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View className="mt-4 pt-4 border-t border-slate-100 gap-3">
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-lg bg-red-50 items-center justify-center mr-2">
                  <Mail size={14} color="#dc2626" />
                </View>
                <View className="flex-1">
                  <Text className="text-slate-400 dark:text-slate-500 text-xs">
                    Email
                  </Text>
                  <Text
                    className="text-slate-900 dark:text-slate-50 text-xs font-medium"
                    numberOfLines={1}
                  >
                    {user?.email}
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-lg bg-blue-50 items-center justify-center mr-2">
                  <Settings size={14} color="#3b82f6" />
                </View>
                <View className="flex-1">
                  <Text className="text-slate-400 dark:text-slate-500 text-xs">
                    Department
                  </Text>
                  <Text className="text-slate-900 dark:text-slate-50 text-xs font-medium">
                    {user?.department || "Operations"}
                  </Text>
                </View>

                <View className="flex-1 flex-row items-center">
                  <View className="w-8 h-8 rounded-lg bg-orange-50 items-center justify-center mr-2">
                    <Calendar size={14} color="#f59e0b" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-400 dark:text-slate-500 text-xs">
                      Joined
                    </Text>
                    <Text className="text-slate-900 dark:text-slate-50 text-xs font-medium">
                      {(user as any)?.created_at
                        ? new Date((user as any).created_at).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              year: "numeric",
                            }
                          )
                        : "N/A"}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Appearance Section */}
        <View className="px-5 mb-4">
          <View
            className="bg-white dark:bg-slate-900 rounded-2xl p-5"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06,
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <View className="flex-row items-center mb-4">
              <View className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/20 items-center justify-center">
                <Moon size={20} color="#8b5cf6" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-slate-900 dark:text-slate-50 font-bold">
                  Appearance
                </Text>
                <Text className="text-slate-400 dark:text-slate-500 text-xs">
                  Choose your preferred theme
                </Text>
              </View>
            </View>

            <View className="flex-row">
              <TouchableOpacity
                onPress={() => setTheme("light")}
                className={`flex-1 items-center justify-center py-3 rounded-l-xl border ${
                  theme === "light"
                    ? "bg-violet-50 dark:bg-violet-900/30 border-violet-200 dark:border-violet-700"
                    : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                }`}
              >
                <Sun
                  size={20}
                  color={theme === "light" ? "#8b5cf6" : "#94a3b8"}
                />
                <Text
                  className={`text-xs font-semibold mt-1 ${
                    theme === "light"
                      ? "text-violet-700 dark:text-violet-300"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  Light
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setTheme("dark")}
                className={`flex-1 items-center justify-center py-3 border-y border-r ${
                  theme === "dark"
                    ? "bg-violet-50 dark:bg-violet-900/30 border-violet-200 dark:border-violet-700"
                    : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                }`}
              >
                <Moon
                  size={20}
                  color={theme === "dark" ? "#8b5cf6" : "#94a3b8"}
                />
                <Text
                  className={`text-xs font-semibold mt-1 ${
                    theme === "dark"
                      ? "text-violet-700 dark:text-violet-300"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  Dark
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setTheme("system")}
                className={`flex-1 items-center justify-center py-3 rounded-r-xl border-y border-r ${
                  theme === "system"
                    ? "bg-violet-50 dark:bg-violet-900/30 border-violet-200 dark:border-violet-700"
                    : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                }`}
              >
                <Monitor
                  size={20}
                  color={theme === "system" ? "#8b5cf6" : "#94a3b8"}
                />
                <Text
                  className={`text-xs font-semibold mt-1 ${
                    theme === "system"
                      ? "text-violet-700 dark:text-violet-300"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  System
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Menu Items */}
        <View className="px-5 mb-4">
          <View
            className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.05,
              shadowRadius: 10,
              elevation: 2,
            }}
          >
            {menuItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => {
                  if (item.label === "Privacy & Security") {
                    router.push("/privacy-security");
                  } else if (item.label === "Offline & Sync") {
                    router.push("/app-settings");
                  }
                }}
                className={`flex-row items-center p-3.5 ${
                  index < menuItems.length - 1
                    ? "border-b border-slate-100 dark:border-slate-800"
                    : ""
                }`}
              >
                <View
                  className="w-9 h-9 rounded-xl items-center justify-center mr-3"
                  style={{ backgroundColor: item.color + "15" }}
                >
                  <item.icon size={18} color={item.color} />
                </View>
                <Text className="flex-1 text-slate-700 dark:text-slate-300 font-medium text-sm">
                  {item.label}
                </Text>
                <ChevronRight size={18} color="#94a3b8" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Sign Out */}
        <View className="px-5">
          <TouchableOpacity
            onPress={handleLogout}
            className="bg-red-50 rounded-2xl p-3.5 flex-row items-center justify-center"
            style={{
              shadowColor: "#ef4444",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <LogOut size={18} color="#dc2626" />
            <Text className="text-red-600 font-semibold ml-2 text-sm">
              Sign Out
            </Text>
          </TouchableOpacity>
        </View>

        {/* App Info - at bottom */}
        <View className="flex-1 justify-end pb-4">
          <View className="items-center">
            <Text className="text-slate-300 dark:text-slate-600 text-xs">
              Smart Ops v1.0.0
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
