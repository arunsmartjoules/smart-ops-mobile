import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Modal,
  ListRenderItem,
  Image,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  AlertCircle,
  Info,
  RefreshCw,
  WifiOff,
  X,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import PMService from "@/services/PMService";
import { pmChecklistItems } from "@/database";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import SignaturePad from "@/components/SignaturePad";
import SmartJoulesWordmark from "@/components/SmartJoulesWordmark";
import logger from "@/utils/logger";
import Skeleton from "@/components/Skeleton";
import { StorageService } from "@/services/StorageService";
import { cacheManager } from "@/services/CacheManager";
import { ds, dsRadius, dsCardShadow } from "@/constants/ds";
import NetInfo from "@react-native-community/netinfo";

// Drizzle row type inferred from the schema
type PMChecklistItemRow = typeof pmChecklistItems.$inferSelect;

// ─── Types ──────────────────────────────────────────────────────────────────
interface ResponseMap {
  [checklistItemId: string]: {
    response_value: string | null;
    readings: string | null;
    remarks: string | null;
    image_url: string | null;
  };
}

// The checklist box cycles through these three states on tap, matching the
// design: unanswered → Done → Not Done → unanswered.
const CYCLE_NEXT: Record<string, string | null> = {
  "": "Done",
  Done: "Not Done",
  "Not Done": null,
};

const isMeasureTask = (taskName?: string | null) =>
  !!taskName && taskName.toLowerCase().includes("measure");

// TEMP (2026-06-10): per-task image-mandatory and measure-task readings are
// not enforced for PM completion — operators can complete without submitting
// an image or readings. Flip either back to `true` to re-enable enforcement.
// NOTE: the backend enforces the same two checks; keep these in sync with
// ENFORCE_PM_* in backend pmInstancesController.ts.
const ENFORCE_IMAGE_MANDATORY: boolean = false;
const ENFORCE_READINGS_MANDATORY: boolean = false;

/** Checklist row image: menu, direct camera/library, or null to remove */
type ChecklistImageAction = "MENU" | "CAMERA" | "LIBRARY" | null;

/**
 * Editable fields on a checklist response. `"value"` is the merged
 * reading+response used by Number/Text tasks: one box writes both columns, so
 * the row counts as answered (backend completion requires `response_value`)
 * while Fieldproxy still gets its `readings` value.
 */
type ResponseField = "response_value" | "remarks" | "readings" | "value";

const INSTANCE_IMAGE_PICKER_OPTIONS = {
  mediaTypes: ["images"] as ImagePicker.MediaType[],
  allowsEditing: true,
  quality: 0.7,
};

/** "IMG_1234.jpg · queued" style caption under a task photo. */
const photoCaption = (url: string) => {
  const name = (url.split("?")[0] || "").split("/").pop() || "photo.jpg";
  const trimmed = name.length > 26 ? `${name.slice(0, 23)}…` : name;
  const isLocal = !/^https?:/i.test(url);
  return isLocal ? `${trimmed} · queued` : trimmed;
};

