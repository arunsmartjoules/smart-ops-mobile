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
} from "react-native";
import { useSelectedSiteCode } from "@/services/SiteSelection";
import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { FileText } from "lucide-react-native";
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
  type TeamAttendanceRow,
} from "@/services/HomeDashboardService";
import SiteLogService from "@/services/SiteLogService";
import logger from "@/utils/logger";
import { db, userSites } from "@/database";
import { eq } from "drizzle-orm";
import { ReportPickerModal } from "@/components/ReportPickerModal";
import { fetchNotificationFeed } from "@/services/NotificationService";
import {
  DateButton,
  JoPage,
  JoSheet,
  PrimaryButton,
  SectionHead,
  SheetOption,
  Shimmer,
  f,
} from "@/components/jo/ui";
import {
  BreachBanner,
  EfficiencyCard,
  HomeHeader,
  OpsHero,
  PlannedCards,
  ProgressCard,
  ShiftHero,
  SlaScoreCard,
  TeamCard,
  TechTiles,
  type EffItem,
  type PlannedBar,
  type SlaKpiView,
  type TeamRow,
  type TechTile,
} from "@/components/home/HomeUI";
import { makeJoStyles, useJoTheme, type JoTheme } from "@/hooks/useJoTheme";

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

/** "Good morning / afternoon / evening" on the IST clock. */
function greetingFor(now: Date) {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now),
  );
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// ── Colour rules (artboard: cSla / cPct) ──────────────────────────────────

/** Plant SEC target, kW/TR — same value the web Efficiency page flags against. */
const SEC_TARGET = 0.85;
/** Rows shown in "Team on site" before "View all" (artboard listLimit default). */
const TEAM_LIMIT = 4;
/** A full shift, for the team-row progress bar (artboard: mins / 480). */
const SHIFT_MINUTES = 480;

function slaColor(t: JoTheme, v: number | null) {
  if (v == null) return t.muted;
  return v >= 4.6 ? t.ok : v >= 4.4 ? t.warn : t.bad;
}
function slaStatus(t: JoTheme, v: number | null) {
  if (v == null) return { label: null, bg: t.muteTint };
  if (v >= 4.6) return { label: "On target", bg: t.okTint };
  if (v >= 4.4) return { label: "Watch", bg: t.warnTint };
  return { label: "Below target", bg: t.badTint };
}
function pctColor(t: JoTheme, p: number) {
  return p >= 80 ? t.ok : p >= 50 ? t.warn : t.bad;
}
const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function plural(n: number, word: string, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

function clock(iso?: string | null) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "--:--" : format(d, "HH:mm");
}

