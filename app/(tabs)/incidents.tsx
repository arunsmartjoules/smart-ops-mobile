import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OpsTabs } from "@/components/jo/OpsTabs";
import { rangeForPreset, setOpsDateRange, useOpsDateRange } from "@/services/OpsDateRange";
import {
  Alert,
  InteractionManager,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import * as Haptics from "expo-haptics";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useSites } from "@/hooks/useSites";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useAutoSync } from "@/hooks/useAutoSync";
import { Bx } from "@/components/jo/Bx";
import {
  EmptyState,
  Fab,
  JoPage,
  SearchField,
  Shimmer,
  f,
  makeJoStyles,
  useJoTheme,
} from "@/components/jo/ui";
import { useNavInsets } from "@/components/jo/navInsets";
import IncidentDetailModal from "@/components/IncidentDetailModal";
import IncidentCard from "@/components/IncidentItem";
import RaiseIncidentChooser, { type RaiseChoice } from "@/components/incidents/RaiseIncidentChooser";
import RcaImportModal from "@/components/incidents/RcaImportModal";
import IncidentCreateSheet from "@/components/incidents/IncidentCreateForm";
import { IncChip, Notice } from "@/components/incidents/IncFields";
import { SwipeTabs, useListSlide } from "@/components/incidents/IncListMotion";
import { IncidentsService } from "@/services/IncidentsService";
import cacheManager from "@/services/CacheManager";
import {
  incidentsRealtimeService,
  makeEventDeduper,
  type ChangeFeedEvent,
} from "@/services/RealtimeStreamClient";
import { db, incidents as incidentsTable } from "@/database";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { StorageService } from "@/services/StorageService";
import { type SelectOption } from "@/components/SearchableSelect";
import { TicketsService } from "@/services/TicketsService";
import {
  istParts,
  istDayStartMsFromYmd,
  istDayEndMsFromYmd,
  formatIST,
} from "@/utils/istDate";
import {
  FAULT_TYPE_OPTIONS,
  OPERATING_CONDITION_OPTIONS,
  SEVERITY_OPTIONS,
} from "@/constants/incidentFormOptions";
import { v4 as uuidv4 } from "uuid";

type IncidentStatus = "All" | "Open" | "Inprogress" | "Resolved" | "RCA Submitted";

const DMY: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

/** "1–19 Aug 2026" / "1 Jul – 19 Aug 2026" / "1 Jul 2025 – 19 Aug 2026". */
const formatDateRange = (from: string | null, to: string | null) => {
  const fromMs = istDayStartMsFromYmd(from);
  const toMs = istDayStartMsFromYmd(to);
  if (fromMs == null && toMs == null) return "All dates";
  if (fromMs == null) return `Up to ${formatIST(toMs!, DMY)}`;
  if (toMs == null) return `From ${formatIST(fromMs, DMY)}`;

  const a = istParts(fromMs);
  const b = istParts(toMs);
  if (a.year === b.year && a.month === b.month) {
    return `${formatIST(fromMs, { day: "numeric" })}–${formatIST(toMs, DMY)}`;
  }
  if (a.year === b.year) {
    return `${formatIST(fromMs, { day: "numeric", month: "short" })} – ${formatIST(toMs, DMY)}`;
  }
  return `${formatIST(fromMs, DMY)} – ${formatIST(toMs, DMY)}`;
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
  /** user_id of whoever logged it (server-stamped). */
  created_by?: string | null;
  /** Free text — who reported it; legacy rows may hold a user_id. */
  raised_by?: string | null;
  // RCA findings — filled by the RCA upload flow (read-only on mobile).
  root_cause?: string | null;
  corrective_action?: string | null;
  preventive_action?: string | null;
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
  /** Free text — who reported it ("Sister Mary, ICU"). Not a user id. */
  raised_by: string;
  /** Required; starts empty so the person has to choose. */
  assigned_to: string;
  // Stable idempotency key for this form's incident, reused on every submit /
  // offline replay so retries collapse into one incident server-side.
  client_request_id: string;
}

