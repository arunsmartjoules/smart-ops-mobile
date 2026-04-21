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
  useColorScheme,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Circle,
  Loader2,
  Pen,
  RefreshCw,
  ImagePlus,
  X,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import PMService from "@/services/PMService";
import { pmChecklistItems } from "@/database";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import SignaturePad from "@/components/SignaturePad";
import logger from "@/utils/logger";
import Skeleton from "@/components/Skeleton";
import { StorageService } from "@/services/StorageService";
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

const MULTIPLE_CHOICE_OPTIONS = ["Done", "Not Done"];
const isMeasureTask = (taskName?: string | null) =>
  !!taskName && taskName.toLowerCase().includes("measure");

/** Checklist row image: menu, direct camera/library, or null to remove */
type ChecklistImageAction = "MENU" | "CAMERA" | "LIBRARY" | null;

const INSTANCE_IMAGE_PICKER_OPTIONS = {
  mediaTypes: ["images"] as ImagePicker.MediaType[],
  allowsEditing: true,
  quality: 0.7,
};

// ─── Task Row – Memoized ────────────────────────────────────────────────────
const TaskRow = React.memo(
  ({
    item,
    index,
    response,
    onResponseChange,
    onImageChange,
    onPreview,
    isUploading,
    isCompleted,
    style,
  }: {
    item: PMChecklistItemRow;
    index: number;
    response?: ResponseMap[string];
    onResponseChange: (
      itemId: string,
      field: "response_value" | "remarks" | "readings",
      value: string | null,
    ) => void;
    onImageChange: (itemId: string, action: ChecklistImageAction) => void;
    onPreview: (uri: string) => void;
    isUploading?: boolean;
    isCompleted?: boolean;
    style?: any;
  }) => {
    const isDark = useColorScheme() === "dark";
    const isDone = response?.response_value === "Done";
    const readingsRequired = isMeasureTask(item.task_name);
    const isReadingsMissing =
      readingsRequired &&
      !!response?.response_value &&
      (!response?.readings || !response.readings.trim());
    const fieldType = item.field_type || "Multiple Choice";

    return (
      <View style={[styles.taskCard, style]}>
        <View style={styles.taskHeader}>
          <View
            style={[
              styles.seqBadge,
              {
                backgroundColor: isDone
                  ? isDark
                    ? "#064e3b"
                    : "#dcfce7"
                  : isDark
                    ? "#334155"
                    : "#f1f5f9",
              },
            ]}
          >
            <Text
              style={[
                styles.seqText,
                {
                  color: isDone
                    ? isDark
                      ? "#4ade80"
                      : "#16a34a"
                    : isDark
                      ? "#94a3b8"
                      : "#94a3b8",
                },
              ]}
            >
              {index + 1}
            </Text>
          </View>
          <Text
            style={[styles.taskName, { color: isDark ? "#f8fafc" : "#0f172a" }]}
          >
            {item.task_name}
          </Text>
          {item.image_mandatory && (
            <View
              style={[styles.imgTag, isDark && { backgroundColor: "#431407" }]}
            >
              <Text style={[styles.imgTagText, isDark && { color: "#fb923c" }]}>
                📷
              </Text>
            </View>
          )}
        </View>

        {/* Response */}
        {fieldType === "Multiple Choice" ? (
          <View style={styles.choiceRow}>
            {MULTIPLE_CHOICE_OPTIONS.map((opt) => {
              const selected = response?.response_value === opt;
              const selColor = opt === "Done" ? "#22c55e" : "#ef4444";
              return (
                <TouchableOpacity
                  key={opt}
                  onPress={() =>
                    onResponseChange(item.id, "response_value", opt)
                  }
                  style={[
                    styles.choiceBtn,
                    {
                      backgroundColor: selected
                        ? selColor
                        : isDark
                          ? "#1e293b"
                          : "#f8fafc",
                      borderColor: selected
                        ? "transparent"
                        : isDark
                          ? "#334155"
                          : "#e2e8f0",
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      {
                        color: selected
                          ? "#fff"
                          : isDark
                            ? "#94a3b8"
                            : "#64748b",
                      },
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <TextInput
            value={response?.response_value || ""}
            onChangeText={(val) =>
              onResponseChange(item.id, "response_value", val)
            }
            placeholder={`Enter ${fieldType.toLowerCase()}...`}
            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
            keyboardType={fieldType === "Number" ? "decimal-pad" : "default"}
            style={[
              styles.textInput,
              isReadingsMissing &&
                (isDark
                  ? styles.requiredReadingsInputDark
                  : styles.requiredReadingsInput),
              isDark && {
                backgroundColor: "#0f172a",
                borderColor: "#334155",
                color: "#f8fafc",
              },
            ]}
          />
        )}

        {/* Readings Input */}
        <View style={{ marginTop: 12 }}>
          <Text
            style={[
              styles.inputLabel,
              { color: isDark ? "#94a3b8" : "#64748b" },
            ]}
          >
            {readingsRequired ? "Readings *" : "Readings"}
          </Text>
          <TextInput
            value={response?.readings || ""}
            onChangeText={(val) => onResponseChange(item.id, "readings", val)}
            placeholder={
              readingsRequired
                ? "Enter readings (required for this task)..."
                : "Enter readings if applicable..."
            }
            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
            keyboardType="decimal-pad"
            style={[
              styles.textInput,
              isDark && {
                backgroundColor: "#0f172a",
                borderColor: "#334155",
                color: "#f8fafc",
              },
            ]}
          />
        </View>

        {/* Remarks & Image Row — two explicit actions (camera + gallery) */}
        <View style={styles.actionRow}>
          {isUploading ? (
            <View
              style={[
                styles.imageBtn,
                styles.imagePickRow,
                isDark && {
                  backgroundColor: "#1e293b",
                  borderColor: "#334155",
                },
              ]}
            >
              <ActivityIndicator size="small" color="#3b82f6" />
              <Text
                style={[styles.imageBtnText, isDark && { color: "#94a3b8" }]}
              >
                Uploading...
              </Text>
            </View>
          ) : (
            <View style={styles.imagePickRow}>
              <TouchableOpacity
                onPress={() => onImageChange(item.id, "CAMERA")}
                style={[
                  styles.imageBtn,
                  styles.imageBtnHalf,
                  isDark && {
                    backgroundColor: "#1e293b",
                    borderColor: "#334155",
                  },
                ]}
              >
                <Camera size={14} color={isDark ? "#94a3b8" : "#64748b"} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onImageChange(item.id, "LIBRARY")}
                style={[
                  styles.imageBtn,
                  styles.imageBtnHalf,
                  isDark && {
                    backgroundColor: "#1e293b",
                    borderColor: "#334155",
                  },
                ]}
              >
                <ImagePlus size={14} color={isDark ? "#94a3b8" : "#64748b"} />
              </TouchableOpacity>
            </View>
          )}

          {(item.remarks_mandatory || response?.response_value) && (
            <View style={{ flex: 1 }}>
              <TextInput
                value={response?.remarks || ""}
                onChangeText={(val) =>
                  onResponseChange(item.id, "remarks", val || null)
                }
                placeholder="Add remarks..."
                placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                style={[
                  styles.remarksInput,
                  isDark && {
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    color: "#f8fafc",
                  },
                ]}
                multiline
              />
            </View>
          )}
        </View>

        {/* Image Preview */}
        {response?.image_url && (
          <View style={styles.imagePreviewRow}>
            <TouchableOpacity
              style={[
                styles.previewContainer,
                isDark && { borderColor: "#334155" },
              ]}
              onPress={() => {
                if (isCompleted) {
                  onPreview(response.image_url!);
                } else {
                  Alert.alert("Task Photo", "What would you like to do?", [
                    {
                      text: "Show Preview",
                      onPress: () => onPreview(response.image_url!),
                    },
                    {
                      text: "Replace photo",
                      onPress: () =>
                        Alert.alert("Replace photo", "Choose a source", [
                          {
                            text: "Take photo",
                            onPress: () => onImageChange(item.id, "CAMERA"),
                          },
                          {
                            text: "Choose from gallery",
                            onPress: () => onImageChange(item.id, "LIBRARY"),
                          },
                          { text: "Cancel", style: "cancel" },
                        ]),
                    },
                    { text: "Cancel", style: "cancel" },
                  ]);
                }
              }}
            >
              <Image
                source={{ uri: response.image_url }}
                style={styles.thumbnail}
              />
              {!isCompleted && (
                <TouchableOpacity
                  onPress={() => onImageChange(item.id, null)}
                  style={styles.removeImgBtn}
                >
                  <X size={12} color="#fff" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>
        )}
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
    prev.isCompleted === next.isCompleted,
);

TaskRow.displayName = "TaskRow";

// ─── Checklist Skeleton ─────────────────────────────────────────────────────
const ChecklistSkeleton = ({
  cardBg,
  borderColor,
  isDark,
}: {
  cardBg: string;
  borderColor: string;
  isDark: boolean;
}) => {
  return (
    <View style={styles.listContent}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={[
            styles.taskCard,
            { backgroundColor: cardBg, borderColor: borderColor },
          ]}
        >
          <View style={styles.taskHeader}>
            <Skeleton
              width={24}
              height={24}
              borderRadius={12}
              style={{ marginRight: 10 }}
            />
            <Skeleton width="70%" height={16} />
          </View>
          <View style={styles.choiceRow}>
            <Skeleton width="48%" height={40} borderRadius={12} />
            <Skeleton width="48%" height={40} borderRadius={12} />
          </View>
          <View style={styles.actionRow}>
            <Skeleton width={100} height={36} borderRadius={10} />
            <Skeleton width="50%" height={36} borderRadius={12} />
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
  const isDark = useColorScheme() === "dark";

  const bgColor = isDark ? "#020617" : "#f8fafc";
  const textColor = isDark ? "#f8fafc" : "#0f172a";
  const subTextColor = isDark ? "#94a3b8" : "#64748b";
  const borderColor = isDark ? "#1e293b" : "#f1f5f9";
  const headerTextCol = isDark ? "#f8fafc" : "#0f172a";
  const cardBg = isDark ? "#0f172a" : "#fff";

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

        // Load checklist items - local first, API fallback
        let items = await PMService.getChecklistItems(inst.maintenance_id);

        if (items.length === 0) {
          logger.info("No local checklist items, fetching from API", {
            module: "PM_EXECUTION",
            maintenanceId: inst.maintenance_id,
          });
          setFetchingChecklist(true);
          try {
            const apiItems = await PMService.fetchChecklistItemsFromAPI(
              inst.maintenance_id,
            );
            items = apiItems;
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
          },
        );

        // Verification fetch (optional but keeps DB and State in perfect sync)
        if (nextStatus !== sourceInstance?.status) {
          const updated = await PMService.getInstanceByServerId(
            instanceId as string,
          );
          if (updated) setInstance(updated);
        }

        if (!quiet) {
          Alert.alert("Saved", "Progress saved locally.", [
            { text: "OK", onPress: () => router.back() },
          ]);
        }
        return true;
      } catch (err) {
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
        Alert.alert("Add image", "Choose an option", [
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
    [handleSave, isConnected],
  );

  useEffect(() => {
    if (instanceId) {
      loadData(false);
    }
  }, [instanceId, isConnected, loadData]);

  // ── Progress derived value ────────────────────────────────────────────────
  const answered = Object.values(responses).filter(
    (r) => r.response_value,
  ).length;
  const total = checklistItems.length;
  // Visual percentage for the progress bar fill
  const progressPercent = total > 0 ? (answered / total) * 100 : 0;

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
      Alert.alert("Add evidence", "Choose an option", [
        {
          text: "Take photo",
          onPress: () => void pickInstanceImage(type, "camera"),
        },
        {
          text: "Choose from gallery",
          onPress: () => void pickInstanceImage(type, "library"),
        },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [pickInstanceImage],
  );

  const promptReplaceInstanceImage = useCallback(
    (type: "before_image" | "after_image", currentUri: string) => {
      Alert.alert("Evidence photo", "What would you like to do?", [
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
      ]);
    },
    [pickInstanceImage],
  );

  // ── Response handler ──────────────────────────────────────────────────────
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleResponseChange = useCallback(
    (
      itemId: string,
      field: "response_value" | "remarks" | "readings",
      value: string | null,
    ) => {
      setResponses((prev) => {
        const next = {
          ...prev,
          [itemId]: {
            ...prev[itemId],
            [field]: value,
          },
        };

        // Auto-save logic
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

        if (field === "response_value") {
          // Immediate save for button toggles
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
    [handleSave],
  );

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const missingMeasureReadings = useMemo(
    () =>
      checklistItems.filter((item) => {
        if (!isMeasureTask(item.task_name)) return false;
        const resp = responses[item.id];
        // Only enforce after the task has a response (completion already requires all answered).
        if (!resp?.response_value) return false;
        return !resp.readings || !resp.readings.trim();
      }),
    [checklistItems, responses],
  );

  const handleComplete = useCallback(
    async (signature: string) => {
      if (!signature) {
        Alert.alert("Required", "Please provide a signature.");
        return;
      }
      if (missingMeasureReadings.length > 0) {
        Alert.alert(
          "Readings Required",
          "Please enter readings for all tasks containing 'Measure' before completing.",
        );
        return;
      }

      setSaving(true);
      try {
        const now = Date.now();
        const saved = await handleSave(true, {
          status: "Completed",
          clientSign: signature,
          completed_on: now,
        });
        if (!saved) throw new Error("Failed to complete instance.");

        setShowCompletionModal(false);
        Alert.alert("Completed", "PM task marked as complete!", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } catch (err) {
        logger.error("Failed to complete PM", { error: err });
        Alert.alert("Error", "Failed to complete. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [handleSave, missingMeasureReadings.length],
  );

  // ── FlatList setup ────────────────────────────────────────────────────────
  const renderItem: ListRenderItem<PMChecklistItemRow> = useCallback(
    ({ item, index }) => (
      <TaskRow
        item={item}
        index={index}
        response={responses[item.id]}
        onResponseChange={handleResponseChange}
        onImageChange={handleImageChange}
        onPreview={setPreviewImageUrl}
        isUploading={uploadingItems[item.id]}
        isCompleted={instance?.status === "Completed"}
        style={{ backgroundColor: cardBg, borderColor: borderColor }}
      />
    ),
    [
      responses,
      handleResponseChange,
      handleImageChange,
      uploadingItems,
      instance?.status,
      cardBg,
      borderColor,
    ],
  );

  const keyExtractor = useCallback((item: PMChecklistItemRow) => item.id, []);

  const ListEmpty = (
    <View style={[styles.flex, { backgroundColor: bgColor }]}>
      {fetchingChecklist ? (
        <ChecklistSkeleton
          cardBg={cardBg}
          borderColor={borderColor}
          isDark={isDark}
        />
      ) : (
        <View style={styles.emptyChecklist}>
          <Text style={[styles.emptyText, isDark && { color: "#64748b" }]}>
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
                style={{
                  marginTop: 16,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
                  borderRadius: 8,
                }}
              >
                <Text
                  style={{
                    color: isDark ? "#94a3b8" : "#64748b",
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  Learn More
                </Text>
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
    missingMeasureReadings.length === 0 &&
    !!instance?.before_image &&
    !!instance?.after_image;

  if (loading && !instance) {
    return (
      <View
        style={{ flex: 1, backgroundColor: isDark ? "#020617" : "#f8fafc" }}
      >
        <ChecklistSkeleton
          cardBg={cardBg}
          borderColor={borderColor}
          isDark={isDark}
        />
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: bgColor }]}>
      <SafeAreaView
        style={[styles.flex, { backgroundColor: bgColor }]}
        edges={["top"]}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: isDark ? "#0f172a" : "#fff",
              borderBottomColor: borderColor,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={[
              styles.backBtn,
              { backgroundColor: isDark ? "#1e293b" : "#f1f5f9" },
            ]}
          >
            <ArrowLeft size={18} color={isDark ? "#94a3b8" : "#64748b"} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text
              style={[styles.headerTitle, { color: headerTextCol }]}
              numberOfLines={1}
            >
              {instance?.asset_id || instance?.title || "PM Task"}
            </Text>
            <Text style={[styles.headerSub, { color: subTextColor }]}>
              {instance?.title} · {instance?.asset_type}
            </Text>
          </View>
          {isConnected && (
            <TouchableOpacity
              onPress={() => loadData(true)}
              style={[
                styles.refreshBtn,
                {
                  backgroundColor: isDark ? "#1e293b" : "#f8fafc",
                  borderColor: borderColor,
                },
              ]}
              disabled={fetchingChecklist}
            >
              {fetchingChecklist ? (
                <ActivityIndicator size="small" color="#3b82f6" />
              ) : (
                <RefreshCw size={14} color="#94a3b8" />
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Stats Row: Progress + Evidence */}
        <View
          style={[
            styles.statsRow,
            {
              backgroundColor: isDark ? "#0f172a" : "#fff",
              borderBottomColor: borderColor,
            },
          ]}
        >
          {/* Progress Col */}
          <View style={styles.progressCol}>
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: isDark ? "#1e293b" : "#e2e8f0" },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  { width: `${progressPercent}%` as any },
                ]}
              />
            </View>
            <Text style={[styles.progressSub, { color: subTextColor }]}>
              {answered}/{total} Done
            </Text>
          </View>

          {/* Evidence Col */}
          <View style={styles.evidenceCol}>
            <TouchableOpacity
              onPress={() => {
                if (instance?.before_image) {
                  if (instance.status === "Completed") {
                    setPreviewImageUrl(instance.before_image);
                  } else {
                    promptReplaceInstanceImage(
                      "before_image",
                      instance.before_image,
                    );
                  }
                } else {
                  promptAddInstanceImage("before_image");
                }
              }}
              style={[
                styles.compactEvidenceBtn,
                {
                  backgroundColor: isDark ? "#1e293b" : "#f8fafc",
                  borderColor: isDark ? "#334155" : "#e2e8f0",
                },
                instance?.before_image
                  ? isDark
                    ? { borderColor: "#3b82f6", backgroundColor: "#172554" }
                    : styles.compactEvidenceBtnActive
                  : {},
              ]}
            >
              {instance?.before_image ? (
                <Image
                  source={{ uri: instance.before_image }}
                  style={styles.compactEvidencePreview}
                />
              ) : (
                <Camera size={16} color={isDark ? "#64748b" : "#94a3b8"} />
              )}
              <Text
                style={[
                  styles.compactEvidenceText,
                  { color: isDark ? "#475569" : "#94a3b8" },
                  instance?.before_image ? { color: "#3b82f6" } : {},
                ]}
              >
                Before
              </Text>
              {!instance?.before_image && (
                <Text style={styles.mandatoryDot}>•</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (instance?.after_image) {
                  if (instance.status === "Completed") {
                    setPreviewImageUrl(instance.after_image);
                  } else {
                    promptReplaceInstanceImage(
                      "after_image",
                      instance.after_image,
                    );
                  }
                } else {
                  promptAddInstanceImage("after_image");
                }
              }}
              style={[
                styles.compactEvidenceBtn,
                {
                  backgroundColor: isDark ? "#1e293b" : "#f8fafc",
                  borderColor: isDark ? "#334155" : "#e2e8f0",
                },
                instance?.after_image
                  ? isDark
                    ? { borderColor: "#3b82f6", backgroundColor: "#172554" }
                    : styles.compactEvidenceBtnActive
                  : {},
              ]}
            >
              {instance?.after_image ? (
                <Image
                  source={{ uri: instance.after_image }}
                  style={styles.compactEvidencePreview}
                />
              ) : (
                <CheckCircle2
                  size={16}
                  color={isDark ? "#64748b" : "#94a3b8"}
                />
              )}
              <Text
                style={[
                  styles.compactEvidenceText,
                  { color: isDark ? "#475569" : "#94a3b8" },
                  instance?.after_image ? { color: "#3b82f6" } : {},
                ]}
              >
                After
              </Text>
              {!instance?.after_image && (
                <Text style={styles.mandatoryDot}>•</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Checklist via FlatList */}
        {(loading || fetchingChecklist) && checklistItems.length === 0 ? (
          <ChecklistSkeleton
            cardBg={cardBg}
            borderColor={borderColor}
            isDark={isDark}
          />
        ) : (
          <FlashList
            data={checklistItems}
            // @ts-ignore
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            ListEmptyComponent={ListEmpty}
            // @ts-ignore
            estimatedItemSize={280}
            contentContainerStyle={[
              styles.listContent,
              { backgroundColor: bgColor },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* Footer Actions */}
        {!isCompleted && (
          <View
            style={[
              styles.footer,
              {
                backgroundColor: isDark ? "#0f172a" : "#fff",
                borderTopColor: borderColor,
              },
            ]}
          >
            <View style={styles.footerBtns}>
              <TouchableOpacity
                onPress={() => setShowCompletionModal(true)}
                disabled={!canComplete}
                style={[
                  styles.footerBtn,
                  {
                    backgroundColor: canComplete
                      ? "#22c55e"
                      : isDark
                        ? "#1e293b"
                        : "#e2e8f0",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.footerBtnText,
                    { color: canComplete ? "#fff" : "#94a3b8" },
                  ]}
                >
                  Complete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isCompleted && (
          <View
            style={[
              styles.completedBanner,
              {
                backgroundColor: isDark ? "#064e3b" : "#f0fdf4",
                borderTopColor: isDark ? "#065f46" : "#bbf7d0",
              },
            ]}
          >
            <Text
              style={[
                styles.completedText,
                { color: isDark ? "#4ade80" : "#15803d" },
              ]}
            >
              ✓ PM Completed
            </Text>
          </View>
        )}
      </SafeAreaView>

      {/* Completion Modal with Signature Pad */}
      <Modal
        visible={showCompletionModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCompletionModal(false)}
      >
        <View style={styles.modalBg}>
          <View style={[styles.modalSheet, { backgroundColor: cardBg }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: textColor }]}>
                  Complete PM Task
                </Text>
                <Text style={[styles.modalSub, { color: subTextColor }]}>
                  Please provide the client signature below.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCompletionModal(false)}
                style={[
                  styles.closeBtn,
                  { backgroundColor: isDark ? "#1e293b" : "#f1f5f9" },
                ]}
              >
                <X size={20} color={isDark ? "#94a3b8" : "#94a3b8"} />
              </TouchableOpacity>
            </View>

            <View
              style={[styles.signatureContainer, { borderColor: borderColor }]}
            >
              <SignaturePad
                standalone
                onOK={handleComplete}
                description="Sign here to confirm PM completion"
                okText="Confirm & Complete"
              />
            </View>

            {saving && (
              <View
                style={[
                  styles.savingOverlay,
                  isDark && { backgroundColor: "rgba(2,6,23,0.8)" },
                ]}
              >
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text
                  style={[styles.savingText, isDark && { color: "#f8fafc" }]}
                >
                  Processing completion...
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Image Preview Modal */}
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
              <X size={24} color="#fff" />
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
  loadingScreen: {
    flex: 1,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: { color: "#94a3b8", fontSize: 13, marginTop: 12 },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 10,
    flexGrow: 1,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f1f5f9",
    backgroundColor: "#fff",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  headerSub: { fontSize: 12, color: "#94a3b8" },
  refreshBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },

  // Stats Row
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f1f5f9",
    gap: 16,
  },
  progressCol: { flex: 1 },
  evidenceCol: { flexDirection: "row", gap: 8 },
  progressTrack: {
    height: 6,
    backgroundColor: "#e2e8f0",
    borderRadius: 99,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: "#3b82f6",
  },
  progressSub: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 4,
    fontWeight: "600",
  },
  compactEvidenceBtn: {
    width: 60,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  compactEvidenceBtnActive: {
    borderColor: "#3b82f6",
    backgroundColor: "#eff6ff",
  },
  compactEvidencePreview: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.5,
  },
  compactEvidenceText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
  },
  mandatoryDot: {
    position: "absolute",
    top: 2,
    right: 4,
    color: "#ef4444",
    fontSize: 14,
  },

  // Task Card
  taskCard: {
    backgroundColor: "transparent", // Handled inline for dark mode
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
  },
  taskHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  seqBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 1,
  },
  seqText: { fontSize: 11, fontWeight: "700" },
  taskName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "inherit", // Handled via Text color in TaskRow
    lineHeight: 20,
  },
  imgTag: {
    backgroundColor: "#fff7ed",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  imgTagText: { fontSize: 11, color: "#f97316" },

  choiceRow: { flexDirection: "row", gap: 8 },
  choiceBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  choiceText: { fontSize: 12, fontWeight: "600" },

  textInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: "#0f172a",
  },
  requiredReadingsInput: {
    borderColor: "#ef4444",
    borderWidth: 1.5,
    backgroundColor: "#fef2f2",
  },
  requiredReadingsInputDark: {
    borderColor: "#f87171",
    borderWidth: 1.5,
    backgroundColor: "#450a0a",
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
  },
  imagePickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  imageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  imageBtnHalf: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
  },
  imageBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  remarksInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: "#0f172a",
    minHeight: 40,
  },
  imagePreviewRow: {
    marginTop: 12,
    flexDirection: "row",
  },
  previewContainer: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removeImgBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  // Empty / Loading States
  emptyChecklist: {
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 40,
  },
  emptyText: {
    color: "#94a3b8",
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
  },
  emptySubText: {
    color: "#cbd5e1",
    fontSize: 12,
    marginTop: 6,
    textAlign: "center",
  },

  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 24,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#f1f5f9",
  },
  footerBtns: { flexDirection: "row", gap: 12 },
  footerBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  footerBtnText: { fontWeight: "700", fontSize: 14, color: "#fff" },

  completedBanner: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#f0fdf4",
    borderTopWidth: 1,
    borderTopColor: "#bbf7d0",
  },
  completedText: {
    color: "#15803d",
    fontWeight: "700",
    textAlign: "center",
    fontSize: 15,
  },

  // Modal
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: "90%",
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  modalSub: { fontSize: 13, color: "#94a3b8" },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  signatureContainer: {
    flex: 1,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.8)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  savingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
  },
  // Full screen preview
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