// ─── Task Row – Memoized ────────────────────────────────────────────────────
const TaskRow = React.memo(
  ({
    item,
    response,
    onResponseChange,
    onImageChange,
    onPreview,
    isUploading,
    isCompleted,
    showRequiredErrors,
    missingEvidenceImage,
    missingRemarks,
    missingResponse,
    missingReadings,
  }: {
    item: PMChecklistItemRow;
    response?: ResponseMap[string];
    onResponseChange: (
      itemId: string,
      field: ResponseField,
      value: string | null,
    ) => void;
    onImageChange: (itemId: string, action: ChecklistImageAction) => void;
    onPreview: (uri: string) => void;
    isUploading?: boolean;
    isCompleted?: boolean;
    showRequiredErrors?: boolean;
    missingEvidenceImage?: boolean;
    missingRemarks?: boolean;
    missingResponse?: boolean;
    missingReadings?: boolean;
  }) => {
    const value = response?.response_value || null;
    const fieldType = item.field_type || "Multiple Choice";
    const isChoice = fieldType === "Multiple Choice";
    // Free-text/number tasks have no Done/Not-Done vocabulary — the box just
    // reflects "answered" for them.
    const isDone = isChoice ? value === "Done" : !!value;
    const isNotDone = isChoice && value === "Not Done";
    // Number/Text tasks have ONE value box, and it is the reading: it writes
    // both `readings` and `response_value` (the backend rejects completion
    // while any row has no response_value; Fieldproxy reads `readings`).
    // Previously they rendered a second, separate response input above it, so
    // operators saw two boxes for the same measurement and filled them
    // inconsistently. Multiple-Choice rows keep an optional reading box,
    // required only when the checklist marks the task readings_mandatory.
    const readingsRequired = isChoice
      ? Boolean(item.readings_mandatory)
      : true;
    // Legacy rows stored the measurement in response_value only — fall back to
    // it so an already-answered task still shows its value in the merged box.
    const readingsValue = isChoice
      ? response?.readings || ""
      : response?.readings || response?.response_value || "";
    // Completed instances are preview-only — don't paint them red after the fact.
    const isReadingsMissing =
      readingsRequired && !readingsValue.trim() && !isCompleted;
    const hasPhoto = !!response?.image_url;
    const rowHasError = Boolean(
      showRequiredErrors &&
        (missingResponse ||
          isReadingsMissing ||
          missingReadings ||
          missingRemarks ||
          missingEvidenceImage),
    );

    // Box visuals per state — thunder fill when Done, flame outline when Not
    // Done, hairline carbon outline when still unanswered.
    const boxStyle = isDone
      ? { backgroundColor: ds.thunder[100], borderColor: ds.thunder[100] }
      : isNotDone
        ? { backgroundColor: ds.flame[1000], borderColor: ds.flame[100] }
        : { backgroundColor: ds.white, borderColor: ds.carbon[800] };

    const cycleResponse = () => {
      if (isCompleted) return;
      if (isChoice) {
        onResponseChange(item.id, "response_value", CYCLE_NEXT[value ?? ""] ?? null);
      }
    };

    return (
      <View style={[styles.taskCard, rowHasError && styles.taskCardError]}>
        <View style={styles.taskRow}>
          <TouchableOpacity
            onPress={cycleResponse}
            disabled={isCompleted || !isChoice}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityLabel={`${item.task_name} — ${value || "not answered"}`}
            style={[
              styles.taskBox,
              boxStyle,
              showRequiredErrors &&
                missingResponse && { borderColor: ds.flame[100] },
            ]}
          >
            {isNotDone ? (
              <X size={17} color={ds.flame[100]} strokeWidth={2.4} />
            ) : (
              <Check
                size={17}
                color={isDone ? ds.white : "transparent"}
                strokeWidth={2.6}
              />
            )}
          </TouchableOpacity>

          <View style={styles.taskBody}>
            <Text
              style={[
                styles.taskName,
                { color: isDone ? ds.carbon[500] : ds.carbon[100] },
              ]}
            >
              {item.task_name}
            </Text>

            <View style={styles.inlineRow}>
              {/* Readings — the single value box for Number/Text tasks. A
                  required-but-empty field is outlined in red on sight, not
                  only after a blocked completion. */}
              <View
                style={[
                  styles.field,
                  isChoice || fieldType === "Number"
                    ? styles.readingsField
                    : styles.readingsFieldWide,
                  isReadingsMissing && { borderColor: ds.flame[100] },
                ]}
              >
                <TextInput
                  value={readingsValue}
                  onChangeText={(val) =>
                    onResponseChange(item.id, isChoice ? "readings" : "value", val)
                  }
                  editable={!isCompleted}
                  placeholder={readingsRequired ? "Required" : "Readings"}
                  placeholderTextColor={ds.carbon[700]}
                  keyboardType={
                    isChoice || fieldType === "Number"
                      ? "decimal-pad"
                      : "default"
                  }
                  style={styles.fieldInput}
                />
              </View>

              <View
                style={[
                  styles.field,
                  styles.remarksField,
                  showRequiredErrors &&
                    missingRemarks && { borderColor: ds.flame[100] },
                ]}
              >
                <TextInput
                  value={response?.remarks || ""}
                  onChangeText={(val) =>
                    onResponseChange(item.id, "remarks", val || null)
                  }
                  editable={!isCompleted}
                  placeholder={
                    item.remarks_mandatory ? "Reason required" : "Remarks…"
                  }
                  placeholderTextColor={ds.carbon[700]}
                  style={[styles.fieldInput, styles.remarksInput]}
                />
              </View>

              {isUploading ? (
                <View style={[styles.camBtn, styles.camBtnIdle]}>
                  <ActivityIndicator size="small" color={ds.thunder[100]} />
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    // Completed PMs are preview-only — never re-open the
                    // add/replace menu once the instance is signed off.
                    if (isCompleted) {
                      if (hasPhoto) onPreview(response!.image_url!);
                      return;
                    }
                    onImageChange(item.id, "MENU");
                  }}
                  disabled={isCompleted && !hasPhoto}
                  activeOpacity={0.7}
                  accessibilityLabel="Task photo"
                  style={[
                    styles.camBtn,
                    hasPhoto ? styles.camBtnActive : styles.camBtnIdle,
                    showRequiredErrors &&
                      missingEvidenceImage && { borderColor: ds.flame[100] },
                  ]}
                >
                  <Camera
                    size={15}
                    color={hasPhoto ? ds.sky[100] : ds.carbon[400]}
                  />
                </TouchableOpacity>
              )}
            </View>

            {hasPhoto && (
              <View style={styles.photoRow}>
                <TouchableOpacity
                  onPress={() => onPreview(response!.image_url!)}
                  style={styles.photoThumbWrap}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: response!.image_url! }}
                    style={styles.photoThumb}
                  />
                </TouchableOpacity>
                <Text style={styles.photoCaption} numberOfLines={1}>
                  {photoCaption(response!.image_url!)}
                </Text>
                {!isCompleted && (
                  <TouchableOpacity
                    onPress={() => onImageChange(item.id, null)}
                    hitSlop={10}
                    accessibilityLabel="Remove photo"
                  >
                    <X size={13} color={ds.carbon[600]} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.response?.response_value === next.response?.response_value &&
    prev.response?.readings === next.response?.readings &&
    prev.response?.remarks === next.response?.remarks &&
    prev.response?.image_url === next.response?.image_url &&
    prev.isUploading === next.isUploading &&
    prev.isCompleted === next.isCompleted &&
    prev.showRequiredErrors === next.showRequiredErrors &&
    prev.missingResponse === next.missingResponse &&
    prev.missingReadings === next.missingReadings &&
    prev.missingRemarks === next.missingRemarks &&
    prev.missingEvidenceImage === next.missingEvidenceImage,
);

TaskRow.displayName = "TaskRow";

// ─── Checklist Skeleton ─────────────────────────────────────────────────────
const ChecklistSkeleton = () => {
  return (
    <View style={styles.listContent}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <View key={i} style={styles.taskCard}>
          <View style={styles.taskRow}>
            <Skeleton width={26} height={26} borderRadius={dsRadius.box} />
            <View style={[styles.taskBody, { marginLeft: 11 }]}>
              <Skeleton width="80%" height={13} />
              <View style={[styles.inlineRow, { marginTop: 10 }]}>
                <Skeleton
                  width={112}
                  height={30}
                  borderRadius={dsRadius.sm}
                />
                <Skeleton
                  width="45%"
                  height={30}
                  borderRadius={dsRadius.sm}
                />
                <Skeleton width={32} height={30} borderRadius={dsRadius.sm} />
              </View>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
};

// ─── Main Screen ────────────────────────────────────────────────────────────
export default function PMExecutionScreen() {
  const { instanceId } = useLocalSearchParams<{ instanceId: string }>();
  const { isConnected } = useNetworkStatus();
  const { canEdit } = useAttendanceGate();
  const insets = useSafeAreaInsets();

  const [instance, setInstance] = useState<any>(null);
  const [checklistItems, setChecklistItems] = useState<PMChecklistItemRow[]>(
    [],
  );
  const [responses, setResponses] = useState<ResponseMap>({});
  const [loading, setLoading] = useState(true);
  const [fetchingChecklist, setFetchingChecklist] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [uploadingItems, setUploadingItems] = useState<Record<string, boolean>>(
    {},
  );
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [completionAttempted, setCompletionAttempted] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);

  // ── Load instance then checklist ──────────────────────────────────────────
  const loadData = useCallback(
    async (forceServerFetch = false) => {
      if (!instanceId) return;
      try {
        // Try local DB first
        let inst = await PMService.getInstanceByServerId(instanceId as string);

        // If not in local DB or missing maintenance_id, fetch from API
        if (!inst || !inst.maintenance_id) {
          logger.info("Instance not in local DB, fetching from API", {
            module: "PM_EXECUTION",
            instanceId,
          });
          try {
            const response = await PMService.fetchInstanceFromAPI(
              instanceId as string,
            );
            if (response) inst = response;
          } catch (err) {
            logger.warn("Failed to fetch instance from API", {
              module: "PM_EXECUTION",
              error: err,
            });
          }
        }

        setInstance(inst);

        if (!inst?.maintenance_id) {
          logger.warn("No maintenance_id on instance", {
            module: "PM_EXECUTION",
            instanceId,
          });
          return;
        }

        // Load checklist items - local first, API fallback.
        // Refetch from the server when nothing is cached OR the user explicitly
        // pulled to refresh while online. fetchChecklistItemsFromAPI reconciles
        // the local cache against the server (removing items deleted there), so
        // we always re-read from the DB afterwards to get the clean set.
        let items = await PMService.getChecklistItems(inst.maintenance_id);

        if (items.length === 0 || (forceServerFetch && isConnected)) {
          logger.info("Fetching checklist from API", {
            module: "PM_EXECUTION",
            maintenanceId: inst.maintenance_id,
            forced: forceServerFetch,
          });
          setFetchingChecklist(true);
          try {
            await PMService.fetchChecklistItemsFromAPI(inst.maintenance_id);
            items = await PMService.getChecklistItems(inst.maintenance_id);
            logger.info("Loaded checklist items from API", {
              module: "PM_EXECUTION",
              maintenanceId: inst.maintenance_id,
              itemCount: items.length,
            });
          } catch (err) {
            logger.error("Failed to fetch checklist from API", {
              module: "PM_EXECUTION",
              error: err,
            });
          } finally {
            setFetchingChecklist(false);
          }
        } else {
          logger.info("Loaded checklist items from local DB", {
            module: "PM_EXECUTION",
            maintenanceId: inst.maintenance_id,
            itemCount: items.length,
          });
        }

        setChecklistItems(items);

        // Load existing responses
        const existingResponses = await PMService.getResponsesForInstance(
          instanceId as string,
        );
        const responseMap: ResponseMap = {};
        existingResponses.forEach((r) => {
          responseMap[r.checklist_item_id] = {
            response_value: r.response_value,
            readings: r.readings,
            remarks: r.remarks,
            image_url: r.image_url,
          };
        });
        setResponses(responseMap);

        // Background sync: Fetch latest responses from server if online
        if (isConnected) {
          PMService.fetchInstanceResponses(instanceId as string).then(
            (apiRes) => {
              if (apiRes.length > 0) {
                setResponses((prev) => {
                  const freshMap = { ...prev };
                  apiRes.forEach((r) => {
                    // Only update if we don't have a local value yet (don't overwrite user's current session)
                    if (!freshMap[r.checklist_item_id]) {
                      freshMap[r.checklist_item_id] = {
                        response_value: r.response_value,
                        readings: r.readings,
                        remarks: r.remarks,
                        image_url: r.image_url,
                      };
                    }
                  });
                  return freshMap;
                });
              }
            },
          );
        }
      } catch (err) {
        logger.error("Error loading PM execution data:", { error: err });
      } finally {
        setLoading(false);
        setFetchingChecklist(false);
      }
    },
    [instanceId, isConnected],
  );

  const handleSave = useCallback(
    async (
      quiet = false,
      executionOptions?: {
        status?: string;
        clientSign?: string;
        completed_on?: number;
        background?: boolean;
      },
      overridingResponses?: ResponseMap,
      overridingInstance?: any,
    ) => {
      setSaving(true);
      try {
        const sourceResponses = overridingResponses || responses;
        const sourceInstance = overridingInstance || instance;
        const responseData = Object.entries(sourceResponses).map(
          ([itemId, resp]) => ({
            checklist_item_id: itemId,
            // Keep undefined so saveExecutionProgress ignores untouched rows
            response_value: resp.response_value,
            readings: resp.readings || null,
            remarks: resp.remarks || null,
            image_url: resp.image_url || null,
          }),
        );

        // Prevent stale async callbacks (e.g., late image upload saves) from
        // overwriting a newer status like "Completed". We only auto-promote
        // Pending -> In-progress during regular progress saves.
        let nextStatus: string | undefined = executionOptions?.status;
        if (!nextStatus) {
          const normalized = (sourceInstance?.status || "")
            .toLowerCase()
            .replace(/[\s-]/g, "");
          if (normalized === "pending") {
            nextStatus = "In-progress";
          }
        }

        // Optimistic UI update: Immediately reflect status transition
        if (nextStatus && nextStatus !== sourceInstance?.status) {
          previousInstanceRef.current = sourceInstance;
          setInstance({
            ...sourceInstance,
            status: nextStatus,
            ...(executionOptions?.completed_on !== undefined
              ? { completed_on: executionOptions.completed_on }
              : {}),
          });
        }

        await PMService.saveExecutionProgress(
          instanceId as string,
          responseData,
          {
            status: nextStatus,
            beforeImage: sourceInstance?.before_image || null,
            afterImage: sourceInstance?.after_image || null,
            clientSign: executionOptions?.clientSign,
            completed_on: executionOptions?.completed_on,
            // Background mode → service writes locally + queues, fires the
            // network call without awaiting, lets the caller navigate away.
            // Rollbacks from server rejection are surfaced via Alert in
            // PMService itself.
            awaitNetwork: executionOptions?.background !== true,
          },
        );

        // Verification fetch (optional but keeps DB and State in perfect sync)
        if (nextStatus !== sourceInstance?.status) {
          const updated = await PMService.getInstanceByServerId(
            instanceId as string,
          );
          if (updated) setInstance(updated);
        }

        previousInstanceRef.current = null;
        lastSaveErrorRef.current = null;

        if (!quiet) {
          Alert.alert("Saved", "Progress saved locally.", [
            { text: "OK", onPress: () => router.back() },
          ]);
        }
        return true;
      } catch (err) {
        lastSaveErrorRef.current = err;
        if (previousInstanceRef.current) {
          setInstance(previousInstanceRef.current);
          previousInstanceRef.current = null;
        }
        logger.error("Failed to save responses", { error: err });
        if (!quiet) Alert.alert("Error", "Failed to save. Please try again.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [responses, instanceId, instance],
  );

  // ── Image handler (checklist items): menu, camera, library, or clear ───────
  const handleImageChange = useCallback(
    async (itemId: string, action: ChecklistImageAction) => {
      // Belt-and-suspenders: refuse all writes while the gate forbids editing.
      if (!canEdit) return;
      const processPickedUri = async (pickedUri: string) => {
        if (!isConnected) {
          setResponses((prev) => {
            const next = {
              ...prev,
              [itemId]: {
                ...prev[itemId],
                image_url: pickedUri,
              },
            };
            handleSave(true, undefined, next);
            return next;
          });
          Alert.alert(
            "Saved Offline",
            "Image saved locally and will upload when you are back online.",
          );
          return;
        }

        setUploadingItems((prev) => ({ ...prev, [itemId]: true }));

        try {
          const fileName = `pm-checklists/${itemId}_${Date.now()}.jpg`;
          const publicUrl = await StorageService.uploadFile(
            "jouleops-attachments",
            fileName,
            pickedUri,
          );

          setResponses((prev) => {
            const next = {
              ...prev,
              [itemId]: {
                ...prev[itemId],
                image_url: publicUrl || pickedUri,
              },
            };
            handleSave(true, undefined, next);
            return next;
          });

          if (!publicUrl) {
            Alert.alert(
              "Saved Offline",
              "Image upload will retry automatically when online.",
            );
          }
        } catch (err) {
          logger.error("Error during PM image upload:", { error: err });
          setResponses((prev) => {
            const next = {
              ...prev,
              [itemId]: {
                ...prev[itemId],
                image_url: pickedUri,
              },
            };
            handleSave(true, undefined, next);
            return next;
          });
          Alert.alert(
            "Saved Offline",
            "Image saved locally and upload will retry automatically.",
          );
        } finally {
          setUploadingItems((prev) => ({ ...prev, [itemId]: false }));
        }
      };

      const pickFromSource = async (source: "camera" | "library") => {
        try {
          if (source === "camera") {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
              Alert.alert(
                "Permission Required",
                "Please grant camera access to capture task photos.",
              );
              return;
            }
            const result = await ImagePicker.launchCameraAsync(
              INSTANCE_IMAGE_PICKER_OPTIONS,
            );
            if (!result.canceled && result.assets[0]?.uri) {
              await processPickedUri(result.assets[0].uri);
            }
          } else {
            const perm =
              await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
              Alert.alert(
                "Permission Required",
                "Please grant photo library access to choose images.",
              );
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync(
              INSTANCE_IMAGE_PICKER_OPTIONS,
            );
            if (!result.canceled && result.assets[0]?.uri) {
              await processPickedUri(result.assets[0].uri);
            }
          }
        } catch (err) {
          logger.error("PM checklist image picker error", { error: err });
          Alert.alert("Error", "Failed to pick image.");
        }
      };

      if (action === "MENU") {
        const existing = responses[itemId]?.image_url;
        if (existing) {
          Alert.alert("Task photo", "What would you like to do?", [
            { text: "Show preview", onPress: () => setPreviewImageUrl(existing) },
            {
              text: "Replace photo",
              onPress: () =>
                Alert.alert("Replace photo", "Choose a source", [
                  {
                    text: "Take photo",
                    onPress: () => void pickFromSource("camera"),
                  },
                  {
                    text: "Choose from gallery",
                    onPress: () => void pickFromSource("library"),
                  },
                  { text: "Cancel", style: "cancel" },
                ]),
            },
            { text: "Cancel", style: "cancel" },
          ]);
          return;
        }
        Alert.alert("Add photo", "Choose an option", [
          {
            text: "Take photo",
            onPress: () => void pickFromSource("camera"),
          },
          {
            text: "Choose from gallery",
            onPress: () => void pickFromSource("library"),
          },
          { text: "Cancel", style: "cancel" },
        ]);
        return;
      }

      if (action === "CAMERA") {
        await pickFromSource("camera");
        return;
      }

      if (action === "LIBRARY") {
        await pickFromSource("library");
        return;
      }

      if (action === null) {
        setResponses((prev) => {
          const next = {
            ...prev,
            [itemId]: {
              ...prev[itemId],
              image_url: null,
            },
          };
          handleSave(true, undefined, next);
          return next;
        });
      }
    },
    [handleSave, isConnected, canEdit, responses],
  );

  useEffect(() => {
    if (instanceId) {
      loadData(false);
    }
  }, [instanceId, isConnected, loadData]);

  // Offline strip count — how many mutations are still waiting in the queue.
  useEffect(() => {
    if (isConnected !== false) {
      setQueuedCount(0);
      return;
    }
    let cancelled = false;
    const read = () =>
      cacheManager
        .getQueueCount()
        .then((n) => {
          if (!cancelled) setQueuedCount(n);
        })
        .catch(() => {});
    read();
    const timer = setInterval(read, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isConnected, responses]);

  // ── Progress derived value ────────────────────────────────────────────────
  // Count only responses tied to a current checklist item. Responses left
  // over from a deleted/replaced checklist must not inflate the count — that
  // is what previously produced bogus progress like "20/10".
  const answered = checklistItems.filter(
    (it) => responses[it.id]?.response_value,
  ).length;
  const total = checklistItems.length;
  // Visual percentage for the progress bar fill
  const progressPercent = total > 0 ? (answered / total) * 100 : 0;

  // Signature-sheet summary chips
  const doneCount = checklistItems.filter(
    (it) => responses[it.id]?.response_value === "Done",
  ).length;
  const notDoneCount = checklistItems.filter(
    (it) => responses[it.id]?.response_value === "Not Done",
  ).length;
  const photoCount =
    checklistItems.filter((it) => !!responses[it.id]?.image_url).length +
    (instance?.before_image ? 1 : 0) +
    (instance?.after_image ? 1 : 0);

  const applyInstanceImageFromUri = useCallback(
    async (type: "before_image" | "after_image", pickedUri: string) => {
      let finalUri = pickedUri;
      const netState = await NetInfo.fetch();
      const isActuallyOnline = netState.isConnected === true;

      if (isActuallyOnline) {
        try {
          const fileName = `pm-completion/${instanceId}_${type}_${Date.now()}.jpg`;
          const publicUrl = await StorageService.uploadFile(
            "jouleops-attachments",
            fileName,
            pickedUri,
          );
          if (publicUrl) finalUri = publicUrl;
        } catch (err) {
          logger.warn(`Failed to upload ${type} immediately`, { error: err });
        }
      }

      let computedNextInstance: any = null;
      setInstance((prev: any) => {
        const nextInstance = {
          ...(prev || {}),
          [type]: finalUri,
        };
        computedNextInstance = nextInstance;
        return nextInstance;
      });
      if (computedNextInstance) {
        handleSave(true, undefined, undefined, computedNextInstance);
      }
    },
    [instanceId, handleSave],
  );

  const pickInstanceImage = useCallback(
    async (
      type: "before_image" | "after_image",
      source: "camera" | "library",
    ) => {
      try {
        if (source === "camera") {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert(
              "Permission Required",
              "Please grant camera access to capture evidence photos.",
            );
            return;
          }
          const result = await ImagePicker.launchCameraAsync(
            INSTANCE_IMAGE_PICKER_OPTIONS,
          );
          if (!result.canceled && result.assets[0]?.uri) {
            await applyInstanceImageFromUri(type, result.assets[0].uri);
          }
        } else {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert(
              "Permission Required",
              "Please grant photo library access to choose images.",
            );
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync(
            INSTANCE_IMAGE_PICKER_OPTIONS,
          );
          if (!result.canceled && result.assets[0]?.uri) {
            await applyInstanceImageFromUri(type, result.assets[0].uri);
          }
        }
      } catch (err) {
        logger.error("PM instance image picker error", { error: err });
        Alert.alert("Error", "Failed to pick image.");
      }
    },
    [applyInstanceImageFromUri],
  );

  const promptAddInstanceImage = useCallback(
    (type: "before_image" | "after_image") => {
      Alert.alert(
        type === "before_image" ? "Before photo" : "After photo",
        "Choose an option",
        [
          {
            text: "Take photo",
            onPress: () => void pickInstanceImage(type, "camera"),
          },
          {
            text: "Choose from gallery",
            onPress: () => void pickInstanceImage(type, "library"),
          },
          { text: "Cancel", style: "cancel" },
        ],
      );
    },
    [pickInstanceImage],
  );

  const promptReplaceInstanceImage = useCallback(
    (type: "before_image" | "after_image", currentUri: string) => {
      Alert.alert(
        type === "before_image" ? "Before photo" : "After photo",
        "What would you like to do?",
        [
          {
            text: "Show preview",
            onPress: () => setPreviewImageUrl(currentUri),
          },
          {
            text: "Replace photo",
            onPress: () =>
              Alert.alert("Replace photo", "Choose a source", [
                {
                  text: "Take photo",
                  onPress: () => void pickInstanceImage(type, "camera"),
                },
                {
                  text: "Choose from gallery",
                  onPress: () => void pickInstanceImage(type, "library"),
                },
                { text: "Cancel", style: "cancel" },
              ]),
          },
          { text: "Cancel", style: "cancel" },
        ],
      );
    },
    [pickInstanceImage],
  );

  const onEvidencePress = useCallback(
    (type: "before_image" | "after_image") => {
      const current = instance?.[type];
      // Evidence stays editable while the PM is In-progress — tap to preview,
      // retake, or replace it. Once Completed it is preview-only.
      if (current) {
        if (instance?.status === "Completed" || !canEdit) {
          setPreviewImageUrl(current);
        } else {
          promptReplaceInstanceImage(type, current);
        }
      } else if (canEdit && instance?.status !== "Completed") {
        promptAddInstanceImage(type);
      }
    },
    [instance, canEdit, promptAddInstanceImage, promptReplaceInstanceImage],
  );

  // ── Response handler ──────────────────────────────────────────────────────
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to the checklist FlashList so a blocked completion can scroll the
  // operator straight to the first task that still needs attention. Typed as
  // any to match the existing @ts-ignore'd FlashList usage on this screen.
  const listRef = useRef<any>(null);

  // Carry the most recent saveExecutionProgress error from handleSave's catch
  // up to handleComplete, since handleSave swallows + returns false. Without
  // this, completion failures collapse to a generic "Failed to complete" alert
  // and the user never sees the server's real reason (e.g. missing remarks).
  const lastSaveErrorRef = useRef<any>(null);
  // Optimistic UI snapshot used to roll back the visible status if the save
  // is rejected — keeps the screen and the local DB in sync after rollback.
  const previousInstanceRef = useRef<any>(null);

  const handleResponseChange = useCallback(
    (itemId: string, field: ResponseField, value: string | null) => {
      // Belt-and-suspenders: refuse all writes while the gate forbids editing
      // (locked / read-only). UI also disables the inputs.
      if (!canEdit) return;
      setResponses((prev) => {
        // Number/Text tasks type into a single box that feeds both columns.
        const patch =
          field === "value"
            ? { readings: value, response_value: value }
            : { [field]: value };
        const next = {
          ...prev,
          [itemId]: {
            ...prev[itemId],
            ...patch,
          },
        };

        // Auto-save logic
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

        if (field === "response_value") {
          // Immediate save for the checkbox cycle
          handleSave(true, undefined, next);
        } else {
          // Debounced save for text input
          autoSaveTimerRef.current = setTimeout(() => {
            handleSave(true, undefined, next);
          }, 1000);
        }

        return next;
      });
    },
    [handleSave, canEdit],
  );

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const missingMeasureReadings = useMemo(
    () =>
      !ENFORCE_READINGS_MANDATORY
        ? []
        : checklistItems.filter((item) => {
            if (!isMeasureTask(item.task_name)) return false;
            const resp = responses[item.id];
            // Only enforce after the task has a response (completion already requires all answered).
            if (!resp?.response_value) return false;
            return !resp.readings || !resp.readings.trim();
          }),
    [checklistItems, responses],
  );

  const missingMandatoryValidation = useMemo(() => {
    const missingResponses: string[] = [];
    const missingReadingsByTask = new Set<string>();
    const missingRemarksByTask = new Set<string>();
    const missingImagesByTask = new Set<string>();
    const byItemId: Record<
      string,
      {
        missingResponse: boolean;
        missingReadings: boolean;
        missingRemarks: boolean;
        missingImage: boolean;
      }
    > = {};

    for (const item of checklistItems) {
      const response = responses[item.id];
      const taskName = item.task_name || "Unnamed task";
      const missingResponse = !response?.response_value;
      const missingReadings =
        ENFORCE_READINGS_MANDATORY &&
        isMeasureTask(item.task_name) &&
        !!response?.response_value &&
        !String(response?.readings || "").trim();
      const missingRemarks =
        Boolean((item as any).remarks_mandatory) &&
        !String(response?.remarks || "").trim();
      const missingImage =
        ENFORCE_IMAGE_MANDATORY &&
        Boolean((item as any).image_mandatory) &&
        !String(response?.image_url || "").trim();

      if (missingResponse) missingResponses.push(taskName);
      if (missingReadings) missingReadingsByTask.add(taskName);
      if (missingRemarks) missingRemarksByTask.add(taskName);
      if (missingImage) missingImagesByTask.add(taskName);
      byItemId[item.id] = {
        missingResponse,
        missingReadings,
        missingRemarks,
        missingImage,
      };
    }

    return {
      missingResponses,
      missingReadings: Array.from(missingReadingsByTask),
      missingRemarks: Array.from(missingRemarksByTask),
      missingImages: Array.from(missingImagesByTask),
      byItemId,
      hasAny:
        missingResponses.length > 0 ||
        missingReadingsByTask.size > 0 ||
        missingRemarksByTask.size > 0 ||
        missingImagesByTask.size > 0,
    };
  }, [checklistItems, responses]);

  // Single-line reason shown above the CTA once completion has been attempted.
  const blockedMessage = useMemo(() => {
    if (!completionAttempted || !missingMandatoryValidation.hasAny) return "";
    const v = missingMandatoryValidation;
    const plural = (n: number, word: string) =>
      `${n} ${word}${n > 1 ? "s" : ""}`;
    if (v.missingResponses.length)
      return `${plural(v.missingResponses.length, "task")} still unanswered`;
    if (v.missingReadings.length)
      return `${plural(v.missingReadings.length, "mandatory reading")} missing`;
    if (v.missingRemarks.length)
      return `${plural(v.missingRemarks.length, "task")} need a remark`;
    return `${plural(v.missingImages.length, "task")} need a photo`;
  }, [completionAttempted, missingMandatoryValidation]);

  // Scroll the list to the first task that's missing a required field and give
  // the operator a light error nudge. Returns true if such a task was found.
  const scrollToFirstIncomplete = useCallback(() => {
    const index = checklistItems.findIndex((item) => {
      const flags = missingMandatoryValidation.byItemId[item.id];
      return (
        flags &&
        (flags.missingResponse ||
          flags.missingReadings ||
          flags.missingRemarks ||
          flags.missingImage)
      );
    });
    if (index < 0) return false;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
      () => {},
    );
    listRef.current?.scrollToIndex({
      index,
      animated: true,
      viewPosition: 0.15,
    });
    return true;
  }, [checklistItems, missingMandatoryValidation.byItemId]);

  const showCompletionBlockedPopup = useCallback(() => {
    const lines: string[] = [];
    if (missingMandatoryValidation.missingResponses.length > 0) {
      lines.push(`- ${missingMandatoryValidation.missingResponses.length} task(s) not answered`);
    }
    if (missingMandatoryValidation.missingReadings.length > 0) {
      lines.push(
        `- ${missingMandatoryValidation.missingReadings.length} task(s) missing required readings`,
      );
    }
    if (missingMandatoryValidation.missingRemarks.length > 0) {
      lines.push(
        `- ${missingMandatoryValidation.missingRemarks.length} task(s) missing mandatory remarks`,
      );
    }
    if (missingMandatoryValidation.missingImages.length > 0) {
      lines.push(
        `- ${missingMandatoryValidation.missingImages.length} task(s) missing mandatory images`,
      );
    }
    Alert.alert(
      "Cannot complete PM",
      `Please complete all mandatory fields before completion.\n\n${lines.join("\n")}`,
    );
  }, [missingMandatoryValidation]);

  const handleComplete = useCallback(
    async (signature: string) => {
      if (!signature) {
        Alert.alert("Required", "Please provide a signature.");
        return;
      }
      if (missingMandatoryValidation.hasAny) {
        setCompletionAttempted(true);
        showCompletionBlockedPopup();
        return;
      }

      setSaving(true);
      try {
        const now = Date.now();
        const saved = await handleSave(true, {
          status: "Completed",
          clientSign: signature,
          completed_on: now,
          // Optimistic: PMService writes locally + queues, fires the
          // completion PUT in the background. Server rejections surface as a
          // non-blocking Alert from PMService and roll back the local row.
          background: true,
        });
        if (!saved) {
          const stashed = lastSaveErrorRef.current;
          lastSaveErrorRef.current = null;
          throw stashed || new Error("Failed to complete instance.");
        }

        setShowCompletionModal(false);
        // Skip the success Alert + OK tap — go straight back. The haptic
        // and the PM row updating to Completed in the list is the
        // confirmation. Saves ~one full network roundtrip of waiting.
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
        router.back();
      } catch (err) {
        logger.error("Failed to complete PM", { error: err });
        const apiErrorMessage =
          (err as any)?.response?.error ||
          (err as any)?.message ||
          "Failed to complete. Please try again.";
        // The server's validation result lists exactly which mandatory
        // fields are still missing on the backend side (e.g. responses
        // that haven't synced yet). Render them under the main message so
        // the user can act on it instead of seeing only a generic line.
        const details = (err as any)?.details;
        const detailLines: string[] = [];
        if (details) {
          if (details.missing_responses?.length) {
            detailLines.push(
              `• ${details.missing_responses.length} task(s) missing response`,
            );
          }
          if (details.missing_measure_readings?.length) {
            detailLines.push(
              `• ${details.missing_measure_readings.length} task(s) missing readings`,
            );
          }
          if (details.missing_mandatory_remarks?.length) {
            detailLines.push(
              `• ${details.missing_mandatory_remarks.length} task(s) missing remarks`,
            );
          }
          if (details.missing_mandatory_images?.length) {
            detailLines.push(
              `• ${details.missing_mandatory_images.length} task(s) missing images`,
            );
          }
          if (details.missing_before_image) detailLines.push(`• Before photo missing`);
          if (details.missing_after_image) detailLines.push(`• After photo missing`);
        }
        const fullMessage = detailLines.length > 0
          ? `${apiErrorMessage}\n\n${detailLines.join("\n")}`
          : apiErrorMessage;
        Alert.alert("Cannot complete PM", fullMessage);
      } finally {
        setSaving(false);
      }
    },
    [handleSave, missingMandatoryValidation.hasAny, showCompletionBlockedPopup],
  );

  // ── List setup ────────────────────────────────────────────────────────────
  const renderItem: ListRenderItem<PMChecklistItemRow> = useCallback(
    ({ item }) => (
      <TaskRow
        item={item}
        response={responses[item.id]}
        onResponseChange={handleResponseChange}
        onImageChange={handleImageChange}
        onPreview={setPreviewImageUrl}
        isUploading={uploadingItems[item.id]}
        isCompleted={instance?.status === "Completed" || !canEdit}
        showRequiredErrors={completionAttempted}
        missingEvidenceImage={missingMandatoryValidation.byItemId[item.id]?.missingImage}
        missingRemarks={missingMandatoryValidation.byItemId[item.id]?.missingRemarks}
        missingResponse={missingMandatoryValidation.byItemId[item.id]?.missingResponse}
        missingReadings={missingMandatoryValidation.byItemId[item.id]?.missingReadings}
      />
    ),
    [
      responses,
      handleResponseChange,
      handleImageChange,
      uploadingItems,
      instance?.status,
      canEdit,
      completionAttempted,
      missingMandatoryValidation.byItemId,
    ],
  );

  const keyExtractor = useCallback((item: PMChecklistItemRow) => item.id, []);

  const ListFooter = (
    <View style={styles.hintRow}>
      <Info size={14} color={ds.carbon[600]} />
      <Text style={styles.hintText}>
        Tap the box to cycle Done → Not Done → clear. Fields marked Required
        must be filled before completion.
      </Text>
    </View>
  );

  const ListEmpty = (
    <View style={styles.flex}>
      {fetchingChecklist ? (
        <ChecklistSkeleton />
      ) : (
        <View style={styles.emptyChecklist}>
          <Text style={styles.emptyText}>
            {!instance?.maintenance_id
              ? "No checklist linked to this PM instance."
              : checklistItems.length === 0 && !isConnected
                ? "Checklist not cached yet.\nPlease connect to internet and sync to cache all checklists."
                : "No checklist items found."}
          </Text>
          {checklistItems.length === 0 &&
            !isConnected &&
            instance?.maintenance_id && (
              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    "Offline Mode",
                    "To use PM checklists offline:\n\n1. Connect to internet\n2. Open the app and wait for sync to complete\n3. All checklists will be cached automatically\n\nAfter that, you can work offline.",
                    [{ text: "OK" }],
                  );
                }}
                style={styles.learnMoreBtn}
              >
                <Text style={styles.learnMoreText}>Learn More</Text>
              </TouchableOpacity>
            )}
        </View>
      )}
    </View>
  );

  const isCompleted = instance?.status === "Completed";
  const canComplete =
    total > 0 &&
    answered === total &&
    missingMeasureReadings.length === 0;
  const ctaReady = canComplete && !missingMandatoryValidation.hasAny;

  const completedAt = instance?.completed_on
    ? new Date(Number(instance.completed_on)).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const evidenceTileStyle = (has: boolean) => [
    styles.evidenceTile,
    has ? styles.evidenceTileActive : styles.evidenceTileIdle,
  ];

  if (loading && !instance) {
    return (
      <View style={[styles.flex, { backgroundColor: ds.pageBg }]}>
        <View style={[styles.headerBlock, { paddingTop: insets.top + 6 }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.headerTile}
              accessibilityLabel="Go back"
            >
              <ArrowLeft size={20} color={ds.white} />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>PM Task</Text>
              <Text style={styles.headerSub}>Loading checklist…</Text>
            </View>
          </View>
          <View style={styles.progressRow}>
            <View style={styles.progressTrack} />
          </View>
        </View>
        <ChecklistSkeleton />
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: ds.pageBg }]}>
      {/* ── Thunder header ── */}
      <View style={[styles.headerBlock, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.headerTile}
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={20} color={ds.white} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {instance?.asset_id || instance?.title || "PM Task"}
            </Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {[instance?.title, instance?.asset_type]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
          {isConnected && (
            <TouchableOpacity
              onPress={() => loadData(true)}
              style={styles.headerTile}
              disabled={fetchingChecklist}
              accessibilityLabel="Refresh checklist"
            >
              {fetchingChecklist ? (
                <ActivityIndicator size="small" color={ds.white} />
              ) : (
                <RefreshCw size={18} color={ds.white} />
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${progressPercent}%` }]}
            />
          </View>
          <Text style={styles.progressCount}>
            {answered}
            <Text style={styles.progressTotal}>/{total}</Text>
          </Text>
          <View style={styles.evidenceGroup}>
            <TouchableOpacity
              onPress={() => onEvidencePress("before_image")}
              style={evidenceTileStyle(!!instance?.before_image)}
              accessibilityLabel="Before photo"
            >
              <Camera
                size={14}
                color={instance?.before_image ? ds.sky[800] : ds.thunder[600]}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onEvidencePress("after_image")}
              style={evidenceTileStyle(!!instance?.after_image)}
              accessibilityLabel="After photo"
            >
              <Camera
                size={14}
                color={instance?.after_image ? ds.sky[800] : ds.thunder[600]}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Offline strip ── */}
      {isConnected === false && (
        <View style={styles.offlineStrip}>
          <WifiOff size={13} color={ds.flame[100]} />
          <Text style={styles.offlineText} numberOfLines={1}>
            {queuedCount > 0
              ? `Offline — ${queuedCount} response${queuedCount > 1 ? "s" : ""} queued, will sync automatically`
              : "Offline — changes are saved locally and will sync automatically"}
          </Text>
        </View>
      )}

      {/* ── Task list ── */}
      {(loading || fetchingChecklist) && checklistItems.length === 0 ? (
        <ChecklistSkeleton />
      ) : (
        <FlashList
          ref={listRef}
          data={checklistItems}
          // @ts-ignore
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListEmptyComponent={ListEmpty}
          ListFooterComponent={checklistItems.length > 0 ? ListFooter : null}
          // @ts-ignore
          estimatedItemSize={104}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* ── Footer ── */}
      {!isCompleted && canEdit && (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, 12) + 14 },
          ]}
        >
          {!!blockedMessage && (
            <View style={styles.blockedRow}>
              <AlertCircle size={14} color={ds.flame[100]} />
              <Text style={styles.blockedText}>{blockedMessage}</Text>
            </View>
          )}
          <TouchableOpacity
            onPress={() => {
              setCompletionAttempted(true);
              if (!ctaReady) {
                // Guide the operator straight to the first unfinished card
                // (scrolls + flame-bordered highlight) instead of a bare count
                // popup; fall back to the popup only if there's no specific
                // task to point at.
                if (!scrollToFirstIncomplete()) {
                  showCompletionBlockedPopup();
                }
                return;
              }
              setShowCompletionModal(true);
            }}
            activeOpacity={0.85}
            style={[
              styles.cta,
              { backgroundColor: ctaReady ? ds.thunder[100] : ds.carbon[900] },
            ]}
          >
            <Text
              style={[
                styles.ctaText,
                { color: ctaReady ? ds.white : ds.carbon[700] },
              ]}
            >
              Complete &amp; Sign
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {isCompleted && (
        <View
          style={[
            styles.completedBanner,
            { paddingBottom: Math.max(insets.bottom, 12) + 16 },
          ]}
        >
          <CheckCircle2 size={18} color={ds.sky[100]} />
          <Text style={styles.completedText}>
            PM Completed{completedAt ? ` · ${completedAt}` : ""}
          </Text>
        </View>
      )}

      {/* ── Signature sheet ── */}
      <Modal
        visible={showCompletionModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCompletionModal(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>Complete PM Task</Text>
                <Text style={styles.modalSub}>
                  Please provide the client signature below.
                </Text>
              </View>
              <View style={styles.modalHeaderRight}>
                <SmartJoulesWordmark width={118} />
                <TouchableOpacity
                  onPress={() => setShowCompletionModal(false)}
                  style={styles.closeBtn}
                  accessibilityLabel="Close"
                >
                  <X size={20} color={ds.carbon[500]} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.chipRow}>
              <View style={styles.chip}>
                <Text style={styles.chipNum}>{doneCount}</Text>
                <Text style={styles.chipLabel}>tasks done</Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipNum}>{notDoneCount}</Text>
                <Text style={styles.chipLabel}>not done</Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipNum}>{photoCount}</Text>
                <Text style={styles.chipLabel}>photos</Text>
              </View>
            </View>

            <View style={styles.signatureContainer}>
              <SignaturePad
                standalone
                onOK={handleComplete}
                description="Sign here to confirm PM completion"
                okText="Confirm & Complete"
                accentColor={ds.thunder[100]}
                clearVariant="outlined"
              />
            </View>

            {saving && (
              <View style={styles.savingOverlay}>
                <ActivityIndicator size="large" color={ds.thunder[100]} />
                <Text style={styles.savingText}>Processing completion...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Image preview ── */}
      <Modal
        visible={!!previewImageUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUrl(null)}
      >
        <TouchableOpacity
          style={styles.fullScreenPreviewBg}
          activeOpacity={1}
          onPress={() => setPreviewImageUrl(null)}
        >
          <View style={styles.fullScreenPreviewContent}>
            {previewImageUrl && (
              <Image
                source={{ uri: previewImageUrl }}
                style={styles.fullScreenImage}
                resizeMode="contain"
              />
            )}
            <TouchableOpacity
              onPress={() => setPreviewImageUrl(null)}
              style={styles.closePreviewBtn}
            >
              <X size={24} color={ds.white} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 20,
  },

  // ── Header (thunder chrome) ──
  headerBlock: {
    backgroundColor: ds.thunder[100],
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  headerTile: {
    width: 34,
    height: 34,
    borderRadius: dsRadius.tile,
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontSize: 16,
    lineHeight: 19,
    fontWeight: "700",
    letterSpacing: 0.16,
    color: ds.white,
  },
  headerSub: {
    fontSize: 11.5,
    lineHeight: 15,
    color: ds.thunder[700],
    marginTop: 1,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: dsRadius.pill,
    backgroundColor: "rgba(255,255,255,0.15)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: dsRadius.pill,
    backgroundColor: ds.flame[100],
  },
  progressCount: {
    fontSize: 12,
    fontWeight: "600",
    color: ds.white,
  },
  progressTotal: {
    fontWeight: "400",
    color: ds.thunder[700],
  },
  evidenceGroup: { flexDirection: "row", gap: 5 },
  evidenceTile: {
    width: 34,
    height: 26,
    borderRadius: dsRadius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  evidenceTileIdle: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  evidenceTileActive: {
    backgroundColor: "rgba(40,147,157,0.35)",
    borderColor: ds.sky[300],
  },

  // ── Offline strip ──
  offlineStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: ds.flame[900],
    paddingHorizontal: 18,
    paddingVertical: 5,
  },
  offlineText: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: "500",
    color: ds.flame[100],
  },

  // ── Task card ──
  taskCard: {
    backgroundColor: ds.white,
    borderRadius: dsRadius.base,
    marginBottom: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "transparent",
    ...dsCardShadow,
  },
  taskCardError: {
    borderColor: ds.flame[100],
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  taskBox: {
    width: 26,
    height: 26,
    borderRadius: dsRadius.box,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    marginRight: 11,
  },
  taskBody: { flex: 1, minWidth: 0 },
  taskName: {
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: 0.13,
    marginBottom: 7,
  },

  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    height: 30,
    backgroundColor: ds.pageBg,
    borderRadius: dsRadius.sm,
    borderWidth: 1,
    borderColor: ds.carbon[900],
    paddingHorizontal: 8,
  },
  readingsField: { width: 112, flexShrink: 0 },
  // Text tasks share the row evenly with remarks — 112px is too tight to type
  // a sentence into.
  readingsFieldWide: { flex: 1, minWidth: 0 },
  remarksField: { flex: 1, minWidth: 0 },
  fieldInput: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    fontSize: 13,
    color: ds.carbon[100],
  },
  remarksInput: { fontSize: 12 },
  camBtn: {
    width: 32,
    height: 30,
    borderRadius: dsRadius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  camBtnIdle: {
    backgroundColor: ds.carbon[1000],
    borderColor: ds.carbon[900],
  },
  camBtnActive: {
    backgroundColor: ds.sky[900],
    borderColor: ds.sky[100],
  },

  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 7,
  },
  photoThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: dsRadius.sm,
    borderWidth: 1,
    borderColor: ds.carbon[900],
    backgroundColor: ds.carbon[900],
    overflow: "hidden",
  },
  photoThumb: { width: "100%", height: "100%" },
  photoCaption: {
    flex: 1,
    fontSize: 10.5,
    color: ds.carbon[500],
  },

  hintRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  hintText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15.4,
    color: ds.carbon[600],
  },

  // ── Empty state ──
  emptyChecklist: {
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 40,
  },
  emptyText: {
    color: ds.carbon[600],
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  learnMoreBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: ds.carbon[1000],
    borderRadius: dsRadius.base,
  },
  learnMoreText: {
    color: ds.carbon[400],
    fontSize: 14,
    fontWeight: "600",
  },

  // ── Footer ──
  footer: {
    backgroundColor: ds.white,
    borderTopWidth: 1,
    borderTopColor: ds.carbon[900],
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  blockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  blockedText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "500",
    color: ds.flame[100],
  },
  cta: {
    borderRadius: dsRadius.base,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.16,
  },

  completedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: ds.sky[900],
    borderTopWidth: 1,
    borderTopColor: ds.sky[500],
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  completedText: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.15,
    color: ds.sky[100],
  },

  // ── Signature sheet ──
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(25,19,18,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: ds.white,
    borderTopLeftRadius: dsRadius.sheet,
    borderTopRightRadius: dsRadius.sheet,
    height: "86%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 14,
    gap: 12,
  },
  modalHeaderText: { flex: 1, minWidth: 0 },
  modalHeaderRight: { alignItems: "flex-end", gap: 12 },
  modalTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
    letterSpacing: 0.45,
    color: ds.carbon[100],
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 13,
    lineHeight: 18,
    color: ds.carbon[500],
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: dsRadius.tile,
    backgroundColor: ds.carbon[1000],
    alignItems: "center",
    justifyContent: "center",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginHorizontal: 18,
  },
  chip: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
    backgroundColor: ds.pageBg,
    borderRadius: dsRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipNum: {
    fontSize: 14,
    fontWeight: "600",
    color: ds.flame[100],
  },
  chipLabel: {
    fontSize: 11,
    color: ds.carbon[500],
  },
  signatureContainer: {
    flex: 1,
    marginHorizontal: 18,
    marginTop: 14,
    marginBottom: 14,
    borderRadius: dsRadius.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: ds.carbon[900],
  },
  savingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    borderTopLeftRadius: dsRadius.sheet,
    borderTopRightRadius: dsRadius.sheet,
  },
  savingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "600",
    color: ds.carbon[100],
  },

  // ── Full screen preview ──
  fullScreenPreviewBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullScreenPreviewContent: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  fullScreenImage: {
    width: "90%",
    height: "80%",
  },
  closePreviewBtn: {
    position: "absolute",
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
});
