import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import EmptyState from "@/components/EmptyState";
import * as Haptics from "expo-haptics";
import PressableScale from "@/components/PressableScale";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import * as ImagePicker from "expo-image-picker";
import { ChevronDown, Filter, MapPin, Plus, RefreshCw, Camera, Image as ImageIcon, X, Clock, AlertTriangle, UserCircle } from "lucide-react-native";
import { useLocalSearchParams } from "expo-router";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useAuth } from "@/contexts/AuthContext";
import { useSites } from "@/hooks/useSites";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useAutoSync } from "@/hooks/useAutoSync";
import AdvancedFilterModal from "@/components/AdvancedFilterModal";
import TicketSkeleton from "@/components/TicketSkeleton";
import IncidentStats from "@/components/IncidentStats";
import IncidentTopFilters from "@/components/IncidentTopFilters";
import IncidentDetailModal from "@/components/IncidentDetailModal";
import { IncidentsService } from "@/services/IncidentsService";
import { db, incidents as incidentsTable } from "@/database";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { StorageService } from "@/services/StorageService";
import FullscreenPicker from "@/components/FullscreenPicker";
import { type SelectOption } from "@/components/SearchableSelect";
import { TicketsService } from "@/services/TicketsService";
import { getStatusVisual, getInitials } from "@/utils/ticketVisuals";
import {
  istTodayString,
  istParts,
  istDayStartMsFromYmd,
  formatISTDate,
  formatIST,
} from "@/utils/istDate";
import {
  FAULT_TYPE_OPTIONS,
  OPERATING_CONDITION_OPTIONS,
  SEVERITY_OPTIONS,
} from "@/constants/incidentFormOptions";
import { v4 as uuidv4 } from "uuid";

type IncidentStatus = "Open" | "Inprogress" | "Resolved";

/** Normalize incidents.attachments from API (array) or local cache (JSON string). */
function parseIncidentAttachments(raw: unknown): string[] {
  if (raw == null) return [];
  let arr: unknown[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      arr = Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  } else {
    return [];
  }
  const out: string[] = [];
  for (const item of arr) {
    if (typeof item === "string" && item) out.push(item);
    else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (typeof o.uri === "string" && o.uri) out.push(o.uri);
      else if (typeof o.url === "string" && o.url) out.push(o.url);
      else if (typeof o.downloadUrl === "string" && o.downloadUrl) out.push(o.downloadUrl);
      else if (typeof o.file_url === "string" && o.file_url) out.push(o.file_url);
      else if (typeof o.path === "string" && o.path) out.push(o.path);
    }
  }
  return out;
}

const getFileExtension = (uri: string) => {
  const noQuery = uri.split("?")[0] || "";
  const maybeExt = noQuery.split(".").pop() || "";
  return maybeExt.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";
};

function parseAssignedTo(raw: unknown): { firstValue: string; display: string } {
  const list: string[] = [];
  const pushValue = (v: unknown) => {
    if (typeof v === "string" && v.trim()) {
      list.push(v.trim());
      return;
    }
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const label =
        (typeof o.user_name === "string" && o.user_name) ||
        (typeof o.name === "string" && o.name) ||
        (typeof o.user_id === "string" && o.user_id) ||
        (typeof o.id === "string" && o.id) ||
        "";
      if (label) list.push(label);
    }
  };

  if (Array.isArray(raw)) {
    raw.forEach(pushValue);
  } else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) parsed.forEach(pushValue);
      else pushValue(parsed);
    } catch {
      pushValue(raw);
    }
  } else {
    pushValue(raw);
  }

  return { firstValue: list[0] || "", display: list.join(", ") };
}

interface IncidentItem {
  id: string;
  incident_id: string;
  site_code: string;
  asset_location?: string | null;
  fault_symptom: string;
  status: IncidentStatus;
  rca_status: "Open" | "RCA Under Review" | "RCA Submitted";
  remarks?: string | null;
  incident_created_time?: string | number | null;
  assigned_to?: string[] | string | null;
  attachments?: unknown;
  rca_attachments?: unknown;
  incident_updated_time?: string | number | null;
  incident_resolved_time?: string | number | null;
  assigned_by?: string | null;
  rca_checker?: string | null;
  rca_maker?: string | null;
}

interface IncidentCreateForm {
  site_code: string;
  asset_location: string;
  fault_symptom: string;
  fault_type: string;
  severity: "Critical" | "Moderate" | "Low";
  operating_condition: string;
  immediate_action_taken: string;
  attachments: string[];
  incident_created_time: Date;
  assigned_to: string;
  status: "Open" | "Inprogress";
  incident_updated_time: Date | null;
  // Stable idempotency key for this form's incident, reused on every submit /
  // offline replay so retries collapse into one incident server-side.
  client_request_id: string;
}

