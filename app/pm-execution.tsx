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

// ─── Types ──────────────────────────────────────────────────────────────────
interface ResponseMap {
  [checklistItemId: string]: {
    response_value: string | null;
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
  }: {
    item: PMChecklistItem;
    index: number;
    response?: ResponseMap[string];
    onResponseChange: (
      itemId: string,
      field: "response_value" | "remarks",
      value: string | null,
    ) => void;
    onImageChange: (itemId: string, uri: string | null) => void;
  }) => {
    const isDone = response?.response_value === "Done";
    const fieldType = item.fieldType || "Multiple Choice";

    return (
      <View style={styles.taskCard}>
        <View style={styles.taskHeader}>
          <View
            style={[
              styles.seqBadge,
              { backgroundColor: isDone ? "#dcfce7" : "#f1f5f9" },
            ]}
          >
            <Text
              style={[
                styles.seqText,
                { color: isDone ? "#16a34a" : "#94a3b8" },
              ]}
            >
              {index + 1}
            </Text>
          </View>
          <Text style={styles.taskName}>{item.taskName}</Text>
          {item.imageMandatory && (
            <View style={styles.imgTag}>
              <Text style={styles.imgTagText}>📷</Text>
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
                      backgroundColor: selected ? selColor : "#f8fafc",
                      borderColor: selected ? "transparent" : "#e2e8f0",
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      { color: selected ? "#fff" : "#64748b" },
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
            keyboardType={fieldType === "Number" ? "decimal-pad" : "default"}
            style={styles.textInput}
          />
        )}

        {/* Remarks & Image Row */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={() => onImageChange(item.serverId!, "PICK")}
            style={styles.imageBtn}
          >
            <Camera size={14} color="#64748b" />
            <Text style={styles.imageBtnText}>Add Image</Text>
          </TouchableOpacity>

          {(item.remarksMandatory || response?.response_value) && (
            <View style={{ flex: 1 }}>
              <TextInput
                value={response?.remarks || ""}
                onChangeText={(val) =>
                  onResponseChange(item.serverId!, "remarks", val || null)
                }
                placeholder="Add remarks..."
                style={styles.remarksInput}
                multiline
              />
            </View>
          )}
        </View>

        {/* Image Preview */}
        {response?.image_url && (
          <View style={styles.imagePreviewRow}>
            <View style={styles.previewContainer}>
              <Image
                source={{ uri: response.image_url }}
                style={styles.thumbnail}
              />
              <TouchableOpacity
                onPress={() => onImageChange(item.serverId!, null)}
                style={styles.removeImgBtn}
              >
                <X size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.response?.response_value === next.response?.response_value &&
    prev.response?.remarks === next.response?.remarks,
);

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

  const loadedRef = useRef(false);

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

          // 2. If empty or forced, fetch from server
          if ((items.length === 0 || forceServerFetch) && isConnected) {
            setFetchingChecklist(true);
            await PMService.pullChecklistItems(inst.maintenanceId);
            items = await PMService.getChecklistItems(inst.maintenanceId);
            setFetchingChecklist(false);
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
              remarks: r.remarks,
              image_url: r.imageUrl,
            };
          });
          setResponses(responseMap);
        }
      } catch (err) {
        console.error("Error loading PM execution data:", err);
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
          setResponses((prev) => ({
            ...prev,
            [itemId]: {
              ...prev[itemId],
              image_url: result.assets[0].uri,
            },
          }));
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
    [],
  );

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      loadData(false);
    }
  }, [loadData]);

  // ── Response handler ──────────────────────────────────────────────────────
  const handleResponseChange = useCallback(
    (
      itemId: string,
      field: "response_value" | "remarks",
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
  const progress =
    checklistItems.length > 0
      ? Math.round((answered / checklistItems.length) * 100)
      : 0;

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      for (const [itemId, resp] of Object.entries(responses)) {
        if (resp.response_value !== undefined) {
          await PMService.saveResponseLocally({
            instanceServerId: instanceId as string,
            checklist_item_id: itemId,
            response_value: resp.response_value,
            remarks: resp.remarks || null,
            image_url: resp.image_url || null,
          });
        }
      }
      Alert.alert("Saved", "Progress saved locally.");
    } catch {
      Alert.alert("Error", "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [responses, instanceId]);

  const handleStartPM = useCallback(async () => {
    if (!instanceId) return;
    await PMService.startInstance(instanceId as string);
    const updated = await PMService.getInstanceByServerId(instanceId as string);
    setInstance(updated);
  }, [instanceId]);

  const handleComplete = useCallback(async () => {
    if (!clientSignature.trim()) {
      Alert.alert("Required", "Please enter client signature.");
      return;
    }
    setSaving(true);
    try {
      await handleSave();
      await PMService.completeInstance(instanceId as string, clientSignature);
      setShowCompletionModal(false);
      Alert.alert("Completed", "PM task marked as complete!", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert("Error", "Failed to complete. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [clientSignature, handleSave, instanceId]);

  // ── FlatList setup ────────────────────────────────────────────────────────
  const renderItem: ListRenderItem<PMChecklistItem> = useCallback(
    ({ item, index }) => (
      <TaskRow
        item={item}
        index={index}
        response={responses[item.serverId!]}
        onResponseChange={handleResponseChange}
        onImageChange={handleImageChange}
      />
    ),
    [responses, handleResponseChange, handleImageChange],
  );

  const keyExtractor = useCallback((item: PMChecklistItem) => item.id, []);

  const ListHeader = (
    <>
      {/* Progress Bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${progress}%` as any }]}
          />
        </View>
        <Text style={styles.progressSub}>
          {answered} of {checklistItems.length} tasks completed
        </Text>
      </View>

      {checklistItems.length > 0 && (
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>
            Checklist ({checklistItems.length} tasks)
          </Text>
          {isConnected && (
            <TouchableOpacity
              onPress={() => loadData(true)}
              style={styles.refreshBtn}
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
      )}
    </>
  );

  const ListEmpty = (
    <View style={styles.emptyChecklist}>
      {fetchingChecklist ? (
        <>
          <ActivityIndicator color="#3b82f6" />
          <Text style={styles.emptyText}>Fetching checklist items...</Text>
        </>
      ) : (
        <>
          <Text style={styles.emptyText}>No checklist items found.</Text>
          {!instance?.maintenanceId && (
            <Text style={styles.emptySubText}>
              No checklist linked to this PM instance.
            </Text>
          )}
          {instance?.maintenanceId && isConnected && (
            <ActivityIndicator color="#3b82f6" style={{ marginTop: 20 }} />
          )}
        </>
      )}
    </View>
  );

  const isCompleted = instance?.status === "Completed";
  const isStarted = instance?.status === "In-progress";
  const canComplete = progress === 100 || Object.keys(responses).length > 0;

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading PM...</Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <ArrowLeft size={18} color="#64748b" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {instance?.assetId || instance?.title || "PM Task"}
            </Text>
            <Text style={styles.headerSub}>
              {instance?.title} · {instance?.assetType}
            </Text>
          </View>
          {fetchingChecklist && (
            <ActivityIndicator
              size="small"
              color="#3b82f6"
              style={{ marginLeft: 8 }}
            />
          )}
        </View>

        {/* Checklist via FlatList */}
        <FlatList
          data={checklistItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={15}
          windowSize={7}
          initialNumToRender={10}
          keyboardShouldPersistTaps="handled"
        />

        {/* Footer Actions */}
        {!isCompleted && (
          <View style={styles.footer}>
            <View style={styles.footerBtns}>
              {!isStarted && (
                <TouchableOpacity
                  onPress={handleStartPM}
                  style={[styles.footerBtn, { backgroundColor: "#f59e0b" }]}
                >
                  <Text style={styles.footerBtnText}>Start PM</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                style={[styles.footerBtn, { backgroundColor: "#dbeafe" }]}
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
                  { backgroundColor: canComplete ? "#22c55e" : "#e2e8f0" },
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
          <View style={styles.completedBanner}>
            <Text style={styles.completedText}>✓ PM Completed</Text>
          </View>
        )}
      </SafeAreaView>

      {/* Completion Modal */}
      <Modal
        visible={showCompletionModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCompletionModal(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Complete PM Task</Text>
            <Text style={styles.modalSub}>
              Enter the client's signature to confirm completion.
            </Text>

            <Text style={styles.inputLabel}>Client Signature (Name)</Text>
            <View style={styles.sigRow}>
              <View style={styles.sigIcon}>
                <Pen size={18} color="#94a3b8" />
              </View>
              <TextInput
                value={clientSignature}
                onChangeText={setClientSignature}
                placeholder="Enter client name / signature text"
                style={styles.sigInput}
              />
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity
                onPress={() => setShowCompletionModal(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleComplete}
                disabled={saving || !clientSignature.trim()}
                style={[
                  styles.confirmBtn,
                  {
                    backgroundColor: clientSignature.trim()
                      ? "#22c55e"
                      : "#e2e8f0",
                  },
                ]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.confirmBtnText,
                      {
                        color: clientSignature.trim() ? "#fff" : "#94a3b8",
                      },
                    ]}
                  >
                    Confirm Complete
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  listContent: { paddingHorizontal: 20, paddingBottom: 140 },

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

  // Progress
  progressSection: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f1f5f9",
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  progressLabel: { fontSize: 12, fontWeight: "600", color: "#64748b" },
  progressPct: { fontSize: 12, fontWeight: "800", color: "#3b82f6" },
  progressTrack: {
    height: 8,
    backgroundColor: "#e2e8f0",
    borderRadius: 99,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: "#3b82f6",
  },
  progressSub: { fontSize: 11, color: "#94a3b8", marginTop: 6 },

  // Section heading
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  refreshBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },

  // Task Card
  taskCard: {
    backgroundColor: "#fff",
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
    color: "#0f172a",
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
  fetchBtn: {
    marginTop: 16,
    backgroundColor: "#3b82f6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  fetchBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

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
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  modalSub: { fontSize: 13, color: "#94a3b8", marginBottom: 20 },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 8,
  },
  sigRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 20,
  },
  sigIcon: { padding: 12, backgroundColor: "#f8fafc" },
  sigInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
    fontSize: 14,
    color: "#0f172a",
  },
  modalBtns: { flexDirection: "row", gap: 12 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: "#f1f5f9",
    borderRadius: 14,
    alignItems: "center",
  },
  cancelBtnText: { color: "#64748b", fontWeight: "600", fontSize: 14 },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  confirmBtnText: { fontWeight: "700", fontSize: 14 },
});
