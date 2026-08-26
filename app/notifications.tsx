import React, { useState, useCallback, useMemo, memo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Bell,
  BellOff,
  CheckCheck,
  Clock,
  Ticket,
  TriangleAlert,
  Wrench,
  Trash2,
  WifiOff,
} from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import { format } from "date-fns";
import {
  dismissNotification,
  fetchNotificationFeed,
  markNotificationsRead,
  type FeedNotification,
} from "@/services/NotificationService";
import { navigateFromNotificationData } from "@/utils/notificationDeepLink";
import logger from "@/utils/logger";

const PAGE_SIZE = 30;

/**
 * A feed row, plus the absolute time derived once at fetch time.
 *
 * The server sends `age_seconds` rather than a timestamp: `sent_at` is stored
 * without a timezone, so an absolute value would skew by the server's UTC
 * offset. Anchoring the age to the device clock the moment it arrives gives a
 * stable Date to format against.
 */
type FeedItem = FeedNotification & { receivedAt: Date };

const withReceivedAt = (rows: FeedNotification[]): FeedItem[] => {
  const now = Date.now();
  return rows.map((row) => ({
    ...row,
    receivedAt: new Date(now - (Number(row.age_seconds) || 0) * 1000),
  }));
};

/**
 * Group the real `notification_type` values the backend writes into the few
 * families worth distinguishing visually. Unknown types fall through to the
 * neutral bell rather than being hidden.
 */
const familyFor = (type: string | null) => {
  const t = (type || "").toLowerCase();
  if (
    t.includes("check_in") ||
    t.includes("check_out") ||
    t.startsWith("punch") ||
    t.includes("attendance")
  ) {
    return {
      Icon: Clock,
      bg: "bg-red-50 dark:bg-red-900/20",
      color: "#dc2626",
    };
  }
  if (t.startsWith("ticket") || t.startsWith("complaint")) {
    return {
      Icon: Ticket,
      bg: "bg-orange-50 dark:bg-orange-900/20",
      color: "#f59e0b",
    };
  }
  if (t.startsWith("incident")) {
    return {
      Icon: TriangleAlert,
      bg: "bg-purple-50 dark:bg-purple-900/20",
      color: "#9333ea",
    };
  }
  if (t.includes("maintenance") || t.startsWith("pm")) {
    return {
      Icon: Wrench,
      bg: "bg-blue-50 dark:bg-blue-900/20",
      color: "#3b82f6",
    };
  }
  return { Icon: Bell, bg: "bg-slate-50 dark:bg-slate-800", color: "#64748b" };
};

const formatTimestamp = (date: Date) => {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  return format(date, "MMM d");
};

