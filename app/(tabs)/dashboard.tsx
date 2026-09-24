import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
  AppState,
  Alert,
  Platform,
  StyleSheet,
} from "react-native";
import { useSelectedSiteCode } from "@/services/SiteSelection";
import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Bell,
  CalendarCheck,
  FileText,
  LogIn,
  LogOut,
} from "lucide-react-native";
import { router } from "expo-router";
import { addDays, format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import { useAutoSync } from "@/hooks/useAutoSync";
import AttendanceService, {
  type AttendanceLog,
  getISTDateString,
  type Site,
} from "@/services/AttendanceService";
import HomeDashboardService, {
  type EfficiencyReading,
  type HomeSla,
  type HomeSummary,
} from "@/services/HomeDashboardService";
import Skeleton from "@/components/Skeleton";
import SiteLogService from "@/services/SiteLogService";
import logger from "@/utils/logger";
import { db, userSites } from "@/database";
import { eq } from "drizzle-orm";
import { ReportPickerModal } from "@/components/ReportPickerModal";
import { fetchNotificationFeed } from "@/services/NotificationService";
import {
  type BarData,
  BreachAlert,
  DashCard,
  DashHeader,
  DashSheet,
  EfficiencyCard,
  type Jo,
  useJo,
  Footnote,
  ProgressList,
  PunchButton,
  SectionLabel,
  SiteCard,
  SlaCard,
  type TileData,
  TileRow,
  type Tone,
  toneColor,
} from "@/components/home/RoleDashboardUI";

function formatLocationFailureMessage(
  message: string,
  userLocation?: { latitude: number; longitude: number } | null,
  nearestSite?: Site,
) {
  const parts = [message];
  if (userLocation) {
    parts.push(
      `\nYour location: ${userLocation.latitude.toFixed(6)}, ${userLocation.longitude.toFixed(6)}`,
    );
  }
  if (nearestSite) {
    const d = nearestSite.distanceMeters ?? nearestSite.distance ?? "?";
    const r = nearestSite.radius ?? 200;
    parts.push(
      `\nNearest site "${nearestSite.name}": about ${d}m away (allowed radius: ${r}m).`,
    );
  }
  return parts.join("");
}

// ── Period + month helpers (IST calendar dates) ───────────────────────────

type PeriodKey = "today" | "week" | "month" | "custom";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "YYYY-MM-DD" → local-noon Date, clear of DST/midnight edges. */
function isoToDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
}

