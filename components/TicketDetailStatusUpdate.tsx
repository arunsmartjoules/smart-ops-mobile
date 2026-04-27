import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, TextInput, Image, Alert, ScrollView } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Camera, Image as ImageIcon, X } from "lucide-react-native";
import { type SelectOption } from "./SearchableSelect";
import FullscreenPicker from "./FullscreenPicker";
import { type Ticket } from "@/services/TicketsService";
import {
  DEFAULT_TICKET_INCIDENT_DRAFT,
  FAULT_TYPE_OPTIONS,
  OPERATING_CONDITION_OPTIONS,
  SEVERITY_OPTIONS,
  type TicketIncidentDraft,
} from "@/constants/incidentFormOptions";

/** Categories where before/after temperature fields are required (Inprogress / Resolved). */
export const AREA_TEMPERATURE_COMPLAINTS_CATEGORY = "Area Temperature Complaints";
export const AREA_RH_COMPLAINTS_CATEGORY = "Area RH Complaints";

export const isTempMandatoryCategory = (category: string) =>
  [AREA_TEMPERATURE_COMPLAINTS_CATEGORY, AREA_RH_COMPLAINTS_CATEGORY].includes(
    category.trim(),
  );

const STATUS_THEME: Record<
  string,
  { bg: string; activeBg: string; text: string; activeText: string }
> = {
  Open: {
    bg: "#fef2f2",
    activeBg: "#dc2626",
    text: "#dc2626",
    activeText: "#ffffff",
  },
  Inprogress: {
    bg: "#eff6ff",
    activeBg: "#2563eb",
    text: "#2563eb",
    activeText: "#ffffff",
  },
  Hold: {
    bg: "#fffbeb",
    activeBg: "#d97706",
    text: "#d97706",
    activeText: "#ffffff",
  },
  Waiting: {
    bg: "#f5f3ff",
    activeBg: "#7c3aed",
    text: "#7c3aed",
    activeText: "#ffffff",
  },
  Resolved: {
    bg: "#f0fdf4",
    activeBg: "#16a34a",
    text: "#16a34a",
    activeText: "#ffffff",
  },
  Cancelled: {
    bg: "#f1f5f9",
    activeBg: "#475569",
    text: "#475569",
    activeText: "#ffffff",
  },
};

interface TicketDetailStatusUpdateProps {
  ticket: Ticket;
  updateStatus: string;
  setUpdateStatus: (s: string) => void;
  updateRemarks: string;
  setUpdateRemarks: (s: string) => void;
  updateArea: string;
  setUpdateArea: (s: string) => void;
  updateCategory: string;
  setUpdateCategory: (s: string) => void;
  areaOptions: SelectOption[];
  categoryOptions: SelectOption[];
  areasLoading?: boolean;
  beforeTemp: string;
  setBeforeTemp: (v: string) => void;
  afterTemp: string;
  setAfterTemp: (v: string) => void;
  attachmentUri?: string;
  setAttachmentUri: (uri: string) => void;
  areaSearchQuery?: string;
  setAreaSearchQuery?: (query: string) => void;
  loadMoreAreas?: () => void;
  hasMoreAreas?: boolean;
  loadingMoreAreas?: boolean;
  createIncidentFromTicket?: boolean;
  setCreateIncidentFromTicket?: (v: boolean) => void;
  incidentDraft?: TicketIncidentDraft;
  setIncidentDraft?: React.Dispatch<React.SetStateAction<TicketIncidentDraft>>;
}

