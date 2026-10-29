import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Alert,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { getSelectedSiteCode, setSelectedSiteCode } from "@/services/SiteSelection";
// No expo-router hooks here on purpose — they throw "Couldn't find a
// navigation context" during route teardown. Params arrive as props from the
// route wrapper, which reads them from the routeParams store (no hooks).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/contexts/AuthContext";
import { SiteConfigService, TaskItem } from "@/services/SiteConfigService";
import {
  SiteLogService,
  submitSiteLogs,
  type SiteLogSubmitRow,
} from "@/services/SiteLogService";
import syncEngine from "@/services/SyncEngine";
import logger from "@/utils/logger";
import { describeLogLock, isTempRhRoomDone } from "./completionGate";
import { uiShiftToLabel } from "@/services/LogActivityMasterService";
import { UnifiedLogItem } from "./UnifiedLogItem";
import { DateNavBar } from "./DateNavBar";
import { getISTDateString } from "@/services/AttendanceService";
import { formatISTDate } from "@/utils/istDate";
import { db } from "@/database";
import { Bx } from "@/components/jo/Bx";
import {
  Avatar,
  Card,
  Chip,
  EmptyState,
  IconButton,
  JoPage,
  PrimaryButton,
  ProgressBar,
  Shimmer,
  StatusPill,
  f,
  useJoTheme,
} from "@/components/jo/ui";
import { BottomBar, EntryHeader, FormHeading } from "./LogsKit";
import { SignatureSheet } from "./SignatureSheet";