function durationLabel(mins: number) {
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

// --- Memoized Skeleton Component ---
const DashboardSkeleton = React.memo(() => (
  <JoPage>
    <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
      <Shimmer height={64} radius={20} style={{ width: "70%" }} />
      <Shimmer height={36} radius={18} style={{ width: 170 }} />
      <Shimmer height={120} radius={24} />
      <Shimmer height={220} radius={30} />
      <Shimmer height={180} radius={30} />
    </View>
  </JoPage>
));

DashboardSkeleton.displayName = "DashboardSkeleton";

export default function Dashboard() {
  const t = useJoTheme();
  const styles = useStyles();
  const { user, signOut } = useAuth();
  const {
    isPrivileged,
    isPunchedIn,
    markPunchedIn: markGatePunchedIn,
  } = useAttendanceGate();
  const isLocked = !isPrivileged && !isPunchedIn;
  /** Technicians get the operator view; every other role gets the manager view. */
  const isOperator = !isPrivileged;
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

  // Period filter (operational metrics) and SLA month — independent by design.
  const todayIso = getISTDateString(currentTime);
  const monthKeys = useMemo(() => recentMonthKeys(todayIso), [todayIso]);
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [customRange, setCustomRange] = useState({ from: todayIso, to: todayIso });
  const [slaMonth, setSlaMonth] = useState<string>(() => todayIso.slice(0, 7));
  const [sheet, setSheet] = useState<null | "period" | "custom" | "month" | "site">(null);
  const [draftRange, setDraftRange] = useState({ from: todayIso, to: todayIso });
  const [pickerFor, setPickerFor] = useState<null | "from" | "to">(null);
  const [teamOpen, setTeamOpen] = useState(false);

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
  const [teamState, setTeamState] = useState<{
    key: string;
    rows: TeamAttendanceRow[] | null;
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
  const teamKey = activeSiteCode && !isOperator ? `${activeSiteCode}|${todayIso}` : null;
  const summary = summaryState && summaryState.key === summaryKey ? summaryState.data : null;
  const summaryFromCache = !!summary && !!summaryState?.fromCache;
  const summaryLoading = !!summaryKey && summaryState?.key !== summaryKey;
  const sla = slaState && slaState.key === slaKey ? slaState.data : null;
  const slaLoading = !!slaKey && slaState?.key !== slaKey;
  const slaHistory =
    slaHistoryState && slaHistoryState.site === activeSiteCode ? slaHistoryState.months : [];
  const teamRowsRaw = teamState && teamState.key === teamKey ? teamState.rows : null;
  const teamLoading = !!teamKey && teamState?.key !== teamKey;

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

  // Minute clock: drives the on-shift timer and the team's durations.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval) return;
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
  }, []);

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
      setRefreshTick((n) => n + 1);
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

  // ── Team on site (managers; today, live) ──────────────────────────────
  useEffect(() => {
    if (!userId || !activeSiteCode || !teamKey) return;
    let cancelled = false;
    HomeDashboardService.getTeamToday(userId, activeSiteCode, todayIso).then((res) => {
      if (cancelled) return;
      setTeamState({ key: teamKey, rows: res.success ? res.data : null });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, activeSiteCode, teamKey, todayIso, refreshTick]);

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

  // ── Punch in / out (technicians only) ─────────────────────────────────
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

  const handleQuickCheckOut = () => {
    if (!todayAttendance?.id) return;
    // Technicians must complete the mandatory shift sign-off before punching
    // out — the sign-off screen performs the check-out itself.
    router.push({
      pathname: "/shift-signoff",
      params: {
        attendanceId: todayAttendance.id,
        siteCode: todayAttendance.site_code || "",
        checkInTime: todayAttendance.check_in_time || "",
      },
    });
  };

  const confirmSignOut = () =>
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);

  // ── Derived view data ─────────────────────────────────────────────────
  const punchedIn = !!todayAttendance && !todayAttendance.check_out_time;
  const shiftComplete = !!todayAttendance?.check_out_time;

  /** Ticks with `currentTime` while on shift; frozen at check-out. */
  const shiftMinutes = useMemo(() => {
    const inIso = todayAttendance?.check_in_time;
    if (!inIso) return null;
    const start = new Date(inIso).getTime();
    if (Number.isNaN(start)) return null;
    const outIso = todayAttendance?.check_out_time;
    const end = outIso ? new Date(outIso).getTime() : currentTime.getTime();
    if (Number.isNaN(end)) return null;
    return Math.max(0, Math.floor((end - start) / 60000));
  }, [todayAttendance, currentTime]);

  const displayName = user?.full_name || user?.name || "JouleOps user";
  const firstName = displayName.trim().split(/\s+/)[0] || displayName;
  const siteName = activeSite?.name || summary?.site.name || activeSiteCode || "No site assigned";
  const canSwitchSite = !isLocked && sites.length > 1;

  const periodLabel =
    period === "today" ? "Today"
      : period === "week" ? "This week"
        : period === "month" ? "This month"
          : "Custom";
  const periodMeta =
    period === "month" ? monthLabel(todayIso.slice(0, 7)) : rangeLabel(range.from, range.to);

  // Navigation out of Home is blocked while locked (tab bar hidden).
  const go = (path: string) => (isLocked ? undefined : () => router.push(path as any));

  const s = summary;
  const dash = "—";
  const num = (n: number | undefined) => (s && n !== undefined ? String(n) : dash);

  const logsPct = s ? pctOf(s.logs.completed, s.logs.expected) : 0;
  const pmPct = s ? pctOf(s.pm.completed, s.pm.planned) : 0;
  const pendingPm = s ? Math.max(0, s.pm.planned - s.pm.completed) : 0;
  const pendingLogs = s ? Math.max(0, s.logs.expected - s.logs.completed) : 0;

  // Breach line — both homes.
  const alert = s?.breachAlert ?? null;
  const breaches = s ? s.tickets.slaBreached : 0;
  const breachTag = breaches > 0 ? plural(breaches, "SLA breach", "SLA breaches") : null;
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

  // SLA
  const slaScoreNum = sla?.score ?? null;
  const slaScoreText = slaScoreNum != null ? slaScoreNum.toFixed(2) : dash;
  const slaCol = slaColor(t, slaScoreNum);
  const slaStat = slaStatus(t, slaScoreNum);
  const kpis: SlaKpiView[] = (sla?.kpis ?? []).map((k) => {
    const weak = k.score < 4.0;
    return {
      label: k.label,
      text: k.score.toFixed(2),
      weak,
      pct: Math.round((k.score / 5) * 100),
      color: weak ? t.warn : slaColor(t, k.score),
    };
  });
  const monthIdx = Math.max(0, monthKeys.indexOf(slaMonth));

  // Efficiency
  const effItem = (label: string, r: EfficiencyReading | undefined, target: number | null): EffItem => {
    const v = r?.value ?? null;
    const color = v == null ? t.muted : target == null ? t.ok : v <= target ? t.ok : t.warn;
    const trend =
      !isOperator && v != null && r?.previous != null && r.previous !== v
        ? v < r.previous ? ("down" as const) : ("up" as const)
        : null;
    return { label, value: v != null ? v.toFixed(2) : dash, color, trend };
  };
  const effItems = [
    effItem("High side", s?.efficiency.highSide, SEC_TARGET),
    effItem("Low side", s?.efficiency.lowSide, null),
  ];
  const asOf = s?.efficiency.highSide.asOf || s?.efficiency.lowSide.asOf;
  const effNote = asOf ? `Latest reading ${dayMonth(asOf)} · none in period yet.` : null;

  // Team on site (open sessions today, earliest punch first).
  const team: TeamRow[] = useMemo(() => {
    const rows = (teamRowsRaw ?? []).filter((r) => r.check_in_time && !r.check_out_time);
    return rows
      .slice()
      .sort((a, b) => String(a.check_in_time).localeCompare(String(b.check_in_time)))
      .map((r) => {
        const start = new Date(String(r.check_in_time)).getTime();
        const mins = Number.isNaN(start) ? 0 : Math.max(0, Math.floor((currentTime.getTime() - start) / 60000));
        const inAt = clock(r.check_in_time);
        const code = r.users?.employee_code;
        return {
          key: r.id,
          name: r.users?.name || code || "Technician",
          sub: [code, `in ${inAt}`].filter(Boolean).join(" · "),
          inAt,
          dur: `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}`,
          pct: Math.min(100, Math.round((mins / SHIFT_MINUTES) * 100)),
        };
      });
  }, [teamRowsRaw, currentTime]);
  const teamShown = teamOpen ? team : team.slice(0, TEAM_LIMIT);

  // ── Sheets ────────────────────────────────────────────────────────────
  const closeSheet = () => {
    setSheet(null);
    setPickerFor(null);
  };
  const thisWeek = periodRange("week", todayIso, customRange);
  const periodOptions = [
    { key: "today", label: "Today", meta: format(isoToDate(todayIso), "dd MMM yyyy") },
    { key: "week", label: "This week", meta: rangeLabel(thisWeek.from, thisWeek.to) },
    { key: "month", label: "This month", meta: monthLabel(todayIso.slice(0, 7)) },
    { key: "custom", label: "Custom range", meta: period === "custom" ? rangeLabel(range.from, range.to) : "Pick dates" },
  ] as const;

  const pickPeriod = (key: PeriodKey) => {
    if (key === "custom") {
      setDraftRange(period === "custom" ? customRange : { from: range.from, to: range.to });
      setSheet("custom");
      return;
    }
    setPeriod(key);
    closeSheet();
  };

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

  const header = (
    <HomeHeader
      greeting={`${greetingFor(currentTime)}, ${firstName}`}
      siteName={siteName}
      onSitePress={canSwitchSite ? () => setSheet("site") : undefined}
      bellIcon={isLocked ? FileText : undefined}
      bellLabel={isLocked ? "Reports" : "Notifications"}
      bellDot={!isLocked && unread > 0}
      onBell={() => (isLocked ? setReportPickerOpen(true) : router.push("/notifications"))}
      userName={displayName}
      avatarLabel={isLocked ? "Sign out" : "Profile"}
      onAvatar={() => (isLocked ? confirmSignOut() : router.push("/(tabs)/profile"))}
    />
  );

  const dataNote = summaryFromCache ? (
    <Text style={styles.note}>Offline · showing the last numbers synced for this period.</Text>
  ) : !s && !summaryLoading && activeSiteCode ? (
    <Text style={styles.note}>Couldn&apos;t load site metrics. Pull down to retry.</Text>
  ) : null;

  // ── Technician view ───────────────────────────────────────────────────
  const techHero = (() => {
    const slaTag =
      slaScoreNum != null ? `SLA ${slaScoreText} · ${monthLabel(slaMonth, true)}` : null;
    if (punchedIn) {
      return {
        label: `On shift · since ${clock(todayAttendance?.check_in_time)}`,
        big: shiftMinutes != null ? durationLabel(shiftMinutes) : dash,
        sub: `In ${clock(todayAttendance?.check_in_time)} · ${format(currentTime, "EEE, dd MMM yyyy")}`,
        slaTag,
        cta: { label: "End Day", icon: "out" as const, onPress: handleQuickCheckOut },
      };
    }
    if (shiftComplete) {
      return {
        label: "Day ended",
        big: shiftMinutes != null ? durationLabel(shiftMinutes) : dash,
        sub: `${clock(todayAttendance?.check_in_time)}–${clock(todayAttendance?.check_out_time)} · ${format(currentTime, "EEE, dd MMM yyyy")}`,
        slaTag,
        cta: { label: "Attendance", icon: "done" as const, onPress: navigateToAttendance },
      };
    }
    return {
      label: "Not punched in",
      big: dash,
      sub: format(currentTime, "EEE, dd MMM yyyy"),
      slaTag,
      cta: {
        label: "Start Day",
        icon: "in" as const,
        onPress: handleQuickCheckIn,
        busy: validatingLocation,
      },
    };
  })();

  const techTiles: TechTile[] = [
    {
      label: "Open tkts",
      value: num(s?.tickets.open),
      color: s && s.tickets.open > 0 ? t.warn : t.ink,
      onPress: go("/(tabs)/tickets"),
    },
    {
      label: "Logs",
      value: s ? `${s.logs.completed}/${s.logs.expected}` : dash,
      color: s && s.logs.expected > 0 ? pctColor(t, logsPct) : t.ink,
      onPress: go("/(tabs)/site-logs"),
    },
    {
      label: "PM due",
      value: s ? String(pendingPm) : dash,
      color: s && s.pm.planned > 0 && pendingPm > 0 ? pctColor(t, pmPct) : t.ink,
      onPress: go("/(tabs)/preventive-maintenance"),
    },
    {
      label: "Incidents",
      value: num(s?.incidents.raised),
      color: t.ink,
      onPress: go("/(tabs)/incidents"),
    },
  ];

  const techBars = [
    { label: "Site logs", done: s?.logs.completed ?? 0, total: s?.logs.expected ?? 0 },
    { label: "PM tasks", done: s?.pm.completed ?? 0, total: s?.pm.planned ?? 0 },
  ].map((b) => {
    const pct = pctOf(b.done, b.total);
    return { ...b, pct, color: pctColor(t, pct) };
  });

  // ── Manager view ──────────────────────────────────────────────────────
  const heroStats = [
    { label: "Incidents", value: num(s?.incidents.raised) },
    { label: "Pend. PM", value: s ? String(pendingPm) : dash },
    { label: "Pend. logs", value: s ? String(pendingLogs) : dash },
  ];

  const plannedBars: PlannedBar[] = [
    { label: "Preventive maint.", icon: "pm" as const, done: s?.pm.completed ?? 0, total: s?.pm.planned ?? 0 },
    { label: "Tickets resolved", icon: "tickets" as const, done: s?.tickets.resolved ?? 0, total: s?.tickets.raised ?? 0 },
  ].map((b) => {
    const pct = pctOf(b.done, b.total);
    return { ...b, pct, color: pctColor(t, pct) };
  });

  return (
    <JoPage>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} />
        }
      >
        {header}

        <DateButton
          label={periodLabel}
          meta={periodMeta}
          onPress={isLocked ? undefined : () => setSheet("period")}
          style={{ marginTop: 14, marginLeft: 4 }}
        />

        {isOperator ? (
          <>
            <ShiftHero
              label={techHero.label}
              big={techHero.big}
              sub={techHero.sub}
              slaTag={techHero.slaTag}
              slaTagColor={slaCol}
              onSla={isLocked ? undefined : () => setSheet("month")}
              cta={techHero.cta}
            />
            {dataNote}
            {alertView ? (
              <BreachBanner
                title={alertView.title}
                subtitle={alertView.subtitle}
                onPress={go("/(tabs)/tickets")}
              />
            ) : null}
            <TechTiles tiles={techTiles} />
            <ProgressCard meta={periodLabel} bars={techBars} />
          </>
        ) : (
          <>
            <OpsHero
              openTickets={num(s?.tickets.open)}
              breachLabel={breachTag}
              stats={heroStats}
              onPress={go("/(tabs)/tickets")}
            />
            {dataNote}
            <TeamCard
              count={teamRowsRaw ? team.length : null}
              rows={teamShown}
              hasMore={team.length > TEAM_LIMIT}
              expanded={teamOpen}
              onToggle={() => setTeamOpen((o) => !o)}
              loading={teamLoading}
              note={!teamLoading && !teamRowsRaw ? "Couldn't load today's attendance." : null}
            />
            <SlaScoreCard
              monthLabel={monthLabel(slaMonth)}
              canPrev={monthIdx < monthKeys.length - 1}
              canNext={monthIdx > 0}
              onPrev={() => setSlaMonth(monthKeys[Math.min(monthKeys.length - 1, monthIdx + 1)]!)}
              onNext={() => setSlaMonth(monthKeys[Math.max(0, monthIdx - 1)]!)}
              onMonth={() => setSheet("month")}
              onTitle={() => router.push("/(tabs)/sla")}
              score={slaScoreText}
              color={slaCol}
              status={slaStat.label}
              statusBg={slaStat.bg}
              pctText={sla?.pct != null ? `${sla.pct.toFixed(1)}%` : dash}
              emptyNote={
                sla?.pct != null ? null : slaLoading ? "Loading…" : "No SLA report for this month"
              }
              ringPct={slaScoreNum != null ? slaScoreNum / 5 : 0}
              kpis={kpis}
              loading={slaLoading && !sla}
            />
            <SectionHead title="Planned vs completed" meta={periodLabel} />
            <PlannedCards
              bars={plannedBars}
              onPress={(b) =>
                router.push(b.icon === "pm" ? "/(tabs)/preventive-maintenance" : "/(tabs)/tickets")
              }
            />
          </>
        )}

        <EfficiencyCard items={effItems} note={effNote} />
      </ScrollView>

      <JoSheet
        visible={sheet === "period"}
        onClose={closeSheet}
        title="Period"
        subtitle="Scopes operational metrics. SLA keeps its own month."
      >
        <View style={styles.options}>
          {periodOptions.map((o) => (
            <SheetOption
              key={o.key}
              label={o.label}
              meta={o.meta}
              selected={period === o.key}
              onPress={() => pickPeriod(o.key)}
            />
          ))}
        </View>
      </JoSheet>

      <JoSheet visible={sheet === "custom"} onClose={closeSheet} title="Custom range">
        <View style={styles.rangeRow}>
          {(["from", "to"] as const).map((which) => (
            <TouchableOpacity
              key={which}
              style={[styles.rangeField, pickerFor === which && { borderColor: t.accent }]}
              activeOpacity={0.8}
              onPress={() => setPickerFor(pickerFor === which ? null : which)}
              accessibilityRole="button"
              accessibilityLabel={`${which === "from" ? "From" : "To"} date`}
            >
              <Text style={[f.t(11), { color: t.muted }]}>{which === "from" ? "From" : "To"}</Text>
              <Text style={[f.t(14.5, 600), { color: t.ink, marginTop: 4 }]}>
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
        <PrimaryButton label="Apply range" onPress={applyRange} style={{ marginTop: 14 }} />
      </JoSheet>

      <JoSheet
        visible={sheet === "month"}
        onClose={closeSheet}
        title="SLA month"
        subtitle="Contract score is monthly, independent of the period filter."
      >
        <View style={styles.options}>
          {monthKeys.map((k) => {
            const h = slaHistory.find((m) => m.month === k);
            const score = h?.score ?? null;
            return (
              <SheetOption
                key={k}
                label={monthLabel(k)}
                meta={score != null ? score.toFixed(2) : dash}
                metaStyle={[f.d(17, 0, 1.1), { color: slaColor(t, score) }]}
                selected={slaMonth === k}
                onPress={() => {
                  setSlaMonth(k);
                  closeSheet();
                }}
              />
            );
          })}
        </View>
      </JoSheet>

      <JoSheet visible={sheet === "site"} onClose={closeSheet} title="Site" subtitle="Every module follows the site you pick here.">
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={styles.options}>
          {sites.map((site) => (
            <SheetOption
              key={site.site_code}
              label={site.name || site.site_code}
              meta={site.site_code}
              selected={site.site_code === activeSiteCode}
              onPress={() => {
                setSelectedSiteCode(site.site_code);
                setTeamOpen(false);
                closeSheet();
              }}
            />
          ))}
        </ScrollView>
      </JoSheet>

      <ReportPickerModal
        visible={reportPickerOpen}
        onClose={() => setReportPickerOpen(false)}
      />
    </JoPage>
  );
}

const useStyles = makeJoStyles((t) => ({
  body: { paddingHorizontal: 16, paddingBottom: 24 },
  note: { ...f.t(11), color: t.muted, marginTop: 10, paddingHorizontal: 4 },
  options: { gap: 6, marginTop: 16 },
  rangeRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  rangeField: {
    flex: 1,
    minWidth: 0,
    borderRadius: 20,
    backgroundColor: t.sheetField,
    borderWidth: 1.5,
    borderColor: "transparent",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
}));
