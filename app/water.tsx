import React, { useState, useEffect, useCallback, useMemo, memo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  ChevronLeft,
  Droplets,
  CheckCircle2,
  Activity,
  Beaker,
} from "lucide-react-native";
import { SiteConfigService, TaskItem } from "@/services/SiteConfigService";
import { useAuth } from "@/contexts/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { format } from "date-fns";
import SiteLogService from "@/services/SiteLogService";
import SignaturePad from "@/components/SignaturePad";

// Memoized Log Item Component
const LogItem = memo(
  ({
    item,
    value,
    onUpdateValue,
  }: {
    item: TaskItem;
    value: { tds: string; ph: string; hardness: string; remarks?: string };
    onUpdateValue: (
      taskId: string,
      field: "tds" | "ph" | "hardness" | "remarks",
      value: string,
    ) => void;
  }) => {
    return (
      <View
        className={`bg-white dark:bg-slate-900 rounded-xl p-4 mb-3 border ${item.isCompleted ? "border-green-200 dark:border-green-900" : "border-slate-100 dark:border-slate-800"}`}
      >
        <View className="flex-row justify-between mb-3">
          <Text className="text-slate-900 dark:text-slate-50 font-bold text-base flex-1 mr-2">
            {item.name}
          </Text>
          {item.isCompleted && (
            <View className="flex-row items-center">
              <CheckCircle2 size={16} color="#16a34a" />
            </View>
          )}
        </View>

        <View className="flex-row space-x-2 gap-2">
          <View className="flex-1">
            <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg px-2 border border-slate-200 dark:border-slate-700">
              <Droplets size={14} color="#3b82f6" />
              <TextInput
                value={value.tds}
                onChangeText={(t) => onUpdateValue(item.id, "tds", t)}
                placeholder="TDS"
                keyboardType="numeric"
                className="flex-1 py-3 ml-1 font-bold text-slate-900 dark:text-slate-50 text-xs"
              />
            </View>
          </View>

          <View className="flex-1">
            <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg px-2 border border-slate-200 dark:border-slate-700">
              <Activity size={14} color="#10b981" />
              <TextInput
                value={value.ph}
                onChangeText={(t) => onUpdateValue(item.id, "ph", t)}
                placeholder="pH"
                keyboardType="numeric"
                className="flex-1 py-3 ml-1 font-bold text-slate-900 dark:text-slate-50 text-xs"
              />
            </View>
          </View>

          <View className="flex-1">
            <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg px-2 border border-slate-200 dark:border-slate-700">
              <Beaker size={14} color="#8b5cf6" />
              <TextInput
                value={value.hardness}
                onChangeText={(t) => onUpdateValue(item.id, "hardness", t)}
                placeholder="Hardness"
                keyboardType="numeric"
                className="flex-1 py-3 ml-1 font-bold text-slate-900 dark:text-slate-50 text-xs"
              />
            </View>
          </View>
        </View>

        <View className="mt-3 flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg px-2 border border-slate-200 dark:border-slate-700">
          <TextInput
            value={value.remarks}
            onChangeText={(t) => onUpdateValue(item.id, "remarks", t)}
            placeholder="Remarks (optional)"
            className="flex-1 py-3 ml-1 font-medium text-slate-900 dark:text-slate-50 text-xs"
          />
        </View>
      </View>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.isCompleted === nextProps.item.isCompleted &&
      prevProps.value.tds === nextProps.value.tds &&
      prevProps.value.ph === nextProps.value.ph &&
      prevProps.value.hardness === nextProps.value.hardness &&
      prevProps.value.remarks === nextProps.value.remarks
    );
  },
);

