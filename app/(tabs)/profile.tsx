import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import UpdateService from "@/services/UpdateService";
import { StorageService } from "@/services/StorageService";
import { apiFetch } from "@/utils/apiHelper";
import { API_BASE_URL } from "@/constants/api";
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
  MessageSquareWarning,
  Camera,
} from "lucide-react-native";
import { router } from "expo-router";
import { useState, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { APP_VERSION_DISPLAY } from "@/constants/version";

export default function Profile() {
  const { user, signOut, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();

  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const pickAndUploadPhoto = useCallback(
    async (source: "camera" | "gallery") => {
      try {
        const permission =
          source === "camera"
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            "Permission Required",
            `Please grant ${source === "camera" ? "camera" : "gallery"} access to set a profile picture.`,
          );
          return;
        }

        const result =
          source === "camera"
            ? await ImagePicker.launchCameraAsync({
                mediaTypes: "images",
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.6,
              })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: "images",
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.6,
              });

        if (result.canceled || !result.assets?.[0]?.uri) return;

        setIsUploadingPhoto(true);
        const uri = result.assets[0].uri;
        const userKey = user?.user_id || user?.id || "unknown";
        const remotePath = `profile_photos/${userKey}/${Date.now()}.jpg`;
        const publicUrl = await StorageService.uploadFile(
          "jouleops-attachments",
          remotePath,
          uri,
        );
        if (!publicUrl) {
          Alert.alert("Upload Failed", "Could not upload the picture. Try again.");
          return;
        }

        const response = await apiFetch(
          `${API_BASE_URL}/api/auth/profile-photo`,
          {
            method: "PUT",
            body: JSON.stringify({ profile_photo_url: publicUrl }),
          },
        );
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          Alert.alert(
            "Save Failed",
            body?.error ||
              "Picture uploaded but couldn't be saved to your profile.",
          );
          return;
        }

        await refreshProfile();
      } catch (err: any) {
        Alert.alert("Error", err?.message || "Failed to update profile picture.");
      } finally {
        setIsUploadingPhoto(false);
      }
    },
    [refreshProfile, user?.id, user?.user_id],
  );

  const removePhoto = useCallback(async () => {
    try {
      setIsUploadingPhoto(true);
      const response = await apiFetch(
        `${API_BASE_URL}/api/auth/profile-photo`,
        {
          method: "PUT",
          body: JSON.stringify({ profile_photo_url: null }),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        Alert.alert(
          "Remove Failed",
          body?.error || "Couldn't remove your profile picture. Try again.",
        );
        return;
      }
      await refreshProfile();
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to remove profile picture.");
    } finally {
      setIsUploadingPhoto(false);
    }
  }, [refreshProfile]);

  const handlePhotoPress = useCallback(() => {
    if (isUploadingPhoto) return;
    const hasPhoto = !!user?.profile_photo_url;
    const buttons: Parameters<typeof Alert.alert>[2] = [
      { text: "Take Photo", onPress: () => pickAndUploadPhoto("camera") },
      { text: "Choose from Gallery", onPress: () => pickAndUploadPhoto("gallery") },
    ];
    if (hasPhoto) {
      buttons.push({
        text: "Remove Photo",
        style: "destructive",
        onPress: () =>
          Alert.alert(
            "Remove Profile Picture?",
            "Your profile picture will be removed.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Remove", style: "destructive", onPress: removePhoto },
            ],
          ),
      });
    }
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Profile Picture", "Choose an option", buttons, {
      cancelable: true,
    });
  }, [isUploadingPhoto, pickAndUploadPhoto, removePhoto, user?.profile_photo_url]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const handleLogout = useCallback(async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace("/sign-in");
    } catch (err: any) {
      Alert.alert(
        "Can't sign out yet",
        err?.message ||
          "Some of your changes haven't synced. Check your connection and try again.",
      );
    } finally {
      setIsSigningOut(false);
    }
  }, [signOut, isSigningOut]);

  const handleCheckUpdates = useCallback(async () => {
    setIsCheckingUpdates(true);
    try {
      const result = await UpdateService.checkForUpdate(false);

      if (result.status === "available") {
        setUpdateAvailable(true);
        Alert.alert(
          "Update Available",
          "A new version is available. Download and install it now?",
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
                    [{ text: "Restart", onPress: () => UpdateService.reloadApp() }],
                  );
                } else {
                  Alert.alert(
                    "Download Failed",
                    fetchRes.error ||
                      "Could not download the update. Please try again.",
                  );
                }
              },
            },
          ],
        );
      } else if (result.status === "up-to-date") {
        Alert.alert(
          "Up to Date",
          "You are using the latest version of JouleOps.",
        );
      } else if (result.status === "unsupported") {
        Alert.alert(
          "Updates Unavailable",
          "Over-the-air updates aren't available in this build. Install the latest version from the app store.",
        );
      } else {
        Alert.alert(
          "Update Check Failed",
          result.error ||
            "Could not check for updates. Check your connection and try again.",
        );
      }
    } catch (e: any) {
      Alert.alert(
        "Update Check Failed",
        e?.message || "Something went wrong while checking for updates.",
      );
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
    { icon: Shield, label: "Change Password", color: "#22c55e" },
    { icon: Settings, label: "Offline & Sync", color: "#64748b" },
    { icon: MessageSquareWarning, label: "Report an Issue", color: "#f97316" },
    {
      icon: theme === "light" ? Sun : theme === "dark" ? Moon : Monitor,
      label: "Appearance",
      color: "#8b5cf6",
      value: theme.charAt(0).toUpperCase() + theme.slice(1),
    },
    {
      icon: Info,
      label: "App Version",
      color: "#8b5cf6",
      value: APP_VERSION_DISPLAY,
    },
    {
      icon: ArrowUpCircle,
      label: "Check for Updates",
      color: "#3b82f6",
      loading: isCheckingUpdates,
      hasBadge: updateAvailable,
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
              <TouchableOpacity
                onPress={handlePhotoPress}
                disabled={isUploadingPhoto}
                activeOpacity={0.85}
                accessibilityLabel="Change profile picture"
                style={{ width: 64, height: 64 }}
              >
                {user?.profile_photo_url ? (
                  <Image
                    source={{ uri: user.profile_photo_url }}
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 32,
                    }}
                  />
                ) : (
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
                )}
                <View
                  style={{
                    position: "absolute",
                    right: -2,
                    bottom: -2,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: "#dc2626",
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 2,
                    borderColor: "white",
                  }}
                >
                  {isUploadingPhoto ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Camera size={12} color="white" />
                  )}
                </View>
              </TouchableOpacity>
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
                      {user?.created_at || user?.date_of_joining
                        ? format(
                            new Date(
                              (user.created_at ||
                                user.date_of_joining) as string,
                            ),
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
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
        >
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
                  } else if (item.label === "Change Password") {
                    router.push("/privacy-security");
                  } else if (item.label === "Offline & Sync") {
                    router.push("/app-settings");
                  } else if (item.label === "Report an Issue") {
                    router.push("/report-issue");
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
                      <Text className="text-white text-[10px] font-bold">
                        NEW
                      </Text>
                    </View>
                  )
                ) : (
                  <ChevronRight size={18} color="#94a3b8" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Sign Out */}
        <View className="px-5 mb-4">
          <TouchableOpacity
            onPress={handleLogout}
            disabled={isSigningOut}
            className="bg-red-50 rounded-2xl p-3.5 flex-row items-center justify-center"
            style={{
              shadowColor: "#ef4444",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 8,
              elevation: 2,
              opacity: isSigningOut ? 0.7 : 1,
            }}
          >
            {isSigningOut ? (
              <>
                <ActivityIndicator size="small" color="#dc2626" />
                <Text className="text-red-600 font-semibold ml-2 text-sm">
                  Syncing your changes…
                </Text>
              </>
            ) : (
              <>
                <LogOut size={18} color="#dc2626" />
                <Text className="text-red-600 font-semibold ml-2 text-sm">
                  Sign Out
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}
