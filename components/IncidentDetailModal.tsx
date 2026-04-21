import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Camera, Image as ImageIcon, X } from "lucide-react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import FullscreenPicker from "./FullscreenPicker";
import { type SelectOption } from "./SearchableSelect";

interface IncidentDetailModalProps {
  visible: boolean;
  incident: any | null;
  onClose: () => void;
  canEditRca: boolean;
  nextStatus: "Inprogress" | "Resolved" | null;
  setNextStatus: (value: "Inprogress" | "Resolved" | null) => void;
  remarks: string;
  setRemarks: (value: string) => void;
  rcaStatus: "Open" | "RCA Under Review" | "RCA Submitted";
  setRcaStatus: (value: "Open" | "RCA Under Review" | "RCA Submitted") => void;
  isUpdating: boolean;
  onSubmit: () => void;
  canEditMeta: boolean;
  assignedTo: string;
  setAssignedTo: (value: string) => void;
  assigneeOptions: SelectOption[];
  respondedAt: Date | null;
  setRespondedAt: (value: Date | null) => void;
  createdAt: Date | null;
  setCreatedAt: (value: Date | null) => void;
  resolvedAt: Date | null;
  setResolvedAt: (value: Date | null) => void;
  rcaChecker: string;
  setRcaChecker: (value: string) => void;
  rcaCheckerOptions: SelectOption[];
  existingAttachmentUrls: string[];
  pendingAttachments: string[];
  setPendingAttachments: React.Dispatch<React.SetStateAction<string[]>>;
  existingRcaAttachmentUrls: string[];
  pendingRcaAttachments: string[];
  setPendingRcaAttachments: React.Dispatch<React.SetStateAction<string[]>>;
}

const RCA_OPTIONS: ("Open" | "RCA Under Review" | "RCA Submitted")[] = [
  "Open",
  "RCA Under Review",
  "RCA Submitted",
];

