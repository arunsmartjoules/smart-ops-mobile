import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Modal,
  FlatList,
  ListRenderItem,
  Image,
  useColorScheme,
} from "react-native";
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
import PMChecklistItem from "@/database/models/PMChecklistItem";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import SignaturePad from "@/components/SignaturePad";
import logger from "@/utils/logger";
import Skeleton from "@/components/Skeleton";
import { StorageService } from "@/services/StorageService";
import { database } from "@/database";

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
    item: PMChecklistItem;
    index: number;
    response?: ResponseMap[string];
    onResponseChange: (
      itemId: string,
      field: "response_value" | "remarks" | "readings",
      value: string | null,
    ) => void;
    onImageChange: (itemId: string, uri: string | null) => void;
    onPreview: (uri: string) => void;
    isUploading?: boolean;
    isCompleted?: boolean;
    style?: any;
  }) => {
    const isDark = useColorScheme() === "dark";
    const isDone = response?.response_value === "Done";
    const fieldType = item.fieldType || "Multiple Choice";

    return (
      <View style={[styles.taskCard, style]}>
        <View style={styles.taskHeader}>
          <View
            style={[
              styles.seqBadge,
              { backgroundColor: isDone ? (isDark ? "#064e3b" : "#dcfce7") : (isDark ? "#334155" : "#f1f5f9") },
            ]}
          >
            <Text
              style={[
                styles.seqText,
                { color: isDone ? (isDark ? "#4ade80" : "#16a34a") : (isDark ? "#94a3b8" : "#94a3b8") },
              ]}
            >
              {index + 1}
            </Text>
          </View>
          <Text style={[styles.taskName, { color: isDark ? "#f8fafc" : "#0f172a" }]}>{item.taskName}</Text>
          {item.imageMandatory && (
            <View style={[styles.imgTag, isDark && { backgroundColor: "#431407" }]}>
              <Text style={[styles.imgTagText, isDark && { color: "#fb923c" }]}>📷</Text>
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
                    onResponseChange(item.serverId!, "response_value", opt)
                  }
                  style={[
                    styles.choiceBtn,
                    {
                      backgroundColor: selected ? selColor : (isDark ? "#1e293b" : "#f8fafc"),
                      borderColor: selected ? "transparent" : (isDark ? "#334155" : "#e2e8f0"),
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      { color: selected ? "#fff" : (isDark ? "#94a3b8" : "#64748b") },
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
              onResponseChange(item.serverId!, "response_value", val)
            }
            placeholder={`Enter ${fieldType.toLowerCase()}...`}
            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
            keyboardType={fieldType === "Number" ? "decimal-pad" : "default"}
            style={[styles.textInput, isDark && { backgroundColor: "#0f172a", borderColor: "#334155", color: "#f8fafc" }]}
          />
        )}

        {/* Readings Input */}
        <View style={{ marginTop: 12 }}>
          <Text style={styles.inputLabel}>Readings</Text>
          <TextInput
            value={response?.readings || ""}
            onChangeText={(val) =>
              onResponseChange(item.serverId!, "readings", val)
            }
            placeholder="Enter readings if applicable..."
            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
            keyboardType="decimal-pad"
            style={[styles.textInput, isDark && { backgroundColor: "#0f172a", borderColor: "#334155", color: "#f8fafc" }]}
          />
        </View>

        {/* Remarks & Image Row */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={() => onImageChange(item.serverId!, "PICK")}
            style={[styles.imageBtn, isDark && { backgroundColor: "#1e293b", borderColor: "#334155" }]}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color="#3b82f6" />
            ) : (
              <Camera size={14} color={isDark ? "#94a3b8" : "#64748b"} />
            )}
            <Text style={[styles.imageBtnText, isDark && { color: "#94a3b8" }]}>
              {isUploading ? "Uploading..." : "Add Image"}
            </Text>
          </TouchableOpacity>

          {(item.remarksMandatory || response?.response_value) && (
            <View style={{ flex: 1 }}>
              <TextInput
                value={response?.remarks || ""}
                onChangeText={(val) =>
                  onResponseChange(item.serverId!, "remarks", val || null)
                }
                placeholder="Add remarks..."
                placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                style={[styles.remarksInput, isDark && { backgroundColor: "#0f172a", borderColor: "#334155", color: "#f8fafc" }]}
                multiline
              />
            </View>
          )}
        </View>

        {/* Image Preview */}
        {response?.image_url && (
          <View style={styles.imagePreviewRow}>
            <TouchableOpacity
              style={[styles.previewContainer, isDark && { borderColor: "#334155" }]}
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
                      text: "Retake Photo",
                      onPress: () => onImageChange(item.serverId!, "PICK"),
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
                  onPress={() => onImageChange(item.serverId!, null)}
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

// ─── Checklist Skeleton ─────────────────────────────────────────────────────
const ChecklistSkeleton = () => {
  const isDark = useColorScheme() === "dark";
  return (
    <View style={styles.listContent}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[styles.taskCard, isDark && { backgroundColor: "#0f172a", borderColor: "#1e293b" }]}>
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
  const [checklistItems, setChecklistItems] = useState<PMChecklistItem[]>([]);
  const [responses, setResponses] = useState<ResponseMap>({});
  const [loading, setLoading] = useState(true);
  const [fetchingChecklist, setFetchingChecklist] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [clientSignature, setClientSignature] = useState("");
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
        const inst = await PMService.getInstanceByServerId(
          instanceId as string,
        );
        setInstance(inst);

        if (inst?.maintenanceId) {
          // 1. Try local cache
          let items = await PMService.getChecklistItems(inst.maintenanceId);

          // 2. If online, always attempt a background pull to ensure fresh data
          if (isConnected) {
            setFetchingChecklist(true);
            try {
              await PMService.pullChecklistItems(inst.maintenanceId);
              items = await PMService.getChecklistItems(inst.maintenanceId);
            } catch (err) {
              logger.error("Failed to fetch fresh checklist", { error: err });
            } finally {
              setFetchingChecklist(false);
            }
          }

          setChecklistItems(items);

          // 3. Load existing responses
          const existingResponses = await PMService.getResponsesForInstance(
            instanceId as string,
          );
          const responseMap: ResponseMap = {};
          existingResponses.forEach((r) => {
            responseMap[r.checklistItemId] = {
              response_value: r.responseValue,
              readings: r.readings,
              remarks: r.remarks,
              image_url: r.imageUrl,
            };
          });
          setResponses(responseMap);
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

  // ── Image handler ─────────────────────────────────────────────────────────
  const handleImageChange = useCallback(
    async (itemId: string, uri: string | null) => {
      if (uri === "PICK") {
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          quality: 0.7,
        });

        if (!result.canceled && result.assets[0].uri) {
          const pickedUri = result.assets[0].uri;

          // Offline-first behavior:
          // - online: attempt upload
          // - offline/failure: keep local URI and let PM sync upload later
          if (!isConnected) {
            setResponses((prev) => ({
              ...prev,
              [itemId]: {
                ...prev[itemId],
                image_url: pickedUri,
              },
            }));
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

            setResponses((prev) => ({
              ...prev,
              [itemId]: {
                ...prev[itemId],
                image_url: publicUrl || pickedUri,
              },
            }));

            if (!publicUrl) {
              Alert.alert(
                "Saved Offline",
                "Image upload will retry automatically when online.",
              );
            }
          } catch (err) {
            logger.error("Error during PM image upload:", { error: err });
            setResponses((prev) => ({
              ...prev,
              [itemId]: {
                ...prev[itemId],
                image_url: pickedUri,
              },
            }));
            Alert.alert(
              "Saved Offline",
              "Image saved locally and upload will retry automatically.",
            );
          } finally {
            setUploadingItems((prev) => ({ ...prev, [itemId]: false }));
          }
        }
      } else {
        setResponses((prev) => ({
          ...prev,
          [itemId]: {
            ...prev[itemId],
            image_url: null,
          },
        }));
      }
    },
    [instanceId, isConnected],
  );
  const handleInstanceImageChange = useCallback(
    async (type: "beforeImage" | "afterImage") => {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0].uri) {
        const pickedUri = result.assets[0].uri;

        // Try to upload immediately if online, else keep local URI
        let finalUri = pickedUri;
        if (isConnected) {
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

        setInstance((prev: any) => ({
          ...prev,
          [type]: finalUri,
          isSynced: false,
        }));
      }
    },
    [instanceId, isConnected],
  );

  useEffect(() => {
    if (instanceId) {
      loadData(false);
    }
  }, [instanceId, isConnected]);

  // ── Response handler ──────────────────────────────────────────────────────
  const handleResponseChange = useCallback(
    (
      itemId: string,
      field: "response_value" | "remarks" | "readings",
      value: string | null,
    ) => {
      setResponses((prev) => ({
        ...prev,
        [itemId]: {
          ...prev[itemId],
          [field]: value,
        },
      }));
    },
    [],
  );

  // ── Progress derived value ────────────────────────────────────────────────
  const answered = Object.values(responses).filter(
    (r) => r.response_value,
  ).length;
  const total = checklistItems.length;
  // Visual percentage for the progress bar fill
  const progressPercent = total > 0 ? (answered / total) * 100 : 0;

  const handleSave = useCallback(
    async (quiet = false) => {
      setSaving(true);
      try {
        const responseData = Object.entries(responses)
          .filter(([_, resp]) => resp.response_value !== undefined)
          .map(([itemId, resp]) => ({
            checklist_item_id: itemId,
            response_value: resp.response_value,
            readings: resp.readings || null,
            remarks: resp.remarks || null,
            image_url: resp.image_url || null,
          }));

        if (responseData.length > 0 || instance?.beforeImage || instance?.afterImage) {
          await PMService.saveResponsesBatch(
            instanceId as string,
            responseData,
          );

          // Also save instance images locally if they changed
          const local = await PMService.getInstanceByServerId(instanceId as string);
          if (local) {
            await database.write(async () => {
              await local.update((r: any) => {
                r.beforeImage = instance.beforeImage || null;
                r.afterImage = instance.afterImage || null;
                r.isSynced = false;
              });
            });
          }

          // If current status is Pending, automatically move it to In Progress
          if (instance?.status === "Pending") {
            try {
              await PMService.startInstance(instanceId as string);
              const updated = await PMService.getInstanceByServerId(
                instanceId as string,
              );
              if (updated) setInstance(updated);
            } catch (statusErr) {
              logger.error("Failed to auto-update status to In Progress", {
                error: statusErr,
              });
            }
          }
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
    [responses, instanceId, instance?.beforeImage, instance?.afterImage, instance?.status],
  );

  const handleComplete = useCallback(
    async (signature: string) => {
      if (!signature) {
        Alert.alert("Required", "Please provide a signature.");
        return;
      }

      setSaving(true);
      try {
        const saved = await handleSave(true);
        if (!saved)
          throw new Error("Failed to save responses before completion");

        await PMService.completeInstance(
          instanceId as string,
          signature,
          instance.beforeImage,
          instance.afterImage,
        );
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
    [handleSave, instanceId, instance?.beforeImage, instance?.afterImage],
  );

  // ── FlatList setup ────────────────────────────────────────────────────────
  const renderItem: ListRenderItem<PMChecklistItem> = useCallback(
    ({ item, index }) => (
      <TaskRow
        item={item}
        index={index}
        response={responses[item.serverId!]}
        onResponseChange={handleResponseChange}
        onImageChange={handleImageChange}
        onPreview={setPreviewImageUrl}
        isUploading={uploadingItems[item.serverId!]}
        isCompleted={instance?.status === "Completed"}
        style={{ backgroundColor: cardBg, borderColor: borderColor }}
      />
    ),
    [responses, handleResponseChange, handleImageChange, uploadingItems, instance?.status, cardBg, borderColor],
  );

  const keyExtractor = useCallback((item: PMChecklistItem) => item.id, []);

  const ListEmpty = (
    <View style={styles.flex}>
      {fetchingChecklist ? (
        <ChecklistSkeleton />
      ) : (
        <View style={styles.emptyChecklist}>
          <Text style={[styles.emptyText, isDark && { color: "#64748b" }]}>No checklist items found.</Text>
          {!instance?.maintenanceId && (
            <Text style={[styles.emptySubText, isDark && { color: "#334155" }]}>
              No checklist linked to this PM instance.
            </Text>
          )}
        </View>
      )}
    </View>
  );

  const isCompleted = instance?.status === "Completed";
  const canComplete =
    (progressPercent === 100 || Object.keys(responses).length > 0) &&
    !!instance?.beforeImage &&
    !!instance?.afterImage;

  if (loading && !instance) {
    return <ChecklistSkeleton />;
  }

  return (
    <View style={[styles.flex, { backgroundColor: bgColor }]}>
      <SafeAreaView style={styles.flex} edges={["top"]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: isDark ? "#0f172a" : "#fff", borderBottomColor: borderColor }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: isDark ? "#1e293b" : "#f1f5f9" }]}
          >
            <ArrowLeft size={18} color={isDark ? "#94a3b8" : "#64748b"} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={[styles.headerTitle, { color: headerTextCol }]} numberOfLines={1}>
              {instance?.assetId || instance?.title || "PM Task"}
            </Text>
            <Text style={[styles.headerSub, { color: subTextColor }]}>
              {instance?.title} · {instance?.assetType}
            </Text>
          </View>
          {isConnected && (
            <TouchableOpacity
              onPress={() => loadData(true)}
              style={[styles.refreshBtn, { backgroundColor: isDark ? "#1e293b" : "#f8fafc", borderColor: borderColor }]}
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
        <View style={[styles.statsRow, { backgroundColor: isDark ? "#0f172a" : "#fff", borderBottomColor: borderColor }]}>
          {/* Progress Col */}
          <View style={styles.progressCol}>
            <View style={[styles.progressTrack, { backgroundColor: isDark ? "#1e293b" : "#e2e8f0" }]}>
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
                if (instance?.beforeImage) {
                  if (instance.status === "Completed") {
                    setPreviewImageUrl(instance.beforeImage);
                  } else {
                    Alert.alert("Evidence Photo", "What would you like to do?", [
                      {
                        text: "Show Preview",
                        onPress: () => setPreviewImageUrl(instance.beforeImage),
                      },
                      {
                        text: "Retake Photo",
                        onPress: () => handleInstanceImageChange("beforeImage"),
                      },
                      { text: "Cancel", style: "cancel" },
                    ]);
                  }
                } else {
                  handleInstanceImageChange("beforeImage");
                }
              }}
              style={[
                styles.compactEvidenceBtn,
                { backgroundColor: isDark ? "#1e293b" : "#f8fafc", borderColor: isDark ? "#334155" : "#e2e8f0" },
                instance?.beforeImage ? (isDark ? { borderColor: "#3b82f6", backgroundColor: "#172554" } : styles.compactEvidenceBtnActive) : {},
              ]}
            >
              {instance?.beforeImage ? (
                <Image
                  source={{ uri: instance.beforeImage }}
                  style={styles.compactEvidencePreview}
                />
              ) : (
                <Camera size={16} color={isDark ? "#64748b" : "#94a3b8"} />
              )}
              <Text
                style={[
                  styles.compactEvidenceText,
                  { color: isDark ? "#475569" : "#94a3b8" },
                  instance?.beforeImage ? { color: "#3b82f6" } : {},
                ]}
              >
                Before
              </Text>
              {!instance?.beforeImage && (
                <Text style={styles.mandatoryDot}>•</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (instance?.afterImage) {
                  if (instance.status === "Completed") {
                    setPreviewImageUrl(instance.afterImage);
                  } else {
                    Alert.alert("Evidence Photo", "What would you like to do?", [
                      {
                        text: "Show Preview",
                        onPress: () => setPreviewImageUrl(instance.afterImage),
                      },
                      {
                        text: "Retake Photo",
                        onPress: () => handleInstanceImageChange("afterImage"),
                      },
                      { text: "Cancel", style: "cancel" },
                    ]);
                  }
                } else {
                  handleInstanceImageChange("afterImage");
                }
              }}
              style={[
                styles.compactEvidenceBtn,
                { backgroundColor: isDark ? "#1e293b" : "#f8fafc", borderColor: isDark ? "#334155" : "#e2e8f0" },
                instance?.afterImage ? (isDark ? { borderColor: "#3b82f6", backgroundColor: "#172554" } : styles.compactEvidenceBtnActive) : {},
              ]}
            >
              {instance?.afterImage ? (
                <Image
                  source={{ uri: instance.afterImage }}
                  style={styles.compactEvidencePreview}
                />
              ) : (
                <CheckCircle2 size={16} color={isDark ? "#64748b" : "#94a3b8"} />
              )}
              <Text
                style={[
                  styles.compactEvidenceText,
                  { color: isDark ? "#475569" : "#94a3b8" },
                  instance?.afterImage ? { color: "#3b82f6" } : {},
                ]}
              >
                After
              </Text>
              {!instance?.afterImage && (
                <Text style={styles.mandatoryDot}>•</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Checklist via FlatList */}
        {(loading || fetchingChecklist) && checklistItems.length === 0 ? (
          <ChecklistSkeleton />
        ) : (
          <FlatList
            data={checklistItems}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            ListEmptyComponent={ListEmpty}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            maxToRenderPerBatch={15}
            windowSize={7}
            initialNumToRender={10}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* Footer Actions */}
        {!isCompleted && (
          <View style={[styles.footer, { backgroundColor: isDark ? "#0f172a" : "#fff", borderTopColor: borderColor }]}>
            <View style={styles.footerBtns}>
              <TouchableOpacity
                onPress={() => handleSave()}
                disabled={saving}
                style={[styles.footerBtn, { backgroundColor: isDark ? "#1e1b4b" : "#dbeafe" }]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#3b82f6" />
                ) : (
                  <Text style={[styles.footerBtnText, { color: "#3b82f6" }]}>
                    Save Progress
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowCompletionModal(true)}
                disabled={!canComplete}
                style={[
                  styles.footerBtn,
                  { backgroundColor: canComplete ? "#22c55e" : (isDark ? "#1e293b" : "#e2e8f0") },
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
          <View style={[styles.completedBanner, { backgroundColor: isDark ? "#064e3b" : "#f0fdf4", borderTopColor: isDark ? "#065f46" : "#bbf7d0" }]}>
            <Text style={[styles.completedText, { color: isDark ? "#4ade80" : "#15803d" }]}>✓ PM Completed</Text>
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
                <Text style={[styles.modalTitle, { color: textColor }]}>Complete PM Task</Text>
                <Text style={[styles.modalSub, { color: subTextColor }]}>
                  Please provide the client's signature below.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCompletionModal(false)}
                style={[styles.closeBtn, { backgroundColor: isDark ? "#1e293b" : "#f1f5f9" }]}
              >
                <X size={20} color={isDark ? "#94a3b8" : "#94a3b8"} />
              </TouchableOpacity>
            </View>

            <View style={[styles.signatureContainer, { borderColor: borderColor }]}>
              <SignaturePad
                standalone
                onOK={handleComplete}
                description="Sign here to confirm PM completion"
                okText="Confirm & Complete"
              />
            </View>

            {saving && (
              <View style={[styles.savingOverlay, isDark && { backgroundColor: "rgba(2,6,23,0.8)" }]}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={[styles.savingText, isDark && { color: "#f8fafc" }]}>Processing completion...</Text>
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
  flex: { flex: 1, backgroundColor: "#f8fafc" },
  loadingScreen: {
    flex: 1,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: { color: "#94a3b8", fontSize: 13, marginTop: 12 },
  listContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 10 },

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
  progressSub: { fontSize: 10, color: "#94a3b8", marginTop: 4, fontWeight: "600" },
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
