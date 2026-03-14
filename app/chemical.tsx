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
  FlaskConical,
  CheckCircle2,
  ChevronDown,
  Check,
} from "lucide-react-native";
import { SiteConfigService, TaskItem } from "@/services/SiteConfigService";
import { useAuth } from "@/contexts/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { format } from "date-fns";
import SiteLogService from "@/services/SiteLogService";
import SignaturePad from "@/components/SignaturePad";
import Skeleton from "@/components/Skeleton";
import SearchableSelect from "@/components/SearchableSelect";
import AttendanceService, { Site } from "@/services/AttendanceService";

// Memoized Log Item Component
const LogItem = memo(
  ({
    item,
    value,
    onUpdateValue,
    onSelectDosing,
  }: {
    item: TaskItem;
    value: { dosing: string; remarks?: string };
    onUpdateValue: (taskId: string, field: "remarks", value: string) => void;
    onSelectDosing: (taskId: string) => void;
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

        <TouchableOpacity
          onPress={() => onSelectDosing(item.id)}
          className="flex-row items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800 mb-3"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 2,
          }}
        >
          <View className="flex-row items-center">
            <View className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-900/30 items-center justify-center mr-3">
              <FlaskConical size={14} color="#9333ea" />
            </View>
            <Text
              className={`font-bold text-sm ${value.dosing ? "text-slate-900 dark:text-slate-50" : "text-slate-400"}`}
            >
              {value.dosing || "Select Option"}
            </Text>
          </View>
          <ChevronDown size={16} color="#94a3b8" />
        </TouchableOpacity>

        <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg px-3 border border-slate-200 dark:border-slate-700">
          <TextInput
            value={value.remarks}
            onChangeText={(t) => onUpdateValue(item.id, "remarks", t)}
            placeholder="Remarks (optional)"
            className="flex-1 py-3 font-medium text-slate-900 dark:text-slate-50 text-xs"
          />
        </View>
      </View>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.isCompleted === nextProps.item.isCompleted &&
      prevProps.value.dosing === nextProps.value.dosing &&
      prevProps.value.remarks === nextProps.value.remarks
    );
  },
);

