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
import { FlashList } from "@shopify/flash-list";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
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
import Skeleton from "@/components/Skeleton";
import SearchableSelect from "@/components/SearchableSelect";
import AttendanceService, { Site } from "@/services/AttendanceService";
import { LogImagePicker } from "@/components/sitelogs/LogImagePicker";
import { SortIcon } from "@/components/SortIcon";
import { sortBySequenceNumber, SortDirection } from "@/utils/sorting";
import { logMasterCollection } from "@/database";
import { Q } from "@nozbe/watermelondb";

// Memoized Log Item Component
const LogItem = memo(
  ({
    item,
    value,
    onUpdateValue,
  }: {
    item: TaskItem;
    value: { tds: string; ph: string; hardness: string; attachment?: string };
    onUpdateValue: (
      taskId: string,
      field: "tds" | "ph" | "hardness" | "attachment",
      value: string,
    ) => void;
  }) => {
    return (
      <View
        className={`bg-white dark:bg-slate-900 rounded-xl p-4 mb-3 border ${item.isCompleted ? "border-green-200 dark:border-green-900" : "border-slate-100 dark:border-slate-800"}`}
      >
        <View className="mb-3">
          <Text className="text-slate-900 dark:text-slate-50 font-bold text-base flex-1 mr-2">
            {item.name}
          </Text>
          {item.meta?.remarks && (
            <Text className="text-slate-400 text-[10px] italic mt-0.5">
              "{item.meta.remarks}"
            </Text>
          )}
          {item.isCompleted && (
            <View className="absolute top-0 right-0">
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

          <LogImagePicker
            value={value.attachment}
            onImageChange={(url) => onUpdateValue(item.id, "attachment", url || "")}
            uploadPath={`water/${item.id}`}
            compact
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
      prevProps.value.attachment === nextProps.value.attachment
    );
  },
);

export default function WaterTaskList() {
  const { user } = useAuth();
  const { id, editId, siteCode: initialSiteCode } = useLocalSearchParams<{
    id?: string;
    editId?: string;
    siteCode?: string;
  }>();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [siteCode, setSiteCode] = useState<string | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);

  // Bulk Entry State
  const [logValues, setLogValues] = useState<
    Record<
      string,
      { tds: string; ph: string; hardness: string; attachment?: string }
    >
  >({});
  const [signature, setSignature] = useState("");
  const [entryTime] = useState(new Date().getTime());
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [sequenceMap, setSequenceMap] = useState<Map<string, number>>(new Map());
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);

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
      
      // Select first site if none selected (random site requirement)
      if (!siteCode && userSites.length > 0) {
        setSiteCode(userSites[0].site_code);
        setTimeout(() => loadTasks(false), 100);
      }
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

  const loadDraft = async (siteCodeToLoad: string) => {
    try {
      const draftKey = `draft_water_${siteCodeToLoad}_${user?.user_id}`;
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

      let currentSiteCode = siteCode;
      let editRecord: any = null;
      const actualEditId = editId || id;

      // 1. If in edit mode, fetch the record FIRST to get the correct siteCode
      if (actualEditId && actualEditId.length > 16) {
        try {
          editRecord = await SiteLogService.getSiteLogById(actualEditId);
          if (editRecord && editRecord.siteCode) {
            currentSiteCode = editRecord.siteCode;
            setSiteCode(currentSiteCode);
          }
        } catch (e) {
          console.error("Failed to fetch water edit record", e);
        }
      }

      // 2. Fallback to storage
      if (!currentSiteCode) {
        const storageKey = `last_site_${user?.user_id || user?.id}`;
        currentSiteCode = await AsyncStorage.getItem(storageKey);
      }

      if (currentSiteCode) {
        setSiteCode(currentSiteCode);
        const areaTasks = await SiteConfigService.getLogTasks(
          currentSiteCode,
          "Water",
        );

        // Fetch sequence numbers for sorting
        const logMasterEntries = await logMasterCollection
          .query(Q.where("log_name", "Water"))
          .fetch();
        const sMap = new Map<string, number>();
        logMasterEntries.forEach((entry) => {
          sMap.set(entry.taskName, entry.sequenceNumber);
        });
        setSequenceMap(sMap);

        setTasks(areaTasks);

        // AUTO-SYNC: If we have no areas at all for a valid site
        if (areaTasks.length === 0 && currentSiteCode) {
          SiteLogService.pullSiteLogs(currentSiteCode, {
            logName: "Water",
            status: "pending",
          }).then(() => {
            loadTasks(false);
          });
        }

        const initialValues: Record<
          string,
          {
            tds: string;
            ph: string;
            hardness: string;
            attachment?: string;
            remarks?: string;
          }
        > = {};

        areaTasks.forEach((task) => {
          if (task.meta) {
            initialValues[task.id] = {
              tds: task.meta.tds?.toString() || "",
              ph: task.meta.ph?.toString() || "",
              hardness: task.meta.hardness?.toString() || "",
              attachment: task.meta.attachment || "",
            };
          }
        });

        if (editRecord) {
          const tId = editRecord.taskId || editRecord.id || actualEditId;
          initialValues[tId] = {
            tds: editRecord.tds?.toString() || "",
            ph: editRecord.ph?.toString() || "",
            hardness: editRecord.hardness?.toString() || "",
            attachment: editRecord.attachment || "",
          };
        } else {
          // Normal mode: Load draft
          const draftKey = `draft_water_${currentSiteCode}_${user?.user_id}`;
          const savedDraft = await AsyncStorage.getItem(draftKey);
          if (savedDraft) {
            try {
              const { values, signature: sig } = JSON.parse(savedDraft);
              if (values) {
                Object.keys(values).forEach((k) => {
                  initialValues[k] = { ...initialValues[k], ...values[k] };
                });
              }
              if (sig) setSignature(sig);
            } catch (e) {}
          }
        }
        setLogValues(initialValues);
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
      field: "tds" | "ph" | "hardness" | "attachment",
      value: string,
    ) => {
      setLogValues((prev) => ({
        ...prev,
        [taskId]: {
          ...(prev[taskId] || { tds: "", ph: "", hardness: "", attachment: "" }),
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

      if (input && hasData) {
        entriesToSave.push({
          id: task.id,
          siteCode: siteCode,
          executorId: user?.user_id || user?.id || "unknown",
          assignedTo: user?.name || user?.user_id || "unknown",
          logName: "Water",
          taskName: task.name,
          tds: input.tds ? parseFloat(input.tds) : null,
          ph: input.ph ? parseFloat(input.ph) : null,
          hardness: input.hardness ? parseFloat(input.hardness) : null,
          signature: sig,
          entryTime: timestamps.entryTime,
          endTime: timestamps.endTime,
          status: "Completed",
          attachment: input.attachment || null,
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

  const filteredData = useMemo(() => {
    let filtered = tasks;

    filtered = filtered.filter((task) => {
      const matchesSearch = task.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      
      const isNotCompleted = task.status !== "Completed";
      
      // If showCompleted is false, we only show non-completed tasks
      if (!showCompleted) {
        return matchesSearch && isNotCompleted;
      }
      
      return matchesSearch;
    });

    return sortBySequenceNumber(filtered, sequenceMap, sortDirection);
  }, [tasks, searchQuery, sequenceMap, sortDirection]);

  const renderItem = useCallback(
    ({ item }: { item: TaskItem }) => {
      const val = logValues[item.id] || {
        tds: "",
        ph: "",
        hardness: "",
      };

      return <LogItem item={item} value={val} onUpdateValue={updateValue} />;
    },
    [logValues, updateValue],
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
              
              {editId ? (
                <View className="flex-1 items-center">
                  <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">
                    Edit Water Log
                  </Text>
                  <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    ID: {editId.slice(-8).toUpperCase()}
                  </Text>
                </View>
              ) : (
                <View className="flex-1 mx-3" style={{ minWidth: 150 }}>
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
              )}
              <View className="items-center justify-center">
                 <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider text-center">
                  {format(new Date(), "dd MMM")}
                </Text>
              </View>
            </View>

            {!editId && (
              <View className="flex-row items-center gap-2">
                <View className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-2 flex-row items-center">
                  <TextInput
                    placeholder="Filter areas..."
                    value={searchQuery}
                    onChangeText={(t) => {
                      setSearchQuery(t);
                    }}
                    className="flex-1 font-medium text-slate-900 dark:text-slate-50"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <SortIcon
                  direction={sortDirection}
                  onPress={() => {
                    setSortDirection((prev) =>
                      prev === "asc" ? "desc" : prev === "desc" ? null : "asc",
                    );
                  }}
                />
                <TouchableOpacity
                  onPress={() => setShowCompleted(!showCompleted)}
                  className={`w-10 h-10 rounded-xl items-center justify-center border ${showCompleted ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700"}`}
                >
                  <CheckCircle2 size={18} color={showCompleted ? "#16a34a" : "#94a3b8"} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {loading ? (
            <View className="px-5 pt-4">
              {editId ? (
                <Skeleton
                  height={130}
                  style={{ marginBottom: 12, borderRadius: 12 }}
                />
              ) : (
                [1, 2, 3, 4, 5].map((i) => (
                  <Skeleton
                    key={i}
                    height={130}
                    style={{ marginBottom: 12, borderRadius: 12 }}
                  />
                ))
              )}
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
            <FlashList
              data={filteredData}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 20, paddingBottom: 150 }}
              renderItem={renderItem}
              // @ts-ignore
              estimatedItemSize={150}
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
