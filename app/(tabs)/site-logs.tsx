import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { LogCard } from "@/components/sitelogs/LogCard";
import { useAuth } from "@/contexts/AuthContext";
import SiteLogService from "@/services/SiteLogService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Filter, Calendar } from "lucide-react-native";

const LOG_TYPES = [
  "Temp RH",
  "Water Parameters",
  "Chemical Dosing",
  "Chiller Logs",
];

const { width } = Dimensions.get("window");

export default function SiteLogs() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("Temp RH");
  const [logs, setLogs] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [siteId, setSiteId] = useState<string | null>(null);

  // Ref for the horizontal pager
  const pagerRef = useRef<FlatList>(null);
  // Ref for the tab scroll view
  const tabRef = useRef<ScrollView>(null);

  const fetchLogs = useCallback(async () => {
    try {
      if (!refreshing) setLoading(true);
      const lastSite = await AsyncStorage.getItem(`last_site_${user?.user_id}`);
      setSiteId(lastSite);

      if (lastSite) {
        // Fetch all log types in parallel for smoother swiping
        const promises = LOG_TYPES.map((type) =>
          SiteLogService.getLogsByType(lastSite, type)
        );
        const results = await Promise.all(promises);
        
        const newLogs: Record<string, any[]> = {};
        LOG_TYPES.forEach((type, index) => {
          newLogs[type] = results[index];
        });
        setLogs(newLogs);
      }
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.user_id]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLogs();
  };

  const handleTabPress = (type: string, index: number) => {
    setActiveTab(type);
    pagerRef.current?.scrollToIndex({ index, animated: true });
  };

  const handlePageScroll = (event: any) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = event.nativeEvent.contentOffset.x / slideSize;
    const roundIndex = Math.round(index);
    
    const newTab = LOG_TYPES[roundIndex];
    if (newTab && newTab !== activeTab) {
      setActiveTab(newTab);
      // Optional: Scroll tab into view if needed
    }
  };

  const renderLogItem = useCallback(
    ({ item, type }: { item: any; type: string }) => (
      <LogCard
        log={item}
        type={type}
        onPress={() =>
          router.push(`/sitelog-detail?id=${item.id}&type=${type}`)
        }
      />
    ),
    []
  );

  const renderPage = ({ item: type }: { item: string }) => {
    const typeLogs = logs[type] || [];
    
    return (
      <View style={{ width }} className="flex-1">
        <FlatList
          data={typeLogs}
          renderItem={({ item }) => renderLogItem({ item, type })}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#dc2626" />
          }
          ListEmptyComponent={
            !loading ? (
              <View className="py-20 items-center justify-center px-4">
                <View className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center mb-4">
                  <Filter size={36} color="#cbd5e1" />
                </View>
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg">
                  No logs found
                </Text>
                <Text className="text-slate-400 dark:text-slate-500 text-sm mt-1 text-center">
                  No scheduled {type} logs found.
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            loading && !refreshing ? (
              <View className="py-6">
                <ActivityIndicator color="#dc2626" />
              </View>
            ) : null
          }
        />
      </View>
    );
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header */}
        <View className="px-5 pt-2 pb-3 flex-row items-center">
          <Text className="text-slate-900 dark:text-slate-50 text-3xl font-black">
            Logs
          </Text>
          <View className="flex-1" />
          <TouchableOpacity
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 items-center justify-center"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.05,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <Calendar size={20} color="#0f172a" />
          </TouchableOpacity>
        </View>

        {/* Custom Tabs (Pills) */}
        <View className="mb-4">
          <ScrollView
            ref={tabRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
          >
            {LOG_TYPES.map((type, index) => {
              const isActive = activeTab === type;
              let activeBg = "bg-slate-900";
              let activeText = "text-white";
              
              if (isActive) {
                 if (type === "Temp RH") activeBg = "bg-red-600";
                 else if (type === "Water Parameters") activeBg = "bg-blue-600";
                 else if (type === "Chemical Dosing") activeBg = "bg-violet-600";
                 else if (type === "Chiller Logs") activeBg = "bg-cyan-600";
              }

              return (
                <TouchableOpacity
                  key={type}
                  onPress={() => handleTabPress(type, index)}
                  className={`px-4 py-2 rounded-xl border ${
                    isActive
                      ? `${activeBg} border-transparent`
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  }`}
                  style={{
                    shadowColor: isActive ? "#000" : "transparent",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: isActive ? 0.2 : 0,
                    shadowRadius: 4,
                    elevation: isActive ? 4 : 0,
                  }}
                >
                  <Text
                    className={`text-xs font-bold ${
                      isActive
                        ? activeText
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Horizontal Pager */}
        <FlatList
          ref={pagerRef}
          data={LOG_TYPES}
          renderItem={renderPage}
          keyExtractor={(item) => item}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handlePageScroll}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          windowSize={3}
        />
      </SafeAreaView>
    </View>
  );
}
