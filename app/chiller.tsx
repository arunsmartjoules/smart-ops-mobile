import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { SiteLogService } from "@/services/SiteLogService";
import { formatAssignee, operatorLabel } from "@/utils/assignee";
import AssetService from "@/services/AssetService";
import AttendanceService from "@/services/AttendanceService";
import { useAuth } from "@/contexts/AuthContext";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import { LogImagePicker } from "@/components/sitelogs/LogImagePicker";
import { SignatureSheet } from "@/components/sitelogs/SignatureSheet";
import {
  BottomBar,
  CardTitle,
  EntryHeader,
  NumberField,
  OptionSheet,
  ReadOnlyEntry,
  ReadOnlyField,
  RemarksField,
  SelectField,
  type OptionItem,
} from "@/components/sitelogs/LogsKit";
import { Bx, type BxName } from "@/components/jo/Bx";
import {
  Card,
  JoPage,
  JoSheet,
  PrimaryButton,
  ProgressBar,
  Shimmer,
  f,
  useJoTheme,
} from "@/components/jo/ui";
import { db, chillerReadings } from "@/database";
import { eq } from "drizzle-orm";
import { addDays } from "date-fns";
import { formatIST, istDayStartMs, istDayEndMs } from "@/utils/istDate";
import { consumeRouteParams } from "@/utils/routeParams";

export default function ChillerEntry() {
  const { canEdit } = useAttendanceGate();
  if (!canEdit) return <ReadOnlyEntry what="chiller readings" />;
  return <ChillerEntryContent />;
}

/** Same shape the old SearchableSelect took — value / label / description. */
type SelectOption = OptionItem;

