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
  Droplets,
  Activity,
  Beaker,
  Camera,
  Trash2,
} from "lucide-react-native";
import SiteLogService from "@/services/SiteLogService";
import { useAuth } from "@/contexts/AuthContext";
import * as ImagePicker from "expo-image-picker";
import { StorageService } from "@/services/StorageService";
import SignaturePad from "@/components/SignaturePad";

export default function WaterEntry() {
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
    tds: "",
    ph: "",
    hardness: "",
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
          tds: log.tds != null ? String(log.tds) : "",
          ph: log.ph != null ? String(log.ph) : "",
          hardness: log.hardness != null ? String(log.hardness) : "",
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
        const filename = `water/${params.siteCode}/${Date.now()}.jpg`;
        const publicUrl = await StorageService.uploadFile(
          "jouleops-attachments",
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
              mediaTypes: "images",
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
            mediaTypes: "images",
            quality: 0.5,
          });
          processImageResult(res);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      if (isEditMode && params.id) {
        await SiteLogService.updateSiteLog(params.id, {
          tds: formData.tds ? parseFloat(formData.tds) : null,
          ph: formData.ph ? parseFloat(formData.ph) : null,
          hardness: formData.hardness ? parseFloat(formData.hardness) : null,
          remarks: formData.remarks,
          attachment: formData.attachment,
          status: "Inprogress",
          assignedTo: user?.name || user?.user_id || "unknown",
        });
      } else {
        await SiteLogService.saveSiteLog({
          siteCode: params.siteCode,
          executorId: user?.user_id || user?.id || "unknown",
          assignedTo: user?.name || user?.user_id || "unknown",
          logName: "Water",
          taskName: params.areaName,
          tds: formData.tds ? parseFloat(formData.tds) : null,
          ph: formData.ph ? parseFloat(formData.ph) : null,
          hardness: formData.hardness ? parseFloat(formData.hardness) : null,
          remarks: formData.remarks,
          attachment: formData.attachment,
          entryTime: entryTime,
          status: "Inprogress",
        });
      }
      router.back();
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save log");
    } finally {
      setSaving(false);
    }
  };

  const handleCompletePress = () => {
    const hasData = !!(
      (formData.tds && formData.tds.trim().length > 0) ||
      (formData.ph && formData.ph.trim().length > 0) ||
      (formData.hardness && formData.hardness.trim().length > 0)
    );

    if (!hasData && !formData.remarks) {
      Alert.alert("Error", "Please enter at least one value or a remark");
      return;
    }

    setSignatureModalVisible(true);
  };

  const handleSaveWithSignature = async (sig: string) => {
    setSignatureModalVisible(false);

    try {
      setSaving(true);
      const endTime = new Date().getTime();

      if (isEditMode && params.id) {
        await SiteLogService.updateSiteLog(params.id, {
          tds: formData.tds ? parseFloat(formData.tds) : null,
          ph: formData.ph ? parseFloat(formData.ph) : null,
          hardness: formData.hardness ? parseFloat(formData.hardness) : null,
          remarks: formData.remarks,
          signature: sig,
          endTime: endTime,
          status: "Completed",
          attachment: formData.attachment,
          assignedTo: user?.name || user?.user_id || "unknown",
        });
      } else {
        await SiteLogService.saveSiteLog({
          siteCode: params.siteCode,
          executorId: user?.user_id || user?.id || "unknown",
          assignedTo: user?.name || user?.user_id || "unknown",
          logName: "Water",
          taskName: params.areaName,
          tds: formData.tds ? parseFloat(formData.tds) : null,
          ph: formData.ph ? parseFloat(formData.ph) : null,
          hardness: formData.hardness ? parseFloat(formData.hardness) : null,
          remarks: formData.remarks,
          signature: sig,
          entryTime: entryTime,
          endTime: endTime,
          status: "Completed",
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
        <ActivityIndicator size="large" color="#3b82f6" />
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
              Water Parameters
            </Text>
            <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              {isEditMode
                ? `Edit: ${params.areaName || ""}`
                : params.areaName || "New Entry"}
            </Text>
          </View>
          <View className="w-10" />
        </View>

        <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
          <View className="mt-4">
            {renderInput(
              "TDS",
              "tds",
              "150",
              <Droplets size={20} color="#3b82f6" />,
              "ppm",
            )}
            {renderInput(
              "pH Level",
              "ph",
              "7.0",
              <Activity size={20} color="#10b981" />,
              "pH",
            )}
            {renderInput(
              "Hardness",
              "hardness",
              "100",
              <Beaker size={20} color="#8b5cf6" />,
              "ppm",
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

            {/* Removed manual remarks */}

            {/* Spacer for fixed bottom button */}
            <View className="h-24" />
          </View>
        </ScrollView>

        {/* Fixed Bottom Buttons */}
        <View className="absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 px-5 pb-8 pt-4 flex-row gap-3">
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
            className="flex-1 py-4 rounded-xl items-center justify-center border-2 border-blue-600"
          >
            {saving ? (
              <ActivityIndicator color="#2563eb" />
            ) : (
              <Text className="text-blue-600 font-bold text-base uppercase tracking-widest">Save</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleCompletePress}
            disabled={saving}
            activeOpacity={0.8}
            className={`flex-1 py-4 rounded-xl flex-row items-center justify-center ${saving ? "bg-slate-200" : "bg-blue-600"}`}
            style={!saving ? { shadowColor: "#2563eb", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 } : {}}
          >
            {saving ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-base uppercase tracking-widest">
                {isEditMode ? "Update" : "Complete"}
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
