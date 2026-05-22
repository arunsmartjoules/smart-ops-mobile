import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft,
  Snowflake,
  Info,
  Camera,
  Trash2,
  Thermometer,
  Activity,
  Gauge,
  PenTool,
  CheckCircle2,
} from "lucide-react-native";
import { SiteLogService } from "@/services/SiteLogService";
import { formatAssignee, operatorLabel } from "@/utils/assignee";
import AssetService from "@/services/AssetService";
import AttendanceService from "@/services/AttendanceService";
import { useAuth } from "@/contexts/AuthContext";
import { StorageService } from "@/services/StorageService";
import { LogImagePicker } from "@/components/sitelogs/LogImagePicker";
import SearchableSelect, { SelectOption } from "@/components/SearchableSelect";
import SignaturePad from "@/components/SignaturePad";
import { LinearGradient } from "expo-linear-gradient";
import { db, chillerReadings } from "@/database";
import { eq } from "drizzle-orm";
import Skeleton from "@/components/Skeleton";
import { addDays } from "date-fns";
import { formatIST, istDayStartMs, istDayEndMs } from "@/utils/istDate";
import { consumeRouteParams } from "@/utils/routeParams";

export default function ChillerEntry() {
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
  const [uploading, setUploading] = useState(false);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  const [dailyReadingCount, setDailyReadingCount] = useState(0);
  const [loadingDailyProgress, setLoadingDailyProgress] = useState(false);
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

  // Derived state to check if any technical field is filled (excluding IDs)
  const isAnyFieldFilled = Object.entries(formData).some(([key, value]) => {
    if (["chillerId", "equipmentId", "remarks", "attachment", "signature"].includes(key)) return false;
    return value !== "" && value !== null && value !== undefined;
  });

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    loadSites();
  }, [user?.user_id || user?.id]);

  useEffect(() => {
    loadAssets();
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
            text: "Open Pending Log",
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
        readingTime: params.readingTime ? parseInt(params.readingTime) : now,
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
    params.readingTime,
  ]);

  useEffect(() => {
    ensureChillerRow();
  }, [ensureChillerRow]);

  useEffect(() => {
    if (targetId) {
      loadReading();
    }
  }, [targetId]);

  useEffect(() => {
    loadDailyProgress(true);
  }, [loadDailyProgress]);

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
    <View className="py-6">
      <View className="mb-6">
        <Skeleton width={120} height={10} style={{ marginBottom: 8 }} />
        <Skeleton width="100%" height={50} borderRadius={12} />
      </View>

      <View className="flex-row items-center mb-6">
        <Skeleton width={20} height={20} borderRadius={10} />
        <Skeleton width={150} height={15} style={{ marginLeft: 10 }} />
      </View>

      <View className="flex-row flex-wrap justify-between">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <View key={i} className="mb-6" style={{ width: "48%" }}>
            <Skeleton width={80} height={10} style={{ marginBottom: 8 }} />
            <Skeleton width="100%" height={45} borderRadius={12} />
          </View>
        ))}
      </View>

      <View className="flex-row items-center mt-4 mb-6">
        <Skeleton width={20} height={20} borderRadius={10} />
        <Skeleton width={150} height={15} style={{ marginLeft: 10 }} />
      </View>

      <View className="flex-row flex-wrap justify-between">
        {[1, 2, 3, 4].map((i) => (
          <View key={i} className="mb-6" style={{ width: "48%" }}>
            <Skeleton width={80} height={10} style={{ marginBottom: 8 }} />
            <Skeleton width="100%" height={45} borderRadius={12} />
          </View>
        ))}
      </View>
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
        setSaving(true);
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
            readingTime: params.readingTime
              ? parseInt(params.readingTime)
              : now,
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
          await loadDailyProgress(true);
        }

        setSignatureModalVisible(false);
        if (status === "Completed") {
          Alert.alert("Success", "Reading completed successfully", [
            { text: "OK", onPress: () => router.back() },
          ]);
        }
      } catch (error: any) {
        Alert.alert("Error", error.message || "Failed to save reading");
      } finally {
        setSaving(false);
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
    widthClass = "w-full",
  ) => (
    <View className={`mb-4 ${widthClass}`}>
      <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1.5 ml-1">
        {label}
      </Text>
      <View
        className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 px-3 flex-row items-center"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.03,
          shadowRadius: 2,
          elevation: 1,
        }}
      >
        <TextInput
          value={(formData as any)[field]}
          onChangeText={(val) => updateField(field, val)}
          placeholder={placeholder}
          keyboardType="numeric"
          className="flex-1 py-3 font-semibold text-base text-slate-900 dark:text-slate-50"
        />
        {unit && (
          <Text className="text-slate-400 text-xs font-bold ml-1">{unit}</Text>
        )}
      </View>
    </View>
  );

  const progressSegments = [0, 1, 2].map((index) => {
    const segmentCount = Math.min(Math.max(dailyReadingCount - index * 4, 0), 4);
    return segmentCount / 4;
  });
  const progressDisplayCount = `${dailyReadingCount}/12`;

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" edges={["top"]}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 items-center justify-center"
          >
            <ChevronLeft size={20} color="#0f172a" />
          </TouchableOpacity>
          <View className="flex-1 items-center">
            <Text className="text-lg font-bold text-slate-900 dark:text-slate-50 text-center">
              {isEditMode ? "Edit Chiller Reading" : "Chiller Reading"}
            </Text>
            <Text className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-0.5">
              {isEditMode
                ? `ID: ${targetId.slice(-8).toUpperCase()}`
                : `Chiller ID: ${formData.chillerId || params.chillerId}`}
            </Text>
          </View>
          <View className="w-10" />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: 120,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {loading ? (
              <ChillerFormSkeleton />
            ) : (
              <View className="py-6">
                {!isEditMode && (
                  <View className="mb-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-4 py-3">
                    <View className="flex-row items-center justify-between mb-2">
                      <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">
                        Today Progress
                      </Text>
                      <Text className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                        {loadingDailyProgress ? "Updating..." : progressDisplayCount}
                      </Text>
                    </View>
                    <View className="flex-row gap-2">
                      {progressSegments.map((progress, index) => (
                        <View
                          key={`progress-${index}`}
                          className="flex-1 h-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"
                        >
                          <View
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${progress * 100}%` }}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                <SearchableSelect
                  label="Site"
                  options={sites}
                  value={selectedSite}
                  onChange={(val) => {
                    setSelectedSite(val);
                    updateField("chillerId", ""); // Clear selection when site changes
                  }}
                  loading={loadingSites}
                  placeholder="Select Site"
                  disabled={isEditMode} // Disable site change for existing records
                />

                <SearchableSelect
                  label="Chiller ID *"
                  options={assets}
                  value={formData.chillerId}
                  onChange={(val) => updateField("chillerId", val)}
                  loading={loadingAssets}
                  placeholder="Select Chiller"
                />

                {isEditMode && (
                  <View className="mb-2">
                    <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1.5 ml-1">
                      Assigned To
                    </Text>
                    <View className="bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-3.5">
                      <Text className="font-semibold text-base text-slate-500 dark:text-slate-400">
                        {assignedToDisplay || "—"}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Temperatures Section */}
                <View className="flex-row items-center mt-4 mb-4">
                  <Thermometer size={18} color="#ef4444" strokeWidth={2.5} />
                  <Text className="text-slate-900 dark:text-slate-50 font-bold text-base ml-2">
                    Temperatures (°C)
                  </Text>
                </View>
                <View className="flex-row flex-wrap justify-between">
                  {renderInput(
                    "Cond. Inlet",
                    "condenserInletTemp",
                    "0.0",
                    "°C",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Cond. Outlet",
                    "condenserOutletTemp",
                    "0.0",
                    "°C",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Evap. Inlet",
                    "evaporatorInletTemp",
                    "0.0",
                    "°C",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Evap. Outlet",
                    "evaporatorOutletTemp",
                    "0.0",
                    "°C",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Sat. Cond.",
                    "saturatedCondenserTemp",
                    "0.0",
                    "°C",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Sat. Suction",
                    "saturatedSuctionTemp",
                    "0.0",
                    "°C",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Comp. Suction",
                    "compressorSuctionTemp",
                    "0.0",
                    "°C",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Motor Temp",
                    "motorTemperature",
                    "0.0",
                    "°C",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Set Point",
                    "setPointCelsius",
                    "0.0",
                    "°C",
                    "w-[48%]",
                  )}
                </View>

                {/* Pressures Section */}
                <View className="flex-row items-center mt-4 mb-4">
                  <Gauge size={18} color="#3b82f6" strokeWidth={2.5} />
                  <Text className="text-slate-900 dark:text-slate-50 font-bold text-base ml-2">
                    Pressures (PSI)
                  </Text>
                </View>
                <View className="flex-row flex-wrap justify-between">
                  {renderInput(
                    "Discharge",
                    "dischargePressure",
                    "0.0",
                    "PSI",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Main Suction",
                    "mainSuctionPressure",
                    "0.0",
                    "PSI",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Oil Pressure",
                    "oilPressure",
                    "0.0",
                    "PSI",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Oil Diff.",
                    "oilPressureDifference",
                    "0.0",
                    "PSI",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Cond. Inlet P.",
                    "condenserInletPressure",
                    "0.0",
                    "PSI",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Cond. Outlet P.",
                    "condenserOutletPressure",
                    "0.0",
                    "PSI",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Evap. Inlet P.",
                    "evaporatorInletPressure",
                    "0.0",
                    "PSI",
                    "w-[48%]",
                  )}
                  {renderInput(
                    "Evap. Outlet P.",
                    "evaporatorOutletPressure",
                    "0.0",
                    "PSI",
                    "w-[48%]",
                  )}
                </View>

                {/* Performance Section */}
                <View className="flex-row items-center mt-4 mb-4">
                  <Activity size={18} color="#10b981" strokeWidth={2.5} />
                  <Text className="text-slate-900 dark:text-slate-50 font-bold text-base ml-2">
                    Performance & Load
                  </Text>
                </View>
                <View className="flex-row flex-wrap justify-between">
                  {renderInput("Comp. Load", "load", "0", "%", "w-[48%]")}
                  {renderInput(
                    "BTU Meter",
                    "inlineBtuMeter",
                    "0.0",
                    "TR",
                    "w-[48%]",
                  )}
                </View>

                {/* Attachments & Remarks */}
                <View className="mt-4 mb-6">
                  <Text className="text-slate-900 dark:text-slate-50 font-bold text-base mb-4">
                    Evidence & Observation
                  </Text>

                  <LogImagePicker
                    value={formData.attachment}
                    onImageChange={(url) => updateField("attachment", url || "")}
                    uploadPath={`chiller/${selectedSite}`}
                    disabled={uploading}
                  />

                  <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1.5 ml-1">
                    Remarks
                  </Text>
                  <TextInput
                    value={formData.remarks}
                    onChangeText={(val) => updateField("remarks", val)}
                    placeholder="Any technical observations..."
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 font-medium text-slate-900 dark:text-slate-50 min-h-[100px]"
                  />
                </View>

                {/* Removed Inline Signature Pad and integrated into 2-click modal flow */}
              </View>
            )}
          </ScrollView>

          {/* Action Buttons - Fixed at Bottom */}
          <View
            className="px-5 py-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex-row gap-4"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 10,
            }}
          >
            {/* Removed manual Save button as autosave is implemented */}
            
            <TouchableOpacity
              onPress={() => setSignatureModalVisible(true)}
              disabled={
                saving ||
                !formData.chillerId ||
                (!isEditMode && !isAnyFieldFilled)
              }
              activeOpacity={0.8}
              className="flex-1 rounded-xl overflow-hidden"
              style={{
                opacity:
                  !formData.chillerId || (!isEditMode && !isAnyFieldFilled)
                    ? 0.6
                    : 1,
              }}
            >
              <LinearGradient
                colors={["#0d9488", "#0f766e"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View className="py-4 flex-row items-center justify-center">
                {saving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <CheckCircle2
                      size={20}
                      color="white"
                      style={{ marginRight: 8 }}
                    />
                    <Text className="text-white font-bold text-base uppercase tracking-wider">
                      Complete & Sign
                    </Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Signature Modal for 2-Click Streamlined Flow */}
      <Modal
        visible={signatureModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSignatureModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white dark:bg-slate-900 rounded-t-3xl h-[60%] overflow-hidden">
            <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg">
                Sign to Complete Reading
              </Text>
              <TouchableOpacity onPress={() => setSignatureModalVisible(false)}>
                <Text className="text-purple-600 font-bold">Close</Text>
              </TouchableOpacity>
            </View>
            <SignaturePad
              standalone
              okText="Complete Reading"
              onOK={(sig: string) => handleSubmission("Completed", sig)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
