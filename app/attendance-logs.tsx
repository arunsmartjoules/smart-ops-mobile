/**
 * Attendance log for one site over the Home period — opened from the manager
 * Home's "View attendance" link when the period isn't just today. Read-only:
 * every punch in the range, newest day first, with a short summary on top.
 *
 * Params: site (site_code), siteName, from / to (YYYY-MM-DD), label (the
 * Home period name, e.g. "This week").
 *
 * Rows come from `GET /api/attendance` (site-scoped server-side). Up to
 * MAX_ROWS are loaded in pages so the summary is exact for any normal range;
 * a longer custom range says how many were left out. Gated by the
 * "attendance" view permission via the route guard (permForPath).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, SectionList, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/contexts/AuthContext";
import HomeDashboardService, { type TeamAttendanceRow } from "@/services/HomeDashboardService";
import { ChevronLeft, Users } from "@/components/jo/bxIcons";
import {
  Avatar,
  Card,
  EmptyState,
  IconButton,
  JoPage,
  SearchField,
  Shimmer,
  StatusPill,
  f,
  makeJoStyles,
  useJoTheme,
} from "@/components/jo/ui";
import { getISTDateString } from "@/services/AttendanceService";

const PAGE_SIZE = 200;
const MAX_ROWS = 1000;

/** "YYYY-MM-DD" → local-noon Date (clear of midnight edges) for display only. */
function dayDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
}

function clock(iso?: string | null) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "--:--" : format(d, "HH:mm");
}

function minutesBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 60000) : null;
}

const hm = (mins: number) => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;

function rangeLabel(from: string, to: string) {
  if (!from || !to) return "";
  if (from === to) return format(dayDate(from), "dd MMM yyyy");
  return `${format(dayDate(from), "dd MMM")} – ${format(dayDate(to), "dd MMM yyyy")}`;
}

interface Row {
  key: string;
  name: string;
  code: string | null;
  inAt: string;
  outAt: string | null;
  /** Shift length; null while still on shift or when the punch-out is missing. */
  mins: number | null;
  state: "done" | "on" | "missed";
}

interface LoadResult {
  rows: TeamAttendanceRow[];
  total: number;
  fromCache: boolean;
  error: string | null;
}

/** Page through the range (up to MAX_ROWS); only a first-page failure is an error. */
async function loadAll(userId: string, site: string, from: string, to: string): Promise<LoadResult> {
  const rows: TeamAttendanceRow[] = [];
  let total = 0;
  let fromCache = false;
  for (let page = 1; rows.length < MAX_ROWS; page++) {
    const res = await HomeDashboardService.getSiteAttendance(userId, site, from, to, page, PAGE_SIZE);
    if (!res.success) {
      return page === 1 ? { rows, total, fromCache, error: res.error } : { rows, total, fromCache, error: null };
    }
    rows.push(...res.rows);
    total = res.total;
    fromCache = !!res.isFromCache;
    if (fromCache || res.rows.length < PAGE_SIZE || rows.length >= res.total) break;
  }
  return { rows, total, fromCache, error: null };
}

