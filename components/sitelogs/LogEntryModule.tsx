import React, { useState, useEffect, useCallback, useMemo } from "react";
import { 
  View, 
  Text, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator, 
  TextInput, 
  RefreshControl,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { Search, ChevronLeft, CheckCircle2, Droplets, FlaskConical, Thermometer, Filter } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/contexts/AuthContext";
import { SiteConfigService, TaskItem } from "@/services/SiteConfigService";
import { SiteLogService } from "@/services/SiteLogService";
import { UnifiedLogItem } from "./UnifiedLogItem";
import { DateNavBar } from "./DateNavBar";
import SignaturePad from "@/components/SignaturePad";
import { getISTDateString } from "@/services/AttendanceService";
import { db } from "@/database";

interface LogEntryModuleProps {
  type: "Chemical" | "Water" | "TempRH";
  siteCode?: string;
  onBack: () => void;
}

export const LogEntryModule = ({ type, siteCode: initialSiteCode, onBack }: LogEntryModuleProps) => {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ editId?: string; mode?: string }>();
  const editId = params.editId;
  const isEditMode = !!editId;
  
  // State
  const [scheduledDate, setScheduledDate] = useState(getISTDateString());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [siteCode, setSiteCode] = useState<string | null>(initialSiteCode || null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [shift, setShift] = useState<string | null>(type === "TempRH" ? "A" : null);
  
  // Form State
  const [logValues, setLogValues] = useState<Record<string, any>>({});
  const [signature, setSignature] = useState<string | null>(null);
  const [showSignature, setShowSignature] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Metadata
  const [prevCount, setPrevCount] = useState(0);
  const [nextCount, setNextCount] = useState(0);

  const logName = type === "TempRH" ? "Temp RH" : type === "Water" ? "Water Monitoring" : "Chemical Dosing";
  const screenTitle =
    type === "TempRH"
      ? "Temp RH"
      : type === "Water"
        ? "Water Monitoring"
        : "Chemical Dosing";
  // Load Sites
  useEffect(() => {
    const loadSites = async () => {
      try {
        const userSites = await db.query.userSites.findMany();
        if (!siteCode && userSites.length > 0) {
          const lastSite = await AsyncStorage.getItem(`last_site_${user?.id}`);
          setSiteCode(lastSite || userSites[0].site_code);
        }
      } catch {}
    };
    loadSites();
  }, []);

  // Sync Site Selection to AsyncStorage
  useEffect(() => {
    if (siteCode) {
      AsyncStorage.setItem(`last_site_${user?.id}`, siteCode);
    }
  }, [siteCode]);

  // Load Tasks
  // Load Tasks
  const loadTasks = async (showLoading = true) => {
    if (!siteCode) return;
    if (showLoading) setLoading(true);
    try {
      let finalTasks: TaskItem[] = [];
      const initialValues: Record<string, any> = {};

      if (editId) {
        // --- Edit Mode: Single Task ---
        const log = await SiteLogService.getSiteLogById(editId);
        if (log) {
          // Sync state with log
          setScheduledDate(log.scheduled_date);
          const logShift = log.remarks?.includes("1/3") ? "A" : log.remarks?.includes("2/3") ? "B" : log.remarks?.includes("3/3") ? "C" : null;
          if (logShift) setShift(logShift);
          
          const task: TaskItem = {
            id: log.id,
            name: log.task_name || "Manual Log",
            type: "area",
            isCompleted: log.status === "Completed",
            status: log.status,
            meta: log
          };
          finalTasks = [task];
          
          // Populate Initial Values
          if (type === "Chemical") {
            initialValues[task.id] = { dosing: log.chemical_dosing || "", attachment: log.attachment || "", mainRemarks: log.main_remarks || "" };
          } else if (type === "Water") {
            initialValues[task.id] = { tds: log.tds?.toString() || "", ph: log.ph?.toString() || "", hardness: log.hardness?.toString() || "", attachment: log.attachment || "", mainRemarks: log.main_remarks || "" };
          } else {
            initialValues[task.id] = { temp: log.temperature?.toString() || "", rh: log.rh?.toString() || "", attachment: log.attachment || "", mainRemarks: log.main_remarks || "" };
          }
          if (log.signature) setSignature(log.signature);
        }
      } else {
        // --- Entry Mode: Bulk Tasks ---
        finalTasks = await SiteConfigService.getPendingTasks(
          siteCode,
          logName,
          scheduledDate,
          shift || undefined
        );

        finalTasks.forEach(task => {
          if (type === "Chemical") {
            initialValues[task.id] = { dosing: task.meta?.chemical_dosing || "", attachment: task.meta?.attachment || "", mainRemarks: task.meta?.main_remarks || "" };
          } else if (type === "Water") {
            initialValues[task.id] = { tds: task.meta?.tds?.toString() || "", ph: task.meta?.ph?.toString() || "", hardness: task.meta?.hardness?.toString() || "", attachment: task.meta?.attachment || "", mainRemarks: task.meta?.main_remarks || "" };
          } else {
            initialValues[task.id] = { temp: task.meta?.temperature?.toString() || "", rh: task.meta?.rh?.toString() || "", attachment: task.meta?.attachment || "", mainRemarks: task.meta?.main_remarks || "" };
          }
        });

        // Load Draft
        const draftKey = `draft_${type.toLowerCase()}_${siteCode}_${user?.id}_${scheduledDate}${shift ? `_${shift}` : ""}`;
        const savedDraft = await AsyncStorage.getItem(draftKey);
        if (savedDraft) {
          try {
            const { values, signature: sig } = JSON.parse(savedDraft);
            if (values) {
              Object.keys(values).forEach(k => {
                if (initialValues[k]) initialValues[k] = { ...initialValues[k], ...values[k] };
              });
            }
            if (sig) setSignature(sig);
          } catch {}
        }

        // Background pending-only refresh so Open/Inprogress records are available
        // on first Start flow without forcing user to visit History first.
        void SiteLogService.prefetchPendingForCategory(siteCode, logName)
          .then(async () => {
            const refreshedTasks = await SiteConfigService.getPendingTasks(
              siteCode,
              logName,
              scheduledDate,
              shift || undefined,
            );

            const refreshedInitialValues: Record<string, any> = {};
            refreshedTasks.forEach((task) => {
              if (type === "Chemical") {
                refreshedInitialValues[task.id] = {
                  dosing: task.meta?.chemical_dosing || "",
                  attachment: task.meta?.attachment || "",
                  mainRemarks: task.meta?.main_remarks || "",
                };
              } else if (type === "Water") {
                refreshedInitialValues[task.id] = {
                  tds: task.meta?.tds?.toString() || "",
                  ph: task.meta?.ph?.toString() || "",
                  hardness: task.meta?.hardness?.toString() || "",
                  attachment: task.meta?.attachment || "",
                  mainRemarks: task.meta?.main_remarks || "",
                };
              } else {
                refreshedInitialValues[task.id] = {
                  temp: task.meta?.temperature?.toString() || "",
                  rh: task.meta?.rh?.toString() || "",
                  attachment: task.meta?.attachment || "",
                  mainRemarks: task.meta?.main_remarks || "",
                };
              }
            });

            setTasks(refreshedTasks);
            setLogValues((prev) => {
              const merged = { ...refreshedInitialValues };
              Object.keys(prev).forEach((key) => {
                if (merged[key]) {
                  merged[key] = { ...merged[key], ...prev[key] };
                } else {
                  merged[key] = prev[key];
                }
              });
              return merged;
            });
          })
          .catch(() => {});
      }

      setTasks(finalTasks);
      setLogValues(initialValues);

      // 4. Counts (only if not editing)
      if (!editId) {
        const counts = await SiteConfigService.getPendingCountSummary(siteCode, logName, scheduledDate);
        setPrevCount(counts.before);
        setNextCount(counts.after);
      } else {
        setPrevCount(0);
        setNextCount(0);
      }
    } catch (error) {
      console.error("Load tasks failed", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [siteCode, scheduledDate, shift, editId]);

  // Save Draft
  useEffect(() => {
    if (siteCode && Object.keys(logValues).length > 0 && !editId) {
      const draftKey = `draft_${type.toLowerCase()}_${siteCode}_${user?.id}_${scheduledDate}${shift ? `_${shift}` : ""}`;
      AsyncStorage.setItem(draftKey, JSON.stringify({ values: logValues, signature }));
    }
  }, [logValues, signature, editId]);

  const updateValue = (taskId: string, field: string, val: string) => {
    setLogValues(prev => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {}),
        [field]: val
      }
    }));
  };

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    if (!searchQuery) return tasks;
    return tasks.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [tasks, searchQuery]);

  const isTaskComplete = useCallback(
    (taskId: string) => {
      const value = logValues[taskId] || {};
      if (type === "Chemical") return !!value.dosing;
      if (type === "Water") {
        return !!(
          (value.tds && String(value.tds).trim().length > 0) ||
          (value.ph && String(value.ph).trim().length > 0) ||
          (value.hardness && String(value.hardness).trim().length > 0)
        );
      }
      return !!(
        value.temp &&
        String(value.temp).trim().length > 0 &&
        value.rh &&
        String(value.rh).trim().length > 0
      );
    },
    [logValues, type],
  );

  const allScheduledTasksComplete =
    tasks.length > 0 && tasks.every((task) => isTaskComplete(task.id));

  useEffect(() => {
    if (type !== "Chemical" || isEditMode) return;
  }, [allScheduledTasksComplete, isEditMode, isTaskComplete, searchQuery.length, tasks, type]);

  // Submission
  const handleSubmit = async (signatureOverride?: string) => {
    if (!siteCode) return;
    const effectiveSignature = signatureOverride || signature;
    
    if (!isEditMode && tasks.length === 0) {
      Alert.alert("No Data", "No scheduled logs are available for this selection.");
      return;
    }

    if (!isEditMode && !allScheduledTasksComplete) {
      Alert.alert(
        "Incomplete Logs",
        type === "TempRH"
          ? "Each card must have both Temp and RH values before completing."
          : type === "Water"
            ? "Each card must have at least one Water measurement before completing."
            : "Each card must have a Chemical Dosing selection before completing.",
      );
      return;
    }

    const entriesWithData = Object.values(logValues).filter(v => {
      if (type === "Chemical") return v.dosing;
      if (type === "Water") return v.tds || v.ph || v.hardness;
      return v.temp || v.rh;
    });

    if (entriesWithData.length === 0) {
      Alert.alert("No Data", "Please enter measurements for at least one area.");
      return;
    }

    if (!effectiveSignature && !isEditMode) {
      setShowSignature(true);
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditMode && editId && tasks[0]) {
        const task = tasks[0];
        const val = logValues[task.id] || {};
        const shiftLabel =
          shift === "A" ? " (1/3)" : shift === "B" ? " (2/3)" : shift === "C" ? " (3/3)" : "";

        if (type === "Chemical") {
          const hasDosing = !!val.dosing;
          await SiteLogService.updateSiteLog(editId, {
            chemicalDosing: val.dosing || null,
            mainRemarks: val.mainRemarks || null,
            remarks: (task.meta?.remarks || "") + shiftLabel,
            attachment: val.attachment || null,
            signature: effectiveSignature || undefined,
            status: hasDosing ? "Completed" : "Inprogress",
            assignedTo: user?.name || user?.user_id || "unknown",
          });
        } else if (type === "Water") {
          const hasTds = !!(val.tds && String(val.tds).trim().length > 0);
          const hasPh = !!(val.ph && String(val.ph).trim().length > 0);
          const hasHardness = !!(
            val.hardness && String(val.hardness).trim().length > 0
          );
          const status = hasTds || hasPh || hasHardness ? "Completed" : "Inprogress";

          await SiteLogService.updateSiteLog(editId, {
            tds: hasTds ? parseFloat(val.tds) : null,
            ph: hasPh ? parseFloat(val.ph) : null,
            hardness: hasHardness ? parseFloat(val.hardness) : null,
            mainRemarks: val.mainRemarks || null,
            remarks: (task.meta?.remarks || "") + shiftLabel,
            attachment: val.attachment || null,
            signature: effectiveSignature || undefined,
            status,
            assignedTo: user?.name || user?.user_id || "unknown",
          });
        } else {
          const hasTemp = !!(val.temp && String(val.temp).trim().length > 0);
          const hasRh = !!(val.rh && String(val.rh).trim().length > 0);
          const status =
            hasTemp && hasRh ? "Completed" : hasTemp || hasRh ? "Inprogress" : "Open";

          await SiteLogService.updateSiteLog(editId, {
            temperature: hasTemp ? parseFloat(val.temp) : null,
            rh: hasRh ? parseFloat(val.rh) : null,
            mainRemarks: val.mainRemarks || null,
            remarks: (task.meta?.remarks || "") + shiftLabel,
            attachment: val.attachment || null,
            signature: effectiveSignature || undefined,
            status,
            assignedTo: user?.name || user?.user_id || "unknown",
          });
        }

        Alert.alert("Success", "Log updated successfully!", [
          { text: "OK", onPress: () => onBack() },
        ]);
        return;
      }

      const payload = tasks.map(task => {
        const val = logValues[task.id];
        if (!val) return null;
        
        // Skip if NO data entered for this specific item
        const hasData = type === "Chemical" ? val.dosing : (type === "Water" ? (val.tds || val.ph || val.hardness) : (val.temp || val.rh));
        if (!hasData) return null;

        const shiftLabel = shift === "A" ? " (1/3)" : shift === "B" ? " (2/3)" : shift === "C" ? " (3/3)" : "";
        
        return {
          id: task.id, 
          site_code: siteCode,
          executor_id: user?.id || user?.user_id,
          log_name: logName,
          task_name: task.name,
          scheduled_date: scheduledDate,
          status: "Completed", 
          signature: effectiveSignature,
          main_remarks: val.mainRemarks || null,
          remarks: (task.meta?.remarks || "") + shiftLabel,
          // Specific fields
          ...(type === "Chemical" ? { chemical_dosing: val.dosing } : {}),
          ...(type === "Water" ? { tds: parseFloat(val.tds), ph: parseFloat(val.ph), hardness: parseFloat(val.hardness) } : {}),
          ...(type === "TempRH" ? { temperature: parseFloat(val.temp), rh: parseFloat(val.rh) } : {}),
          attachment: val.attachment
        };
      }).filter(Boolean);

      await SiteLogService.saveBulkSiteLogs(payload as any);
      
      // Clear Draft
      const draftKey = `draft_${type.toLowerCase()}_${siteCode}_${user?.id}_${scheduledDate}${shift ? `_${shift}` : ""}`;
      await AsyncStorage.removeItem(draftKey);
      
      Alert.alert("Success", "Logs submitted successfully!", [
        { text: "OK", onPress: () => loadTasks() }
      ]);
    } catch {
      Alert.alert("Error", "Failed to save logs. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        {/* Header Section */}
        <View className="px-5 pt-3 pb-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          <View className="flex-row items-center justify-between">
            <TouchableOpacity 
              onPress={onBack} 
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              className="w-10 h-10 rounded-2xl bg-slate-50 dark:bg-slate-800 items-center justify-center"
            >
              <ChevronLeft size={20} color="#0f172a" />
            </TouchableOpacity>
            <View className="flex-1 mx-3">
              <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">
                {isEditMode ? `Edit ${type === "TempRH" ? "Temp RH" : screenTitle}` : screenTitle}
              </Text>
              <Text className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                {isEditMode
                  ? tasks[0]?.name || "Manual Entry"
                  : `${filteredTasks.length} scheduled logs`}
              </Text>
            </View>
            <View className="px-3 py-1.5 rounded-2xl bg-slate-50 dark:bg-slate-800">
              {type === "TempRH" ? (
                <Thermometer size={16} color="#ef4444" />
              ) : type === "Water" ? (
                <Droplets size={16} color="#3b82f6" />
              ) : (
                <FlaskConical size={16} color="#9333ea" />
              )}
            </View>
          </View>

          {!isEditMode && (
            <View className="mt-3 gap-3">
              <View className="bg-slate-50 dark:bg-slate-800/70 rounded-2xl p-3 border border-slate-100 dark:border-slate-700">
                <DateNavBar
                  date={new Date(scheduledDate)}
                  onDateChange={(d: Date) => setScheduledDate(getISTDateString(d))}
                  showPicker={showDatePicker}
                  onShowPicker={setShowDatePicker}
                  prevCount={prevCount}
                  nextCount={nextCount}
                />

                {type === "TempRH" && (
                  <View className="flex-row mt-3 space-x-2 gap-2">
                    {["A", "B", "C"].map((s) => (
                      <TouchableOpacity
                        key={s}
                        onPress={() => setShift(s)}
                        className={`flex-1 flex-row items-center justify-center py-2.5 rounded-xl border ${
                          shift === s
                            ? "bg-slate-900 border-slate-900 dark:bg-slate-50 dark:border-slate-50"
                            : "bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700"
                        }`}
                      >
                        <Text className={`font-bold text-sm ${
                          shift === s
                            ? "text-white dark:text-slate-900"
                            : "text-slate-500"
                        }`}>
                          {s}
                        </Text>
                        <Text className={`ml-1 text-[10px] font-medium ${
                          shift === s ? "opacity-70 text-white dark:text-slate-900" : "text-slate-400"
                        }`}>
                          {s === "A" ? "(1/3)" : s === "B" ? "(2/3)" : "(3/3)"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View className="flex-row items-center bg-slate-50 dark:bg-slate-900 rounded-2xl px-4 py-1.5 border border-slate-100 dark:border-slate-800">
                <Search size={16} color="#94a3b8" />
                <TextInput
                  placeholder="Search areas..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  className="flex-1 ml-2 text-sm text-slate-900 dark:text-slate-50 py-2"
                  placeholderTextColor="#94a3b8"
                />
                <TouchableOpacity
                  onPress={() => loadTasks()}
                  className="ml-2 w-9 h-9 rounded-xl bg-white dark:bg-slate-800 items-center justify-center border border-slate-100 dark:border-slate-700"
                >
                  <Filter size={16} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Task List */}
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#b91c1c" />
            <Text className="mt-4 text-slate-400 font-medium italic">Getting your to-do list...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredTasks}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <UnifiedLogItem
                item={item}
                type={type}
                value={logValues[item.id] || {}}
                onUpdateValue={updateValue}
              />
            )}
            contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadTasks()} />}
            ListEmptyComponent={
              !loading && (
                <View className="py-20 items-center justify-center">
                  <View className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center mb-4">
                    <CheckCircle2 size={36} color="#cbd5e1" />
                  </View>
                  <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg">
                    {editId ? "Log Not Found" : "All Caught Up!"}
                  </Text>
                  <Text className="text-slate-400 dark:text-slate-500 text-sm mt-1 text-center px-10">
                    {editId ? "The log you are trying to edit could not be found." : `No pending ${type.toLowerCase()} logs found for this ${shift ? "shift" : "day"}.`}
                  </Text>
                </View>
              )
            }
          />
        )}

        {/* Footer Action */}
        {!loading && (
          <View className="absolute bottom-0 left-0 right-0 p-5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-100 dark:border-slate-800">
            <TouchableOpacity
              onPress={() => handleSubmit()}
              disabled={isSubmitting || (!isEditMode && !allScheduledTasksComplete)}
              className={`w-full py-4 rounded-2xl flex-row items-center justify-center ${(isSubmitting || (!isEditMode && !allScheduledTasksComplete)) ? "bg-slate-300" : "bg-purple-600 shadow-lg shadow-purple-500/30"}`}
            >
              {isSubmitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Text className="text-white font-bold text-lg uppercase tracking-wider">
                    {isEditMode ? "UPDATE LOG" : (signature ? "SUBMIT LOGS" : "COMPLETE & SIGN")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
      <Modal
        visible={showSignature}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSignature(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <SignaturePad
            standalone={true}
            onOK={(sig: string) => {
              setSignature(sig);
              setShowSignature(false);
              handleSubmit(sig);
            }}
            onClear={() => setSignature(null)}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
};
