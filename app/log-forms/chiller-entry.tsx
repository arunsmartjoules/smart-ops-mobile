import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft,
  Snowflake,
  Info,
  Camera,
  Trash2,
} from "lucide-react-native";
import SiteLogService from "@/services/SiteLogService";
import { useAuth } from "@/contexts/AuthContext";
import * as ImagePicker from "expo-image-picker";
import { StorageService } from "@/services/StorageService";

export default function ChillerEntry() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    chillerId: string;
    siteId: string;
    isNew?: string;
  }>();

  const [formData, setFormData] = useState({
    chillerId: params.isNew === "true" ? "" : params.chillerId || "",
    condenserInletTemp: "",
    condenserOutletTemp: "",
    evaporatorInletTemp: "",
    evaporatorOutletTemp: "",
    pressure: "",
    oilPressure: "",
    load: "",
    remarks: "",
    attachment: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleTakePhoto = async () => {
    try {
      const result = await ImagePicker.requestCameraPermissionsAsync();
      if (!result.granted) {
        Alert.alert(
          "Permission Required",
          "Camera permission is required to take photos.",
        );
        return;
      }

      const pickerResult = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
      });

      if (
        !pickerResult.canceled &&
        pickerResult.assets &&
        pickerResult.assets.length > 0
      ) {
        setUploading(true);
        const uri = pickerResult.assets[0].uri;

        // Generate filename
        const filename = `chiller/${params.siteId}/${Date.now()}.jpg`;

        // Upload
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
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.chillerId) {
      Alert.alert("Error", "Chiller ID is required");
      return;
    }

    try {
      setSaving(true);
      await SiteLogService.saveChillerReading({
        siteId: params.siteId,
        executorId: user?.user_id || user?.id || "unknown",
        chillerId: formData.chillerId,
        condenserInletTemp: parseFloat(formData.condenserInletTemp),
        condenserOutletTemp: parseFloat(formData.condenserOutletTemp),
        evaporatorInletTemp: parseFloat(formData.evaporatorInletTemp),
        evaporatorOutletTemp: parseFloat(formData.evaporatorOutletTemp),
        oilPressure: parseFloat(formData.oilPressure),
        compressorLoadPercentage: parseFloat(formData.load),
        remarks: formData.remarks,
        readingTime: new Date().getTime(),
        attachments: formData.attachment,
      });

      Alert.alert("Success", "Reading saved successfully", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save reading");
    } finally {
      setSaving(false);
    }
  };

  // ... (renderInput helper kept same, implicitly)

  const renderInput = (
    label: string,
    field: string,
    placeholder: string,
    widthClass = "w-full",
  ) => (
    <View className={`mb-4 ${widthClass}`}>
      <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">
        {label}
      </Text>
      <View
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 px-4"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 2,
        }}
      >
        <TextInput
          value={(formData as any)[field]}
          onChangeText={(val) => updateField(field, val)}
          placeholder={placeholder}
          keyboardType={field === "chillerId" ? "default" : "numeric"}
          editable={field !== "chillerId" || params.isNew === "true"}
          className={`py-4 font-bold text-lg ${field !== "chillerId" || params.isNew === "true" ? "text-slate-900 dark:text-slate-50" : "text-slate-400"}`}
        />
      </View>
    </View>
  );

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
              {params.isNew === "true" ? "New Chiller" : formData.chillerId}
            </Text>
            <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              Reading Entry
            </Text>
          </View>
          <View className="w-10" />
        </View>

        <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
          <View className="mt-2">
            {params.isNew === "true" &&
              renderInput("Chiller ID / Name", "chillerId", "e.g. Chiller-01")}

            <Text className="text-slate-900 dark:text-slate-50 font-bold text-base mb-4 mt-2">
              Temperatures (°C)
            </Text>
            <View className="flex-row flex-wrap justify-between">
              {renderInput(
                "Cond. Inlet",
                "condenserInletTemp",
                "--",
                "w-[48%]",
              )}
              {renderInput(
                "Cond. Outlet",
                "condenserOutletTemp",
                "--",
                "w-[48%]",
              )}
              {renderInput(
                "Evap. Inlet",
                "evaporatorInletTemp",
                "--",
                "w-[48%]",
              )}
              {renderInput(
                "Evap. Outlet",
                "evaporatorOutletTemp",
                "--",
                "w-[48%]",
              )}
            </View>

            <Text className="text-slate-900 dark:text-slate-50 font-bold text-base mb-4 mt-2">
              Pressure & Load
            </Text>
            <View className="flex-row flex-wrap justify-between">
              {renderInput(
                "Oil Pressure (PSI)",
                "oilPressure",
                "--",
                "w-[48%]",
              )}
              {renderInput("Comp. Load (%)", "load", "--", "w-[48%]")}
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
                  onPress={handleTakePhoto}
                  disabled={uploading}
                  className="w-full h-32 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl items-center justify-center bg-slate-50 dark:bg-slate-900"
                >
                  {uploading ? (
                    <ActivityIndicator color="#0d9488" />
                  ) : (
                    <>
                      <Camera size={24} color="#94a3b8" />
                      <Text className="text-slate-400 font-bold text-xs mt-2 uppercase tracking-wider">
                        Take Photo
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            <View className="mb-8 mt-2">
              <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">
                Remarks
              </Text>
              <TextInput
                value={formData.remarks}
                onChangeText={(val) => updateField("remarks", val)}
                placeholder="Any technical observations..."
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

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
              className={`py-4 rounded-xl flex-row items-center justify-center mb-10 ${saving ? "bg-slate-200" : "bg-teal-600 shadow-md shadow-teal-600/20"}`}
              style={
                !saving
                  ? {
                      shadowColor: "#0d9488",
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
                  Save Reading
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