const TicketDetailStatusUpdate = ({
  ticket,
  updateStatus,
  setUpdateStatus,
  updateRemarks,
  setUpdateRemarks,
  updateArea,
  setUpdateArea,
  updateCategory,
  setUpdateCategory,
  areaOptions,
  categoryOptions,
  areasLoading,
  beforeTemp,
  setBeforeTemp,
  afterTemp,
  setAfterTemp,
  attachmentUri,
  setAttachmentUri,
  areaSearchQuery,
  setAreaSearchQuery,
  loadMoreAreas,
  hasMoreAreas,
  loadingMoreAreas,
  createIncidentFromTicket = false,
  setCreateIncidentFromTicket,
  incidentDraft = DEFAULT_TICKET_INCIDENT_DRAFT,
  setIncidentDraft,
}: TicketDetailStatusUpdateProps) => {
  const incidentFaultTypeOptions = useMemo(
    () => FAULT_TYPE_OPTIONS.map((value) => ({ value, label: value })),
    [],
  );
  const incidentSeverityOptions = useMemo(
    () => SEVERITY_OPTIONS.map((value) => ({ value, label: value })),
    [],
  );
  const incidentOperatingOptions = useMemo(
    () => OPERATING_CONDITION_OPTIONS.map((value) => ({ value, label: value })),
    [],
  );

  const statuses = [
    "Inprogress",
    "Hold",
    "Waiting",
    "Resolved",
    "Cancelled",
    "Open",
  ];

  const filteredStatuses = statuses.filter((s) => {
    if (ticket.status === "Resolved") return s === "Open";
    if (s === "Resolved" && ticket.status !== "Inprogress") return false;
    if (s === "Open") return false;
    if (s === ticket.status) return false;
    return true;
  });

  const needsRemarks = ["Hold", "Cancelled", "Waiting", "Resolved"].includes(
    updateStatus,
  );
  const showAreaAndCategory =
    updateStatus === "Inprogress" || updateStatus === "Resolved";
  const effectiveCategory = (
    updateCategory.trim() ||
    ticket.category ||
    ""
  ).trim();
  const mandatoryTempsForCategory =
    showAreaAndCategory &&
    isTempMandatoryCategory(effectiveCategory);
  const beforeTempMissing = mandatoryTempsForCategory && !beforeTemp.trim();
  const afterTempMissing = mandatoryTempsForCategory && !afterTemp.trim();

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.6,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setAttachmentUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Error", "Unable to open the image library.");
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Camera permission is required to take photos.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.6,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setAttachmentUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Error", "Unable to open the camera.");
    }
  };

  const pickIncidentAttachmentsFromGallery = async () => {
    if (!setIncidentDraft) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.7,
        selectionLimit: 8,
      });
      if (!result.canceled) {
        const uris = result.assets.map((a) => a.uri).filter(Boolean);
        setIncidentDraft((prev) => ({
          ...prev,
          incidentAttachments: [...prev.incidentAttachments, ...uris],
        }));
      }
    } catch {
      Alert.alert("Error", "Unable to open the image library.");
    }
  };

  const captureIncidentPhoto = async () => {
    if (!setIncidentDraft) return;
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Camera permission is required to take photos.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setIncidentDraft((prev) => ({
          ...prev,
          incidentAttachments: [...prev.incidentAttachments, result.assets[0].uri],
        }));
      }
    } catch {
      Alert.alert("Error", "Unable to open the camera.");
    }
  };

  const removeIncidentAttachment = (uri: string) => {
    if (!setIncidentDraft) return;
    setIncidentDraft((prev) => ({
      ...prev,
      incidentAttachments: prev.incidentAttachments.filter((x) => x !== uri),
    }));
  };

  return (
    <View style={{ marginBottom: 20 }}>
      {/* Section Label */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 14,
          gap: 8,
        }}
      >
        <Text
          className="text-slate-800 dark:text-slate-100"
          style={{
            fontWeight: "800",
            fontSize: 13,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Change Status
        </Text>
        <View
          className="bg-slate-200 dark:bg-slate-700"
          style={{ flex: 1, height: 1 }}
        />
        <Text style={{ color: "#94a3b8", fontSize: 11, fontWeight: "600" }} className="dark:text-slate-500">
          {ticket.status}
        </Text>
      </View>

      {/* Status Chips */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: needsRemarks || showAreaAndCategory ? 16 : 0,
        }}
      >
        {filteredStatuses.map((s) => {
          const isActive = updateStatus === s;
          const theme = STATUS_THEME[s] || STATUS_THEME.Open;
          return (
            <TouchableOpacity
              key={s}
              onPress={() => {
                setUpdateStatus(s);
                if (!["Hold", "Cancelled", "Waiting", "Resolved"].includes(s)) {
                  setAttachmentUri("");
                }
                if (["Hold", "Cancelled", "Waiting", "Resolved"].includes(s)) {
                  setUpdateRemarks("");
                }
              }}
              activeOpacity={0.7}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 9,
                borderRadius: 10,
                backgroundColor: isActive ? theme.activeBg : theme.bg,
                shadowColor: isActive ? theme.activeBg : "transparent",
                shadowOffset: { width: 0, height: isActive ? 4 : 0 },
                shadowOpacity: isActive ? 0.3 : 0,
                shadowRadius: isActive ? 8 : 0,
                elevation: isActive ? 4 : 0,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: isActive ? theme.activeText : theme.text,
                }}
              >
                {s === "Open" ? "Reopen" : s}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Area & Category (for Inprogress / Resolved) */}
      {showAreaAndCategory && (
        <View style={{ marginBottom: 8 }}>
          <FullscreenPicker
            label="Select Area *"
            placeholder="Choose an area..."
            value={updateArea}
            options={areaOptions}
            onChange={setUpdateArea}
            loading={areasLoading}
            searchPlaceholder="Search areas..."
            emptyMessage="No areas found"
            searchValue={areaSearchQuery}
            onSearchChange={setAreaSearchQuery}
            onLoadMore={loadMoreAreas}
            hasMore={hasMoreAreas}
            loadingMore={loadingMoreAreas}
            remoteSearch={Boolean(setAreaSearchQuery)}
          />
          <FullscreenPicker
            label="Select Category *"
            placeholder="Choose a category..."
            value={updateCategory}
            options={categoryOptions}
            onChange={setUpdateCategory}
            searchPlaceholder="Search categories..."
            emptyMessage="No categories found"
          />
        </View>
      )}

      {/* Before / After Temp (for Inprogress and Resolved) */}
      {(updateStatus === "Inprogress" || updateStatus === "Resolved") && (
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Text
              className="text-slate-500 dark:text-slate-400"
              style={{
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 1.2,
                marginBottom: 6,
                marginLeft: 2,
              }}
            >
              Before Temp (°C)
              {mandatoryTempsForCategory ? (
                <Text style={{ color: "#dc2626" }}> *</Text>
              ) : null}
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: beforeTempMissing ? "#dc2626" : undefined,
                borderRadius: 12,
                padding: 12,
                fontWeight: "600",
                fontSize: 14,
                textAlign: "center",
              }}
              className="bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-50 border-slate-200 dark:border-slate-700"
              placeholder="e.g. 24.5"
              placeholderTextColor="#94a3b8"
              keyboardType="decimal-pad"
              value={beforeTemp}
              onChangeText={setBeforeTemp}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              className="text-slate-500 dark:text-slate-400"
              style={{
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 1.2,
                marginBottom: 6,
                marginLeft: 2,
              }}
            >
              After Temp (°C)
              {mandatoryTempsForCategory ? (
                <Text style={{ color: "#dc2626" }}> *</Text>
              ) : null}
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: afterTempMissing ? "#dc2626" : undefined,
                borderRadius: 12,
                padding: 12,
                fontWeight: "600",
                fontSize: 14,
                textAlign: "center",
              }}
              className="bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-50 border-slate-200 dark:border-slate-700"
              placeholder="e.g. 22.0"
              placeholderTextColor="#94a3b8"
              keyboardType="decimal-pad"
              value={afterTemp}
              onChangeText={setAfterTemp}
            />
          </View>
        </View>
      )}

      {/* Remarks (for Hold, Cancelled, Waiting, Resolved) */}
      {needsRemarks && (
        <View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Text
              className="text-slate-500 dark:text-slate-400"
              style={{
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 1.2,
                marginLeft: 2,
              }}
            >
              Remarks <Text style={{ color: "#dc2626" }}>*</Text>
            </Text>
            <Text
              style={{
                fontSize: 10,
                fontWeight: "600",
                color: updateRemarks.length > 200 ? "#dc2626" : "#94a3b8",
              }}
            >
              {updateRemarks.length}/300
            </Text>
          </View>
          <TextInput
            style={{
              borderWidth: 1,
              borderRadius: 14,
              padding: 14,
              height: 100,
              fontWeight: "600",
              fontSize: 13,
              textAlignVertical: "top",
              lineHeight: 20,
            }}
            className="bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-50 border-slate-200 dark:border-slate-700"
            placeholder={
              updateStatus === "Resolved"
                ? "Describe the resolution..."
                : "Provide reason..."
            }
            placeholderTextColor="#94a3b8"
            multiline
            maxLength={300}
            value={updateRemarks}
            onChangeText={setUpdateRemarks}
          />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <TouchableOpacity
              onPress={takePhoto}
              className="bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 1,
              }}
            >
              <Camera size={18} color="#64748b" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={pickImage}
              className="bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 1,
              }}
            >
              <ImageIcon size={18} color="#64748b" />
            </TouchableOpacity>
            <View
              className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
              style={{
                flex: 1,
                minHeight: 40,
                borderRadius: 12,
                borderWidth: 1,
                justifyContent: "center",
                paddingHorizontal: 12,
              }}
            >
              <Text
                className="text-slate-500 dark:text-slate-400"
                style={{ fontSize: 12, fontWeight: "600" }}
              >
                {attachmentUri ? "1 image selected" : "Attach image (optional)"}
              </Text>
            </View>
          </View>
          {attachmentUri ? (
            <View style={{ marginTop: 10 }}>
              <View style={{ alignSelf: "flex-start" }}>
                <Image
                  source={{ uri: attachmentUri }}
                  style={{ width: 120, height: 120, borderRadius: 12 }}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  onPress={() => setAttachmentUri("")}
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: "rgba(15,23,42,0.75)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X size={14} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      )}

      {ticket.status === "Open" && setCreateIncidentFromTicket ? (
        <TouchableOpacity
          onPress={() => setCreateIncidentFromTicket(!createIncidentFromTicket)}
          style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10 }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 6,
              borderWidth: 1.5,
              borderColor: createIncidentFromTicket ? "#dc2626" : "#94a3b8",
              backgroundColor: createIncidentFromTicket ? "#dc2626" : "transparent",
            }}
          />
          <Text className="text-slate-700 dark:text-slate-200 text-sm font-semibold">
            Create Incident from this ticket update
          </Text>
        </TouchableOpacity>
      ) : null}

      {ticket.status === "Open" && createIncidentFromTicket && setIncidentDraft ? (
        <View
          className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 p-3"
          style={{ gap: 12 }}
        >
          <Text className="text-slate-600 dark:text-slate-400 text-xs leading-5">
            {"Incident will use this ticket's site, selected area, and ticket title. Fill the fields below."}
          </Text>

          <FullscreenPicker
            label="Fault Type *"
            placeholder="Select fault type"
            options={incidentFaultTypeOptions}
            value={incidentDraft.fault_type}
            onChange={(value) => setIncidentDraft((prev) => ({ ...prev, fault_type: value }))}
          />
          <FullscreenPicker
            label="Severity *"
            placeholder="Select severity"
            options={incidentSeverityOptions}
            value={incidentDraft.severity}
            onChange={(value) =>
              setIncidentDraft((prev) => ({
                ...prev,
                severity: value as TicketIncidentDraft["severity"],
              }))
            }
          />
          <FullscreenPicker
            label="Operating Condition *"
            placeholder="Select operating condition"
            options={incidentOperatingOptions}
            value={incidentDraft.operating_condition}
            onChange={(value) => setIncidentDraft((prev) => ({ ...prev, operating_condition: value }))}
          />

          <View>
            <Text className="text-slate-700 dark:text-slate-300 font-semibold text-sm mb-2">
              Immediate action taken
            </Text>
            <TextInput
              placeholder="Describe immediate action (optional if ticket remarks cover it)"
              placeholderTextColor="#94a3b8"
              value={incidentDraft.immediate_action_taken}
              onChangeText={(v) => setIncidentDraft((prev) => ({ ...prev, immediate_action_taken: v }))}
              multiline
              textAlignVertical="top"
              numberOfLines={4}
              className="border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-3 text-slate-900 dark:text-slate-50 min-h-[96px]"
            />
          </View>

          <View>
            <Text className="text-slate-700 dark:text-slate-300 font-semibold text-sm mb-2">
              Incident remarks (optional)
            </Text>
            <TextInput
              placeholder="Notes stored on the incident record"
              placeholderTextColor="#94a3b8"
              value={incidentDraft.incidentRemarks}
              onChangeText={(v) => setIncidentDraft((prev) => ({ ...prev, incidentRemarks: v }))}
              multiline
              textAlignVertical="top"
              numberOfLines={3}
              className="border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-3 text-slate-900 dark:text-slate-50 min-h-[72px]"
            />
          </View>

          <View>
            <Text className="text-slate-700 dark:text-slate-300 font-semibold text-sm mb-2">Attachments</Text>
            <View className="flex-row gap-2 mb-2">
              <TouchableOpacity
                onPress={captureIncidentPhoto}
                className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 flex-row items-center"
              >
                <Camera size={16} color="#64748b" />
                <Text className="ml-2 text-slate-700 dark:text-slate-200 text-xs font-semibold">Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={pickIncidentAttachmentsFromGallery}
                className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 flex-row items-center"
              >
                <ImageIcon size={16} color="#64748b" />
                <Text className="ml-2 text-slate-700 dark:text-slate-200 text-xs font-semibold">Gallery</Text>
              </TouchableOpacity>
            </View>
            {incidentDraft.incidentAttachments.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                  {incidentDraft.incidentAttachments.map((uri) => (
                    <View key={uri} className="relative">
                      <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: 12 }} />
                      <TouchableOpacity
                        onPress={() => removeIncidentAttachment(uri)}
                        className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-black/70 items-center justify-center"
                      >
                        <X size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <Text className="text-slate-500 dark:text-slate-400 text-xs">No attachments selected</Text>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
};

export default TicketDetailStatusUpdate;
