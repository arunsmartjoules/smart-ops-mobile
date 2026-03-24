import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft,
  Snowflake,
  Info,
  Camera,
  Trash2,
  Thermometer,
  Activity,
  Gauge,
  PenTool,
  CheckCircle2,
  Save,
} from "lucide-react-native";
import { SiteLogService } from "@/services/SiteLogService";
import AssetService from "@/services/AssetService";
import AttendanceService from "@/services/AttendanceService";
import { useAuth } from "@/contexts/AuthContext";
import { StorageService } from "@/services/StorageService";
import { LogImagePicker } from "@/components/sitelogs/LogImagePicker";
import SearchableSelect, { SelectOption } from "@/components/SearchableSelect";
import SignaturePad from "@/components/SignaturePad";
import { LinearGradient } from "expo-linear-gradient";
import { chillerReadingCollection } from "@/database";
import Skeleton from "@/components/Skeleton";

export default function ChillerEntry() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    id?: string;
    chillerId?: string;
    siteCode: string;
    isNew?: string;
    readingTime?: string;
  }>();

  const [formData, setFormData] = useState({
    chillerId: params.chillerId || "",
    equipmentId: "",
    // Temperatures
    condenserInletTemp: "",
    condenserOutletTemp: "",
    evaporatorInletTemp: "",
    evaporatorOutletTemp: "",
    saturatedCondenserTemp: "",
    saturatedSuctionTemp: "",
    compressorSuctionTemp: "",
    motorTemperature: "",
    setPointCelsius: "",
    // Pressures
    dischargePressure: "",
    mainSuctionPressure: "",
    oilPressure: "",
    oilPressureDifference: "",
    condenserInletPressure: "",
    condenserOutletPressure: "",
    evaporatorInletPressure: "",
    evaporatorOutletPressure: "",
    // Performance
    load: "",
    inlineBtuMeter: "",
    // Meta
    remarks: "",
    attachment: "",
    signature: "",
  });
  const [selectedSite, setSelectedSite] = useState(params.siteCode);
  const [sites, setSites] = useState<SelectOption[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);

  const [assets, setAssets] = useState<SelectOption[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);

  useEffect(() => {
    loadSites();
  }, [user?.user_id || user?.id]);

  useEffect(() => {
    loadAssets();
  }, [selectedSite]);

  useEffect(() => {
    if (params.id) {
      loadReading();
    }
  }, [params.id]);

  const ChillerFormSkeleton = () => (
    <View className="py-6">
      <View className="mb-6">
        <Skeleton width={120} height={10} style={{ marginBottom: 8 }} />
        <Skeleton width="100%" height={50} borderRadius={12} />
      </View>

      <View className="flex-row items-center mb-6">
        <Skeleton width={20} height={20} borderRadius={10} />
        <Skeleton width={150} height={15} style={{ marginLeft: 10 }} />
      </View>

      <View className="flex-row flex-wrap justify-between">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <View key={i} className="mb-6" style={{ width: "48%" }}>
            <Skeleton width={80} height={10} style={{ marginBottom: 8 }} />
            <Skeleton width="100%" height={45} borderRadius={12} />
          </View>
        ))}
      </View>

      <View className="flex-row items-center mt-4 mb-6">
        <Skeleton width={20} height={20} borderRadius={10} />
        <Skeleton width={150} height={15} style={{ marginLeft: 10 }} />
      </View>

      <View className="flex-row flex-wrap justify-between">
        {[1, 2, 3, 4].map((i) => (
          <View key={i} className="mb-6" style={{ width: "48%" }}>
            <Skeleton width={80} height={10} style={{ marginBottom: 8 }} />
            <Skeleton width="100%" height={45} borderRadius={12} />
          </View>
        ))}
      </View>
    </View>
  );

  const loadReading = async () => {
    try {
      if (!params.id) return;
      setLoading(true);
      const record: any = await chillerReadingCollection.find(params.id);
      if (record) {
        setSelectedSite(record.siteCode);
        setFormData({
          chillerId: record.chillerId || "",
          equipmentId: record.equipmentId || "",
          condenserInletTemp: record.condenserInletTemp?.toString() || "",
          condenserOutletTemp: record.condenserOutletTemp?.toString() || "",
          evaporatorInletTemp: record.evaporatorInletTemp?.toString() || "",
          evaporatorOutletTemp: record.evaporatorOutletTemp?.toString() || "",
          saturatedCondenserTemp:
            record.saturatedCondenserTemp?.toString() || "",
          saturatedSuctionTemp: record.saturatedSuctionTemp?.toString() || "",
          compressorSuctionTemp: record.compressorSuctionTemp?.toString() || "",
          motorTemperature: record.motorTemperature?.toString() || "",
          setPointCelsius: record.setPointCelsius?.toString() || "",
          dischargePressure: record.dischargePressure?.toString() || "",
          mainSuctionPressure: record.mainSuctionPressure?.toString() || "",
          oilPressure: record.oilPressure?.toString() || "",
          oilPressureDifference: record.oilPressureDifference?.toString() || "",
          condenserInletPressure:
            record.condenserInletPressure?.toString() || "",
          condenserOutletPressure:
            record.condenserOutletPressure?.toString() || "",
          evaporatorInletPressure:
            record.evaporatorInletPressure?.toString() || "",
          evaporatorOutletPressure:
            record.evaporatorOutletPressure?.toString() || "",
          load: record.compressorLoadPercentage?.toString() || "",
          inlineBtuMeter: record.inlineBtuMeter?.toString() || "",
          remarks: record.remarks || "",
          attachment: record.attachments || "",
          signature: record.signatureText || "",
        });
      }
    } catch (e) {
      console.error("Failed to load reading", e);
    } finally {
      setLoading(false);
    }
  };

  const loadSites = async () => {
    const userId = user?.user_id || user?.id;
    if (!userId) return;
    try {
      setLoadingSites(true);
      const data = await AttendanceService.getUserSites(userId, "JouleCool");
      const options = data.map((s) => ({
        value: s.site_code,
        label: `${s.site_code} - ${s.name}`,
      }));
      setSites(options);
    } catch (e) {
      console.error("Failed to load sites", e);
    } finally {
      setLoadingSites(false);
    }
  };

  const loadAssets = async () => {
    if (!selectedSite) return;
    try {
      setLoadingAssets(true);
      const data = await AssetService.getAssetsBySite(selectedSite, "Chiller");
      const options = data.map((asset: any) => ({
        value: asset.asset_id,
        label: asset.asset_name || asset.asset_id,
        description: asset.location || asset.equipment_type,
      }));
      setAssets(options);
    } catch (e) {
      console.error("Failed to load assets", e);
    } finally {
      setLoadingAssets(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };


  const handleSubmission = async (status: string, sig?: string) => {
    if (!formData.chillerId) {
      Alert.alert("Error", "Please select a Chiller asset");
      return;
    }

    const finalSignature = sig || formData.signature;

    if (status === "Completed" && !finalSignature) {
      Alert.alert("Error", "Signature is required to complete the log");
      return;
    }

    try {
      setSaving(true);
      const selectedAsset = assets.find((a) => a.value === formData.chillerId);

      const payload = {
        siteCode: selectedSite,
        executorId: user?.user_id || user?.id || "unknown",
        chillerId: formData.chillerId,
        equipmentId: formData.chillerId,
        assetName: selectedAsset?.label || formData.chillerId,
        assetType: selectedAsset?.description || "Chiller",
        condenserInletTemp: parseFloat(formData.condenserInletTemp),
        condenserOutletTemp: parseFloat(formData.condenserOutletTemp),
        evaporatorInletTemp: parseFloat(formData.evaporatorInletTemp),
        evaporatorOutletTemp: parseFloat(formData.evaporatorOutletTemp),
        saturatedCondenserTemp: parseFloat(formData.saturatedCondenserTemp),
        saturatedSuctionTemp: parseFloat(formData.saturatedSuctionTemp),
        compressorSuctionTemp: parseFloat(formData.compressorSuctionTemp),
        motorTemperature: parseFloat(formData.motorTemperature),
        setPointCelsius: parseFloat(formData.setPointCelsius),
        dischargePressure: parseFloat(formData.dischargePressure),
        mainSuctionPressure: parseFloat(formData.mainSuctionPressure),
        oilPressure: parseFloat(formData.oilPressure),
        oilPressureDifference: parseFloat(formData.oilPressureDifference),
        condenserInletPressure: parseFloat(formData.condenserInletPressure),
        condenserOutletPressure: parseFloat(formData.condenserOutletPressure),
        evaporatorInletPressure: parseFloat(formData.evaporatorInletPressure),
        evaporatorOutletPressure: parseFloat(formData.evaporatorOutletPressure),
        compressorLoadPercentage: parseFloat(formData.load),
        inlineBtuMeter: parseFloat(formData.inlineBtuMeter),
        remarks: formData.remarks,
        assignedTo: user?.full_name || user?.name || "unknown",
        signature: finalSignature,
        status: status,
        readingTime: params.readingTime
          ? parseInt(params.readingTime)
          : new Date().getTime(),
        attachments: formData.attachment,
      };

      if (params.id) {
        await SiteLogService.updateChillerReading(params.id, payload);
      } else {
        await SiteLogService.saveChillerReading(payload);
      }

      setSignatureModalVisible(false);
      Alert.alert("Success", `Reading ${status.toLowerCase()} successfully`, [
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
    unit?: string,
    widthClass = "w-full",
  ) => (
    <View className={`mb-4 ${widthClass}`}>
      <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1.5 ml-1">
        {label}
      </Text>
      <View
        className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 px-3 flex-row items-center"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.03,
          shadowRadius: 2,
          elevation: 1,
        }}
      >
        <TextInput
          value={(formData as any)[field]}
          onChangeText={(val) => updateField(field, val)}
          placeholder={placeholder}
          keyboardType="numeric"
          className="flex-1 py-3 font-semibold text-base text-slate-900 dark:text-slate-50"
        />
        {unit && (
          <Text className="text-slate-400 text-xs font-bold ml-1">{unit}</Text>
        )}
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
          <View className="flex-1 items-center">
            <Text className="text-lg font-bold text-slate-900 dark:text-slate-50 text-center">
              {params.id ? "Edit Chiller Reading" : "Chiller Reading"}
            </Text>
            <Text className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-0.5">
              {params.id
                ? `ID: ${params.id.slice(-8).toUpperCase()}`
                : `Chiller ID: ${formData.chillerId || params.chillerId}`}
            </Text>
          </View>
          <View className="w-10" />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: 120,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {loading ? (
              <ChillerFormSkeleton />
            ) : (
              <View className="py-6">
                <SearchableSelect
                  label="Site"
                  options={sites}
                  value={selectedSite}
                  onChange={(val) => {
                    setSelectedSite(val);
                    updateField("chillerId", ""); // Clear selection when site changes
                  }}
                  loading={loadingSites}
                  placeholder="Select Site"
                  disabled={!!params.id} // Disable site change for existing records
                />

                <SearchableSelect
                  label="Chiller ID"
                  options={assets}
                  value={formData.chillerId}
                  onChange={(val) => updateField("chillerId", val)}
                  loading={loadingAssets}
                  placeholder="Select Chiller"
                  disabled={params.isNew !== "true" && !!params.chillerId}
                />

                {/* Temperatures Section */}
                <View className="flex-row items-center mt-4 mb-4">
                  <Thermometer size={18} color="#ef4444" strokeWidth={2.5} />
                  <Text className="text-slate-900 dark:text-slate-50 font-bold text-base ml-2">
                    Temperatures (°C)
                  </Text>
                </View>
                <View className="flex-row flex-wrap justify-between">
                  {renderInput(
                    "Cond. Inlet",
                    "condenserInletTemp",
                    "0.0",
                    "°C",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Cond. Outlet",
                    "condenserOutletTemp",
                    "0.0",
                    "°C",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Evap. Inlet",
                    "evaporatorInletTemp",
                    "0.0",
                    "°C",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Evap. Outlet",
                    "evaporatorOutletTemp",
                    "0.0",
                    "°C",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Sat. Cond.",
                    "saturatedCondenserTemp",
                    "0.0",
                    "°C",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Sat. Suction",
                    "saturatedSuctionTemp",
                    "0.0",
                    "°C",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Comp. Suction",
                    "compressorSuctionTemp",
                    "0.0",
                    "°C",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Motor Temp",
                    "motorTemperature",
                    "0.0",
                    "°C",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Set Point",
                    "setPointCelsius",
                    "0.0",
                    "°C",
                    "w-[48%]",
                  )}
                </View>

                {/* Pressures Section */}
                <View className="flex-row items-center mt-4 mb-4">
                  <Gauge size={18} color="#3b82f6" strokeWidth={2.5} />
                  <Text className="text-slate-900 dark:text-slate-50 font-bold text-base ml-2">
                    Pressures (PSI)
                  </Text>
                </View>
                <View className="flex-row flex-wrap justify-between">
                  {renderInput(
                    "Discharge",
                    "dischargePressure",
                    "0.0",
                    "PSI",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Main Suction",
                    "mainSuctionPressure",
                    "0.0",
                    "PSI",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Oil Pressure",
                    "oilPressure",
                    "0.0",
                    "PSI",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Oil Diff.",
                    "oilPressureDifference",
                    "0.0",
                    "PSI",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Cond. Inlet P.",
                    "condenserInletPressure",
                    "0.0",
                    "PSI",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Cond. Outlet P.",
                    "condenserOutletPressure",
                    "0.0",
                    "PSI",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Evap. Inlet P.",
                    "evaporatorInletPressure",
                    "0.0",
                    "PSI",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Evap. Outlet P.",
                    "evaporatorOutletPressure",
                    "0.0",
                    "PSI",
                    "w-[48%]",
                  )}
                </View>

                {/* Performance Section */}
                <View className="flex-row items-center mt-4 mb-4">
                  <Activity size={18} color="#10b981" strokeWidth={2.5} />
                  <Text className="text-slate-900 dark:text-slate-50 font-bold text-base ml-2">
                    Performance & Load
                  </Text>
                </View>
                <View className="flex-row flex-wrap justify-between">
                  {renderInput("Comp. Load", "load", "0", "%", "w-[48%]")}
                  {renderInput(
                    "BTU Meter",
                    "inlineBtuMeter",
                    "0.0",
                    "TR",
                    "w-[48%]",
                  )}
                </View>

                {/* Attachments & Remarks */}
                <View className="mt-4 mb-6">
                  <Text className="text-slate-900 dark:text-slate-50 font-bold text-base mb-4">
                    Evidence & Observation
                  </Text>

                  <LogImagePicker
                    value={formData.attachment}
                    onImageChange={(url) => updateField("attachment", url || "")}
                    uploadPath={`chiller/${selectedSite}`}
                    disabled={uploading}
                  />

                  <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1.5 ml-1">
                    Remarks
                  </Text>
                  <TextInput
                    value={formData.remarks}
                    onChangeText={(val) => updateField("remarks", val)}
                    placeholder="Any technical observations..."
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 font-medium text-slate-900 dark:text-slate-50 min-h-[100px]"
                  />
                </View>

                {/* Removed Inline Signature Pad and integrated into 2-click modal flow */}
              </View>
            )}
          </ScrollView>

          {/* Action Buttons - Fixed at Bottom */}
          <View
            className="px-5 py-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex-row gap-4"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 10,
            }}
          >
            <TouchableOpacity
              onPress={() => handleSubmission("In-progress")}
              disabled={saving}
              className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 rounded-xl flex-row items-center justify-center"
            >
              <Save size={20} color="#64748b" style={{ marginRight: 8 }} />
              <Text className="text-slate-600 dark:text-slate-300 font-bold text-base uppercase tracking-wider">
                Save
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setSignatureModalVisible(true)}
              disabled={saving}
              activeOpacity={0.8}
              className="flex-[2] rounded-xl overflow-hidden"
            >
              <LinearGradient
                colors={["#0d9488", "#0f766e"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View className="py-4 flex-row items-center justify-center">
                {saving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <CheckCircle2
                      size={20}
                      color="white"
                      style={{ marginRight: 8 }}
                    />
                    <Text className="text-white font-bold text-base uppercase tracking-wider">
                      Complete
                    </Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Signature Modal for 2-Click Streamlined Flow */}
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
                Sign to {params.id ? "Update" : "Complete"} Reading
              </Text>
              <TouchableOpacity onPress={() => setSignatureModalVisible(false)}>
                <Text className="text-purple-600 font-bold">Close</Text>
              </TouchableOpacity>
            </View>
            <SignaturePad
              standalone
              okText={params.id ? "Update Reading" : "Complete Reading"}
              onOK={(sig: string) => handleSubmission("Completed", sig)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
