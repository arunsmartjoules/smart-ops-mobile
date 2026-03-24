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
  Image,
  Modal,
  RefreshControl,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft,
  Thermometer,
  CloudRain,
  CheckCircle2,
  Camera,
} from "lucide-react-native";
import { SiteConfigService, TaskItem } from "@/services/SiteConfigService";
import { useAuth } from "@/contexts/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { format } from "date-fns";
import SiteLogService from "@/services/SiteLogService";
import SignaturePad from "@/components/SignaturePad";
import { StorageService } from "@/services/StorageService";
import Skeleton from "@/components/Skeleton";
import SearchableSelect from "@/components/SearchableSelect";
import AttendanceService, { Site } from "@/services/AttendanceService";
import { LogImagePicker } from "@/components/sitelogs/LogImagePicker";
import { SortIcon } from "@/components/SortIcon";
import { sortBySequenceNumber, SortDirection } from "@/utils/sorting";
import { logMasterCollection } from "@/database";
import { Q } from "@nozbe/watermelondb";
import logger from "@/utils/logger";

// Memoized Log Item Component
const LogItem = memo(
  ({
    item,
    value,
    isUploading,
    onUpdateValue,
  }: {
    item: TaskItem;
    value: { temp: string; rh: string; attachment?: string; remarks?: string };
    isUploading: boolean;
    onUpdateValue: (
      taskId: string,
      field: "temp" | "rh",
      value: string,
    ) => void;
  }) => {
    return (
      <View
        className={`bg-white dark:bg-slate-900 rounded-xl p-4 mb-3 border ${item.isCompleted ? "border-green-200 dark:border-green-900" : "border-slate-100 dark:border-slate-800"}`}
      >
        <View className="mb-3">
          <Text className="text-slate-900 dark:text-slate-50 font-bold text-base flex-1 mr-2">
            {item.name || "Unnamed Area"}
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

        <View className="flex-row space-x-3 gap-3 items-center mb-3">
          <View className="flex-1">
            <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg px-3 border border-slate-200 dark:border-slate-700">
              <Thermometer size={16} color="#ef4444" />
              <TextInput
                value={value.temp}
                onChangeText={(t) => onUpdateValue(item.id, "temp", t)}
                placeholder="Temp"
                keyboardType="numeric"
                className="flex-1 py-3 ml-2 font-bold text-slate-900 dark:text-slate-50"
              />
              <Text className="text-xs text-slate-400 font-bold">°C</Text>
            </View>
          </View>

          <View className="flex-1">
            <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg px-3 border border-slate-200 dark:border-slate-700">
              <CloudRain size={16} color="#3b82f6" />
              <TextInput
                value={value.rh}
                onChangeText={(t) => onUpdateValue(item.id, "rh", t)}
                placeholder="RH"
                keyboardType="numeric"
                className="flex-1 py-3 ml-2 font-bold text-slate-900 dark:text-slate-50"
              />
              <Text className="text-xs text-slate-400 font-bold">%</Text>
            </View>
          </View>

          <LogImagePicker
            value={value.attachment}
            onImageChange={(url) =>
              onUpdateValue(item.id, "attachment" as any, url || "")
            }
            uploadPath={`temprh/${item.id}`}
            compact
            disabled={isUploading}
          />
        </View>
      </View>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.isCompleted === nextProps.item.isCompleted &&
      prevProps.isUploading === nextProps.isUploading &&
      prevProps.value.temp === nextProps.value.temp &&
      prevProps.value.rh === nextProps.value.rh &&
      prevProps.value.attachment === nextProps.value.attachment
    );
  },
);