export default function IncidentsTab() {
  const isDark = useColorScheme() === "dark";
  const { user } = useAuth();
  const { canEdit } = useAttendanceGate();
  const { isConnected } = useNetworkStatus();
  const { sites, selectedSite, selectSite, loading: sitesLoading, refresh: refreshSites } = useSites(
    user?.user_id || user?.id,
  );
  const params = useLocalSearchParams<{
    status?: string | string[];
    incidentId?: string | string[];
    siteCode?: string | string[];
  }>();
  const selectedSiteCode = selectedSite?.site_code || "";
  const siteName = selectedSite?.site_name || selectedSite?.site_code || "Select Site";
  const roleAllowsRca = ["admin", "manager"].includes(String(user?.role || "").toLowerCase());
  const canEditRca = roleAllowsRca && canEdit;
  const canEditMeta = canEditRca;

  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [isSwitchingFilters, setIsSwitchingFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Safety net: never let the skeleton outlive a slow/stalled fetch.
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 6000);
    return () => clearTimeout(t);
  }, []);
  const initialStatus =
    (Array.isArray(params.status) ? params.status[0] : params.status) === "Inprogress"
      ? "Inprogress"
      : "Open";
  // Default range = 1st of the current IST month → today (IST).
  const defaultToDate = useMemo(() => istTodayString(), []);
  const defaultFromDate = useMemo(() => {
    const { year, month } = istParts(new Date());
    return `${year}-${String(month).padStart(2, "0")}-01`;
  }, []);
  const [statusFilter, setStatusFilter] = useState<IncidentStatus>(initialStatus as IncidentStatus);
  const [rcaFilter, setRcaFilter] = useState("All");
  const [showFilter, setShowFilter] = useState(false);
  const [tempSearch, setTempSearch] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState<string | null>(defaultFromDate);
  const [toDate, setToDate] = useState<string | null>(defaultToDate);
  const dateRangePreview = useMemo(() => {
    const formatPreviewDate = (dateStr: string | null) => {
      if (!dateStr) return "Any";
      const ms = istDayStartMsFromYmd(dateStr);
      return ms == null ? "Any" : formatISTDate(ms);
    };
    return `Date: ${formatPreviewDate(fromDate)} - ${formatPreviewDate(toDate)}`;
  }, [fromDate, toDate]);
  const [tempFromDate, setTempFromDate] = useState<string | null>(defaultFromDate);
  const [tempToDate, setTempToDate] = useState<string | null>(defaultToDate);
  const [creating, setCreating] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<IncidentItem | null>(null);
  const [incidentModalVisible, setIncidentModalVisible] = useState(false);
  const [nextStatus, setNextStatus] = useState<"Inprogress" | "Resolved" | null>(null);
  const [updateRemarks, setUpdateRemarks] = useState("");
  const [updateRcaStatus, setUpdateRcaStatus] = useState<"Open" | "RCA Under Review" | "RCA Submitted">("Open");
  const [isUpdatingIncident, setIsUpdatingIncident] = useState(false);
  const [detailPendingAttachments, setDetailPendingAttachments] = useState<string[]>([]);
  const [detailPendingRcaAttachments, setDetailPendingRcaAttachments] = useState<string[]>([]);
  const [detailRespondedAt, setDetailRespondedAt] = useState<Date | null>(null);
  const [detailCreatedAt, setDetailCreatedAt] = useState<Date | null>(null);
  const [detailResolvedAt, setDetailResolvedAt] = useState<Date | null>(null);
  const [detailAssignedTo, setDetailAssignedTo] = useState("");
  const [detailRcaChecker, setDetailRcaChecker] = useState("");
  const [siteUserOptions, setSiteUserOptions] = useState<SelectOption[]>([]);
  const [showCreatedTimePicker, setShowCreatedTimePicker] = useState(false);
  const [showRespondedTimePicker, setShowRespondedTimePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetOptions, setAssetOptions] = useState<SelectOption[]>([]);
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [form, setForm] = useState<IncidentCreateForm>(() => ({
    site_code: "",
    fault_symptom: "",
    asset_location: "",
    fault_type: "Others",
    severity: "Moderate",
    operating_condition: "Stopped",
    immediate_action_taken: "",
    attachments: [],
    incident_created_time: new Date(),
    assigned_to: "",
    status: "Open",
    incident_updated_time: null,
    client_request_id: uuidv4(),
  }));
  const currentUserId = user?.user_id || user?.id || "";

  const siteOptions = useMemo<SelectOption[]>(
    () =>
      sites.map((s) => ({
        value: s.site_code || "",
        label: s.site_name || s.site_code || "",
        description: s.site_code || "",
      })),
    [sites],
  );

  const staticOptions = useMemo(
    () => ({
      faultType: FAULT_TYPE_OPTIONS.map((value) => ({ value, label: value })),
      severity: SEVERITY_OPTIONS.map((value) => ({ value, label: value })),
      operatingCondition: OPERATING_CONDITION_OPTIONS.map((value) => ({ value, label: value })),
    }),
    [],
  );

  const fetchGenRef = useRef(0);
  const incidentsCountRef = useRef(0);

  useEffect(() => {
    incidentsCountRef.current = incidents.length;
  }, [incidents.length]);

  const fetchData = useCallback(async (reason: "filter" | "refresh" | "background" = "filter") => {
    if (!selectedSiteCode) {
      setLoading(false);
      setRefreshing(false);
      setIsSwitchingFilters(false);
      return;
    }

    const requestGen = ++fetchGenRef.current;
    const hasVisibleData = incidentsCountRef.current > 0;

    // 1) Read cache first — mirrors the offline branch in IncidentsService so
    // the UI shows local rows immediately, before the network response lands.
    try {
      const whereParts: any[] = [eq(incidentsTable.site_code, selectedSiteCode)];
      if (statusFilter) {
        whereParts.push(eq(incidentsTable.status, statusFilter));
      }
      if (fromDate) {
        const from = Date.parse(fromDate);
        if (!Number.isNaN(from)) whereParts.push(gte(incidentsTable.incident_created_time, from));
      }
      if (toDate) {
        const to = Date.parse(toDate);
        if (!Number.isNaN(to)) whereParts.push(lte(incidentsTable.incident_created_time, to));
      }
      const localRows = await db
        .select()
        .from(incidentsTable)
        .where(whereParts.length > 1 ? and(...whereParts) : whereParts[0])
        .orderBy(desc(incidentsTable.incident_created_time));

      const needle = search?.trim().toLowerCase();
      const filtered = localRows.filter((r) => {
        if (rcaFilter && rcaFilter !== "All" && r.rca_status !== rcaFilter) return false;
        if (!needle) return true;
        const hay = `${r.incident_id} ${r.fault_symptom} ${r.asset_location || ""}`.toLowerCase();
        return hay.includes(needle);
      });

      if (requestGen !== fetchGenRef.current) return;

      if (filtered.length > 0) {
        setIncidents(filtered as IncidentItem[]);
        setLoading(false);
      } else if (!hasVisibleData && reason !== "background") {
        // True cold-start with no cache — show skeleton until network lands.
        setLoading(true);
      } else {
        setIsSwitchingFilters(true);
      }
    } catch (e) {
      console.warn("Incidents cache read failed", e);
    }

    // 2) Network fetch in the background — silent on failure. The
    // service writes new rows to SQLite, then we re-read into state.
    try {
      const [listRes, statsRes] = await Promise.all([
        IncidentsService.getIncidents(selectedSiteCode, {
          status: statusFilter,
          rca_status: rcaFilter === "All" ? undefined : rcaFilter,
          search,
          fromDate,
          toDate,
        }),
        IncidentsService.getStats(selectedSiteCode),
      ]);

      if (requestGen !== fetchGenRef.current) return;

      if (listRes?.success) {
        setIncidents((listRes.data || []) as IncidentItem[]);
      }
      if (statsRes?.success) {
        setStats(statsRes.data?.byStatus || statsRes.data || {});
      }
    } catch (e) {
      console.warn("Incidents background fetch failed", e);
    } finally {
      setLoading(false);
      setIsSwitchingFilters(false);
      setRefreshing(false);
    }
  }, [selectedSiteCode, statusFilter, rcaFilter, search, fromDate, toDate]);

  const uploadUrisToStorage = useCallback(
    async (uris: string[], siteCode: string, folder: "incident" | "rca") => {
      if (!isConnected || uris.length === 0) return uris;
      const uploaded: string[] = [];
      for (let i = 0; i < uris.length; i += 1) {
        const uri = uris[i];
        const ext = getFileExtension(uri);
        const path = `incidents/${siteCode || "unknown"}/${folder}/${Date.now()}_${i}_${uuidv4()}.${ext}`;
        const remoteUrl = await StorageService.uploadFile("jouleops-attachments", path, uri);
        if (!remoteUrl) {
          throw new Error("Failed to upload one or more files to Firebase Storage.");
        }
        uploaded.push(remoteUrl);
      }
      return uploaded;
    },
    [isConnected],
  );

  // RCA quick-filters only apply to Completed incidents; drop any active RCA
  // filter when the status filter moves away from "Resolved" so the list
  // isn't left filtered by a chip the user can no longer toggle.
  useEffect(() => {
    if (statusFilter !== "Resolved" && rcaFilter !== "All") {
      setRcaFilter("All");
    }
  }, [statusFilter, rcaFilter]);

  useEffect(() => {
    void fetchData("filter");
  }, [fetchData]);

  useAutoSync(() => fetchData("background"), [selectedSiteCode]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData("refresh");
  }, [fetchData]);

  const applyAdvancedFilters = () => {
    setSearch(tempSearch);
    setFromDate(tempFromDate);
    setToDate(tempToDate);
    setShowFilter(false);
  };

  const loadSiteUsers = useCallback(async (siteCode: string) => {
    if (!siteCode) {
      setSiteUserOptions([]);
      return;
    }
    const res = await IncidentsService.getSiteUsers(siteCode);
    if (res?.success && Array.isArray(res.data)) {
      const options: SelectOption[] = res.data
        .filter((u: any) => u?.user_id)
        .map((u: any) => ({
          value: u.user_id,
          label: u.user_name || u.user_employee_code || u.user_id,
          description: u.user_designation || u.user_department || "",
        }));
      setSiteUserOptions(options);
    }
  }, []);

  const resetCreateForm = useCallback(() => {
    setForm({
      site_code: selectedSiteCode || "",
      fault_symptom: "",
      asset_location: "",
      fault_type: "Others",
      severity: "Moderate",
      operating_condition: "Stopped",
      immediate_action_taken: "",
      attachments: [],
      incident_created_time: new Date(),
      assigned_to: currentUserId,
      status: "Open",
      incident_updated_time: null,
      // Fresh key per new draft so distinct incidents don't share one.
      client_request_id: uuidv4(),
    });
    setAssetSearchQuery("");
  }, [currentUserId, selectedSiteCode]);

  const loadAssets = useCallback(
    async (siteCode: string) => {
      if (!siteCode) {
        setAssetOptions([]);
        return;
      }
      setAssetsLoading(true);
      try {
        const result = await TicketsService.getAssets(siteCode, {
          page: 1,
          limit: 200,
          search: assetSearchQuery.trim() || undefined,
        });
        if (result?.success) {
          const nextOptions: SelectOption[] = (result.data || []).map((asset: any) => ({
            value: asset.asset_name || asset.asset_id || "",
            label: asset.asset_name || asset.asset_id || "",
            description:
              `${asset.asset_type || ""} ${asset.location ? `- ${asset.location}` : ""}`.trim(),
          }));
          setAssetOptions(nextOptions);
        }
      } finally {
        setAssetsLoading(false);
      }
    },
    [assetSearchQuery],
  );

  useEffect(() => {
    if (!creating) return;
    if (!form.site_code && selectedSiteCode) {
      setForm((prev) => ({ ...prev, site_code: selectedSiteCode }));
      return;
    }
    if (form.site_code) {
      loadAssets(form.site_code);
      loadSiteUsers(form.site_code);
    }
  }, [creating, form.site_code, selectedSiteCode, loadAssets, loadSiteUsers]);

  useEffect(() => {
    if (!creating || canEditMeta) return;
    if (!currentUserId) return;
    if (form.assigned_to !== currentUserId) {
      setForm((prev) => ({ ...prev, assigned_to: currentUserId }));
    }
  }, [creating, canEditMeta, currentUserId, form.assigned_to]);

  const pickFromGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.7,
      selectionLimit: 8,
    });
    if (!result.canceled) {
      const uris = result.assets.map((asset) => asset.uri).filter(Boolean);
      setForm((prev) => ({ ...prev, attachments: [...prev.attachments, ...uris] }));
    }
  }, []);

  const capturePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      Alert.alert("Permission required", "Camera permission is required.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setForm((prev) => ({ ...prev, attachments: [...prev.attachments, result.assets[0].uri] }));
    }
  }, []);

  const removeAttachment = useCallback((uri: string) => {
    setForm((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((item) => item !== uri),
    }));
  }, []);

  const openCreatedTimePicker = useCallback(() => {
    if (!canEditMeta) return;
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: form.incident_created_time,
        mode: "date",
        is24Hour: true,
        onChange: (_event, date) => {
          if (!date) return;
          DateTimePickerAndroid.open({
            value: date,
            mode: "time",
            is24Hour: true,
            onChange: (_event2, date2) => {
              if (!date2) return;
              setForm((prev) => ({ ...prev, incident_created_time: date2 }));
            },
          });
        },
      });
      return;
    }
    setShowCreatedTimePicker(true);
  }, [canEditMeta, form.incident_created_time]);

  const openRespondedTimePicker = useCallback(() => {
    const base = form.incident_updated_time || new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: base,
        mode: "date",
        is24Hour: true,
        maximumDate: new Date(),
        onChange: (_event, date) => {
          if (!date) return;
          DateTimePickerAndroid.open({
            value: date,
            mode: "time",
            is24Hour: true,
            onChange: (_event2, date2) => {
              if (!date2) return;
              if (date2.getTime() < form.incident_created_time.getTime()) {
                Alert.alert(
                  "Invalid time",
                  "Responded time cannot be earlier than the created time.",
                );
                return;
              }
              if (date2.getTime() > Date.now()) {
                Alert.alert("Invalid time", "Responded time cannot be in the future.");
                return;
              }
              setForm((prev) => ({ ...prev, incident_updated_time: date2 }));
            },
          });
        },
      });
      return;
    }
    setShowRespondedTimePicker(true);
  }, [form.incident_updated_time, form.incident_created_time]);

  const onCreateIncident = async () => {
    if (!form.site_code) return Alert.alert("Required", "Please select site.");
    if (!form.asset_location) return Alert.alert("Required", "Please select asset.");
    if (!form.fault_symptom.trim()) return Alert.alert("Required", "Incident name is required.");
    if (!form.fault_type) return Alert.alert("Required", "Please select fault type.");
    if (!form.severity) return Alert.alert("Required", "Please select severity.");
    if (!form.operating_condition) return Alert.alert("Required", "Please select operating condition.");
    if (form.incident_created_time.getTime() > Date.now()) {
      return Alert.alert("Invalid time", "Incident created time cannot be in the future.");
    }
    if (form.status === "Inprogress") {
      const responded = form.incident_updated_time || new Date();
      if (responded.getTime() < form.incident_created_time.getTime()) {
        return Alert.alert(
          "Invalid time",
          "Responded time cannot be earlier than the created time.",
        );
      }
      if (responded.getTime() > Date.now()) {
        return Alert.alert("Invalid time", "Responded time cannot be in the future.");
      }
    }

    setSubmitting(true);
    let uploadedAttachments: string[];
    try {
      uploadedAttachments = await uploadUrisToStorage(form.attachments, form.site_code, "incident");
    } catch (error: any) {
      setSubmitting(false);
      Alert.alert("Upload failed", error?.message || "Could not upload attachments to cloud storage.");
      return;
    }
    const respondedAtForInprogress =
      form.status === "Inprogress"
        ? (form.incident_updated_time || new Date()).toISOString()
        : undefined;
    const payload = {
      ...form,
      source: "Incident",
      site_code: form.site_code,
      raised_by: user?.user_id || user?.id || "",
      incident_created_time: new Date().toISOString(),
      status: form.status,
      rca_status: "Open",
      assigned_to: form.assigned_to,
      attachments: uploadedAttachments,
      ...(canEditMeta ? { incident_created_time: form.incident_created_time.toISOString() } : {}),
      ...(respondedAtForInprogress ? { incident_updated_time: respondedAtForInprogress } : {}),
      // Stable across re-submits / offline replays of this draft.
      client_request_id: form.client_request_id,
    };
    const result = await IncidentsService.createIncident(payload);
    if (result?.success || result?.queued) {
      setCreating(false);
      resetCreateForm();
      fetchData();
      setSubmitting(false);
      if (result?.queued) {
        Alert.alert("Saved offline", "Incident will sync when you are back online.");
      }
      return;
    }
    setSubmitting(false);
    Alert.alert("Error", result?.error || "Failed to create incident");
  };

  const openIncidentModal = useCallback((item: IncidentItem) => {
    setSelectedIncident(item);
    setNextStatus(item.status === "Open" ? "Inprogress" : item.status === "Inprogress" ? "Resolved" : null);
    setUpdateRemarks(String(item.remarks || ""));
    setUpdateRcaStatus(item.rca_status);
    setDetailPendingAttachments([]);
    setDetailPendingRcaAttachments([]);
    setDetailCreatedAt(item.incident_created_time ? new Date(item.incident_created_time as any) : new Date());
    setDetailRespondedAt(item.incident_updated_time ? new Date(item.incident_updated_time as any) : new Date());
    setDetailResolvedAt(item.incident_resolved_time ? new Date(item.incident_resolved_time as any) : new Date());
    setDetailAssignedTo(parseAssignedTo(item.assigned_to).firstValue);
    setDetailRcaChecker(String(item.rca_checker || ""));
    void loadSiteUsers(item.site_code);
    setIncidentModalVisible(true);
  }, [loadSiteUsers]);

  useEffect(() => {
    const incidentIdParam = Array.isArray(params.incidentId) ? params.incidentId[0] : params.incidentId;
    if (!incidentIdParam || incidents.length === 0 || incidentModalVisible) return;
    const target = incidents.find(
      (it) => String(it.id) === incidentIdParam || String(it.incident_id) === incidentIdParam,
    );
    if (target) {
      openIncidentModal(target);
    }
  }, [params.incidentId, incidents, incidentModalVisible, openIncidentModal]);

  const handleIncidentUpdate = useCallback(async () => {
    if (!selectedIncident) return;
    if (nextStatus === "Resolved" && !updateRemarks.trim()) {
      Alert.alert("Required", "Remarks required to resolve incident.");
      return;
    }

    const now = Date.now();
    if (detailCreatedAt && detailCreatedAt.getTime() > now) {
      Alert.alert("Invalid time", "Created time cannot be in the future.");
      return;
    }
    if (detailRespondedAt && detailRespondedAt.getTime() > now) {
      Alert.alert("Invalid time", "Responded time cannot be in the future.");
      return;
    }
    if (detailResolvedAt && detailResolvedAt.getTime() > now) {
      Alert.alert("Invalid time", "Resolved time cannot be in the future.");
      return;
    }
    if (
      detailResolvedAt &&
      detailRespondedAt &&
      detailResolvedAt.getTime() < detailRespondedAt.getTime()
    ) {
      Alert.alert(
        "Invalid time",
        "Resolved time cannot be earlier than responded time.",
      );
      return;
    }

    // RCA is only manageable once the incident is Completed (status "Resolved");
    // role permission (canEditRca) still applies on top of that.
    const canManageRca = canEditRca && selectedIncident.status === "Resolved";
    const hasStatusChange = Boolean(nextStatus);
    const hasRcaStatusChange = canManageRca && updateRcaStatus !== selectedIncident.rca_status;
    const hasRcaCheckerChange = canManageRca && detailRcaChecker !== String(selectedIncident.rca_checker || "");
    const hasNewRcaAttachments = canManageRca && detailPendingRcaAttachments.length > 0;
    const hasRcaChange = hasRcaStatusChange || hasRcaCheckerChange || hasNewRcaAttachments;
    const hasNewAttachments = detailPendingAttachments.length > 0;
    const hasRemarkChange = updateRemarks.trim() !== String(selectedIncident.remarks || "").trim();
    const prevCreatedMs = selectedIncident.incident_created_time
      ? new Date(selectedIncident.incident_created_time as any).getTime()
      : null;
    const hasCreatedTimeChange =
      canEditMeta &&
      !!detailCreatedAt &&
      (!!prevCreatedMs ? detailCreatedAt.getTime() !== prevCreatedMs : true);
    if (!hasStatusChange && !hasRcaChange && !hasNewAttachments && !hasCreatedTimeChange && !hasRemarkChange) {
      Alert.alert("No changes", "Update status, RCA, or add attachments.");
      return;
    }

    setIsUpdatingIncident(true);
    try {
      if (nextStatus) {
        const statusRes = await IncidentsService.updateStatus(
          selectedIncident.id,
          {
            status: nextStatus,
            remarks: nextStatus === "Resolved" ? updateRemarks.trim() : undefined,
            assigned_to: detailAssignedTo || undefined,
            ...(nextStatus === "Inprogress" && canEditMeta && detailRespondedAt
              ? { incident_updated_time: detailRespondedAt.toISOString() }
              : {}),
            ...(nextStatus === "Resolved" && canEditMeta && detailResolvedAt
              ? { incident_resolved_time: detailResolvedAt.toISOString() }
              : {}),
          },
        );
        if (!statusRes?.success && !statusRes?.queued) {
          Alert.alert("Error", statusRes?.error || "Failed to update status");
          setIsUpdatingIncident(false);
          return;
        }
      }

      if (hasCreatedTimeChange) {
        const metaRes = await IncidentsService.updateIncident(selectedIncident.id, {
          incident_created_time: detailCreatedAt?.toISOString(),
          assigned_to: detailAssignedTo || undefined,
        });
        if (!metaRes?.success && !metaRes?.queued) {
          Alert.alert("Error", metaRes?.error || "Failed to update created time");
          setIsUpdatingIncident(false);
          return;
        }
      }

      if (!nextStatus && hasRemarkChange) {
        const remarksRes = await IncidentsService.updateIncident(selectedIncident.id, {
          remarks: updateRemarks.trim(),
        });
        if (!remarksRes?.success && !remarksRes?.queued) {
          Alert.alert("Error", remarksRes?.error || "Failed to update remarks");
          setIsUpdatingIncident(false);
          return;
        }
      }

      if (canManageRca && hasRcaChange) {
        const existingRca = parseIncidentAttachments(selectedIncident.rca_attachments);
        let uploadedRca: string[] = [];
        try {
          uploadedRca = await uploadUrisToStorage(
            detailPendingRcaAttachments,
            selectedIncident.site_code,
            "rca",
          );
        } catch (error: any) {
          Alert.alert("Upload failed", error?.message || "Could not upload RCA files to cloud storage.");
          setIsUpdatingIncident(false);
          return;
        }
        const mergedRca = [...existingRca, ...uploadedRca];
        const rcaRes = await IncidentsService.updateRcaStatus(selectedIncident.id, {
          rca_status: updateRcaStatus,
          rca_checker: detailRcaChecker || undefined,
          rca_attachments: mergedRca,
        });
        if (!rcaRes?.success && !rcaRes?.queued) {
          Alert.alert("Error", rcaRes?.error || "Failed to update RCA status");
          setIsUpdatingIncident(false);
          return;
        }
      }

      if (detailPendingAttachments.length > 0) {
        const existing = parseIncidentAttachments(selectedIncident.attachments);
        let uploaded: string[] = [];
        try {
          uploaded = await uploadUrisToStorage(
            detailPendingAttachments,
            selectedIncident.site_code,
            "incident",
          );
        } catch (error: any) {
          Alert.alert("Upload failed", error?.message || "Could not upload attachments to cloud storage.");
          setIsUpdatingIncident(false);
          return;
        }
        const merged = [...existing, ...uploaded];
        const attRes = await IncidentsService.updateIncident(selectedIncident.id, {
          attachments: merged,
        });
        if (!attRes?.success && !attRes?.queued) {
          Alert.alert("Error", attRes?.error || "Failed to save attachments");
          setIsUpdatingIncident(false);
          return;
        }
      }

      // Optimistically reflect the change in the local cache so the list shows
      // the new state immediately — even offline. The incident mutations only
      // hit the network + offline queue and never write SQLite, so without this
      // the local row keeps its old status; after switching to the new status
      // tab, fetchData's local-first read can't find it and a flaky server
      // refetch leaves the tab looking empty (operator thinks nothing happened
      // and re-taps). Best-effort: purely a display optimization.
      try {
        const localUpdate: Record<string, any> = { updated_at: now };
        if (nextStatus) localUpdate.status = nextStatus;
        if (nextStatus === "Resolved") {
          localUpdate.remarks = updateRemarks.trim();
          localUpdate.incident_resolved_time = detailResolvedAt
            ? detailResolvedAt.getTime()
            : now;
        }
        if (nextStatus === "Inprogress" && detailRespondedAt) {
          localUpdate.incident_updated_time = detailRespondedAt.getTime();
        }
        if (!nextStatus && hasRemarkChange) localUpdate.remarks = updateRemarks.trim();
        await db
          .update(incidentsTable)
          .set(localUpdate)
          .where(eq(incidentsTable.id, selectedIncident.id));
      } catch {
        // optimistic only — ignore
      }

      setIncidentModalVisible(false);
      setSelectedIncident(null);
      setNextStatus(null);
      setUpdateRemarks("");
      setDetailPendingAttachments([]);
      setDetailPendingRcaAttachments([]);
      setDetailCreatedAt(null);
      if (nextStatus && statusFilter !== nextStatus) {
        setStatusFilter(nextStatus);
      } else {
        await fetchData("refresh");
      }
    } finally {
      setIsUpdatingIncident(false);
    }
  }, [
    selectedIncident,
    nextStatus,
    updateRemarks,
    canEditRca,
    updateRcaStatus,
    detailPendingAttachments,
    detailPendingRcaAttachments,
    detailCreatedAt,
    detailAssignedTo,
    detailRespondedAt,
    detailResolvedAt,
    detailRcaChecker,
    canEditMeta,
    statusFilter,
    fetchData,
    uploadUrisToStorage,
  ]);

  const renderCard = ({ item }: { item: IncidentItem }) => {
    const status = getStatusVisual(item.status);
    const statusLabel = item.status === "Resolved" ? "Completed" : status.label;
    const assignee = parseAssignedTo(item.assigned_to).display;
    const createdAt = item.incident_created_time
      ? (() => {
          const d = new Date(item.incident_created_time as any);
          return Number.isNaN(d.getTime())
            ? "-"
            : `${formatIST(d, { day: "numeric", month: "short" })} · ${formatIST(d, { hour: "numeric", minute: "2-digit", hour12: true }, "en-US")}`;
        })()
      : "-";

    return (
      <TouchableOpacity
        onPress={() => openIncidentModal(item)}
        activeOpacity={0.7}
        className="bg-white dark:bg-slate-900 mb-2.5 rounded-2xl border border-slate-200 dark:border-slate-800"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.03,
          shadowRadius: 8,
          elevation: 1,
        }}
      >
        <View className="p-3">
          {/* Top: icon · title + id/site · rca badge */}
          <View className="flex-row items-start">
            <View
              className="w-9 h-9 rounded-[10px] items-center justify-center mr-2.5"
              style={{ backgroundColor: status.tint }}
            >
              <AlertTriangle size={16} color={status.color} />
            </View>

            <View className="flex-1 min-w-0 mr-2">
              <Text
                className="text-slate-900 dark:text-slate-50 font-semibold text-[14px] leading-5"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.fault_symptom}
              </Text>
              <View className="flex-row items-center mt-1">
                <Text
                  className="text-slate-500 dark:text-slate-400 text-[11px] font-medium flex-shrink-0"
                  numberOfLines={1}
                >
                  {item.incident_id || "INCIDENT"}
                </Text>
                <View className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-2" />
                <Text
                  className="text-slate-400 dark:text-slate-500 text-[11px] flex-shrink"
                  numberOfLines={1}
                >
                  {item.site_code || "-"}
                </Text>
              </View>
            </View>

            <View className="bg-slate-100 dark:bg-slate-800 rounded-md px-2 py-0.5 flex-shrink-0">
              <Text className="text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {item.rca_status}
              </Text>
            </View>
          </View>

          {/* Foot: time · assignee — status chip */}
          <View className="flex-row items-center justify-between mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
            <View className="flex-row items-center flex-1 mr-2" style={{ gap: 10 }}>
              <View className="flex-row items-center flex-shrink-0">
                <Clock size={12} color="#94a3b8" />
                <Text className="text-slate-500 dark:text-slate-400 text-[10.5px] font-medium ml-1">
                  {createdAt}
                </Text>
              </View>
              <View className="flex-row items-center flex-shrink min-w-0">
                {assignee ? (
                  <>
                    <View
                      className="w-[18px] h-[18px] rounded-full items-center justify-center mr-1.5"
                      style={{ backgroundColor: status.tint }}
                    >
                      <Text
                        className="text-[8px] font-bold"
                        style={{ color: status.color }}
                      >
                        {getInitials(assignee)}
                      </Text>
                    </View>
                    <Text
                      className="text-slate-500 dark:text-slate-400 text-[10.5px] font-medium flex-shrink"
                      numberOfLines={1}
                    >
                      {assignee}
                    </Text>
                  </>
                ) : (
                  <>
                    <UserCircle size={13} color="#94a3b8" />
                    <Text className="text-slate-400 dark:text-slate-500 text-[10.5px] font-medium ml-1">
                      Unassigned
                    </Text>
                  </>
                )}
              </View>
            </View>

            <View
              className="flex-row items-center rounded-md px-2 py-1 flex-shrink-0"
              style={{ backgroundColor: status.tint }}
            >
              <View
                className="w-1.5 h-1.5 rounded-full mr-1.5"
                style={{ backgroundColor: status.color }}
              />
              <Text
                className="text-[9px] font-bold uppercase tracking-wide"
                style={{ color: status.color }}
              >
                {statusLabel}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const listEmpty = useMemo(
    () =>
      loading ? (
        <TicketSkeleton />
      ) : (
        <EmptyState
          icon={AlertTriangle}
          title="No incidents found"
          action={
            isConnected && !sitesLoading && sites.length === 0
              ? {
                  label: "Retry Server Sync",
                  onPress: async () => {
                    await refreshSites();
                    fetchData();
                  },
                }
              : undefined
          }
        />
      ),
    [loading, isConnected, sitesLoading, sites.length, refreshSites, fetchData],
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        <View className="px-5 pt-2 pb-3">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-1">
              <Text className="text-slate-400 dark:text-slate-500 text-sm font-medium mb-1">
                Site Operations
              </Text>
              <TouchableOpacity
                onPress={() => setShowFilter(true)}
                className="flex-row items-center"
              >
                <MapPin size={20} color="#dc2626" />
                <Text
                  className="text-slate-900 dark:text-slate-50 text-xl font-bold ml-2 mr-1 flex-shrink"
                  numberOfLines={1}
                >
                  {siteName}
                </Text>
                <ChevronDown size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                disabled={!isConnected || !selectedSiteCode}
                onPress={onRefresh}
                className="w-11 h-11 rounded-xl bg-white dark:bg-slate-900 items-center justify-center"
                style={{ opacity: !isConnected || !selectedSiteCode ? 0.4 : 1 }}
              >
                <RefreshCw
                  size={20}
                  color={!isConnected || !selectedSiteCode ? "#94a3b8" : "#dc2626"}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowFilter(true)}
                className="w-11 h-11 rounded-xl bg-white dark:bg-slate-900 items-center justify-center"
              >
                <Filter size={20} color={fromDate ? "#dc2626" : (isDark ? "#dc2626" : "#64748b")} />
              </TouchableOpacity>
            </View>
          </View>
          <View className="mb-2 self-start px-3 py-1 rounded-full bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40">
            <Text className="text-[11px] font-semibold text-red-700 dark:text-red-300">
              {dateRangePreview}
            </Text>
          </View>
        </View>

        <IncidentStats
          stats={stats}
          loading={loading}
          currentStatus={statusFilter}
          onStatusChange={(value) => setStatusFilter(value as IncidentStatus)}
        />
        {/* RCA quick-filters apply only to Completed incidents — hidden
            entirely under Open / Inprogress. */}
        {statusFilter === "Resolved" ? (
          <IncidentTopFilters
            selected={rcaFilter}
            onChange={setRcaFilter}
            canEdit={canEditRca}
          />
        ) : null}
        {isSwitchingFilters ? (
          <View className="px-5 mb-2">
            <Text className="text-xs text-slate-500 dark:text-slate-400">Updating incidents...</Text>
          </View>
        ) : null}

        <FlashList
          data={incidents}
          renderItem={renderCard}
          keyExtractor={(item) => item.id}
          // Uniform-height cards (single recycle pool) + wider draw distance so
          // fast flings don't reveal blank space. See PM list for the same config.
          drawDistance={600}
          ListEmptyComponent={listEmpty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#dc2626" />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 120 }}
        />

        {canEdit && (
          <PressableScale
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              resetCreateForm();
              setCreating(true);
            }}
            className="absolute right-6 bottom-8 w-14 h-14 rounded-full bg-red-600 items-center justify-center"
          >
            <Plus color="#fff" size={24} />
          </PressableScale>
        )}

        <AdvancedFilterModal
          visible={showFilter}
          onClose={() => setShowFilter(false)}
          tempSearch={tempSearch}
          setTempSearch={setTempSearch}
          tempFromDate={tempFromDate}
          setTempFromDate={setTempFromDate}
          tempToDate={tempToDate}
          setTempToDate={setTempToDate}
          dateMode="date-range"
          sites={sites}
          selectedSiteCode={selectedSiteCode}
          setSelectedSiteCode={(code: string) => {
            const target = sites.find((s) => s.site_code === code);
            if (target) selectSite(target);
          }}
          user={user}
          statusFilter={statusFilter}
          setStatusFilter={(v: string) => setStatusFilter(v as IncidentStatus)}
          priorityFilter={"All"}
          setPriorityFilter={() => {}}
          statusOptions={["All", "Open", "Inprogress", "Resolved"]}
          statusOptionLabels={{ Resolved: "Completed" }}
          applyAdvancedFilters={applyAdvancedFilters}
          title="Filter Incidents"
        />

        <Modal
          visible={creating}
          animationType="slide"
          onRequestClose={() => {
            setCreating(false);
            resetCreateForm();
          }}
        >
          <View className="flex-1 bg-slate-50 dark:bg-slate-950">
            <SafeAreaView className="flex-1">
              <View className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <View className="flex-row items-center justify-between">
                  <Text className="text-slate-900 dark:text-slate-50 font-black text-lg">Create Incident</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setCreating(false);
                      resetCreateForm();
                    }}
                    className="w-8 h-8 rounded-full items-center justify-center bg-slate-100 dark:bg-slate-800"
                  >
                    <X size={18} color={isDark ? "#cbd5e1" : "#334155"} />
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                className="flex-1"
                contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
              >
                <FullscreenPicker
                  label="Site *"
                  placeholder="Select site"
                  options={siteOptions}
                  value={form.site_code}
                  onChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      site_code: value,
                      asset_location: "",
                    }))
                  }
                />
                <FullscreenPicker
                  label="Asset *"
                  placeholder="Select asset"
                  options={assetOptions}
                  value={form.asset_location}
                  onChange={(value) => setForm((prev) => ({ ...prev, asset_location: value }))}
                  loading={assetsLoading}
                  searchPlaceholder="Search assets..."
                  emptyMessage="No assets found"
                  searchValue={assetSearchQuery}
                  onSearchChange={setAssetSearchQuery}
                  remoteSearch
                />
                <View className="mb-4">
                  <Text className="text-slate-700 dark:text-slate-300 font-semibold text-sm mb-2">
                    Incident Name *
                  </Text>
                  <TextInput
                    placeholder="Enter incident name"
                    value={form.fault_symptom}
                    onChangeText={(v) => setForm((prev) => ({ ...prev, fault_symptom: v }))}
                    className="border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-3 text-slate-900 dark:text-slate-50"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <FullscreenPicker
                  label="Fault Type *"
                  placeholder="Select fault type"
                  options={staticOptions.faultType}
                  value={form.fault_type}
                  onChange={(value) => setForm((prev) => ({ ...prev, fault_type: value }))}
                />
                <FullscreenPicker
                  label="Severity *"
                  placeholder="Select severity"
                  options={staticOptions.severity}
                  value={form.severity}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, severity: value as IncidentCreateForm["severity"] }))
                  }
                />
                <FullscreenPicker
                  label="Operating Condition *"
                  placeholder="Select operating condition"
                  options={staticOptions.operatingCondition}
                  value={form.operating_condition}
                  onChange={(value) => setForm((prev) => ({ ...prev, operating_condition: value }))}
                />
                <View className="mb-4">
                  <Text className="text-slate-700 dark:text-slate-300 font-semibold text-sm mb-2">
                    Incident Created Time
                  </Text>
                  <TouchableOpacity
                    onPress={openCreatedTimePicker}
                    disabled={!canEditMeta}
                    className="border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-3"
                    style={{ opacity: canEditMeta ? 1 : 0.7 }}
                  >
                    <Text className="text-slate-900 dark:text-slate-50">
                      {formatIST(form.incident_created_time, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }, "en-US")}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View className="mb-4">
                  <Text className="text-slate-700 dark:text-slate-300 font-semibold text-sm mb-2">
                    Status
                  </Text>
                  <View className="flex-row gap-2">
                    {(["Open", "Inprogress"] as const).map((opt) => {
                      const active = form.status === opt;
                      return (
                        <TouchableOpacity
                          key={opt}
                          onPress={() =>
                            setForm((prev) => ({
                              ...prev,
                              status: opt,
                              incident_updated_time:
                                opt === "Inprogress"
                                  ? prev.incident_updated_time || new Date()
                                  : null,
                            }))
                          }
                          className={`px-4 py-2 rounded-xl border ${
                            active
                              ? "bg-red-600 border-red-600"
                              : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                          }`}
                        >
                          <Text
                            className={`text-xs font-bold ${
                              active ? "text-white" : "text-slate-700 dark:text-slate-200"
                            }`}
                          >
                            {opt}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                {form.status === "Inprogress" ? (
                  <View className="mb-4">
                    <Text className="text-slate-700 dark:text-slate-300 font-semibold text-sm mb-2">
                      Responded Time
                    </Text>
                    <TouchableOpacity
                      onPress={openRespondedTimePicker}
                      className="border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-3"
                    >
                      <Text className="text-slate-900 dark:text-slate-50">
                        {formatIST(form.incident_updated_time || new Date(), { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }, "en-US")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                <FullscreenPicker
                  label="Assigned To"
                  placeholder="Select assignee"
                  options={siteUserOptions}
                  value={form.assigned_to}
                  onChange={(value) => setForm((prev) => ({ ...prev, assigned_to: value }))}
                  disabled={!canEditMeta}
                />
                <View className="mb-4">
                  <Text className="text-slate-700 dark:text-slate-300 font-semibold text-sm mb-2">
                    Immediate Action Taken
                  </Text>
                  <TextInput
                    placeholder="Describe immediate action taken"
                    value={form.immediate_action_taken}
                    onChangeText={(v) => setForm((prev) => ({ ...prev, immediate_action_taken: v }))}
                    multiline
                    textAlignVertical="top"
                    numberOfLines={4}
                    className="border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-3 text-slate-900 dark:text-slate-50 min-h-[110px]"
                    placeholderTextColor="#94a3b8"
                  />
                </View>

                <View className="mb-4">
                  <Text className="text-slate-700 dark:text-slate-300 font-semibold text-sm mb-2">
                    Attachments
                  </Text>
                  <View className="flex-row gap-2 mb-3">
                    <TouchableOpacity
                      onPress={capturePhoto}
                      className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex-row items-center"
                    >
                      <Camera size={16} color={isDark ? "#cbd5e1" : "#334155"} />
                      <Text className="ml-2 text-slate-700 dark:text-slate-200 text-xs font-semibold">Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={pickFromGallery}
                      className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex-row items-center"
                    >
                      <ImageIcon size={16} color={isDark ? "#cbd5e1" : "#334155"} />
                      <Text className="ml-2 text-slate-700 dark:text-slate-200 text-xs font-semibold">Gallery</Text>
                    </TouchableOpacity>
                  </View>
                  {form.attachments.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View className="flex-row gap-2">
                        {form.attachments.map((uri) => (
                          <View key={uri} className="relative">
                            <Image
                              source={{ uri }}
                              style={{ width: 84, height: 84, borderRadius: 12 }}
                            />
                            <TouchableOpacity
                              onPress={() => removeAttachment(uri)}
                              className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-black/70 items-center justify-center"
                            >
                              <X size={14} color="#fff" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  ) : (
                    <Text className="text-slate-500 dark:text-slate-400 text-xs">No attachments selected</Text>
                  )}
                </View>
              </ScrollView>

              <View className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => {
                      setCreating(false);
                      resetCreateForm();
                    }}
                    className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-xl py-3"
                  >
                    <Text className="text-center font-bold text-slate-800 dark:text-slate-100">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={onCreateIncident}
                    disabled={submitting}
                    className="flex-1 bg-red-600 rounded-xl py-3"
                    style={{ opacity: submitting ? 0.6 : 1 }}
                  >
                    <Text className="text-center font-bold text-white">
                      {submitting ? "Creating..." : "Create Incident"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {showCreatedTimePicker && Platform.OS !== "android" ? (
                <DateTimePicker
                  value={form.incident_created_time}
                  mode="datetime"
                  onChange={(_, date) => {
                    setShowCreatedTimePicker(false);
                    if (!date) return;
                    setForm((prev) => ({ ...prev, incident_created_time: date }));
                  }}
                />
              ) : null}
              {showRespondedTimePicker && Platform.OS !== "android" ? (
                <DateTimePicker
                  value={form.incident_updated_time || new Date()}
                  mode="datetime"
                  maximumDate={new Date()}
                  onChange={(_, date) => {
                    setShowRespondedTimePicker(false);
                    if (!date) return;
                    if (date.getTime() < form.incident_created_time.getTime()) {
                      Alert.alert(
                        "Invalid time",
                        "Responded time cannot be earlier than the created time.",
                      );
                      return;
                    }
                    if (date.getTime() > Date.now()) {
                      Alert.alert("Invalid time", "Responded time cannot be in the future.");
                      return;
                    }
                    setForm((prev) => ({ ...prev, incident_updated_time: date }));
                  }}
                />
              ) : null}
            </SafeAreaView>
          </View>
        </Modal>

        <IncidentDetailModal
          visible={incidentModalVisible}
          incident={selectedIncident}
          onClose={() => {
            setIncidentModalVisible(false);
            setSelectedIncident(null);
            setDetailPendingAttachments([]);
            setDetailPendingRcaAttachments([]);
          }}
          canEditMeta={canEditMeta}
          assignedTo={detailAssignedTo}
          setAssignedTo={setDetailAssignedTo}
          assigneeOptions={siteUserOptions}
          respondedAt={detailRespondedAt}
          setRespondedAt={setDetailRespondedAt}
          createdAt={detailCreatedAt}
          setCreatedAt={setDetailCreatedAt}
          resolvedAt={detailResolvedAt}
          setResolvedAt={setDetailResolvedAt}
          rcaChecker={detailRcaChecker}
          setRcaChecker={setDetailRcaChecker}
          rcaCheckerOptions={siteUserOptions}
          canEditRca={canEditRca && selectedIncident?.status === "Resolved"}
          nextStatus={nextStatus}
          setNextStatus={setNextStatus}
          remarks={updateRemarks}
          setRemarks={setUpdateRemarks}
          rcaStatus={updateRcaStatus}
          setRcaStatus={setUpdateRcaStatus}
          isUpdating={isUpdatingIncident}
          onSubmit={handleIncidentUpdate}
          existingAttachmentUrls={selectedIncident ? parseIncidentAttachments(selectedIncident.attachments) : []}
          pendingAttachments={detailPendingAttachments}
          setPendingAttachments={setDetailPendingAttachments}
          existingRcaAttachmentUrls={selectedIncident ? parseIncidentAttachments(selectedIncident.rca_attachments) : []}
          pendingRcaAttachments={detailPendingRcaAttachments}
          setPendingRcaAttachments={setDetailPendingRcaAttachments}
        />
      </SafeAreaView>
    </View>
  );
}
