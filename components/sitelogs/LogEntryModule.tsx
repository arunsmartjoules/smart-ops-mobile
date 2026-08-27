import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
// No expo-router hooks here on purpose — they throw "Couldn't find a
// navigation context" during route teardown. Params arrive as props from the
// route wrapper, which reads them from the routeParams store (no hooks).
import { ChevronLeft, CheckCircle2, Droplets, FlaskConical, Thermometer, Save, Info, ListChecks, Clock, Lock } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/contexts/AuthContext";
import { SiteConfigService, TaskItem } from "@/services/SiteConfigService";
import { SiteLogService } from "@/services/SiteLogService";
import syncEngine from "@/services/SyncEngine";
import {
  recordLogActivityEvent,
  recordLogActivityStartOnce,
  uiShiftToLabel,
} from "@/services/LogActivityMasterService";
import { UnifiedLogItem } from "./UnifiedLogItem";
import { DateNavBar } from "./DateNavBar";
import SignaturePad from "@/components/SignaturePad";
import { getISTDateString } from "@/services/AttendanceService";
import { formatISTDate } from "@/utils/istDate";
import { db } from "@/database";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { soRadius, soShadow } from "@/components/home/SiteOverview";
import {
  UnderlineTabs,
  tabToneLight,
} from "@/components/shared/ListChrome";

interface LogEntryModuleProps {
  type: "Chemical" | "Water" | "TempRH";
  siteCode?: string;
  /** Edit-mode log id (was previously read from useLocalSearchParams). */
  editId?: string;
  /** Initial shift for TempRH (was previously read from params). */
  initialShift?: "A" | "B" | "C" | null;
  onBack: () => void;
}