export default function WaterTaskList() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [siteCode, setSiteCode] = useState<string | null>(null);

  // Pagination state
  const [visibleCount, setVisibleCount] = useState(50);
  const PAGE_SIZE = 50;

  // Bulk Entry State
  const [logValues, setLogValues] = useState<
    Record<
      string,
      { tds: string; ph: string; hardness: string; remarks?: string }
    >
  >({});
  const [signature, setSignature] = useState("");
  const [entryTime] = useState(new Date().getTime());
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadTasks();
    }, []),
  );

  useEffect(() => {
    if (siteCode) {
      const saveDraft = async () => {
        try {
          const draftKey = `draft_water_${siteCode}_${user?.user_id}`;
          await AsyncStorage.setItem(
            draftKey,
            JSON.stringify({ values: logValues, signature }),
          );
        } catch (e) {
          console.error("Failed to save draft", e);
        }
      };
      const timer = setTimeout(saveDraft, 500);
      return () => clearTimeout(timer);
    }
  }, [logValues, signature, siteCode]);

  const loadDraft = async () => {
    try {
      const draftKey = `draft_water_${siteCode}_${user?.user_id}`;
      const savedDraft = await AsyncStorage.getItem(draftKey);
      if (savedDraft) {
        const { values, signature: sig } = JSON.parse(savedDraft);
        if (values) setLogValues(values);
        if (sig) setSignature(sig);
      }
    } catch (e) {
      console.error("Failed to load draft", e);
    }
  };

  const clearDraft = async () => {
    try {
      const draftKey = `draft_water_${siteCode}_${user?.user_id}`;
      await AsyncStorage.removeItem(draftKey);
      setLogValues({});
      setSignature("");
    } catch (e) {
      console.error("Failed to clear draft", e);
    }
  };

  const loadTasks = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const storageKey = `last_site_${user?.user_id || user?.id}`;
      const savedSiteCode = await AsyncStorage.getItem(storageKey);

      if (savedSiteCode) {
        setSiteCode(savedSiteCode);
        const areaTasks = await SiteConfigService.getLogTasks(
          savedSiteCode,
          "Water",
        );
        setTasks(areaTasks);

        const initialValues: Record<
          string,
          { tds: string; ph: string; hardness: string; remarks?: string }
        > = {};
        areaTasks.forEach((task) => {
          if (task.status === "Inprogress" && task.meta) {
            initialValues[task.id] = {
              tds: task.meta.tds?.toString() || "",
              ph: task.meta.ph?.toString() || "",
              hardness: task.meta.hardness?.toString() || "",
              remarks: task.meta.remarks || "",
            };
          }
        });

        // Start with DB Inprogress data
        setLogValues(initialValues);

        // Merge local draft on top
        const draftKey = `draft_water_${savedSiteCode}_${user?.user_id}`;
        const savedDraft = await AsyncStorage.getItem(draftKey);
        if (savedDraft) {
          const { values, signature: sig } = JSON.parse(savedDraft);
          if (values && Object.keys(values).length > 0) {
            setLogValues((prev) => ({ ...prev, ...values }));
          }
          if (sig) setSignature(sig);
        }
      }
    } catch (error) {
      console.error("Failed to load water tasks", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTasks(false);
  }, [siteCode]);

  const updateValue = useCallback(
    (
      taskId: string,
      field: "tds" | "ph" | "hardness" | "remarks",
      value: string,
    ) => {
      setLogValues((prev) => ({
        ...prev,
        [taskId]: {
          ...(prev[taskId] || { tds: "", ph: "", hardness: "", remarks: "" }),
          [field]: value,
        },
      }));
    },
    [],
  );

  const handleSaveWithSignature = async (sig: string) => {
    setSignatureModalVisible(false);

    const entriesToSave = [];
    const timestamps = {
      entryTime: entryTime,
      endTime: new Date().getTime(),
    };

    const filteredTasks = tasks.filter((t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    for (const task of filteredTasks) {
      const input = logValues[task.id];
      const hasData = !!(
        (input?.tds && input.tds.trim().length > 0) ||
        (input?.ph && input.ph.trim().length > 0) ||
        (input?.hardness && input.hardness.trim().length > 0)
      );

      if (input && (hasData || input.remarks)) {
        entriesToSave.push({
          siteCode: siteCode,
          executorId: user?.user_id || user?.id || "unknown",
          assignedTo: user?.name || user?.user_id || "unknown",
          logName: "Water",
          taskName: task.name,
          tds: input.tds ? parseFloat(input.tds) : null,
          ph: input.ph ? parseFloat(input.ph) : null,
          hardness: input.hardness ? parseFloat(input.hardness) : null,
          remarks: input.remarks || "",
          signature: sig,
          entryTime: timestamps.entryTime,
          endTime: timestamps.endTime,
          status: "Completed",
        });
      }
    }

    if (entriesToSave.length === 0) {
      Alert.alert("No Data", "Please enter at least one value for one area.");
      return;
    }

    try {
      setSaving(true);
      await SiteLogService.saveBulkSiteLogs(entriesToSave);
      await clearDraft();

      Alert.alert(
        "Success",
        `Saved ${entriesToSave.length} entries successfully.`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save logs");
    } finally {
      setSaving(false);
    }
  };

  const filteredData = useMemo(
    () =>
      tasks.filter((task) => {
        const matchesSearch = task.name
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
        const isNotCompleted = task.status !== "Completed";
        return matchesSearch && isNotCompleted;
      }),
    [tasks, searchQuery],
  );

  const paginatedData = useMemo(() => {
    return filteredData.slice(0, visibleCount);
  }, [filteredData, visibleCount]);

  const loadMore = useCallback(() => {
    if (visibleCount < filteredData.length) {
      setVisibleCount((prev) => prev + PAGE_SIZE);
    }
  }, [visibleCount, filteredData.length]);

  const renderItem = useCallback(
    ({ item }: { item: TaskItem }) => {
      const val = logValues[item.id] || {
        tds: "",
        ph: "",
        hardness: "",
        remarks: "",
      };

      return <LogItem item={item} value={val} onUpdateValue={updateValue} />;
    },
    [logValues, updateValue],
  );

  const renderFooter = () => (
    <View className="pb-28">
      {visibleCount < filteredData.length && (
        <ActivityIndicator size="small" color="#3b82f6" className="py-4" />
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" edges={["top"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          {/* Header */}
          <View className="px-5 py-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
            <View className="flex-row items-center justify-between mb-4">
              <TouchableOpacity
                onPress={() => router.back()}
                className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 items-center justify-center"
              >
                <ChevronLeft size={20} color="#0f172a" />
              </TouchableOpacity>
              <View>
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg text-center">
                  Water Parameters
                </Text>
                <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider text-center">
                  {format(new Date(), "dd MMM yyyy")}
                </Text>
              </View>
              <View className="w-10" />
            </View>

            {/* Search Bar */}
            <View className="bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-2 flex-row items-center">
              <TextInput
                placeholder="Filter parameters..."
                value={searchQuery}
                onChangeText={(t) => {
                  setSearchQuery(t);
                  setVisibleCount(PAGE_SIZE);
                }}
                className="flex-1 font-medium text-slate-900 dark:text-slate-50"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#dc2626" />
            </View>
          ) : tasks.length === 0 ? (
            <View className="flex-1 items-center justify-center p-10">
              <View className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center mb-4">
                <Droplets size={24} color="#94a3b8" />
              </View>
              <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg text-center">
                No Areas Found
              </Text>
            </View>
          ) : (
            <FlatList
              data={paginatedData}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 20 }}
              renderItem={renderItem}
              ListFooterComponent={renderFooter}
              onEndReached={loadMore}
              onEndReachedThreshold={0.5}
              removeClippedSubviews={Platform.OS === "android"}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={["#3b82f6"]}
                />
              }
            />
          )}
        </KeyboardAvoidingView>

        {/* Fixed Bottom Submit Button */}
        {filteredData.length > 0 && (
          <View className="absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 px-5 pb-8 pt-4">
            <TouchableOpacity
              onPress={() => setSignatureModalVisible(true)}
              disabled={saving}
              activeOpacity={0.8}
              className={`py-4 rounded-xl flex-row items-center justify-center ${saving ? "bg-slate-200" : "bg-blue-600 shadow-md shadow-blue-600/20"}`}
              style={
                !saving
                  ? {
                      shadowColor: "#2563eb",
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.2,
                      shadowRadius: 8,
                      elevation: 4,
                    }
                  : {}
              }
            >
              {saving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold text-base uppercase tracking-widest">
                  Complete & Sign
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>

      {/* Signature Modal */}
      <Modal
        visible={signatureModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSignatureModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white dark:bg-slate-900 rounded-t-3xl h-[60%] overflow-hidden">
            <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg">
                Sign to Complete Bulk Entry
              </Text>
              <TouchableOpacity onPress={() => setSignatureModalVisible(false)}>
                <Text className="text-purple-600 font-bold">Close</Text>
              </TouchableOpacity>
            </View>
            <SignaturePad
              standalone
              okText="Complete All Logs"
              onOK={(sig: string) => handleSaveWithSignature(sig)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