export default function IncidentsTab() {
  const t = useJoTheme();
  const s = useStyles();
  const { clearance } = useNavInsets();
  const { user } = useAuth();
  const { canEdit } = useAttendanceGate();
  const { isConnected } = useNetworkStatus();
  // Site + date range are picked in the shared Ops header (OpsTabs); this
  // screen only reads them.
  const { sites, selectedSite, loading: sitesLoading } = useSites(
    user?.user_id || user?.id,
  );
  const params = useLocalSearchParams<{
    status?: string | string[];
    incidentId?: string | string[];
    siteCode?: string | string[];
  }>();
  const selectedSiteCode = selectedSite?.site_code || "";
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
  // No Open tab any more (incidents start In progress); a deep link may still
  // ask for Resolved.
  const initialStatus =
    (Array.isArray(params.status) ? params.status[0] : params.status) === "Resolved"
      ? "Resolved"
      : "Inprogress";
  const [statusFilter, setStatusFilter] = useState<IncidentStatus>(initialStatus as IncidentStatus);
  const [searchInput, setSearchInput] = useState("");
  const [sortMode, setSortMode] = useState<"Newest" | "Oldest" | "Status">(
    "Newest",
  );
  const [slide, setSlide] = useState({ seq: 0, dir: 1 });
  const listSlideStyle = useListSlide(slide.seq, slide.dir);
  // The last network refresh failed (cache may still be showing).
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState("");
  // Shared Ops range: inclusive IST calendar dates, filtered against
  // incident_created_time (list, counts, cache read and live stream alike).
  const { from: fromDate, to: toDate, preset: datePreset } = useOpsDateRange();
  const dateRangeLabel = useMemo(
    () => formatDateRange(fromDate, toDate),
    [fromDate, toDate],
  );
  const [creating, setCreating] = useState(false);
  // The Raise FAB first asks: fill in manually, or upload the RCA report.
  const [chooserOpen, setChooserOpen] = useState(false);
  const [rcaImportOpen, setRcaImportOpen] = useState(false);
  // New key per open → the import screen always starts fresh.
  const [rcaImportSession, setRcaImportSession] = useState(0);
  const [selectedIncident, setSelectedIncident] = useState<IncidentItem | null>(null);
  const [incidentModalVisible, setIncidentModalVisible] = useState(false);
  const [nextStatus, setNextStatus] = useState<"Inprogress" | "Resolved" | null>(null);
  const [updateRemarks, setUpdateRemarks] = useState("");
  const [isUpdatingIncident, setIsUpdatingIncident] = useState(false);
  const [detailPendingAttachments, setDetailPendingAttachments] = useState<string[]>([]);
  const [detailPendingRcaAttachments, setDetailPendingRcaAttachments] = useState<string[]>([]);
  const [detailRespondedAt, setDetailRespondedAt] = useState<Date | null>(null);
  const [detailCreatedAt, setDetailCreatedAt] = useState<Date | null>(null);
  const [detailResolvedAt, setDetailResolvedAt] = useState<Date | null>(null);
  const [detailAssignedTo, setDetailAssignedTo] = useState("");
  const [siteUserOptions, setSiteUserOptions] = useState<SelectOption[]>([]);
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
    raised_by: "",
    assigned_to: "",
    client_request_id: uuidv4(),
  }));

  const siteOptions = useMemo<SelectOption[]>(
    () =>
      sites.map((s) => ({
        value: s.site_code || "",
        label: s.site_name || s.site_code || "",
        description: s.site_code || "",
      })),
    [sites],
  );

  const fetchGenRef = useRef(0);
  const detailBaselineRef = useRef<{
    nextStatus: "Inprogress" | "Resolved" | null;
    remarks: string;
    created: number;
    responded: number;
    resolved: number;
    assigned: string;
  } | null>(null);
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
      if (statusFilter && statusFilter !== "All") {
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
          status: statusFilter === "All" ? undefined : statusFilter,
          search,
          fromDate,
          toDate,
        }),
        IncidentsService.getStats(selectedSiteCode, { search, fromDate, toDate }),
      ]);

      if (requestGen !== fetchGenRef.current) return;

      if (listRes?.success) {
        setIncidents((listRes.data || []) as IncidentItem[]);
      }
      if (statsRes?.success) {
        setStats(statsRes.data?.byStatus || statsRes.data || {});
      }
      setLoadFailed(!listRes?.success);
    } catch (e) {
      console.warn("Incidents background fetch failed", e);
      if (requestGen === fetchGenRef.current) setLoadFailed(true);
    } finally {
      setLoading(false);
      setIsSwitchingFilters(false);
      setRefreshing(false);
    }
  }, [selectedSiteCode, statusFilter, search, fromDate, toDate]);

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

  useEffect(() => {
    void fetchData("filter");
  }, [fetchData]);

  useAutoSync(() => fetchData("background"), [selectedSiteCode]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData("refresh");
  }, [fetchData]);

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
      raised_by: "",
      // Everyone picks the assignee — no default, so it's a deliberate choice.
      assigned_to: "",
      // Fresh key per new draft so distinct incidents don't share one.
      client_request_id: uuidv4(),
    });
    setAssetSearchQuery("");
  }, [selectedSiteCode]);

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

  /** The attachment control drives `form.attachments` through a plain state setter. */
  const setFormAttachments = useCallback<React.Dispatch<React.SetStateAction<string[]>>>(
    (update) =>
      setForm((prev) => ({
        ...prev,
        attachments: typeof update === "function" ? update(prev.attachments) : update,
      })),
    [],
  );

  const onCreateIncident = async () => {
    if (!form.site_code) return Alert.alert("Required", "Please select site.");
    if (!form.asset_location) return Alert.alert("Required", "Please select asset.");
    if (!form.fault_symptom.trim()) return Alert.alert("Required", "Incident name is required.");
    if (!form.assigned_to) {
      return Alert.alert("Required", "Please choose who the incident is assigned to.");
    }
    if (!form.fault_type) return Alert.alert("Required", "Please select fault type.");
    if (!form.severity) return Alert.alert("Required", "Please select severity.");
    if (!form.operating_condition) return Alert.alert("Required", "Please select operating condition.");
    if (!form.immediate_action_taken.trim()) {
      return Alert.alert("Required", "Please describe the immediate action taken.");
    }
    if (form.incident_created_time.getTime() > Date.now()) {
      return Alert.alert("Invalid time", "Incident created time cannot be in the future.");
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
    const payload = {
      ...form,
      source: "Incident",
      site_code: form.site_code,
      // Free text now; created_by is stamped server-side from the token.
      raised_by: form.raised_by.trim(),
      incident_created_time: new Date().toISOString(),
      // Incidents start In progress — there is no Open step. The backend
      // stamps the responded time from the created time.
      status: "Inprogress",
      rca_status: "Open",
      assigned_to: form.assigned_to,
      attachments: uploadedAttachments,
      ...(canEditMeta ? { incident_created_time: form.incident_created_time.toISOString() } : {}),
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

  const onPickRaise = useCallback(
    (choice: RaiseChoice) => {
      setChooserOpen(false);
      // Wait for the sheet to fade out before the full-screen modal slides in
      // (two modals presenting at once drops the second on iOS).
      setTimeout(() => {
        if (choice === "manual") {
          resetCreateForm();
          setCreating(true);
        } else {
          setRcaImportSession((n) => n + 1);
          setRcaImportOpen(true);
        }
      }, 250);
    },
    [resetCreateForm],
  );

  const openIncidentModal = useCallback((item: IncidentItem) => {
    const nextStatusInit = item.status === "Resolved" ? null : "Resolved";
    const createdInit = item.incident_created_time ? new Date(item.incident_created_time as any) : new Date();
    const respondedInit = item.incident_updated_time ? new Date(item.incident_updated_time as any) : new Date();
    const resolvedInit = item.incident_resolved_time ? new Date(item.incident_resolved_time as any) : new Date();
    const assignedInit = parseAssignedTo(item.assigned_to).firstValue;
    // What the form started from — a live update only refreshes the open
    // detail while nothing differs from this (no unsaved edits).
    detailBaselineRef.current = {
      nextStatus: nextStatusInit,
      remarks: String(item.remarks || ""),
      created: createdInit.getTime(),
      responded: respondedInit.getTime(),
      resolved: resolvedInit.getTime(),
      assigned: assignedInit,
    };
    setSelectedIncident(item);
    // Anything not yet resolved (incl. a legacy Open row) can only move to Resolved.
    setNextStatus(nextStatusInit);
    setUpdateRemarks(String(item.remarks || ""));
    setDetailPendingAttachments([]);
    setDetailPendingRcaAttachments([]);
    setDetailCreatedAt(createdInit);
    setDetailRespondedAt(respondedInit);
    setDetailResolvedAt(resolvedInit);
    setDetailAssignedTo(assignedInit);
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
      Alert.alert("Required", "Resolution remarks are required to resolve the incident.");
      return;
    }
    if (nextStatus === "Resolved" && detailPendingAttachments.length === 0) {
      Alert.alert("Required", "Attach at least one photo to complete the incident.");
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

    // RCA is manageable from Resolved onward — including after it has been
    // filed, so a submission can still be corrected or withdrawn. Role
    // permission (canEditRca) still applies on top of that.
    const canManageRca =
      canEditRca &&
      (selectedIncident.status === "Resolved" ||
        selectedIncident.status === "RCA Submitted");
    const hasStatusChange = Boolean(nextStatus);
    // The RCA is now just an attachment list: there is no status or checker to
    // edit, so the only RCA change is new files.
    const hasRcaChange = canManageRca && detailPendingRcaAttachments.length > 0;
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
      // Completing carries its photos in the status PATCH itself (the backend
      // refuses a completion without one). Offline, the local file:// URIs are
      // queued and SyncEngine uploads them before replaying the PATCH.
      let completionPhotos: string[] = [];
      if (nextStatus === "Resolved") {
        try {
          completionPhotos = await uploadUrisToStorage(
            detailPendingAttachments,
            selectedIncident.site_code,
            "incident",
          );
        } catch (error: any) {
          Alert.alert("Upload failed", error?.message || "Could not upload the completion photos.");
          setIsUpdatingIncident(false);
          return;
        }
      }

      if (nextStatus) {
        const statusRes = await IncidentsService.updateStatus(
          selectedIncident.id,
          {
            status: nextStatus,
            remarks: nextStatus === "Resolved" ? updateRemarks.trim() : undefined,
            ...(nextStatus === "Resolved"
              ? { attachments: completionPhotos, site_code: selectedIncident.site_code }
              : {}),
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
        // Send ONLY the new urls: the server appends to `rca_attachments`, so the
        // merged list this used to send duplicated every file already filed.
        // Attaching the RCA is what files it, so the status moves to submitted.
        const rcaRes = await IncidentsService.updateRcaStatus(selectedIncident.id, {
          rca_status: "RCA Submitted",
          rca_attachments: uploadedRca,
        });
        if (!rcaRes?.success && !rcaRes?.queued) {
          Alert.alert("Error", rcaRes?.error || "Failed to update RCA status");
          setIsUpdatingIncident(false);
          return;
        }
      }

      // Completion photos already went with the status PATCH above.
      if (detailPendingAttachments.length > 0 && nextStatus !== "Resolved") {
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
          localUpdate.attachments = JSON.stringify([
            ...parseIncidentAttachments(selectedIncident.attachments),
            ...completionPhotos,
          ]);
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
    detailPendingAttachments,
    detailPendingRcaAttachments,
    detailCreatedAt,
    detailAssignedTo,
    detailRespondedAt,
    detailResolvedAt,
    canEditMeta,
    statusFilter,
    fetchData,
    uploadUrisToStorage,
  ]);

  /* ── Live updates (incidents_changed) ──────────────────────────────────
     Same pattern as the Tickets tab: connect while this tab is focused,
     de-dupe by event id, leave rows with queued offline edits alone,
     re-fetch changed rows and merge them filter-aware. A bulk event (or a
     reconnect after a drop) silently reloads the list + stats. */
  const liveFiltersRef = useRef({
    siteCode: selectedSiteCode,
    status: statusFilter,
    search,
    fromDate,
    toDate,
  });
  useEffect(() => {
    liveFiltersRef.current = { siteCode: selectedSiteCode, status: statusFilter, search, fromDate, toDate };
  }, [selectedSiteCode, statusFilter, search, fromDate, toDate]);

  const liveDetailRef = useRef({
    visible: false,
    incident: null as IncidentItem | null,
    dirty: false,
  });
  useEffect(() => {
    const base = detailBaselineRef.current;
    const dirty =
      isUpdatingIncident ||
      detailPendingAttachments.length > 0 ||
      detailPendingRcaAttachments.length > 0 ||
      !base ||
      base.nextStatus !== nextStatus ||
      base.remarks !== updateRemarks ||
      base.assigned !== detailAssignedTo ||
      base.created !== (detailCreatedAt?.getTime() ?? base.created) ||
      base.responded !== (detailRespondedAt?.getTime() ?? base.responded) ||
      base.resolved !== (detailResolvedAt?.getTime() ?? base.resolved);
    liveDetailRef.current = { visible: incidentModalVisible, incident: selectedIncident, dirty };
  }, [
    incidentModalVisible,
    selectedIncident,
    isUpdatingIncident,
    detailPendingAttachments,
    detailPendingRcaAttachments,
    nextStatus,
    updateRemarks,
    detailAssignedTo,
    detailCreatedAt,
    detailRespondedAt,
    detailResolvedAt,
  ]);

  const liveDedupeRef = useRef(makeEventDeduper());
  const liveStatsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveBulkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (liveStatsTimerRef.current) clearTimeout(liveStatsTimerRef.current);
      if (liveBulkTimerRef.current) clearTimeout(liveBulkTimerRef.current);
    },
    [],
  );

  const matchesLiveFilters = useCallback((i: IncidentItem) => {
    const f = liveFiltersRef.current;
    if (i.site_code !== f.siteCode) return false;
    if (f.status !== "All" && i.status !== f.status) return false;
    const raw = i.incident_created_time;
    const at = raw == null ? NaN : typeof raw === "number" ? raw : Date.parse(String(raw));
    if (!Number.isNaN(at)) {
      const fromMs = istDayStartMsFromYmd(f.fromDate);
      const toMs = istDayEndMsFromYmd(f.toDate);
      if (fromMs != null && at < fromMs) return false;
      if (toMs != null && at > toMs) return false;
    }
    const needle = f.search.trim().toLowerCase();
    if (needle) {
      const hay = `${i.incident_id} ${i.fault_symptom} ${i.asset_location || ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  }, []);

  const mergeLiveIncident = useCallback(
    (incoming: IncidentItem) => {
      setIncidents((prev) => {
        const idx = prev.findIndex((i) => i.id === incoming.id);
        const show = matchesLiveFilters(incoming);
        if (idx === -1) return show ? [incoming, ...prev] : prev;
        if (!show) return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
        const existing = prev[idx]!;
        const was = Date.parse(String((existing as any).updated_at ?? ""));
        const now = Date.parse(String((incoming as any).updated_at ?? ""));
        if (!Number.isNaN(was) && !Number.isNaN(now) && now < was) return prev;
        const next = [...prev];
        next[idx] = { ...existing, ...incoming };
        return next;
      });
    },
    [matchesLiveFilters],
  );

  const refreshStatsSoon = useCallback(() => {
    if (liveStatsTimerRef.current) clearTimeout(liveStatsTimerRef.current);
    liveStatsTimerRef.current = setTimeout(async () => {
      const f = liveFiltersRef.current;
      if (!f.siteCode) return;
      const res = await IncidentsService.getStats(f.siteCode, {
        search: f.search,
        fromDate: f.fromDate,
        toDate: f.toDate,
      }).catch(() => null);
      const cur = liveFiltersRef.current;
      if (res?.success && cur.siteCode === f.siteCode && cur.search === f.search) {
        setStats(res.data?.byStatus || res.data || {});
      }
    }, 300);
  }, []);

  /** Bulk change / missed events: reload list + stats without a skeleton. */
  const silentRefreshSoon = useCallback(() => {
    if (liveBulkTimerRef.current) clearTimeout(liveBulkTimerRef.current);
    liveBulkTimerRef.current = setTimeout(async () => {
      const f = liveFiltersRef.current;
      if (!f.siteCode) return;
      // A filter change meanwhile starts its own fetch — this one then loses.
      const gen = fetchGenRef.current;
      try {
        const [listRes, statsRes] = await Promise.all([
          IncidentsService.getIncidents(f.siteCode, {
            status: f.status === "All" ? undefined : f.status,
            search: f.search,
            fromDate: f.fromDate,
            toDate: f.toDate,
          }),
          IncidentsService.getStats(f.siteCode, {
            search: f.search,
            fromDate: f.fromDate,
            toDate: f.toDate,
          }),
        ]);
        if (gen !== fetchGenRef.current) return;
        if (listRes?.success) setIncidents((listRes.data || []) as IncidentItem[]);
        if (statsRes?.success) setStats(statsRes.data?.byStatus || statsRes.data || {});
      } catch {
        // best-effort
      }
    }, 800);
  }, []);

  const handleLiveIncidentEvent = useCallback(
    async (event: ChangeFeedEvent) => {
      const f = liveFiltersRef.current;
      if (!f.siteCode) return;
      if (event.site_code !== "*" && event.site_code !== f.siteCode) return;
      if (!liveDedupeRef.current(event.event_id)) return;

      if (event.bulk || event.ids.length === 0) {
        silentRefreshSoon();
        return;
      }

      // Rows with queued offline edits keep their optimistic local state.
      const pendingTypes = [
        "incident_update",
        "incident_status_update",
        "incident_rca_status_update",
        "incident_attachment_add",
      ] as const;
      const pendingIds = new Set<string>();
      for (const type of pendingTypes) {
        const rows = await cacheManager.getPendingQueueItemsByType(type);
        rows.forEach((row) => {
          const id = String(row.payload?.id || "");
          if (id) pendingIds.add(id);
        });
      }

      for (const id of event.ids) {
        if (pendingIds.has(id)) continue;
        const res = await IncidentsService.refreshIncidentFromServer(id);
        const detail = liveDetailRef.current;
        const detailOnThis = detail.visible && detail.incident?.id === id && !detail.dirty;
        if (res.status === "deleted") {
          setIncidents((prev) => prev.filter((i) => i.id !== id));
          if (detailOnThis) {
            setIncidentModalVisible(false);
            setSelectedIncident(null);
          }
        } else if (res.status === "ok") {
          const fresh = res.data as IncidentItem;
          mergeLiveIncident(fresh);
          // Refresh the open detail only while it holds no unsaved edits.
          if (detailOnThis) openIncidentModal(fresh);
        }
      }
      refreshStatsSoon();
    },
    [mergeLiveIncident, openIncidentModal, refreshStatsSoon, silentRefreshSoon],
  );

  const liveHandlerRef = useRef(handleLiveIncidentEvent);
  useEffect(() => {
    liveHandlerRef.current = handleLiveIncidentEvent;
  }, [handleLiveIncidentEvent]);

  useFocusEffect(
    useCallback(() => {
      if (!selectedSiteCode || !incidentsRealtimeService.isEnabled()) {
        return () => {};
      }
      // Defer the stream setup past the tab-switch transition (as Tickets does).
      const handle = InteractionManager.runAfterInteractions(() => {
        void incidentsRealtimeService.connect({
          siteCode: selectedSiteCode,
          onEvent: (e) => liveHandlerRef.current(e),
          onResync: silentRefreshSoon,
        });
      });
      return () => {
        handle.cancel?.();
        incidentsRealtimeService.disconnect();
      };
    }, [selectedSiteCode, silentRefreshSoon]),
  );

  // Debounce the header search into the fetch key.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const renderCard = useCallback(
    ({ item }: { item: IncidentItem }) => (
      <IncidentCard
        item={item as any}
        assignee={parseAssignedTo(item.assigned_to).display}
        onPress={() => openIncidentModal(item)}
        // Only the mixed All list needs it — see the prop's note.
        showRcaPending={statusFilter === "All"}
      />
    ),
    [openIncidentModal, statusFilter],
  );

  const statusChips = useMemo<{ key: string; label: string; count?: number }[]>(() => {
    const total =
      (stats.Open || 0) +
      (stats.Inprogress || 0) +
      (stats.Resolved || 0) +
      (stats["RCA Submitted"] || 0);
    return [
      { key: "All", label: "All", count: total || undefined },
      { key: "Inprogress", label: "In progress", count: stats.Inprogress },
      { key: "Resolved", label: "Resolved", count: stats.Resolved },
      { key: "RCA Submitted", label: "RCA Submitted", count: stats["RCA Submitted"] },
    ];
  }, [stats]);

  const STATUS_RANK: Record<string, number> = {
    Open: 1,
    Inprogress: 2,
    Resolved: 3,
    "RCA Submitted": 4,
  };

  const sortedIncidents = useMemo(() => {
    const rows = [...incidents];
    const at = (v: IncidentItem["incident_created_time"]) =>
      v == null ? 0 : typeof v === "number" ? v : Date.parse(String(v)) || 0;
    if (sortMode === "Status") {
      rows.sort((a, b) => {
        const ra = STATUS_RANK[a.status] ?? 9;
        const rb = STATUS_RANK[b.status] ?? 9;
        return ra !== rb ? ra - rb : at(b.incident_created_time) - at(a.incident_created_time);
      });
      return rows;
    }
    rows.sort((a, b) =>
      sortMode === "Oldest"
        ? at(a.incident_created_time) - at(b.incident_created_time)
        : at(b.incident_created_time) - at(a.incident_created_time),
    );
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents, sortMode]);

  // The list is server-filtered and page-capped, so the stat count is the
  // better number for the active tab — but never let it claim rows the list
  // isn't showing: an empty list must read as 0.
  const visibleCount = useMemo(() => {
    if (sortedIncidents.length === 0) {
      return sortedIncidents.length;
    }
    if (statusFilter === "All") {
      const total =
        (stats.Open || 0) +
        (stats.Inprogress || 0) +
        (stats.Resolved || 0) +
        (stats["RCA Submitted"] || 0);
      return total || sortedIncidents.length;
    }
    return stats[statusFilter] ?? sortedIncidents.length;
  }, [stats, statusFilter, sortedIncidents.length]);

  const countLabel = useMemo(() => {
    if (isSwitchingFilters) return "updating…";
    if (statusFilter === "All") return "incidents at this site";
    const label =
      statusChips.find((c) => c.key === statusFilter)?.label ?? statusFilter;
    return `${label.toLowerCase()} incidents`;
  }, [statusFilter, statusChips, isSwitchingFilters]);

  const selectStatusChip = useCallback(
    (key: string) => {
      if (key === statusFilter) return;
      const order = statusChips.map((c) => c.key);
      const dir = order.indexOf(key) >= order.indexOf(statusFilter) ? 1 : -1;
      setSlide((prev) => ({ seq: prev.seq + 1, dir }));
      setStatusFilter(key as IncidentStatus);
    },
    [statusFilter, statusChips],
  );

  const cycleSort = useCallback(() => {
    setSortMode((m) =>
      m === "Newest" ? "Oldest" : m === "Oldest" ? "Status" : "Newest",
    );
  }, []);


  // The Ops header's default range is "This month".
  const isDefaultRange = datePreset === "month";
  const rcaOwed = stats.Resolved || 0;
  const noSiteMapped = isConnected && !sitesLoading && sites.length === 0;

  const closeCreate = useCallback(() => {
    setCreating(false);
    resetCreateForm();
  }, [resetCreateForm]);

  const listEmpty = loading ? (
    <View style={{ gap: 8 }}>
      {[0, 1, 2, 3].map((i) => (
        <Shimmer key={i} height={132} radius={22} />
      ))}
    </View>
  ) : noSiteMapped ? (
    <EmptyState icon="bx-buildings" title="No site is mapped to you yet" sub="Ask an admin to add you to a site to see its incidents." />
  ) : loadFailed && isConnected !== false ? (
    <EmptyState
      icon="bx-error-circle"
      title="Couldn't load incidents"
      sub="Check your connection and try again."
      action={{ label: "Try again", onPress: () => void onRefresh() }}
    />
  ) : (
    <EmptyState
      icon="bx-search-alt"
      title="No incidents match this filter"
      sub={
        search
          ? `Nothing here matches “${search}”.`
          : `Nothing ${statusFilter === "All" ? "" : `${(statusChips.find((c) => c.key === statusFilter)?.label ?? statusFilter).toLowerCase()} `}raised ${isDefaultRange ? "this month" : `in ${dateRangeLabel}`}.`
      }
      action={
        statusFilter !== "All" || search || !isDefaultRange
          ? {
              label: "Show all",
              onPress: () => {
                setSearchInput("");
                setSearch("");
                // The range is shared by every Ops tab — this resets it there too.
                setOpsDateRange(rangeForPreset("month"));
                selectStatusChip("All");
              },
            }
          : undefined
      }
    />
  );

  return (
    <JoPage>
      {/* Ops sub-tabs: Tickets · PM · Site Logs · Incidents · Assets */}
      <OpsTabs />
      <View style={s.top}>
        <SearchField
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search ID, asset or fault"
        />

        {rcaOwed > 0 && statusFilter !== "Resolved" ? (
          <TouchableOpacity
            style={s.banner}
            onPress={() => selectStatusChip("Resolved")}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${rcaOwed} resolved incident${rcaOwed === 1 ? "" : "s"} waiting on an RCA. Open`}
          >
            <View style={s.bannerIcon}>
              <Bx name="bx-search-alt" size={17} color={t.bad} />
            </View>
            <Text style={s.bannerText}>
              {rcaOwed} incident{rcaOwed === 1 ? "" : "s"} waiting on an RCA{roleAllowsRca ? " from you" : ""}
            </Text>
            <View style={s.bannerBtn}>
              <Text style={s.bannerBtnText}>Open</Text>
            </View>
          </TouchableOpacity>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 12, marginHorizontal: -16 }}
          contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}
        >
          {statusChips.map((c) => (
            <IncChip
              key={c.key}
              label={c.label}
              count={c.count ?? 0}
              selected={statusFilter === c.key}
              onPress={() => selectStatusChip(c.key)}
            />
          ))}
        </ScrollView>

        {isConnected === false ? (
          <Notice icon="bx-wifi-off" tone="warn" style={{ marginTop: 10 }}>
            Offline · showing incidents saved on this phone. Changes sync when you&apos;re back online.
          </Notice>
        ) : loadFailed && incidents.length > 0 ? (
          <Notice icon="bx-error-circle" tone="warn" style={{ marginTop: 10 }}>
            Couldn&apos;t refresh. Showing the last saved list — pull down to retry.
          </Notice>
        ) : null}
        {!canEdit ? (
          <Notice icon="bx-lock-alt" tone="mute" style={{ marginTop: 10 }}>
            View only — punch in to raise or update incidents.
          </Notice>
        ) : null}

        <View style={s.countRow}>
          <Text style={s.countText} numberOfLines={1}>
            <Text style={s.countNum}>{visibleCount}</Text> {countLabel}
            <Text style={{ color: t.faint }}> · {isDefaultRange ? "this month" : dateRangeLabel}</Text>
          </Text>
          <TouchableOpacity
            onPress={cycleSort}
            hitSlop={8}
            style={s.sortBtn}
            accessibilityRole="button"
            accessibilityLabel={`Sort: ${sortMode}. Change`}
          >
            <Bx name="bx-sort-alt-2" size={15} color={t.muted} />
            <Text style={s.sortText}>{sortMode}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <SwipeTabs
        keys={statusChips.map((c) => c.key)}
        active={statusFilter}
        onSelect={selectStatusChip}
        style={[{ flex: 1 }, listSlideStyle]}
      >
        <FlashList
          data={sortedIncidents}
          renderItem={renderCard}
          keyExtractor={(item) => item.id}
          // Uniform-height cards (single recycle pool) + wider draw distance so
          // fast flings don't reveal blank space. See PM list for the same config.
          drawDistance={600}
          ListEmptyComponent={listEmpty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} colors={[t.accent]} />
          }
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: clearance + (canEdit ? 64 : 0) }}
        />
      </SwipeTabs>

      {canEdit ? (
        <Fab
          label="Raise"
          icon="bx-plus"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            setChooserOpen(true);
          }}
        />
      ) : null}

      <RaiseIncidentChooser
        visible={chooserOpen}
        offline={isConnected === false}
        onClose={() => setChooserOpen(false)}
        onPick={onPickRaise}
      />

      <RcaImportModal
        key={rcaImportSession}
        visible={rcaImportOpen}
        defaultSiteCode={selectedSiteCode}
        siteOptions={siteOptions}
        isConnected={isConnected}
        onClose={() => setRcaImportOpen(false)}
        onCreated={() => {
          void fetchData("refresh");
        }}
        onViewIncident={(incident) => {
          // Let the import screen finish closing first — iOS drops a modal
          // presented while another is still dismissing.
          setTimeout(() => openIncidentModal(incident as IncidentItem), 450);
        }}
      />

      <IncidentCreateSheet
        visible={creating}
        onCancel={closeCreate}
        form={form}
        setForm={setForm}
        setAttachments={setFormAttachments}
        siteOptions={siteOptions}
        assetOptions={assetOptions}
        assetsLoading={assetsLoading}
        assetSearch={assetSearchQuery}
        onAssetSearch={setAssetSearchQuery}
        assigneeOptions={siteUserOptions}
        faultTypes={FAULT_TYPE_OPTIONS}
        severities={SEVERITY_OPTIONS}
        operatingConditions={OPERATING_CONDITION_OPTIONS}
        canEditMeta={canEditMeta}
        offline={isConnected === false}
        submitting={submitting}
        onSubmit={onCreateIncident}
      />

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
        canEditRca={
          canEditRca &&
          (selectedIncident?.status === "Resolved" ||
            selectedIncident?.status === "RCA Submitted")
        }
        nextStatus={nextStatus}
        setNextStatus={setNextStatus}
        remarks={updateRemarks}
        setRemarks={setUpdateRemarks}
        isUpdating={isUpdatingIncident}
        onSubmit={handleIncidentUpdate}
        existingAttachmentUrls={selectedIncident ? parseIncidentAttachments(selectedIncident.attachments) : []}
        pendingAttachments={detailPendingAttachments}
        setPendingAttachments={setDetailPendingAttachments}
        existingRcaAttachmentUrls={selectedIncident ? parseIncidentAttachments(selectedIncident.rca_attachments) : []}
        pendingRcaAttachments={detailPendingRcaAttachments}
        setPendingRcaAttachments={setDetailPendingRcaAttachments}
      />
    </JoPage>
  );
}

/** Artboard r_incidents under the shared Ops header: search, RCA-due banner, chips, count line. */
const useStyles = makeJoStyles((t) => ({
  top: { paddingHorizontal: 16, paddingTop: 12 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: t.badWash,
    borderWidth: 1,
    borderColor: t.badBorder,
  },
  bannerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: t.badTint,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerText: { ...f.t(13, 500), flex: 1, lineHeight: 17.5, color: t.ink },
  bannerBtn: { height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: t.bad, justifyContent: "center" },
  bannerBtnText: { ...f.t(12, 700), color: t.onAccent },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 14,
    paddingHorizontal: 4,
    paddingBottom: 10,
  },
  countText: { ...f.t(13), color: t.muted, flexShrink: 1 },
  countNum: { ...f.t(13, 600), color: t.ink },
  sortBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  sortText: { ...f.t(12.5, 500), color: t.muted },
}));
