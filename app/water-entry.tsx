import React, { useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, Alert } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { router, useLocalSearchParams } from "expo-router";
import SiteLogService from "@/services/SiteLogService";
import { formatAssignee } from "@/utils/assignee";
import { useAuth } from "@/contexts/AuthContext";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { StorageService } from "@/services/StorageService";
import { Card, JoPage, PrimaryButton, SecondaryButton, f, useJoTheme } from "@/components/jo/ui";
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

export default function WaterEntry() {
  const { canEdit } = useAttendanceGate();
  if (!canEdit) return <ReadOnlyEntry what="water readings" />;
  return <WaterEntryContent />;
}

function WaterEntryContent() {
  const t = useJoTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    id?: string;
    areaId?: string;
    areaName?: string;
    siteCode?: string;
    mode?: string;
  }>();

  const isEditMode = params.mode === "edit" && !!params.id;

  const [formData, setFormData] = useState({
    tds: "",
    ph: "",
    hardness: "",
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
  // Single-row model: the row this screen writes to. In edit mode it's
  // params.id; in new mode it's the row auto-created (status Inprogress) the
  // moment the first reading is entered. Save/Complete then UPDATE this same
  // row — never a second one.
  const currentLogIdRef = useRef<string | null>(null);
  const autoFlipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoFlipInFlightRef = useRef(false);
  const completedRef = useRef(false);

  // Load existing data in edit mode
  useEffect(() => {
    if (isEditMode && params.id) {
      currentLogIdRef.current = params.id;
      loadExistingLog(params.id);
    }
  }, [params.id, isEditMode]);

  // Clear any pending auto-Inprogress timer on unmount.
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
          tds: log.tds != null ? String(log.tds) : "",
          ph: log.ph != null ? String(log.ph) : "",
          hardness: log.hardness != null ? String(log.hardness) : "",
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

  // Create the single row as "Inprogress" the first time a reading is
  // entered (new mode only). Never creates a second row.
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
        assignedTo:
          user?.full_name?.trim() ||
          user?.name?.trim() ||
          user?.employee_code ||
          "unknown",
        logName: "Water",
        taskName: params.areaName,
        tds: snapshot.tds ? parseFloat(snapshot.tds) : null,
        ph: snapshot.ph ? parseFloat(snapshot.ph) : null,
        hardness: snapshot.hardness ? parseFloat(snapshot.hardness) : null,
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

  const AUTO_FLIP_FIELDS = new Set(["tds", "ph", "hardness", "remarks"]);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      // First real reading → flip the scheduled task to Inprogress (debounced,
      // one-shot). Subsequent edits persist via Save / Complete & Sign.
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
        const filename = `water/${params.siteCode}/${Date.now()}.jpg`;
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

  const operatorName =
    user?.full_name?.trim() ||
    user?.name?.trim() ||
    user?.employee_code ||
    "unknown";

  const handleSave = async () => {
    try {
      setSaving(true);
      if (autoFlipTimerRef.current) clearTimeout(autoFlipTimerRef.current);
      const targetId = isEditMode ? params.id : currentLogIdRef.current;
      if (targetId) {
        await SiteLogService.updateSiteLog(targetId, {
          tds: formData.tds ? parseFloat(formData.tds) : null,
          ph: formData.ph ? parseFloat(formData.ph) : null,
          hardness: formData.hardness ? parseFloat(formData.hardness) : null,
          remarks: formData.remarks,
          attachment: formData.attachment,
          status: "Inprogress",
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
          logName: "Water",
          taskName: params.areaName,
          tds: formData.tds ? parseFloat(formData.tds) : null,
          ph: formData.ph ? parseFloat(formData.ph) : null,
          hardness: formData.hardness ? parseFloat(formData.hardness) : null,
          remarks: formData.remarks,
          attachment: formData.attachment,
          entryTime: entryTime,
          status: "Inprogress",
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
    const hasData = !!(
      (formData.tds && formData.tds.trim().length > 0) ||
      (formData.ph && formData.ph.trim().length > 0) ||
      (formData.hardness && formData.hardness.trim().length > 0)
    );

    if (!hasData && !formData.remarks) {
      Alert.alert("Error", "Please enter at least one value or a remark");
      return;
    }

    setSignatureModalVisible(true);
  };

  const handleSaveWithSignature = async (sig: string) => {
    setSignatureModalVisible(false);

    try {
      setSaving(true);
      const endTime = new Date().getTime();
      // Completion supersedes any pending auto-Inprogress flip.
      if (autoFlipTimerRef.current) clearTimeout(autoFlipTimerRef.current);
      completedRef.current = true;

      const targetId = isEditMode ? params.id : currentLogIdRef.current;
      if (targetId) {
        await SiteLogService.updateSiteLog(targetId, {
          tds: formData.tds ? parseFloat(formData.tds) : null,
          ph: formData.ph ? parseFloat(formData.ph) : null,
          hardness: formData.hardness ? parseFloat(formData.hardness) : null,
          remarks: formData.remarks,
          signature: sig,
          endTime: endTime,
          status: "Completed",
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
          logName: "Water",
          taskName: params.areaName,
          tds: formData.tds ? parseFloat(formData.tds) : null,
          ph: formData.ph ? parseFloat(formData.ph) : null,
          hardness: formData.hardness ? parseFloat(formData.hardness) : null,
          remarks: formData.remarks,
          signature: sig,
          entryTime: entryTime,
          endTime: endTime,
          status: "Completed",
          attachment: formData.attachment,
        });
        if (created?.id) currentLogIdRef.current = created.id;
      }

      // Optimistic UX: SiteLogService writes to SQLite + queue and fires the
      // network call without awaiting, so by here the user's data is durable
      // and we can navigate back instantly.
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
        title={"Water Parameters"}
        sub={isEditMode ? `Edit: ${params.areaName || ""}` : params.areaName || "New Entry"}
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

          <FormHeading>Record water readings</FormHeading>
          {formData.remarks ? (
            <Text style={[f.t(12.5), { color: t.muted, fontStyle: "italic", paddingHorizontal: 4, marginTop: 6 }]} numberOfLines={1}>
              &quot;{formData.remarks}&quot;
            </Text>
          ) : null}

          <Card style={{ marginTop: 14, padding: 16, gap: 14 }}>
            <NumberField
              label="TDS"
              value={formData.tds}
              onChangeText={(val) => updateField("tds", val)}
              placeholder="150"
              unit="ppm"
              size="xl"
            />
            <NumberField
              label="pH Level"
              value={formData.ph}
              onChangeText={(val) => updateField("ph", val)}
              placeholder="7.0"
              unit="pH"
              size="xl"
            />
            <NumberField
              label="Hardness"
              value={formData.hardness}
              onChangeText={(val) => updateField("hardness", val)}
              placeholder="100"
              unit="ppm"
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
