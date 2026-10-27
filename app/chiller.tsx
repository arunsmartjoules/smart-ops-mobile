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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SiteLogService, submitChillerReading } from "@/services/SiteLogService";
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
import syncEngine from "@/services/SyncEngine";

/** Stamp the first-entry time once (kept out of the component body for the compiler). */
function markStarted(ref: { current: number | null }): void {
  if (ref.current === null) ref.current = Date.now();
}

/** "" → null; otherwise the number typed (a real 0 stays 0). */
const toNumber = (v: string): number | null =>
  v === undefined || v === null || String(v).trim() === "" ? null : parseFloat(v);

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
  const formDataRef = useRef(formData);
  // Dedupe the "incomplete chiller log" alert within a single mount so the
  // focus/site effects don't re-fire it. Keyed by `${site}:${openRowId}`.
  const dupGuardKeyRef = useRef<string | null>(null);
  // When the operator entered the first value — becomes the reading's start
  // time. Nothing is sent to the server before Complete & sign.
  const startedAtRef = useRef<number | null>(null);

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
  // No background data pulls while a reading is being entered: they write to
  // SQLite on the JS thread and could leave Complete & sign unresponsive.
  useEffect(() => syncEngine.holdPulls("chiller-entry"), []);

  // ── Draft ────────────────────────────────────────────────────────────────
  // The reading lives only on this phone until Complete & sign, like a ticket
  // being edited. The draft survives the app closing; it is cleared once the
  // reading is submitted.
  const chillerUserId = user?.user_id || user?.id;
  const draftKey = isEditMode
    ? `draft_chiller_edit_${targetId}`
    : selectedSite
      ? `draft_chiller_${selectedSite}_${chillerUserId ?? ""}`
      : null;
  const draftRestoredRef = useRef<string | null>(null);

  // New reading: restore an unfinished draft for this site once.
  useEffect(() => {
    if (isEditMode || !draftKey || draftRestoredRef.current === draftKey) return;
    draftRestoredRef.current = draftKey;
    AsyncStorage.getItem(draftKey)
      .then((raw) => {
        if (!raw) return;
        const draft = JSON.parse(raw);
        // Opened for a specific chiller: only that chiller's draft applies.
        const wanted = formDataRef.current.chillerId;
        if (wanted && draft?.formData?.chillerId && draft.formData.chillerId !== wanted) return;
        if (draft?.formData) setFormData((prev) => ({ ...prev, ...draft.formData }));
        if (Number.isFinite(draft?.readingTime)) setReadingTime(draft.readingTime);
        if (Number.isFinite(draft?.startedAt)) startedAtRef.current = draft.startedAt;
      })
      .catch(() => {});
  }, [draftKey, isEditMode]);

  useEffect(() => {
    if (!draftKey || !formData.chillerId) return;
    const timer = setTimeout(() => {
      AsyncStorage.setItem(
        draftKey,
        JSON.stringify({ formData, readingTime, startedAt: startedAtRef.current }),
      ).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [draftKey, formData, readingTime]);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

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
        // Unsaved edits from an earlier session on this phone win.
        const raw = await AsyncStorage.getItem(`draft_chiller_edit_${targetId}`).catch(() => null);
        if (raw) {
          try {
            const draft = JSON.parse(raw);
            if (draft?.formData) setFormData((prev) => ({ ...prev, ...draft.formData }));
            if (Number.isFinite(draft?.readingTime)) setReadingTime(draft.readingTime);
          } catch {}
        }
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
    if (field !== "chillerId" && String(value ?? "").trim().length > 0) {
      markStarted(startedAtRef);
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Complete & sign — the tickets model: one save, one result.
  const handleComplete = async (sig: string) => {
    if (saving) return;
    const f = formDataRef.current;
    if (!f.chillerId) {
      Alert.alert("Error", "Please select a Chiller asset");
      return;
    }
    const signature = sig || f.signature;
    if (!signature) {
      Alert.alert("Error", "Signature is required to complete the log");
      return;
    }

    setSaving(true);
    try {
      const selectedAsset = assets.find((a) => a.value === f.chillerId);
      const assetName = selectedAsset?.label || f.chillerId;
      const outcome = await submitChillerReading({
        existingId: isEditMode ? targetId : null,
        siteCode: selectedSite,
        chillerId: assetName,
        equipmentId: f.chillerId,
        assetName,
        assetType: selectedAsset?.description || "Chiller",
        operator: operatorLabel(user),
        readingTime,
        startedAt: startedAtRef.current,
        values: {
          condenser_inlet_temp: toNumber(f.condenserInletTemp),
          condenser_outlet_temp: toNumber(f.condenserOutletTemp),
          evaporator_inlet_temp: toNumber(f.evaporatorInletTemp),
          evaporator_outlet_temp: toNumber(f.evaporatorOutletTemp),
          saturated_condenser_temp: toNumber(f.saturatedCondenserTemp),
          saturated_suction_temp: toNumber(f.saturatedSuctionTemp),
          compressor_suction_temp: toNumber(f.compressorSuctionTemp),
          motor_temperature: toNumber(f.motorTemperature),
          set_point_celsius: toNumber(f.setPointCelsius),
          discharge_pressure: toNumber(f.dischargePressure),
          main_suction_pressure: toNumber(f.mainSuctionPressure),
          oil_pressure: toNumber(f.oilPressure),
          oil_pressure_difference: toNumber(f.oilPressureDifference),
          condenser_inlet_pressure: toNumber(f.condenserInletPressure),
          condenser_outlet_pressure: toNumber(f.condenserOutletPressure),
          evaporator_inlet_pressure: toNumber(f.evaporatorInletPressure),
          evaporator_outlet_pressure: toNumber(f.evaporatorOutletPressure),
          compressor_load_percentage: toNumber(f.load),
          inline_btu_meter: toNumber(f.inlineBtuMeter),
        },
        remarks: f.remarks || null,
        attachment: f.attachment || null,
        signature,
      });

      if (outcome.state === "rejected") {
        Alert.alert(
          "Couldn't upload",
          `${outcome.message}\n\nThe reading is saved on this phone and will be retried automatically. If this keeps happening, please contact support.`,
        );
        return;
      }

      // The phone's copy and the queued upload now hold everything.
      if (draftKey) await AsyncStorage.removeItem(draftKey).catch(() => {});
      startedAtRef.current = null;

      Alert.alert(
        outcome.state === "queued" ? "Saved on this phone" : "Success",
        outcome.state === "queued"
          ? "The connection is weak right now, so the reading will upload automatically as soon as it's back. You don't need to submit again."
          : "Reading completed successfully",
        [{ text: "OK", onPress: () => router.back() }],
        { cancelable: false },
      );
    } catch (error: any) {
      // Only a failure to save on the phone itself lands here.
      Alert.alert("Error", error?.message || "Failed to save reading");
    } finally {
      setSaving(false);
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
        onClose={() => setSignatureModalVisible(false)}
        onOK={(sig) => {
          // Close first: the sheet only collects the signature, the save
          // shows its progress on the Complete & sign button.
          setSignatureModalVisible(false);
          void handleComplete(sig);
        }}
      />
    </JoPage>
  );
}
