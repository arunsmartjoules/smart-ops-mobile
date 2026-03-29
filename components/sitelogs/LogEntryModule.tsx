import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { Search, ChevronLeft, Calendar as CalendarIcon, Filter, CheckCircle2 } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/contexts/AuthContext";
import { SiteConfigService, TaskItem } from "@/services/SiteConfigService";
import { SiteLogService } from "@/services/SiteLogService";
import { UnifiedLogItem } from "./UnifiedLogItem";
import { DateNavBar } from "./DateNavBar";
import SearchableSelect from "@/components/SearchableSelect";
import SignaturePad from "@/components/SignaturePad";
import { getISTDateString } from "@/services/AttendanceService";
import { startOfDay, endOfDay, format, addDays } from "date-fns";
import { db, logMaster } from "@/database";
import { eq } from "drizzle-orm";

interface LogEntryModuleProps {
  type: "Chemical" | "Water" | "TempRH";
  siteCode?: string;
  onBack: () => void;
}

export const LogEntryModule = ({ type, siteCode: initialSiteCode, onBack }: LogEntryModuleProps) => {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ editId?: string; mode?: string }>();
  const editId = params.editId;
  
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
  const [sites, setSites] = useState<any[]>([]);
  const [sequenceMap, setSequenceMap] = useState<Map<string, number>>(new Map());
  const [prevCount, setPrevCount] = useState(0);
  const [nextCount, setNextCount] = useState(0);

  const logName = type === "TempRH" ? "Temp RH" : type === "Water" ? "Water Monitoring" : "Chemical Dosing";

  // Load Sites
  useEffect(() => {
    const loadSites = async () => {
      try {
        const userSites = await db.query.userSites.findMany();
        setSites(userSites.map(s => ({ label: s.site_name, value: s.site_code })));
        if (!siteCode && userSites.length > 0) {
          const lastSite = await AsyncStorage.getItem(`last_site_${user?.id}`);
          setSiteCode(lastSite || userSites[0].site_code);
        }
      } catch (e) {}
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
            initialValues[task.id] = { dosing: log.chemical_dosing || "", attachment: log.attachment || "", remarks: (log.remarks || "").replace(/\s\(\d\/\d\)$/, "").trim() };
          } else if (type === "Water") {
            initialValues[task.id] = { tds: log.tds?.toString() || "", ph: log.ph?.toString() || "", hardness: log.hardness?.toString() || "", attachment: log.attachment || "", remarks: (log.remarks || "").replace(/\s\(\d\/\d\)$/, "").trim() };
          } else {
            initialValues[task.id] = { temp: log.temperature?.toString() || "", rh: log.rh?.toString() || "", attachment: log.attachment || "", remarks: (log.remarks || "").replace(/\s\(\d\/\d\)$/, "").trim() };
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
            initialValues[task.id] = { dosing: task.meta?.chemical_dosing || "", attachment: task.meta?.attachment || "", remarks: task.meta?.remarks || "" };
          } else if (type === "Water") {
            initialValues[task.id] = { tds: task.meta?.tds?.toString() || "", ph: task.meta?.ph?.toString() || "", hardness: task.meta?.hardness?.toString() || "", attachment: task.meta?.attachment || "", remarks: task.meta?.remarks || "" };
          } else {
            initialValues[task.id] = { temp: task.meta?.temperature?.toString() || "", rh: task.meta?.rh?.toString() || "", attachment: task.meta?.attachment || "", remarks: task.meta?.remarks || "" };
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
          } catch (e) {}
        }
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
    } catch (e) {
      console.error("Load tasks failed", e);
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

  // Submission
  const handleSubmit = async () => {
    if (!siteCode) return;
    
    // Validation: At least one entry must have data
    const entriesWithData = Object.values(logValues).filter(v => {
      if (type === "Chemical") return v.dosing;
      if (type === "Water") return v.tds || v.ph || v.hardness;
      return v.temp || v.rh;
    });

    if (entriesWithData.length === 0) {
      Alert.alert("No Data", "Please enter measurements for at least one area.");
      return;
    }

    if (!signature && !editId) {
      setShowSignature(true);
      return;
    }

    setIsSubmitting(true);
    try {
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
          signature: signature,
          remarks: (val.remarks || "") + shiftLabel,
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
    } catch (e) {
      Alert.alert("Error", "Failed to save logs. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        {/* Header Section */}
        <View className="px-5 py-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          <View className="flex-row items-center justify-between mb-4">
            <TouchableOpacity 
              onPress={onBack} 
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 items-center justify-center"
            >
              <ChevronLeft size={20} color="#0f172a" />
            </TouchableOpacity>
            <View className="flex-1 mx-3">
              {editId ? (
                <View className="py-2">
                  <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">Edit {type === "TempRH" ? "Temp/RH" : type} Log</Text>
                  <Text className="text-xs text-slate-500 font-bold uppercase">{siteCode} • {logValues[tasks[0]?.id]?.remarks || "Manual Entry"}</Text>
                </View>
              ) : type === "TempRH" ? (
                <SearchableSelect
                  label=""
                  placeholder="Select Site"
                  value={siteCode || ""}
                  options={sites}
                  onChange={setSiteCode}
                />
              ) : (
                <View className="py-2">
                  <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">{type === "Water" ? "Water Monitoring" : "Chemical Dosing"}</Text>
                  <Text className="text-xs text-slate-500 font-bold uppercase">{siteCode}</Text>
                </View>
              )}
            </View>
          </View>

          <DateNavBar
            date={new Date(scheduledDate)}
            onDateChange={(d: Date) => setScheduledDate(getISTDateString(d))}
            showPicker={showDatePicker}
            onShowPicker={setShowDatePicker}
            prevCount={prevCount}
            nextCount={nextCount}
          />

          {type === "TempRH" && (
            <View className="flex-row mt-4 space-x-2 gap-2">
              {["A", "B", "C"].map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setShift(s)}
                  className={`flex-1 flex-row items-center justify-center py-3 rounded-xl border ${
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

          {!editId && (
            <View className="px-5 py-3 flex-row items-center bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
              <View className="flex-row items-center bg-white dark:bg-slate-800 rounded-xl px-3 flex-1 h-10 border border-slate-100 dark:border-slate-800">
                <Search size={16} color="#94a3b8" />
                <TextInput
                  placeholder="Search areas..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  className="flex-1 ml-2 text-sm text-slate-900 dark:text-slate-50"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <TouchableOpacity 
                onPress={() => loadTasks()}
                className="ml-2 w-10 h-10 rounded-xl bg-white dark:bg-slate-800 items-center justify-center border border-slate-100 dark:border-slate-800"
              >
                <Filter size={18} color="#64748b" />
              </TouchableOpacity>
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
                onSelectDosing={(tid) => {
                  Alert.alert("Chemical Dosing", "Was dosing done?", [
                    { text: "Yes", onPress: () => updateValue(tid, "dosing", "Yes") },
                    { text: "No", onPress: () => updateValue(tid, "dosing", "No") },
                    { text: "Cancel", style: "cancel" }
                  ]);
                }}
              />
            )}
            contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
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
              disabled={isSubmitting}
              className={`w-full py-4 rounded-2xl flex-row items-center justify-center ${isSubmitting ? "bg-slate-300" : "bg-purple-600 shadow-lg shadow-purple-500/30"}`}
            >
              {isSubmitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Text className="text-white font-bold text-lg uppercase tracking-wider">
                    {editId ? "UPDATE LOG" : (signature ? "SUBMIT LOGS" : "COMPLETE & SIGN")}
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
              setTimeout(() => handleSubmit(), 500);
            }}
            onClear={() => setSignature(null)}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
};
