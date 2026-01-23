import React, { useState, useEffect } from "react";
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
} from "react-native";
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

export default function WaterTaskList() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [siteId, setSiteId] = useState<string | null>(null);

  // Bulk Entry State
  const [logValues, setLogValues] = useState<
    Record<string, { tds: string; ph: string; hardness: string }>
  >({});
  const [signature, setSignature] = useState("");
  const [entryTime] = useState(new Date().getTime());
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadTasks();
  }, []);

  // Load draft from storage when siteId is ready
  useEffect(() => {
    if (siteId) {
      loadDraft();
    }
  }, [siteId]);

  // Save draft to storage whenever logValues or signature changes
  useEffect(() => {
    if (siteId) {
      const saveDraft = async () => {
        try {
          const draftKey = `draft_water_${siteId}_${user?.user_id}`;
          await AsyncStorage.setItem(
            draftKey,
            JSON.stringify({ values: logValues, signature }),
          );
        } catch (e) {
          console.error("Failed to save draft", e);
        }
      };
      const timer = setTimeout(saveDraft, 500); // Debounce
      return () => clearTimeout(timer);
    }
  }, [logValues, signature, siteId]);

  const loadDraft = async () => {
    try {
      const draftKey = `draft_water_${siteId}_${user?.user_id}`;
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
      const draftKey = `draft_water_${siteId}_${user?.user_id}`;
      await AsyncStorage.removeItem(draftKey);
      setLogValues({});
      setSignature("");
    } catch (e) {
      console.error("Failed to clear draft", e);
    }
  };

  const loadTasks = async () => {
    try {
      setLoading(true);
      const storageKey = `last_site_${user?.user_id || user?.id}`;
      const savedSiteId = await AsyncStorage.getItem(storageKey);

      if (savedSiteId) {
        setSiteId(savedSiteId);
        const areaTasks = await SiteConfigService.getLogTasks(
          savedSiteId,
          "Water",
        );
        setTasks(areaTasks);
      }
    } catch (error) {
      console.error("Failed to load water tasks", error);
    } finally {
      setLoading(false);
    }
  };

  const updateValue = (
    taskId: string,
    field: "tds" | "ph" | "hardness",
    value: string,
  ) => {
    setLogValues((prev) => ({
      ...prev,
      [taskId]: {
        ...prev[taskId],
        [field]: value,
      },
    }));
  };

  const handleBulkSave = async () => {
    if (!signature || signature.trim().length === 0) {
      Alert.alert("Required", "Please sign at the bottom before saving.");
      return;
    }

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
      if (input && input.tds && input.ph && input.hardness) {
        entriesToSave.push({
          siteId: siteId,
          executorId: user?.user_id || user?.id || "unknown",
          logName: "Water",
          taskName: task.name,
          tds: parseFloat(input.tds),
          ph: parseFloat(input.ph),
          hardness: parseFloat(input.hardness),
          remarks: `Area: ${task.name}`,
          signature: signature,
          entryTime: timestamps.entryTime,
          endTime: timestamps.endTime,
          status: "completed",
        });
      }
    }

    if (entriesToSave.length === 0) {
      Alert.alert(
        "No Data",
        "Please enter valid TDS, pH, and Hardness for at least one visible area.",
      );
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

  const filteredData = tasks.filter((task) =>
    task.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const renderItem = ({ item }: { item: TaskItem }) => {
    const val = logValues[item.id] || { tds: "", ph: "", hardness: "" };

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
              {/* Hidden text per user request */}
            </View>
          )}
        </View>

        <View className="flex-row space-x-2 gap-2">
          <View className="flex-1">
            <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg px-2 border border-slate-200 dark:border-slate-700">
              <Droplets size={14} color="#3b82f6" />
              <TextInput
                value={val.tds}
                onChangeText={(t) => updateValue(item.id, "tds", t)}
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
                value={val.ph}
                onChangeText={(t) => updateValue(item.id, "ph", t)}
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
                value={val.hardness}
                onChangeText={(t) => updateValue(item.id, "hardness", t)}
                placeholder="Hardness"
                keyboardType="numeric"
                className="flex-1 py-3 ml-1 font-bold text-slate-900 dark:text-slate-50 text-xs"
              />
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderFooter = () => (
    <View className="pb-10 pt-4">
      {filteredData.length > 0 && (
        <>
          <View className="mb-6 bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
            <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-3 ml-1">
              Signature (Required for Batch)
            </Text>
            <SignaturePad
              onOK={setSignature}
              onClear={() => setSignature("")}
            />
            {signature ? (
              <Text className="text-xs text-green-600 font-bold mt-2 ml-1">
                Signed ✓
              </Text>
            ) : (
              <Text className="text-xs text-amber-500 font-bold mt-2 ml-1">
                Tap above to sign
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={handleBulkSave}
            disabled={saving}
            activeOpacity={0.8}
            className={`py-4 rounded-xl flex-row items-center justify-center ${saving ? "bg-slate-200" : "bg-blue-600 shadow-md shadow-blue-600/20"}`}
          >
            {saving ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-base uppercase tracking-widest">
                Submit All Entries
              </Text>
            )}
          </TouchableOpacity>
        </>
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
                  Water (Bulk)
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
                onChangeText={setSearchQuery}
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
              data={filteredData}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 20 }}
              renderItem={renderItem}
              ListFooterComponent={renderFooter}
              removeClippedSubviews={false}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