/** "2026-09-07" → "07 Sep". */
function dayMonth(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1] ?? ""}`;
}

/** "07 Sep" / "07–12 Sep" / "28 Aug–03 Sep". */
function rangeLabel(from: string, to: string) {
  if (from === to) return dayMonth(from);
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return `${from.slice(8, 10)}–${dayMonth(to)}`;
  }
  return `${dayMonth(from)}–${dayMonth(to)}`;
}

/** "2026-09" → "Sep 2026" / "Sep". */
function monthLabel(key: string, short = false) {
  const [y, m] = key.split("-");
  const name = MONTHS[Number(m) - 1] ?? key;
  return short ? name : `${name} ${y}`;
}

/** The current month and the three before it, newest first. */
function recentMonthKeys(todayIso: string, n = 4) {
  const [y, m] = todayIso.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y ?? 1970, (m ?? 1) - 1 - i, 1, 12);
    return format(d, "yyyy-MM");
  });
}

function periodRange(
  period: PeriodKey,
  todayIso: string,
  custom: { from: string; to: string },
) {
  if (period === "custom") return custom;
  if (period === "today") return { from: todayIso, to: todayIso };
  if (period === "month") return { from: `${todayIso.slice(0, 7)}-01`, to: todayIso };
  // Week to date, Monday-based.
  const today = isoToDate(todayIso);
  const dow = today.getDay();
  const monday = addDays(today, dow === 0 ? -6 : 1 - dow);
  return { from: format(monday, "yyyy-MM-dd"), to: todayIso };
}

// ── Colour rules ──────────────────────────────────────────────────────────

/** Plant SEC target, kW/TR — same value the web Efficiency page flags against. */
const SEC_TARGET = 0.85;

function slaTone(score: number | null): Tone {
  if (score == null) return "neutral";
  return score >= 4.6 ? "good" : score >= 4.4 ? "warn" : "bad";
}
function pctTone(pct: number): Tone {
  return pct >= 80 ? "good" : pct >= 50 ? "warn" : "bad";
}
const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function progressBar(label: string, done: number, total: number): BarData {
  if (total <= 0) {
    return { label, detail: "None scheduled", pct: 0, tone: "neutral" };
  }
  const pct = pctOf(done, total);
  return { label, detail: `${done}/${total} · ${pct}%`, pct, tone: pctTone(pct) };
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// --- Memoized Skeleton Component ---
const DashboardSkeleton = React.memo(() => {
  const insets = useSafeAreaInsets();
  const JO = useJo();
  return (
    <View style={{ flex: 1, backgroundColor: JO.page, paddingTop: insets.top + 12, paddingHorizontal: 16 }}>
      <Skeleton width={160} height={48} borderRadius={8} style={{ marginBottom: 16, backgroundColor: JO.tile }} />
      <Skeleton width="100%" height={170} borderRadius={16} style={{ marginBottom: 14, backgroundColor: JO.tile }} />
      <Skeleton width="100%" height={80} borderRadius={12} style={{ marginBottom: 14, backgroundColor: JO.tile }} />
      <Skeleton width="100%" height={120} borderRadius={16} style={{ marginBottom: 14, backgroundColor: JO.tile }} />
      <Skeleton width="100%" height={110} borderRadius={16} style={{ backgroundColor: JO.tile }} />
    </View>
  );
});

DashboardSkeleton.displayName = "DashboardSkeleton";

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const JO = useJo();
  const styles = useStyles();
  const { user, signOut } = useAuth();
  const {
    isPrivileged,
    isPunchedIn,
    markPunchedIn: markGatePunchedIn,
    markPunchedOut: markGatePunchedOut,
  } = useAttendanceGate();
  const isLocked = !isPrivileged && !isPunchedIn;
  /** Technicians get the operator view; every other role gets the manager view. */
  const isOperator = String(user?.role || "").toLowerCase() === "technician";
  const userId = user?.user_id || user?.id || "";

  const [refreshing, setRefreshing] = useState(false);
  const [reportPickerOpen, setReportPickerOpen] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceLog | null>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [validatingLocation, setValidatingLocation] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sites, setSites] = useState<Site[]>([]);
  // App-wide selection — switching site here moves every other tab too.
  const [selectedSiteCode, setSelectedSiteCode] = useSelectedSiteCode(userId);

  // Period filter (operational tiles) and SLA month — independent by design.
  const todayIso = getISTDateString(currentTime);
  const monthKeys = useMemo(() => recentMonthKeys(todayIso), [todayIso]);
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [customRange, setCustomRange] = useState({ from: todayIso, to: todayIso });
  const [slaMonth, setSlaMonth] = useState<string>(() => todayIso.slice(0, 7));
  const [sheet, setSheet] = useState<null | "period" | "custom" | "month" | "site">(null);
  const [draftRange, setDraftRange] = useState({ from: todayIso, to: todayIso });
  const [pickerFor, setPickerFor] = useState<null | "from" | "to">(null);

  // Each result remembers the request it answers, so a site/period/month
  // switch never shows the previous scope's numbers under the new label, and
  // "loading" is simply "the latest result is for a different request".
  const [summaryState, setSummaryState] = useState<{
    key: string;
    data: HomeSummary | null;
    fromCache: boolean;
  } | null>(null);
  const [slaState, setSlaState] = useState<{ key: string; data: HomeSla | null } | null>(null);
  const [slaHistoryState, setSlaHistoryState] = useState<{
    site: string;
    months: HomeSla["months"];
  } | null>(null);
  const [unread, setUnread] = useState(0);
  /** Bumped by every data refresh so the metric loaders re-run. */
  const [refreshTick, setRefreshTick] = useState(0);

  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Site the page reports on — the switcher's pick, else the first. */
  const activeSite = useMemo(
    () => sites.find((x) => x.site_code === selectedSiteCode) ?? sites[0] ?? null,
    [sites, selectedSiteCode],
  );
  const activeSiteCode = activeSite?.site_code ?? null;

  const range = useMemo(
    () => periodRange(period, todayIso, customRange),
    [period, todayIso, customRange],
  );

  const summaryKey = activeSiteCode ? `${activeSiteCode}|${range.from}|${range.to}` : null;
  const slaKey = activeSiteCode ? `${activeSiteCode}|${slaMonth}` : null;
  const summary = summaryState && summaryState.key === summaryKey ? summaryState.data : null;
  const summaryFromCache = !!summary && !!summaryState?.fromCache;
  const summaryLoading = !!summaryKey && summaryState?.key !== summaryKey;
  const sla = slaState && slaState.key === slaKey ? slaState.data : null;
  const slaLoading = !!slaKey && slaState?.key !== slaKey;
  const slaHistory =
    slaHistoryState && slaHistoryState.site === activeSiteCode ? slaHistoryState.months : [];

  useEffect(() => {
    // Periodic local DB maintenance — the Home tab is the app's front door.
    SiteLogService.runCleanup();
    const timer = setTimeout(() => setLoadingAttendance(false), 8000); // safety
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

  // Live timer for the on-shift duration.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const onShift = !!todayAttendance && !todayAttendance.check_out_time;
    const start = () => {
      if (interval || !onShift) return;
      setCurrentTime(new Date());
      interval = setInterval(() => setCurrentTime(new Date()), 60000);
    };
    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    const sub = AppState.addEventListener("change", (s) =>
      s === "active" ? start() : stop(),
    );
    start();
    return () => {
      sub.remove();
      stop();
    };
  }, [todayAttendance]);

  // ── Attendance + sites ────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!userId) return;
    setCurrentTime(new Date());
    try {
      // Cached first for an instant render.
      const localSiteRows = await db
        .select()
        .from(userSites)
        .where(eq(userSites.user_id, userId))
        .catch(() => [] as { site_code: string; site_name: string }[]);
      const cachedSites: Site[] = localSiteRows.map(
        (row: { site_code: string; site_name: string }) => ({
          site_code: row.site_code,
          name: row.site_name,
        }),
      );
      if (cachedSites.length > 0) setSites(cachedSites);

      const cachedAtt = await AttendanceService.getTodayAttendance(userId).catch(() => null);
      if (cachedAtt) setTodayAttendance(cachedAtt);
      setLoadingAttendance(false);

      const net = await NetInfo.fetch();
      if (net.isConnected === true) {
        const [attData, freshSites] = await Promise.all([
          AttendanceService.getTodayAttendance(userId, true).catch(() => null),
          AttendanceService.getUserSites(userId, "JouleCool").catch(() => [] as Site[]),
        ]);
        if (attData) setTodayAttendance(attData);
        if (freshSites.length > 0) setSites(freshSites);
      }
    } catch (error) {
      logger.error("Dashboard fetchData failed", { error });
    } finally {
      setLoadingAttendance(false);
      setRefreshTick((t) => t + 1);
    }
  }, [userId]);

  useAutoSync(fetchData, [userId]);

  // ── Operational metrics (period-scoped) ───────────────────────────────
  useEffect(() => {
    if (!userId || !activeSiteCode || !summaryKey) return;
    let cancelled = false;
    HomeDashboardService.getSummary(userId, activeSiteCode, range.from, range.to).then(
      (res) => {
        if (cancelled) return;
        setSummaryState({
          key: summaryKey,
          data: res.success ? res.data : null,
          fromCache: res.success && !!res.isFromCache,
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId, activeSiteCode, summaryKey, range.from, range.to, refreshTick]);

  // Bell dot — any unread item in the notification feed.
  useEffect(() => {
    if (!userId || isLocked) return;
    let cancelled = false;
    fetchNotificationFeed({ limit: 1 }).then((res) => {
      if (!cancelled && res.success) setUnread(res.unreadCount);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, isLocked, refreshTick]);

  // ── SLA scorecard (month-scoped) ──────────────────────────────────────
  useEffect(() => {
    if (!userId || !activeSiteCode || !slaKey) return;
    let cancelled = false;
    HomeDashboardService.getSla(userId, activeSiteCode, slaMonth).then((res) => {
      if (cancelled) return;
      setSlaState({ key: slaKey, data: res.success ? res.data : null });
      // The response carries the selected month + 3 prior; when the current
      // month is selected that is exactly the month picker's list.
      if (res.success && slaMonth === monthKeys[0]) {
        setSlaHistoryState({ site: activeSiteCode, months: res.data.months });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, activeSiteCode, slaKey, slaMonth, monthKeys, refreshTick]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    refreshTimeoutRef.current = setTimeout(() => setRefreshing(false), 800);
  }, [fetchData]);

  // ── Punch in / out ────────────────────────────────────────────────────
  const navigateToAttendance = useCallback(() => router.push("/attendance"), []);

  const handleQuickCheckIn = async () => {
    if (!userId) return;
    setValidatingLocation(true);
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        status = (await Location.requestForegroundPermissionsAsync()).status;
      }
      if (status !== "granted") {
        Alert.alert(
          "Location needed",
          "Allow location access to start your day at a site.",
        );
        return;
      }
      const accuracy =
        Platform.OS === "android"
          ? Location.Accuracy.High
          : Location.Accuracy.BestForNavigation;
      const loc = await Location.getCurrentPositionAsync({ accuracy });

      const validation = await AttendanceService.validateLocation(
        userId,
        loc.coords.latitude,
        loc.coords.longitude,
      );

      if (!validation.isValid) {
        Alert.alert(
          "Location Failed",
          formatLocationFailureMessage(
            validation.message,
            validation.userLocation,
            validation.nearestSite,
          ),
        );
        return;
      }

      const siteCode = validation.isWFH
        ? (validation.resolvedSiteCode ?? null)
        : (validation.allowedSites[0]?.site_code ?? null);

      if (!validation.isWFH && !siteCode) {
        Alert.alert(
          "Location Failed",
          "You are not within range of any active site. Open Attendance for details.",
        );
        return;
      }

      const res = await AttendanceService.checkIn(
        userId,
        siteCode,
        loc.coords.latitude,
        loc.coords.longitude,
      );
      if (res.success) {
        Alert.alert(
          res.queued ? "Saved" : "Success",
          res.queued
            ? "Checked in. It will sync automatically when your connection is stable."
            : "Checked in successfully!",
        );
        fetchData();
        markGatePunchedIn();
      } else {
        const ext = res as any;
        Alert.alert(
          "Failed",
          formatLocationFailureMessage(
            ext.error || "Check-in failed",
            ext.userLocation,
            ext.nearestSite,
          ),
        );
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setValidatingLocation(false);
    }
  };

  const handleQuickCheckOut = async () => {
    if (!todayAttendance?.id) return;

    // Technicians must complete the mandatory shift sign-off before punching
    // out — the sign-off screen performs the check-out itself.
    if (isOperator) {
      router.push({
        pathname: "/shift-signoff",
        params: {
          attendanceId: todayAttendance.id,
          siteCode: todayAttendance.site_code || "",
          checkInTime: todayAttendance.check_in_time || "",
        },
      });
      return;
    }

    setValidatingLocation(true);

    const performCheckOut = async (remarks?: string) => {
      try {
        const accuracy =
          Platform.OS === "android"
            ? Location.Accuracy.High
            : Location.Accuracy.BestForNavigation;
        const loc = await Location.getCurrentPositionAsync({ accuracy });
        const res = await AttendanceService.checkOut(
          todayAttendance.id,
          loc.coords.latitude,
          loc.coords.longitude,
          undefined,
          remarks,
        );

        if (res.success) {
          Alert.alert(
            res.queued ? "Saved" : "Success",
            res.queued
              ? "Checked out. It will sync automatically when your connection is stable."
              : "Checked out successfully!",
          );
          fetchData();
          markGatePunchedOut();
        } else if (res.error?.includes("Early checkout")) {
          // Backend requires a reason; supply a default so the check-out can
          // finish from Home.
          await performCheckOut("Checked out from dashboard");
        } else {
          Alert.alert(
            "Check-out Failed",
            res.error || "Unable to check out. Please check your connection.",
            [
              { text: "OK", style: "cancel" },
              { text: "Go to Attendance", onPress: () => router.push("/attendance") },
            ],
          );
        }
      } catch (e: any) {
        Alert.alert("Error", e.message);
      } finally {
        setValidatingLocation(false);
      }
    };

    await performCheckOut();
  };

  const confirmSignOut = () =>
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);

  // ── Derived view data ─────────────────────────────────────────────────
  const punchedIn = !!todayAttendance && !todayAttendance.check_out_time;
  const shiftComplete = !!todayAttendance?.check_out_time;

  const clock = (iso?: string | null) => {
    if (!iso) return "--:--";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "--:--" : format(d, "HH:mm");
  };

  const shiftLine = useMemo(() => {
    if (!punchedIn || !todayAttendance?.check_in_time) return null;
    const start = new Date(todayAttendance.check_in_time).getTime();
    if (Number.isNaN(start)) return null;
    const mins = Math.max(0, Math.floor((currentTime.getTime() - start) / 60000));
    return `In ${clock(todayAttendance.check_in_time)} · ${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m so far`;
  }, [punchedIn, todayAttendance, currentTime]);

  const cta = punchedIn
    ? { label: "End Day", icon: LogOut, variant: "secondary" as const, onPress: handleQuickCheckOut }
    : shiftComplete
      ? { label: "Shift complete", icon: CalendarCheck, variant: "secondary" as const, onPress: navigateToAttendance }
      : { label: "Start Day", icon: LogIn, variant: "primary" as const, onPress: handleQuickCheckIn };
  const punchStatus = shiftComplete
    ? `Day ended · ${clock(todayAttendance?.check_in_time)}–${clock(todayAttendance?.check_out_time)}`
    : null;

  const displayName = user?.full_name || user?.name || "JouleOps user";
  const avatarInitial = (displayName.trim()[0] || "J").toUpperCase();
  const siteName = activeSite?.name || summary?.site.name || activeSiteCode || "No site assigned";
  const canSwitchSite = !isLocked && sites.length > 1;

  const periodLabel =
    period === "today" ? "Today"
      : period === "week" ? "This Week"
        : period === "month" ? "This Month"
          : rangeLabel(range.from, range.to);

  // Navigation out of Home is blocked while locked (tab bar hidden).
  const go = (path: string) => (isLocked ? undefined : () => router.push(path as any));

  const s = summary;
  const dash = "—";
  const val = (n: number | undefined) => (s && n !== undefined ? String(n) : dash);

  const logsPct = s ? pctOf(s.logs.completed, s.logs.expected) : 0;
  const pmPct = s ? pctOf(s.pm.completed, s.pm.planned) : 0;
  const pendingPm = s ? Math.max(0, s.pm.planned - s.pm.completed) : 0;
  const pendingLogs = s ? Math.max(0, s.logs.expected - s.logs.completed) : 0;

  const opTiles: TileData[] = [
    {
      label: "OPEN TKTS",
      value: val(s?.tickets.open),
      tone: s && s.tickets.open > 2 ? "warn" : "neutral",
      flag: !!s?.breachAlert,
      onPress: go("/(tabs)/tickets"),
    },
    {
      label: "LOGS",
      value: s ? `${s.logs.completed}/${s.logs.expected}` : dash,
      tone: s && s.logs.expected > 0 ? pctTone(logsPct) : "neutral",
      flag: !!s && s.logs.expected > 0 && logsPct < 50,
      onPress: go("/(tabs)/site-logs"),
    },
    {
      label: "PM DUE",
      value: s ? String(pendingPm) : dash,
      tone: s && s.pm.planned > 0 ? pctTone(pmPct) : "neutral",
      flag: !!s && s.pm.planned > 0 && pmPct < 50,
      onPress: go("/(tabs)/preventive-maintenance"),
    },
    {
      label: "INCIDENTS",
      value: val(s?.incidents.raised),
      tone: s && s.incidents.raised > 2 ? "warn" : "neutral",
      flag: !!s && s.incidents.raised > 0,
      onPress: go("/(tabs)/incidents"),
    },
  ];

  const mgrTilesA: TileData[] = [
    {
      label: "OPEN TICKETS",
      value: val(s?.tickets.open),
      tone: s && s.tickets.open > 2 ? "warn" : "neutral",
      flag: !!s && s.tickets.open > 2,
      onPress: go("/(tabs)/tickets"),
    },
    {
      label: "SLA BREACHES",
      value: val(s?.tickets.slaBreached),
      tone: !s ? "neutral" : s.tickets.slaBreached < 4 ? "good" : s.tickets.slaBreached < 8 ? "warn" : "bad",
      flag: !!s && s.tickets.slaBreached > 0,
      onPress: go("/(tabs)/tickets"),
    },
    {
      label: "INCIDENTS",
      value: val(s?.incidents.raised),
      tone: s && s.incidents.raised > 2 ? "warn" : "neutral",
      flag: !!s && s.incidents.raised > 0,
      onPress: go("/(tabs)/incidents"),
    },
  ];
  const mgrTilesB: TileData[] = [
    {
      label: "OPEN PM",
      value: s ? String(pendingPm) : dash,
      tone: pendingPm > 20 ? "bad" : pendingPm > 5 ? "warn" : "neutral",
      flag: pendingPm > 20,
      onPress: go("/(tabs)/preventive-maintenance"),
    },
    {
      label: "OPEN LOGS",
      value: s ? String(pendingLogs) : dash,
      tone: pendingLogs > 30 ? "warn" : "neutral",
      flag: pendingLogs > 30,
      onPress: go("/(tabs)/site-logs"),
    },
    {
      label: "ON SITE NOW",
      value: val(s?.attendance.onShift),
      tone: "neutral",
      onPress: go("/attendance"),
    },
  ];

  const opBars = s
    ? [progressBar("Site logs", s.logs.completed, s.logs.expected), progressBar("PM tasks", s.pm.completed, s.pm.planned)]
    : [];
  const mgrBars = s
    ? [
        progressBar("Preventive maintenance", s.pm.completed, s.pm.planned),
        progressBar("Tickets resolved", s.tickets.resolved, s.tickets.raised),
      ]
    : [];

  const alert = s?.breachAlert ?? null;
  const alertView = alert
    ? alert.breached > 0
      ? {
          title: `${plural(alert.breached, "ticket")} breached SLA`,
          subtitle: [alert.ticketNo, alert.area || alert.title].filter(Boolean).join(" · "),
        }
      : {
          title: `${plural(alert.atRisk, "ticket")} breaching SLA`,
          subtitle: [
            alert.nextDueInMin != null ? `Breaches in ${alert.nextDueInMin} min` : null,
            alert.area || alert.title,
          ].filter(Boolean).join(" · "),
        }
    : null;

  // SLA chip/card
  const slaScoreNum = sla?.score ?? null;
  const slaScoreText = slaScoreNum != null ? slaScoreNum.toFixed(2) : dash;
  const kpis: BarData[] = (sla?.kpis ?? []).map((k) => {
    const weak = k.score < 4.0;
    return {
      label: k.label,
      detail: `${weak ? "⚠ " : ""}${k.score.toFixed(2)}`,
      pct: k.target > 0 ? Math.round((k.score / k.target) * 100) : 0,
      tone: weak ? "warn" : k.score >= 4.6 ? "good" : "info",
    };
  });
  const monthIdx = Math.max(0, monthKeys.indexOf(slaMonth));

  const effItem = (label: string, r: EfficiencyReading | undefined, target: number | null) => {
    const v = r?.value ?? null;
    const tone: Tone = v == null || target == null ? "neutral" : v <= target ? "good" : "bad";
    const trend =
      !isOperator && v != null && r?.previous != null && r.previous !== v
        ? v < r.previous ? ("down" as const) : ("up" as const)
        : null;
    return { label, value: v != null ? v.toFixed(2) : dash, tone, trend };
  };
  const effItems = [
    effItem("HIGH SIDE", s?.efficiency.highSide, SEC_TARGET),
    effItem("LOW SIDE", s?.efficiency.lowSide, null),
  ];
  const asOf = s?.efficiency.highSide.asOf || s?.efficiency.lowSide.asOf;
  const effNote = asOf
    ? `Lower is better · latest reading ${dayMonth(asOf)} (none in period yet).`
    : "Lower is better.";

  // ── Sheets ────────────────────────────────────────────────────────────
  const closeSheet = () => {
    setSheet(null);
    setPickerFor(null);
  };
  const thisWeek = periodRange("week", todayIso, customRange);
  const periodOptions = [
    { key: "today", label: "Today", meta: format(isoToDate(todayIso), "dd MMM yyyy") },
    { key: "week", label: "This Week", meta: rangeLabel(thisWeek.from, thisWeek.to) },
    { key: "month", label: "This Month", meta: monthLabel(todayIso.slice(0, 7)) },
    { key: "custom", label: "Custom range", meta: period === "custom" ? rangeLabel(range.from, range.to) : "Pick dates" },
  ].map((o) => ({
    ...o,
    selected: period === o.key,
    onPress: () => {
      if (o.key === "custom") {
        setDraftRange(period === "custom" ? customRange : { from: range.from, to: range.to });
        setSheet("custom");
      } else {
        setPeriod(o.key as PeriodKey);
        closeSheet();
      }
    },
  }));

  const monthOptions = monthKeys.map((k) => {
    const h = slaHistory.find((m) => m.month === k);
    const score = h?.score ?? null;
    return {
      key: k,
      label: monthLabel(k),
      meta: score != null ? score.toFixed(2) : dash,
      metaColor: score != null ? toneColor(slaTone(score), JO) : undefined,
      selected: slaMonth === k,
      onPress: () => {
        setSlaMonth(k);
        closeSheet();
      },
    };
  });

  const siteOptions = sites.map((site) => ({
    key: site.site_code,
    label: site.name || site.site_code,
    meta: site.site_code,
    selected: site.site_code === activeSiteCode,
    onPress: () => {
      setSelectedSiteCode(site.site_code);
      closeSheet();
    },
  }));

  const onPickDate = (_event: any, date?: Date) => {
    const which = pickerFor;
    if (Platform.OS !== "ios") setPickerFor(null);
    if (!date || !which) return;
    const iso = format(date, "yyyy-MM-dd");
    setDraftRange((r) => {
      const next = { ...r, [which]: iso };
      // Keep the range ordered whichever end moved.
      if (next.from > next.to) {
        if (which === "from") next.to = next.from;
        else next.from = next.to;
      }
      return next;
    });
  };

  const applyRange = () => {
    setCustomRange(draftRange);
    setPeriod("custom");
    closeSheet();
  };

  if (loadingAttendance) {
    return <DashboardSkeleton />;
  }

  return (
    <View style={styles.screen}>
      <DashHeader
        topInset={insets.top}
        title={isOperator ? "My Site Today" : "Site Overview"}
        periodLabel={periodLabel}
        onPeriod={() => setSheet("period")}
        bellIcon={isLocked ? FileText : Bell}
        bellLabel={isLocked ? "Reports" : "Notifications"}
        bellDot={!isLocked && unread > 0}
        onBell={() => (isLocked ? setReportPickerOpen(true) : router.push("/notifications"))}
        avatarInitial={avatarInitial}
        avatarUri={user?.profile_photo_url}
        avatarLabel={isLocked ? "Sign out" : "Profile"}
        onAvatar={() => (isLocked ? confirmSignOut() : router.push("/(tabs)/profile"))}
      />

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={JO.muted} />
        }
      >
        <SiteCard
          siteName={siteName}
          onPressSite={canSwitchSite ? () => setSheet("site") : undefined}
          dateLabel={format(currentTime, "EEE, dd MMM yyyy")}
          shiftLine={shiftLine}
          slaScore={slaScoreText}
          slaTone={slaTone(slaScoreNum)}
          slaMonth={monthLabel(slaMonth, true)}
          onPressSla={() => setSheet("month")}
          onPress={navigateToAttendance}
          accessibilityLabel="Attendance. Open attendance"
        >
          {!isOperator ? (
            <View style={{ marginTop: 12 }}>
              <TileRow
                size="att"
                tiles={[
                  { label: "PRESENT", value: val(s?.attendance.present) },
                  { label: "ON SHIFT", value: val(s?.attendance.onShift) },
                ]}
              />
            </View>
          ) : null}
          <PunchButton
            label={cta.label}
            icon={cta.icon}
            variant={cta.variant}
            busy={validatingLocation}
            onPress={cta.onPress}
            status={punchStatus}
          />
        </SiteCard>

        {summaryFromCache ? (
          <Text style={styles.offline}>Offline · showing the last numbers synced for this period.</Text>
        ) : !s && !summaryLoading && activeSiteCode ? (
          <Text style={styles.offline}>Couldn&apos;t load site metrics. Pull down to retry.</Text>
        ) : null}

        {isOperator ? (
          <>
            <View>
              <SectionLabel>NEEDS YOU NOW · {periodLabel}</SectionLabel>
              {alertView ? (
                <BreachAlert
                  title={alertView.title}
                  subtitle={alertView.subtitle}
                  onPress={go("/(tabs)/tickets")}
                />
              ) : null}
              <TileRow tiles={opTiles} size="op" onPage />
            </View>

            <DashCard>
              <SectionLabel style={{ marginBottom: 12 }}>PROGRESS · {periodLabel}</SectionLabel>
              {s ? <ProgressList bars={opBars} /> : <Skeleton width="100%" height={60} borderRadius={8} style={{ backgroundColor: JO.tile }} />}
            </DashCard>
          </>
        ) : (
          <>
            <SlaCard
              monthLabel={monthLabel(slaMonth)}
              canPrev={monthIdx < monthKeys.length - 1}
              canNext={monthIdx > 0}
              onPrev={() => setSlaMonth(monthKeys[Math.min(monthKeys.length - 1, monthIdx + 1)]!)}
              onNext={() => setSlaMonth(monthKeys[Math.max(0, monthIdx - 1)]!)}
              onPressMonth={() => setSheet("month")}
              score={slaScoreText}
              tone={slaTone(slaScoreNum)}
              siteName={siteName}
              pctText={
                sla?.pct != null
                  ? `${sla.pct.toFixed(1)}% of commitment`
                  : slaLoading ? "Loading…" : "No SLA report for this month"
              }
              kpis={kpis}
              loading={slaLoading && !sla}
            />

            <View>
              <SectionLabel>OPERATIONAL STATUS · {periodLabel}</SectionLabel>
              <View style={{ gap: 8 }}>
                <TileRow tiles={mgrTilesA} onPage />
                <TileRow tiles={mgrTilesB} onPage />
              </View>
              <Footnote>Tiles follow the period filter · SLA follows its own month.</Footnote>
            </View>

            <DashCard>
              <SectionLabel style={{ marginBottom: 12 }}>PLANNED VS COMPLETED · {periodLabel}</SectionLabel>
              {s ? <ProgressList bars={mgrBars} /> : <Skeleton width="100%" height={60} borderRadius={8} style={{ backgroundColor: JO.tile }} />}
            </DashCard>
          </>
        )}

        <EfficiencyCard items={effItems} note={effNote} />
      </ScrollView>

      <DashSheet
        visible={sheet === "period"}
        title="Period"
        subtitle="Scopes operational metrics · SLA keeps its own month."
        onClose={closeSheet}
        options={periodOptions}
        bottomInset={insets.bottom}
      />

      <DashSheet
        visible={sheet === "month"}
        title="SLA month"
        subtitle="Contract score is monthly — independent of the period filter."
        onClose={closeSheet}
        options={monthOptions}
        bottomInset={insets.bottom}
      />

      <DashSheet
        visible={sheet === "site"}
        title="Switch site"
        onClose={closeSheet}
        options={siteOptions}
        bottomInset={insets.bottom}
      />

      <DashSheet
        visible={sheet === "custom"}
        title="Custom range"
        subtitle="Scopes operational metrics only."
        onClose={closeSheet}
        bottomInset={insets.bottom}
      >
        <View style={styles.rangeRow}>
          {(["from", "to"] as const).map((which) => (
            <TouchableOpacity
              key={which}
              style={[
                styles.rangeField,
                pickerFor === which && { borderColor: JO.lineStrong },
              ]}
              activeOpacity={0.8}
              onPress={() => setPickerFor(pickerFor === which ? null : which)}
              accessibilityRole="button"
              accessibilityLabel={`${which === "from" ? "From" : "To"} date`}
            >
              <Text style={styles.rangeCap}>{which === "from" ? "FROM" : "TO"}</Text>
              <Text style={styles.rangeValue}>
                {format(isoToDate(draftRange[which]), "dd MMM yyyy")}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {pickerFor ? (
          <DateTimePicker
            value={isoToDate(draftRange[pickerFor])}
            mode="date"
            maximumDate={isoToDate(todayIso)}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={onPickDate}
          />
        ) : null}
        <TouchableOpacity
          style={styles.applyBtn}
          activeOpacity={0.85}
          onPress={applyRange}
          accessibilityRole="button"
        >
          <Text style={styles.applyText}>Apply range</Text>
        </TouchableOpacity>
      </DashSheet>

      <ReportPickerModal
        visible={reportPickerOpen}
        onClose={() => setReportPickerOpen(false)}
      />
    </View>
  );
}

const makeStyles = (JO: Jo) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: JO.page },
  body: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 20, gap: 14 },
  offline: { fontSize: 11, color: JO.muted, marginTop: -4 },

  rangeRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  rangeField: {
    flex: 1,
    minWidth: 0,
    backgroundColor: JO.tile,
    borderWidth: 1,
    borderColor: JO.line,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  rangeCap: { fontSize: 9, fontWeight: "700", color: JO.muted, letterSpacing: 0.8 },
  rangeValue: { fontSize: 13, fontWeight: "700", color: JO.ink, marginTop: 5 },
  applyBtn: {
    height: 46,
    marginTop: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: JO.primary,
  },
  applyText: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "800" },
});

const STYLES = new Map<Jo, ReturnType<typeof makeStyles>>();

/** One stylesheet per Home palette (light / dark), built on first use. */
function useStyles() {
  const JO = useJo();
  let built = STYLES.get(JO);
  if (!built) {
    built = makeStyles(JO);
    STYLES.set(JO, built);
  }
  return built;
}