/** "" / undefined → null; otherwise the number typed. */
const toNumber = (v: unknown): number | null =>
  v === undefined || v === null || String(v).trim() === "" ? null : parseFloat(String(v));

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
  const t = useJoTheme();
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
  // When the operator entered the first value — sent with the submit as the
  // log's start time (nothing reaches the server before Complete & sign).
  const startedAtRef = useRef<number | null>(null);

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
  // No background data pulls while a log is being entered: they write to
  // SQLite on the JS thread and could leave Complete & sign unresponsive.
  useEffect(() => syncEngine.holdPulls(`log-entry:${type}`), [type]);

  useEffect(() => {
    const loadSites = async () => {
      try {
        const userSites = await db.query.userSites.findMany();
        if (!siteCode && userSites.length > 0) {
          const lastSite = await getSelectedSiteCode(user?.user_id || user?.id);
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
      void setSelectedSiteCode(user?.user_id || user?.id, siteCode);
    }
  }, [siteCode, user?.user_id, user?.id]);

  // Where this screen's draft lives: one per log/shift/day, or per edited row.
  const draftKey = !siteCode
    ? null
    : editId
      ? `draft_${type.toLowerCase()}_edit_${editId}`
      : `draft_${type.toLowerCase()}_${siteCode}_${user?.id}_${scheduledDate}${shift ? `_${shift}` : ""}`;

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
            initialValues[task.id] = { dosing: log.chemical_dosing || "No", attachment: log.attachment || "", mainRemarks: log.main_remarks || "" };
          } else if (type === "Water") {
            initialValues[task.id] = { tds: log.tds?.toString() || "", ph: log.ph?.toString() || "", hardness: log.hardness?.toString() || "", attachment: log.attachment || "", mainRemarks: log.main_remarks || "" };
          } else {
            initialValues[task.id] = { temp: log.temperature?.toString() || "", rh: log.rh?.toString() || "", noAccess: log.no_access === true, attachment: log.attachment || "", mainRemarks: log.main_remarks || "" };
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
            // Chemical is a single checkbox: unticked means "not dosed", so an
            // untouched row is a "No" answer rather than a missing one.
            initialValues[task.id] = { dosing: task.meta?.chemical_dosing || "No", attachment: task.meta?.attachment || "", mainRemarks: task.meta?.main_remarks || "" };
          } else if (type === "Water") {
            initialValues[task.id] = { tds: task.meta?.tds?.toString() || "", ph: task.meta?.ph?.toString() || "", hardness: task.meta?.hardness?.toString() || "", attachment: task.meta?.attachment || "", mainRemarks: task.meta?.main_remarks || "" };
          } else {
            initialValues[task.id] = { temp: task.meta?.temperature?.toString() || "", rh: task.meta?.rh?.toString() || "", noAccess: task.meta?.no_access === true, attachment: task.meta?.attachment || "", mainRemarks: task.meta?.main_remarks || "" };
          }
        });

      }

      // The draft holds everything typed since the last submit — it is the
      // only copy of in-progress values (they are not sent until submit).
      startedAtRef.current = null;
      if (draftKey) {
        const savedDraft = await AsyncStorage.getItem(draftKey);
        if (savedDraft) {
          try {
            const { values, signature: sig, startedAt } = JSON.parse(savedDraft);
            if (values) {
              Object.keys(values).forEach(k => {
                if (initialValues[k]) initialValues[k] = { ...initialValues[k], ...values[k] };
              });
            }
            if (sig) setSignature(sig);
            if (typeof startedAt === "number") startedAtRef.current = startedAt;
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

  // Draft (debounced). Typing only ever updates this phone-local draft —
  // nothing is sent to the server until Complete & sign (see handleSubmit).
  // Debounced so the whole form isn't re-serialized on every keystroke.
  const writeDraft = useCallback(() => {
    if (!draftKey) return Promise.resolve();
    return AsyncStorage.setItem(
      draftKey,
      JSON.stringify({ values: logValues, signature, startedAt: startedAtRef.current }),
    ).catch(() => {});
  }, [draftKey, logValues, signature]);

  useEffect(() => {
    if (!draftKey || Object.keys(logValues).length === 0) return;
    const timer = setTimeout(() => void writeDraft(), 400);
    return () => clearTimeout(timer);
  }, [draftKey, logValues, writeDraft]);

  const updateValue = (taskId: string, field: string, val: string) => {
    if (startedAtRef.current === null && val && String(val).trim().length > 0) {
      startedAtRef.current = Date.now();
    }
    setLogValues((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {}),
        [field]: val,
      },
    }));
  };

  // "No access" (Temp RH): the room couldn't be entered, so its readings stop
  // being required. Any values already typed stay in the draft, so unticking
  // brings them back; they are not sent while the box is ticked (buildRow).
  const toggleNoAccess = (taskId: string, noAccess: boolean) => {
    if (noAccess && startedAtRef.current === null) startedAtRef.current = Date.now();
    setLogValues((prev) => ({
      ...prev,
      [taskId]: { ...(prev[taskId] || {}), noAccess },
    }));
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
      return isTempRhRoomDone(value);
    },
    [logValues, type],
  );

  const allScheduledTasksComplete =
    tasks.length > 0 && tasks.every((task) => isTaskComplete(task.id));

  const filledCount = useMemo(
    () => tasks.filter((t) => isTaskComplete(t.id)).length,
    [tasks, isTaskComplete],
  );
  const noAccessCount = useMemo(
    () => (type === "TempRH" ? tasks.filter((t) => logValues[t.id]?.noAccess === true).length : 0),
    [tasks, logValues, type],
  );

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

  const headerDate = useMemo(() => {
    try {
      return formatISTDate(new Date(scheduledDate));
    } catch {
      return scheduledDate;
    }
  }, [scheduledDate]);

  // "Save progress now": write the draft immediately.
  const handleManualSave = useCallback(() => {
    void writeDraft().then(() =>
      Alert.alert("Saved on this phone", "Your entries are kept on this phone until you complete & sign."),
    );
  }, [writeDraft]);

  /** One submitted row from the screen's values. */
  const buildRow = (task: TaskItem, status: SiteLogSubmitRow["status"]): SiteLogSubmitRow => {
    const val = logValues[task.id] || {};
    return {
      id: task.id,
      status,
      main_remarks: val.mainRemarks || null,
      attachment: val.attachment || null,
      meta_date: task.meta?.meta_date || null,
      shift_label: uiShiftToLabel(shift),
      ...(type === "Chemical" ? { chemical_dosing: val.dosing || null } : {}),
      ...(type === "Water"
        ? { tds: toNumber(val.tds), ph: toNumber(val.ph), hardness: toNumber(val.hardness) }
        : {}),
      // A no-access room sends no readings (any typed value stays only in the
      // draft) and always states the flag, so unticking clears it server-side.
      ...(type === "TempRH"
        ? {
            temperature: val.noAccess === true ? null : toNumber(val.temp),
            rh: val.noAccess === true ? null : toNumber(val.rh),
            no_access: val.noAccess === true,
          }
        : {}),
    };
  };

  /** Edit mode keeps today's rule: a partly filled row stays Inprogress/Open. */
  const editStatus = (val: Record<string, any>): SiteLogSubmitRow["status"] => {
    const has = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";
    if (type === "Chemical") return val.dosing ? "Completed" : "Inprogress";
    if (type === "Water") return has(val.tds) || has(val.ph) || has(val.hardness) ? "Completed" : "Inprogress";
    if (val.noAccess === true || (has(val.temp) && has(val.rh))) return "Completed";
    return has(val.temp) || has(val.rh) ? "Inprogress" : "Open";
  };

  // Submission — the tickets model: one save, one result.
  const handleSubmit = async (signatureOverride?: string) => {
    if (!siteCode) return;
    const effectiveSignature = signatureOverride || signature;

    if (!isEditMode && tasks.length === 0) {
      Alert.alert("No Data", "No scheduled logs are available for this selection.");
      return;
    }

    if (!isEditMode && !allScheduledTasksComplete) {
      Alert.alert(
        "Incomplete Logs",
        type === "TempRH"
          ? "Each card must have both Temp and RH values, or be marked No access, before completing."
          : type === "Water"
            ? "Each card must have at least one Water measurement before completing."
            : "Each card must have a Chemical Dosing selection before completing.",
      );
      return;
    }

    const entriesWithData = Object.values(logValues).filter(v => {
      if (type === "Chemical") return v.dosing;
      if (type === "Water") return v.tds || v.ph || v.hardness;
      return v.temp || v.rh || v.noAccess;
    });

    if (entriesWithData.length === 0) {
      Alert.alert("No Data", "Please enter measurements, or mark No access, for at least one area.");
      return;
    }

    if (!effectiveSignature && !isEditMode) {
      setShowSignature(true);
      return;
    }
    setIsSubmitting(true);
    try {
      let rows: SiteLogSubmitRow[];
      if (isEditMode && editId && tasks[0]) {
        rows = [buildRow(tasks[0], editStatus(logValues[tasks[0].id] || {}))];
      } else {
        rows = tasks.map((task) => buildRow(task, "Completed"));
        // Rooms filled earlier that dropped out of this list (see
        // findShiftStragglers) are completed in the same submit.
        const shiftMarker =
          shift === "A" ? "1/3" : shift === "B" ? "2/3" : shift === "C" ? "3/3" : null;
        const listed = new Set(rows.map((r) => r.id));
        const stragglers = await SiteLogService.findShiftStragglers({
          siteCode,
          logName,
          scheduledDate,
          shiftMarker,
        });
        for (const r of stragglers) {
          if (listed.has(r.id)) continue;
          rows.push({
            id: r.id,
            status: "Completed",
            temperature: r.temperature,
            rh: r.rh,
            tds: r.tds,
            ph: r.ph,
            hardness: r.hardness,
            chemical_dosing: r.chemical_dosing,
            main_remarks: r.main_remarks,
            attachment: r.attachment,
            meta_date: r.meta_date,
            shift_label: r.shift_label,
          });
        }
      }
      const outcome = await submitSiteLogs({
        siteCode,
        activityLogType,
        scheduledDate,
        shiftLabel: uiShiftToLabel(shift),
        startedAt: startedAtRef.current,
        signature: effectiveSignature || null,
        rows,
      });
      if (outcome.state === "rejected") {
        Alert.alert(
          "Couldn't upload",
          `${outcome.message}\n\nYour entries are saved on this phone and will be retried automatically. If this keeps happening, please contact support.`,
        );
        return;
      }

      // The phone's copy and the queued upload now hold everything.
      if (draftKey) await AsyncStorage.removeItem(draftKey).catch(() => {});

      if (outcome.state === "queued") {
        Alert.alert(
          "Saved on this phone",
          "The connection is weak right now, so your logs will upload automatically as soon as it's back. You don't need to submit again.",
          [{ text: "OK", onPress: () => onBack() }],
          { cancelable: false },
        );
        return;
      }

      if (outcome.shiftIncomplete) {
        const { filled, total } = outcome.shiftIncomplete;
        Alert.alert(
          "Saved — shift not yet complete",
          `Your entries were saved, but this shift still has empty rooms: only ${filled} of ${total} scheduled rooms are logged.\n\nThe missing rooms aren't loaded on this device. Open this log again and pull down to refresh to load them, then log the rest to complete the shift.`,
          [{ text: "OK", onPress: () => onBack() }],
        );
        return;
      }

      Alert.alert(
        "Success",
        isEditMode ? "Log updated successfully!" : "Logs submitted successfully!",
        [{ text: "OK", onPress: () => onBack() }],
        { cancelable: false },
      );
    } catch (error: any) {
      // Only a failure to save on the phone itself lands here. Report it:
      // until now these dialogs left no trace anywhere we could see.
      logger.activity("LOG_SUBMIT_FAILED", "SITE_LOG", `${type} completion failed on the phone`, {
        site_code: siteCode,
        log_type: type,
        edit_mode: isEditMode,
        error: error?.message ?? String(error),
      });
      Alert.alert("Error", error?.message || "Failed to save logs. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const locked = !isEditMode && !allScheduledTasksComplete;

  // Every tap answers: a reason when the log isn't ready, otherwise submit.
  // Each tap is also reported, so a "button does nothing" report can be
  // checked against what the phone actually saw.
  const onCompletePress = () => {
    const reason = locked
      ? describeLogLock({ type, loading, total: tasks.length, filled: filledCount })
      : null;
    logger.activity("COMPLETE_TAP", "SITE_LOG", `Complete & sign tapped (${type})`, {
      site_code: siteCode,
      log_type: type,
      edit_mode: isEditMode,
      rooms: tasks.length,
      filled: filledCount,
      loading,
      blocked: reason,
    });
    if (reason) {
      Alert.alert("Not ready to complete", reason);
      return;
    }
    void handleSubmit();
  };
  const heading =
    type === "Chemical"
      ? "Tick each point that was dosed"
      : type === "Water"
        ? "Record water readings"
        : "Record temperature & RH";
  const headerSub = isEditMode
    ? tasks[0]?.name || "Manual Entry"
    : `${siteName || siteCode || ""}${siteName || siteCode ? " · " : ""}${headerDate}`;
  const operator = user?.name || user?.user_id || "Unassigned";

  const listHeader = (
    <View style={{ gap: 10, marginBottom: 10 }}>
      {!isEditMode ? <FormHeading style={{ marginBottom: 4 }}>{heading}</FormHeading> : null}
      {!isEditMode && (
        <>
          {/* Assignee */}
          <Card style={{ padding: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar name={operator} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[f.t(11.5), { color: t.muted }]}>Assigned to</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <Text style={[f.t(14.5, 600), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
                    {operator}
                  </Text>
                  {type === "TempRH" && shift ? <StatusPill label={`Shift ${shift}`} tone="info" /> : null}
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Bx name="bx-time-five" size={14} color={t.muted} />
                <Text style={[f.t(11.5), { color: t.muted }]}>{headerDate}</Text>
              </View>
            </View>
          </Card>

          {/* Date navigation + shift chips */}
          <Card style={{ padding: 14, gap: 12 }}>
            <DateNavBar
              date={new Date(scheduledDate)}
              onDateChange={(d: Date) => setScheduledDate(getISTDateString(d))}
              showPicker={showDatePicker}
              onShowPicker={setShowDatePicker}
              prevCount={prevCount}
              nextCount={nextCount}
            />
            {type === "TempRH" && (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {(["A", "B", "C"] as const).map((s2) => (
                    <Chip
                      key={s2}
                      label={`Shift ${s2}`}
                      selected={(shift ?? "A") === s2}
                      // Selected shift shows progress; the others show what's due.
                      count={shift === s2 ? undefined : (shiftPending[s2] ?? 0) || undefined}
                      onPress={() => setShift(s2)}
                    />
                  ))}
                </View>
                <Text style={[f.t(11.5), { color: t.muted, paddingHorizontal: 4 }]}>
                  {filledCount} of {tasks.length} filled
                  {noAccessCount > 0 ? ` · ${noAccessCount} no access` : ""}
                </Text>
              </View>
            )}
          </Card>

          {/* Line items progress */}
          {tasks.length > 0 && (
            <Card style={{ padding: 14, gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Bx name="bx-list-check" size={16} color={t.muted} />
                  <Text style={[f.t(12.5, 500), { color: t.ink3 }]}>Line items filled</Text>
                </View>
                <Text style={[f.d(16, -0.02, 1.2), { color: allScheduledTasksComplete ? t.ok : t.accentInk }]}>
                  {filledCount} / {tasks.length}
                </Text>
              </View>
              <ProgressBar
                pct={tasks.length ? (filledCount / tasks.length) * 100 : 0}
                color={t.ok}
                height={6}
              />
            </Card>
          )}
        </>
      )}
    </View>
  );

  return (
    <JoPage glow={false}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <EntryHeader
          title={isEditMode ? `Edit ${screenTitle}` : screenTitle}
          sub={headerSub}
          onBack={onBack}
          right={
            !loading ? (
              <IconButton icon="bx-save" iconSize={20} label="Save progress now" onPress={handleManualSave} />
            ) : null
          }
        />

        {/* Task List */}
        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 4, gap: 10 }}>
            <Shimmer height={30} radius={10} style={{ width: "70%" }} />
            <Shimmer height={72} radius={26} />
            <Shimmer height={type === "TempRH" ? 120 : 72} radius={26} />
            <Shimmer height={220} radius={26} />
            <Text style={[f.t(12.5), { color: t.muted, textAlign: "center", marginTop: 6 }]}>
              Getting your to-do list…
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredTasks}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <UnifiedLogItem
                item={item}
                type={type}
                value={logValues[item.id] || {}}
                onUpdateValue={updateValue}
                onToggleNoAccess={type === "TempRH" ? toggleNoAccess : undefined}
                index={index + 1}
                total={filteredTasks.length}
              />
            )}
            ListHeaderComponent={listHeader}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 150 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={t.muted}
                colors={[t.accent]}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon={editId ? "bx-error-circle" : "bx-check-circle"}
                title={editId ? "Log not found" : "All caught up!"}
                sub={
                  editId
                    ? "The log you are trying to edit could not be found."
                    : `No open ${type.toLowerCase()} logs found for this ${shift ? "shift" : "day"}.`
                }
              />
            }
          />
        )}

        {/* Footer Action */}
        {!loading && (
          <BottomBar>
            <PrimaryButton
              label={isEditMode ? "Update log" : signature ? "Submit logs" : "Complete & sign"}
              icon={locked ? "bx-lock-alt" : "bx-check"}
              onPress={onCompletePress}
              busy={isSubmitting}
            />
          </BottomBar>
        )}
      </KeyboardAvoidingView>

      <SignatureSheet
        visible={showSignature}
        title="Sign to complete"
        description={`Confirms ${filledCount} of ${tasks.length} line item${tasks.length === 1 ? "" : "s"}${
          noAccessCount > 0 ? `, ${noAccessCount} marked no access` : ""
        }`}
        okText="Save signature"
        onClose={() => setShowSignature(false)}
        onOK={(sig) => {
          setSignature(sig);
          setShowSignature(false);
          void handleSubmit(sig);
        }}
        onClear={() => setSignature(null)}
      />
    </JoPage>
  );
};
