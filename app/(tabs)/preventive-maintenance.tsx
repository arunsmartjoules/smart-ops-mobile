/**
 * Preventive maintenance list — artboard "JouleOps App" `r_pm`
 * (app.dc.html 625–663; chip/row rules in v5Vals pmChips/pmRows, PM_ST).
 *
 * Data flow is unchanged from the previous screen: local SQLite first with
 * queued offline updates overlaid, a background API pull + window reconcile
 * when online, server stats for the counts, live pm_changed events while
 * focused, and the before-photo Start sheet that moves a PM to In-progress.
 */
import { OpsTabs } from "@/components/jo/OpsTabs";
import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useDeferredValue,
} from "react";
import {
  View,
  Text,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Alert,
  InteractionManager,
} from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import { router, useFocusEffect } from "expo-router";
import PMItem, { type PMRow } from "@/components/PMItem";
import { pmStatusKey, type PmStatusKey } from "@/components/pm/PMUI";
import { PMListHeader, type PMChip } from "@/components/pm/PMListHeader";
import { PMStartSheet } from "@/components/pm/PMStartSheet";
import {
  useListSlide,
  SwipeTabsView,
} from "@/components/shared/ListChrome";
import {
  EmptyState,
  JoPage,
  JoSheet,
  PrimaryButton,
  SheetOption,
  Shimmer,
  f,
  makeJoStyles,
  useJoTheme,
} from "@/components/jo/ui";
import { useNavInsets } from "@/components/jo/navInsets";
import { useAuth } from "@/contexts/AuthContext";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import PMService from "@/services/PMService";
import {
  makeEventDeduper,
  pmRealtimeService,
  type ChangeFeedEvent,
} from "@/services/RealtimeStreamClient";
import { useAutoSync } from "@/hooks/useAutoSync";
import { useSites } from "@/hooks/useSites";
import { pmInstances } from "@/database";
import {
  istDateString,
  istParts,
  istDayStartMs,
  istDayStartMsFromYmd,
  istDayEndMsFromYmd,
  formatIST,
} from "@/utils/istDate";
import {
  rangeForPreset,
  setOpsDateRange,
  useOpsDateRange,
} from "@/services/OpsDateRange";
import QRScannerModal, { type QRScannerRef } from "@/components/QRScannerModal";
import logger from "@/utils/logger";

type PMInstanceRow = typeof pmInstances.$inferSelect;

/**
 * Chip keys. "Due" is the actionable work queue: it merges the artboard's
 * Overdue + Due states, so it is the default view. "All" is last and is the
 * only chip that also shows Skipped PMs.
 */
type PmChipKey = "Due" | "In progress" | "Completed" | "All";

const CHIP_ORDER: PmChipKey[] = ["Due", "In progress", "Completed", "All"];

// The shared Ops date range can target either the due date (default) or the
// completed date — the filter sheet exposes this as a selector.
type PmDateField = "due_date" | "completed_date";
const PM_DATE_FIELD_OPTIONS: { value: PmDateField; label: string }[] = [
  { value: "due_date", label: "Due date" },
  { value: "completed_date", label: "Completed date" },
];

const STATUS_RANK: Record<PmStatusKey, number> = {
  Overdue: 1,
  Due: 2,
  "In progress": 3,
  Completed: 4,
  Skipped: 5,
};

const useStyles = makeJoStyles((t) => ({
  list: { paddingHorizontal: 16 },
  skeleton: { paddingHorizontal: 16, gap: 8 },
  pad: { paddingHorizontal: 16 },
  footerLoader: { paddingVertical: 20, alignItems: "center" },
  sheetCaption: { ...f.t(12, 600), color: t.muted, marginTop: 16, marginBottom: 8 },
  sheetGroup: { gap: 6 },
}));