export default function IncidentDetailModal({
  visible,
  incident,
  onClose,
  canEditRca,
  nextStatus,
  setNextStatus,
  remarks,
  setRemarks,
  rcaStatus,
  setRcaStatus,
  isUpdating,
  onSubmit,
  canEditMeta,
  assignedTo,
  setAssignedTo,
  assigneeOptions,
  respondedAt,
  setRespondedAt,
  createdAt,
  setCreatedAt,
  resolvedAt,
  setResolvedAt,
  rcaChecker,
  setRcaChecker,
  rcaCheckerOptions,
  existingAttachmentUrls,
  pendingAttachments,
  setPendingAttachments,
  existingRcaAttachmentUrls,
  pendingRcaAttachments,
  setPendingRcaAttachments,
}: IncidentDetailModalProps) {
  const isDark = useColorScheme() === "dark";
  const iconMuted = isDark ? "#cbd5e1" : "#64748b";

  const pickFromGallery = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.7,
        selectionLimit: 8,
      });
      if (!result.canceled) {
        const uris = result.assets.map((a) => a.uri).filter(Boolean);
        setPendingAttachments((prev) => [...prev, ...uris]);
      }
    } catch {
      Alert.alert("Error", "Unable to open the image library.");
    }
  }, [setPendingAttachments]);

  const capturePhoto = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Permission required", "Camera permission is required.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setPendingAttachments((prev) => [...prev, result.assets[0].uri]);
      }
    } catch {
      Alert.alert("Error", "Unable to open the camera.");
    }
  }, [setPendingAttachments]);

  const removePending = useCallback(
    (uri: string) => {
      setPendingAttachments((prev) => prev.filter((u) => u !== uri));
    },
    [setPendingAttachments],
  );

  const [pickerVisible, setPickerVisible] = React.useState(false);
  const [pickerTarget, setPickerTarget] = React.useState<"created" | "responded" | "resolved">("responded");

  const openDateTimePicker = (target: "created" | "responded" | "resolved") => {
    const now = new Date();
    const applyDate = (next: Date) => {
      if (next.getTime() > now.getTime()) {
        Alert.alert("Invalid time", "Future date/time is not allowed.");
        return;
      }
      if (target === "created") setCreatedAt(next);
      else if (target === "responded") setRespondedAt(next);
      else setResolvedAt(next);
    };

    if (Platform.OS === "android") {
      const base =
        target === "created"
          ? (createdAt || now)
          : target === "responded"
            ? (respondedAt || now)
            : (resolvedAt || now);
      DateTimePickerAndroid.open({
        value: base,
        mode: "date",
        is24Hour: true,
        maximumDate: now,
        onChange: (_evt, d1) => {
          if (!d1) return;
          DateTimePickerAndroid.open({
            value: d1,
            mode: "time",
            is24Hour: true,
            onChange: (_evt2, d2) => {
              if (!d2) return;
              applyDate(d2);
            },
          });
        },
      });
      return;
    }
    setPickerTarget(target);
    setPickerVisible(true);
  };

  if (!visible || !incident) return null;
  const isResolved = incident.status === "Resolved";
  const restrictResolvedEdits = isResolved && !canEditRca;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View className="flex-1 justify-end bg-black/55">
          <View className="bg-white dark:bg-slate-900 rounded-t-[36px] px-[22px] pt-[14px] pb-[18px] h-[92%] min-h-[420px]">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-slate-900 dark:text-slate-50 text-lg font-black">Incident Details</Text>
              <TouchableOpacity onPress={onClose} className="px-2 py-1">
                <Text className="text-slate-500 dark:text-slate-300 font-bold text-base">Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              <View className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 mb-3">
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-[15px]">{incident.fault_symptom}</Text>
                <Text className="text-slate-600 dark:text-slate-300 text-xs mt-1">Asset: {incident.asset_location || "-"}</Text>
                <Text className="text-slate-600 dark:text-slate-300 text-xs mt-1">Status: {incident.status}</Text>
              </View>

              <View className="mb-3">
                <Text className="text-slate-700 dark:text-slate-300 text-xs font-bold uppercase mb-2">Incident Created Time</Text>
                <TouchableOpacity
                  onPress={() => canEditMeta && openDateTimePicker("created")}
                  disabled={!canEditMeta}
                  className="border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-3"
                  style={{ opacity: canEditMeta ? 1 : 0.65 }}
                >
                  <Text className="text-slate-900 dark:text-slate-50">
                    {(createdAt || new Date(incident.incident_created_time || Date.now())).toLocaleString()}
                  </Text>
                </TouchableOpacity>
              </View>

              {!isResolved ? (
                <View className="mb-3">
                  <Text className="text-slate-700 dark:text-slate-300 text-xs font-bold uppercase mb-2">Status Transition</Text>
                  <View className="gap-2">
                    {incident.status === "Open" ? (
                      <TouchableOpacity
                        onPress={() => setNextStatus(nextStatus === "Inprogress" ? null : "Inprogress")}
                        className="flex-row items-center px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800"
                      >
                        <View className={`w-4 h-4 rounded border mr-2 items-center justify-center ${nextStatus === "Inprogress" ? "bg-red-600 border-red-600" : "border-slate-400 dark:border-slate-500"}`}>
                          {nextStatus === "Inprogress" ? <Text className="text-white text-[10px] font-black">✓</Text> : null}
                        </View>
                        <Text className="text-slate-700 dark:text-slate-200 text-xs font-bold">
                          Move to Inprogress
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    {incident.status === "Inprogress" ? (
                      <TouchableOpacity
                        onPress={() => setNextStatus(nextStatus === "Resolved" ? null : "Resolved")}
                        className="flex-row items-center px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800"
                      >
                        <View className={`w-4 h-4 rounded border mr-2 items-center justify-center ${nextStatus === "Resolved" ? "bg-red-600 border-red-600" : "border-slate-400 dark:border-slate-500"}`}>
                          {nextStatus === "Resolved" ? <Text className="text-white text-[10px] font-black">✓</Text> : null}
                        </View>
                        <Text className="text-slate-700 dark:text-slate-200 text-xs font-bold">
                          Move to Resolved
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ) : null}

              <FullscreenPicker
                label="Assigned To"
                placeholder="Select site user"
                options={assigneeOptions}
                value={assignedTo}
                onChange={setAssignedTo}
                disabled={restrictResolvedEdits}
              />

              {incident.status !== "Resolved" || nextStatus === "Inprogress" ? (
                <View className="mb-3">
                  <Text className="text-slate-700 dark:text-slate-300 text-xs font-bold uppercase mb-2">Incident Responded Time</Text>
                  <TouchableOpacity
                    onPress={() => canEditMeta && openDateTimePicker("responded")}
                    disabled={!canEditMeta}
                    className="border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-3"
                    style={{ opacity: canEditMeta ? 1 : 0.65 }}
                  >
                    <Text className="text-slate-900 dark:text-slate-50">
                      {(respondedAt || new Date()).toLocaleString()}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {(incident.status === "Inprogress" || nextStatus === "Resolved") ? (
                <View className="mb-3">
                  <Text className="text-slate-700 dark:text-slate-300 text-xs font-bold uppercase mb-2">Incident Resolved Time</Text>
                  <TouchableOpacity
                    onPress={() => canEditMeta && openDateTimePicker("resolved")}
                    disabled={!canEditMeta}
                    className="border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-3 mb-3"
                    style={{ opacity: canEditMeta ? 1 : 0.65 }}
                  >
                    <Text className="text-slate-900 dark:text-slate-50">
                      {(resolvedAt || new Date()).toLocaleString()}
                    </Text>
                  </TouchableOpacity>
                  <Text className="text-slate-700 dark:text-slate-300 text-xs font-bold uppercase mb-2">Remarks *</Text>
                  <TextInput
                    value={remarks}
                    onChangeText={setRemarks}
                    placeholder="Enter remarks"
                    placeholderTextColor="#94a3b8"
                    multiline
                    textAlignVertical="top"
                    className="border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-3 text-slate-900 dark:text-slate-50 min-h-[100px]"
                  />
                </View>
              ) : null}

              {isResolved ? (
                <View className="mb-3">
                  <Text className="text-slate-700 dark:text-slate-300 text-xs font-bold uppercase mb-2">Remarks</Text>
                  <TextInput
                    value={remarks}
                    onChangeText={setRemarks}
                    placeholder="Enter remarks"
                    placeholderTextColor="#94a3b8"
                    multiline
                    textAlignVertical="top"
                    className="border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-3 text-slate-900 dark:text-slate-50 min-h-[100px]"
                  />
                </View>
              ) : null}

              <View className="mb-3">
                <Text className="text-slate-700 dark:text-slate-300 text-xs font-bold uppercase mb-2">Attachments</Text>
                <Text className="text-slate-500 dark:text-slate-400 text-xs mb-2">
                  New photos are saved to the same incident attachments list when you tap Update.
                </Text>
                {(existingAttachmentUrls.length > 0 || pendingAttachments.length > 0) ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                    <View className="flex-row gap-2">
                      {existingAttachmentUrls.map((uri) => (
                        <Image key={`e-${uri}`} source={{ uri }} style={{ width: 72, height: 72, borderRadius: 12 }} />
                      ))}
                      {pendingAttachments.map((uri) => (
                        <View key={`p-${uri}`} className="relative">
                          <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: 12 }} />
                          <TouchableOpacity
                            onPress={() => removePending(uri)}
                            className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-black/70 items-center justify-center"
                          >
                            <X size={14} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                ) : (
                  <Text className="text-slate-500 dark:text-slate-400 text-xs mb-3">No attachments yet</Text>
                )}
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={capturePhoto}
                    className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex-row items-center"
                  >
                    <Camera size={16} color={iconMuted} />
                    <Text className="ml-2 text-slate-700 dark:text-slate-200 text-xs font-semibold">Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={pickFromGallery}
                    className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex-row items-center"
                  >
                    <ImageIcon size={16} color={iconMuted} />
                    <Text className="ml-2 text-slate-700 dark:text-slate-200 text-xs font-semibold">Gallery</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View className="mb-2">
                <Text className="text-slate-700 dark:text-slate-300 text-xs font-bold uppercase mb-2">RCA Status</Text>
                {canEditRca ? (
                  <>
                    <View className="flex-row gap-2 mb-3">
                      {RCA_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt}
                          onPress={() => setRcaStatus(opt)}
                          className={`px-3 py-2 rounded-xl ${rcaStatus === opt ? "bg-red-600" : "bg-slate-100 dark:bg-slate-800"}`}
                        >
                          <Text className={`${rcaStatus === opt ? "text-white" : "text-slate-700 dark:text-slate-200"} text-xs font-semibold`}>
                            {opt}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <FullscreenPicker
                      label="RCA Checker"
                      placeholder="Select RCA checker"
                      options={rcaCheckerOptions}
                      value={rcaChecker}
                      onChange={setRcaChecker}
                    />
                    <View className="mb-3">
                      <Text className="text-slate-700 dark:text-slate-300 text-xs font-bold uppercase mb-2">RCA Attachments</Text>
                      {(existingRcaAttachmentUrls.length > 0 || pendingRcaAttachments.length > 0) ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                          <View className="flex-row gap-2">
                            {existingRcaAttachmentUrls.map((uri) => (
                              <Image key={`er-${uri}`} source={{ uri }} style={{ width: 72, height: 72, borderRadius: 12 }} />
                            ))}
                            {pendingRcaAttachments.map((uri) => (
                              <View key={`pr-${uri}`} className="relative">
                                <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: 12 }} />
                                <TouchableOpacity
                                  onPress={() => setPendingRcaAttachments((prev) => prev.filter((u) => u !== uri))}
                                  className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-black/70 items-center justify-center"
                                >
                                  <X size={14} color="#fff" />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        </ScrollView>
                      ) : null}
                      <View className="flex-row gap-2">
                        <TouchableOpacity
                          onPress={async () => {
                            const p = await ImagePicker.requestCameraPermissionsAsync();
                            if (p.status !== "granted") return Alert.alert("Permission required", "Camera permission is required.");
                            const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 0.7 });
                            if (!r.canceled && r.assets?.[0]?.uri) setPendingRcaAttachments((prev) => [...prev, r.assets[0].uri]);
                          }}
                          className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex-row items-center"
                        >
                          <Camera size={16} color={iconMuted} />
                          <Text className="ml-2 text-slate-700 dark:text-slate-200 text-xs font-semibold">Camera</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={async () => {
                            const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, quality: 0.7, selectionLimit: 8 });
                            if (!r.canceled) {
                              const uris = r.assets.map((a) => a.uri).filter(Boolean);
                              setPendingRcaAttachments((prev) => [...prev, ...uris]);
                            }
                          }}
                          className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex-row items-center"
                        >
                          <ImageIcon size={16} color={iconMuted} />
                          <Text className="ml-2 text-slate-700 dark:text-slate-200 text-xs font-semibold">Gallery</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </>
                ) : (
                  <Text className="text-slate-600 dark:text-slate-300 text-sm">{rcaStatus}</Text>
                )}
              </View>
            </ScrollView>

            {pickerVisible && Platform.OS !== "android" ? (
              <DateTimePicker
                value={
                  pickerTarget === "created"
                    ? (createdAt || new Date())
                    : pickerTarget === "responded"
                      ? (respondedAt || new Date())
                      : (resolvedAt || new Date())
                }
                mode="datetime"
                maximumDate={new Date()}
                onChange={(_, d) => {
                  setPickerVisible(false);
                  if (!d) return;
                  if (d.getTime() > Date.now()) {
                    Alert.alert("Invalid time", "Future date/time is not allowed.");
                    return;
                  }
                  if (pickerTarget === "created") setCreatedAt(d);
                  else if (pickerTarget === "responded") setRespondedAt(d);
                  else setResolvedAt(d);
                }}
              />
            ) : null}

            <TouchableOpacity
              onPress={onSubmit}
              disabled={isUpdating || ((incident.status === "Open" || incident.status === "Inprogress") && !nextStatus)}
              className="bg-red-600 rounded-xl py-3 mt-1"
              style={{ opacity: (isUpdating || ((incident.status === "Open" || incident.status === "Inprogress") && !nextStatus)) ? 0.55 : 1 }}
            >
              {isUpdating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text className="text-white text-center font-black">Update Incident</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
