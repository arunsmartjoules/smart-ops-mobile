import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  X,
  ChevronLeft,
  Save,
  Info,
  Calendar,
  Clock,
  Camera,
} from "lucide-react-native";
import { LogTypeTab } from "@/components/sitelogs/LogTypeTab";
import {
  SignaturePad,
  SignaturePadHandle,
} from "@/components/sitelogs/SignaturePad";
import SiteLogService from "@/services/SiteLogService";
import { useAuth } from "@/contexts/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function NewSiteLog() {
  const { user } = useAuth();
  const [logType, setLogType] = useState("Temp RH");
  const [formData, setFormData] = useState<any>({
    temperature: "",
    rh: "",
    tds: "",
    ph: "",
    hardness: "",
    chemicalDosing: "",
    remarks: "",
    chillerId: "",
  });
  const [siteId, setSiteId] = useState<string | null>(null);
  const signatureRef = useRef<SignaturePadHandle>(null);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    const loadSite = async () => {
      const lastSite = await AsyncStorage.getItem(`last_site_${user?.user_id}`);
      setSiteId(lastSite);
    };
    loadSite();
  }, [user]);

  const handleSave = async () => {
    if (!siteId) {
      Alert.alert(
        "Error",
        "No site selected. Please select a site in the dashboard.",
      );
      return;
    }

    const signature = signatureRef.current?.getSignature();
    if (!signature) {
      Alert.alert(
        "Signature Required",
        "Please provide a signature before saving.",
      );
      return;
    }

    try {
      const commonData = {
        siteId,
        executorId: user?.user_id,
        entryTime: startTime,
        endTime: Date.now(),
        signature,
        remarks: formData.remarks,
      };

      if (logType === "Chiller Logs") {
        await SiteLogService.saveChillerReading({
          ...commonData,
          chillerId: formData.chillerId,
          // Map other fields as needed
        });
      } else {
        await SiteLogService.saveSiteLog({
          ...commonData,
          logName: logType,
          temperature: parseFloat(formData.temperature) || null,
          rh: parseFloat(formData.rh) || null,
          tds: parseFloat(formData.tds) || null,
          ph: parseFloat(formData.ph) || null,
          hardness: parseFloat(formData.hardness) || null,
          chemicalDosing: formData.chemicalDosing,
        });
      }

      Alert.alert("Success", "Log saved successfully!", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert("Error", `Failed to save log: ${error.message}`);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  return (
    <View className="flex-1 bg-white">
      <SafeAreaView className="flex-1" edges={["top"]}>
        <View className="px-5 py-4 flex-row items-center justify-between border-b border-slate-50">
          <View className="flex-row items-center">
            <TouchableOpacity onPress={() => router.back()} className="mr-3">
              <ChevronLeft size={24} color="#0f172a" />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-slate-900">
              New Site Log
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleSave}
            className="flex-row items-center bg-blue-600 px-4 py-2 rounded-full"
          >
            <Save size={18} color="white" />
            <Text className="text-white font-bold ml-2">Save</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <ScrollView className="flex-1 px-5 pt-4">
            <LogTypeTab activeTab={logType} onTabChange={setLogType} />

            <View className="mb-6">
              <Text className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 ml-1">
                Log Details
              </Text>

              <View className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                {logType === "Temp RH" && (
                  <View className="flex-row gap-4">
                    <View className="flex-1">
                      <Text className="text-slate-600 text-sm mb-1 ml-1">
                        Temp (°C)
                      </Text>
                      <TextInput
                        className="bg-white p-3 rounded-xl border border-slate-200"
                        placeholder="e.g. 24.5"
                        keyboardType="numeric"
                        value={formData.temperature}
                        onChangeText={(v) => updateField("temperature", v)}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-slate-600 text-sm mb-1 ml-1">
                        RH (%)
                      </Text>
                      <TextInput
                        className="bg-white p-3 rounded-xl border border-slate-200"
                        placeholder="e.g. 60"
                        keyboardType="numeric"
                        value={formData.rh}
                        onChangeText={(v) => updateField("rh", v)}
                      />
                    </View>
                  </View>
                )}

                {logType === "Water Parameters" && (
                  <View className="gap-4">
                    <View>
                      <Text className="text-slate-600 text-sm mb-1 ml-1">
                        TDS (ppm)
                      </Text>
                      <TextInput
                        className="bg-white p-3 rounded-xl border border-slate-200"
                        placeholder="e.g. 450"
                        keyboardType="numeric"
                        value={formData.tds}
                        onChangeText={(v) => updateField("tds", v)}
                      />
                    </View>
                    <View className="flex-row gap-4">
                      <View className="flex-1">
                        <Text className="text-slate-600 text-sm mb-1 ml-1">
                          pH
                        </Text>
                        <TextInput
                          className="bg-white p-3 rounded-xl border border-slate-200"
                          placeholder="7.0"
                          keyboardType="numeric"
                          value={formData.ph}
                          onChangeText={(v) => updateField("ph", v)}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-slate-600 text-sm mb-1 ml-1">
                          Hardness
                        </Text>
                        <TextInput
                          className="bg-white p-3 rounded-xl border border-slate-200"
                          placeholder="e.g. 200"
                          keyboardType="numeric"
                          value={formData.hardness}
                          onChangeText={(v) => updateField("hardness", v)}
                        />
                      </View>
                    </View>
                  </View>
                )}

                {logType === "Chemical Dosing" && (
                  <View>
                    <Text className="text-slate-600 text-sm mb-1 ml-1">
                      Dosing Details
                    </Text>
                    <TextInput
                      className="bg-white p-3 rounded-xl border border-slate-200 h-24"
                      placeholder="Enter dosing chemicals and quantities..."
                      multiline
                      value={formData.chemicalDosing}
                      onChangeText={(v) => updateField("chemicalDosing", v)}
                    />
                  </View>
                )}

                {logType === "Chiller Logs" && (
                  <View>
                    <Text className="text-slate-600 text-sm mb-1 ml-1">
                      Chiller ID
                    </Text>
                    <TextInput
                      className="bg-white p-3 rounded-xl border border-slate-200"
                      placeholder="e.g. CHL-01"
                      value={formData.chillerId}
                      onChangeText={(v) => updateField("chillerId", v)}
                    />
                    <Text className="text-slate-400 text-[10px] mt-2 italic px-1">
                      Note: Detailed chiller parameters are captured in the full
                      reading form.
                    </Text>
                  </View>
                )}

                <View className="mt-4">
                  <Text className="text-slate-600 text-sm mb-1 ml-1">
                    Main Remarks
                  </Text>
                  <TextInput
                    className="bg-white p-3 rounded-xl border border-slate-200 h-20"
                    placeholder="General observations..."
                    multiline
                    value={formData.remarks}
                    onChangeText={(v) => updateField("remarks", v)}
                  />
                </View>
              </View>
            </View>

            <View className="mb-10">
              <Text className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 ml-1">
                Technician Signature
              </Text>
              <SignaturePad ref={signatureRef} />
              <Text className="text-slate-400 text-center text-[10px] mt-2">
                Sign above to certify measurements
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
