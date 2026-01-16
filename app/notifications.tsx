import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Bell, CheckCheck, Trash2 } from "lucide-react-native";
import { router } from "expo-router";
import { format } from "date-fns";

// Mock notification data
const mockNotifications = [
  {
    id: 1,
    title: "Check-In Reminder",
    message: "Don't forget to check in for your shift at Site A",
    timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
    read: false,
    type: "attendance",
  },
  {
    id: 2,
    title: "New Ticket Assigned",
    message: "HVAC Unit 4 Cooling Failure has been assigned to you",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    read: false,
    type: "ticket",
  },
  {
    id: 3,
    title: "PM Task Due Tomorrow",
    message: "Quarterly Chiller Inspection is due tomorrow",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
    read: true,
    type: "pm",
  },
  {
    id: 4,
    title: "Check-Out Reminder",
    message: "Remember to check out at the end of your shift",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    read: true,
    type: "attendance",
  },
];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(mockNotifications);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Simulate fetching notifications
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  const markAsRead = (id: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const deleteNotification = (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "attendance":
        return { bg: "bg-red-50 dark:bg-red-900/20", color: "#dc2626" };
      case "ticket":
        return { bg: "bg-orange-50 dark:bg-orange-900/20", color: "#f59e0b" };
      case "pm":
        return { bg: "bg-blue-50 dark:bg-blue-900/20", color: "#3b82f6" };
      default:
        return { bg: "bg-slate-50 dark:bg-slate-800", color: "#64748b" };
    }
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "Yesterday";
    return format(date, "MMM d");
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        {/* Header */}
        <View className="px-5 pt-2 pb-3 flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <TouchableOpacity
              onPress={() => router.back()}
              className="w-10 h-10 rounded-full bg-white dark:bg-slate-900 items-center justify-center mr-3"
              style={{ shadowOpacity: 0.1, shadowRadius: 5, elevation: 2 }}
            >
              <ArrowLeft size={18} color="#64748b" />
            </TouchableOpacity>
            <View>
              <Text className="text-slate-900 dark:text-slate-50 text-xl font-bold">
                Notifications
              </Text>
              {unreadCount > 0 && (
                <Text className="text-slate-400 dark:text-slate-500 text-xs">
                  {unreadCount} unread
                </Text>
              )}
            </View>
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity
              onPress={markAllAsRead}
              className="flex-row items-center bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-xl"
            >
              <CheckCheck size={16} color="#3b82f6" />
              <Text className="text-blue-600 dark:text-blue-400 text-xs font-semibold ml-1">
                Mark all read
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {notifications.length === 0 ? (
            <View className="py-20 items-center">
              <View className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center mb-4">
                <Bell size={32} color="#94a3b8" />
              </View>
              <Text className="text-slate-400 dark:text-slate-500 text-base font-medium">
                No notifications
              </Text>
              <Text className="text-slate-400 dark:text-slate-600 text-sm mt-1">
                You're all caught up!
              </Text>
            </View>
          ) : (
            <View className="gap-2 pb-6">
              {notifications.map((notification) => {
                const colors = getNotificationColor(notification.type);
                return (
                  <TouchableOpacity
                    key={notification.id}
                    onPress={() => markAsRead(notification.id)}
                    className={`bg-white dark:bg-slate-900 rounded-2xl p-4 ${
                      !notification.read ? "border-l-4 border-red-500" : ""
                    }`}
                    style={{
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.05,
                      shadowRadius: 4,
                      elevation: 2,
                    }}
                  >
                    <View className="flex-row items-start">
                      <View
                        className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${colors.bg}`}
                      >
                        <Bell size={18} color={colors.color} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-slate-900 dark:text-slate-50 font-bold text-sm">
                          {notification.title}
                        </Text>
                        <Text className="text-slate-600 dark:text-slate-400 text-xs mt-1">
                          {notification.message}
                        </Text>
                        <Text className="text-slate-400 dark:text-slate-500 text-xs mt-2">
                          {formatTimestamp(notification.timestamp)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => deleteNotification(notification.id)}
                        className="ml-2 p-2"
                      >
                        <Trash2 size={16} color="#94a3b8" />
                      </TouchableOpacity>
                    </View>
                    {!notification.read && (
                      <View className="absolute top-4 right-4 w-2 h-2 bg-red-500 rounded-full" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