const NotificationRow = memo(function NotificationRow({
  item,
  onPress,
  onDelete,
}: {
  item: FeedItem;
  onPress: (item: FeedItem) => void;
  onDelete: (item: FeedItem) => void;
}) {
  const { Icon, bg, color } = familyFor(item.type);
  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      activeOpacity={0.8}
      className={`bg-white dark:bg-slate-900 rounded-2xl p-4 ${
        !item.read ? "border-l-4 border-red-500" : ""
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
          className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${bg}`}
        >
          <Icon size={18} color={color} />
        </View>
        <View className="flex-1 pr-4">
          <Text className="text-slate-900 dark:text-slate-50 font-bold text-sm">
            {item.title}
          </Text>
          <Text className="text-slate-600 dark:text-slate-400 text-xs mt-1">
            {item.body}
          </Text>
          <Text className="text-slate-400 dark:text-slate-500 text-xs mt-2">
            {formatTimestamp(item.receivedAt)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => onDelete(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="ml-2 p-2"
        >
          <Trash2 size={16} color="#94a3b8" />
        </TouchableOpacity>
      </View>
      {!item.read && (
        <View className="absolute top-4 right-4 w-2 h-2 bg-red-500 rounded-full" />
      )}
    </TouchableOpacity>
  );
});

export default function NotificationsPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards a focus-triggered reload from racing a pull-to-refresh.
  const inFlightRef = useRef(false);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);

    try {
      const result = await fetchNotificationFeed({
        limit: PAGE_SIZE,
      });
      if (result.success) {
        setItems(withReceivedAt(result.data));
        setUnreadCount(result.unreadCount);
        setHasMore(result.hasMore);
        setError(null);
      } else {
        setError(result.error || "Could not load notifications");
      }
    } finally {
      inFlightRef.current = false;
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  // Reload on every focus so the list reflects pushes that landed while the
  // user was elsewhere in the app.
  useFocusEffect(
    useCallback(() => {
      load("initial");
    }, [load]),
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchNotificationFeed({
        limit: PAGE_SIZE,
        offset: items.length,
      });
      if (result.success) {
        setItems((prev) => [...prev, ...withReceivedAt(result.data)]);
        setHasMore(result.hasMore);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, items.length, loadingMore]);

  /**
   * Tapping a row marks it read and, when the stored push payload says where
   * it points, navigates there — same destination as tapping the push itself.
   * The read flip is optimistic: the row is already open on screen, so a
   * failed write should not block navigation.
   */
  const handlePress = useCallback((item: FeedItem) => {
    if (!item.read) {
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      markNotificationsRead([item.id]).then((res) => {
        if (res.success && res.unreadCount != null) {
          setUnreadCount(res.unreadCount);
        }
      });
    }
    navigateFromNotificationData(router, item.data);
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    const snapshot = items;
    const snapshotCount = unreadCount;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);

    const res = await markNotificationsRead();
    if (!res.success) {
      // Put the unread flags back rather than leaving a lie on screen.
      setItems(snapshot);
      setUnreadCount(snapshotCount);
      logger.warn("Failed to mark all notifications read", {
        module: "NOTIFICATIONS",
        error: res.error,
      });
    }
  }, [items, unreadCount]);

  const handleDelete = useCallback(
    async (item: FeedItem) => {
      const snapshot = items;
      const snapshotCount = unreadCount;
      setItems((prev) => prev.filter((n) => n.id !== item.id));
      if (!item.read) setUnreadCount((c) => Math.max(0, c - 1));

      const res = await dismissNotification(item.id);
      if (!res.success) {
        setItems(snapshot);
        setUnreadCount(snapshotCount);
        logger.warn("Failed to dismiss notification", {
          module: "NOTIFICATIONS",
          error: res.error,
        });
      }
    },
    [items, unreadCount],
  );

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => (
      <NotificationRow
        item={item}
        onPress={handlePress}
        onDelete={handleDelete}
      />
    ),
    [handleDelete, handlePress],
  );

  const listEmpty = useMemo(() => {
    if (loading) {
      return (
        <View className="py-24 items-center">
          <ActivityIndicator size="large" color="#94a3b8" />
        </View>
      );
    }
    if (error) {
      return (
        <View className="py-20 items-center px-6">
          <View className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center mb-4">
            <WifiOff size={32} color="#94a3b8" />
          </View>
          <Text className="text-slate-500 dark:text-slate-400 text-base font-semibold">
            Could not load notifications
          </Text>
          <Text className="text-slate-400 dark:text-slate-600 text-sm mt-1 text-center">
            {error}
          </Text>
          <TouchableOpacity
            onPress={() => load("refresh")}
            className="mt-5 px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100"
          >
            <Text className="text-white dark:text-slate-900 font-semibold text-sm">
              Try again
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View className="py-20 items-center">
        <View className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center mb-4">
          <BellOff size={32} color="#94a3b8" />
        </View>
        <Text className="text-slate-400 dark:text-slate-500 text-base font-medium">
          No notifications
        </Text>
        <Text className="text-slate-400 dark:text-slate-600 text-sm mt-1">
          You&apos;re all caught up!
        </Text>
      </View>
    );
  }, [error, load, loading]);

  const listFooter = useMemo(() => {
    if (!items.length) return null;
    if (loadingMore) {
      return (
        <View className="py-5 items-center">
          <ActivityIndicator size="small" color="#94a3b8" />
        </View>
      );
    }
    if (hasMore) {
      return (
        <TouchableOpacity
          onPress={loadMore}
          className="py-4 items-center"
          activeOpacity={0.7}
        >
          <Text className="text-slate-500 dark:text-slate-400 text-sm font-semibold">
            Load older
          </Text>
        </TouchableOpacity>
      );
    }
    return <View className="h-4" />;
  }, [hasMore, items.length, loadMore, loadingMore]);

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        {/* Header */}
        <View className="px-5 pt-2 pb-3 flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
              onPress={handleMarkAllRead}
              className="flex-row items-center bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-xl"
            >
              <CheckCheck size={16} color="#3b82f6" />
              <Text className="text-blue-600 dark:text-blue-400 text-xs font-semibold ml-1">
                Mark all read
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* A failed refresh on top of a populated list shouldn't blank it out —
            keep the cached rows and say the refresh failed. */}
        {error && items.length > 0 && (
          <View className="mx-5 mb-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex-row items-center">
            <WifiOff size={13} color="#b45309" />
            <Text className="text-amber-700 dark:text-amber-400 text-xs ml-2 flex-1">
              Showing older data — couldn&apos;t refresh
            </Text>
          </View>
        )}

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 24,
            gap: 8,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load("refresh")}
            />
          }
        />
      </SafeAreaView>
    </View>
  );
}