export default function TempRHTaskList() {
  const { user } = useAuth();
  const { shift, id, editId, siteCode: initialSiteCode } = useLocalSearchParams<{
    shift?: string;
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
    Record<string, { temp: string; rh: string; attachment?: string }>
  >({});
  const [signature, setSignature] = useState("");
  const [entryTime] = useState(new Date().getTime());
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [uploadingAttachments, setUploadingAttachments] = useState<
    Record<string, boolean>
  >({});
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const autoSyncedRef = React.useRef(false);

  useEffect(() => {
    if (user) {
      loadSites();
      // In edit mode, loadSites won't call loadTasks — trigger it directly
      if (editId) {
        loadTasks(true);
      }
    }
  }, [user]);

  const loadSites = async () => {
    setLoadingSites(true);
    try {
      const userSites = await AttendanceService.getUserSites(
        user?.user_id || user?.id || "",
        "JouleCool",
      );
      setSites(userSites);

      // In edit mode, don't auto-select a site — the edit record provides the siteCode
      if (!editId && !siteCode && userSites.length > 0) {
        setSiteCode(userSites[0].site_code);
        loadTasks(true);
      }
    } catch (e) {
      console.error("Failed to load sites", e);
    } finally {
      setLoadingSites(false);
    }
  };

  // Site selection logic: loadTasks is called by useFocusEffect and manually on change.
  // No need for a separate siteCode useEffect which causes flickers.

  useEffect(() => {
    if (siteCode && user) {
      const saveDraft = async () => {
        try {
          const draftKey = `draft_temprh_${siteCode}_${user?.user_id}`;
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
  }, [logValues, signature, siteCode, user]);

  useFocusEffect(
    useCallback(() => {
      // In edit mode, loadTasks is called once on mount via loadSites/useEffect.
      // Don't re-run on focus — it would race with the edit record fetch.
      if (user && !editId) {
        loadTasks(true);
      }
    }, [user, shift, editId]),
  );

  const loadTasks = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

      let currentSiteCode = siteCode;
      let editRecord: any = null;
      const actualEditId = editId || id;

      // 1. If in edit mode, fetch the record FIRST to get the correct siteCode
      if (actualEditId) {
        try {
          editRecord = await SiteLogService.getSiteLogById(actualEditId);
          if (editRecord && editRecord.siteCode) {
            currentSiteCode = editRecord.siteCode;
            setSiteCode(currentSiteCode); // Update state to match record
          }
        } catch (e) {
          console.error("Failed to fetch edit record", e);
        }
      }

      // 2. In edit mode, build a single synthetic task from the record — skip getLogTasks
      //    (getLogTasks only returns today's logs, so older records won't appear)
      if (editRecord) {
        const taskId = editRecord.id;
        const taskName = editRecord.taskName || "Log Entry";
        setEditingTaskId(taskId);
        setTasks([{
          id: taskId,
          name: taskName,
          type: "area",
          isCompleted: false,
          status: (editRecord.status as any) || "Open",
          lastLogId: editRecord.id,
          meta: {
            temperature: editRecord.temperature,
            rh: editRecord.rh,
            remarks: editRecord.remarks,
            attachment: editRecord.attachment,
          },
        }]);
        setLogValues({
          [taskId]: {
            temp: editRecord.temperature?.toString() || "",
            rh: editRecord.rh?.toString() || "",
            attachment: editRecord.attachment || "",
          },
        });
        return;
      }

      // 3. Fallback to storage if no siteCode is known yet
      if (!currentSiteCode) {
        const storageKey = `last_site_${user?.user_id || user?.id}`;
        currentSiteCode = await AsyncStorage.getItem(storageKey);
      }

      if (currentSiteCode) {
        setSiteCode(currentSiteCode);
        const areaTasks = await SiteConfigService.getLogTasks(
          currentSiteCode,
          "Temp RH",
          null,
          null,
          shift,
        );

        setTasks(areaTasks);

        // AUTO-SYNC: fire once per mount if local DB is empty for this site.
        // The ref prevents re-triggering after the pull completes (avoids infinite loop).
        if (areaTasks.length === 0 && currentSiteCode && !autoSyncedRef.current) {
          autoSyncedRef.current = true;
          logger.info(`No local areas found for ${currentSiteCode}. Triggering one-shot auto-sync...`);
          SiteLogService.pullLogMaster()
            .then(() => SiteLogService.pullSiteLogs(currentSiteCode!, { logName: "Temp RH", status: "pending" }))
            .then(() => loadTasks(false))
            .catch(() => {});
        }

        const initialValues: Record<
          string,
          { temp: string; rh: string; attachment?: string }
        > = {};

        areaTasks.forEach((task) => {
          if (task.meta) {
            initialValues[task.id] = {
              temp: task.meta.temperature?.toString() || "",
              rh: task.meta.rh?.toString() || "",
              attachment: task.meta.attachment || "",
            };
          }
        });

        // Normal mode: Load draft after merging with DB values
        const draftKey = `draft_temprh_${currentSiteCode}_${user?.user_id}`;
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
        setLogValues(initialValues);
      }
    } catch (e) {
      console.error("Failed to load temp rh tasks", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTasks(false);
  }, [siteCode, user, shift]);

  const updateValue = useCallback(
    (taskId: string, field: "temp" | "rh" | "attachment", value: string) => {
      setLogValues((prev) => ({
        ...prev,
        [taskId]: {
          ...(prev[taskId] || {
            temp: "",
            rh: "",
            attachment: "",
          }),
          [field]: value,
        },
      }));
    },
    [],
  );

  const clearDraft = async () => {
    try {
      const draftKey = `draft_temprh_${siteCode}_${user?.user_id}`;
      await AsyncStorage.removeItem(draftKey);
      setLogValues({});
      setSignature("");
    } catch (e) {
      console.error("Failed to clear draft", e);
    }
  };

  const handleSaveWithSignature = async (sig: string) => {
    setSignatureModalVisible(false);

    const entriesToSave = [];
    const timestamps = {
      entryTime: entryTime,
      endTime: new Date().getTime(),
    };

    const allMatchedTasks = tasks.filter((t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    for (const task of allMatchedTasks) {
      const input = logValues[task.id];

      let status: "Open" | "Inprogress" | "Completed" = "Open";
      const hasTemp = !!(input?.temp && input.temp.trim().length > 0);
      const hasRH = !!(input?.rh && input.rh.trim().length > 0);

      if (hasTemp && hasRH) {
        status = "Completed";
      } else if (hasTemp || hasRH) {
        status = "Inprogress";
      }

      if (input && (hasTemp || hasRH || input.attachment)) {
        // Auto-generate remarks
        const shiftLabel = shift
          ? shift === "A"
            ? "1/3"
            : shift === "B"
              ? "2/3"
              : "3/3"
          : "";
        const autoRemarks = shiftLabel
          ? `Temp RH (${shiftLabel}) - ${format(new Date(), "dd-MM-yyyy")}`
          : "";

        entriesToSave.push({
          id: task.id,
          siteCode: siteCode,
          executorId: user?.user_id || user?.id || "unknown",
          assignedTo: user?.name || user?.user_id || "unknown",
          logName: "Temp RH",
          taskName: task.name,
          temperature: hasTemp ? parseFloat(input.temp) : null,
          rh: hasRH ? parseFloat(input.rh) : null,
          remarks: autoRemarks,
          signature: sig,
          entryTime: timestamps.entryTime,
          endTime: timestamps.endTime,
          status: status,
          attachment: input.attachment || null,
        });
      }
    }
    if (entriesToSave.length === 0) {
      Alert.alert(
        "No Data",
        "Please enter Temperature and RH for at least one visible area.",
      );
      return;
    }

    try {
      setSaving(true);
      if (editId) {
        await SiteLogService.updateSiteLog(editId, entriesToSave[0]);
      } else {
        await SiteLogService.saveBulkSiteLogs(entriesToSave);
      }
      await clearDraft();

      Alert.alert(
        "Success",
        editId
          ? "Log updated successfully."
          : `Saved ${entriesToSave.length} entries successfully.`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save logs");
    } finally {
      setSaving(false);
    }
  };

  const filteredData = useMemo(() => {
    // In edit mode, tasks is already pre-filtered to the single record
    if (editId) {
      return tasks;
    }

    let filtered = tasks.filter((task) => {
      if (!task.name || task.name.trim() === "") return false;
      const matchesSearch = task.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const isNotCompleted = task.status?.toLowerCase() !== "completed";
      if (!showCompleted) {
        return matchesSearch && isNotCompleted;
      }
      return matchesSearch;
    });

    return [...filtered].sort((a, b) => {
      const comparison = a.name.localeCompare(b.name);
      return sortDirection === "desc" ? -comparison : comparison;
    });
  }, [tasks, searchQuery, sortDirection, editId, showCompleted]);

  const renderItem = useCallback(
    ({ item }: { item: TaskItem }) => {
      const val = logValues[item.id] || {
        temp: "",
        rh: "",
        attachment: "",
      };
      const isUploading = !!uploadingAttachments[item.id];

      return (
        <LogItem
          item={item}
          value={val}
          isUploading={isUploading}
          onUpdateValue={updateValue}
        />
      );
    },
    [logValues, uploadingAttachments, updateValue],
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
                    Edit Temp RH Log
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
                    options={sites.map((s) => ({
                      label: s.name,
                      value: s.site_code,
                      description: s.site_code,
                    }))}
                    onChange={async (val) => {
                      setSiteCode(val);
                      await AsyncStorage.setItem(
                        `last_site_${user?.user_id || user?.id}`,
                        val,
                      );
                      // Force an immediate reload instead of waiting for useEffect
                      loadTasks(true);
                    }}
                    loading={loadingSites}
                  />
                </View>
              )}
              <View className="items-center justify-center">
                <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider text-center">
                  {format(new Date(), "dd MMM")}
                </Text>
                {shift && (
                  <View className="mt-1 px-2 py-0.5 bg-red-100 rounded-md">
                    <Text className="text-red-600 text-[9px] font-black uppercase tracking-tighter">
                      Shift {shift} (
                      {shift === "A" ? "1/3" : shift === "B" ? "2/3" : "3/3"})
                    </Text>
                  </View>
                )}
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
                  <CheckCircle2
                    size={18}
                    color={showCompleted ? "#16a34a" : "#94a3b8"}
                  />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {loading && tasks.length === 0 ? (
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
          ) : filteredData.length === 0 ? (
            <View className="flex-1 items-center justify-center p-10">
              <View className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center mb-4">
                <Thermometer size={24} color="#94a3b8" />
              </View>
              <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg text-center mb-2">
                {!siteCode ? "Please Select a Site" : "No Areas Found"}
              </Text>
              <Text className="text-slate-400 text-sm text-center mb-6">
                {!siteCode
                  ? "Choose a site from the dropdown above to view tasks."
                  : "We couldn't find any temperature logs or areas for this site. Try pulling latest data."}
              </Text>
              {siteCode && (
                <TouchableOpacity
                  onPress={() => onRefresh()}
                  className="bg-red-600 px-6 py-3 rounded-xl"
                >
                  <Text className="text-white font-bold uppercase tracking-wider text-xs">
                    Pull Latest Data
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <FlashList
              data={filteredData}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 20, paddingBottom: 150 }}
              renderItem={renderItem}
              // @ts-ignore - estimatedItemSize is a required prop for FlashList
              estimatedItemSize={150}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={["#dc2626"]}
                />
              }
            />
          )}
        </KeyboardAvoidingView>

        {/* Fixed Bottom Submit Button */}
        {filteredData.length > 0 && (
          <View className="absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 px-5 pb-8 pt-4">
            <TouchableOpacity
              onPress={() => editId ? handleSaveWithSignature(signature) : setSignatureModalVisible(true)}
              disabled={saving}
              activeOpacity={0.8}
              className={`py-4 rounded-xl flex-row items-center justify-center ${saving ? "bg-slate-200" : "bg-red-600 shadow-md shadow-red-600/20"}`}
              style={
                !saving
                  ? {
                      shadowColor: "#dc2626",
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
                  {editId ? "Update" : "Complete & Sign"}
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
                {editId ? "Sign to Update Log" : "Sign to Complete Bulk Entry"}
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