export default function AttendanceLogsScreen() {
  const t = useJoTheme();
  const s = useStyles();
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || "";
  const params = useLocalSearchParams<{ site?: string; siteName?: string; from?: string; to?: string; label?: string }>();
  const site = params.site ?? "";
  const from = params.from ?? "";
  const to = params.to ?? "";
  const today = getISTDateString(new Date());

  const [rows, setRows] = useState<TeamAttendanceRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const ready = !!(userId && site && from && to);

  /** Apply a finished load; a failed refresh keeps the rows already shown. */
  const apply = useCallback((r: LoadResult) => {
    setError(r.error);
    setRows((prev) => (r.rows.length || !prev ? r.rows : prev));
    setTotal(r.total);
    setFromCache(r.fromCache);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void loadAll(userId, site, from, to).then((r) => {
      if (!cancelled) apply(r);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, userId, site, from, to, apply]);

  const reload = async () => {
    if (ready) apply(await loadAll(userId, site, from, to));
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/dashboard");
  };

  // Group by day (newest first), punches within a day by check-in time.
  const { sections, stats } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const mapped: (Row & { date: string; userId: string })[] = (rows ?? []).map((r) => {
      const out = r.check_out_time;
      const mins = minutesBetween(r.check_in_time, out);
      return {
        key: r.id,
        date: r.date,
        userId: r.user_id,
        name: r.users?.name || r.users?.employee_code || "Technician",
        code: r.users?.employee_code ?? null,
        inAt: clock(r.check_in_time),
        outAt: out ? clock(out) : null,
        mins,
        state: out ? "done" : r.date === today ? "on" : "missed",
      };
    });
    const filtered = q
      ? mapped.filter((r) => r.name.toLowerCase().includes(q) || (r.code ?? "").toLowerCase().includes(q))
      : mapped;
    const byDay = new Map<string, typeof filtered>();
    for (const r of filtered) {
      const list = byDay.get(r.date) ?? [];
      list.push(r);
      byDay.set(r.date, list);
    }
    const sections = Array.from(byDay.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, data]) => ({
        date,
        people: new Set(data.map((d) => d.userId)).size,
        data: data.slice().sort((a, b) => a.inAt.localeCompare(b.inAt)),
      }));
    const done = mapped.filter((r) => r.mins != null);
    return {
      sections,
      stats: {
        entries: mapped.length,
        people: new Set(mapped.map((r) => r.userId)).size,
        avg: done.length ? Math.round(done.reduce((n, r) => n + (r.mins ?? 0), 0) / done.length) : null,
        missed: mapped.filter((r) => r.state === "missed").length,
      },
    };
  }, [rows, query, today]);

  // Pinned above the list; the stats, notes and search scroll with it.
  const titleBlock = (
    <View style={s.top}>
      <View style={s.headRow}>
        <IconButton icon={ChevronLeft} label="Back" onPress={back} iconSize={22} />
      </View>
      <Text style={[f.t(13), { color: t.muted, paddingHorizontal: 4, marginTop: 14 }]} numberOfLines={1}>
        {params.siteName || site} · {params.label || "Period"}
      </Text>
      <Text style={[f.d(28, -0.025), { color: t.ink, paddingHorizontal: 4, marginTop: 4 }]}>Attendance</Text>
      <Text style={[f.t(12.5), { color: t.muted, paddingHorizontal: 4, marginTop: 4 }]}>{rangeLabel(from, to)}</Text>
    </View>
  );

  const header = (
    <View>
      {rows ? (
        <View style={s.stats}>
          <Stat label="Entries" value={String(stats.entries)} />
          <Stat label="People" value={String(stats.people)} />
          <Stat label="Avg shift" value={stats.avg != null ? hm(stats.avg) : "—"} />
          <Stat label="No punch-out" value={String(stats.missed)} warn={stats.missed > 0} />
        </View>
      ) : null}

      {rows && total > rows.length ? (
        <Text style={[f.t(11.5), { color: t.muted, marginTop: 10, paddingHorizontal: 4 }]}>
          Showing the latest {rows.length.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")} entries — pick a shorter range for
          the rest.
        </Text>
      ) : null}
      {fromCache ? (
        <Text style={[f.t(11.5), { color: t.muted, marginTop: 10, paddingHorizontal: 4 }]}>
          Offline · showing the last list synced for this period.
        </Text>
      ) : null}

      {rows && rows.length > 0 ? (
        <SearchField value={query} onChangeText={setQuery} placeholder="Search name or employee code" style={{ marginTop: 14 }} />
      ) : null}
    </View>
  );

  return (
    <JoPage>
      {titleBlock}

      <View style={{ flex: 1 }}>
      <LinearGradient pointerEvents="none" colors={[t.page, `${t.page}00`]} style={s.fade} />
      <SectionList
        sections={rows ? sections : []}
        keyExtractor={(r) => r.key}
        contentContainerStyle={s.body}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} />}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => (
          <View style={s.dayHead}>
            <Text style={[f.t(13, 600), { color: t.ink }]}>{format(dayDate(section.date), "EEE, dd MMM")}</Text>
            <Text style={[f.t(12), { color: t.muted }]}>
              {section.people} {section.people === 1 ? "person" : "people"}
            </Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <View
            style={[
              s.row,
              index === 0 && s.rowFirst,
              index === section.data.length - 1 && s.rowLast,
              index > 0 && { borderTopWidth: 1, borderTopColor: t.line },
            ]}
          >
            <Avatar name={item.name} size={38} textSize={12.5} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[f.t(14, 600), { color: t.ink }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[f.t(11.5), { color: t.muted, marginTop: 3 }]} numberOfLines={1}>
                {[item.code, `${item.inAt} – ${item.outAt ?? "…"}`].filter(Boolean).join(" · ")}
              </Text>
            </View>
            {item.state === "done" && item.mins != null ? (
              <Text style={[f.m(12.5, 600), { color: t.ink }]}>{hm(item.mins)}</Text>
            ) : item.state === "on" ? (
              <StatusPill label="On shift" tone="ok" dot />
            ) : (
              <StatusPill label="No punch-out" tone="warn" />
            )}
          </View>
        )}
        ListEmptyComponent={
          !rows && !error ? (
            <View style={{ gap: 10, marginTop: 18 }}>
              <Shimmer height={64} radius={20} />
              <Shimmer height={180} radius={22} />
              <Shimmer height={180} radius={22} />
            </View>
          ) : error && !rows?.length ? (
            <View style={{ marginTop: 18 }}>
              <EmptyState
                icon={Users}
                title="Couldn't load attendance"
                sub="Check your connection and try again."
                action={{ label: "Try again", onPress: () => void reload() }}
              />
            </View>
          ) : (
            <View style={{ marginTop: 18 }}>
              <EmptyState
                icon={Users}
                title={query ? "No one matches" : "No attendance in this period"}
                sub={query ? "Try another name or code." : `Nobody punched in at this site in ${rangeLabel(from, to)}.`}
              />
            </View>
          )
        }
      />
      </View>
    </JoPage>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  const t = useJoTheme();
  return (
    <Card radius={18} style={{ flex: 1, minWidth: 0, paddingVertical: 11, paddingHorizontal: 10 }}>
      <Text style={[f.d(18, -0.02, 1.1), { color: warn ? t.warn : t.ink }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[f.t(10.5), { color: t.muted, marginTop: 4 }]} numberOfLines={1}>
        {label}
      </Text>
    </Card>
  );
}

const useStyles = makeJoStyles((t) => ({
  top: { paddingHorizontal: 16 },
  body: { paddingHorizontal: 16, paddingBottom: 40 },
  fade: { position: "absolute", top: 0, left: 0, right: 0, height: 20, zIndex: 2 },
  headRow: { flexDirection: "row", alignItems: "center", paddingTop: 12 },
  stats: { flexDirection: "row", gap: 6, marginTop: 16 },
  dayHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: t.card,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: t.cardBorder,
  },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
}));