// Fills the list area so a slow cold load reads as "loading", sized like the
// PM card (head · title · meta · footer) so the handoff doesn't jump.
const PMSkeleton = () => {
  const s = useStyles();
  return (
    <View style={s.skeleton}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Shimmer key={i} height={128} radius={22} />
      ))}
    </View>
  );
};

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function PreventiveMaintenance() {
  const t = useJoTheme();
  const s = useStyles();
  const { clearance } = useNavInsets();
  const { user } = useAuth();
  const { canEdit } = useAttendanceGate();
  const { isConnected } = useNetworkStatus();

  const [allInstances, setAllInstances] = useState<PMInstanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Pre-execution Start modal: capture the before-image, stamp the start
  // time, then move to the execution screen.
  const [startModalInstance, setStartModalInstance] =
    useState<PMInstanceRow | null>(null);
  const [startBeforeImage, setStartBeforeImage] = useState<string>("");
  const [starting, setStarting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<PmChipKey>("Due");
  const [sortMode, setSortMode] = useState<"Due date" | "Status">("Due date");
  const [slide, setSlide] = useState({ seq: 0, dir: 1 });
  const listSlideStyle = useListSlide(slide.seq, slide.dir);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [serverStats, setServerStats] = useState<any>(null);

  // Safety net: never let the skeleton outlive a slow/stalled fetch.
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 6000);
    return () => clearTimeout(t);
  }, []);

  // Pagination State
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 200;

  // ── Clean sites hook ──────────────────────────────────────────────────────
  const userId = user?.user_id || user?.id;
  // The site is picked in the shared Ops header; this only reads it.
  const { sites, selectedSite, loading: sitesLoading } = useSites(userId);
  const siteCode = selectedSite?.site_code ?? "";

  // The shared Ops date range (header above the sub-tabs), inclusive IST
  // calendar dates "YYYY-MM-DD", default this month (1st → last day). Kept
  // under the old window names: the stats call, the API pull, the window
  // reconcile and the local filter below all read these unchanged, and a new
  // range re-runs loadPMData exactly as the old local window did.
  const { from: currentDate, to: toDate } = useOpsDateRange();

  const [searchQuery, setSearchQuery] = useState("");
  // Deferred copy for the expensive per-row filter below. The TextInput stays
  // bound to searchQuery (instant echo), but filteredInstances — which runs an
  // O(n) toLowerCase + IST date-format sweep over every cached PM per keystroke
  // — reads the deferred value, so typing no longer stutters on mid-range
  // Android with a few hundred instances cached.
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Which date column the shared range applies to.
  const [dateField, setDateField] = useState<PmDateField>("due_date");

  // QR filter state
  const qrScannerRef = useRef<QRScannerRef>(null);
  const [qrAssetFilter, setQrAssetFilter] = useState<string | null>(null);

  // Guard against re-fetching while server pull is in progress
  const isFetchingRef = useRef(false);
  const [syncing, setSyncing] = useState(false);

  // Mirror allInstances into a ref so loadPMData can check "do we already
  // have rendered data?" without putting allInstances.length in its deps.
  // Closing over the length there created a re-entry cascade: setAllInstances
  // → length changes → useCallback recomputes → useEffect re-fires →
  // loadPMData(true) again → setAllInstances again → flicker + bouncing
  // counts in the In-progress tab.
  const allInstancesRef = useRef<PMInstanceRow[]>([]);
  useEffect(() => {
    allInstancesRef.current = allInstances;
  }, [allInstances]);

  // ── High-Performance Data Loader ──────────────────────────────────────────
  const loadPMData = useCallback(
    async (isInitial = false, currentOffset = 0, showLoadingSpinner = true) => {
      if (!siteCode || siteCode === "all") return;
      const hasRenderedData = allInstancesRef.current.length > 0;

      // Avoid skeleton flash when data already exists on screen.
      if (isInitial && showLoadingSpinner && !hasRenderedData) {
        setLoading(true);
      }
      if (isInitial) {
        setOffset(0);
        setHasMore(true);
      }

      try {
        // 1. Fetch local cached data
        let local = await PMService.getLocalInstances(siteCode);

        // 2. Fetch pending updates from sync queue to ensure "Self-Healing" UI
        const pendingUpdates = await PMService.getPendingUpdatesMap();
        if (Object.keys(pendingUpdates).length > 0) {
          local = local.map((inst) => {
            const update = pendingUpdates[inst.id];
            if (update) return { ...inst, ...update };
            return inst;
          });
        }

        setAllInstances(local);

        // Fetch Global Stats for the date range
        if (isConnected) {
          PMService.getStats(siteCode, currentDate, toDate)
            .then((data) => {
              if (data) setServerStats(data);
            })
            .catch(() => {});
        }
        setLoading(false);

        // 2. BACKGROUND SYNC: Pull latest from API if online
        // (Now triggered on ANY load from the top, including auto-sync)
        if (isConnected && currentOffset === 0) {
          if (isFetchingRef.current) return;
          isFetchingRef.current = true;

          try {
            const apiData = await PMService.fetchFromAPI(
              siteCode,
              PAGE_SIZE,
              0,
              currentDate,
              toDate,
            );

            // Prune orphaned instances the server no longer has for this window
            // (e.g. a re-imported month gets new ids) so stale rows can't
            // inflate the counts or 404 on completion. Safe: only prunes a
            // provably-complete window and never a row with pending edits.
            await PMService.reconcilePmWindow(siteCode, currentDate, toDate);

            if (apiData && apiData.length > 0) {
              // Refresh local state after sync, re-applying any pending updates
              // so locally-completed PMs aren't overwritten by stale server data.
              let freshLocal = await PMService.getLocalInstances(siteCode);
              const freshPending = await PMService.getPendingUpdatesMap();
              if (Object.keys(freshPending).length > 0) {
                freshLocal = freshLocal.map((inst) => {
                  const upd = freshPending[inst.id];
                  return upd ? { ...inst, ...upd } : inst;
                });
              }
              setAllInstances(freshLocal);
              setHasMore(apiData.length === PAGE_SIZE);
            } else {
              let freshLocal = await PMService.getLocalInstances(siteCode);
              const freshPending = await PMService.getPendingUpdatesMap();
              if (Object.keys(freshPending).length > 0) {
                freshLocal = freshLocal.map((inst) => {
                  const upd = freshPending[inst.id];
                  return upd ? { ...inst, ...upd } : inst;
                });
              }
              setAllInstances(freshLocal);
              setHasMore(false);
            }
          } catch (apiErr) {
            // Silently handle sync errors
          } finally {
            isFetchingRef.current = false;
            setRefreshing(false);
          }
        } else if (!isInitial && currentOffset > 0 && isConnected) {
          // Pagination loading
          setLoadingMore(true);
          try {
            const apiData = await PMService.fetchFromAPI(
              siteCode,
              PAGE_SIZE,
              currentOffset,
              currentDate,
              toDate,
            );
            if (apiData) {
              let freshLocal = await PMService.getLocalInstances(siteCode);
              const freshPending = await PMService.getPendingUpdatesMap();
              if (Object.keys(freshPending).length > 0) {
                freshLocal = freshLocal.map((inst) => {
                  const upd = freshPending[inst.id];
                  return upd ? { ...inst, ...upd } : inst;
                });
              }
              setAllInstances(freshLocal);
              setHasMore(apiData.length === PAGE_SIZE);
            }
          } catch (err) {
            // Silently handle
          } finally {
            setLoadingMore(false);
          }
        }
      } catch (err) {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // PAGE_SIZE is a stable in-component const (200); allInstances.length is
    // tracked via allInstancesRef so it doesn't churn the callback identity.
    [siteCode, currentDate, toDate, isConnected],
  );

  /* ── Live updates (pm_changed) ─────────────────────────────────────────
     Connect while this tab is focused (the checklist screen sits on top of
     it, so a PM being filled in is never touched from here). Changed rows
     are re-read into SQLite — PMService skips any instance with queued
     offline work — and the list re-renders from the cache with pending
     updates overlaid, exactly as loadPMData does. Bulk → silent reload. */
  const liveSiteRef = useRef({ siteCode, currentDate, toDate });
  useEffect(() => {
    liveSiteRef.current = { siteCode, currentDate, toDate };
  }, [siteCode, currentDate, toDate]);
  const loadPMDataRef = useRef(loadPMData);
  useEffect(() => {
    loadPMDataRef.current = loadPMData;
  }, [loadPMData]);

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

  const silentReloadSoon = useCallback(() => {
    if (liveBulkTimerRef.current) clearTimeout(liveBulkTimerRef.current);
    liveBulkTimerRef.current = setTimeout(() => {
      if (liveSiteRef.current.siteCode) void loadPMDataRef.current(true, 0, false);
    }, 800);
  }, []);

  const handleLivePmEvent = useCallback(
    async (event: ChangeFeedEvent) => {
      const site = liveSiteRef.current.siteCode;
      if (!site) return;
      const eventSite = event.site_code.trim().toUpperCase();
      if (eventSite !== "*" && eventSite !== site.trim().toUpperCase()) return;
      if (!liveDedupeRef.current(event.event_id)) return;

      if (event.bulk || event.ids.length === 0) {
        silentReloadSoon();
        return;
      }

      let changed = false;
      for (const id of event.ids) {
        const outcome = await PMService.refreshInstanceFromServer(id);
        if (outcome === "updated" || outcome === "deleted") changed = true;
      }
      if (!changed || liveSiteRef.current.siteCode !== site) return;

      let local = await PMService.getLocalInstances(site);
      const pending = await PMService.getPendingUpdatesMap();
      if (Object.keys(pending).length > 0) {
        local = local.map((inst) => {
          const upd = pending[inst.id];
          return upd ? { ...inst, ...upd } : inst;
        });
      }
      if (liveSiteRef.current.siteCode === site) setAllInstances(local);

      if (liveStatsTimerRef.current) clearTimeout(liveStatsTimerRef.current);
      liveStatsTimerRef.current = setTimeout(() => {
        const f = liveSiteRef.current;
        if (!f.siteCode) return;
        PMService.getStats(f.siteCode, f.currentDate, f.toDate)
          .then((data) => {
            if (data && liveSiteRef.current.siteCode === f.siteCode) setServerStats(data);
          })
          .catch(() => {});
      }, 300);
    },
    [silentReloadSoon],
  );

  useFocusEffect(
    useCallback(() => {
      if (!siteCode || siteCode === "all" || !pmRealtimeService.isEnabled()) {
        return () => {};
      }
      const handle = InteractionManager.runAfterInteractions(() => {
        void pmRealtimeService.connect({
          siteCode,
          onEvent: handleLivePmEvent,
          onResync: silentReloadSoon,
        });
      });
      return () => {
        handle.cancel?.();
        pmRealtimeService.disconnect();
      };
    }, [siteCode, handleLivePmEvent, silentReloadSoon]),
  );

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || isFetchingRef.current || !isConnected)
      return;
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    loadPMData(false, nextOffset);
  }, [hasMore, loadingMore, offset, loadPMData, isConnected]);

  // Reload when site or filters change
  useEffect(() => {
    if (siteCode) {
      loadPMData(true);
    } else {
      setLoading(false);
      setAllInstances([]);
    }
  }, [siteCode, currentDate, toDate, loadPMData]);

  // Auto-sync for PM tasks (Handles Focus, AppState, and 60s Polling)
  useAutoSync(() => {
    if (siteCode) loadPMData(true, 0, false);
  }, [siteCode, currentDate, toDate]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPMData(true, 0, false);
    setRefreshing(false);
  }, [loadPMData]);
  // IST start of today. Re-derived whenever the data reloads (focus, the 60s
  // auto-sync, live events), so a list left open overnight re-classifies
  // Due → Overdue on the next refresh rather than needing a remount.
  const todayStartMs = useMemo(
    () => istDayStartMs(new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allInstances],
  );

  const filteredInstances = useMemo(() => {
    let list = [...allInstances];

    // 1. Apply Status Filter. "Overdue" is derived (not-started + due before
    //    today, IST), not stored; the "Due" chip covers Overdue and Due.
    if (statusFilter !== "All") {
      list = list.filter((i) => {
        const k = pmStatusKey(i.status, i.start_due_date, todayStartMs);
        return statusFilter === "Due"
          ? k === "Overdue" || k === "Due"
          : k === statusFilter;
      });
    }

    // 2. Apply Search or QR Filter
    if (qrAssetFilter) {
      list = list.filter((i) => i.asset_id === qrAssetFilter);
    } else if (deferredSearchQuery) {
      const q = deferredSearchQuery.toLowerCase();
      list = list.filter((i) => {
        const dateObj = i.start_due_date ? new Date(i.start_due_date) : null;
        const dueDateStr = dateObj
          ? formatIST(dateObj, { day: "numeric", month: "short", year: "numeric" })
          : "";
        const dueDateISO = dateObj ? istDateString(dateObj) : "";
        const dueDateShort = dateObj
          ? (() => {
              const p = istParts(dateObj);
              return `${p.day}/${p.month}`;
            })()
          : "";

        return (
          (i.title && i.title.toLowerCase().includes(q)) ||
          (i.asset_id && i.asset_id.toLowerCase().includes(q)) ||
          (i.asset_type && i.asset_type.toLowerCase().includes(q)) ||
          // The placeholder has always promised "area"; the card now shows it.
          (i.location && i.location.toLowerCase().includes(q)) ||
          (dueDateStr && dueDateStr.toLowerCase().includes(q)) ||
          (dueDateISO && dueDateISO.includes(q)) ||
          (dueDateShort && dueDateShort.includes(q))
        );
      });
      // Fall through to the date-range filter below: a text search narrows
      // the list but must still stay inside the selected window, so the
      // list matches the (date-windowed) counts. Users reported May PMs
      // surfacing under a July filter when search returned early here and
      // skipped the date predicate entirely.
    }

    // 3. Apply Date Filter. Runs for every mode — normal browsing, text
    //    search, and QR asset scan (QR resets the window to the current month
    //    in handleQRAssetFound, so this keeps it scoped to that month).
    //    The column compared depends on the selected date field.
    const startRange = istDayStartMsFromYmd(currentDate) ?? 0;
    const endRange = istDayEndMsFromYmd(toDate) ?? Number.MAX_SAFE_INTEGER;
    list = list.filter((i) => {
      const dateVal =
        dateField === "completed_date" ? i.completed_on : i.start_due_date;
      if (!dateVal) return false;
      const ts = new Date(dateVal).getTime();
      return ts >= startRange && ts <= endRange;
    });
    return list;
  }, [
    allInstances,
    statusFilter,
    deferredSearchQuery,
    qrAssetFilter,
    currentDate,
    toDate,
    dateField,
    todayStartMs,
  ]);

  const stats = useMemo(() => {
    const startRange = istDayStartMsFromYmd(currentDate) ?? 0;
    const endRange = istDayEndMsFromYmd(toDate) ?? Number.MAX_SAFE_INTEGER;

    const rangeInstances = allInstances.filter((i) => {
      const dateVal =
        dateField === "completed_date" ? i.completed_on : i.start_due_date;
      if (!dateVal) return false;
      const ts = new Date(dateVal).getTime();
      return ts >= startRange && ts <= endRange;
    });

    const localCount = {
      total: rangeInstances.length,
      overdue: 0,
      due: 0,
      inProgress: 0,
      completed: 0,
    };
    for (const i of rangeInstances) {
      const k = pmStatusKey(i.status, i.start_due_date, todayStartMs);
      if (k === "Overdue") localCount.overdue += 1;
      else if (k === "Due") localCount.due += 1;
      else if (k === "In progress") localCount.inProgress += 1;
      else if (k === "Completed") localCount.completed += 1;
    }

    // Counts come from ONE source — never a per-field Math.max of two. Mixing
    // server and local (each windowed/complete differently, and each device's
    // cache in a different state) made the per-status maxes stop summing to the
    // total, so the tallies disagreed across devices/screens and drifted as the
    // cache filled or orphans were pruned. Server stats are computed over the
    // full DB for the exact due-date window: authoritative, identical on every
    // device, and internally consistent (buckets partition the total). Use them
    // when online; fall back to the local windowed aggregation only when
    // offline, before stats arrive, or when filtering by completed date (the
    // server stat is due-date-only). The local fallback still reflects
    // optimistic pending updates, and the list below always renders from local.
    if (serverStats && dateField !== "completed_date") {
      const inProgress =
        (serverStats.byStatus?.["In-progress"] || 0) +
        (serverStats.byStatus?.["In Progress"] || 0) +
        (serverStats.byStatus?.Inprogress || 0);
      const completed = serverStats.byStatus?.Completed || 0;
      const total = serverStats.total ?? 0;
      const pending = Math.max(0, total - inProgress - completed);
      // The server has no Overdue bucket (it isn't a stored status), so the
      // not-started total is split using the local overdue tally, capped so
      // Overdue + Due still equals the server's not-started count.
      const overdue = Math.min(pending, localCount.overdue);

      return { total, overdue, due: pending - overdue, inProgress, completed };
    }

    return localCount;
  }, [allInstances, currentDate, toDate, serverStats, dateField, todayStartMs]);

  const handlePMCardPress = useCallback((instance: PMInstanceRow) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const normalizedStatus = (instance.status || "").toLowerCase();
    const isNotStarted =
      normalizedStatus === "pending" ||
      normalizedStatus === "open" ||
      normalizedStatus === "";
    if (isNotStarted) {
      if (!canEdit) {
        // Read-only mode: nothing to view yet for an un-started PM.
        Alert.alert(
          "Read-only mode",
          "This PM hasn't been started. Start your day to begin it.",
        );
        return;
      }
      // Not started yet: capture the before-image and stamp the start time
      // in a sheet before entering the execution screen. Assignment is
      // stamped there, on confirm — see handleConfirmStart.
      setStartBeforeImage("");
      setStartModalInstance(instance);
      return;
    }

    // Already In-progress or Completed — open execution directly so the
    // original start time is preserved (no re-start). Assignment is
    // intentionally left untouched here, so reopening a PM from the
    // In-progress tab never reassigns it away from whoever started it.
    router.push({
      pathname: "/pm-execution",
      params: { instanceId: instance.id },
    });
  }, [canEdit]);

  // The list only ever renders PMInstanceRow objects, so the row PMItem hands
  // back is one of them.
  const onCardPress = useCallback(
    (row: PMRow) => handlePMCardPress(row as PMInstanceRow),
    [handlePMCardPress],
  );

  // Before-photo evidence must be shot on site, so it is camera-only — no
  // gallery option, which let an old or unrelated photo stand in as proof.
  const captureStartBeforeImage = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission Required",
          "Camera access is required to capture the before photo.",
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setStartBeforeImage(result.assets[0].uri);
      }
    } catch (err) {
      logger.error("PM start before-image capture error", { error: err });
      Alert.alert("Error", "Failed to capture photo.");
    }
  }, []);

  const closeStartModal = useCallback(() => {
    if (starting) return;
    setStartModalInstance(null);
    setStartBeforeImage("");
  }, [starting]);

  const handleConfirmStart = useCallback(async () => {
    if (!startModalInstance || starting) return;
    // The Before photo is mandatory to start. Enforced on the device only, like
    // the After photo on completion — offline it is still queued on the phone
    // when the start syncs, so the server can't check it. The execution screen
    // only allows retaking it, never removing it, so this one gate holds.
    if (!startBeforeImage) {
      Alert.alert(
        "Before photo required",
        "Capture a before photo of the asset to start this PM.",
      );
      return;
    }
    setStarting(true);
    try {
      // The operator who starts the PM becomes its assignee. This is the
      // only point where assigned_to is stamped from the list screen.
      const userName =
        (user?.full_name && user.full_name.trim()) ||
        (user?.name && user.name.trim()) ||
        user?.email ||
        "User";
      await PMService.startExecution(startModalInstance.id, {
        beforeImage: startBeforeImage,
        startDatetime: new Date().toISOString(),
        assignedToName: userName,
      });
      // Optimistic: reflect In-progress + before_image + assignee locally.
      setAllInstances((prev) =>
        prev.map((inst) =>
          inst.id === startModalInstance.id
            ? {
                ...inst,
                status: "In-progress",
                before_image: startBeforeImage,
                assigned_to_name: userName,
              }
            : inst,
        ),
      );
      const instanceId = startModalInstance.id;
      setStartModalInstance(null);
      setStartBeforeImage("");
      router.push({ pathname: "/pm-execution", params: { instanceId } });
    } catch (err) {
      logger.error("Failed to start PM", { error: err });
      Alert.alert("Error", "Could not start this PM. Please try again.");
    } finally {
      setStarting(false);
    }
  }, [startModalInstance, startBeforeImage, starting, user]);

  // A scan scopes the asset's PMs to this month, as before — now by moving
  // the shared Ops range, so the header shows the window being applied.
  const handleQRAssetFound = useCallback((assetName: string) => {
    setOpsDateRange(rangeForPreset("month"));
    setQrAssetFilter(assetName);
    setSearchQuery("");
  }, []);

  // Clearing the scan leaves the shared range alone: it now belongs to every
  // Ops tab, so it is only changed from the header (or by a scan above).
  const clearQRFilter = useCallback(() => {
    setQrAssetFilter(null);
  }, []);

  const statusChips = useMemo<PMChip[]>(
    () => [
      { key: "Due", label: "Due", count: stats.overdue + stats.due },
      { key: "In progress", label: "In progress", count: stats.inProgress },
      { key: "Completed", label: "Completed", count: stats.completed },
      { key: "All", label: "All", count: stats.total },
    ],
    [stats],
  );

  const visibleCount = useMemo(() => {
    switch (statusFilter) {
      case "Due":
        return stats.overdue + stats.due;
      case "In progress":
        return stats.inProgress;
      case "Completed":
        return stats.completed;
      default:
        return stats.total;
    }
  }, [statusFilter, stats]);

  const selectStatusChip = useCallback(
    (key: string) => {
      if (key === statusFilter) return;
      const next = CHIP_ORDER.find((k) => k === key);
      if (!next) return;
      const dir =
        CHIP_ORDER.indexOf(next) >= CHIP_ORDER.indexOf(statusFilter) ? 1 : -1;
      setSlide((prev) => ({ seq: prev.seq + 1, dir }));
      setStatusFilter(next);
    },
    [statusFilter],
  );

  const cycleSort = useCallback(() => {
    setSortMode((m) => (m === "Due date" ? "Status" : "Due date"));
  }, []);

  const sortedInstances = useMemo(() => {
    const rows = [...filteredInstances];
    const due = (i: PMInstanceRow) => Number(i.start_due_date ?? 0);
    if (sortMode === "Status") {
      rows.sort((a, b) => {
        const ra = STATUS_RANK[pmStatusKey(a.status, a.start_due_date, todayStartMs)];
        const rb = STATUS_RANK[pmStatusKey(b.status, b.start_due_date, todayStartMs)];
        return ra !== rb ? ra - rb : due(a) - due(b);
      });
      return rows;
    }
    rows.sort((a, b) => due(a) - due(b));
    return rows;
  }, [filteredInstances, sortMode, todayStartMs]);

  const showCompletedDate =
    statusFilter === "Completed" || dateField === "completed_date";

  const renderItem: ListRenderItem<PMInstanceRow> = useCallback(
    ({ item }) => (
      <PMItem
        instance={item}
        onPress={onCardPress}
        showCompletedDate={showCompletedDate}
        todayStartMs={todayStartMs}
      />
    ),
    [onCardPress, showCompletedDate, todayStartMs],
  );

  const keyExtractor = useCallback((item: PMInstanceRow) => item.id, []);

  // Two card heights exist: in-progress rows carry a progress bar, the rest
  // don't. Separate recycle pools stop a short cell being re-measured as a
  // tall one mid-fling.
  const getItemType = useCallback(
    (item: PMInstanceRow) =>
      pmStatusKey(item.status, item.start_due_date, todayStartMs) ===
      "In progress"
        ? "progress"
        : "plain",
    [todayStartMs],
  );

  const ListEmpty = useMemo(() => {
    const filtered = statusFilter !== "All" || !!searchQuery || !!qrAssetFilter;
    return (
      <EmptyState
        icon="bx-calendar-check"
        title={
          allInstances.length > 0 ? "No PMs match this view" : "No PM tasks found"
        }
        sub={
          allInstances.length > 0
            ? `${allInstances.length} PMs are cached for this site. Try another status, period or search.`
            : isConnected
              ? "Nothing is scheduled for this site in the selected period."
              : "You're offline and nothing is cached for this site yet."
        }
        action={
          filtered
            ? {
                label: "Show all",
                onPress: () => {
                  selectStatusChip("All");
                  setSearchQuery("");
                  if (qrAssetFilter) clearQRFilter();
                },
              }
            : undefined
        }
      />
    );
  }, [
    allInstances.length,
    statusFilter,
    searchQuery,
    qrAssetFilter,
    isConnected,
    selectStatusChip,
    clearQRFilter,
  ]);

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={s.footerLoader}>
        <ActivityIndicator size="small" color={t.accent} />
      </View>
    );
  }, [loadingMore, s.footerLoader, t.accent]);

  let body: React.ReactNode;
  if (!siteCode && sitesLoading) {
    body = <PMSkeleton />;
  } else if (!siteCode) {
    body = (
      <View style={s.pad}>
        <EmptyState
          icon="bx-buildings"
          title={sites.length ? "Pick a site" : "No site assigned"}
          sub={
            sites.length
              ? "Choose a site at the top to see its preventive maintenance."
              : "Ask an admin to add you to a site to see its PMs."
          }
        />
      </View>
    );
  } else if (loading && allInstances.length === 0) {
    body = <PMSkeleton />;
  } else {
    body = (
      <SwipeTabsView
        chips={statusChips}
        activeChip={statusFilter}
        onSelectChip={selectStatusChip}
        style={[{ flex: 1 }, listSlideStyle]}
      >
        <FlashList
          data={sortedInstances}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          drawDistance={600}
          ListEmptyComponent={ListEmpty}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          refreshControl={
            <RefreshControl
              refreshing={refreshing || (syncing && allInstances.length > 0)}
              onRefresh={onRefresh}
              tintColor={t.muted}
              colors={[t.accent]}
            />
          }
          contentContainerStyle={{ ...s.list, paddingBottom: clearance }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      </SwipeTabsView>
    );
  }

  return (
    <JoPage>
      {/* Ops sub-tabs: Tickets · PM · Site Logs · Incidents · Assets */}
      <OpsTabs />
      <PMListHeader
        search={searchQuery}
        onChangeSearch={setSearchQuery}
        onScanPress={() => qrScannerRef.current?.open()}
        onFilterPress={() => setFilterSheetOpen(true)}
        filterActive={dateField !== "due_date"}
        chips={statusChips}
        activeChip={statusFilter}
        onSelectChip={selectStatusChip}
        count={visibleCount}
        sortLabel={sortMode}
        onSort={cycleSort}
        qrAssetFilter={qrAssetFilter}
        onClearQr={clearQRFilter}
        offline={!isConnected}
        readOnly={!canEdit}
      />

      <View style={{ flex: 1 }}>{body}</View>

      <QRScannerModal
        ref={qrScannerRef}
        siteCode={siteCode}
        onClose={() => {}}
        onAssetFound={handleQRAssetFound}
      />

      <PMStartSheet
        visible={!!startModalInstance}
        title={startModalInstance?.title || ""}
        assetId={startModalInstance?.asset_id}
        beforeImage={startBeforeImage}
        starting={starting}
        onCapture={() => void captureStartBeforeImage()}
        onClose={closeStartModal}
        onConfirm={() => void handleConfirmStart()}
      />

      {/* Non-date filters. The site and the period are set in the Ops header
          above the sub-tabs; this picks which date column that period
          applies to, plus the status (same keys as the chip strip). */}
      <JoSheet
        visible={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="Filter PM tasks"
        subtitle="Site and period are set at the top of Ops."
      >
        {/* Seven rows + captions outgrow a small phone; scroll inside. */}
        <ScrollView style={{ maxHeight: 440 }}>
          <Text style={s.sheetCaption} accessibilityRole="header">
            Period applies to
          </Text>
          <View style={s.sheetGroup} accessibilityRole="radiogroup">
            {PM_DATE_FIELD_OPTIONS.map((opt) => (
              <SheetOption
                key={opt.value}
                label={opt.label}
                selected={dateField === opt.value}
                onPress={() => setDateField(opt.value)}
              />
            ))}
          </View>
          <Text style={s.sheetCaption} accessibilityRole="header">
            Status
          </Text>
          <View style={s.sheetGroup} accessibilityRole="radiogroup">
            {CHIP_ORDER.map((key) => (
              <SheetOption
                key={key}
                label={key}
                selected={statusFilter === key}
                onPress={() => selectStatusChip(key)}
              />
            ))}
          </View>
        </ScrollView>
        <PrimaryButton
          label="Done"
          style={{ marginTop: 16 }}
          onPress={() => setFilterSheetOpen(false)}
        />
      </JoSheet>
    </JoPage>
  );
}
