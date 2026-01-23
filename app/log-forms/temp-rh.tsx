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
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
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
import * as ImagePicker from "expo-image-picker";
import { StorageService } from "@/services/StorageService";

export default function TempRHTaskList() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [siteId, setSiteId] = useState<string | null>(null);

  // Bulk Entry State
  const [logValues, setLogValues] = useState<
    Record<
      string,
      { temp: string; rh: string; attachment?: string; remarks?: string }
    >
  >({});
  const [signature, setSignature] = useState("");
  const [entryTime] = useState(new Date().getTime());
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadingAttachments, setUploadingAttachments] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        // We need to get the siteId either from params or the last active one
        const lastSite = await AsyncStorage.getItem(
          `last_site_${user?.user_id || user?.id}`,
        );

        if (lastSite) {
          setSiteId(lastSite);
          const t = await SiteConfigService.getLogTasks(lastSite, "Temp RH");
          setTasks(t);
        } else {
          // If no site selected, go back? or show empty?
          // For now, let's assume one is selected.
        }
      } catch (e) {
        console.error("Failed to load temp rh tasks", e);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      loadData();
    }
  }, [user]);

  const updateValue = (
    taskId: string,
    field: "temp" | "rh" | "attachment" | "remarks",
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

  const handleTakePhoto = async (taskId: string) => {
    try {
      const result = await ImagePicker.requestCameraPermissionsAsync();
      if (!result.granted) {
        Alert.alert("Permission Required", "Camera permission is required.");
        return;
      }

      const pickerResult = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        allowsEditing: false, // simpler experience
      });

      if (
        !pickerResult.canceled &&
        pickerResult.assets &&
        pickerResult.assets.length > 0
      ) {
        setUploadingAttachments((prev) => ({ ...prev, [taskId]: true }));
        const uri = pickerResult.assets[0].uri;

        const filename = `temprh/${siteId}/${taskId}_${Date.now()}.jpg`;
        const publicUrl = await StorageService.uploadFile(
          "site-log-attachments",
          filename,
          uri,
        );

        if (publicUrl) {
          updateValue(taskId, "attachment", publicUrl);
        } else {
          Alert.alert("Upload Failed", "Could not upload image.");
        }
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setUploadingAttachments((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  const clearDraft = async () => {
    try {
      const draftKey = `draft_temprh_${siteId}_${user?.user_id}`;
      await AsyncStorage.removeItem(draftKey);
      setLogValues({});
      setSignature("");
    } catch (e) {
      console.error("Failed to clear draft", e);
    }
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
      // Allow saving if just attachment is present? No, typically temp/rh are required.
      // But maybe user wants to safeguard photos.
      // Let's stick to requiring temp & rh as per existing logic, but include attachment if present.
      if (input && input.temp && input.rh) {
        entriesToSave.push({
          siteId: siteId,
          executorId: user?.user_id || user?.id || "unknown",
          logName: "Temp RH",
          taskName: task.name,
          temperature: parseFloat(input.temp),
          rh: parseFloat(input.rh),
          remarks: input.remarks || "",
          signature: signature,
          entryTime: timestamps.entryTime,
          endTime: timestamps.endTime,
          status: "completed",
          attachment: input.attachment || null, // Add attachment
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
    const val = logValues[item.id] || {
      temp: "",
      rh: "",
      attachment: "",
      remarks: "",
    };
    const isUploading = uploadingAttachments[item.id];

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

        <View className="flex-row space-x-3 gap-3 items-center mb-3">
          <View className="flex-1">
            <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg px-3 border border-slate-200 dark:border-slate-700">
              <Thermometer size={16} color="#ef4444" />
              <TextInput
                value={val.temp}
                onChangeText={(t) => updateValue(item.id, "temp", t)}
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
                value={val.rh}
                onChangeText={(t) => updateValue(item.id, "rh", t)}
                placeholder="RH"
                keyboardType="numeric"
                className="flex-1 py-3 ml-2 font-bold text-slate-900 dark:text-slate-50"
              />
              <Text className="text-xs text-slate-400 font-bold">%</Text>
            </View>
          </View>

          {/* Camera Button */}
          <TouchableOpacity
            onPress={() => handleTakePhoto(item.id)}
            disabled={isUploading}
            className={`w-12 h-12 rounded-xl items-center justify-center border ${val.attachment ? "bg-slate-100 border-slate-200" : "bg-slate-50 border-dashed border-slate-300"}`}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color="#0d9488" />
            ) : val.attachment ? (
              <Image
                source={{ uri: val.attachment }}
                className="w-10 h-10 rounded-lg"
              />
            ) : (
              <Camera size={20} color="#94a3b8" />
            )}
          </TouchableOpacity>
        </View>

        {/* Remarks Field */}
        <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg px-3 border border-slate-200 dark:border-slate-700">
          <TextInput
            value={val.remarks}
            onChangeText={(t) => updateValue(item.id, "remarks", t)}
            placeholder="Remarks (optional)"
            className="flex-1 py-3 font-medium text-slate-900 dark:text-slate-50 text-xs"
          />
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
            className={`py-4 rounded-xl flex-row items-center justify-center ${saving ? "bg-slate-200" : "bg-red-600 shadow-md shadow-red-600/20"}`}
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
                  Temp & RH
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
                placeholder="Filter areas..."
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
                <Thermometer size={24} color="#94a3b8" />
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
