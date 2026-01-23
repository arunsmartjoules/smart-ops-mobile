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
import { ChevronLeft, Snowflake, Info } from "lucide-react-native";
import SiteLogService from "@/services/SiteLogService";
import { useAuth } from "@/contexts/AuthContext";

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
    pressure: "", // General pressure field if needed
    oilPressure: "",
    load: "",
    remarks: "",
  });
  const [saving, setSaving] = useState(false);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
