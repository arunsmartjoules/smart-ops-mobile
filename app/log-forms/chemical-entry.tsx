import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft,
  FlaskConical,
  Info,
  Camera,
  Trash2,
} from "lucide-react-native";
import SiteLogService from "@/services/SiteLogService";
import { useAuth } from "@/contexts/AuthContext";
import * as ImagePicker from "expo-image-picker";
import { StorageService } from "@/services/StorageService";
import { Image } from "react-native";

export default function ChemicalEntry() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    areaId: string;
    areaName: string;
    siteCode: string;
  }>();

  const [formData, setFormData] = useState({
    chemicalDosing: "",
    remarks: "",
    signature: "",
    attachment: "",
  });
  const [entryTime] = useState(new Date().getTime()); // Start timer on mount
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Pre-fill remarks if empty
  React.useEffect(() => {
    if (!formData.remarks && params.areaName) {
      setFormData((prev) => ({ ...prev, remarks: `Area: ${params.areaName}` }));
    }
  }, [params.areaName]);

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
          "site-log-attachments",
          filename,
          uri,
        );

        if (publicUrl) {
          updateField("attachment", publicUrl);
        } else {
          Alert.alert(
            "Upload Failed",
            "Could not upload image. Please try again.",
          );
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

  const handleSave = async () => {
    if (!formData.chemicalDosing) {
      Alert.alert("Error", "Please fill in the Chemical Dosing field");
      return;
    }

    if (!formData.signature || formData.signature.trim().length === 0) {
      Alert.alert("Error", "Signature is mandatory");
      return;
    }

    try {
      setSaving(true);
      const endTime = new Date().getTime();

      await SiteLogService.saveSiteLog({
        siteCode: params.siteCode,
        executorId: user?.user_id || user?.id || "unknown",
        logName: "Chemical Dosing",
        taskName: params.areaName,
        chemicalDosing: formData.chemicalDosing,
        remarks: formData.remarks,
        signature: formData.signature,
        entryTime: entryTime,
        endTime: endTime,
        status: "completed",
        attachment: formData.attachment,
      });

      Alert.alert("Success", "Log saved successfully", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save log");
    } finally {
      setSaving(false);
    }
  };

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
              New Entry
            </Text>
          </View>
          <View className="w-10" />
        </View>

        <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
          <View className="mt-4">
            <View className="mb-6">
              <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">
                Chemical Dosing Details
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
                <View className="mr-3">
                  <FlaskConical size={20} color="#a855f7" />
                </View>
                <TextInput
                  value={formData.chemicalDosing}
                  onChangeText={(val) => updateField("chemicalDosing", val)}
                  placeholder="Enter dosing details..."
                  className="flex-1 py-4 font-bold text-lg text-slate-900 dark:text-slate-50"
                />
              </View>
            </View>

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

            <View className="mb-8">
              <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">
                Signature (Required)
              </Text>
              <TextInput
                value={formData.signature}
                onChangeText={(val) => updateField("signature", val)}
                placeholder="Type name to sign..."
                className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 font-bold text-slate-900 dark:text-slate-50"
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 2,
                }}
              />
            </View>

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
              className={`py-4 rounded-xl flex-row items-center justify-center mb-10 ${saving ? "bg-slate-200" : "bg-purple-600 shadow-md shadow-purple-600/20"}`}
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
                  Submit Log
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
