import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft,
  Thermometer,
  CloudRain,
  Camera,
  Trash2,
} from "lucide-react-native";
import SiteLogService from "@/services/SiteLogService";
import { useAuth } from "@/contexts/AuthContext";
import * as ImagePicker from "expo-image-picker";
import { StorageService } from "@/services/StorageService";
import SignaturePad from "@/components/SignaturePad";

export default function TempRHEntry() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    id?: string;
    areaId?: string;
    areaName?: string;
    siteCode?: string;
    mode?: string;
  }>();

  const isEditMode = params.mode === "edit" && !!params.id;

  const [formData, setFormData] = useState({
    temperature: "",
    rh: "",
    remarks: "",
    signature: "",
    attachment: "",
  });
  const [entryTime] = useState(new Date().getTime());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);

  // Load existing data in edit mode
  useEffect(() => {
    if (isEditMode && params.id) {
      loadExistingLog(params.id);
    }
  }, [params.id, isEditMode]);

  const loadExistingLog = async (id: string) => {
    try {
      setLoadingEdit(true);
      const log = await SiteLogService.getSiteLogById(id);
      if (log) {
        setFormData({
          temperature: log.temperature != null ? String(log.temperature) : "",
          rh: log.rh != null ? String(log.rh) : "",
          remarks: log.remarks || "",
          signature: log.signature || "",
          attachment: log.attachment || "",
        });
      }
    } catch (e) {
      console.error("Failed to load log for edit", e);
    } finally {
      setLoadingEdit(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const processImageResult = async (result: ImagePicker.ImagePickerResult) => {
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setUploading(true);
      try {
        const uri = result.assets[0].uri;
        const filename = `temprh/${params.siteCode}/${Date.now()}.jpg`;
        const publicUrl = await StorageService.uploadFile(
          "site-log-attachments",
          filename,
          uri,
        );
        if (publicUrl) {
          updateField("attachment", publicUrl);
        } else {
          Alert.alert("Upload Failed", "Could not upload image.");
        }
      } catch (e: any) {
        Alert.alert("Error", e.message);
      } finally {
        setUploading(false);
      }
    }
  };

  const handleAttachment = () => {
    Alert.alert("Add Attachment", "Choose an option", [
      {
        text: "Take Photo",
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (perm.granted) {
            const res = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.5,
            });
            processImageResult(res);
          } else {
            Alert.alert("Permission Required", "Camera permission is needed.");
          }
        },
      },
      {
        text: "Choose from Gallery",
        onPress: async () => {
          const res = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.5,
          });
          processImageResult(res);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleCompletePress = () => {
    // Open signature modal
    setSignatureModalVisible(true);
  };

  const handleSaveWithSignature = async (sig: string) => {
    setSignatureModalVisible(false);

    try {
      setSaving(true);
      const endTime = new Date().getTime();

      // Determine status
      let status: "Open" | "Inprogress" | "Completed" = "Open";
      const hasTemp = !!(
        formData.temperature && formData.temperature.trim().length > 0
      );
      const hasRH = !!(formData.rh && formData.rh.trim().length > 0);

      if (hasTemp && hasRH) {
        status = "Completed";
      } else if (hasTemp || hasRH) {
        status = "Inprogress";
      }

      if (isEditMode && params.id) {
        // Update existing log
        await SiteLogService.updateSiteLog(params.id, {
          temperature: hasTemp ? parseFloat(formData.temperature) : null,
          rh: hasRH ? parseFloat(formData.rh) : null,
          remarks: formData.remarks,
          signature: sig,
          endTime: endTime,
          status: status,
          attachment: formData.attachment,
          assignedTo: user?.name || user?.user_id || "unknown",
        });
      } else {
        // Create new log
        await SiteLogService.saveSiteLog({
          siteCode: params.siteCode,
          executorId: user?.user_id || user?.id || "unknown",
          assignedTo: user?.name || user?.user_id || "unknown",
          logName: "Temp RH",
          taskName: params.areaName,
          temperature: hasTemp ? parseFloat(formData.temperature) : null,
          rh: hasRH ? parseFloat(formData.rh) : null,
          remarks: formData.remarks,
          signature: sig,
          entryTime: entryTime,
          endTime: endTime,
          status: status,
          attachment: formData.attachment,
        });
      }

      Alert.alert(
        "Success",
        isEditMode ? "Log updated successfully" : "Log saved successfully",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save log");
    } finally {
      setSaving(false);
    }
  };

  const renderInput = (
    label: string,
    field: string,
    placeholder: string,
    icon: any,
    unit: string,
  ) => (
    <View className="mb-6">
      <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">
        {label}
      </Text>
      <View
        className="flex-row items-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 px-4"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 2,
        }}
      >
        <View className="mr-3">{icon}</View>
        <TextInput
          value={(formData as any)[field]}
          onChangeText={(val) => updateField(field, val)}
          placeholder={placeholder}
          keyboardType="numeric"
          className="flex-1 py-4 font-bold text-lg text-slate-900 dark:text-slate-50"
        />
        <Text className="text-slate-400 font-bold ml-2">{unit}</Text>
      </View>
    </View>
  );

  if (loadingEdit) {
    return (
      <View className="flex-1 bg-slate-50 dark:bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color="#dc2626" />
        <Text className="text-slate-500 mt-4 font-bold">Loading log...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" edges={["top"]}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 items-center justify-center"
          >
            <ChevronLeft size={20} color="#0f172a" />
          </TouchableOpacity>
          <View className="items-center">
            <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg">
              {params.areaName || "Temp/RH Log"}
            </Text>
            <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              {isEditMode ? "Edit Entry" : "New Entry"}
            </Text>
          </View>
          <View className="w-10" />
        </View>

        <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
          <View className="mt-4">
            {renderInput(
              "Temperature",
              "temperature",
              "24.5",
              <Thermometer size={20} color="#ef4444" />,
              "°C",
            )}
            {renderInput(
              "Relative Humidity",
              "rh",
              "55",
              <CloudRain size={20} color="#3b82f6" />,
              "%",
            )}

            <View className="mb-6 mt-2">
              <Text className="text-slate-900 dark:text-slate-50 font-bold text-base mb-4">
                Attachment
              </Text>
              {formData.attachment ? (
                <View className="relative">
                  <Image
                    source={{ uri: formData.attachment }}
                    className="w-full h-48 rounded-xl bg-slate-100"
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    onPress={() => updateField("attachment", "")}
                    className="absolute top-2 right-2 bg-red-500 w-8 h-8 rounded-full items-center justify-center p-1"
                  >
                    <Trash2 size={16} color="white" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={handleAttachment}
                  disabled={uploading}
                  className="w-full h-32 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl items-center justify-center bg-slate-50 dark:bg-slate-900"
                >
                  {uploading ? (
                    <ActivityIndicator color="#0d9488" />
                  ) : (
                    <>
                      <Camera size={24} color="#94a3b8" />
                      <Text className="text-slate-400 font-bold text-xs mt-2 uppercase tracking-wider">
                        Add Photo / Upload
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            <View className="mb-8">
              <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">
                Remarks
              </Text>
              <TextInput
                value={formData.remarks}
                onChangeText={(val) => updateField("remarks", val)}
                placeholder="Any observations..."
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 font-medium text-slate-900 dark:text-slate-50 min-h-[100px]"
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 2,
                }}
              />
            </View>

            {/* Spacer for fixed bottom button */}
            <View className="h-24" />
          </View>
        </ScrollView>

        {/* Fixed Bottom Submit Button */}
        <View className="absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 px-5 pb-8 pt-4">
          <TouchableOpacity
            onPress={handleCompletePress}
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
                {isEditMode ? "Update Log" : "Complete & Sign"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
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
                Sign to {isEditMode ? "Update" : "Complete"}
              </Text>
              <TouchableOpacity onPress={() => setSignatureModalVisible(false)}>
                <Text className="text-purple-600 font-bold">Close</Text>
              </TouchableOpacity>
            </View>
            <SignaturePad
              standalone
              okText={isEditMode ? "Update Log" : "Complete Log"}
              onOK={(sig: string) => handleSaveWithSignature(sig)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