export const LogEntryModule = ({
  type,
  siteCode: initialSiteCode,
  editId,
  initialShift,
  onBack,
}: LogEntryModuleProps) => {
  const entryStyles = useEntryStyles();
  const ds = useDs();
  const { user } = useAuth();
  const isEditMode = !!editId;
  
  // State
  const [scheduledDate, setScheduledDate] = useState(getISTDateString());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [siteCode, setSiteCode] = useState<string | null>(initialSiteCode || null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery] = useState("");
  const [shift, setShift] = useState<string | null>(
    type === "TempRH" ? (initialShift ?? "A") : null,
  );
  
  // Form State
  const [logValues, setLogValues] = useState<Record<string, any>>({});
  const [signature, setSignature] = useState<string | null>(null);
  const [showSignature, setShowSignature] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Metadata
  const [prevCount, setPrevCount] = useState(0);
  const [nextCount, setNextCount] = useState(0);
  const [siteName, setSiteName] = useState<string | null>(null);
  const [shiftPending, setShiftPending] = useState<Record<string, number>>({
    A: 0,
    B: 0,
    C: 0,
  });

  const logName = type === "TempRH" ? "Temp RH" : type === "Water" ? "Water Monitoring" : "Chemical Dosing";
  const screenTitle =
    type === "TempRH"
      ? "Temp RH"
      : type === "Water"
        ? "Water Monitoring"
        : "Chemical Dosing";
  // Fieldproxy log_activity_master uses these canonical labels; "Water
  // Monitoring" doesn't exist there, FP rows are stored as "Water".
  const activityLogType =
    type === "TempRH" ? "Temp RH" : type === "Water" ? "Water" : "Chemical Dosing";
  // Load Sites
  useEffect(() => {
    const loadSites = async () => {
      try {
        const userSites = await db.query.userSites.findMany();
        if (!siteCode && userSites.length > 0) {
          const lastSite = await AsyncStorage.getItem(`last_site_${user?.id}`);
          setSiteCode(lastSite || userSites[0].site_code);
        }
      } catch {}
    };
    loadSites();
    // Mount-only: seed the initial site once. Intentionally not re-run when
    // siteCode/user change — the guard above only ever sets an empty siteCode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve a human site name for the header subtitle.
  useEffect(() => {
    if (!siteCode) return;
    (async () => {
      try {
        const sites = await db.query.userSites.findMany();
        const match = sites.find((s: any) => s.site_code === siteCode);
        setSiteName(match?.site_name || siteCode);
      } catch {
        setSiteName(siteCode);
      }
    })();
  }, [siteCode]);

  // Sync Site Selection to AsyncStorage
  useEffect(() => {
    if (siteCode) {
      AsyncStorage.setItem(`last_site_${user?.id}`, siteCode);
    }
  }, [siteCode, user?.id]);

  // Load Tasks
  // Load Tasks
  const loadTasks = async (showLoading = true, forceRefresh = false) => {
    if (!siteCode) return;
    if (showLoading) setLoading(true);
    try {
      let finalTasks: TaskItem[] = [];
      const initialValues: Record<string, any> = {};

      if (editId) {
        // --- Edit Mode: Single Task ---
        const log = await SiteLogService.getSiteLogById(editId);
        if (log) {
          // Sync state with log
          setScheduledDate(log.scheduled_date);
          // Text columns are parsed only for pre-split rows.
          const shiftSource =
            log.shift_label || log.meta_date || log.remarks || "";
          const logShift = shiftSource.includes("1/3")
            ? "A"
            : shiftSource.includes("2/3")
              ? "B"
              : shiftSource.includes("3/3")
                ? "C"
                : null;
          if (logShift) setShift(logShift);
          
          const task: TaskItem = {
            id: log.id,
            name: log.task_name || "Manual Log",
            type: "area",
            isCompleted: log.status === "Completed",
            status: log.status,
            meta: log
          };
          finalTasks = [task];
          
          // Populate Initial Values
          if (type === "Chemical") {
            initialValues[task.id] = { dosing: log.chemical_dosing || "", attachment: log.attachment || "", mainRemarks: log.main_remarks || "" };
          } else if (type === "Water") {
            initialValues[task.id] = { tds: log.tds?.toString() || "", ph: log.ph?.toString() || "", hardness: log.hardness?.toString() || "", attachment: log.attachment || "", mainRemarks: log.main_remarks || "" };
          } else {
            initialValues[task.id] = { temp: log.temperature?.toString() || "", rh: log.rh?.toString() || "", attachment: log.attachment || "", mainRemarks: log.main_remarks || "" };
          }
          if (log.signature) setSignature(log.signature);
        }
      } else {
        // --- Entry Mode: Bulk Tasks ---
        // Ensure pending/open/inprogress records are refreshed before rendering,
        // so users see a loading state first instead of a false empty state.
        if (forceRefresh || showLoading) {
          await SiteLogService.prefetchPendingForCategory(siteCode, logName);
        }

        finalTasks = await SiteConfigService.getPendingTasks(
          siteCode,
          logName,
          scheduledDate,
          shift || undefined
        );

        finalTasks.forEach(task => {
          if (type === "Chemical") {
            initialValues[task.id] = { dosing: task.meta?.chemical_dosing || "", attachment: task.meta?.attachment || "", mainRemarks: task.meta?.main_remarks || "" };
          } else if (type === "Water") {
            initialValues[task.id] = { tds: task.meta?.tds?.toString() || "", ph: task.meta?.ph?.toString() || "", hardness: task.meta?.hardness?.toString() || "", attachment: task.meta?.attachment || "", mainRemarks: task.meta?.main_remarks || "" };
          } else {
            initialValues[task.id] = { temp: task.meta?.temperature?.toString() || "", rh: task.meta?.rh?.toString() || "", attachment: task.meta?.attachment || "", mainRemarks: task.meta?.main_remarks || "" };
          }
        });

        // Load Draft
        const draftKey = `draft_${type.toLowerCase()}_${siteCode}_${user?.id}_${scheduledDate}${shift ? `_${shift}` : ""}`;
        const savedDraft = await AsyncStorage.getItem(draftKey);
        if (savedDraft) {
          try {
            const { values, signature: sig } = JSON.parse(savedDraft);
            if (values) {
              Object.keys(values).forEach(k => {
                if (initialValues[k]) initialValues[k] = { ...initialValues[k], ...values[k] };
              });
            }
            if (sig) setSignature(sig);
          } catch {}
        }

      }

      setTasks(finalTasks);
      setLogValues(initialValues);

      // 4. Counts (only if not editing)
      if (!editId) {
        const counts = await SiteConfigService.getPendingCountSummary(siteCode, logName, scheduledDate);
        setPrevCount(counts.before);
        setNextCount(counts.after);
      } else {
        setPrevCount(0);
        setNextCount(0);
      }
    } catch (error) {
      console.error("Load tasks failed", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTasks();
    // loadTasks is recreated every render; including it would loop. The deps below
    // are the real inputs that should trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteCode, scheduledDate, shift, editId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTasks(false, true);
  };

  // Save Draft (debounced). Serializing the WHOLE form to AsyncStorage on every
  // keystroke stringified the entire logValues map per character — visible lag
  // on multi-room sites. Debounce so the write only fires ~400ms after typing
  // pauses; the SQLite auto-save (updateValue) already covers durable persistence.
  useEffect(() => {
    if (siteCode && Object.keys(logValues).length > 0 && !editId) {
      const draftKey = `draft_${type.toLowerCase()}_${siteCode}_${user?.id}_${scheduledDate}${shift ? `_${shift}` : ""}`;
      const t = setTimeout(() => {
        AsyncStorage.setItem(
          draftKey,
          JSON.stringify({ values: logValues, signature }),
        ).catch(() => {});
      }, 400);
      return () => clearTimeout(t);
    }
  }, [logValues, signature, editId, siteCode, scheduledDate, shift, type, user?.id]);

  const updateValue = (taskId: string, field: string, val: string) => {
    setLogValues((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {}),
        [field]: val,
      },
    }));

    // Fire a one-shot Start event the first time this task receives input.
    // recordLogActivityStartOnce dedupes per session and is best-effort —
    // failures must not block the existing offline-first flow.
    //
    // assigned_to is deliberately NOT sent: the server derives the assignee
    // from the authenticated Firebase user, and the row is write-once on the
    // backend (see logActivityMasterController.event + repository COALESCE
    // guard). Sending it from mobile creates an override vector that reassigns
    // the row to whoever last touched it — wrong on shared devices.
    if (val && String(val).trim().length > 0 && siteCode) {
      recordLogActivityStartOnce({
        action: "start",
        site_id: siteCode,
        log_type: activityLogType,
        due_date: scheduledDate,
        shift_label: uiShiftToLabel(shift),
        executor_id: user?.name || null,
      }).catch(() => {});
    }

    // Schedule debounced auto-save for this specific task.
    const existing = autoSaveTimers.current.get(taskId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      autoSaveTimers.current.delete(taskId);
      autoSaveTaskRef.current(taskId).catch(() => {});
    }, AUTO_SAVE_DEBOUNCE_MS);
    autoSaveTimers.current.set(taskId, timer);
  };

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    if (!searchQuery) return tasks;
    return tasks.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [tasks, searchQuery]);

  const isTaskComplete = useCallback(
    (taskId: string) => {
      const value = logValues[taskId] || {};
      if (type === "Chemical") return !!value.dosing;
      if (type === "Water") {
        return !!(
          (value.tds && String(value.tds).trim().length > 0) ||
          (value.ph && String(value.ph).trim().length > 0) ||
          (value.hardness && String(value.hardness).trim().length > 0)
        );
      }
      return !!(
        value.temp &&
        String(value.temp).trim().length > 0 &&
        value.rh &&
        String(value.rh).trim().length > 0
      );
    },
    [logValues, type],
  );

  // ── Auto-save ────────────────────────────────────────────────────────────
  // After the user stops typing for AUTO_SAVE_DEBOUNCE_MS, persist that
  // task's row to local SQLite and enqueue it for background sync.
  // SyncEngine handles offline → online transitions and flushes the queue;
  // each PUT triggers Fieldproxy sync via the backend controller.
  const AUTO_SAVE_DEBOUNCE_MS = 600;
  const autoSaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const autoSaveTask = useCallback(
    async (taskId: string) => {
      if (!siteCode) return;
      const val = logValues[taskId];
      if (!val) return;
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      // Skip if no field has a value yet — nothing to save.
      const hasData =
        type === "Chemical"
          ? !!val.dosing
          : type === "Water"
            ? !!(
                (val.tds && String(val.tds).trim()) ||
                (val.ph && String(val.ph).trim()) ||
                (val.hardness && String(val.hardness).trim())
              )
            : !!(
                (val.temp && String(val.temp).trim()) ||
                (val.rh && String(val.rh).trim())
              );
      if (!hasData) return;

      // Auto-save NEVER marks a row Completed. "Completed" is reserved for
      // the explicit submit-with-signature flow (handleSubmit) — otherwise
      // a row drops out of the pending list the instant both fields are
      // filled, which (a) shows it as Completed without a signature, and
      // (b) empties the tasks array so handleSubmit hits its "No Data"
      // early-return and the Complete & Sign button does nothing.
      const status = "Inprogress";

      // In edit mode there's exactly one row; use updateSiteLog so we don't
      // overwrite the original signature and assigned_to.
      if (isEditMode && editId) {
        try {
          if (type === "Chemical") {
            await SiteLogService.updateSiteLog(editId, {
              chemicalDosing: val.dosing || null,
              mainRemarks: val.mainRemarks || null,
              meta_date: task.meta?.meta_date || null,
              shift_label: uiShiftToLabel(shift),
              attachment: val.attachment || null,
              status,
            });
          } else if (type === "Water") {
            await SiteLogService.updateSiteLog(editId, {
              tds: val.tds && String(val.tds).trim() ? parseFloat(val.tds) : null,
              ph: val.ph && String(val.ph).trim() ? parseFloat(val.ph) : null,
              hardness:
                val.hardness && String(val.hardness).trim()
                  ? parseFloat(val.hardness)
                  : null,
              mainRemarks: val.mainRemarks || null,
              meta_date: task.meta?.meta_date || null,
              shift_label: uiShiftToLabel(shift),
              attachment: val.attachment || null,
              status,
            });
          } else {
            await SiteLogService.updateSiteLog(editId, {
              temperature:
                val.temp && String(val.temp).trim() ? parseFloat(val.temp) : null,
              rh: val.rh && String(val.rh).trim() ? parseFloat(val.rh) : null,
              mainRemarks: val.mainRemarks || null,
              meta_date: task.meta?.meta_date || null,
              shift_label: uiShiftToLabel(shift),
              attachment: val.attachment || null,
              status,
            });
          }
        } catch {
          // Silent — SyncEngine retries from offline_queue.
        }
        return;
      }

      // Bulk-screen path: upsert this single task.
      const payload = {
        id: task.id,
        site_code: siteCode,
        executor_id: user?.name || null,
        log_name: logName,
        task_name: task.name,
        scheduled_date: scheduledDate,
        status,
        main_remarks: val.mainRemarks || null,
        meta_date: task.meta?.meta_date || null,
        shift_label: uiShiftToLabel(shift),
        ...(type === "Chemical" ? { chemical_dosing: val.dosing } : {}),
        ...(type === "Water"
          ? {
              tds:
                val.tds && String(val.tds).trim() ? parseFloat(val.tds) : null,
              ph: val.ph && String(val.ph).trim() ? parseFloat(val.ph) : null,
              hardness:
                val.hardness && String(val.hardness).trim()
                  ? parseFloat(val.hardness)
                  : null,
            }
          : {}),
        ...(type === "TempRH"
          ? {
              temperature:
                val.temp && String(val.temp).trim() ? parseFloat(val.temp) : null,
              rh: val.rh && String(val.rh).trim() ? parseFloat(val.rh) : null,
            }
          : {}),
        attachment: val.attachment,
      };

      try {
        await SiteLogService.saveBulkSiteLogs([payload as any]);
      } catch {
        // Silent — local save + queue happens regardless; SyncEngine retries.
      }
      // Kick the sync engine so the queue flushes immediately when online,
      // instead of waiting up to 15 minutes for the periodic interval.
      // syncNow() is internally debounced — concurrent calls share one promise.
      syncEngine.syncNow().catch(() => {});
    },
    [
      logValues,
      tasks,
      type,
      shift,
      siteCode,
      scheduledDate,
      user,
      logName,
      isEditMode,
      editId,
    ],
  );

  // Always-fresh ref so debounced timers see the latest closure.
  const autoSaveTaskRef = useRef(autoSaveTask);
  useEffect(() => {
    autoSaveTaskRef.current = autoSaveTask;
  }, [autoSaveTask]);

  // On unmount, clear pending timers and flush any queued saves immediately.
  useEffect(() => {
    // autoSaveTimers.current is a stable Map instance (never reassigned), so capturing
    // it here is safe — the cleanup still sees the timers accumulated over the lifetime.
    const timers = autoSaveTimers.current;
    return () => {
      const pending = Array.from(timers.entries());
      timers.clear();
      pending.forEach(([taskId, timer]) => {
        clearTimeout(timer);
        autoSaveTaskRef.current(taskId).catch(() => {});
      });
    };
  }, []);

  const allScheduledTasksComplete =
    tasks.length > 0 && tasks.every((task) => isTaskComplete(task.id));

  const filledCount = useMemo(
    () => tasks.filter((t) => isTaskComplete(t.id)).length,
    [tasks, isTaskComplete],
  );
  const remainingCount = Math.max(0, tasks.length - filledCount);

  // Per-shift pending counts for the shift tabs (Temp & RH only).
  useEffect(() => {
    if (type !== "TempRH" || !siteCode || isEditMode) return;
    let cancelled = false;
    Promise.all([
      SiteConfigService.getPendingCountForDate(siteCode, logName, scheduledDate, "A"),
      SiteConfigService.getPendingCountForDate(siteCode, logName, scheduledDate, "B"),
      SiteConfigService.getPendingCountForDate(siteCode, logName, scheduledDate, "C"),
    ])
      .then(([a, b, c]) => {
        if (!cancelled) setShiftPending({ A: a, B: b, C: c });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [type, siteCode, scheduledDate, logName, isEditMode, tasks.length]);

  const userInitials = useMemo(() => {
    const n = (user?.name || user?.user_id || "?").trim();
    const parts = n.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
  }, [user]);

  const headerDate = useMemo(() => {
    try {
      return formatISTDate(new Date(scheduledDate));
    } catch {
      return scheduledDate;
    }
  }, [scheduledDate]);

  // Manual save: flush all pending debounced auto-saves immediately.
  const handleManualSave = useCallback(() => {
    const pending = Array.from(autoSaveTimers.current.entries());
    autoSaveTimers.current.clear();
    pending.forEach(([taskId, timer]) => {
      clearTimeout(timer);
      autoSaveTaskRef.current(taskId).catch(() => {});
    });
    tasks.forEach((t) => {
      autoSaveTaskRef.current(t.id).catch(() => {});
    });
  }, [tasks]);

  // Submission
  const handleSubmit = async (signatureOverride?: string) => {
    if (!siteCode) return;
    const effectiveSignature = signatureOverride || signature;

    // Cancel any in-flight auto-save timers so the signed Submit PUT can't
    // be silently overwritten by an unsigned debounced auto-save firing late.
    autoSaveTimers.current.forEach((t) => clearTimeout(t));
    autoSaveTimers.current.clear();
    
    if (!isEditMode && tasks.length === 0) {
      Alert.alert("No Data", "No scheduled logs are available for this selection.");
      return;
    }

    if (!isEditMode && !allScheduledTasksComplete) {
      Alert.alert(
        "Incomplete Logs",
        type === "TempRH"
          ? "Each card must have both Temp and RH values before completing."
          : type === "Water"
            ? "Each card must have at least one Water measurement before completing."
            : "Each card must have a Chemical Dosing selection before completing.",
      );
      return;
    }

    const entriesWithData = Object.values(logValues).filter(v => {
      if (type === "Chemical") return v.dosing;
      if (type === "Water") return v.tds || v.ph || v.hardness;
      return v.temp || v.rh;
    });

    if (entriesWithData.length === 0) {
      Alert.alert("No Data", "Please enter measurements for at least one area.");
      return;
    }

    if (!effectiveSignature && !isEditMode) {
      setShowSignature(true);
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditMode && editId && tasks[0]) {
        const task = tasks[0];
        const val = logValues[task.id] || {};

        if (type === "Chemical") {
          const hasDosing = !!val.dosing;
          await SiteLogService.updateSiteLog(editId, {
            chemicalDosing: val.dosing || null,
            mainRemarks: val.mainRemarks || null,
            meta_date: task.meta?.meta_date || null,
            shift_label: uiShiftToLabel(shift),
            attachment: val.attachment || null,
            signature: effectiveSignature || undefined,
            status: hasDosing ? "Completed" : "Inprogress",
            assignedTo: user?.name || user?.user_id || "unknown",
          });
        } else if (type === "Water") {
          const hasTds = !!(val.tds && String(val.tds).trim().length > 0);
          const hasPh = !!(val.ph && String(val.ph).trim().length > 0);
          const hasHardness = !!(
            val.hardness && String(val.hardness).trim().length > 0
          );
          const status = hasTds || hasPh || hasHardness ? "Completed" : "Inprogress";

          await SiteLogService.updateSiteLog(editId, {
            tds: hasTds ? parseFloat(val.tds) : null,
            ph: hasPh ? parseFloat(val.ph) : null,
            hardness: hasHardness ? parseFloat(val.hardness) : null,
            mainRemarks: val.mainRemarks || null,
            meta_date: task.meta?.meta_date || null,
            shift_label: uiShiftToLabel(shift),
            attachment: val.attachment || null,
            signature: effectiveSignature || undefined,
            status,
            assignedTo: user?.name || user?.user_id || "unknown",
          });
        } else {
          const hasTemp = !!(val.temp && String(val.temp).trim().length > 0);
          const hasRh = !!(val.rh && String(val.rh).trim().length > 0);
          const status =
            hasTemp && hasRh ? "Completed" : hasTemp || hasRh ? "Inprogress" : "Open";

          await SiteLogService.updateSiteLog(editId, {
            temperature: hasTemp ? parseFloat(val.temp) : null,
            rh: hasRh ? parseFloat(val.rh) : null,
            mainRemarks: val.mainRemarks || null,
            meta_date: task.meta?.meta_date || null,
            shift_label: uiShiftToLabel(shift),
            attachment: val.attachment || null,
            signature: effectiveSignature || undefined,
            status,
            assignedTo: user?.name || user?.user_id || "unknown",
          });
        }

        // Edit-mode finish: mirror to log_activity_master + Fieldproxy
        // when the user submits a Completed entry. Skipped silently if the
        // backend can't resolve the row.
        const editVal = logValues[task.id] || {};
        const editIsCompleted =
          type === "Chemical"
            ? !!editVal.dosing
            : type === "Water"
              ? !!(
                  (editVal.tds && String(editVal.tds).trim()) ||
                  (editVal.ph && String(editVal.ph).trim()) ||
                  (editVal.hardness && String(editVal.hardness).trim())
                )
              : !!(
                  editVal.temp &&
                  String(editVal.temp).trim() &&
                  editVal.rh &&
                  String(editVal.rh).trim()
                );
        if (editIsCompleted && siteCode) {
          const finishIso = new Date().toISOString();
          // Do NOT pass startdatetime: the server keeps the existing start
          // (or derives one from enddatetime via lamTimestampHelper). Sending
          // finishIso here caused start==end / 0-duration rows when the
          // Start event never reached the server (flaky LAN, app restart).
          recordLogActivityEvent({
            action: "finish",
            site_id: siteCode,
            log_type: activityLogType,
            due_date: scheduledDate,
            shift_label: uiShiftToLabel(shift),
            executor_id: user?.name || null,
            enddatetime: finishIso,
          }).catch(() => {});
        }

        Alert.alert("Success", "Log updated successfully!", [
          { text: "OK", onPress: () => onBack() },
        ]);
        return;
      }

      const payload = tasks.map(task => {
        const val = logValues[task.id];
        if (!val) return null;
        
        // Skip if NO data entered for this specific item
        const hasData = type === "Chemical" ? val.dosing : (type === "Water" ? (val.tds || val.ph || val.hardness) : (val.temp || val.rh));
        if (!hasData) return null;

        
        return {
          id: task.id,
          site_code: siteCode,
          executor_id: user?.name || null,
          log_name: logName,
          task_name: task.name,
          scheduled_date: scheduledDate,
          status: "Completed", 
          signature: effectiveSignature,
          main_remarks: val.mainRemarks || null,
          meta_date: task.meta?.meta_date || null,
          shift_label: uiShiftToLabel(shift),
          // Specific fields
          ...(type === "Chemical" ? { chemical_dosing: val.dosing } : {}),
          ...(type === "Water" ? { tds: parseFloat(val.tds), ph: parseFloat(val.ph), hardness: parseFloat(val.hardness) } : {}),
          ...(type === "TempRH" ? { temperature: parseFloat(val.temp), rh: parseFloat(val.rh) } : {}),
          attachment: val.attachment
        };
      }).filter(Boolean);

      await SiteLogService.saveBulkSiteLogs(payload as any);

      // Safety net: the payload above is built from the in-memory task list,
      // which can miss a room that was auto-saved (status "Inprogress") but
      // dropped out of the pending list. Without this sweep that room stays
      // "Inprogress" forever despite having full readings. finalizeShiftLogs
      // re-scans local SQLite for the shift and finalizes any such straggler.
      const finalizeShiftMarker =
        shift === "A" ? "1/3" : shift === "B" ? "2/3" : shift === "C" ? "3/3" : null;
      await SiteLogService.finalizeShiftLogs({
        siteCode,
        logName,
        scheduledDate,
        shiftMarker: finalizeShiftMarker,
        signature: effectiveSignature,
      });

      // Mark each completed task as Finished in log_activity_master (DB + FP)
      // so the row's enddatetime + executor_id + status reflect the user's
      // submission. Best-effort — already-saved local + queue is the source
      // of truth for the field data; this just keeps activity master in sync.
      //
      // The backend re-counts the shift's rooms from site_logs before flipping
      // the activity row to Completed (a partial device cache can otherwise let
      // an operator sign off a shift that still has empty rooms). When it keeps
      // the row Inprogress it returns `shift_incomplete: { filled, total }`,
      // which we surface below so the operator knows the shift isn't done and
      // can pull-to-refresh the rooms their device is missing.
      let shiftIncomplete: { filled: number; total: number } | null = null;
      try {
        const finishShiftLabel = uiShiftToLabel(shift);
        const finishIso = new Date().toISOString();
        // startdatetime omitted: server preserves the row's existing start
        // (set on first keystroke via recordLogActivityStartOnce) or derives
        // one from enddatetime if missing. assigned_to omitted: server is
        // the source of truth from the auth token + COALESCE write-once
        // protection on assigned_to.
        const finishCalls = (payload as any[])
          .filter((p) => p && p.status === "Completed")
          .map((p) =>
            recordLogActivityEvent({
              action: "finish",
              site_id: p.site_code,
              log_type: activityLogType,
              due_date: p.scheduled_date,
              shift_label: finishShiftLabel,
              executor_id: p.executor_id,
              enddatetime: finishIso,
            }),
          );
        const finishResults = await Promise.allSettled(finishCalls);
        // All calls target the same shift row, so any incomplete verdict speaks
        // for the whole shift — take the first one reported.
        for (const r of finishResults) {
          const verdict =
            r.status === "fulfilled" ? r.value?.data?.shift_incomplete : null;
          if (verdict && typeof verdict.total === "number") {
            shiftIncomplete = verdict;
            break;
          }
        }
      } catch {
        // Silent — server cron will reconcile with FP next 1AM IST tick.
      }

      // Clear Draft
      const draftKey = `draft_${type.toLowerCase()}_${siteCode}_${user?.id}_${scheduledDate}${shift ? `_${shift}` : ""}`;
      await AsyncStorage.removeItem(draftKey);

      if (shiftIncomplete) {
        Alert.alert(
          "Saved — shift not yet complete",
          `Your entries were saved, but this shift still has empty rooms: only ${shiftIncomplete.filled} of ${shiftIncomplete.total} scheduled rooms are logged.\n\nThe missing rooms aren't loaded on this device. Pull down to refresh to load them, then log the rest to complete the shift.`,
          [{ text: "OK", onPress: () => loadTasks(true, true) }],
        );
      } else {
        Alert.alert("Success", "Logs submitted successfully!", [
          { text: "OK", onPress: () => loadTasks() },
        ]);
      }
    } catch {
      Alert.alert("Error", "Failed to save logs. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const CategoryIcon =
    type === "TempRH" ? Thermometer : type === "Water" ? Droplets : FlaskConical;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ds.pageBg }} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        {/* Header Section */}
        <View style={entryStyles.header}>
          <View style={entryStyles.headerRow}>
            <TouchableOpacity
              onPress={onBack}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              style={entryStyles.headerTile}
            >
              <ChevronLeft size={20} color={ds.onChrome} />
            </TouchableOpacity>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={entryStyles.headerTitle} numberOfLines={1}>
                {isEditMode ? `Edit ${screenTitle}` : screenTitle}
              </Text>
              <Text style={entryStyles.headerSub} numberOfLines={1}>
                {isEditMode
                  ? tasks[0]?.name || "Manual Entry"
                  : `${siteName || siteCode || ""}${
                      siteName || siteCode ? " · " : ""
                    }${headerDate}`}
              </Text>
            </View>
            <View style={entryStyles.headerTile}>
              <CategoryIcon size={17} color={ds.onChrome} />
            </View>
          </View>
        </View>

        {!isEditMode && (
          <View style={entryStyles.controls}>
            {/* Assignee */}
            <View style={entryStyles.card}>
              <View style={entryStyles.assigneeRow}>
                <View style={entryStyles.avatar}>
                  <Text style={entryStyles.avatarText}>{userInitials}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={entryStyles.eyebrow}>Assigned to</Text>
                  <View style={entryStyles.assigneeName}>
                    <Text style={entryStyles.assigneeText} numberOfLines={1}>
                      {user?.name || user?.user_id || "Unassigned"}
                    </Text>
                    {type === "TempRH" && shift ? (
                      <View style={entryStyles.shiftBadge}>
                        <Text style={entryStyles.shiftBadgeText}>
                          Shift {shift}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={entryStyles.whenRow}>
                  <Clock size={11} color={ds.carbon[600]} />
                  <Text style={entryStyles.whenText}>{headerDate}</Text>
                </View>
              </View>
            </View>

            {/* Date navigation + shift tabs */}
            <View style={entryStyles.card}>
              <DateNavBar
                date={new Date(scheduledDate)}
                onDateChange={(d: Date) => setScheduledDate(getISTDateString(d))}
                showPicker={showDatePicker}
                onShowPicker={setShowDatePicker}
                prevCount={prevCount}
                nextCount={nextCount}
              />

              {type === "TempRH" && (
                <View style={entryStyles.shiftTabs}>
                  <UnderlineTabs
                    tone={tabToneLight(ds)}
                    gap={18}
                    contentContainerStyle={{ paddingHorizontal: 0 }}
                    activeChip={shift ?? "A"}
                    onSelectChip={(k) => setShift(k)}
                    chips={["A", "B", "C"].map((s2) => ({
                      key: s2,
                      label: `Shift ${s2}`,
                      // Selected shift shows progress; the others show what's due.
                      count:
                        shift === s2
                          ? undefined
                          : (shiftPending[s2] ?? 0) || undefined,
                    }))}
                  />
                  <Text style={entryStyles.shiftMeta}>
                    {filledCount} of {tasks.length} filled
                  </Text>
                </View>
              )}
            </View>

            {/* Line items progress */}
            {tasks.length > 0 && (
              <View style={entryStyles.card}>
                <View style={entryStyles.progressHead}>
                  <View style={entryStyles.progressLabelRow}>
                    <ListChecks size={13} color={ds.carbon[600]} />
                    <Text style={entryStyles.progressLabel}>
                      Line items filled
                    </Text>
                  </View>
                  <Text style={entryStyles.progressCount}>
                    {filledCount} / {tasks.length}
                  </Text>
                </View>
                <View style={entryStyles.progressTrack}>
                  <View
                    style={[
                      entryStyles.progressFill,
                      {
                        width: `${
                          tasks.length
                            ? Math.round((filledCount / tasks.length) * 100)
                            : 0
                        }%`,
                      },
                    ]}
                  />
                </View>
              </View>
            )}
          </View>
        )}

        {/* Task List */}
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={ds.flame[100]} />
            <Text className="mt-4 text-slate-400 font-medium italic">Getting your to-do list...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredTasks}
            keyExtractor={item => item.id}
            renderItem={({ item, index }) => (
              <UnifiedLogItem
                item={item}
                type={type}
                value={logValues[item.id] || {}}
                onUpdateValue={updateValue}
                index={index + 1}
                total={filteredTasks.length}
              />
            )}
            contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={[ds.flame[100]]}
              />
            }
            ListEmptyComponent={
              !loading && (
                <View className="py-20 items-center justify-center">
                  <View className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center mb-4">
                    <CheckCircle2 size={36} color={ds.carbon[800]} />
                  </View>
                  <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg">
                    {editId ? "Log Not Found" : "All Caught Up!"}
                  </Text>
                  <Text className="text-slate-400 dark:text-slate-500 text-sm mt-1 text-center px-10">
                    {editId ? "The log you are trying to edit could not be found." : `No pending ${type.toLowerCase()} logs found for this ${shift ? "shift" : "day"}.`}
                  </Text>
                </View>
              )
            }
          />
        )}

        {/* Footer Action */}
        {!loading && (
          <View className="absolute bottom-0 left-0 right-0">
            {!isEditMode &&
              tasks.length > 0 &&
              !allScheduledTasksComplete && (
                <View style={entryStyles.notice}>
                  <Info size={12} color={ds.flame[100]} />
                  <Text style={entryStyles.noticeText}>
                    {remainingCount} line item
                    {remainingCount === 1 ? "" : "s"} still need readings to
                    complete this {type === "TempRH" && shift ? "shift" : "log"}
                  </Text>
                </View>
              )}
            <View style={entryStyles.footer}>
              <TouchableOpacity
                onPress={handleManualSave}
                activeOpacity={0.85}
                style={entryStyles.saveBtn}
              >
                <Save size={18} color={ds.carbon[400]} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleSubmit()}
                disabled={
                  isSubmitting || (!isEditMode && !allScheduledTasksComplete)
                }
                activeOpacity={0.9}
                style={[
                  entryStyles.cta,
                  {
                    backgroundColor:
                      isSubmitting || (!isEditMode && !allScheduledTasksComplete)
                        ? ds.carbon[900]
                        : ds.controlOn,
                  },
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={ds.onControl} />
                ) : (
                  <>
                    {!isEditMode && !allScheduledTasksComplete && (
                      <Lock size={13} color={ds.carbon[500]} />
                    )}
                    <Text
                      style={[
                        entryStyles.ctaText,
                        {
                          color:
                            !isEditMode && !allScheduledTasksComplete
                              ? ds.carbon[500]
                              : ds.onControl,
                        },
                      ]}
                    >
                      {isEditMode
                        ? "Update log"
                        : signature
                          ? "Submit logs"
                          : "Complete & sign"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
      <Modal
        visible={showSignature}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSignature(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <SignaturePad
            standalone={true}
            onOK={(sig: string) => {
              setSignature(sig);
              setShowSignature(false);
              handleSubmit(sig);
            }}
            onClear={() => setSignature(null)}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const useEntryStyles = makeThemedStyles((ds) => ({
  header: { backgroundColor: ds.thunder[100] },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTile: {
    width: 34,
    height: 34,
    borderRadius: soRadius.tile,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
    letterSpacing: 0.34,
    color: ds.onChrome,
  },
  headerSub: { fontSize: 11.5, color: ds.thunder[700], marginTop: 2 },

  controls: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  card: {
    backgroundColor: ds.white,
    borderRadius: soRadius.card,
    padding: 12,
    ...soShadow,
  },

  assigneeRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: soRadius.pill,
    backgroundColor: ds.sky[100],
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 12, fontWeight: "700", color: ds.onChrome },
  eyebrow: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[500],
  },
  assigneeName: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  assigneeText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "600",
    color: ds.carbon[100],
  },
  shiftBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: ds.flame[1000],
  },
  shiftBadgeText: {
    fontSize: 8.5,
    fontWeight: "600",
    letterSpacing: 0.68,
    textTransform: "uppercase",
    color: ds.flame[100],
  },
  whenRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  whenText: { fontSize: 10.5, color: ds.carbon[600] },

  shiftTabs: { marginTop: 10 },
  shiftMeta: {
    fontSize: 10.5,
    color: ds.carbon[600],
    marginTop: 8,
  },

  progressHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  progressLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  progressLabel: { fontSize: 11, color: ds.carbon[400] },
  progressCount: { fontSize: 12, fontWeight: "700", color: ds.flame[100] },
  progressTrack: {
    height: 4,
    borderRadius: soRadius.pill,
    backgroundColor: ds.carbon[1000],
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: soRadius.pill,
    backgroundColor: ds.sky[100],
  },

  notice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: soRadius.sm,
    backgroundColor: ds.flame[1000],
  },
  noticeText: { fontSize: 10.5, color: ds.flame[100] },

  footer: {
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    backgroundColor: ds.white,
    borderTopWidth: 1,
    borderTopColor: ds.carbon[900],
  },
  saveBtn: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: soRadius.sm,
    borderWidth: 1,
    borderColor: ds.carbon[900],
    backgroundColor: ds.white,
  },
  cta: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: soRadius.sm,
  },
  ctaText: { fontSize: 15, fontWeight: "600", letterSpacing: 0.15 },
}));
