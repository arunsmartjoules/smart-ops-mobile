import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  ListChecks,
  Wrench,
  ChevronRight,
  Filter,
  WifiOff,
  MapPin,
  ChevronDown,
  Clock,
  Briefcase,
  AlertCircle,
  CheckCircle2,
} from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import PMService from "@/services/PMService";
import { authService } from "@/services/AuthService";
import { AttendanceService, type Site } from "@/services/AttendanceService";
import PMInstance from "@/database/models/PMInstance";
import { format } from "date-fns";
import AdvancedFilterModal from "@/components/AdvancedFilterModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/utils/logger";

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> =
  {
    Open: { bg: "#eff6ff", text: "#2563eb", dot: "#3b82f6" },
    "In-progress": { bg: "#fff7ed", text: "#c2410c", dot: "#f97316" },
    Completed: { bg: "#f0fdf4", text: "#15803d", dot: "#22c55e" },
    Overdue: { bg: "#fef2f2", text: "#dc2626", dot: "#ef4444" },
  };

const STATUS_OPTIONS = ["All", "Open", "In-progress", "Completed"];

const PMCard = React.memo(
  ({ instance, onPress }: { instance: PMInstance; onPress: () => void }) => {
    const statusInfo = STATUS_COLORS[instance.status] || STATUS_COLORS["Open"];
    const progress = instance.progress || 0;

    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        className="bg-white dark:bg-slate-900 rounded-2xl p-4 mb-3 border border-slate-100 dark:border-slate-800"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-lg">
            <Clock size={12} color="#64748b" />
            <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold ml-1 uppercase">
              {instance.frequency || "ONCE"}
            </Text>
          </View>
          <View
            className="px-2 py-1 rounded-lg"
            style={{ backgroundColor: statusInfo.bg }}
          >
            <Text
              className="text-[10px] font-bold uppercase"
              style={{ color: statusInfo.text }}
            >
              {instance.status}
            </Text>
          </View>
        </View>

        <View className="flex-row items-start">
          <View
            className="w-12 h-12 rounded-2xl items-center justify-center mr-3"
            style={{ backgroundColor: statusInfo.bg + "40" }}
          >
            <Wrench size={22} color={statusInfo.dot} />
          </View>
          <View className="flex-1">
            <Text
              className="text-slate-900 dark:text-slate-50 font-bold text-base leading-5"
              numberOfLines={2}
            >
              {instance.title}
            </Text>
            <View className="flex-row items-center mt-1">
              <Briefcase size={12} color="#94a3b8" />
              <Text className="text-slate-400 text-xs ml-1" numberOfLines={1}>
                {instance.assetType || "General Asset"}
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color="#cbd5e1" className="mt-1" />
        </View>

        {/* Progress Section */}
        <View className="mt-4">
          <View className="flex-row justify-between items-center mb-1.5">
            <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">
              Completion Progress
            </Text>
            <Text
              className="text-[10px] font-extrabold"
              style={{ color: statusInfo.dot }}
            >
              {progress}%
            </Text>
          </View>
          <View className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <View
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                backgroundColor: statusInfo.dot,
              }}
            />
          </View>
        </View>

        <View className="mt-3 pt-3 border-t border-slate-50 dark:border-slate-800 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Clock size={12} color="#94a3b8" />
            <Text className="text-slate-400 text-xs ml-1">
              Due:{" "}
              {instance.startDueDate
                ? format(new Date(instance.startDueDate), "d MMM yyyy")
                : "N/A"}
            </Text>
          </View>
          {instance.assignedToName ? (
            <View className="flex-row items-center">
              <View className="w-5 h-5 rounded-full bg-slate-100 items-center justify-center mr-1">
                <Text className="text-[10px] font-bold text-slate-500">
                  {instance.assignedToName.charAt(0)}
                </Text>
              </View>
              <Text
                className="text-slate-500 text-xs font-medium"
                numberOfLines={1}
              >
                {instance.assignedToName}
              </Text>
            </View>
          ) : (
            <Text className="text-slate-300 text-[10px] italic">
              Unassigned
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  },
);

