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
  FlaskConical,
  Camera,
  Trash2,
  ChevronDown,
  Check,
} from "lucide-react-native";
import SiteLogService from "@/services/SiteLogService";
import { useAuth } from "@/contexts/AuthContext";
import * as ImagePicker from "expo-image-picker";
import { StorageService } from "@/services/StorageService";
import SignaturePad from "@/components/SignaturePad";

export default function ChemicalEntry() {
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
    chemicalDosing: "",
    remarks: "",
    signature: "",
    attachment: "",
  });
  const [entryTime] = useState(new Date().getTime());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  const [showDosingPicker, setShowDosingPicker] = useState(false);

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
          chemicalDosing: log.chemicalDosing || "",
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
        const filename = `chemical/${params.siteCode}/${Date.now()}.jpg`;
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

  const handleCompletePress = () => {
    if (!formData.chemicalDosing) {
      Alert.alert("Error", "Please select Dosed or Not Dosed for Chemical Dosing");
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
          chemicalDosing: formData.chemicalDosing,
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
          logName: "Chemical Dosing",
          taskName: params.areaName,
          chemicalDosing: formData.chemicalDosing,
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

  if (loadingEdit) {
    return (
      <View className="flex-1 bg-slate-50 dark:bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color="#9333ea" />
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
              {params.areaName || "Chemical Log"}
            </Text>
            <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              {isEditMode ? "Edit Entry" : "New Entry"}
            </Text>
          </View>
          <View className="w-10" />
        </View>

        <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
          <View className="mt-4">
            <View className="flex-row items-end space-x-3 gap-3 mb-6">
              <View className="flex-1">
                <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">
                  Chemical Dosing Done?
                </Text>
                <TouchableOpacity
                  onPress={() => setShowDosingPicker(true)}
                  className="flex-row items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800"
                  style={{
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05,
                    shadowRadius: 4,
                    elevation: 2,
                  }}
                >
                  <View className="flex-row items-center">
                    <View className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-900/30 items-center justify-center mr-3">
                      <FlaskConical size={18} color="#9333ea" />
                    </View>
                    <Text
                      className={`font-bold text-lg ${formData.chemicalDosing ? "text-slate-900 dark:text-slate-50" : "text-slate-400"}`}
                    >
                      {formData.chemicalDosing === "Yes" ? "Dosed" : formData.chemicalDosing === "No" ? "Not Dosed" : "Select Option"}
                    </Text>
                  </View>
                  <ChevronDown size={20} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              <View className="w-24">
                <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">
                  Photo
                </Text>
                {formData.attachment ? (
                  <View className="relative">
                    <TouchableOpacity onPress={() => updateField("attachment", "")}>
                      <Image
                        source={{ uri: formData.attachment }}
                        className="w-full h-14 rounded-2xl bg-slate-100"
                        resizeMode="cover"
                      />
                      <View className="absolute top-1 right-1 bg-red-500 w-5 h-5 rounded-full items-center justify-center">
                        <Trash2 size={10} color="white" />
                      </View>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={handleAttachment}
                    disabled={uploading}
                    className="w-full h-14 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl items-center justify-center bg-white dark:bg-slate-900"
                  >
                    {uploading ? (
                      <ActivityIndicator size="small" color="#9333ea" />
                    ) : (
                      <Camera size={20} color="#94a3b8" />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Removed manual remarks and old attachment section */}

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
                Chemical Dosing Done?
              </Text>
            </View>
            {[
              { label: "Dosed", value: "Yes" },
              { label: "Not Dosed", value: "No" },
            ].map((option) => (
              <TouchableOpacity
                key={option.value}
                onPress={() => {
                  updateField("chemicalDosing", option.value);
                  setShowDosingPicker(false);
                }}
                className="flex-row items-center justify-between p-5 border-b border-slate-50 dark:border-slate-800/50 last:border-b-0"
              >
                <Text
                  className={`text-lg font-bold ${formData.chemicalDosing === option.value ? "text-purple-600" : "text-slate-600 dark:text-slate-400"}`}
                >
                  {option.label}
                </Text>
                {formData.chemicalDosing === option.value && (
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
