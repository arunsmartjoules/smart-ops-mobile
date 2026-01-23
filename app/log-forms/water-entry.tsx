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
  Droplets,
  Info,
  Activity,
  Beaker,
} from "lucide-react-native";
import SiteLogService from "@/services/SiteLogService";
import { useAuth } from "@/contexts/AuthContext";

export default function WaterEntry() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    areaId: string;
    areaName: string;
    siteId: string;
  }>();

  const [formData, setFormData] = useState({
    tds: "",
    ph: "",
    hardness: "",
    remarks: "",
    signature: "",
  });
  const [entryTime] = useState(new Date().getTime()); // Start timer on mount
  const [saving, setSaving] = useState(false);

  // Pre-fill remarks if empty
  React.useEffect(() => {
    if (!formData.remarks && params.areaName) {
      setFormData((prev) => ({ ...prev, remarks: `Area: ${params.areaName}` }));
    }
  }, [params.areaName]);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.tds || !formData.ph || !formData.hardness) {
      Alert.alert(
        "Error",
        "Please fill in all required fields (TDS, pH, Hardness)",
      );
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
        siteId: params.siteId,
        executorId: user?.user_id || user?.id || "unknown",
        logName: "Water",
        taskName: params.areaName,
        tds: parseFloat(formData.tds),
        ph: parseFloat(formData.ph),
        hardness: parseFloat(formData.hardness),
        remarks: formData.remarks,
        signature: formData.signature,
        entryTime: entryTime,
        endTime: endTime,
        status: "completed",
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
              {params.areaName || "Water Log"}
            </Text>
            <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              New Entry
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
              className={`py-4 rounded-xl flex-row items-center justify-center mb-10 ${saving ? "bg-slate-200" : "bg-blue-600 shadow-md shadow-blue-600/20"}`}
              style={
                !saving
                  ? {
                      shadowColor: "#2563eb",
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
