import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import UpdateService from "@/services/UpdateService";
import {
  Mail,
  User as UserIcon,
  Calendar,
  LogOut,
  ChevronRight,
  Settings,
  Bell,
  Shield,
  Moon,
  Sun,
  Monitor,
  ArrowUpCircle,
  Info,
} from "lucide-react-native";
import { router } from "expo-router";
import { useState, useCallback, useEffect } from "react";
import { format } from "date-fns";

export default function Profile() {
  const { user, signOut, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();

  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const handleLogout = useCallback(async () => {
    await signOut();
    router.replace("/sign-in");
  }, [signOut]);

  const handleCheckUpdates = useCallback(async () => {
    setIsCheckingUpdates(true);
    try {
      const result = await UpdateService.checkForUpdate(false);
      if (result.available) {
        setUpdateAvailable(true);
        Alert.alert(
          "Update Available",
          "A new version is available. Would you like to download and install it now?",
          [
            { text: "Later", style: "cancel" },
            {
              text: "Download & Install",
              onPress: async () => {
                const fetchRes = await UpdateService.fetchUpdate();
                if (fetchRes.success) {
                  Alert.alert(
                    "Success",
                    "Update installed. The app will now restart.",
                    [
                      {
                        text: "Restart",
                        onPress: () => UpdateService.reloadApp(),
                      },
                    ],
                  );
                } else {
                  Alert.alert(
                    "Error",
                    "Failed to download update. Please try again later.",
                  );
                }
              },
            },
          ],
        );
      } else {
        Alert.alert(
          "Up to Date",
          "You are using the latest version of SmartOps.",
        );
      }
    } catch (e: any) {
      Alert.alert("Error", "Failed to check for updates. " + e.message);
    } finally {
      setIsCheckingUpdates(false);
    }
  }, []);

  const handleCycleTheme = useCallback(() => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  }, [theme, setTheme]);

  const menuItems = [
    { icon: Bell, label: "Notifications", color: "#3b82f6" },
    { icon: Shield, label: "Privacy & Security", color: "#22c55e" },
    { icon: Settings, label: "Offline & Sync", color: "#64748b" },
    { 
      icon: theme === "light" ? Sun : theme === "dark" ? Moon : Monitor, 
      label: "Appearance", 
      color: "#8b5cf6", 
      value: theme.charAt(0).toUpperCase() + theme.slice(1) 
    },
    { icon: Info, label: "App Version", color: "#8b5cf6", value: "1.0.22 (Beta)" },    { 
      icon: ArrowUpCircle, 
      label: "Check for Updates", 
      color: "#3b82f6", 
      loading: isCheckingUpdates,
      hasBadge: updateAvailable 
    },
  ];

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
                        ? format(
                            new Date((user as any).created_at),
                            "MMM yyyy",
                          )
                        : "N/A"}
                    </Text>
                  </View>
                </View>
              </View>
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
                  if (item.label === "Notifications") {
                    router.push("/notification-settings");
                  } else if (item.label === "Privacy & Security") {
                    router.push("/privacy-security");
                  } else if (item.label === "Offline & Sync") {
                    router.push("/app-settings");
                  } else if (item.label === "Check for Updates") {
                    handleCheckUpdates();
                  } else if (item.label === "Appearance") {
                    handleCycleTheme();
                  }
                }}
                disabled={item.label === "App Version" || item.loading}
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
                  {item.loading ? (
                    <ActivityIndicator size="small" color={item.color} />
                  ) : (
                    <item.icon size={18} color={item.color} />
                  )}
                </View>
                <Text className="flex-1 text-slate-700 dark:text-slate-300 font-medium text-sm">
                  {item.label}
                </Text>
                
                {item.value ? (
                  <Text className="text-slate-400 dark:text-slate-500 text-xs font-bold mr-1">
                    {item.value}
                  </Text>
                ) : item.label === "Check for Updates" ? (
                  item.hasBadge && (
                    <View className="bg-red-500 px-2 py-0.5 rounded-full mr-1">
                      <Text className="text-white text-[10px] font-bold">NEW</Text>
                    </View>
                  )
                ) : (
                  <ChevronRight size={18} color="#94a3b8" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Sign Out */}
        <View className="px-5 mb-4">
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
      </SafeAreaView>
    </View>
  );
}
