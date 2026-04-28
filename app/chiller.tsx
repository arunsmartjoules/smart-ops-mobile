import React, { useState, useEffect, useCallback, useRef } from "react";
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
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
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
import { db, chillerReadings } from "@/database";
import { eq } from "drizzle-orm";
import Skeleton from "@/components/Skeleton";
import { addDays, endOfDay, startOfDay } from "date-fns";

export default function ChillerEntry() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    id?: string;
    editId?: string;
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
  const [dailyReadingCount, setDailyReadingCount] = useState(0);
  const [loadingDailyProgress, setLoadingDailyProgress] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formDataRef = useRef(formData);

  const isEditMode = !!(params.editId || params.id);
  const targetId = (params.editId || params.id || "") as string;

  // Derived state to check if any technical field is filled (excluding IDs)
  const isAnyFieldFilled = Object.entries(formData).some(([key, value]) => {
    if (["chillerId", "equipmentId", "remarks", "attachment", "signature"].includes(key)) return false;
    return value !== "" && value !== null && value !== undefined;
  });

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    loadSites();
  }, [user?.user_id || user?.id]);

  useEffect(() => {
    loadAssets();
  }, [selectedSite]);

  const loadDailyProgress = useCallback(
    async (syncFromServer = false) => {
      if (isEditMode || !selectedSite) {
        setDailyReadingCount(0);
        return;
      }

      try {
        setLoadingDailyProgress(true);

        if (syncFromServer) {
          const fromDate = startOfDay(addDays(new Date(), -1)).getTime();
          const toDate = endOfDay(addDays(new Date(), 1)).getTime();
          await SiteLogService.pullChillerReadings(selectedSite, {
            fromDate,
            toDate,
          });
        }

        const count = await SiteLogService.getTodayChillerReadingCount(
          selectedSite,
        );
        setDailyReadingCount(count);
      } catch (e) {
        console.error("Failed to load chiller progress", e);
      } finally {
        setLoadingDailyProgress(false);
      }
    },
    [isEditMode, selectedSite],
  );

  useEffect(() => {
    if (targetId) {
      loadReading();
    }
  }, [targetId]);

  useEffect(() => {
    loadDailyProgress(true);
  }, [loadDailyProgress]);

  useFocusEffect(
    useCallback(() => {
      loadDailyProgress(true);
    }, [loadDailyProgress]),
  );

  useEffect(() => {
    if (!assets.length || !formData.chillerId) return;

    const hasSelectedAsset = assets.some(
      (asset) => asset.value === formData.chillerId,
    );
    if (hasSelectedAsset) return;

    const matchedAsset =
      assets.find((asset) => asset.value === formData.equipmentId) ||
      assets.find(
        (asset) =>
          asset.label.trim().toLowerCase() ===
          formData.chillerId.trim().toLowerCase(),
      );

    if (!matchedAsset) return;

    setFormData((prev) => ({
      ...prev,
      chillerId: matchedAsset.value,
      equipmentId: matchedAsset.value,
    }));
  }, [assets, formData.chillerId, formData.equipmentId]);

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
      if (!targetId) return;
      setLoading(true);
      const rows = await db
        .select()
        .from(chillerReadings)
        .where(eq(chillerReadings.id, targetId));
      const record = rows[0];
        if (record) {
          setSelectedSite(record.site_code);
          setFormData({
            chillerId: record.equipment_id || record.chiller_id || "",
            equipmentId: record.equipment_id || "",
            condenserInletTemp: record.condenser_inlet_temp?.toString() || "",
          condenserOutletTemp: record.condenser_outlet_temp?.toString() || "",
          evaporatorInletTemp: record.evaporator_inlet_temp?.toString() || "",
          evaporatorOutletTemp: record.evaporator_outlet_temp?.toString() || "",
          saturatedCondenserTemp:
            record.saturated_condenser_temp?.toString() || "",
          saturatedSuctionTemp: record.saturated_suction_temp?.toString() || "",
          compressorSuctionTemp: record.compressor_suction_temp?.toString() || "",
          motorTemperature: record.motor_temperature?.toString() || "",
          setPointCelsius: record.set_point_celsius?.toString() || "",
          dischargePressure: record.discharge_pressure?.toString() || "",
          mainSuctionPressure: record.main_suction_pressure?.toString() || "",
          oilPressure: record.oil_pressure?.toString() || "",
          oilPressureDifference: record.oil_pressure_difference?.toString() || "",
          condenserInletPressure:
            record.condenser_inlet_pressure?.toString() || "",
          condenserOutletPressure:
            record.condenser_outlet_pressure?.toString() || "",
          evaporatorInletPressure:
            record.evaporator_inlet_pressure?.toString() || "",
          evaporatorOutletPressure:
            record.evaporator_outlet_pressure?.toString() || "",
          load: record.compressor_load_percentage?.toString() || "",
          inlineBtuMeter: record.inline_btu_meter?.toString() || "",
          remarks: record.remarks || "",
          attachment: record.attachments || "",
          signature: record.signature_text || "",
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
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      
      // Auto-save logic (debounced)
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      
      // Auto-save only for actual reading/content fields, not selector changes.
      const autoSaveEligibleFields = new Set([
        "condenserInletTemp",
        "condenserOutletTemp",
        "evaporatorInletTemp",
        "evaporatorOutletTemp",
        "saturatedCondenserTemp",
        "saturatedSuctionTemp",
        "compressorSuctionTemp",
        "motorTemperature",
        "setPointCelsius",
        "dischargePressure",
        "mainSuctionPressure",
        "oilPressure",
        "oilPressureDifference",
        "condenserInletPressure",
        "condenserOutletPressure",
        "evaporatorInletPressure",
        "evaporatorOutletPressure",
        "load",
        "inlineBtuMeter",
        "remarks",
        "attachment",
      ]);

      // Only auto-save if we have a chiller selection and user updated an eligible field.
      if (next.chillerId && autoSaveEligibleFields.has(field)) {
        autoSaveTimerRef.current = setTimeout(() => {
          handleSubmission("In-progress", undefined, next);
        }, 1500); // 1.5s delay for technical logs
      }
      
      return next;
    });
  };


  const handleSubmission = async (
    status: string,
    sig?: string,
    formDataSnapshot?: typeof formData,
  ) => {
    const currentFormData = formDataSnapshot || formDataRef.current;

    if (!currentFormData.chillerId) {
      Alert.alert("Error", "Please select a Chiller asset");
      return;
    }

    const finalSignature = sig || currentFormData.signature;

    if (!isEditMode && status === "Completed" && !finalSignature) {
      Alert.alert("Error", "Signature is required to complete the log");
      return;
    }

    try {
      setSaving(true);
      const selectedAsset = assets.find((a) => a.value === currentFormData.chillerId);
      const assetName = selectedAsset?.label || currentFormData.chillerId;

      const payload = {
        siteCode: selectedSite,
        executorId: user?.employee_code || user?.user_id || user?.id || "unknown",
        chillerId: assetName,
        equipmentId: currentFormData.chillerId,
        assetName: assetName,
        assetType: selectedAsset?.description || "Chiller",
        condenserInletTemp: parseFloat(currentFormData.condenserInletTemp),
        condenserOutletTemp: parseFloat(currentFormData.condenserOutletTemp),
        evaporatorInletTemp: parseFloat(currentFormData.evaporatorInletTemp),
        evaporatorOutletTemp: parseFloat(currentFormData.evaporatorOutletTemp),
        saturatedCondenserTemp: parseFloat(currentFormData.saturatedCondenserTemp),
        saturatedSuctionTemp: parseFloat(currentFormData.saturatedSuctionTemp),
        compressorSuctionTemp: parseFloat(currentFormData.compressorSuctionTemp),
        motorTemperature: parseFloat(currentFormData.motorTemperature),
        setPointCelsius: parseFloat(currentFormData.setPointCelsius),
        dischargePressure: parseFloat(currentFormData.dischargePressure),
        mainSuctionPressure: parseFloat(currentFormData.mainSuctionPressure),
        oilPressure: parseFloat(currentFormData.oilPressure),
        oilPressureDifference: parseFloat(currentFormData.oilPressureDifference),
        condenserInletPressure: parseFloat(currentFormData.condenserInletPressure),
        condenserOutletPressure: parseFloat(currentFormData.condenserOutletPressure),
        evaporatorInletPressure: parseFloat(currentFormData.evaporatorInletPressure),
        evaporatorOutletPressure: parseFloat(currentFormData.evaporatorOutletPressure),
        compressorLoadPercentage: parseFloat(currentFormData.load),
        inlineBtuMeter: parseFloat(currentFormData.inlineBtuMeter),
        remarks: currentFormData.remarks,
        assignedTo: user?.full_name || user?.name || "unknown",
        signature: finalSignature,
        status: status,
        readingTime: params.readingTime
          ? parseInt(params.readingTime)
          : new Date().getTime(),
        attachments: currentFormData.attachment,
      };

      if (isEditMode) {
        const targetId = (params.editId || params.id) as string;
        await SiteLogService.updateChillerReading(targetId, payload);
      } else {
        await SiteLogService.saveChillerReading(payload);
      }

      if (status === "Completed") {
        await loadDailyProgress(true);
      }

      setSignatureModalVisible(false);
      if (status === "Completed") {
        Alert.alert("Success", "Reading completed successfully", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
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

  const progressSegments = [0, 1, 2].map((index) => {
    const segmentCount = Math.min(Math.max(dailyReadingCount - index * 4, 0), 4);
    return segmentCount / 4;
  });
  const progressDisplayCount = `${dailyReadingCount}/12`;

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" edges={["top"]}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 items-center justify-center"
          >
            <ChevronLeft size={20} color="#0f172a" />
          </TouchableOpacity>
          <View className="flex-1 items-center">
            <Text className="text-lg font-bold text-slate-900 dark:text-slate-50 text-center">
              {isEditMode ? "Edit Chiller Reading" : "Chiller Reading"}
            </Text>
            <Text className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-0.5">
              {isEditMode
                ? `ID: ${targetId.slice(-8).toUpperCase()}`
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
                {!isEditMode && (
                  <View className="mb-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-4 py-3">
                    <View className="flex-row items-center justify-between mb-2">
                      <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">
                        Today Progress
                      </Text>
                      <Text className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                        {loadingDailyProgress ? "Updating..." : progressDisplayCount}
                      </Text>
                    </View>
                    <View className="flex-row gap-2">
                      {progressSegments.map((progress, index) => (
                        <View
                          key={`progress-${index}`}
                          className="flex-1 h-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"
                        >
                          <View
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${progress * 100}%` }}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                )}

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
                  disabled={isEditMode} // Disable site change for existing records
                />

                <SearchableSelect
                  label="Chiller ID"
                  options={assets}
                  value={formData.chillerId}
                  onChange={(val) => updateField("chillerId", val)}
                  loading={loadingAssets}
                  placeholder="Select Chiller"
                  disabled={isEditMode || (params.isNew !== "true" && !!params.chillerId)}
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
            {/* Removed manual Save button as autosave is implemented */}
            
            <TouchableOpacity
              onPress={() => isEditMode ? handleSubmission("Completed") : setSignatureModalVisible(true)}
              disabled={saving || (!isEditMode && !isAnyFieldFilled)}
              activeOpacity={0.8}
              className="flex-1 rounded-xl overflow-hidden"
              style={{ opacity: (!isEditMode && !isAnyFieldFilled) ? 0.6 : 1 }}
            >
              <LinearGradient
                colors={isEditMode ? ["#334155", "#0f172a"] : ["#0d9488", "#0f766e"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View className="py-4 flex-row items-center justify-center">
                {saving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    {isEditMode ? (
                      <Save size={20} color="white" style={{ marginRight: 8 }} />
                    ) : (
                      <CheckCircle2 size={20} color="white" style={{ marginRight: 8 }} />
                    )}
                    <Text className="text-white font-bold text-base uppercase tracking-wider">
                      {isEditMode ? "Update Reading" : "Complete"}
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
                Sign to {isEditMode ? "Update" : "Complete"} Reading
              </Text>
              <TouchableOpacity onPress={() => setSignatureModalVisible(false)}>
                <Text className="text-purple-600 font-bold">Close</Text>
              </TouchableOpacity>
            </View>
            <SignaturePad
              standalone
              okText={isEditMode ? "Update Reading" : "Complete Reading"}
              onOK={(sig: string) => handleSubmission("Completed", sig)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