function ChillerEntryContent() {
  const t = useJoTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    id?: string;
    editId?: string;
    chillerId?: string;
    siteCode: string;
    isNew?: string;
    readingTime?: string;
  }>();
  // The site-logs screen passes siteCode through the imperative route-params
  // store (setRouteParams) rather than URL params, so reading useLocalSearchParams
  // alone leaves selectedSite empty. Consume the store once on mount and merge.
  const storeParamsRef = useRef(
    consumeRouteParams<{
      siteCode?: string;
      editId?: string;
      chillerId?: string;
    }>("/chiller"),
  );
  const initialSiteCode =
    (params.siteCode as string | undefined) ||
    storeParamsRef.current.siteCode ||
    "";

  const [formData, setFormData] = useState({
    chillerId: params.chillerId || storeParamsRef.current.chillerId || "",
    equipmentId: "",
    // Temperatures
    condenserInletTemp: "",
    condenserOutletTemp: "",
    evaporatorInletTemp: "",
    evaporatorOutletTemp: "",
    saturatedCondenserTemp: "",
    saturatedSuctionTemp: "",
    compressorSuctionTemp: "",
    motorTemperature: "",
    setPointCelsius: "",
    // Pressures
    dischargePressure: "",
    mainSuctionPressure: "",
    oilPressure: "",
    oilPressureDifference: "",
    condenserInletPressure: "",
    condenserOutletPressure: "",
    evaporatorInletPressure: "",
    evaporatorOutletPressure: "",
    // Performance
    load: "",
    inlineBtuMeter: "",
    // Meta
    remarks: "",
    attachment: "",
    signature: "",
  });
  const [selectedSite, setSelectedSite] = useState(initialSiteCode);
  const [sites, setSites] = useState<SelectOption[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);

  const [assets, setAssets] = useState<SelectOption[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  // Read-only operator label shown when editing an existing reading.
  const [assignedToDisplay, setAssignedToDisplay] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading] = useState(false);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  // Which picker sheet is open (replaces the old SearchableSelect modals).
  const [picker, setPicker] = useState<"site" | "chiller" | null>(null);
  const [dailyReadingCount, setDailyReadingCount] = useState(0);
  const [loadingDailyProgress, setLoadingDailyProgress] = useState(false);
  // User-controllable reading timestamp. Defaults to "now" so opening the
  // screen and immediately submitting works without the operator having to
  // touch this field. The backend derives the LAM `due_date` and the
  // server-side task mapping from this value (chillerReadingsController →
  // toYmd(reading_time)), so a mis-set time silently routes the reading to
  // the wrong LAM row.
  const [readingTime, setReadingTime] = useState<number>(() => {
    const fromParams = params.readingTime ? parseInt(params.readingTime) : NaN;
    return Number.isFinite(fromParams) ? fromParams : Date.now();
  });
  // iOS only — Android uses the imperative DateTimePickerAndroid API.
  const [iosPickerVisible, setIosPickerVisible] = useState(false);
  // Persist a user-edited reading_time to the existing row. Debounced so
  // rapid picker interactions don't spam the DB.
  const readingTimePersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formDataRef = useRef(formData);
  // Tracks the row id of the in-progress reading and the chiller it belongs
  // to. First save creates the row; subsequent auto-saves UPDATE the same row
  // instead of creating a new one. Cleared when the reading is Completed
  // or the user picks a different chiller (= a different reading entirely).
  // Storing chillerId alongside id prevents an in-flight create from claiming
  // the slot after the user switched chillers mid-session.
  const currentReadingRef = useRef<{ id: string; chillerId: string } | null>(
    null,
  );
  // Single-flight gate for handleSubmission. Without this, a slow create POST
  // would let the next debounced auto-save run before currentReadingRef was
  // populated, and both would call saveChillerReading() — producing a fresh
  // row per concurrent save. Serializing means later submissions await the
  // current one and see the populated ref, falling through to update.
  const inFlightSaveRef = useRef<Promise<void> | null>(null);
  // Set the moment a "Completed" submission begins. A debounced auto-save
  // timer scheduled by the last keystroke can otherwise fire AFTER completion
  // (which nulls currentReadingRef), fall into the create branch, and write a
  // duplicate "Inprogress" row — making the reading look un-logged.
  const completedRef = useRef(false);
  // Dedupe the "incomplete chiller log" alert within a single mount so the
  // focus/site effects don't re-fire it. Keyed by `${site}:${openRowId}`.
  const dupGuardKeyRef = useRef<string | null>(null);
  // Single-flight gate for the create-on-select row so React re-renders /
  // effect re-runs can't spawn a second row before the first create returns.
  const creatingRowRef = useRef(false);

  const isEditMode = !!(params.editId || params.id);
  const targetId = (params.editId || params.id || "") as string;

  // Mandatory technical fields. Comp. Suction, Motor Temp, Oil Pressure and
  // Oil Diff are intentionally NOT mandatory — operators may legitimately
  // skip them when a chiller doesn't expose those readings.
  const MANDATORY_FIELDS = [
    "condenserInletTemp",
    "condenserOutletTemp",
    "evaporatorInletTemp",
    "evaporatorOutletTemp",
    "saturatedCondenserTemp",
    "saturatedSuctionTemp",
    "setPointCelsius",
    "dischargePressure",
    "mainSuctionPressure",
    "condenserInletPressure",
    "condenserOutletPressure",
    "evaporatorInletPressure",
    "evaporatorOutletPressure",
    "load",
    "inlineBtuMeter",
  ] as const;

  const hasValue = (v: unknown) =>
    v !== null && v !== undefined && String(v).trim().length > 0;

  // Derived state to check if any technical field is filled (excluding IDs)
  const isAnyFieldFilled = Object.entries(formData).some(([key, value]) => {
    if (["chillerId", "equipmentId", "remarks", "attachment", "signature"].includes(key)) return false;
    return value !== "" && value !== null && value !== undefined;
  });

  const missingMandatoryFields = MANDATORY_FIELDS.filter(
    (f) => !hasValue((formData as any)[f]),
  );
  const allMandatoryFilled = missingMandatoryFields.length === 0;
  // Red borders should only appear after the user has touched the form (or is
  // editing an existing record) — a blank new-entry screen blanketed in red
  // is jarring.
  const showFieldErrors = isAnyFieldFilled || isEditMode;

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (readingTimePersistTimerRef.current)
        clearTimeout(readingTimePersistTimerRef.current);
    };
  }, []);

  // Persist a user-edited reading_time to the existing row. Skipped on the
  // very first mount-set (no existing row yet) and when no row has been
  // created — those cases get the latest value via ensureChillerRow /
  // handleSubmission. Debounced so opening/closing the picker repeatedly
  // doesn't spam writes.
  const readingTimeMountedRef = useRef(false);
  useEffect(() => {
    if (!readingTimeMountedRef.current) {
      readingTimeMountedRef.current = true;
      return;
    }
    const rowId = isEditMode ? targetId : currentReadingRef.current?.id;
    if (!rowId) return;
    if (completedRef.current) return;

    if (readingTimePersistTimerRef.current)
      clearTimeout(readingTimePersistTimerRef.current);
    readingTimePersistTimerRef.current = setTimeout(() => {
      // Fire-and-forget: SyncEngine retries from offline_queue on failure.
      SiteLogService.updateChillerReading(rowId, { readingTime }).catch(
        (e) => console.error("Failed to persist reading_time edit", e),
      );
    }, 500);
  }, [readingTime, isEditMode, targetId]);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  const chillerUserId = user?.user_id || user?.id;
  useEffect(() => {
    loadSites();
    // loadSites is recreated each render; re-run only when the user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chillerUserId]);

  useEffect(() => {
    loadAssets();
    // loadAssets is recreated each render; re-run only when the site changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSite]);

  const loadDailyProgress = useCallback(
    async (syncFromServer = false) => {
      if (isEditMode || !selectedSite) {
        setDailyReadingCount(0);
        return;
      }

      try {
        setLoadingDailyProgress(true);

        if (syncFromServer) {
          const fromDate = istDayStartMs(addDays(new Date(), -1));
          const toDate = istDayEndMs(addDays(new Date(), 1));
          await SiteLogService.pullChillerReadings(selectedSite, {
            fromDate,
            toDate,
          });
        }

        const count = await SiteLogService.getTodayChillerReadingCount(
          selectedSite,
        );
        setDailyReadingCount(count);
      } catch (e) {
        console.error("Failed to load chiller progress", e);
      } finally {
        setLoadingDailyProgress(false);
      }
    },
    [isEditMode, selectedSite],
  );

  // Block starting a NEW chiller log while an incomplete one exists for this
  // site today (any operator — devices are shared). The previous log must be
  // completed first; we offer a direct jump to its edit screen.
  const checkForOpenChillerLog = useCallback(async () => {
    if (isEditMode || !selectedSite) return;
    try {
      const open =
        await SiteLogService.findOpenChillerReadingForToday(selectedSite);
      if (!open) return;
      // The row this session is actively creating must not block itself.
      if (
        currentReadingRef.current?.id &&
        open.id === currentReadingRef.current.id
      ) {
        return;
      }
      const key = `${selectedSite}:${open.id}`;
      if (dupGuardKeyRef.current === key) return;
      dupGuardKeyRef.current = key;

      // assigned_to is the canonical operator NAME. executor_id is a code and
      // pull-sync injects the literal "system" when the server row has none —
      // neither is a name. Fall back to the current logged-in user (shared
      // devices: it's almost always them) before the generic "Someone".
      const SENTINELS = new Set([
        "",
        "system",
        "unknown",
        "null",
        "undefined",
      ]);
      const cleanName = (v?: string | null) => {
        const s = String(v ?? "").trim();
        return SENTINELS.has(s.toLowerCase()) ? "" : s;
      };
      const who =
        cleanName(open.assigned_to) ||
        cleanName(user?.full_name) ||
        cleanName(user?.name) ||
        cleanName(open.executor_id) ||
        "Someone";
      const ts = open.reading_time || open.created_at;
      const timeStr = ts
        ? formatIST(new Date(ts), {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "earlier today";

      Alert.alert(
        "Incomplete Chiller Log",
        `"${who}" has created a chiller log at ${timeStr} and left it without completing it. Please complete that and create a new chiller log.`,
        [
          {
            text: "Go Back",
            style: "cancel",
            onPress: () => router.back(),
          },
          {
            text: "Open Unfinished Log",
            onPress: () =>
              router.replace({
                pathname: "/chiller",
                params: { editId: open.id, mode: "edit" },
              }),
          },
        ],
        { cancelable: false },
      );
    } catch (e) {
      console.error("Open chiller log check failed", e);
    }
  }, [isEditMode, selectedSite, user?.full_name, user?.name]);

  useFocusEffect(
    useCallback(() => {
      checkForOpenChillerLog();
    }, [checkForOpenChillerLog]),
  );

  // Single-row model: selecting a chiller (new entry) immediately creates ONE
  // chiller_readings row — status=Inprogress, start time=now. Every later edit
  // UPDATES this same row (see handleSubmission). The reading is finished
  // later from the history screen via Complete & Sign. No per-keystroke
  // duplicate rows are ever created.
  const ensureChillerRow = useCallback(async () => {
    if (isEditMode) return;
    if (!selectedSite || !formData.chillerId) return;
    if (currentReadingRef.current?.id) return;
    if (completedRef.current || creatingRowRef.current) return;

    creatingRowRef.current = true;
    try {
      // If an open row already exists for this site+day, the duplicate guard
      // (checkForOpenChillerLog) owns it and redirects to edit — never create
      // a second row here.
      const existing =
        await SiteLogService.findOpenChillerReadingForToday(selectedSite);
      if (existing?.id) return;

      const selectedAsset = assets.find(
        (a) => a.value === formData.chillerId,
      );
      const assetName = selectedAsset?.label || formData.chillerId;
      const now = Date.now();
      const created = await SiteLogService.saveChillerReading({
        siteCode: selectedSite,
        chillerId: assetName,
        equipmentId: formData.chillerId,
        assetName,
        assetType: selectedAsset?.description || "Chiller",
        // Both columns get the same human-readable label (name ->
        // employee_code -> email local-part). Never the user's UUID — a UUID
        // in executor_id renders verbatim on the history screen.
        assignedTo: operatorLabel(user),
        executorId: operatorLabel(user),
        status: "Inprogress",
        readingTime,
        startDatetime: now,
      });
      if (created?.id) {
        currentReadingRef.current = {
          id: created.id,
          chillerId: formData.chillerId,
        };
      }
    } catch (e) {
      console.error("ensureChillerRow failed", e);
    } finally {
      creatingRowRef.current = false;
    }
    // operatorLabel(user) reads several user fields; the specific sub-properties used
    // are listed explicitly below rather than the whole `user` object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEditMode,
    selectedSite,
    formData.chillerId,
    assets,
    user?.full_name,
    user?.name,
    user?.employee_code,
    user?.user_id,
    user?.id,
    readingTime,
  ]);

  useEffect(() => {
    ensureChillerRow();
  }, [ensureChillerRow]);

  useEffect(() => {
    if (targetId) {
      loadReading();
    }
    // loadReading is recreated each render; re-run only when the target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  // useFocusEffect already fires on mount AND on every focus, so a separate
  // mount useEffect calling loadDailyProgress(true) just fired a second,
  // redundant pullChillerReadings network pull back-to-back on every open and
  // site change. Rely on the focus effect alone.
  useFocusEffect(
    useCallback(() => {
      loadDailyProgress(true);
    }, [loadDailyProgress]),
  );

  useEffect(() => {
    if (!assets.length || !formData.chillerId) return;

    const hasSelectedAsset = assets.some(
      (asset) => asset.value === formData.chillerId,
    );
    if (hasSelectedAsset) return;

    const matchedAsset =
      assets.find((asset) => asset.value === formData.equipmentId) ||
      assets.find(
        (asset) =>
          asset.label.trim().toLowerCase() ===
          formData.chillerId.trim().toLowerCase(),
      );

    if (!matchedAsset) return;

    // Keep currentReadingRef in sync with the remap. Without this, the
    // chillerId match check in handleSubmission fails for the rest of the
    // session — auto-saves silently skip and the Complete & Sign safety-net
    // creates a SECOND row, producing the empty-row + completed-row dupe.
    if (
      currentReadingRef.current &&
      currentReadingRef.current.chillerId === formData.chillerId
    ) {
      currentReadingRef.current = {
        ...currentReadingRef.current,
        chillerId: matchedAsset.value,
      };
    }

    setFormData((prev) => ({
      ...prev,
      chillerId: matchedAsset.value,
      equipmentId: matchedAsset.value,
    }));
  }, [assets, formData.chillerId, formData.equipmentId]);

  const ChillerFormSkeleton = () => (
    <View style={{ gap: 10, paddingTop: 4 }}>
      <Shimmer height={52} radius={18} />
      <Shimmer height={52} radius={18} />
      <Shimmer height={52} radius={18} />
      <Shimmer height={300} radius={26} />
      <Shimmer height={220} radius={26} />
    </View>
  );

  const loadReading = async () => {
    try {
      if (!targetId) return;
      setLoading(true);
      const rows = await db
        .select()
        .from(chillerReadings)
        .where(eq(chillerReadings.id, targetId));
      const record = rows[0];
        if (record) {
          setSelectedSite(record.site_code);
          // formatAssignee falls back to "—" when both fields are blank/sentinels.
          // For an Inprogress row created on a shared device, the operator is
          // almost always the currently logged-in user, so prefer their name
          // over the dash before giving up.
          const cleaned = formatAssignee(record.assigned_to, record.executor_id, "");
          setAssignedToDisplay(
            cleaned ||
              user?.full_name?.trim() ||
              user?.name?.trim() ||
              user?.employee_code ||
              "—",
          );
          // Preserve the original reading_time when editing — operators must
          // be able to correct values without silently shifting the LAM
          // mapping to "now". Fall back to created_at, then to the existing
          // state value, so we never reset to current time if the record
          // somehow lacks a timestamp.
          const recordReadingTime =
            (record as any).reading_time ?? (record as any).created_at;
          if (Number.isFinite(recordReadingTime)) {
            setReadingTime(Number(recordReadingTime));
          }
          setFormData({
            chillerId: record.equipment_id || record.chiller_id || "",
            equipmentId: record.equipment_id || "",
            condenserInletTemp: record.condenser_inlet_temp?.toString() || "",
          condenserOutletTemp: record.condenser_outlet_temp?.toString() || "",
          evaporatorInletTemp: record.evaporator_inlet_temp?.toString() || "",
          evaporatorOutletTemp: record.evaporator_outlet_temp?.toString() || "",
          saturatedCondenserTemp:
            record.saturated_condenser_temp?.toString() || "",
          saturatedSuctionTemp: record.saturated_suction_temp?.toString() || "",
          compressorSuctionTemp: record.compressor_suction_temp?.toString() || "",
          motorTemperature: record.motor_temperature?.toString() || "",
          setPointCelsius: record.set_point_celsius?.toString() || "",
          dischargePressure: record.discharge_pressure?.toString() || "",
          mainSuctionPressure: record.main_suction_pressure?.toString() || "",
          oilPressure: record.oil_pressure?.toString() || "",
          oilPressureDifference: record.oil_pressure_difference?.toString() || "",
          condenserInletPressure:
            record.condenser_inlet_pressure?.toString() || "",
          condenserOutletPressure:
            record.condenser_outlet_pressure?.toString() || "",
          evaporatorInletPressure:
            record.evaporator_inlet_pressure?.toString() || "",
          evaporatorOutletPressure:
            record.evaporator_outlet_pressure?.toString() || "",
          load: record.compressor_load_percentage?.toString() || "",
          inlineBtuMeter: record.inline_btu_meter?.toString() || "",
          remarks: record.remarks || "",
          attachment: record.attachments || "",
          signature: record.signature_text || "",
        });
      }
    } catch (e) {
      console.error("Failed to load reading", e);
    } finally {
      setLoading(false);
    }
  };

  const loadSites = async () => {
    const userId = user?.user_id || user?.id;
    if (!userId) return;
    try {
      setLoadingSites(true);
      const data = await AttendanceService.getUserSites(userId, "JouleCool");
      const options = data.map((s) => ({
        value: s.site_code,
        label: `${s.site_code} - ${s.name}`,
      }));
      setSites(options);
    } catch (e) {
      console.error("Failed to load sites", e);
    } finally {
      setLoadingSites(false);
    }
  };

  const loadAssets = async () => {
    if (!selectedSite) return;
    try {
      setLoadingAssets(true);
      const data = await AssetService.getAssetsBySite(selectedSite, "Chiller");
      const options = data.map((asset: any) => ({
        value: asset.asset_id,
        label: asset.asset_name || asset.asset_id,
        description: asset.location || asset.equipment_type,
      }));
      setAssets(options);
    } catch (e) {
      console.error("Failed to load assets", e);
    } finally {
      setLoadingAssets(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };

      // If the user picks a different chiller, drop the in-progress row pointer
      // so we create a new row for the new asset instead of overwriting the old.
      if (field === "chillerId" && prev.chillerId && value !== prev.chillerId) {
        currentReadingRef.current = null;
        // New asset = a fresh reading; allow auto-save again.
        completedRef.current = false;
      }

      // Auto-save logic (debounced)
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      
      // Auto-save only for actual reading/content fields, not selector changes.
      const autoSaveEligibleFields = new Set([
        "condenserInletTemp",
        "condenserOutletTemp",
        "evaporatorInletTemp",
        "evaporatorOutletTemp",
        "saturatedCondenserTemp",
        "saturatedSuctionTemp",
        "compressorSuctionTemp",
        "motorTemperature",
        "setPointCelsius",
        "dischargePressure",
        "mainSuctionPressure",
        "oilPressure",
        "oilPressureDifference",
        "condenserInletPressure",
        "condenserOutletPressure",
        "evaporatorInletPressure",
        "evaporatorOutletPressure",
        "load",
        "inlineBtuMeter",
        "remarks",
        "attachment",
      ]);

      // Debounced save = UPDATE the single row created on chiller-select.
      // It never creates a row and never changes status (handleSubmission
      // treats a non-"Completed" status as a value-only update).
      if (next.chillerId && autoSaveEligibleFields.has(field)) {
        autoSaveTimerRef.current = setTimeout(() => {
          if (completedRef.current) return;
          handleSubmission("Inprogress", undefined, next);
        }, 1500); // 1.5s delay for technical logs
      }
      
      return next;
    });
  };


  const handleSubmission = async (
    status: string,
    sig?: string,
    formDataSnapshot?: typeof formData,
  ) => {
    const currentFormData = formDataSnapshot || formDataRef.current;

    const isCompleting = status === "Completed";

    // Once the reading is (being) completed, drop any pending debounced
    // auto-save and reject further auto-saves. Without this, a timer armed by
    // the last keystroke fires after completion and creates a duplicate
    // "Inprogress" row, so the reading appears un-logged.
    if (isCompleting) {
      if (saving) return; // already completing — ignore a second tap
      completedRef.current = true;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    } else if (completedRef.current) {
      return;
    }

    if (!currentFormData.chillerId) {
      Alert.alert("Error", "Please select a Chiller asset");
      return;
    }

    const finalSignature = sig || currentFormData.signature;

    // Completion always requires a signature — including when an Inprogress
    // log is reopened from history/edit. Auto-saves ("Inprogress") are exempt.
    if (status === "Completed" && !finalSignature) {
      Alert.alert("Error", "Signature is required to complete the log");
      return;
    }

    // Show progress from the tap on: completion may first wait for an
    // in-flight auto-save, then for the network. Silence here is what
    // operators reported as "Complete does nothing".
    if (isCompleting) setSaving(true);

    // Serialize concurrent saves so currentReadingRef is observed AFTER any
    // in-flight create has populated it. Otherwise a second auto-save that
    // races the first create would also create, duplicating the row.
    while (inFlightSaveRef.current) {
      try {
        await inFlightSaveRef.current;
      } catch {
        // Previous save's error is its own to surface; we still proceed.
      }
    }

    const run = async () => {
      try {
        // Only show the user-facing saving spinner / disable the button for
        // an explicit completion. Auto-saves run silently every 1.5s; if they
        // flipped this state the Complete & Sign button would spin and refuse
        // taps on every keystroke, making operators think the reading was
        // already submitted.
        if (isCompleting) setSaving(true);
        const selectedAsset = assets.find((a) => a.value === currentFormData.chillerId);
        const assetName = selectedAsset?.label || currentFormData.chillerId;

        const basePayload = {
          siteCode: selectedSite,
          chillerId: assetName,
          equipmentId: currentFormData.chillerId,
          assetName: assetName,
          assetType: selectedAsset?.description || "Chiller",
          condenserInletTemp: parseFloat(currentFormData.condenserInletTemp),
          condenserOutletTemp: parseFloat(currentFormData.condenserOutletTemp),
          evaporatorInletTemp: parseFloat(currentFormData.evaporatorInletTemp),
          evaporatorOutletTemp: parseFloat(currentFormData.evaporatorOutletTemp),
          saturatedCondenserTemp: parseFloat(currentFormData.saturatedCondenserTemp),
          saturatedSuctionTemp: parseFloat(currentFormData.saturatedSuctionTemp),
          compressorSuctionTemp: parseFloat(currentFormData.compressorSuctionTemp),
          motorTemperature: parseFloat(currentFormData.motorTemperature),
          setPointCelsius: parseFloat(currentFormData.setPointCelsius),
          dischargePressure: parseFloat(currentFormData.dischargePressure),
          mainSuctionPressure: parseFloat(currentFormData.mainSuctionPressure),
          oilPressure: parseFloat(currentFormData.oilPressure),
          oilPressureDifference: parseFloat(currentFormData.oilPressureDifference),
          condenserInletPressure: parseFloat(currentFormData.condenserInletPressure),
          condenserOutletPressure: parseFloat(currentFormData.condenserOutletPressure),
          evaporatorInletPressure: parseFloat(currentFormData.evaporatorInletPressure),
          evaporatorOutletPressure: parseFloat(currentFormData.evaporatorOutletPressure),
          compressorLoadPercentage: parseFloat(currentFormData.load),
          inlineBtuMeter: parseFloat(currentFormData.inlineBtuMeter),
          remarks: currentFormData.remarks,
          // NOTE: assignedTo is intentionally NOT in basePayload. The row's
          // assigned_to is set ONCE at create time (ensureChillerRow / the
          // safety-net saveChillerReading below) and must never be overwritten
          // by edits. Otherwise a second operator opening someone else's log
          // to complete or correct it would silently steal authorship.
          signature: finalSignature,
          // NOTE: status & readingTime are intentionally NOT in basePayload.
          // Auto-save must never change status or move reading_time; those
          // are set once at create (ensureChillerRow) and on completion only.
          attachments: currentFormData.attachment,
        };

        // The single row to write to: the edited record, or the row
        // ensureChillerRow created this session for THIS chiller.
        const sessionId =
          !isEditMode &&
          currentReadingRef.current?.chillerId === currentFormData.chillerId
            ? currentReadingRef.current.id
            : undefined;
        const targetId = isEditMode
          ? ((params.editId || params.id) as string)
          : sessionId;

        if (targetId) {
          // Value-only update. Status flips to Completed ONLY on explicit
          // Complete & Sign; auto-save ("Inprogress") preserves it.
          await SiteLogService.updateChillerReading(targetId, {
            ...basePayload,
            ...(isCompleting
              ? { status: "Completed", endDatetime: Date.now() }
              : {}),
          });
        } else if (isCompleting) {
          // Safety net: the create-on-select row is missing (ensure failed /
          // was offline at select). Create it now, completed, so a finished
          // reading is never lost. This is the ONLY create path left here —
          // and the only place we set assigned_to from the current user.
          const now = Date.now();
          const created = await SiteLogService.saveChillerReading({
            ...basePayload,
            assignedTo: operatorLabel(user),
            executorId: operatorLabel(user),
            status: "Completed",
            readingTime,
            startDatetime: now,
            endDatetime: now,
          });
          if (created?.id) {
            currentReadingRef.current = {
              id: created.id,
              chillerId: currentFormData.chillerId,
            };
          }
        } else {
          // Auto-save fired before the create-on-select row exists — skip.
          // ensureChillerRow owns creation; the next auto-save / completion
          // will persist these values to that single row.
          return;
        }

        if (status === "Completed") {
          // Reading session is done — next save (e.g. for another shift or
          // chiller) should start a fresh row.
          currentReadingRef.current = null;
          // Refreshing the day's count pulls from the server; don't hold the
          // "completed" confirmation on the network for it.
          void loadDailyProgress(true);
        }

        setSignatureModalVisible(false);
        if (status === "Completed") {
          Alert.alert("Success", "Reading completed successfully", [
            { text: "OK", onPress: () => router.back() },
          ]);
        }
      } catch (error: any) {
        // Don't surface silent auto-save failures as redboxes — they retry
        // from the offline queue. Only the explicit completion deserves
        // user-visible error reporting.
        if (isCompleting) {
          Alert.alert("Error", error.message || "Failed to save reading");
        }
      } finally {
        if (isCompleting) setSaving(false);
      }
    };

    const promise = run();
    inFlightSaveRef.current = promise;
    try {
      await promise;
    } finally {
      if (inFlightSaveRef.current === promise) {
        inFlightSaveRef.current = null;
      }
    }
  };

  const renderInput = (
    label: string,
    field: string,
    placeholder: string,
    unit?: string,
    required = false,
  ) => {
    const filled = hasValue((formData as any)[field]);
    const showError = required && !filled && showFieldErrors;
    return (
      <View key={field} style={{ width: "48.5%" }}>
        <NumberField
          label={label}
          required={required}
          value={(formData as any)[field]}
          onChangeText={(val) => updateField(field, val)}
          placeholder={placeholder}
          unit={unit}
          size="sm"
          error={showError}
        />
      </View>
    );
  };

  /** One reading group card: tinted icon + title, then a 2-up grid. */
  const renderSection = (
    title: string,
    icon: BxName,
    tone: "bad" | "info" | "ok",
    inputs: [label: string, field: string, placeholder: string, unit: string, required?: boolean][],
  ) => (
    <Card style={{ padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: t[`${tone}Tint` as const],
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Bx name={icon} size={17} color={t[tone]} />
        </View>
        <CardTitle style={{ flex: 1 }}>{title}</CardTitle>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, marginTop: 14 }}>
        {inputs.map(([label, field, placeholder, unit, required]) =>
          renderInput(label, field, placeholder, unit, !!required),
        )}
      </View>
    </Card>
  );

  // Open the platform-native date+time picker. Android chains the two
  // dialogs imperatively (matches IncidentDetailModal); iOS shows a single
  // inline datetime picker via the iosPickerVisible modal. Future readings
  // are blocked — a reading "in the future" would silently route to the
  // wrong LAM row.
  const openReadingTimePicker = () => {
    if (Platform.OS === "android") {
      const base = new Date(readingTime);
      const now = new Date();
      DateTimePickerAndroid.open({
        value: base,
        mode: "date",
        is24Hour: true,
        maximumDate: now,
        onChange: (_evt, d1) => {
          if (!d1) return;
          DateTimePickerAndroid.open({
            value: d1,
            mode: "time",
            is24Hour: true,
            onChange: (_evt2, d2) => {
              if (!d2) return;
              const merged = new Date(d1);
              merged.setHours(d2.getHours(), d2.getMinutes(), 0, 0);
              if (merged.getTime() > Date.now()) {
                Alert.alert(
                  "Invalid time",
                  "Reading time cannot be in the future.",
                );
                return;
              }
              setReadingTime(merged.getTime());
            },
          });
        },
      });
      return;
    }
    setIosPickerVisible(true);
  };

  const progressSegments = [0, 1, 2].map((index) => {
    const segmentCount = Math.min(Math.max(dailyReadingCount - index * 4, 0), 4);
    return segmentCount / 4;
  });
  const progressDisplayCount = `${dailyReadingCount}/12`;

  const siteLabel = sites.find((o) => o.value === selectedSite)?.label || selectedSite;
  const chillerLabel =
    assets.find((o) => o.value === formData.chillerId)?.label || formData.chillerId;
  const canComplete = !!formData.chillerId && allMandatoryFilled;

  return (
    <JoPage glow={false}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <EntryHeader
          title={isEditMode ? "Edit Chiller Reading" : "Chiller Reading"}
          sub={
            isEditMode
              ? `ID: ${targetId.slice(-8).toUpperCase()}`
              : `Chiller ID: ${formData.chillerId || params.chillerId || "—"}`
          }
          onBack={() => router.back()}
        />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 150, gap: 10 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <ChillerFormSkeleton />
          ) : (
            <>
              {!isEditMode && (
                <Card style={{ padding: 16, gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={[f.t(12.5, 500), { color: t.ink3 }]}>Today&apos;s progress</Text>
                    <Text style={[f.d(16, -0.02, 1.2), { color: t.ink }]}>
                      {loadingDailyProgress ? "Updating…" : progressDisplayCount}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {progressSegments.map((progress, index) => (
                      <ProgressBar
                        key={`progress-${index}`}
                        pct={progress * 100}
                        color={t.ok}
                        height={6}
                        style={{ flex: 1 }}
                      />
                    ))}
                  </View>
                </Card>
              )}

              <Card style={{ padding: 16, gap: 14 }}>
                <SelectField
                  label="Site"
                  icon="bx-buildings"
                  value={siteLabel}
                  placeholder="Select Site"
                  loading={loadingSites}
                  // Site is fixed for existing records.
                  disabled={isEditMode}
                  onPress={() => setPicker("site")}
                />
                <SelectField
                  label="Chiller ID"
                  required
                  icon="bx-cloud-snow"
                  value={chillerLabel}
                  placeholder="Select Chiller"
                  loading={loadingAssets}
                  onPress={() => setPicker("chiller")}
                />
                {/* Reading date & time — defaults to "now". Drives the LAM
                    due_date and task mapping on the server. */}
                <SelectField
                  label="Reading date & time"
                  required
                  icon="bx-calendar"
                  value={formatIST(new Date(readingTime), {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                  meta={formatIST(new Date(readingTime), {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })}
                  placeholder="Pick date & time"
                  onPress={() => openReadingTimePicker()}
                />
                {isEditMode && (
                  <ReadOnlyField label="Assigned to" value={assignedToDisplay || "—"} icon="bx-user" />
                )}
              </Card>

              {renderSection("Temperatures (°C)", "bxs-thermometer", "bad", [
                ["Cond. Inlet", "condenserInletTemp", "0.0", "°C", true],
                ["Cond. Outlet", "condenserOutletTemp", "0.0", "°C", true],
                ["Evap. Inlet", "evaporatorInletTemp", "0.0", "°C", true],
                ["Evap. Outlet", "evaporatorOutletTemp", "0.0", "°C", true],
                ["Sat. Cond.", "saturatedCondenserTemp", "0.0", "°C", true],
                ["Sat. Suction", "saturatedSuctionTemp", "0.0", "°C", true],
                ["Comp. Suction", "compressorSuctionTemp", "0.0", "°C"],
                ["Motor Temp", "motorTemperature", "0.0", "°C"],
                ["Set Point", "setPointCelsius", "0.0", "°C", true],
              ])}

              {renderSection("Pressures (PSI)", "bx-tachometer", "info", [
                ["Discharge", "dischargePressure", "0.0", "PSI", true],
                ["Main Suction", "mainSuctionPressure", "0.0", "PSI", true],
                ["Oil Pressure", "oilPressure", "0.0", "PSI"],
                ["Oil Diff.", "oilPressureDifference", "0.0", "PSI"],
                ["Cond. Inlet P.", "condenserInletPressure", "0.0", "PSI", true],
                ["Cond. Outlet P.", "condenserOutletPressure", "0.0", "PSI", true],
                ["Evap. Inlet P.", "evaporatorInletPressure", "0.0", "PSI", true],
                ["Evap. Outlet P.", "evaporatorOutletPressure", "0.0", "PSI", true],
              ])}

              {renderSection("Performance & Load", "bx-line-chart", "ok", [
                ["Comp. Load", "load", "0", "%", true],
                ["BTU Meter", "inlineBtuMeter", "0.0", "TR", true],
              ])}

              {/* Attachments & Remarks */}
              <Card style={{ padding: 16 }}>
                <CardTitle>Attachment</CardTitle>
                <View style={{ marginTop: 10 }}>
                  <LogImagePicker
                    value={formData.attachment}
                    onImageChange={(url) => updateField("attachment", url || "")}
                    uploadPath={`chiller/${selectedSite}`}
                    cta="Add photo of chiller panel"
                    disabled={uploading}
                  />
                </View>
                <CardTitle style={{ marginTop: 18 }}>Remarks</CardTitle>
                <RemarksField
                  value={formData.remarks}
                  onChangeText={(val) => updateField("remarks", val)}
                  placeholder="Any technical observations..."
                  multiline
                  style={{ marginTop: 10 }}
                />
              </Card>
            </>
          )}
        </ScrollView>

        {/* Complete & sign — autosave covers everything before it */}
        <BottomBar>
          {!loading && formData.chillerId && !allMandatoryFilled && showFieldErrors ? (
            <Text style={[f.t(12), { color: t.bad, textAlign: "center" }]}>
              {missingMandatoryFields.length} required reading
              {missingMandatoryFields.length === 1 ? "" : "s"} still empty
            </Text>
          ) : null}
          <PrimaryButton
            label="Complete & sign"
            icon={canComplete ? "bx-check" : "bx-lock-alt"}
            onPress={() => setSignatureModalVisible(true)}
            busy={saving}
            disabled={!canComplete}
          />
        </BottomBar>
      </KeyboardAvoidingView>

      {/* Site / chiller pickers */}
      <OptionSheet
        visible={picker === "site"}
        title="Site"
        subtitle="Chiller readings are logged per site"
        options={sites}
        value={selectedSite}
        loading={loadingSites}
        searchPlaceholder="Search sites"
        onClose={() => setPicker(null)}
        onPick={(val) => {
          setSelectedSite(val);
          updateField("chillerId", ""); // Clear selection when site changes
        }}
      />
      <OptionSheet
        visible={picker === "chiller"}
        title="Chiller"
        subtitle={siteLabel || undefined}
        options={assets}
        value={formData.chillerId}
        loading={loadingAssets}
        emptyText={selectedSite ? "No chillers mapped to this site." : "Pick a site first."}
        searchPlaceholder="Search chillers"
        onClose={() => setPicker(null)}
        onPick={(val) => updateField("chillerId", val)}
      />

      {/* iOS reading-time picker. Android uses the imperative API above. */}
      <JoSheet
        visible={iosPickerVisible && Platform.OS === "ios"}
        onClose={() => setIosPickerVisible(false)}
        title="Reading date & time"
        right={
          <TouchableOpacity
            onPress={() => setIosPickerVisible(false)}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={[f.t(14, 600), { color: t.accentInk }]}>Done</Text>
          </TouchableOpacity>
        }
      >
        <View style={{ marginTop: 12, borderRadius: 20, backgroundColor: t.sheetField, overflow: "hidden" }}>
          <DateTimePicker
            value={new Date(readingTime)}
            mode="datetime"
            display="spinner"
            themeVariant={t.isDark ? "dark" : "light"}
            maximumDate={new Date()}
            onChange={(_, selected) => {
              if (!selected) return;
              if (selected.getTime() > Date.now()) {
                Alert.alert(
                  "Invalid time",
                  "Reading time cannot be in the future.",
                );
                return;
              }
              setReadingTime(selected.getTime());
            }}
          />
        </View>
      </JoSheet>

      {/* Sign to complete — 2-tap flow */}
      <SignatureSheet
        visible={signatureModalVisible}
        title="Sign to complete"
        description={chillerLabel ? `Chiller reading · ${chillerLabel}` : "Chiller reading"}
        okText="Complete reading"
        busy={saving}
        onClose={() => setSignatureModalVisible(false)}
        onOK={(sig: string) => handleSubmission("Completed", sig)}
      />
    </JoPage>
  );
}