export default function PreventiveMaintenance() {
  const { user } = useAuth();
  const { isConnected } = useNetworkStatus();
  const [instances, setInstances] = useState<PMInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("Open");
  const [siteCode, setSiteCode] = useState("");
  const [sites, setSites] = useState<Site[]>([]);
  const [siteName, setSiteName] = useState("Select Site");
  const [showFiltersModal, setShowFiltersModal] = useState(false);

  // Filters from Advanced Modal
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [tempSearch, setTempSearch] = useState("");
  const [tempFromDate, setTempFromDate] = useState<string | null>(null);
  const [tempToDate, setTempToDate] = useState<string | null>(null);

  useEffect(() => {
    const userId = user?.user_id || user?.id;
    if (userId) {
      loadSites(userId);
    }
  }, [user]);

  const loadSites = async (userId: string) => {
    try {
      const lastSiteCode = await AsyncStorage.getItem(`last_site_${userId}`);
      let userSites: Site[] = [];
      const isAdmin = user?.role === "admin" || user?.role === "Admin";

      if (isAdmin) {
        userSites = await AttendanceService.getAllSites();
      } else {
        userSites = await AttendanceService.getUserSites(userId, "JouleCool");
      }

      let finalSites: Site[] = [];
      if (isAdmin) {
        finalSites = [{ site_code: "all", name: "All Sites" }, ...userSites];
      } else {
        finalSites = userSites;
      }

      setSites(finalSites);

      if (finalSites.length > 0) {
        let siteToSelect = lastSiteCode || finalSites[0].site_code;
        if (!finalSites.find((s) => s.site_code === siteToSelect)) {
          siteToSelect = finalSites[0].site_code;
        }

        setSiteCode(siteToSelect);
        const currentSite = finalSites.find(
          (s) => s.site_code === siteToSelect,
        );
        if (currentSite) {
          setSiteName(
            siteToSelect === "all" ? currentSite.name : currentSite.site_code,
          );
        }
      }
    } catch (error) {
      logger.error("Error loading sites for PM", { error });
    }
  };

  const loadData = useCallback(async () => {
    if (!siteCode) return;
    try {
      const statusArg = statusFilter === "All" ? undefined : [statusFilter];

      const data = await PMService.getLocalInstances(
        siteCode,
        statusArg,
        undefined,
      );
      setInstances(data);
    } catch (error) {
      console.error("Error loading PM instances:", error);
    } finally {
      setLoading(false);
    }
  }, [siteCode, statusFilter]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      if (isConnected && siteCode) {
        PMService.pullFromServer(siteCode)
          .then(loadData)
          .catch(() => {});
      }
    }, [loadData, isConnected, siteCode]),
  );

  const handleCloseFilters = useCallback(() => {
    setShowFiltersModal(false);
  }, []);

  const applyAdvancedFilters = useCallback(() => {
    setFromDate(tempFromDate);
    setToDate(tempToDate);
    setShowFiltersModal(false);
    loadData();
  }, [tempFromDate, tempToDate, loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (isConnected && siteCode) {
      try {
        await PMService.pullFromServer(siteCode);
      } catch (e) {}
    }
    await loadData();
    setRefreshing(false);
  }, [siteCode, isConnected, loadData]);

  // Statistics
  const stats = useMemo(() => {
    const all = instances;
    return {
      total: all.length,
      open: all.filter((i) => i.status === "Open").length,
      inProgress: all.filter((i) => i.status === "In-progress").length,
      completed: all.filter((i) => i.status === "Completed").length,
    };
  }, [instances]);

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        {/* Header */}
        <View className="px-5 pt-2 pb-3">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-1">
              <Text className="text-slate-400 dark:text-slate-500 text-sm font-medium mb-1">
                Site Operations
              </Text>
              <TouchableOpacity
                onPress={() => setShowFiltersModal(true)}
                className="flex-row items-center"
              >
                <MapPin size={20} color="#3b82f6" />
                <Text
                  className="text-slate-900 dark:text-slate-50 text-xl font-bold ml-2 mr-1 flex-shrink"
                  numberOfLines={1}
                >
                  {siteName}
                </Text>
                <ChevronDown size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setShowFiltersModal(true)}
              className="w-11 h-11 rounded-xl bg-white dark:bg-slate-900 items-center justify-center border border-slate-100 dark:border-slate-800"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.04,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <Filter size={20} color={fromDate ? "#3b82f6" : "#64748b"} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats Grid */}
        <View className="px-5 mb-6">
          <View className="flex-row gap-3">
            <View className="flex-1 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
              <View className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 items-center justify-center mb-2">
                <ListChecks size={16} color="#3b82f6" />
              </View>
              <Text className="text-slate-900 dark:text-slate-100 text-lg font-bold">
                {stats.total}
              </Text>
              <Text className="text-slate-400 text-[10px] font-bold uppercase">
                Total PMs
              </Text>
            </View>
            <View className="flex-1 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
              <View className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-900/20 items-center justify-center mb-2">
                <AlertCircle size={16} color="#f97316" />
              </View>
              <Text className="text-slate-900 dark:text-slate-100 text-lg font-bold">
                {stats.open}
              </Text>
              <Text className="text-slate-400 text-[10px] font-bold uppercase">
                Open
              </Text>
            </View>
            <View className="flex-1 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
              <View className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 items-center justify-center mb-2">
                <Clock size={16} color="#fbbf24" />
              </View>
              <Text className="text-slate-900 dark:text-slate-100 text-lg font-bold">
                {stats.inProgress}
              </Text>
              <Text className="text-slate-400 text-[10px] font-bold uppercase">
                Active
              </Text>
            </View>
            <View className="flex-1 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
              <View className="w-8 h-8 rounded-lg bg-green-50 dark:bg-green-900/20 items-center justify-center mb-2">
                <CheckCircle2 size={16} color="#22c55e" />
              </View>
              <Text className="text-slate-900 dark:text-slate-100 text-lg font-bold">
                {stats.completed}
              </Text>
              <Text className="text-slate-400 text-[10px] font-bold uppercase">
                Done
              </Text>
            </View>
          </View>
        </View>

        {/* Filters */}
        <View className="px-5 mb-4">
          <View className="flex-row items-center gap-2 mb-2">
            <Filter size={14} color="#94a3b8" />
            <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              Quick Filters
            </Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-2"
          >
            <View className="flex-row gap-2">
              {STATUS_OPTIONS.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setStatusFilter(s)}
                  className={`px-4 py-2 rounded-xl border ${
                    statusFilter === s
                      ? "bg-blue-500 border-blue-500"
                      : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800"
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      statusFilter === s ? "text-white" : "text-slate-500"
                    }`}
                  >
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* PM List */}
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#3b82f6"
            />
          }
        >
          {loading ? (
            <View className="mt-8 items-center">
              <ActivityIndicator color="#3b82f6" />
              <Text className="text-slate-400 text-xs mt-2">
                Fetching PM schedule...
              </Text>
            </View>
          ) : instances.length === 0 ? (
            <View className="items-center py-20">
              <View className="w-20 h-20 bg-slate-100 dark:bg-slate-900 rounded-full items-center justify-center mb-4">
                <Wrench size={32} color="#cbd5e1" />
              </View>
              <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg">
                No PM tasks found
              </Text>
              <Text className="text-slate-400 text-sm mt-1 text-center px-10">
                Try adjusting your filters or site selection.
              </Text>
            </View>
          ) : (
            <>
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-sm">
                  Upcoming Maintenance
                </Text>
                <Text className="text-slate-400 text-xs font-medium">
                  {instances.length} Tasks
                </Text>
              </View>
              {instances.map((instance) => (
                <PMCard
                  key={instance.id}
                  instance={instance}
                  onPress={() =>
                    router.push({
                      pathname: "/pm-execution",
                      params: { instanceId: instance.serverId || instance.id },
                    })
                  }
                />
              ))}
            </>
          )}
        </ScrollView>

        <AdvancedFilterModal
          visible={showFiltersModal}
          onClose={handleCloseFilters}
          tempSearch={tempSearch}
          setTempSearch={setTempSearch}
          tempFromDate={tempFromDate}
          setTempFromDate={setTempFromDate}
          tempToDate={tempToDate}
          setTempToDate={setTempToDate}
          sites={sites}
          selectedSiteCode={siteCode}
          setSelectedSiteCode={(code) => {
            setSiteCode(code);
            const site = sites.find((s) => s.site_code === code);
            if (site) setSiteName(code === "all" ? site.name : site.site_code);
            AsyncStorage.setItem(
              `last_site_${user?.user_id || user?.id}`,
              code,
            );
          }}
          user={user}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          applyAdvancedFilters={applyAdvancedFilters}
        />
      </SafeAreaView>
    </View>
  );
}