export default function ChemicalTaskList() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [siteCode, setSiteCode] = useState<string | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);

  // Pagination state
  const [visibleCount, setVisibleCount] = useState(50);
  const PAGE_SIZE = 50;

  // Bulk Entry State
  const [logValues, setLogValues] = useState<
    Record<string, { dosing: string; remarks?: string }>
  >({});
  const [signature, setSignature] = useState("");
  const [entryTime] = useState(new Date().getTime());
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  const [showDosingPicker, setShowDosingPicker] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadSites();
    }
  }, [user]);

  const loadSites = async () => {
    try {
      setLoadingSites(true);
      const userSites = await AttendanceService.getUserSites(user?.user_id || user?.id || "");
      setSites(userSites);
    } catch (error) {
      console.error("Failed to load sites", error);
    } finally {
      setLoadingSites(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadTasks();
    }, []),
  );

  useEffect(() => {
    if (siteCode) {
      const saveDraft = async () => {
        try {
          const draftKey = `draft_chem_${siteCode}_${user?.user_id}`;
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

  const loadDraft = async (siteCodeToLoad: string) => {
    try {
      const draftKey = `draft_chem_${siteCodeToLoad}_${user?.user_id}`;
      const savedDraft = await AsyncStorage.getItem(draftKey);
      if (savedDraft) {
        const { values, signature: sig } = JSON.parse(savedDraft);
        if (values && Object.keys(values).length > 0) {
          setLogValues((prev) => ({ ...prev, ...values }));
        }
        if (sig) setSignature(sig);
      }
    } catch (e) {
      console.error("Failed to load draft", e);
    }
  };

  const clearDraft = async () => {
    try {
      const draftKey = `draft_chem_${siteCode}_${user?.user_id}`;
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
      let currentSiteCode = siteCode;
      
      if (!currentSiteCode) {
        currentSiteCode = await AsyncStorage.getItem(storageKey);
      }

      if (currentSiteCode) {
        setSiteCode(currentSiteCode);
        const areaTasks = await SiteConfigService.getLogTasks(
          currentSiteCode,
          "Chemical Dosing",
        );
        setTasks(areaTasks);

        const initialValues: Record<
          string,
          { dosing: string; remarks?: string }
        > = {};
        areaTasks.forEach((task) => {
          if (task.meta) {
            initialValues[task.id] = {
              dosing: task.meta.chemicalDosing || "",
              remarks: task.meta.remarks || "",
            };
          }
        });

        // Start with DB Inprogress data
        setLogValues(initialValues);

        // Merge local draft on top
        await loadDraft(currentSiteCode);
      }
    } catch (error) {
      console.error("Failed to load chemical tasks", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (siteCode) {
      loadTasks();
    }
  }, [siteCode]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTasks(false);
  }, [siteCode]);

  const updateValue = useCallback(
    (taskId: string, field: "dosing" | "remarks", value: string) => {
      setLogValues((prev) => ({
        ...prev,
        [taskId]: {
          ...(prev[taskId] || { dosing: "", remarks: "" }),
          [field === "dosing" ? "dosing" : "remarks"]: value,
        },
      }));
    },
    [],
  );

  const handleSelectDosing = useCallback((taskId: string) => {
    setActiveTaskId(taskId);
    setShowDosingPicker(true);
  }, []);

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
      if (input && input.dosing) {
        entriesToSave.push({
          siteCode: siteCode,
          executorId: user?.user_id || user?.id || "unknown",
          assignedTo: user?.name || user?.user_id || "unknown",
          logName: "Chemical Dosing",
          taskName: task.name,
          chemicalDosing: input.dosing,
          remarks: input.remarks || "",
          signature: sig,
          entryTime: timestamps.entryTime,
          endTime: timestamps.endTime,
          status: "Completed",
        });
      }
    }

    if (entriesToSave.length === 0) {
      Alert.alert("No Data", "Please select an option for at least one area.");
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
      const val = logValues[item.id] || { dosing: "", remarks: "" };
      return (
        <LogItem
          item={item}
          value={val}
          onUpdateValue={updateValue}
          onSelectDosing={handleSelectDosing}
        />
      );
    },
    [logValues, updateValue, handleSelectDosing],
  );

  const renderFooter = () => (
    <View className="pb-28">
      {visibleCount < filteredData.length && (
        <ActivityIndicator size="small" color="#9333ea" className="py-4" />
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
              <View className="flex-1 mx-3">
                <SearchableSelect
                  label=""
                  placeholder="Select Site"
                  value={siteCode || ""}
                  options={sites.map(s => ({
                    label: s.name,
                    value: s.site_code,
                    description: s.site_code
                  }))}
                  onChange={(val) => {
                    setSiteCode(val);
                    AsyncStorage.setItem(`last_site_${user?.user_id || user?.id}`, val);
                  }}
                  loading={loadingSites}
                />
              </View>
              <View className="items-center justify-center">
                 <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider text-center">
                  {format(new Date(), "dd MMM")}
                </Text>
              </View>
            </View>

            {/* Search Bar */}
            <View className="bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-2 flex-row items-center">
              <TextInput
                placeholder="Filter parameters..."
                value={searchQuery}
                onChangeText={(t) => {
                  setSearchQuery(t);
                  setVisibleCount(PAGE_SIZE); // Reset pagination on search
                }}
                className="flex-1 font-medium text-slate-900 dark:text-slate-50"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>

          {loading ? (
            <View className="px-5 pt-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton
                  key={i}
                  height={130}
                  style={{ marginBottom: 12, borderRadius: 12 }}
                />
              ))}
            </View>
          ) : tasks.length === 0 ? (
            <View className="flex-1 items-center justify-center p-10">
              <View className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center mb-4">
                <FlaskConical size={24} color="#94a3b8" />
              </View>
              <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg text-center">
                No Areas Found
              </Text>
              <Text className="text-slate-500 text-center mt-2">
                No chemical dosing points configured.
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
                  colors={["#9333ea"]}
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
              className={`py-4 rounded-xl flex-row items-center justify-center ${saving ? "bg-slate-200" : "bg-purple-600 shadow-md shadow-purple-600/20"}`}
              style={
                !saving
                  ? {
                      shadowColor: "#9333ea",
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
                Sign to Complete
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

      {/* Chemical Dosing Picker Modal */}
      <Modal
        visible={showDosingPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDosingPicker(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowDosingPicker(false)}
          className="flex-1 bg-black/50 justify-center px-6"
        >
          <View className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl">
            <View className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <Text className="text-slate-900 dark:text-slate-50 font-bold text-center">
                Select Dosing Status
              </Text>
            </View>
            {["Yes", "No"].map((option) => (
              <TouchableOpacity
                key={option}
                onPress={() => {
                  if (activeTaskId) {
                    updateValue(activeTaskId, "dosing", option);
                  }
                  setShowDosingPicker(false);
                }}
                className="flex-row items-center justify-between p-5 border-b border-slate-50 dark:border-slate-800/50 last:border-b-0"
              >
                <Text
                  className={`text-lg font-bold ${activeTaskId && logValues[activeTaskId]?.dosing === option ? "text-purple-600" : "text-slate-600 dark:text-slate-400"}`}
                >
                  {option}
                </Text>
                {activeTaskId && logValues[activeTaskId]?.dosing === option && (
                  <Check size={20} color="#9333ea" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
