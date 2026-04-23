import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  FlatList,
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
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { ChevronDown, Filter, MapPin, Plus, RefreshCw, Camera, Image as ImageIcon, X, Clock } from "lucide-react-native";
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
import FullscreenPicker from "@/components/FullscreenPicker";
import { type SelectOption } from "@/components/SearchableSelect";
import { TicketsService } from "@/services/TicketsService";
import {
  FAULT_TYPE_OPTIONS,
  OPERATING_CONDITION_OPTIONS,
  SEVERITY_OPTIONS,
} from "@/constants/incidentFormOptions";
import { v4 as uuidv4 } from "uuid";

type IncidentStatus = "Open" | "Inprogress" | "Resolved";

const toLocalYmd = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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
    }
  }
  return out;
}

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
}

export default function IncidentsTab() {
  const isDark = useColorScheme() === "dark";
  const { user } = useAuth();
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
  const canEditRca = ["admin", "manager"].includes(String(user?.role || "").toLowerCase());
  const canEditMeta = canEditRca;

  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [isSwitchingFilters, setIsSwitchingFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const initialStatus =
    (Array.isArray(params.status) ? params.status[0] : params.status) === "Inprogress"
      ? "Inprogress"
      : "Open";
  const today = useMemo(() => new Date(), []);
  const thisMonthStart = useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
    [today],
  );
  const defaultFromDate = useMemo(() => toLocalYmd(thisMonthStart), [thisMonthStart]);
  const defaultToDate = useMemo(() => toLocalYmd(today), [today]);
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
      const [year, month, day] = dateStr.slice(0, 10).split("-").map(Number);
      if (!year || !month || !day) return "Any";
      return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
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
  const [submitting, setSubmitting] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetOptions, setAssetOptions] = useState<SelectOption[]>([]);
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [form, setForm] = useState<IncidentCreateForm>({
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
  });
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

  const fetchData = useCallback(async (reason: "filter" | "refresh" | "background" = "filter") => {
    if (!selectedSiteCode) {
      setLoading(false);
      setRefreshing(false);
      setIsSwitchingFilters(false);
      return;
    }

    const requestGen = ++fetchGenRef.current;
    const hasVisibleData = incidents.length > 0;
    const shouldShowBlockingLoader = !hasVisibleData && reason !== "background";

    if (shouldShowBlockingLoader) {
      setLoading(true);
    } else {
      setIsSwitchingFilters(true);
    }

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

    if (requestGen !== fetchGenRef.current) {
      return;
    }

    if (listRes?.success) {
      setIncidents((listRes.data || []) as IncidentItem[]);
    }
    if (statsRes?.success) {
      setStats(statsRes.data?.byStatus || statsRes.data || {});
    }

    setLoading(false);
    setIsSwitchingFilters(false);
    setRefreshing(false);
  }, [selectedSiteCode, statusFilter, rcaFilter, search, fromDate, toDate, incidents.length]);

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

    setSubmitting(true);
    const payload = {
      ...form,
      source: "Incident",
      site_code: form.site_code,
      raised_by: user?.user_id || user?.id || "",
      incident_created_time: new Date().toISOString(),
      status: "Open",
      rca_status: "Open",
      assigned_to: form.assigned_to,
      ...(canEditMeta ? { incident_created_time: form.incident_created_time.toISOString() } : {}),
      client_request_id: uuidv4(),
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

    const hasStatusChange = Boolean(nextStatus);
    const hasRcaChange = canEditRca && updateRcaStatus !== selectedIncident.rca_status;
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

      if (canEditRca && updateRcaStatus !== selectedIncident.rca_status) {
        const rcaRes = await IncidentsService.updateRcaStatus(selectedIncident.id, {
          rca_status: updateRcaStatus,
          rca_checker: detailRcaChecker || undefined,
          rca_attachments: detailPendingRcaAttachments.length > 0 ? detailPendingRcaAttachments : undefined,
        });
        if (!rcaRes?.success && !rcaRes?.queued) {
          Alert.alert("Error", rcaRes?.error || "Failed to update RCA status");
          setIsUpdatingIncident(false);
          return;
        }
      }

      if (detailPendingAttachments.length > 0) {
        const existing = parseIncidentAttachments(selectedIncident.attachments);
        const merged = [...existing, ...detailPendingAttachments];
        const attRes = await IncidentsService.updateIncident(selectedIncident.id, {
          attachments: merged,
        });
        if (!attRes?.success && !attRes?.queued) {
          Alert.alert("Error", attRes?.error || "Failed to save attachments");
          setIsUpdatingIncident(false);
          return;
        }
      }

      setIncidentModalVisible(false);
      setSelectedIncident(null);
      setNextStatus(null);
      setUpdateRemarks("");
      setDetailPendingAttachments([]);
      setDetailPendingRcaAttachments([]);
      setDetailCreatedAt(null);
      await fetchData();
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
    fetchData,
  ]);

  const renderCard = ({ item }: { item: IncidentItem }) => (
    <TouchableOpacity
      onPress={() => openIncidentModal(item)}
      activeOpacity={0.7}
      className="bg-white dark:bg-slate-900 mb-4 rounded-2xl border border-slate-200 dark:border-slate-800"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 1,
      }}
    >
      <View className="p-3.5">
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 px-2 py-1">
            <Text className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">
              {item.incident_id || "INCIDENT"}
            </Text>
            <View className="mx-1.5 w-0.5 h-0.5 rounded-full bg-slate-300 dark:bg-slate-500" />
            <Text className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              {item.site_code || "-"}
            </Text>
          </View>
          <View className="px-2 py-1 rounded-lg border bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <Text className="text-[9px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              {item.rca_status}
            </Text>
          </View>
        </View>

        <View className="mb-2.5">
          <Text
            className="text-slate-900 dark:text-slate-50 font-bold text-base leading-5 mb-1.5"
            numberOfLines={1}
          >
            {item.fault_symptom}
          </Text>
          <View className="flex-row items-center self-start">
            <View className={`flex-row items-center rounded-full px-2 py-1 ${
              item.status === "Open"
                ? "bg-red-50 dark:bg-red-900/20"
                : item.status === "Inprogress"
                  ? "bg-blue-50 dark:bg-blue-900/20"
                  : "bg-green-50 dark:bg-green-900/20"
            }`}>
              <View
                className="rounded-full mr-2 w-1.5 h-1.5"
                style={{
                  backgroundColor:
                    item.status === "Open"
                      ? "#dc2626"
                      : item.status === "Inprogress"
                        ? "#2563eb"
                        : "#16a34a",
                }}
              />
              <Text
                className={`font-bold uppercase tracking-widest text-[9px] ${
                  item.status === "Open"
                    ? "text-red-600"
                    : item.status === "Inprogress"
                      ? "text-blue-600"
                      : "text-green-600"
                }`}
              >
                {item.status}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-row items-center pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
          <MapPin size={10} color="#cbd5e1" />
          <Text className="text-slate-400 dark:text-slate-500 text-[10px] font-medium ml-1 flex-1" numberOfLines={1}>
            {item.asset_location || "General Area"}
          </Text>
          <Clock size={10} color="#cbd5e1" />
          <Text className="text-slate-400 dark:text-slate-500 text-[10px] font-medium ml-1">
            {item.incident_created_time ? new Date(item.incident_created_time).toLocaleDateString() : "-"}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const listEmpty = useMemo(
    () =>
      loading ? (
        <TicketSkeleton />
      ) : (
        <View className="py-20 items-center justify-center">
          <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg">No incidents found</Text>
          {isConnected && !sitesLoading && sites.length === 0 && (
            <TouchableOpacity
              onPress={async () => {
                await refreshSites();
                fetchData();
              }}
              className="mt-4 bg-red-600 px-4 py-2 rounded-xl"
            >
              <Text className="text-white font-bold">Retry Server Sync</Text>
            </TouchableOpacity>
          )}
        </View>
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
        <IncidentTopFilters
          selected={rcaFilter}
          onChange={setRcaFilter}
          canEdit={canEditRca}
        />
        {isSwitchingFilters ? (
          <View className="px-5 mb-2">
            <Text className="text-xs text-slate-500 dark:text-slate-400">Updating incidents...</Text>
          </View>
        ) : null}

        <FlatList
          data={incidents}
          renderItem={renderCard}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={listEmpty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#dc2626" />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, flexGrow: 1 }}
        />

        <TouchableOpacity
          onPress={() => {
            resetCreateForm();
            setCreating(true);
          }}
          className="absolute right-6 bottom-8 w-14 h-14 rounded-full bg-red-600 items-center justify-center"
        >
          <Plus color="#fff" size={24} />
        </TouchableOpacity>

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
                      {form.incident_created_time.toLocaleString()}
                    </Text>
                  </TouchableOpacity>
                </View>
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
          canEditRca={canEditRca}
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
