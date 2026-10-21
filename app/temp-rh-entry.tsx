import React, { useState, useEffect, useRef } from "react";
import { View, ScrollView, Alert } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { router, useLocalSearchParams } from "expo-router";
import SiteLogService from "@/services/SiteLogService";
import { formatAssignee } from "@/utils/assignee";
import { useAuth } from "@/contexts/AuthContext";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { StorageService } from "@/services/StorageService";
import { Card, JoPage, PrimaryButton, SecondaryButton } from "@/components/jo/ui";
import {
  AttachmentSlot,
  BottomBar,
  CardTitle,
  EntryHeader,
  EntryLoading,
  FormHeading,
  NumberField,
  ReadOnlyEntry,
  ReadOnlyField,
} from "@/components/sitelogs/LogsKit";
import { SignatureSheet } from "@/components/sitelogs/SignatureSheet";

export default function TempRHEntry() {
  const { canEdit } = useAttendanceGate();
  if (!canEdit) return <ReadOnlyEntry what="temperature and RH readings" />;
  return <TempRHEntryContent />;
}

function TempRHEntryContent() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    id?: string;
    areaId?: string;
    areaName?: string;
    siteCode?: string;
    mode?: string;
    shift?: string;
  }>();

  const isEditMode = params.mode === "edit" && !!params.id;

  const [formData, setFormData] = useState({
    temperature: "",
    rh: "",
    remarks: "",
    signature: "",
    attachment: "",
  });
  const [entryTime] = useState(new Date().getTime());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  // Read-only operator label shown when editing an existing log.
  const [assignedToDisplay, setAssignedToDisplay] = useState("");
  // Single-row model — see water-entry for the rationale.
  const currentLogIdRef = useRef<string | null>(null);
  const autoFlipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoFlipInFlightRef = useRef(false);
  const completedRef = useRef(false);

  const operatorName =
    user?.full_name?.trim() ||
    user?.name?.trim() ||
    user?.employee_code ||
    "unknown";

  // Load existing data in edit mode
  useEffect(() => {
    if (isEditMode && params.id) {
      currentLogIdRef.current = params.id;
      loadExistingLog(params.id);
    }
  }, [params.id, isEditMode]);

  useEffect(
    () => () => {
      if (autoFlipTimerRef.current) clearTimeout(autoFlipTimerRef.current);
    },
    [],
  );

  const loadExistingLog = async (id: string) => {
    try {
      setLoadingEdit(true);
      const log = await SiteLogService.getSiteLogById(id);
      if (log) {
        setAssignedToDisplay(
          formatAssignee(log.assigned_to, log.executor_id),
        );
        setFormData({
          temperature: log.temperature != null ? String(log.temperature) : "",
          rh: log.rh != null ? String(log.rh) : "",
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

  const ensureInprogressRow = async (snapshot: typeof formData) => {
    if (isEditMode) return;
    if (currentLogIdRef.current || completedRef.current) return;
    if (autoFlipInFlightRef.current) return;
    autoFlipInFlightRef.current = true;
    try {
      const created = await SiteLogService.saveSiteLog({
        siteCode: params.siteCode,
        executorId:
          user?.employee_code || user?.user_id || user?.id || "unknown",
        assignedTo: operatorName,
        logName: "Temp RH",
        taskName: params.areaName,
        temperature: snapshot.temperature
          ? parseFloat(snapshot.temperature)
          : null,
        rh: snapshot.rh ? parseFloat(snapshot.rh) : null,
        remarks: snapshot.remarks,
        attachment: snapshot.attachment,
        entryTime: entryTime,
        status: "Inprogress",
      });
      if (created?.id) currentLogIdRef.current = created.id;
    } catch (e) {
      console.error("ensureInprogressRow failed", e);
    } finally {
      autoFlipInFlightRef.current = false;
    }
  };

  const AUTO_FLIP_FIELDS = new Set(["temperature", "rh", "remarks"]);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (
        !isEditMode &&
        !currentLogIdRef.current &&
        !completedRef.current &&
        AUTO_FLIP_FIELDS.has(field) &&
        value.trim().length > 0
      ) {
        if (autoFlipTimerRef.current) clearTimeout(autoFlipTimerRef.current);
        autoFlipTimerRef.current = setTimeout(() => {
          ensureInprogressRow(next);
        }, 800);
      }
      return next;
    });
  };

  const processImageResult = async (result: ImagePicker.ImagePickerResult) => {
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setUploading(true);
      try {
        const uri = result.assets[0].uri;
        const filename = `temprh/${params.siteCode}/${Date.now()}.jpg`;
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

  const handleSave = async () => {
    try {
      setSaving(true);
      const hasTemp = !!(formData.temperature && formData.temperature.trim().length > 0);
      const hasRH = !!(formData.rh && formData.rh.trim().length > 0);
      const status = hasTemp && hasRH ? "Completed" : hasTemp || hasRH ? "Inprogress" : "Open";

      if (autoFlipTimerRef.current) clearTimeout(autoFlipTimerRef.current);
      const targetId = isEditMode ? params.id : currentLogIdRef.current;
      if (targetId) {
        await SiteLogService.updateSiteLog(targetId, {
          temperature: hasTemp ? parseFloat(formData.temperature) : null,
          rh: hasRH ? parseFloat(formData.rh) : null,
          remarks: formData.remarks,
          attachment: formData.attachment,
          status,
          assignedTo: operatorName,
          // A scheduled row is seeded with no operator and no times; the
          // completion write is the only place they can come from.
          executorId:
            user?.employee_code || user?.user_id || user?.id || "unknown",
          entryTime: entryTime,
        });
      } else {
        const created = await SiteLogService.saveSiteLog({
          siteCode: params.siteCode,
          executorId:
            user?.employee_code || user?.user_id || user?.id || "unknown",
          assignedTo: operatorName,
          logName: "Temp RH",
          taskName: params.areaName,
          temperature: hasTemp ? parseFloat(formData.temperature) : null,
          rh: hasRH ? parseFloat(formData.rh) : null,
          remarks: formData.remarks,
          attachment: formData.attachment,
          entryTime: entryTime,
          status,
        });
        if (created?.id) currentLogIdRef.current = created.id;
      }
      router.back();
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save log");
    } finally {
      setSaving(false);
    }
  };

  const handleCompletePress = () => {
    // Open signature modal
    setSignatureModalVisible(true);
  };

  const handleSaveWithSignature = async (sig: string) => {
    setSignatureModalVisible(false);

    try {
      setSaving(true);
      const endTime = new Date().getTime();

      // Determine status
      let status: "Open" | "Inprogress" | "Completed" = "Open";
      const hasTemp = !!(
        formData.temperature && formData.temperature.trim().length > 0
      );
      const hasRH = !!(formData.rh && formData.rh.trim().length > 0);

      if (hasTemp && hasRH) {
        status = "Completed";
      } else if (hasTemp || hasRH) {
        status = "Inprogress";
      }

      if (autoFlipTimerRef.current) clearTimeout(autoFlipTimerRef.current);
      completedRef.current = true;
      const targetId = isEditMode ? params.id : currentLogIdRef.current;
      if (targetId) {
        await SiteLogService.updateSiteLog(targetId, {
          temperature: hasTemp ? parseFloat(formData.temperature) : null,
          rh: hasRH ? parseFloat(formData.rh) : null,
          remarks: formData.remarks,
          signature: sig,
          endTime: endTime,
          status: status,
          attachment: formData.attachment,
          assignedTo: operatorName,
          // A scheduled row is seeded with no operator and no times; the
          // completion write is the only place they can come from.
          executorId:
            user?.employee_code || user?.user_id || user?.id || "unknown",
          entryTime: entryTime,
        });
      } else {
        const created = await SiteLogService.saveSiteLog({
          siteCode: params.siteCode,
          executorId:
            user?.employee_code || user?.user_id || user?.id || "unknown",
          assignedTo: operatorName,
          logName: "Temp RH",
          taskName: params.areaName,
          temperature: hasTemp ? parseFloat(formData.temperature) : null,
          rh: hasRH ? parseFloat(formData.rh) : null,
          remarks: formData.remarks,
          signature: sig,
          entryTime: entryTime,
          endTime: endTime,
          status: status,
          attachment: formData.attachment,
        });
        if (created?.id) currentLogIdRef.current = created.id;
      }

      // Optimistic UX: SiteLogService writes to SQLite + queue and fires the
      // network call without awaiting, so by here the user's data is durable
      // and we can navigate back instantly. Success haptic in place of the
      // old "OK" tap.
      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
      router.back();
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save log");
    } finally {
      setSaving(false);
    }
  };

  if (loadingEdit) {
    return <EntryLoading />;
  }

  return (
    <JoPage glow={false}>
      <EntryHeader
        title={params.areaName || "Temp/RH Log"}
        sub={isEditMode ? "Edit entry" : "New entry"}
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 150 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isEditMode && (
            <View style={{ marginBottom: 16 }}>
              <ReadOnlyField label="Assigned to" value={assignedToDisplay || "—"} icon="bx-user" />
            </View>
          )}

          <FormHeading>Record temperature & RH</FormHeading>

          <Card style={{ marginTop: 14, padding: 16, gap: 14 }}>
            <NumberField
              label="Temperature"
              value={formData.temperature}
              onChangeText={(val) => updateField("temperature", val)}
              placeholder="24.5"
              unit="°C"
              size="xl"
            />
            <NumberField
              label="Relative Humidity"
              value={formData.rh}
              onChangeText={(val) => updateField("rh", val)}
              placeholder="55"
              unit="%"
              size="xl"
            />
          </Card>

          <Card style={{ marginTop: 10, padding: 16 }}>
            <CardTitle>Attachment</CardTitle>
            <View style={{ marginTop: 10 }}>
              <AttachmentSlot
                value={formData.attachment}
                uploading={uploading}
                onAdd={handleAttachment}
                onRemove={() => updateField("attachment", "")}
              />
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Save (in progress) + Complete */}
      <BottomBar>
        <View style={{ flexDirection: "row", gap: 9 }}>
          <SecondaryButton
            label="Save"
            onPress={handleSave}
            busy={saving}
            height={54}
            style={{ flex: 1 }}
          />
          <PrimaryButton
            label={isEditMode ? "Update" : "Complete"}
            icon="bx-check"
            onPress={handleCompletePress}
            busy={saving}
            style={{ flex: 1 }}
          />
        </View>
      </BottomBar>

      <SignatureSheet
        visible={signatureModalVisible}
        title={`Sign to ${isEditMode ? "update" : "complete"}`}
        okText={isEditMode ? "Update Log" : "Complete Log"}
        onClose={() => setSignatureModalVisible(false)}
        onOK={(sig: string) => handleSaveWithSignature(sig)}
      />
    </JoPage>
  );
}
