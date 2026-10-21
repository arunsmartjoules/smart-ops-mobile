/**
 * PM execution — artboard "JouleOps App" `r_pmExec` (app.dc.html 664–703;
 * rules in v5Vals pxDone/pxTotal/pxOffset/pxTasks and the NEXT cycle).
 *
 * Logic is unchanged from the previous screen: local-first instance +
 * checklist load with API fallback, debounced autosave through
 * PMService.saveExecutionProgress (offline queue + attachment queue),
 * camera-only before/after evidence, mandatory-field validation, and the
 * signature sheet that completes the PM in the background.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { View, Alert, RefreshControl } from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import PMService from "@/services/PMService";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import logger from "@/utils/logger";
import { StorageService } from "@/services/StorageService";
import { EmptyState, JoPage, useJoTheme } from "@/components/jo/ui";
import {
  PMChecklistSkeleton,
  PMTaskRow,
  type ChecklistImageAction,
  type PMChecklistItemRow,
  type PMResponse,
  type ResponseField,
} from "@/components/pm/PMTaskRow";
import {
  CfmRow,
  CompleteFooter,
  EvidenceRow,
  EvidenceSlot,
  ExecBanner,
  ExecHint,
  PMExecHeader,
  PhotoPreview,
  SignatureSheet,
  StatusFooter,
} from "@/components/pm/PMExecUI";

// ─── Types ──────────────────────────────────────────────────────────────────
interface ResponseMap {
  [checklistItemId: string]: PMResponse;
}

const isMeasureTask = (taskName?: string | null) =>
  !!taskName && taskName.toLowerCase().includes("measure");

// TEMP (2026-06-10): per-task image-mandatory and measure-task readings are
// not enforced for PM completion — operators can complete without submitting
// an image or readings. Flip either back to `true` to re-enable enforcement.
// NOTE: the backend enforces the same two checks; keep these in sync with
// ENFORCE_PM_* in backend pmInstancesController.ts.
const ENFORCE_IMAGE_MANDATORY: boolean = false;
const ENFORCE_READINGS_MANDATORY: boolean = false;

const INSTANCE_IMAGE_PICKER_OPTIONS = {
  mediaTypes: ["images"] as ImagePicker.MediaType[],
  allowsEditing: false,
  quality: 0.7,
};

// Room the floating CTA (54 + paddings + optional blocked line) takes up.
const FOOTER_CLEARANCE = 132;

// ─── Main Screen ────────────────────────────────────────────────────────────
export default function PMExecutionScreen() {
  const t = useJoTheme();
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

  // ── Progress derived value ────────────────────────────────────────────────
  // Count only responses tied to a current checklist item. Responses left
  // over from a deleted/replaced checklist must not inflate the count — that
  // is what previously produced bogus progress like "20/10".
  const answered = checklistItems.filter(
    (it) => responses[it.id]?.response_value,
  ).length;
  const total = checklistItems.length;

  /**
   * Commissioning airflow for this asset, resolved server-side from
   * `assets.commissioning_cfm`. Only ~47% of PM rows have one, so the chip is
   * omitted entirely rather than showing an em-dash the operator can't act on.
   * Trailing ".0" is dropped — the source stores one decimal place.
   */
  const commissioningCfm = (() => {
    const raw = Number(instance?.design_cfm);
    if (instance?.design_cfm == null || Number.isNaN(raw)) return null;
    return Number.isInteger(raw)
      ? raw.toLocaleString("en-IN")
      : raw.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  })();

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

  // Latest instance for the async photo handlers — the camera/gallery can sit
  // open for a while, so a closure copy may be stale when it returns.
  const instanceRef = useRef<any>(null);
  useEffect(() => {
    instanceRef.current = instance;
  }, [instance]);

  const applyInstanceImageFromUri = useCallback(
    async (type: "before_image" | "after_image", pickedUri: string) => {
      // No inline upload. The photo shows at once and is saved locally;
      // PMService queues it and the attachment queue uploads it in the
      // background — retrying through dead spots — then swaps in the public
      // URL. Uploading here first meant a weak signal left the tile blank
      // until the upload finished or timed out, and leaving the screen in the
      // meantime dropped the photo altogether.
      const nextInstance = { ...(instanceRef.current || {}), [type]: pickedUri };
      setInstance(nextInstance);
      const saved = await handleSave(true, undefined, undefined, nextInstance);
      if (!saved) return;

      // The picker's file sits in a cache the OS may purge — point the tile
      // at the persisted copy the upload queue owns.
      const persisted = await PMService.getInstanceByServerId(
        instanceId as string,
      );
      const persistedUri = persisted?.[type];
      if (persistedUri && persistedUri !== pickedUri) {
        setInstance((prev: any) =>
          prev?.[type] === pickedUri ? { ...prev, [type]: persistedUri } : prev,
        );
      }
    },
    [instanceId, handleSave],
  );

  /**
   * Re-read the before/after photos from the local DB. A queued photo's local
   * copy is deleted once its upload lands (the DB then holds the public URL),
   * so a tile still pointing at the old path fails to load — this repoints it.
   */
  const refreshInstanceImages = useCallback(async () => {
    const persisted = await PMService.getInstanceByServerId(
      instanceId as string,
    );
    if (!persisted) return;
    setInstance((prev: any) => {
      if (!prev) return prev;
      let changed = false;
      const next = { ...prev };
      for (const field of ["before_image", "after_image"] as const) {
        if (persisted[field] && persisted[field] !== prev[field]) {
          next[field] = persisted[field];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [instanceId]);

  // Before/after evidence must be shot on site, so it is camera-only — no
  // gallery option, which let an old or unrelated photo stand in as proof.
  const captureInstanceImage = useCallback(
    async (type: "before_image" | "after_image") => {
      try {
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
      } catch (err) {
        logger.error("PM instance image capture error", { error: err });
        Alert.alert("Error", "Failed to capture photo.");
      }
    },
    [applyInstanceImageFromUri],
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
            text: "Retake photo",
            onPress: () => void captureInstanceImage(type),
          },
          { text: "Cancel", style: "cancel" },
        ],
      );
    },
    [captureInstanceImage],
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
        void captureInstanceImage(type);
      }
    },
    [instance, canEdit, captureInstanceImage, promptReplaceInstanceImage],
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
      // A signed-off PM keeps its Done/Not Done answers; only readings and
      // remarks stay editable after completion.
      const isSignedOff = instance?.status === "Completed";
      if (isSignedOff && field === "response_value") return;
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

        // Post-completion edits must not leave the PM failing the rules it
        // was completed under: while a required reading/remark is blank the
        // edit stays on screen but isn't saved (the stored value survives
        // until a replacement is typed).
        if (isSignedOff) {
          const item = checklistItems.find((it) => it.id === itemId);
          const resp = next[itemId];
          const isChoice =
            (item?.field_type || "Multiple Choice") === "Multiple Choice";
          const blankRequired =
            !!item &&
            ((isChoice
              ? Boolean(item.readings_mandatory) &&
                !String(resp?.readings || "").trim()
              : !String(resp?.response_value || "").trim()) ||
              (Boolean(item.remarks_mandatory) &&
                !String(resp?.remarks || "").trim()));
          if (blankRequired) return next;
        }

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
    [handleSave, canEdit, instance?.status, checklistItems],
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

  const afterImage = instance?.after_image as string | null | undefined;
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
      const isChoice =
        (item.field_type || "Multiple Choice") === "Multiple Choice";
      // A task ticked Done while its checklist-mandatory reading is blank —
      // the checkbox refuses that, but the reading can be cleared afterwards.
      // Enforced regardless of ENFORCE_READINGS_MANDATORY, which only governs
      // the older "measure"-in-the-name heuristic below.
      const missingRequiredReading =
        isChoice &&
        Boolean(item.readings_mandatory) &&
        response?.response_value === "Done" &&
        !String(response?.readings || "").trim();
      const missingReadings =
        missingRequiredReading ||
        (ENFORCE_READINGS_MANDATORY &&
          isMeasureTask(item.task_name) &&
          !!response?.response_value &&
          !String(response?.readings || "").trim());
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

    // The After photo is mandatory evidence (the Before photo stays optional).
    // Enforced here on the device only — the server can't check it, because
    // offline the photo is still queued on the phone when the completion
    // syncs; its URL reaches the server once the upload lands.
    const missingAfterImage = !String(afterImage || "").trim();

    return {
      missingResponses,
      missingReadings: Array.from(missingReadingsByTask),
      missingRemarks: Array.from(missingRemarksByTask),
      missingImages: Array.from(missingImagesByTask),
      missingAfterImage,
      byItemId,
      hasAny:
        missingResponses.length > 0 ||
        missingReadingsByTask.size > 0 ||
        missingRemarksByTask.size > 0 ||
        missingImagesByTask.size > 0 ||
        missingAfterImage,
    };
  }, [checklistItems, responses, afterImage]);

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
    if (v.missingImages.length)
      return `${plural(v.missingImages.length, "task")} need a photo`;
    return "After photo required";
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
    if (index < 0) {
      // Every task is done — the only gap left is the After photo, whose
      // slot sits at the top of the list (artboard order).
      if (!missingMandatoryValidation.missingAfterImage) return false;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {},
      );
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      return true;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
      () => {},
    );
    listRef.current?.scrollToIndex({
      index,
      animated: true,
      viewPosition: 0.15,
    });
    return true;
  }, [
    checklistItems,
    missingMandatoryValidation.byItemId,
    missingMandatoryValidation.missingAfterImage,
  ]);

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
    if (missingMandatoryValidation.missingAfterImage) {
      lines.push("- After photo not taken");
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
      <PMTaskRow
        item={item}
        response={responses[item.id]}
        onResponseChange={handleResponseChange}
        onImageChange={handleImageChange}
        onPreview={setPreviewImageUrl}
        isUploading={uploadingItems[item.id]}
        answerLocked={instance?.status === "Completed" || !canEdit}
        textLocked={!canEdit}
        imageRequired={ENFORCE_IMAGE_MANDATORY && Boolean(item.image_mandatory)}
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

  const beforeUri = instance?.before_image as string | null | undefined;
  const afterUri = instance?.after_image as string | null | undefined;
  const photosEditable = canEdit && !isCompleted;
  const showMissingAfter = !afterUri && completionAttempted && !isCompleted;

  // Before / after evidence leads the list, as on the artboard. Photo tiles
  // are rendered here (not as an inline component) so typing in a task above
  // never remounts them and re-decodes the photos.
  const ListHeader = (
    <View style={{ paddingBottom: 10 }}>
      <EvidenceRow>
        <EvidenceSlot
          label="Before photo"
          uri={beforeUri}
          highlight={photosEditable && !beforeUri}
          onPress={() => onEvidencePress("before_image")}
          onImageError={() => void refreshInstanceImages()}
        />
        <EvidenceSlot
          label="After photo"
          uri={afterUri}
          required
          missing={showMissingAfter}
          highlight={photosEditable && !!beforeUri && !afterUri}
          onPress={() => onEvidencePress("after_image")}
          onImageError={() => void refreshInstanceImages()}
        />
      </EvidenceRow>
      {commissioningCfm != null ? <CfmRow value={commissioningCfm} /> : null}
      {!isConnected ? (
        <ExecBanner
          icon="bx-wifi-off"
          tone="warn"
          text="Offline — answers and photos are saved on this phone and will sync automatically."
        />
      ) : null}
    </View>
  );

  const ListFooter =
    checklistItems.length > 0 ? (
      <ExecHint
        text={
          isCompleted
            ? "This PM is signed off. Task answers and photos are locked; readings and remarks can still be corrected and save automatically."
            : "Tap the box to cycle Done → Not Done → clear. Fields marked * must be filled before completion."
        }
      />
    ) : null;

  const ListEmpty = fetchingChecklist ? (
    <View style={{ marginHorizontal: -16 }}>
      <PMChecklistSkeleton />
    </View>
  ) : !instance?.maintenance_id ? (
    <EmptyState
      icon="bx-list-check"
      title="No checklist linked"
      sub="This PM instance has no checklist attached. Ask an admin to link one."
    />
  ) : !isConnected ? (
    <EmptyState
      icon="bx-wifi-off"
      title="Checklist not cached yet"
      sub="Connect to the internet and sync once to cache all checklists for offline use."
      action={{
        label: "Learn more",
        onPress: () =>
          Alert.alert(
            "Offline Mode",
            "To use PM checklists offline:\n\n1. Connect to internet\n2. Open the app and wait for sync to complete\n3. All checklists will be cached automatically\n\nAfter that, you can work offline.",
            [{ text: "OK" }],
          ),
      }}
    />
  ) : (
    <EmptyState
      icon="bx-list-check"
      title="No checklist items found"
      sub="Pull down to fetch the checklist again."
      action={{ label: "Try again", onPress: () => void loadData(true) }}
    />
  );

  if (loading && !instance) {
    return (
      <JoPage glow={false}>
        <PMExecHeader
          title="PM Task"
          sub="Loading checklist…"
          answered={0}
          total={0}
          onBack={() => router.back()}
        />
        <PMChecklistSkeleton />
      </JoPage>
    );
  }

  return (
    <JoPage glow={false}>
      <PMExecHeader
        title={instance?.asset_id || instance?.title || "PM Task"}
        sub={[instance?.title, instance?.asset_type].filter(Boolean).join(" · ")}
        answered={answered}
        total={total}
        onBack={() => router.back()}
      />

      {(loading || fetchingChecklist) && checklistItems.length === 0 ? (
        <PMChecklistSkeleton />
      ) : (
        <FlashList
          ref={listRef}
          data={checklistItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          ListFooterComponent={ListFooter}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: FOOTER_CLEARANCE + Math.max(insets.bottom, 12),
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={fetchingChecklist && checklistItems.length > 0}
              onRefresh={() => void loadData(true)}
              tintColor={t.muted}
              colors={[t.accent]}
            />
          }
        />
      )}

      {!isCompleted && canEdit ? (
        <CompleteFooter
          ready={ctaReady}
          blockedMessage={blockedMessage}
          onPress={() => {
            setCompletionAttempted(true);
            if (!ctaReady) {
              // Guide the operator straight to the first unfinished card
              // (scrolls + BAD-bordered highlight) instead of a bare count
              // popup; fall back to the popup only if there's no specific
              // task to point at.
              if (!scrollToFirstIncomplete()) {
                showCompletionBlockedPopup();
              }
              return;
            }
            setShowCompletionModal(true);
          }}
        />
      ) : null}

      {isCompleted ? (
        <StatusFooter
          icon="bxs-check-circle"
          tone="ok"
          text={`PM completed${completedAt ? ` · ${completedAt}` : ""}${canEdit ? " · Readings & remarks editable" : ""}`}
        />
      ) : null}

      {!isCompleted && !canEdit ? (
        <StatusFooter
          icon="bx-lock-alt"
          tone="mute"
          text="Read-only — start your day to fill in and complete this PM."
        />
      ) : null}

      <SignatureSheet
        visible={showCompletionModal}
        onClose={() => setShowCompletionModal(false)}
        onSign={handleComplete}
        saving={saving}
        doneCount={doneCount}
        notDoneCount={notDoneCount}
        photoCount={photoCount}
      />

      <PhotoPreview uri={previewImageUrl} onClose={() => setPreviewImageUrl(null)} />
    </JoPage>
  );
}
