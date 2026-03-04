import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Circle,
  Loader2,
  ChevronDown,
  Pen,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import PMService, { PMChecklistItemData } from "@/services/PMService";
import PMChecklistItem from "@/database/models/PMChecklistItem";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

// Types
interface ResponseMap {
  [checklistItemId: string]: {
    response_value: string | null;
    remarks: string | null;
    image_url: string | null;
  };
}

const MULTIPLE_CHOICE_OPTIONS = ["Done", "Not Done", "N/A"];

// Reusable task row component
const TaskRow = React.memo(
  ({
    item,
    response,
    onResponseChange,
  }: {
    item: PMChecklistItem;
    response?: ResponseMap[string];
    onResponseChange: (
      itemId: string,
      field: "response_value" | "remarks",
      value: string | null,
    ) => void;
  }) => {
    const isDone = response?.response_value === "Done";
    const fieldType = item.fieldType || "Multiple Choice";

    return (
      <View className="bg-white dark:bg-slate-900 rounded-2xl p-4 mb-3">
        <View className="flex-row items-start mb-3">
          <View
            className="w-6 h-6 rounded-full items-center justify-center mr-2 mt-0.5"
            style={{
              backgroundColor: isDone ? "#dcfce7" : "#f1f5f9",
            }}
          >
            <Text
              className="text-xs font-bold"
              style={{ color: isDone ? "#16a34a" : "#94a3b8" }}
            >
              {item.sequenceNo || "·"}
            </Text>
          </View>
          <Text className="text-slate-900 dark:text-slate-100 font-medium text-sm flex-1">
            {item.taskName}
          </Text>
          {item.imageMandatory && (
            <View className="bg-orange-50 px-1.5 py-0.5 rounded ml-2">
              <Text className="text-orange-500 text-xs">📷</Text>
            </View>
          )}
        </View>

        {/* Response field */}
        {fieldType === "Multiple Choice" ? (
          <View className="flex-row gap-2">
            {MULTIPLE_CHOICE_OPTIONS.map((opt) => {
              const selected = response?.response_value === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  onPress={() =>
                    onResponseChange(item.serverId!, "response_value", opt)
                  }
                  className="flex-1 py-2 rounded-xl items-center"
                  style={{
                    backgroundColor: selected
                      ? opt === "Done"
                        ? "#22c55e"
                        : opt === "Not Done"
                          ? "#ef4444"
                          : "#6366f1"
                      : "#f8fafc",
                    borderWidth: 1,
                    borderColor: selected ? "transparent" : "#e2e8f0",
                  }}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: selected ? "white" : "#64748b" }}
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
            keyboardType={fieldType === "Number" ? "numeric" : "default"}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 text-sm"
          />
        )}

        {/* Remarks field */}
        {(item.remarksMandatory || response?.response_value) && (
          <TextInput
            value={response?.remarks || ""}
            onChangeText={(val) =>
              onResponseChange(item.serverId!, "remarks", val || null)
            }
            placeholder="Add remarks..."
            className="mt-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 text-sm"
            multiline
          />
        )}
      </View>
    );
  },
);

export default function PMExecutionScreen() {
  const { instanceId } = useLocalSearchParams<{ instanceId: string }>();
  const { isConnected } = useNetworkStatus();

  const [instance, setInstance] = useState<any>(null);
  const [checklistItems, setChecklistItems] = useState<PMChecklistItem[]>([]);
  const [responses, setResponses] = useState<ResponseMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [clientSignature, setClientSignature] = useState("");

  // Load instance + checklist items
  useEffect(() => {
    if (!instanceId) return;
    const loadData = async () => {
      try {
        const inst = await PMService.getInstanceByServerId(
          instanceId as string,
        );
        setInstance(inst);

        if (inst?.maintenanceId) {
          // Try to load from local cache first
          let items = await PMService.getChecklistItems(inst.maintenanceId);
          if (items.length === 0 && isConnected) {
            await PMService.pullChecklistItems(inst.maintenanceId);
            items = await PMService.getChecklistItems(inst.maintenanceId);
          }
          setChecklistItems(items);

          // Load existing responses
          if (instanceId) {
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
        }
      } catch (err) {
        console.error("Error loading PM execution data:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [instanceId, isConnected]);

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

  // Calculate progress
  const progress =
    checklistItems.length > 0
      ? Math.round(
          (Object.values(responses).filter((r) => r.response_value).length /
            checklistItems.length) *
            100,
        )
      : 0;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // Save all responses locally
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
    } catch (err: any) {
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
    } catch (err) {
      Alert.alert("Error", "Failed to complete. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [clientSignature, handleSave, instanceId]);

  if (loading) {
    return (
      <View className="flex-1 bg-slate-50 dark:bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-slate-500 mt-3 text-sm">Loading PM...</Text>
      </View>
    );
  }

  const canComplete = progress === 100 || Object.keys(responses).length > 0;
  const isCompleted = instance?.status === "Completed";
  const isStarted = instance?.status === "In-progress";

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        {/* Header */}
        <View className="px-5 pt-2 pb-3 flex-row items-center border-b border-slate-100 dark:border-slate-800">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center mr-3"
          >
            <ArrowLeft size={18} color="#64748b" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text
              className="text-slate-900 dark:text-slate-50 font-bold text-base"
              numberOfLines={1}
            >
              {instance?.title || "PM Task"}
            </Text>
            <Text className="text-slate-400 text-xs">
              {instance?.assetType} · {instance?.frequency}
            </Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View className="px-5 py-3">
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="text-slate-600 dark:text-slate-300 text-xs font-medium">
              Progress
            </Text>
            <Text className="text-blue-600 font-bold text-xs">{progress}%</Text>
          </View>
          <View className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <View
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${progress}%` }}
            />
          </View>
          <Text className="text-slate-400 text-xs mt-1">
            {Object.values(responses).filter((r) => r.response_value).length} of{" "}
            {checklistItems.length} tasks done
          </Text>
        </View>

        {/* Checklist */}
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {checklistItems.length === 0 ? (
            <View className="items-center py-10">
              <Text className="text-slate-400 text-sm">
                No checklist items found for this PM task.
              </Text>
              {!instance?.maintenanceId && (
                <Text className="text-slate-400 text-xs mt-1">
                  No checklist linked to this instance.
                </Text>
              )}
            </View>
          ) : (
            checklistItems.map((item) => (
              <TaskRow
                key={item.id}
                item={item}
                response={responses[item.serverId!]}
                onResponseChange={handleResponseChange}
              />
            ))
          )}
        </ScrollView>

        {/* Footer Actions */}
        {!isCompleted && (
          <View
            className="px-5 py-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800"
            style={{ paddingBottom: 24 }}
          >
            <View className="flex-row gap-3">
              {!isStarted && (
                <TouchableOpacity
                  onPress={handleStartPM}
                  className="flex-1 py-3 rounded-xl items-center bg-amber-500"
                >
                  <Text className="text-white font-bold text-sm">Start PM</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                className="flex-1 py-3 rounded-xl items-center bg-blue-100"
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#3b82f6" />
                ) : (
                  <Text className="text-blue-600 font-bold text-sm">
                    Save Progress
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowCompletionModal(true)}
                disabled={!canComplete}
                className="flex-1 py-3 rounded-xl items-center"
                style={{ backgroundColor: canComplete ? "#22c55e" : "#e2e8f0" }}
              >
                <Text
                  className="font-bold text-sm"
                  style={{ color: canComplete ? "white" : "#94a3b8" }}
                >
                  Complete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isCompleted && (
          <View className="px-5 py-4 bg-green-50 dark:bg-green-900/20 border-t border-green-100">
            <Text className="text-green-700 font-bold text-center">
              ✓ PM Completed
            </Text>
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
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white dark:bg-slate-900 rounded-t-3xl px-6 pt-5 pb-10">
            <Text className="text-slate-900 dark:text-slate-50 text-lg font-bold mb-1">
              Complete PM Task
            </Text>
            <Text className="text-slate-400 text-sm mb-4">
              Enter the client's signature to confirm completion.
            </Text>

            <View className="mb-4">
              <Text className="text-slate-600 dark:text-slate-300 text-sm font-medium mb-2">
                Client Signature (Name)
              </Text>
              <View className="flex-row items-center border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <View className="p-3 bg-slate-50 dark:bg-slate-800">
                  <Pen size={18} color="#94a3b8" />
                </View>
                <TextInput
                  value={clientSignature}
                  onChangeText={setClientSignature}
                  placeholder="Enter client name / signature text"
                  className="flex-1 px-3 py-3 text-slate-900 dark:text-slate-100 text-sm"
                />
              </View>
            </View>

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowCompletionModal(false)}
                className="flex-1 py-3 bg-slate-100 rounded-xl items-center"
              >
                <Text className="text-slate-600 font-semibold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleComplete}
                disabled={saving || !clientSignature.trim()}
                className="flex-1 py-3 rounded-xl items-center"
                style={{
                  backgroundColor: clientSignature.trim()
                    ? "#22c55e"
                    : "#e2e8f0",
                }}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text
                    className="font-bold"
                    style={{
                      color: clientSignature.trim() ? "white" : "#94a3b8",
                    }}
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
